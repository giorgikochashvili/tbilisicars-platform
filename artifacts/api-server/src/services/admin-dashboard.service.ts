import {
  db,
  bookingTable,
  bookingHandoverTable,
  maintenanceServicesTable,
  userTable,
  vehicleTable,
  vehicleModelTable,
  brandTable,
  locationTable,
  partnerTable,
  bookingextraTable,
  extraTable,
} from "@workspace/db";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// ─── Aliases ──────────────────────────────────────────────────────────────────

const pickupLoc = alias(locationTable, "pickup_loc");
const dropoffLoc = alias(locationTable, "dropoff_loc");
const bookingModelTable = alias(vehicleModelTable, "booking_model");
// Brand aliases: vehicle-path brand and booking-model-path brand
const vehicleBrandTable = alias(brandTable, "vehicle_brand");
const bookingBrandTable = alias(brandTable, "booking_brand");

// ─── Shared select for booking row shape ─────────────────────────────────────

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
  customerContacted: bookingTable.customerContacted,
  createdAt: bookingTable.createdAt,
  customerId: userTable.id,
  customerFullName: userTable.fullName,
  customerEmail: userTable.email,
  vehicleId: vehicleTable.id,
  vehicleLicensePlate: vehicleTable.licensePlate,
  vehicleModelName: vehicleModelTable.name,
  bookingVehicleModelName: bookingModelTable.name,
  // Brand name via vehicle's model (vehicle-path brand)
  vehicleBrandName: vehicleBrandTable.name,
  // Brand name via booking.vehicle_model_id (booking-path brand)
  bookingVehicleBrandName: bookingBrandTable.name,
  pickupLocationId: pickupLoc.id,
  pickupLocationName: pickupLoc.name,
  pickupLocationCity: pickupLoc.city,
  dropoffLocationId: dropoffLoc.id,
  dropoffLocationName: dropoffLoc.name,
  dropoffLocationCity: dropoffLoc.city,
  partnerId: partnerTable.id,
  partnerName: partnerTable.name,
} as const;

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
  vehicleBrandName: string | null;
  bookingVehicleBrandName: string | null;
  pickupLocationId: number;
  pickupLocationName: string;
  pickupLocationCity: string | null;
  dropoffLocationId: number;
  dropoffLocationName: string;
  dropoffLocationCity: string | null;
  partnerId: number | null;
  partnerName: string | null;
  customerContacted: boolean;
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
    customerContacted: row.customerContacted,
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
    vehicleModelName: row.bookingVehicleModelName ?? null,
    vehicleModelBrandName: row.bookingVehicleBrandName ?? null,
    pickupLocation: { id: row.pickupLocationId, name: row.pickupLocationName },
    dropoffLocation: { id: row.dropoffLocationId, name: row.dropoffLocationName },
    partner: row.partnerId ? { id: row.partnerId, name: row.partnerName! } : null,
  };
}

// ─── Helper: resolve location IDs for a city ──────────────────────────────────
//
// Returns all location IDs where location.city = city (case-insensitive match).
// Returns null if no city filter should be applied.

async function getCityLocationIds(city: string): Promise<number[]> {
  const rows = await db
    .select({ id: locationTable.id })
    .from(locationTable)
    .where(eq(locationTable.city, city));
  return rows.map((r) => r.id);
}

// ─── Service: dashboard summary ────────────────────────────────────────────────
//
// When city is provided, only bookings where pickup OR dropoff location is
// in that city are counted.

