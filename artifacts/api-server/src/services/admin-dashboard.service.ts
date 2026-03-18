import {
  db,
  bookingTable,
  userTable,
  vehicleTable,
  vehicleModelTable,
  locationTable,
  partnerTable,
} from "@workspace/db";
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sum,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// ─── Location aliases ──────────────────────────────────────────────────────────

const pickupLoc = alias(locationTable, "pickup_loc");
const dropoffLoc = alias(locationTable, "dropoff_loc");

// ─── Shared select for booking row shape (used in today activity) ─────────────

const bookingRowSelect = {
  id: bookingTable.id,
  status: bookingTable.status,
  paymentStatus: bookingTable.paymentStatus,
  contactFullName: bookingTable.contactFullName,
  contactEmail: bookingTable.contactEmail,
  contactPhone: bookingTable.contactPhone,
  pickupDatetime: bookingTable.pickupDatetime,
  dropoffDatetime: bookingTable.dropoffDatetime,
  totalAmount: bookingTable.totalAmount,
  currency: bookingTable.currency,
  source: bookingTable.source,
  broker: bookingTable.broker,
  createdAt: bookingTable.createdAt,
  customerId: userTable.id,
  customerFullName: userTable.fullName,
  customerEmail: userTable.email,
  vehicleId: vehicleTable.id,
  vehicleLicensePlate: vehicleTable.licensePlate,
  vehicleModelName: vehicleModelTable.name,
  pickupLocationId: pickupLoc.id,
  pickupLocationName: pickupLoc.name,
  dropoffLocationId: dropoffLoc.id,
  dropoffLocationName: dropoffLoc.name,
  partnerId: partnerTable.id,
  partnerName: partnerTable.name,
} as const;

// ─── Map flat join result to nested shape ─────────────────────────────────────

type BookingRowFlat = {
  id: number;
  status: "PENDING" | "CONFIRMED" | "DELIVERED" | "RETURNED" | "CANCELED" | "NO_SHOW";
  paymentStatus: "UNPAID" | "HALF" | "PAID" | "REFUNDED";
  contactFullName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  pickupDatetime: Date;
  dropoffDatetime: Date;
  totalAmount: string | null;
  currency: string | null;
  source: string | null;
  broker: string | null;
  createdAt: Date;
  customerId: number;
  customerFullName: string | null;
  customerEmail: string | null;
  vehicleId: number | null;
  vehicleLicensePlate: string | null;
  vehicleModelName: string | null;
  pickupLocationId: number;
  pickupLocationName: string;
  dropoffLocationId: number;
  dropoffLocationName: string;
  partnerId: number | null;
  partnerName: string | null;
};

function mapToBookingRow(row: BookingRowFlat) {
  return {
    id: row.id,
    status: row.status,
    paymentStatus: row.paymentStatus,
    contactFullName: row.contactFullName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    pickupDatetime: row.pickupDatetime,
    dropoffDatetime: row.dropoffDatetime,
    totalAmount: row.totalAmount,
    currency: row.currency,
    source: row.source,
    broker: row.broker,
    createdAt: row.createdAt,
    customer: {
      id: row.customerId,
      fullName: row.customerFullName,
      email: row.customerEmail,
    },
    vehicle: row.vehicleId
      ? {
          id: row.vehicleId,
          licensePlate: row.vehicleLicensePlate,
          modelName: row.vehicleModelName,
        }
      : null,
    pickupLocation: { id: row.pickupLocationId, name: row.pickupLocationName },
    dropoffLocation: { id: row.dropoffLocationId, name: row.dropoffLocationName },
    partner: row.partnerId ? { id: row.partnerId, name: row.partnerName! } : null,
  };
}

// ─── Service: dashboard summary ────────────────────────────────────────────────

export async function getDashboardSummary() {
  const notDeleted = isNull(bookingTable.deletedAt);

  const [
    totalRes,
    pendingRes,
    confirmedRes,
    deliveredRes,
    returnedRes,
    canceledRes,
    noShowRes,
    revenueRes,
  ] = await Promise.all([
    db.select({ c: count() }).from(bookingTable).where(notDeleted),
    db
      .select({ c: count() })
      .from(bookingTable)
      .where(and(notDeleted, eq(bookingTable.status, "PENDING"))),
    db
      .select({ c: count() })
      .from(bookingTable)
      .where(and(notDeleted, eq(bookingTable.status, "CONFIRMED"))),
    db
      .select({ c: count() })
      .from(bookingTable)
      .where(and(notDeleted, eq(bookingTable.status, "DELIVERED"))),
    db
      .select({ c: count() })
      .from(bookingTable)
      .where(and(notDeleted, eq(bookingTable.status, "RETURNED"))),
    db
      .select({ c: count() })
      .from(bookingTable)
      .where(and(notDeleted, eq(bookingTable.status, "CANCELED"))),
    db
      .select({ c: count() })
      .from(bookingTable)
      .where(and(notDeleted, eq(bookingTable.status, "NO_SHOW"))),
    db
      .select({ revenue: sum(bookingTable.totalAmount) })
      .from(bookingTable)
      .where(and(notDeleted, eq(bookingTable.status, "RETURNED"))),
  ]);

  return {
    total: totalRes[0]?.c ?? 0,
    pending: pendingRes[0]?.c ?? 0,
    confirmed: confirmedRes[0]?.c ?? 0,
    delivered: deliveredRes[0]?.c ?? 0,
    returned: returnedRes[0]?.c ?? 0,
    canceled: canceledRes[0]?.c ?? 0,
    noShow: noShowRes[0]?.c ?? 0,
    totalRevenue: revenueRes[0]?.revenue ?? "0",
  };
}

