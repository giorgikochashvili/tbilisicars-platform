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
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { findOrCreateCustomer } from "./admin-customers.service.js";
import { removeFromParkingByVehicle } from "./admin-parking.service.js";

// ─── Alias tables ──────────────────────────────────────────────────────────────

const pickupLoc = alias(locationTable, "pickup_loc");
const dropoffLoc = alias(locationTable, "dropoff_loc");
// Second alias to join vehicle_model via booking.vehicle_model_id (for model-only bookings)
const bookingModelTable = alias(vehicleModelTable, "booking_model");

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
  // Model name from booking.vehicle_model_id (used when no specific vehicle is assigned)
  bookingVehicleModelName: bookingModelTable.name,
  pickupLocationId: pickupLoc.id,
  pickupLocationName: pickupLoc.name,
  dropoffLocationId: dropoffLoc.id,
  dropoffLocationName: dropoffLoc.name,
  partnerId: partnerTable.id,
  partnerName: partnerTable.name,
} as const;

// ─── Booking detail select (additional fields for single booking view) ─────────

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

// ─── Type and mapper ───────────────────────────────────────────────────────────

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
  bookingVehicleModelName: string | null;
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
    // Top-level vehicleModelName: resolved from booking.vehicle_model_id directly
    // Useful for model-only bookings (website) where no specific vehicle is assigned yet
    vehicleModelName: row.bookingVehicleModelName ?? null,
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
  bookingId?: number;
  vehicleSearch?: string;
  locationId?: number;
  page?: number;
  limit?: number;
}

// ─── Helper: check if a vehicle has a conflicting booking in the given period ──
//
// A conflict exists when:
//   - same vehicleId
//   - booking is PENDING, CONFIRMED, or DELIVERED (active/upcoming)
//   - periods truly overlap: existing.pickup < new.dropoff AND existing.dropoff > new.pickup
//   - consecutive (touching at exact same datetime) is NOT a conflict
//
// Pass excludeBookingId when updating an existing booking to exclude itself.

async function checkVehicleConflict(
  vehicleId: number,
  pickupDatetime: Date,
  dropoffDatetime: Date,
  excludeBookingId?: number,
): Promise<{ conflict: boolean; conflictingBookingId?: number }> {
  const conditions = [
    eq(bookingTable.vehicleId, vehicleId),
    isNull(bookingTable.deletedAt),
    // True overlap: strictly less/greater (consecutive is fine)
    lt(bookingTable.pickupDatetime, dropoffDatetime),
    gt(bookingTable.dropoffDatetime, pickupDatetime),
    // Only bookings that are still active/upcoming block the vehicle
    or(
      eq(bookingTable.status, "PENDING"),
      eq(bookingTable.status, "CONFIRMED"),
      eq(bookingTable.status, "DELIVERED"),
    )!,
  ];

  if (excludeBookingId != null) {
    conditions.push(ne(bookingTable.id, excludeBookingId));
  }

  const rows = await db
    .select({ id: bookingTable.id })
    .from(bookingTable)
    .where(and(...conditions))
    .limit(1);

  if (rows.length > 0) {
    return { conflict: true, conflictingBookingId: rows[0]!.id };
  }
  return { conflict: false };
}

// ─── Helper: validate vehicle belongs to given model ──────────────────────────