export async function getDashboardSummary(city?: string) {
  const notDeleted = isNull(bookingTable.deletedAt);

  let cityCondition: ReturnType<typeof or> | undefined;
  if (city) {
    const locIds = await getCityLocationIds(city);
    if (locIds.length > 0) {
      cityCondition = or(
        inArray(bookingTable.pickupLocationId, locIds),
        inArray(bookingTable.dropoffLocationId, locIds),
      );
    } else {
      // No locations for this city — return all zeros
      return {
        total: 0,
        pending: 0,
        confirmed: 0,
        delivered: 0,
        returned: 0,
        canceled: 0,
        noShow: 0,
        totalRevenue: "0",
      };
    }
  }

  const baseWhere = cityCondition ? and(notDeleted, cityCondition) : notDeleted;

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
    db.select({ c: count() }).from(bookingTable).where(baseWhere),
    db.select({ c: count() }).from(bookingTable).where(and(baseWhere, eq(bookingTable.status, "PENDING"))),
    db.select({ c: count() }).from(bookingTable).where(and(baseWhere, eq(bookingTable.status, "CONFIRMED"))),
    db.select({ c: count() }).from(bookingTable).where(and(baseWhere, eq(bookingTable.status, "DELIVERED"))),
    db.select({ c: count() }).from(bookingTable).where(and(baseWhere, eq(bookingTable.status, "RETURNED"))),
    db.select({ c: count() }).from(bookingTable).where(and(baseWhere, eq(bookingTable.status, "CANCELED"))),
    db.select({ c: count() }).from(bookingTable).where(and(baseWhere, eq(bookingTable.status, "NO_SHOW"))),
    db
      .select({
        revenue: sql<string>`COALESCE(SUM(CASE
          WHEN ${bookingTable.currency} = 'GEL' THEN ${bookingTable.totalAmount}::numeric
          WHEN ${bookingTable.currency} = 'USD' THEN ${bookingTable.totalAmount}::numeric * 2.7
          WHEN ${bookingTable.currency} = 'EUR' THEN ${bookingTable.totalAmount}::numeric * 2.9
          ELSE ${bookingTable.totalAmount}::numeric
        END), 0)`,
      })
      .from(bookingTable)
      .where(and(baseWhere, eq(bookingTable.status, "RETURNED"))),
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
//
// When city is provided:
//   - pickups filtered to bookings where pickupLocation.city = city
//   - dropoffs filtered to bookings where dropoffLocation.city = city

export async function getTodayActivity(city?: string, date?: string) {
  // Georgia Standard Time = UTC+4 (no DST).
  // All booking datetimes are stored in UTC as timestamp-without-timezone.
  // The operational "local date" window must start at UTC+4 midnight (= UTC−4h).
  const TZ_OFFSET_MS = 4 * 60 * 60 * 1000;

  let localMidnightUTC: Date;
  if (date) {
    // date is already the Tbilisi local date string "YYYY-MM-DD".
    // Local midnight (Tbilisi) = that date at 00:00+04:00 = date T00:00:00Z minus 4 h.
    localMidnightUTC = new Date(new Date(date + "T00:00:00Z").getTime() - TZ_OFFSET_MS);
  } else {
    // Derive today's Tbilisi date from the current UTC instant.
    // Adding 4 h to the UTC instant gives us a shifted clock whose UTC components
    // match the Tbilisi year/month/day — then subtract 4 h to get the UTC instant
    // of local midnight (handles the 20:00–23:59 UTC edge where UTC date ≠ Tbilisi date).
    const now = new Date();
    const shifted = new Date(now.getTime() + TZ_OFFSET_MS);
    localMidnightUTC = new Date(
      Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - TZ_OFFSET_MS,
    );
  }

  const todayStart = localMidnightUTC;
  const todayEnd = new Date(localMidnightUTC.getTime() + 24 * 60 * 60 * 1000);

  const notDeleted = isNull(bookingTable.deletedAt);

  let pickupCityCondition: ReturnType<typeof inArray> | undefined;
  let dropoffCityCondition: ReturnType<typeof inArray> | undefined;

  if (city) {
    const locIds = await getCityLocationIds(city);
    if (locIds.length > 0) {
      pickupCityCondition = inArray(bookingTable.pickupLocationId, locIds);
      dropoffCityCondition = inArray(bookingTable.dropoffLocationId, locIds);
    } else {
      return { pickups: [], dropoffs: [] };
    }
  }

  function joinedSelect() {
    return db
      .select(bookingRowSelect)
      .from(bookingTable)
      .innerJoin(userTable, eq(bookingTable.userId, userTable.id))
      .leftJoin(vehicleTable, eq(bookingTable.vehicleId, vehicleTable.id))
      .leftJoin(vehicleModelTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
      .leftJoin(bookingModelTable, eq(bookingTable.vehicleModelId, bookingModelTable.id))
      .leftJoin(vehicleBrandTable, eq(vehicleModelTable.brandId, vehicleBrandTable.id))
      .leftJoin(bookingBrandTable, eq(bookingModelTable.brandId, bookingBrandTable.id))
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
          inArray(bookingTable.status, ["PENDING", "CONFIRMED", "DELIVERED", "RETURNED"]),
          notExists(
            db
              .select({ _: bookingHandoverTable.id })
              .from(bookingHandoverTable)
              .where(
                and(
                  eq(bookingHandoverTable.bookingId, bookingTable.id),
                  eq(bookingHandoverTable.handoverType, "PICKUP"),
                ),
              ),
          ),
          ...(pickupCityCondition ? [pickupCityCondition] : []),
        ),
      )
      .orderBy(asc(bookingTable.pickupDatetime)),
    joinedSelect()
      .where(
        and(
          notDeleted,
          gte(bookingTable.dropoffDatetime, todayStart),
          lt(bookingTable.dropoffDatetime, todayEnd),
          inArray(bookingTable.status, ["CONFIRMED", "DELIVERED", "RETURNED"]),
          ...(dropoffCityCondition ? [dropoffCityCondition] : []),
        ),
      )
      .orderBy(asc(bookingTable.dropoffDatetime)),
  ]);

  const pickupsMapped = pickupRows.map(mapToBookingRow);
  const dropoffsMapped = dropoffRows.map(mapToBookingRow);

  const allIds = [
    ...pickupsMapped.map((b) => b.id),
    ...dropoffsMapped.map((b) => b.id),
  ];

  const extrasMap = new Map<number, { name: string; quantity: number | null }[]>();
  if (allIds.length > 0) {
    const extrasRows = await db
      .select({
        bookingId: bookingextraTable.bookingId,
        name: extraTable.name,
        quantity: bookingextraTable.quantity,
      })
      .from(bookingextraTable)
      .innerJoin(extraTable, eq(bookingextraTable.extraId, extraTable.id))
      .where(inArray(bookingextraTable.bookingId, allIds));

    for (const row of extrasRows) {
      const existing = extrasMap.get(row.bookingId) ?? [];
      existing.push({ name: row.name, quantity: row.quantity });
      extrasMap.set(row.bookingId, existing);
    }
  }

  return {
    pickups: pickupsMapped.map((b) => ({ ...b, extras: extrasMap.get(b.id) ?? [] })),
    dropoffs: dropoffsMapped.map((b) => ({ ...b, extras: extrasMap.get(b.id) ?? [] })),
  };
}

