import {
  db,
  pool,
  bookingTable,
  bookingHistoryTable,
  bookingVehicleAssignmentsTable,
  userTable,
  vehicleTable,
  vehicleModelTable,
  brandTable,
  locationTable,
  partnerTable,
  bookingextraTable,
  extraTable,
  paymentTable,
  bookingphotoTable,
  bookingAttributionTable,
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
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AppError, ConflictError, NotFoundError } from "../lib/errors.js";
import { findOrCreateCustomer } from "./admin-customers.service.js";
import { removeFromParkingByVehicle } from "./admin-parking.service.js";
import { sendBookingConfirmationEmail } from "./email.service.js";
import {
  getBookingPaymentSummary,
  updateBookingPaymentStatus,
} from "./admin-booking-payments.service.js";

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ─── Alias tables ──────────────────────────────────────────────────────────────

const pickupLoc = alias(locationTable, "pickup_loc");
const dropoffLoc = alias(locationTable, "dropoff_loc");
// Second alias to join vehicle_model via booking.vehicle_model_id (for model-only bookings)
const bookingModelTable = alias(vehicleModelTable, "booking_model");
// Brand aliases: vehicle-path brand and booking-model-path brand
const vehicleBrandTable = alias(brandTable, "vehicle_brand");
const bookingBrandTable = alias(brandTable, "booking_brand");

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
  // Brand name via vehicle's model (vehicle-path brand)
  vehicleBrandName: vehicleBrandTable.name,
  // Brand name via booking.vehicle_model_id (booking-path brand)
  bookingVehicleBrandName: bookingBrandTable.name,
  pickupLocationId: pickupLoc.id,
  pickupLocationName: pickupLoc.name,
  dropoffLocationId: dropoffLoc.id,
  dropoffLocationName: dropoffLoc.name,
  dropoffLocationCity: dropoffLoc.city,
  partnerId: partnerTable.id,
  partnerName: partnerTable.name,
  pickupType: bookingTable.pickupType,
  dropoffType: bookingTable.dropoffType,
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
  depositCurrency: (bookingTable as any).depositCurrency,
  notes: bookingTable.notes,
  pickupType: bookingTable.pickupType,
  pickupAddress: bookingTable.pickupAddress,
  dropoffType: bookingTable.dropoffType,
  dropoffAddress: bookingTable.dropoffAddress,
  documentType: bookingTable.documentType,
  documentNumber: bookingTable.documentNumber,
  pickupPhoto: bookingTable.pickupPhoto,
  returnPhoto: bookingTable.returnPhoto,
  updatedAt: bookingTable.updatedAt,
  deletedAt: bookingTable.deletedAt,
  externalReservationCode: bookingTable.externalReservationCode,
  voucherImportRef: bookingTable.voucherImportRef,
  customerContacted: bookingTable.customerContacted,
} as const;

// ─── Type and mapper ───────────────────────────────────────────────────────────

type BookingRowFlat = {
  id: number;
  status: "PENDING" | "CONFIRMED" | "DELIVERED" | "RETURNED" | "CANCELED" | "NO_SHOW";
  paymentStatus: "UNPAID" | "HALF" | "PAID" | "PREPAID" | "REFUNDED";
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
  vehicleBrandName: string | null;
  bookingVehicleBrandName: string | null;
  pickupLocationId: number;
  pickupLocationName: string;
  dropoffLocationId: number;
  dropoffLocationName: string;
  dropoffLocationCity: string | null;
  partnerId: number | null;
  partnerName: string | null;
  externalReservationCode: string | null;
  pickupType: string | null;
  dropoffType: string | null;
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
          brandName: row.vehicleBrandName ?? null,
        }
      : null,
    // Top-level vehicleModelName: resolved from booking.vehicle_model_id directly
    // Useful for model-only bookings (website) where no specific vehicle is assigned yet
    vehicleModelName: row.bookingVehicleModelName ?? null,
    vehicleModelBrandName: row.bookingVehicleBrandName ?? null,
    pickupLocation: { id: row.pickupLocationId, name: row.pickupLocationName },
    dropoffLocation: { id: row.dropoffLocationId, name: row.dropoffLocationName, city: row.dropoffLocationCity },
    partner: row.partnerId ? { id: row.partnerId, name: row.partnerName! } : null,
    pickupType: row.pickupType,
    dropoffType: row.dropoffType,
  };
}

