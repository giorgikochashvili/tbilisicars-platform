/**
 * Monitoring service — joins bookings + handovers + payments + parking for the
 * Operations Monitoring screen. Read-mostly, with append-only internal notes.
 */
import {
  db,
  bookingTable,
  bookingHandoverTable,
  monitoringNoteTable,
  adminsTable,
  vehicleTable,
  vehicleModelTable,
  brandTable,
  bookingPaymentTable,
  parkingAssignmentTable,
  userTable,
} from "@workspace/db";
import { aliasedTable } from "drizzle-orm";
import { and, eq, gte, lte, desc, asc, inArray, isNull, sql } from "drizzle-orm";

export type SatisfactionMark = "HAPPY" | "NEUTRAL" | "SAD" | "PROBLEM";

export interface MonitoringFilters {
  pickupFrom?: string | null;
  pickupTo?: string | null;
  satisfaction?: SatisfactionMark | null;
  status?: string | null;
  performerId?: number | null;
}

export async function listMonitoringRows(filters: MonitoringFilters) {
  const pickupAlias = aliasedTable(bookingHandoverTable, "pickup_h");
  const dropoffAlias = aliasedTable(bookingHandoverTable, "dropoff_h");
  const pickupAdminAlias = aliasedTable(adminsTable, "pickup_admin");
  const dropoffAdminAlias = aliasedTable(adminsTable, "dropoff_admin");

  const conditions = [
    isNull(bookingTable.deletedAt),
    eq(pickupAlias.handoverType, "PICKUP"),
  ];
  if (filters.pickupFrom) {
    conditions.push(gte(pickupAlias.actionAt, new Date(filters.pickupFrom)));
  }
  if (filters.pickupTo) {
    conditions.push(lte(pickupAlias.actionAt, new Date(filters.pickupTo)));
  }
  if (filters.satisfaction) {
    conditions.push(eq(pickupAlias.pickupSatisfaction, filters.satisfaction));
  }
  if (filters.status) {
    conditions.push(
      eq(
        bookingTable.status,
        filters.status as
          | "PENDING"
          | "CONFIRMED"
          | "DELIVERED"
          | "RETURNED"
          | "CANCELED"
          | "NO_SHOW",
      ),
    );
  }
  if (filters.performerId) {
    conditions.push(eq(pickupAlias.performedByAdminId, filters.performerId));
  }

  // Explicit row type — works around a drizzle-orm@0.45.1 inference-depth
  // quirk where chaining 8+ leftJoins makes the resolved row type collapse to
  // `never[]`. Runtime select shape below must stay in sync with this type.
  type MonitoringRow = {
    bookingId: number;
    reservationCode: string | null;
    status: typeof bookingTable.status._.data;
    paymentStatus: typeof bookingTable.paymentStatus._.data;
    currency: string;
    totalAmount: string;
    contactFullName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    nationality: string | null;
    pickupDatetime: Date;
    dropoffDatetime: Date;
    vehiclePlate: string | null;
    vehicleModel: string | null;
    vehicleBrand: string | null;
    pickupActionAt: Date | null;
    pickupNotes: string | null;
    pickupMileage: number | null;
    pickupFuel: number | null;
    pickupSatisfaction: SatisfactionMark | null;
    pickupPerformerId: number | null;
    pickupPerformerName: string | null;
    dropoffActionAt: Date | null;
    dropoffNotes: string | null;
    dropoffMileage: number | null;
    dropoffFuel: number | null;
    dropoffSatisfaction: SatisfactionMark | null;
    dropoffPerformerId: number | null;
    dropoffPerformerName: string | null;
    parkingZone: string | null;
  };

  const rows: MonitoringRow[] = await db
    .select({
      bookingId: bookingTable.id,
      reservationCode: bookingTable.reservationCode,
      status: bookingTable.status,
      paymentStatus: bookingTable.paymentStatus,
      currency: bookingTable.currency,
      totalAmount: bookingTable.totalAmount,
      contactFullName: bookingTable.contactFullName,
      contactPhone: bookingTable.contactPhone,
      contactEmail: bookingTable.contactEmail,
      nationality: userTable.country,
      pickupDatetime: bookingTable.pickupDatetime,
      dropoffDatetime: bookingTable.dropoffDatetime,
      vehiclePlate: vehicleTable.licensePlate,
      vehicleModel: vehicleModelTable.name,
      vehicleBrand: brandTable.name,
      pickupActionAt: pickupAlias.actionAt,
      pickupNotes: pickupAlias.notes,
      pickupMileage: pickupAlias.mileage,
      pickupFuel: pickupAlias.fuelLevel,
      pickupSatisfaction: pickupAlias.pickupSatisfaction,
      pickupPerformerId: pickupAlias.performedByAdminId,
      pickupPerformerName: pickupAdminAlias.fullName,
      dropoffActionAt: dropoffAlias.actionAt,
      dropoffNotes: dropoffAlias.notes,
      dropoffMileage: dropoffAlias.mileage,
      dropoffFuel: dropoffAlias.fuelLevel,
      dropoffSatisfaction: dropoffAlias.pickupSatisfaction,
      dropoffPerformerId: dropoffAlias.performedByAdminId,
      dropoffPerformerName: dropoffAdminAlias.fullName,
      parkingZone: parkingAssignmentTable.zone,
    })
    .from(bookingTable)
    .innerJoin(pickupAlias, eq(pickupAlias.bookingId, bookingTable.id))
    .leftJoin(
      dropoffAlias,
      and(
        eq(dropoffAlias.bookingId, bookingTable.id),
        eq(dropoffAlias.handoverType, "DROPOFF"),
      ),
    )
    .leftJoin(
      pickupAdminAlias,
      eq(pickupAdminAlias.id, pickupAlias.performedByAdminId),
    )
    .leftJoin(
      dropoffAdminAlias,
      eq(dropoffAdminAlias.id, dropoffAlias.performedByAdminId),
    )
    .leftJoin(userTable, eq(userTable.id, bookingTable.userId))
    .leftJoin(vehicleTable, eq(vehicleTable.id, bookingTable.vehicleId))
    .leftJoin(
      vehicleModelTable,
      eq(vehicleModelTable.id, bookingTable.vehicleModelId),
    )
    .leftJoin(brandTable, eq(brandTable.id, vehicleModelTable.brandId))
    .leftJoin(
      parkingAssignmentTable,
      and(
        eq(parkingAssignmentTable.vehicleId, bookingTable.vehicleId),
        isNull(parkingAssignmentTable.removedAt),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(pickupAlias.actionAt))
    .limit(500);

  if (rows.length === 0) return [];

  const bookingIds = rows.map((r) => r.bookingId);
  // Aggregate paid amounts grouped by currency per booking.
  const paymentRows = await db
    .select({
      bookingId: bookingPaymentTable.bookingId,
      currency: bookingPaymentTable.currency,
      paid: sql<string>`SUM(${bookingPaymentTable.amount})`.as("paid"),
    })
    .from(bookingPaymentTable)
    .where(inArray(bookingPaymentTable.bookingId, bookingIds))
    .groupBy(bookingPaymentTable.bookingId, bookingPaymentTable.currency);

  const paidByBooking = new Map<number, Record<string, number>>();
  for (const p of paymentRows) {
    const map = paidByBooking.get(p.bookingId) ?? {};
    map[p.currency] = parseFloat(p.paid ?? "0");
    paidByBooking.set(p.bookingId, map);
  }

  return rows.map((r) => ({
    ...r,
    paidByCurrency: paidByBooking.get(r.bookingId) ?? {},
  }));
}

// ─── Internal notes ──────────────────────────────────────────────────────────

export async function listMonitoringNotes(bookingId: number) {
  return db
    .select({
      id: monitoringNoteTable.id,
      bookingId: monitoringNoteTable.bookingId,
      authorAdminId: monitoringNoteTable.authorAdminId,
      authorName: adminsTable.fullName,
      body: monitoringNoteTable.body,
      createdAt: monitoringNoteTable.createdAt,
    })
    .from(monitoringNoteTable)
    .leftJoin(
      adminsTable,
      eq(adminsTable.id, monitoringNoteTable.authorAdminId),
    )
    .where(eq(monitoringNoteTable.bookingId, bookingId))
    .orderBy(asc(monitoringNoteTable.createdAt));
}

export async function createMonitoringNote(params: {
  bookingId: number;
  authorAdminId: number | null;
  body: string;
}) {
  const [row] = await db
    .insert(monitoringNoteTable)
    .values({
      bookingId: params.bookingId,
      authorAdminId: params.authorAdminId,
      body: params.body,
    })
    .returning();
  return row;
}

// ─── Performer list (for filter dropdown) ────────────────────────────────────

export async function listPickupPerformers() {
  return db
    .selectDistinctOn([adminsTable.id], {
      id: adminsTable.id,
      fullName: adminsTable.fullName,
    })
    .from(bookingHandoverTable)
    .innerJoin(
      adminsTable,
      eq(adminsTable.id, bookingHandoverTable.performedByAdminId),
    )
    .where(eq(bookingHandoverTable.handoverType, "PICKUP"))
    .orderBy(asc(adminsTable.id));
}