// ─── Service: fleet snapshot ───────────────────────────────────────────────────
//
// When city is provided, only counts vehicles whose current locationId
// belongs to a location in that city.

export async function getFleetSnapshot(city?: string) {
  let vehicleIds: number[] | undefined;

  if (city) {
    const locIds = await getCityLocationIds(city);
    if (locIds.length > 0) {
      const rows = await db
        .select({ id: vehicleTable.id })
        .from(vehicleTable)
        .where(inArray(vehicleTable.locationId, locIds));
      vehicleIds = rows.map((r) => r.id);
      if (vehicleIds.length === 0) {
        return { available: 0, rented: 0, maintenance: 0, reserved: 0, inactive: 0 };
      }
    } else {
      return { available: 0, rented: 0, maintenance: 0, reserved: 0, inactive: 0 };
    }
  }

  const where = vehicleIds ? inArray(vehicleTable.id, vehicleIds) : undefined;

  // Per-status counts come from vehicle.status as before, EXCEPT for
  // maintenance — see below. We still read MAINTENANCE rows here only
  // to keep the query shape simple; the value is overwritten.
  const rows = await db
    .select({ status: vehicleTable.status, c: count() })
    .from(vehicleTable)
    .where(where)
    .groupBy(vehicleTable.status);

  const snapshot = { available: 0, rented: 0, maintenance: 0, reserved: 0, inactive: 0 };

  for (const row of rows) {
    switch (row.status) {
      case "AVAILABLE":   snapshot.available = row.c;   break;
      case "RENTED":      snapshot.rented = row.c;      break;
      case "RESERVED":    snapshot.reserved = row.c;    break;
      case "INACTIVE":    snapshot.inactive = row.c;    break;
      // MAINTENANCE intentionally ignored — derived below from
      // active service records, not vehicle.status.
    }
  }

  // Maintenance truth source: distinct vehicles with an active
  // (SCHEDULED or IN_PROGRESS) maintenance_services row. Scoped to
  // vehicleIds when a city filter is in effect.
  const maintenanceWhere = and(
    inArray(maintenanceServicesTable.status, ["SCHEDULED", "IN_PROGRESS"]),
    ...(vehicleIds ? [inArray(maintenanceServicesTable.vehicleId, vehicleIds)] : []),
  );
  const [maintRow] = await db
    .select({
      c: sql<number>`count(distinct ${maintenanceServicesTable.vehicleId})::int`,
    })
    .from(maintenanceServicesTable)
    .where(maintenanceWhere);
  snapshot.maintenance = maintRow?.c ?? 0;

  return snapshot;
}

// ─── Service: fleet calendar ───────────────────────────────────────────────────
//
// Returns vehicles with their bookings for the given date range.
// When city is provided, only vehicles whose current location is in that city.