// ─── Filters type ─────────────────────────────────────────────────────────────

export interface ListBookingsFilters {
  status?: "PENDING" | "CONFIRMED" | "DELIVERED" | "RETURNED" | "CANCELED" | "NO_SHOW";
  paymentStatus?: "UNPAID" | "HALF" | "PAID" | "PREPAID" | "REFUNDED";
  search?: string;
  phoneSearch?: string;
  dateFrom?: string;
  dateTo?: string;
  bookingId?: number;
  vehicleSearch?: string;
  locationId?: number;
  city?: string;
  userId?: number;
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
  tx?: TxClient,
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

  const rows = await (tx ?? db)
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
  tx?: TxClient,
): Promise<boolean> {
  const rows = await (tx ?? db)
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
  const { status, paymentStatus, search, phoneSearch, dateFrom, dateTo, bookingId, vehicleSearch, locationId, city, userId } = filters;
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
  if (phoneSearch) {
    conditions.push(ilike(bookingTable.contactPhone, `%${phoneSearch}%`));
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
  if (city) {
    const cityLocIds = db
      .select({ id: locationTable.id })
      .from(locationTable)
      .where(eq(locationTable.city, city));
    conditions.push(
      or(
        inArray(bookingTable.pickupLocationId, cityLocIds),
        inArray(bookingTable.dropoffLocationId, cityLocIds),
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
  if (userId !== undefined) conditions.push(eq(bookingTable.userId, userId));

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
      .leftJoin(vehicleBrandTable, eq(vehicleModelTable.brandId, vehicleBrandTable.id))
      .leftJoin(bookingBrandTable, eq(bookingModelTable.brandId, bookingBrandTable.id))
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

  const mappedRows = rows.map(mapToBookingRow);

  // Batch-fetch payment record counts + pickup photo counts for all booking IDs in this page
  const paymentCountMap = new Map<number, number>();
  const pickupPhotoCountMap = new Map<number, number>();
  if (mappedRows.length > 0) {
    const ids = mappedRows.map((r) => r.id);
    const [{ rows: countRows }, { rows: photoRows }] = await Promise.all([
      pool.query<{ booking_id: number; cnt: number }>(
        `SELECT booking_id, COUNT(*)::int AS cnt FROM booking_payment WHERE booking_id = ANY($1) GROUP BY booking_id`,
        [ids],
      ),
      pool.query<{ booking_id: number; cnt: number }>(
        `SELECT booking_id, COUNT(*)::int AS cnt FROM bookingphoto WHERE booking_id = ANY($1) AND photo_type = 'PICKUP' AND photo_archived_at IS NULL GROUP BY booking_id`,
        [ids],
      ),
    ]);
    for (const r of countRows) paymentCountMap.set(r.booking_id, r.cnt);
    for (const r of photoRows) pickupPhotoCountMap.set(r.booking_id, r.cnt);
  }

  return {
    data: mappedRows.map((r) => ({
      ...r,
      paymentRecordCount: paymentCountMap.get(r.id) ?? 0,
      pickupPhotoCount: pickupPhotoCountMap.get(r.id) ?? 0,
    })),
    meta: { page, limit, total: totalRows[0]?.total ?? 0 },
  };
}

// ─── Service: append photos to a booking ──────────────────────────────────────
// Adds bookingphoto rows of a given type without touching booking_handover and
// without advancing booking status. Used for pre-pickup uploads and for adding
// more pickup photos after pickup has already been recorded.

export async function appendBookingPhotos(
  bookingId: number,
  photoType: "PICKUP" | "RETURN" | "GENERAL",
  photoUrls: string[],
) {
  if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
    return { added: 0 };
  }
  const existing = await db
    .select({ id: bookingTable.id })
    .from(bookingTable)
    .where(and(eq(bookingTable.id, bookingId), isNull(bookingTable.deletedAt)))
    .limit(1);
  if (existing.length === 0) {
    throw new NotFoundError(`Booking ${bookingId} not found`);
  }

  // Strip null/empty and deduplicate within the incoming batch.
  const cleanUrls = [...new Set(photoUrls.filter((u) => u && u.trim().length > 0))];
  if (cleanUrls.length === 0) return { added: 0 };

  // Exclude URLs already stored for this booking+type so retries don't create duplicates.
  const existingRows = await db
    .select({ photoUrl: bookingphotoTable.photoUrl })
    .from(bookingphotoTable)
    .where(
      and(
        eq(bookingphotoTable.bookingId, bookingId),
        eq(bookingphotoTable.photoType, photoType),
      ),
    );
  const existingUrls = new Set(existingRows.map((r) => r.photoUrl));
  const newUrls = cleanUrls.filter((u) => !existingUrls.has(u));

  if (newUrls.length === 0) return { added: 0 };

  await db.insert(bookingphotoTable).values(
    newUrls.map((url) => ({
      bookingId,
      photoUrl: url,
      photoType,
    })),
  );
  return { added: newUrls.length };
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
    .leftJoin(vehicleBrandTable, eq(vehicleModelTable.brandId, vehicleBrandTable.id))
    .leftJoin(bookingBrandTable, eq(bookingModelTable.brandId, bookingBrandTable.id))
    .innerJoin(pickupLoc, eq(bookingTable.pickupLocationId, pickupLoc.id))
    .innerJoin(dropoffLoc, eq(bookingTable.dropoffLocationId, dropoffLoc.id))
    .leftJoin(partnerTable, eq(bookingTable.partnerId, partnerTable.id))
    .where(and(eq(bookingTable.id, id), isNull(bookingTable.deletedAt)));

  const row = rows[0];
  if (!row) throw new NotFoundError(`Booking ${id} not found`);

  const [extras, payments, pickupPhotoCountRows, replacementHistory, attributionRows] = await Promise.all([
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
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookingphotoTable)
      .where(
        and(
          eq(bookingphotoTable.bookingId, id),
          eq(bookingphotoTable.photoType, "PICKUP"),
          isNull(bookingphotoTable.photoArchivedAt),
        ),
      ),
    db
      .select({
        id:          bookingVehicleAssignmentsTable.id,
        vehicleId:   bookingVehicleAssignmentsTable.vehicleId,
        licensePlate: vehicleTable.licensePlate,
        startDate:   bookingVehicleAssignmentsTable.startDate,
        endDate:     bookingVehicleAssignmentsTable.endDate,
        notes:       bookingVehicleAssignmentsTable.notes,
      })
      .from(bookingVehicleAssignmentsTable)
      .leftJoin(vehicleTable, eq(bookingVehicleAssignmentsTable.vehicleId, vehicleTable.id))
      .where(eq(bookingVehicleAssignmentsTable.bookingId, id))
      .orderBy(asc(bookingVehicleAssignmentsTable.startDate)),
    db
      .select({
        sourceBrand:  bookingAttributionTable.sourceBrand,
        sourceDomain: bookingAttributionTable.sourceDomain,
        utmSource:    bookingAttributionTable.utmSource,
        utmMedium:    bookingAttributionTable.utmMedium,
        utmCampaign:  bookingAttributionTable.utmCampaign,
        utmContent:   bookingAttributionTable.utmContent,
        utmTerm:      bookingAttributionTable.utmTerm,
        gclid:        bookingAttributionTable.gclid,
        referrer:     bookingAttributionTable.referrer,
        landingPath:  bookingAttributionTable.landingPath,
        createdAt:    bookingAttributionTable.createdAt,
      })
      .from(bookingAttributionTable)
      .where(eq(bookingAttributionTable.bookingId, id))
      .limit(1),
  ]);

  const pickupPhotoCount = pickupPhotoCountRows[0]?.count ?? 0;
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
    depositCurrency: row.depositCurrency,
    notes: row.notes,
    pickupType: row.pickupType,
    pickupAddress: row.pickupAddress,
    dropoffType: row.dropoffType,
    dropoffAddress: row.dropoffAddress,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    pickupPhoto: row.pickupPhoto,
    returnPhoto: row.returnPhoto,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    externalReservationCode: row.externalReservationCode,
    voucherImportRef: row.voucherImportRef,
    extras,
    payments,
    pickupPhotoCount,
    vehicleReplacementHistory: replacementHistory.map((r) => ({
      id:          r.id,
      vehicleId:   r.vehicleId,
      licensePlate: r.licensePlate ?? null,
      startDate:   r.startDate.toISOString(),
      endDate:     r.endDate.toISOString(),
      notes:       r.notes ?? null,
    })),
    attribution: attributionRows[0] ?? null,
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
  paymentStatus?: "UNPAID" | "HALF" | "PAID" | "PREPAID" | "REFUNDED";
  reservationCode?: string | null;
  externalReservationCode?: string | null;
  voucherImportRef?: string | null;
  extras?: { extraId: number; quantity: number }[] | null;
}) {
  const pickupDate = new Date(data.pickupDatetime);
  const dropoffDate = new Date(data.dropoffDatetime);

  if (dropoffDate <= pickupDate) {
    throw new AppError(
      422,
      "Return date cannot be earlier than pickup date. Please correct the booking dates.",
    );
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

  const { customerId, customerData, customerEmail, customerPhone, customerFullName, extras, ...rest } = data;

  // Validate extras quantities before any DB writes so we fail fast with a clean 422
  if (extras && extras.length > 0) {
    for (const item of extras) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new AppError(422, "One or more extras have an invalid quantity");
      }
    }
  }

  // Insert booking row + extras atomically so no partial state is possible.
  // Vehicle conflict check happens inside the transaction with a FOR UPDATE lock
  // to prevent double-booking races under concurrent admin requests.
  const row = await db.transaction(async (tx) => {
    if (data.vehicleId) {
      // 1. Lock the vehicle row — serialises concurrent creates for the same vehicle
      await tx
        .select({ id: vehicleTable.id })
        .from(vehicleTable)
        .where(eq(vehicleTable.id, data.vehicleId))
        .for("update");

      // 2. Vehicle must belong to the selected model
      if (data.vehicleModelId) {
        const belongs = await validateVehicleBelongsToModel(data.vehicleId, data.vehicleModelId, tx);
        if (!belongs) {
          throw new ConflictError("Vehicle does not belong to the selected model");
        }
      }

      // 3. No overlapping active bookings for this vehicle
      const { conflict, conflictingBookingId } = await checkVehicleConflict(
        data.vehicleId,
        pickupDate,
        dropoffDate,
        undefined,
        tx,
      );
      if (conflict) {
        throw new ConflictError(
          `Vehicle is already booked during this period (conflicts with booking #${conflictingBookingId})`,
        );
      }
    }

    const [inserted] = await tx
      .insert(bookingTable)
      .values({
        ...rest,
        userId,
        pickupDatetime: pickupDate,
        dropoffDatetime: dropoffDate,
      } as any)
      .returning();

    if (extras && extras.length > 0) {
      const extraIds = extras.map((e) => e.extraId);
      const { rows: extraRows } = await pool.query(
        `SELECT id, price, pricing_type, max_days FROM extra WHERE id = ANY($1) AND is_active = true`,
        [extraIds],
      );
      if (extraRows.length !== extraIds.length) {
        throw new AppError(422, "One or more extras are invalid or inactive");
      }
      const extraMap = new Map<number, { price: string }>(
        extraRows.map((r: any) => [r.id, { price: String(r.price) }]),
      );
      await tx.insert(bookingextraTable).values(
        extras.map((e) => ({
          bookingId: inserted!.id,
          extraId: e.extraId,
          quantity: e.quantity,
          priceAtBooking: extraMap.get(e.extraId)!.price,
        })),
      );
    }

    return inserted;
  });

  const initialStatus = data.status;
  if (
    initialStatus === "DELIVERED" ||
    initialStatus === "RETURNED" ||
    initialStatus === "CANCELED" ||
    initialStatus === "NO_SHOW"
  ) {
    await applyAdminBookingStatus(row!.id, initialStatus);
  }

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
    pickupType: string | null;
    pickupAddress: string | null;
    dropoffType: string | null;
    dropoffAddress: string | null;
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
    depositCurrency?: string | null;
    totalAmount: string | null;
    currency: string | null;
    contactFullName: string;
    contactEmail: string | null;
    contactPhone: string | null;
    notes: string | null;
    source: string | null;
    broker: string | null;
    externalReservationCode: string | null;
    paymentStatus: "UNPAID" | "HALF" | "PAID" | "PREPAID" | "REFUNDED";
    extensionChargeAmount: number;
  }>,
  changedById?: number | null,
) {
  const extensionChargeAmount = data.extensionChargeAmount;
  const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };
  delete updateData.extensionChargeAmount;
  if (data.pickupDatetime) updateData.pickupDatetime = new Date(data.pickupDatetime);
  if (data.dropoffDatetime) updateData.dropoffDatetime = new Date(data.dropoffDatetime);

  // Wrap validation + update in a transaction so the FOR UPDATE vehicle lock,
  // conflict check, and booking update are all atomic.
  await db.transaction(async (tx) => {
    // Trigger when vehicle or dates are changing — not only when vehicleId is
    // explicitly provided, so date-only patches on already-assigned vehicles
    // are also protected.
    if (data.vehicleId || data.pickupDatetime || data.dropoffDatetime) {
      // Load current booking: need vehicleId + dates to compute effective values
      const current = await tx
        .select({
          vehicleId:       bookingTable.vehicleId,
          vehicleModelId:  bookingTable.vehicleModelId,
          pickupDatetime:  bookingTable.pickupDatetime,
          dropoffDatetime: bookingTable.dropoffDatetime,
        })
        .from(bookingTable)
        .where(eq(bookingTable.id, id))
        .limit(1);

      const booking = current[0];
      if (!booking) throw new NotFoundError(`Booking ${id} not found`);

      const effectiveVehicleId = data.vehicleId ?? booking.vehicleId ?? null;
      const pickup  = data.pickupDatetime  ? new Date(data.pickupDatetime)  : booking.pickupDatetime;
      const dropoff = data.dropoffDatetime ? new Date(data.dropoffDatetime) : booking.dropoffDatetime;

      if ((data.pickupDatetime || data.dropoffDatetime) && dropoff <= pickup) {
        throw new AppError(
          422,
          "Return date cannot be earlier than pickup date. Please correct the booking dates.",
        );
      }

      if (effectiveVehicleId) {
        // 1. Lock the vehicle row — serialises concurrent updates for the same vehicle
        await tx
          .select({ id: vehicleTable.id })
          .from(vehicleTable)
          .where(eq(vehicleTable.id, effectiveVehicleId))
          .for("update");

        // 2. Model ownership check — only when model is also being changed.
        // Pure vehicle-only assignments (replacement from a different model)
        // are allowed as a manual staff override.
        if (data.vehicleId && data.vehicleModelId) {
          const belongs = await validateVehicleBelongsToModel(effectiveVehicleId, data.vehicleModelId, tx);
          if (!belongs) {
            throw new ConflictError("Vehicle does not belong to the selected model");
          }
        }

        // 3. Conflict check — exclude self
        const { conflict, conflictingBookingId } = await checkVehicleConflict(
          effectiveVehicleId,
          pickup,
          dropoff,
          id,
          tx,
        );
        if (conflict) {
          throw new ConflictError(
            `Vehicle is already booked during this period (conflicts with booking #${conflictingBookingId})`,
          );
        }
      }
    }

    const [r] = await tx
      .update(bookingTable)
      .set(updateData as any)
      .where(eq(bookingTable.id, id))
      .returning();
    if (!r) throw new NotFoundError(`Booking ${id} not found`);

    if (data.vehicleId != null && data.vehicleId > 0 && r.status === "DELIVERED") {
      await removeFromParkingByVehicle(data.vehicleId, tx);
    }

    if (extensionChargeAmount && extensionChargeAmount > 0) {
      const oldTotal = r.totalAmount ?? "0";
      const currency = r.currency ?? "GEL";
      const newTotal = (parseFloat(oldTotal) + extensionChargeAmount).toFixed(2);

      await tx
        .update(bookingTable)
        .set({ totalAmount: newTotal, updatedAt: new Date() })
        .where(eq(bookingTable.id, id));

      const summary = await getBookingPaymentSummary(id, tx);
      await updateBookingPaymentStatus(id, summary, tx);

      const dropoffStr = data.dropoffDatetime
        ? new Date(data.dropoffDatetime).toISOString()
        : "(unchanged)";

      await tx.insert(bookingHistoryTable).values({
        bookingId: id,
        changedById: changedById ?? null,
        actionType: "EXTENSION_CHARGE",
        fieldName: "total_amount",
        oldValue: oldTotal,
        newValue: newTotal,
        description:
          `Extension charge of ${currency} ${extensionChargeAmount.toFixed(2)} applied` +
          ` — dropoff set to ${dropoffStr}`,
      });
    }
  });

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