// ─── Service: today activity ───────────────────────────────────────────────────

export async function getTodayActivity() {
  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const todayEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );

  const notDeleted = isNull(bookingTable.deletedAt);

  function joinedSelect() {
    return db
      .select(bookingRowSelect)
      .from(bookingTable)
      .innerJoin(userTable, eq(bookingTable.userId, userTable.id))
      .leftJoin(vehicleTable, eq(bookingTable.vehicleId, vehicleTable.id))
      .leftJoin(
        vehicleModelTable,
        eq(vehicleTable.vehicleModelId, vehicleModelTable.id),
      )
      .innerJoin(pickupLoc, eq(bookingTable.pickupLocationId, pickupLoc.id))
      .innerJoin(dropoffLoc, eq(bookingTable.dropoffLocationId, dropoffLoc.id))
      .leftJoin(partnerTable, eq(bookingTable.partnerId, partnerTable.id));
  }

  const [pickupRows, dropoffRows] = await Promise.all([
    joinedSelect()
      .where(
        and(
          notDeleted,
          gte(bookingTable.pickupDatetime, todayStart),
          lt(bookingTable.pickupDatetime, todayEnd),
          inArray(bookingTable.status, ["PENDING", "CONFIRMED", "DELIVERED"]),
        ),
      )
      .orderBy(asc(bookingTable.pickupDatetime)),
    joinedSelect()
      .where(
        and(
          notDeleted,
          gte(bookingTable.dropoffDatetime, todayStart),
          lt(bookingTable.dropoffDatetime, todayEnd),
          eq(bookingTable.status, "DELIVERED"),
        ),
      )
      .orderBy(asc(bookingTable.dropoffDatetime)),
  ]);

  return {
    pickups: pickupRows.map(mapToBookingRow),
    dropoffs: dropoffRows.map(mapToBookingRow),
  };
}

// ─── Service: fleet snapshot ───────────────────────────────────────────────────

export async function getFleetSnapshot() {
  const rows = await db
    .select({ status: vehicleTable.status, c: count() })
    .from(vehicleTable)
    .groupBy(vehicleTable.status);

  const snapshot = {
    available: 0,
    rented: 0,
    maintenance: 0,
    reserved: 0,
    inactive: 0,
  };

  for (const row of rows) {
    switch (row.status) {
      case "AVAILABLE":
        snapshot.available = row.c;
        break;
      case "RENTED":
        snapshot.rented = row.c;
        break;
      case "MAINTENANCE":
        snapshot.maintenance = row.c;
        break;
      case "RESERVED":
        snapshot.reserved = row.c;
        break;
      case "INACTIVE":
        snapshot.inactive = row.c;
        break;
    }
  }

  return snapshot;
}

// ─── Service: fleet calendar ───────────────────────────────────────────────────

export async function getFleetCalendar(startDate: Date, endDate: Date) {
  const vehicles = await db
    .select({
      id: vehicleTable.id,
      licensePlate: vehicleTable.licensePlate,
      status: vehicleTable.status,
      locationId: vehicleTable.locationId,
      modelName: vehicleModelTable.name,
    })
    .from(vehicleTable)
    .leftJoin(vehicleModelTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
    .orderBy(asc(vehicleTable.id));

  const bookings = await db
    .select({
      id: bookingTable.id,
      vehicleId: bookingTable.vehicleId,
      status: bookingTable.status,
      contactFullName: bookingTable.contactFullName,
      pickupDatetime: bookingTable.pickupDatetime,
      dropoffDatetime: bookingTable.dropoffDatetime,
      totalAmount: bookingTable.totalAmount,
      currency: bookingTable.currency,
    })
    .from(bookingTable)
    .where(
      and(
        isNull(bookingTable.deletedAt),
        or(
          and(
            gte(bookingTable.pickupDatetime, startDate),
            lte(bookingTable.pickupDatetime, endDate),
          ),
          and(
            gte(bookingTable.dropoffDatetime, startDate),
            lte(bookingTable.dropoffDatetime, endDate),
          ),
          and(
            lte(bookingTable.pickupDatetime, startDate),
            gte(bookingTable.dropoffDatetime, endDate),
          ),
        ),
      ),
    );

  const bookingsByVehicle = new Map<number, typeof bookings>();
  for (const booking of bookings) {
    if (!booking.vehicleId) continue;
    if (!bookingsByVehicle.has(booking.vehicleId)) {
      bookingsByVehicle.set(booking.vehicleId, []);
    }
    bookingsByVehicle.get(booking.vehicleId)!.push(booking);
  }

  return vehicles.map((v) => ({
    ...v,
    bookings: bookingsByVehicle.get(v.id) ?? [],
  }));
}