export async function getFleetCalendar(startDate: Date, endDate: Date, city?: string) {
  let locationFilter = undefined;

  if (city) {
    const locIds = await getCityLocationIds(city);
    if (locIds.length > 0) {
      locationFilter = inArray(vehicleTable.locationId, locIds);
    }
  }

  const vehicles = await db
    .select({
      id: vehicleTable.id,
      licensePlate: vehicleTable.licensePlate,
      status: vehicleTable.status,
      locationId: vehicleTable.locationId,
      modelName: vehicleModelTable.name,
      brandName: brandTable.name,
    })
    .from(vehicleTable)
    .leftJoin(vehicleModelTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .where(locationFilter)
    .orderBy(asc(vehicleTable.id));

  const vehicleIds = vehicles.map((v) => v.id);

  if (vehicleIds.length === 0) {
    return {
      dateFrom: startDate.toISOString().split("T")[0],
      dateTo: endDate.toISOString().split("T")[0],
      vehicles: [],
    };
  }

  const bookings = await db
    .select({
      id: bookingTable.id,
      vehicleId: bookingTable.vehicleId,
      status: bookingTable.status,
      contactFullName: bookingTable.contactFullName,
      pickupDatetime: bookingTable.pickupDatetime,
      dropoffDatetime: bookingTable.dropoffDatetime,
    })
    .from(bookingTable)
    .where(
      and(
        isNull(bookingTable.deletedAt),
        inArray(bookingTable.vehicleId, vehicleIds),
        or(
          and(gte(bookingTable.pickupDatetime, startDate), lte(bookingTable.pickupDatetime, endDate)),
          and(gte(bookingTable.dropoffDatetime, startDate), lte(bookingTable.dropoffDatetime, endDate)),
          and(lte(bookingTable.pickupDatetime, startDate), gte(bookingTable.dropoffDatetime, endDate)),
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

  return {
    dateFrom: startDate.toISOString().split("T")[0],
    dateTo: endDate.toISOString().split("T")[0],
    vehicles: vehicles.map((v) => ({
      vehicleId: v.id,
      licensePlate: v.licensePlate,
      modelName: v.modelName,
      brandName: v.brandName,
      status: v.status,
      bookings: (bookingsByVehicle.get(v.id) ?? []).map((b) => ({
        id: b.id,
        status: b.status,
        customerName: b.contactFullName,
        pickupDatetime: b.pickupDatetime,
        dropoffDatetime: b.dropoffDatetime,
      })),
    })),
  };
}

// ─── Service: website bookings summary ────────────────────────────────────────
//
// Returns count of PENDING and CONFIRMED website-originated bookings plus the
// 5 most recently created, for the CRM Dashboard widget.
// When city is provided, only bookings where pickup OR dropoff location is
// in that city are counted.

export async function getWebsiteBookings(city?: string) {
  const notDeleted = isNull(bookingTable.deletedAt);
  const isWebsite = eq(bookingTable.source, "website");
  const isActive = inArray(bookingTable.status, ["PENDING", "CONFIRMED"]);

  let cityCondition: ReturnType<typeof or> | undefined;
  if (city) {
    const locIds = await getCityLocationIds(city);
    if (locIds.length === 0) {
      return { pendingCount: 0, confirmedCount: 0, recent: [] };
    }
    cityCondition = or(
      inArray(bookingTable.pickupLocationId, locIds),
      inArray(bookingTable.dropoffLocationId, locIds),
    );
  }

  const baseWhere = cityCondition
    ? and(notDeleted, isWebsite, isActive, cityCondition)
    : and(notDeleted, isWebsite, isActive);

  const [pendingRes, confirmedRes, recentRows] = await Promise.all([
    db
      .select({ c: count() })
      .from(bookingTable)
      .where(and(baseWhere, eq(bookingTable.status, "PENDING"))),
    db
      .select({ c: count() })
      .from(bookingTable)
      .where(and(baseWhere, eq(bookingTable.status, "CONFIRMED"))),
    db
      .select(bookingRowSelect)
      .from(bookingTable)
      .innerJoin(userTable, eq(bookingTable.userId, userTable.id))
      .leftJoin(vehicleTable, eq(bookingTable.vehicleId, vehicleTable.id))
      .leftJoin(vehicleModelTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
      .leftJoin(bookingModelTable, eq(bookingTable.vehicleModelId, bookingModelTable.id))
      .leftJoin(vehicleBrandTable, eq(vehicleModelTable.brandId, vehicleBrandTable.id))
      .leftJoin(bookingBrandTable, eq(bookingModelTable.brandId, bookingBrandTable.id))
      .innerJoin(pickupLoc, eq(bookingTable.pickupLocationId, pickupLoc.id))
      .innerJoin(dropoffLoc, eq(bookingTable.dropoffLocationId, dropoffLoc.id))
      .leftJoin(partnerTable, eq(bookingTable.partnerId, partnerTable.id))
      .where(baseWhere)
      .orderBy(desc(bookingTable.createdAt))
      .limit(5),
  ]);

  return {
    pendingCount: pendingRes[0]?.c ?? 0,
    confirmedCount: confirmedRes[0]?.c ?? 0,
    recent: recentRows.map(mapToBookingRow),
  };
}