type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "DELIVERED"
  | "RETURNED"
  | "CANCELED"
  | "NO_SHOW";

/**
 * Applies booking status + vehicle side-effects without fetching the full
 * booking detail. Use this when the caller does not need the return value
 * (e.g. from inside `createHandover` where the result is discarded).
 */
export async function applyAdminBookingStatus(
  id: number,
  status: BookingStatus,
  tx?: TxClient,
): Promise<void> {
  const client = tx ?? db;

  const currentRows = await client
    .select({
      vehicleId: bookingTable.vehicleId,
      pickupLocationId: bookingTable.pickupLocationId,
      dropoffLocationId: bookingTable.dropoffLocationId,
      currentStatus: bookingTable.status,
    })
    .from(bookingTable)
    .where(eq(bookingTable.id, id))
    .limit(1);

  const current = currentRows[0];
  if (!current) throw new NotFoundError(`Booking ${id} not found`);

  const [row] = await client
    .update(bookingTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(bookingTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Booking ${id} not found`);

  if (current.vehicleId) {
    if (status === "DELIVERED") {
      await client
        .update(vehicleTable)
        .set({ status: "RENTED", locationId: current.pickupLocationId, updatedAt: new Date() })
        .where(eq(vehicleTable.id, current.vehicleId));
      await removeFromParkingByVehicle(current.vehicleId, tx);
    } else if (status === "RETURNED") {
      await client
        .update(vehicleTable)
        .set({
          status: "AVAILABLE",
          locationId: current.dropoffLocationId,
          updatedAt: new Date(),
        })
        .where(eq(vehicleTable.id, current.vehicleId));
    } else if (status === "CANCELED" || status === "NO_SHOW") {
      const vehicleRows = await client
        .select({ vehicleStatus: vehicleTable.status })
        .from(vehicleTable)
        .where(eq(vehicleTable.id, current.vehicleId))
        .limit(1);

      const vehicleStatus = vehicleRows[0]?.vehicleStatus;
      if (vehicleStatus === "RENTED" || vehicleStatus === "RESERVED") {
        await client
          .update(vehicleTable)
          .set({ status: "AVAILABLE", updatedAt: new Date() })
          .where(eq(vehicleTable.id, current.vehicleId));
      }
    }
  }
}

/**
 * Updates booking status + vehicle side-effects and returns the refreshed
 * full booking detail. Use this from the status-update API route where the
 * updated booking object is sent back to the client.
 */
export async function updateAdminBookingStatus(
  id: number,
  status: BookingStatus,
) {
  await applyAdminBookingStatus(id, status);
  return getAdminBooking(id);
}

// ─── Service: replace vehicle on a DELIVERED booking ──────────────────────────
//
// Atomically:
//   1. Guards (DELIVERED, has vehicle, different vehicle, new vehicle exists)
//   2. Conflict check for new vehicle
//   3. Inserts booking_vehicle_assignments row for old vehicle (history)
//   4. Updates booking.vehicleId = newVehicleId (vehicleModelId unchanged)
//   5. Old vehicle → AVAILABLE, new vehicle → RENTED
//   6. Removes new vehicle from active parking
//
// reason must already be trimmed and non-empty (validated by the route handler).

export async function replaceVehicleOnBooking(
  id: number,
  newVehicleId: number,
  reason: string,
): Promise<{ booking: Awaited<ReturnType<typeof getAdminBooking>>; oldVehicleId: number }> {
  let capturedOldVehicleId = 0;

  await db.transaction(async (tx) => {
    // 1. Lock and read the booking row
    const bookingRows = await tx
      .select({
        vehicleId:         bookingTable.vehicleId,
        status:            bookingTable.status,
        pickupDatetime:    bookingTable.pickupDatetime,
        dropoffDatetime:   bookingTable.dropoffDatetime,
        dropoffLocationId: bookingTable.dropoffLocationId,
      })
      .from(bookingTable)
      .where(and(eq(bookingTable.id, id), isNull(bookingTable.deletedAt)))
      .limit(1)
      .for("update");

    const bk = bookingRows[0];
    if (!bk) throw new NotFoundError(`Booking ${id} not found`);

    // 2. Guards
    if (bk.status !== "DELIVERED") {
      throw new AppError(400, "Vehicle replacement is only allowed on DELIVERED (active) bookings");
    }
    const oldVehicleId = bk.vehicleId;
    if (oldVehicleId == null) {
      throw new AppError(400, "Booking does not have an assigned vehicle to replace");
    }
    if (newVehicleId === oldVehicleId) {
      throw new AppError(400, "Replacement vehicle must be different from the current vehicle");
    }
    capturedOldVehicleId = oldVehicleId;

    // 3. Lock both vehicle rows in ascending-id order (deadlock prevention).
    //    Track the new-vehicle lock result to verify the vehicle exists.
    let newVehicleFound = false;
    if (oldVehicleId < newVehicleId) {
      await tx
        .select({ id: vehicleTable.id })
        .from(vehicleTable)
        .where(eq(vehicleTable.id, oldVehicleId))
        .for("update");
      const rows = await tx
        .select({ id: vehicleTable.id })
        .from(vehicleTable)
        .where(eq(vehicleTable.id, newVehicleId))
        .for("update");
      newVehicleFound = rows.length > 0;
    } else {
      const rows = await tx
        .select({ id: vehicleTable.id })
        .from(vehicleTable)
        .where(eq(vehicleTable.id, newVehicleId))
        .for("update");
      newVehicleFound = rows.length > 0;
      await tx
        .select({ id: vehicleTable.id })
        .from(vehicleTable)
        .where(eq(vehicleTable.id, oldVehicleId))
        .for("update");
    }
    if (!newVehicleFound) {
      throw new NotFoundError(`Vehicle ${newVehicleId} not found`);
    }

    // 4. Conflict check for new vehicle (exclude current booking)
    const { conflict, conflictingBookingId } = await checkVehicleConflict(
      newVehicleId,
      bk.pickupDatetime,
      bk.dropoffDatetime,
      id,
      tx,
    );
    if (conflict) {
      throw new ConflictError(
        `Replacement vehicle is already booked during this period (conflicts with booking #${conflictingBookingId})`,
      );
    }

    // 5. Determine startDate for the history row.
    //    For chained replacements, use the latest existing endDate so the
    //    chain reads: Vehicle A (pickup→replace1), Vehicle B (replace1→replace2), …
    //    If no prior history exists, fall back to booking.pickupDatetime.
    const latestPrior = await tx
      .select({ endDate: bookingVehicleAssignmentsTable.endDate })
      .from(bookingVehicleAssignmentsTable)
      .where(eq(bookingVehicleAssignmentsTable.bookingId, id))
      .orderBy(desc(bookingVehicleAssignmentsTable.endDate))
      .limit(1);

    const assignmentStartDate = latestPrior[0]?.endDate ?? bk.pickupDatetime;
    const replacementTime = new Date();

    // 6. Insert history record for the old vehicle
    await tx.insert(bookingVehicleAssignmentsTable).values({
      bookingId:        id,
      vehicleId:        oldVehicleId,
      startDate:        assignmentStartDate,
      endDate:          replacementTime,
      returnLocationId: bk.dropoffLocationId ?? null,
      odometerReading:  null,
      notes:            reason,
    });

    // 7. Update booking.vehicleId (vehicleModelId deliberately left unchanged)
    await tx
      .update(bookingTable)
      .set({ vehicleId: newVehicleId, updatedAt: new Date() })
      .where(eq(bookingTable.id, id));

    // 8. Old vehicle → AVAILABLE
    await tx
      .update(vehicleTable)
      .set({ status: "AVAILABLE", updatedAt: new Date() })
      .where(eq(vehicleTable.id, oldVehicleId));

    // 9. New vehicle → RENTED
    await tx
      .update(vehicleTable)
      .set({ status: "RENTED", updatedAt: new Date() })
      .where(eq(vehicleTable.id, newVehicleId));

    // 10. Remove new vehicle from active parking (if any)
    await removeFromParkingByVehicle(newVehicleId, tx);
  });

  return {
    booking: await getAdminBooking(id),
    oldVehicleId: capturedOldVehicleId,
  };
}

