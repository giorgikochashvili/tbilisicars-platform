import {
  db,
  bookingTable,
  userTable,
  vehicleTable,
  vehicleModelTable,
  locationTable,
  partnerTable,
  bookingextraTable,
  extraTable,
  paymentTable,
} from "@workspace/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { NotFoundError } from "../lib/errors.js";

// ─── Alias location table for pickup and dropoff joins ─────────────────────────

const pickupLoc = alias(locationTable, "pickup_loc");
const dropoffLoc = alias(locationTable, "dropoff_loc");

// ─── Shared select fields for booking row (list + today activity) ─────────────

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

// ─── Extended select for detail view (adds all booking scalar fields) ─────────

const bookingDetailSelect = {
  ...bookingRowSelect,
  vehicleGroupId: bookingTable.vehicleGroupId,
  vehicleModelId: bookingTable.vehicleModelId,
  rateId: bookingTable.rateId,
  rateTierId: bookingTable.rateTierId,
  pricePerDay: bookingTable.pricePerDay,
  baseRate: bookingTable.baseRate,
  taxes: bookingTable.taxes,
  fees: bookingTable.fees,
  discount: bookingTable.discount,
  oneWayFee: bookingTable.oneWayFee,
  deliveryFee: bookingTable.deliveryFee,
  deposit: bookingTable.deposit,
  notes: bookingTable.notes,
  documentType: bookingTable.documentType,
  documentNumber: bookingTable.documentNumber,
  pickupPhoto: bookingTable.pickupPhoto,
  returnPhoto: bookingTable.returnPhoto,
  updatedAt: bookingTable.updatedAt,
  deletedAt: bookingTable.deletedAt,
} as const;

// ─── Map flat join result to nested AdminBookingRow shape ──────────────────────

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

// ─── Filters type ─────────────────────────────────────────────────────────────

export interface ListBookingsFilters {
  status?: "PENDING" | "CONFIRMED" | "DELIVERED" | "RETURNED" | "CANCELED" | "NO_SHOW";
  paymentStatus?: "UNPAID" | "HALF" | "PAID" | "REFUNDED";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

// ─── Service: list bookings ────────────────────────────────────────────────────

export async function listAdminBookings(filters: ListBookingsFilters = {}) {
  const { status, paymentStatus, search, dateFrom, dateTo } = filters;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [isNull(bookingTable.deletedAt)];
  if (status) conditions.push(eq(bookingTable.status, status));
  if (paymentStatus) conditions.push(eq(bookingTable.paymentStatus, paymentStatus));
  if (search) {
    conditions.push(
      or(
        ilike(bookingTable.contactFullName, `%${search}%`),
        ilike(bookingTable.contactEmail, `%${search}%`),
        ilike(bookingTable.contactPhone, `%${search}%`),
      )!,
    );
  }
  if (dateFrom) conditions.push(gte(bookingTable.pickupDatetime, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(bookingTable.pickupDatetime, new Date(dateTo)));

  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db
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
      .leftJoin(partnerTable, eq(bookingTable.partnerId, partnerTable.id))
      .where(where)
      .orderBy(desc(bookingTable.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(bookingTable)
      .where(where),
  ]);

  return {
    data: rows.map(mapToBookingRow),
    meta: { page, limit, total: totalRows[0]?.total ?? 0 },
  };
}

// ─── Service: get single booking detail ───────────────────────────────────────

export async function getAdminBooking(id: number) {
  const rows = await db
    .select(bookingDetailSelect)
    .from(bookingTable)
    .innerJoin(userTable, eq(bookingTable.userId, userTable.id))
    .leftJoin(vehicleTable, eq(bookingTable.vehicleId, vehicleTable.id))
    .leftJoin(
      vehicleModelTable,
      eq(vehicleTable.vehicleModelId, vehicleModelTable.id),
    )
    .innerJoin(pickupLoc, eq(bookingTable.pickupLocationId, pickupLoc.id))
    .innerJoin(dropoffLoc, eq(bookingTable.dropoffLocationId, dropoffLoc.id))
    .leftJoin(partnerTable, eq(bookingTable.partnerId, partnerTable.id))
    .where(and(eq(bookingTable.id, id), isNull(bookingTable.deletedAt)));

  const row = rows[0];
  if (!row) throw new NotFoundError(`Booking ${id} not found`);

  const [extras, payments] = await Promise.all([
    db
      .select({
        id: bookingextraTable.id,
        extraId: bookingextraTable.extraId,
        extraName: extraTable.name,
        quantity: bookingextraTable.quantity,
        priceAtBooking: bookingextraTable.priceAtBooking,
      })
      .from(bookingextraTable)
      .innerJoin(extraTable, eq(bookingextraTable.extraId, extraTable.id))
      .where(eq(bookingextraTable.bookingId, id)),
    db
      .select({
        id: paymentTable.id,
        method: paymentTable.method,
        status: paymentTable.status,
        amount: paymentTable.amount,
        currency: paymentTable.currency,
        transactionId: paymentTable.transactionId,
        paidAt: paymentTable.paidAt,
      })
      .from(paymentTable)
      .where(eq(paymentTable.bookingId, id))
      .orderBy(asc(paymentTable.id)),
  ]);

  const base = mapToBookingRow(row);

  return {
    ...base,
    userId: row.customerId,
    vehicleId: row.vehicleId,
    vehicleGroupId: row.vehicleGroupId,
    vehicleModelId: row.vehicleModelId,
    rateId: row.rateId,
    rateTierId: row.rateTierId,
    pricePerDay: row.pricePerDay,
    baseRate: row.baseRate,
    taxes: row.taxes,
    fees: row.fees,
    discount: row.discount,
    oneWayFee: row.oneWayFee,
    deliveryFee: row.deliveryFee,
    deposit: row.deposit,
    notes: row.notes,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    pickupPhoto: row.pickupPhoto,
    returnPhoto: row.returnPhoto,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    extras,
    payments,
  };
}