async function validateVehicleBelongsToModel(
  vehicleId: number,
  vehicleModelId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: vehicleTable.id })
    .from(vehicleTable)
    .where(
      and(
        eq(vehicleTable.id, vehicleId),
        eq(vehicleTable.vehicleModelId, vehicleModelId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ─── Service: list bookings ────────────────────────────────────────────────────

export async function listAdminBookings(filters: ListBookingsFilters = {}) {
  const { status, paymentStatus, search, dateFrom, dateTo, bookingId, vehicleSearch, locationId } = filters;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [isNull(bookingTable.deletedAt)];
  if (bookingId) conditions.push(eq(bookingTable.id, bookingId));
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
  if (locationId) {
    conditions.push(
      or(
        eq(bookingTable.pickupLocationId, locationId),
        eq(bookingTable.dropoffLocationId, locationId),
      )!,
    );
  }
  if (vehicleSearch) {
    const vehicleSubquery = db
      .select({ id: vehicleTable.id })
      .from(vehicleTable)
      .leftJoin(vehicleModelTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
      .where(
        or(
          ilike(vehicleTable.licensePlate, `%${vehicleSearch}%`),
          ilike(vehicleModelTable.name, `%${vehicleSearch}%`),
        ),
      );
    const modelSubquery = db
      .select({ id: vehicleModelTable.id })
      .from(vehicleModelTable)
      .where(ilike(vehicleModelTable.name, `%${vehicleSearch}%`));
    conditions.push(
      or(
        inArray(bookingTable.vehicleId, vehicleSubquery),
        inArray(bookingTable.vehicleModelId, modelSubquery),
      )!,
    );
  }

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
      .leftJoin(
        bookingModelTable,
        eq(bookingTable.vehicleModelId, bookingModelTable.id),
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
    .leftJoin(
      bookingModelTable,
      eq(bookingTable.vehicleModelId, bookingModelTable.id),
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

// ─── Service: create booking ───────────────────────────────────────────────────
//
// Vehicle assignment rules:
//   - vehicleModelId is required (booking must reference a model)
//   - vehicleId is optional — booking is model-only until a vehicle is assigned
//   - if vehicleId is provided:
//       1. validate vehicle belongs to vehicleModelId
//       2. check for time-period conflicts with other active bookings

export async function createAdminBooking(data: {
  customerId?: number | null;
  customerData?: { fullName?: string; email?: string; phone?: string } | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerFullName?: string | null;
  pickupLocationId: number;
  dropoffLocationId: number;
  pickupDatetime: string;
  dropoffDatetime: string;
  vehicleId?: number | null;
  vehicleGroupId?: number | null;
  vehicleModelId?: number | null;
  rateId?: number | null;
  rateTierId?: number | null;
  pricePerDay?: string | null;
  baseRate?: string | null;
  taxes?: string | null;
  fees?: string | null;
  discount?: string | null;
  oneWayFee?: string | null;
  deliveryFee?: string | null;
  deposit?: string | null;
  totalAmount?: string | null;
  currency?: string | null;
  contactFullName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  source?: string | null;
  broker?: string | null;
  pickupType?: string | null;
  pickupAddress?: string | null;
  dropoffType?: string | null;
  dropoffAddress?: string | null;
  status?: "PENDING" | "CONFIRMED" | "DELIVERED" | "RETURNED" | "CANCELED" | "NO_SHOW";
  paymentStatus?: "UNPAID" | "HALF" | "PAID" | "REFUNDED";
}) {
  const pickupDate = new Date(data.pickupDatetime);
  const dropoffDate = new Date(data.dropoffDatetime);

  // Validate specific vehicle assignment if provided
  if (data.vehicleId) {
    // 1. Vehicle must belong to the selected model
    if (data.vehicleModelId) {
      const belongs = await validateVehicleBelongsToModel(data.vehicleId, data.vehicleModelId);
      if (!belongs) {
        throw new ConflictError("Vehicle does not belong to the selected model");
      }
    }

    // 2. No overlapping active bookings for this vehicle
    const { conflict, conflictingBookingId } = await checkVehicleConflict(
      data.vehicleId,
      pickupDate,
      dropoffDate,
    );
    if (conflict) {
      throw new ConflictError(
        `Vehicle is already booked during this period (conflicts with booking #${conflictingBookingId})`,
      );
    }
  }

  let userId = data.customerId;
  if (!userId) {
    const customer = await findOrCreateCustomer({
      email: data.customerData?.email ?? data.customerEmail,
      phone: data.customerData?.phone ?? data.customerPhone,
      fullName: data.customerData?.fullName ?? data.customerFullName ?? data.contactFullName,
    });
    userId = customer.id;
  }

  const { customerId, customerData, customerEmail, customerPhone, customerFullName, ...rest } = data;

  const [row] = await db
    .insert(bookingTable)
    .values({
      ...rest,
      userId,
      pickupDatetime: pickupDate,
      dropoffDatetime: dropoffDate,
    } as any)
    .returning();

  return getAdminBooking(row!.id);
}

// ─── Service: update booking ───────────────────────────────────────────────────

export async function updateAdminBooking(
  id: number,
  data: Partial<{
    vehicleId: number | null;
    vehicleGroupId: number | null;
    vehicleModelId: number | null;
    pickupLocationId: number;
    dropoffLocationId: number;
    pickupDatetime: string;
    dropoffDatetime: string;
    rateId: number | null;
    rateTierId: number | null;
    pricePerDay: string | null;
    baseRate: string | null;
    taxes: string | null;
    fees: string | null;
    discount: string | null;
    oneWayFee: string | null;
    deliveryFee: string | null;
    deposit: string | null;
    totalAmount: string | null;
    currency: string | null;
    contactFullName: string;
    contactEmail: string | null;
    contactPhone: string | null;
    notes: string | null;
    source: string | null;
    broker: string | null;
    paymentStatus: "UNPAID" | "HALF" | "PAID" | "REFUNDED";
  }>,
) {
  // If assigning or changing a specific vehicle, validate ownership + conflicts
  if (data.vehicleId) {
    // Load current booking to know dates if not being changed
    const current = await db
      .select({
        vehicleModelId: bookingTable.vehicleModelId,
        pickupDatetime: bookingTable.pickupDatetime,
        dropoffDatetime: bookingTable.dropoffDatetime,
      })
      .from(bookingTable)
      .where(eq(bookingTable.id, id))
      .limit(1);

    const booking = current[0];
    if (!booking) throw new NotFoundError(`Booking ${id} not found`);

    const modelId = data.vehicleModelId ?? booking.vehicleModelId;
    const pickup = data.pickupDatetime ? new Date(data.pickupDatetime) : booking.pickupDatetime;
    const dropoff = data.dropoffDatetime ? new Date(data.dropoffDatetime) : booking.dropoffDatetime;

    if (modelId) {
      const belongs = await validateVehicleBelongsToModel(data.vehicleId, modelId);
      if (!belongs) {
        throw new ConflictError("Vehicle does not belong to the selected model");
      }
    }

    const { conflict, conflictingBookingId } = await checkVehicleConflict(
      data.vehicleId,
      pickup,
      dropoff,
      id, // exclude self
    );
    if (conflict) {
      throw new ConflictError(
        `Vehicle is already booked during this period (conflicts with booking #${conflictingBookingId})`,
      );
    }
  }

  const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.pickupDatetime) updateData.pickupDatetime = new Date(data.pickupDatetime);
  if (data.dropoffDatetime) updateData.dropoffDatetime = new Date(data.dropoffDatetime);

  const [row] = await db
    .update(bookingTable)
    .set(updateData as any)
    .where(eq(bookingTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Booking ${id} not found`);
  return getAdminBooking(id);
}

// ─── Service: update booking status (with vehicle lifecycle effects) ───────────
//
// Vehicle status effects:
//   DELIVERED  → vehicle.status = RENTED
//   RETURNED   → vehicle.status = AVAILABLE + vehicle.locationId = dropoffLocationId
//   CANCELED / NO_SHOW → if vehicle was RENTED or RESERVED, reset to AVAILABLE
//
// Effects only apply when the booking has a specific vehicle (vehicleId).

export async function updateAdminBookingStatus(
  id: number,
  status: "PENDING" | "CONFIRMED" | "DELIVERED" | "RETURNED" | "CANCELED" | "NO_SHOW",
) {
  // Load current booking to get vehicleId and dropoff location
  const currentRows = await db
    .select({
      vehicleId: bookingTable.vehicleId,
      dropoffLocationId: bookingTable.dropoffLocationId,
      currentStatus: bookingTable.status,
    })
    .from(bookingTable)
    .where(eq(bookingTable.id, id))
    .limit(1);

  const current = currentRows[0];
  if (!current) throw new NotFoundError(`Booking ${id} not found`);

  // Update booking status
  const [row] = await db
    .update(bookingTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(bookingTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Booking ${id} not found`);

  // Apply vehicle effects only when a specific vehicle is assigned
  if (current.vehicleId) {
    if (status === "DELIVERED") {
      // Vehicle is now in use → mark as RENTED
      await db
        .update(vehicleTable)
        .set({ status: "RENTED", updatedAt: new Date() })
        .where(eq(vehicleTable.id, current.vehicleId));
      // Auto-remove from TBS AIR PARKING if the vehicle was parked there
      await removeFromParkingByVehicle(current.vehicleId);
    } else if (status === "RETURNED") {
      // Vehicle returned → mark Available and update its current location
      await db
        .update(vehicleTable)
        .set({
          status: "AVAILABLE",
          locationId: current.dropoffLocationId,
          updatedAt: new Date(),
        })
        .where(eq(vehicleTable.id, current.vehicleId));
    } else if (status === "CANCELED" || status === "NO_SHOW") {
      // Release vehicle — only unblock if it was RENTED or RESERVED by this booking
      // (avoid changing status if already in maintenance or another booking has it)
      const vehicleRows = await db
        .select({ vehicleStatus: vehicleTable.status })
        .from(vehicleTable)
        .where(eq(vehicleTable.id, current.vehicleId))
        .limit(1);

      const vehicleStatus = vehicleRows[0]?.vehicleStatus;
      if (vehicleStatus === "RENTED" || vehicleStatus === "RESERVED") {
        await db
          .update(vehicleTable)
          .set({ status: "AVAILABLE", updatedAt: new Date() })
          .where(eq(vehicleTable.id, current.vehicleId));
      }
    }
  }

  return getAdminBooking(id);
}

// ─── Service: delete booking (soft delete) ────────────────────────────────────

export async function deleteAdminBooking(id: number) {
  const [row] = await db
    .update(bookingTable)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bookingTable.id, id), isNull(bookingTable.deletedAt)))
    .returning();
  if (!row) throw new NotFoundError(`Booking ${id} not found`);
  return { message: "Booking deleted" };
}