// ─── Service: update booking extras ───────────────────────────────────────────

export async function updateBookingExtras(
  bookingId: number,
  extras: { extraId: number; quantity: number }[],
) {
  for (const e of extras) {
    if (!Number.isInteger(e.quantity) || e.quantity < 1) {
      throw new AppError(422, "All extra quantities must be positive integers");
    }
  }

  await db.transaction(async (tx) => {
    const [bk] = await tx
      .select({ id: bookingTable.id })
      .from(bookingTable)
      .where(and(eq(bookingTable.id, bookingId), isNull(bookingTable.deletedAt)));
    if (!bk) throw new NotFoundError(`Booking ${bookingId} not found`);

    await tx.delete(bookingextraTable).where(eq(bookingextraTable.bookingId, bookingId));

    if (extras.length > 0) {
      const extraIds = extras.map((e) => e.extraId);
      const { rows: extraRows } = await pool.query(
        `SELECT id, price FROM extra WHERE id = ANY($1) AND is_active = true`,
        [extraIds],
      );
      if (extraRows.length !== extraIds.length) {
        throw new AppError(422, "One or more extras are invalid or inactive");
      }
      const extraMap = new Map<number, string>(
        extraRows.map((r: any) => [r.id, String(r.price)]),
      );
      await tx.insert(bookingextraTable).values(
        extras.map((e) => ({
          bookingId,
          extraId: e.extraId,
          quantity: e.quantity,
          priceAtBooking: extraMap.get(e.extraId)!,
        })),
      );
    }
  });

  return getAdminBooking(bookingId);
}

// ─── Service: send customer confirmation email for admin booking ──────────────

export async function sendAdminBookingConfirmation(bookingId: number): Promise<{ ok: true }> {
  const booking = await getAdminBooking(bookingId);
  if (!booking) throw new NotFoundError(`Booking ${bookingId} not found`);

  const toEmail = booking.contactEmail?.trim() || booking.customer?.email?.trim() || null;
  if (!toEmail) {
    throw new AppError(422, "This booking has no customer email address — cannot send confirmation.");
  }

  const toName = booking.contactFullName?.trim() || booking.customer?.fullName?.trim() || "Valued Customer";

  const vehicleLabel =
    [booking.vehicle?.brandName, booking.vehicle?.modelName].filter(Boolean).join(" ").trim() ||
    [booking.vehicleModelBrandName, booking.vehicleModelName].filter(Boolean).join(" ").trim() ||
    "Vehicle TBD";

  const reference = `#${booking.id}`;

  const pickupLocation = booking.pickupLocation?.name ?? "";
  const dropoffLocation = booking.dropoffLocation?.name ?? "";

  let emailExtras: Array<{
    name: string;
    quantity: number;
    pricePerUnit: number;
    pricingType: string;
    maxDays: number | null;
  }> = [];

  if (booking.extras && booking.extras.length > 0) {
    const extraIds = booking.extras.map((e) => e.extraId);
    const { rows: extraRows } = await pool.query<{
      id: number;
      pricing_type: string;
      max_days: number | null;
    }>(
      `SELECT id, pricing_type, max_days FROM extra WHERE id = ANY($1)`,
      [extraIds],
    );
    const extraMeta = new Map(extraRows.map((r) => [r.id, { pricingType: r.pricing_type, maxDays: r.max_days ?? null }]));

    emailExtras = booking.extras.map((e) => ({
      name: e.extraName,
      quantity: e.quantity ?? 1,
      pricePerUnit: Number(e.priceAtBooking),
      pricingType: extraMeta.get(e.extraId)?.pricingType ?? "per_trip",
      maxDays: extraMeta.get(e.extraId)?.maxDays ?? null,
    }));
  }

  const estimatedTotal =
    booking.totalAmount != null ? Number(booking.totalAmount) : null;

  await sendBookingConfirmationEmail({
    toEmail,
    toName,
    reference,
    bookingId: booking.id,
    vehicle: vehicleLabel,
    pickupLocation,
    dropoffLocation,
    pickupDatetime: booking.pickupDatetime instanceof Date
      ? booking.pickupDatetime.toISOString()
      : String(booking.pickupDatetime),
    dropoffDatetime: booking.dropoffDatetime instanceof Date
      ? booking.dropoffDatetime.toISOString()
      : String(booking.dropoffDatetime),
    extras: emailExtras,
    estimatedTotal,
    currency: booking.currency ?? "GEL",
    bookingStatus: booking.status ?? "PENDING",
    paymentStatus: booking.paymentStatus ?? "UNPAID",
    bookingNotes: booking.notes ?? null,
    pickupAddress: booking.pickupAddress ?? null,
    dropoffAddress: booking.dropoffAddress ?? null,
    attachPdfVoucher: true,
  });

  return { ok: true };
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

export async function toggleCustomerContacted(
  id: number,
  contacted: boolean,
): Promise<{ customerContacted: boolean }> {
  const [row] = await db
    .update(bookingTable)
    .set({ customerContacted: contacted, updatedAt: new Date() })
    .where(and(eq(bookingTable.id, id), isNull(bookingTable.deletedAt)))
    .returning({ customerContacted: bookingTable.customerContacted });
  if (!row) throw new NotFoundError(`Booking ${id} not found`);
  return { customerContacted: row.customerContacted };
}
