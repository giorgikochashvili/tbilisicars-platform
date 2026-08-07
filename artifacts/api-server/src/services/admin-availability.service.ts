/**
 * admin-availability.service.ts
 *
 * Availability Calendar — fleet capacity planning metadata service.
 *
 * READ-ONLY against all operational tables (booking, vehicle, vehicle_model, location).
 * Writes ONLY to: availability_group, availability_group_vehicle_model, audit_logs.
 *
 * R1 — City normalisation: feature-local, never mutates location records.
 * R2 — Timestamp semantics: booking timestamps are UTC instants stored in
 *       TIMESTAMP WITHOUT TIME ZONE. Calendar date labels use Asia/Tbilisi
 *       calendar-day semantics (UTC+4, no DST), converted to UTC for comparison.
 */

import {
  db,
  availabilityGroupTable,
  availabilityGroupVehicleModelTable,
  vehicleTable,
  vehicleModelTable,
  locationTable,
  bookingTable,
} from "@workspace/db";
import {
  and,
  or,
  eq,
  ne,
  inArray,
  isNull,
  isNotNull,
  gt,
  gte,
  lt,
  lte,
  asc,
  sql,
  aliasedTable,
} from "drizzle-orm";
import { logAudit } from "./audit.service.js";

// ─── R1: City canonicalisation ────────────────────────────────────────────────

export const CANONICAL_CITIES = ["Tbilisi", "Kutaisi", "Batumi"] as const;
export type CanonicalCity = (typeof CANONICAL_CITIES)[number];

/**
 * Returns the canonical city string (exact title-case) or null.
 * null = unclassified — must never be guessed into a region.
 */
export function canonicalizeCity(
  raw: string | null | undefined,
): CanonicalCity | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = CANONICAL_CITIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase(),
  );
  return match ?? null;
}

// ─── R2: Asia/Tbilisi day boundaries ─────────────────────────────────────────
// Georgia is UTC+4 year-round (no DST). Hardcoding is safe for the supported
// planning period. Never uses process timezone.

const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000; // 4 hours in ms

export interface DayBounds {
  dayStartUtc: Date; // D 00:00 Asia/Tbilisi as UTC instant
  nextDayStartUtc: Date; // D+1 00:00 Asia/Tbilisi as UTC instant
}

/**
 * Convert a calendar date label ("YYYY-MM-DD" in Asia/Tbilisi timezone) to a
 * UTC half-open interval [dayStartUtc, nextDayStartUtc).
 *
 * Example: "2026-08-18"
 *   → dayStartUtc     = 2026-08-17T20:00:00.000Z  (2026-08-18 00:00 Tbilisi)
 *   → nextDayStartUtc = 2026-08-18T20:00:00.000Z  (2026-08-19 00:00 Tbilisi)
 */
export function tbilisiDayBounds(dateStr: string): DayBounds {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStartUtc = new Date(
    Date.UTC(y, m - 1, d, 0, 0, 0, 0) - TBILISI_OFFSET_MS,
  );
  const nextDayStartUtc = new Date(
    dayStartUtc.getTime() + 24 * 60 * 60 * 1000,
  );
  return { dayStartUtc, nextDayStartUtc };
}

// ─── Date range generation ────────────────────────────────────────────────────

/** Generate an inclusive array of "YYYY-MM-DD" strings from startDate to endDate. */
export function generateDateRange(
  startDate: string,
  endDate: string,
): string[] {
  const dates: string[] = [];
  const { dayStartUtc: cursor } = tbilisiDayBounds(startDate);
  const { dayStartUtc: end } = tbilisiDayBounds(endDate);
  while (cursor <= end) {
    // Convert UTC cursor back to Tbilisi date label
    const tbilisiMs = cursor.getTime() + TBILISI_OFFSET_MS;
    const t = new Date(tbilisiMs);
    const label = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
    dates.push(label);
    cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

// ─── Projection helpers (exported for unit tests) ────────────────────────────

export interface ProjectionBooking {
  id: number;
  vehicleId: number | null;
  vehicleModelId: number | null;
  status: string;
  pickupDatetime: Date;
  dropoffDatetime: Date;
  pickupCity: string | null;
  dropoffCity: string | null;
}

/**
 * True if the vehicle is overdue-blocked: has a DELIVERED booking whose
 * scheduled dropoff is strictly before nowInstant.
 * Overdue vehicles are excluded from supply on all future dates.
 */
export function isOverdueBlocked(
  projBks: ProjectionBooking[],
  nowInstant: Date,
): boolean {
  return projBks.some(
    (b) => b.status === "DELIVERED" && b.dropoffDatetime < nowInstant,
  );
}

/**
 * Compute a vehicle's projected city at the END of calendar day D.
 * baseCity = vehicle.locationId → location.city (NOW baseline).
 * projBks must be sorted chronologically by dropoffDatetime ascending.
 *
 * For each booking whose scheduled dropoff < nextDayStartUtc, shift the
 * projected city to the booking's dropoff city.
 * (If dropoff == nextDayStartUtc the shift belongs to the NEXT day.)
 */
export function computeProjectedCityAtEndOfDay(
  baseCity: string | null,
  projBks: ProjectionBooking[],
  nextDayStartUtc: Date,
): CanonicalCity | null {
  let city = canonicalizeCity(baseCity);
  for (const bk of projBks) {
    if (bk.dropoffDatetime < nextDayStartUtc) {
      city = canonicalizeCity(bk.dropoffCity);
    } else {
      break; // sorted ascending; remaining bookings are later
    }
  }
  return city;
}

/**
 * True if the vehicle is occupied at the END of calendar day D.
 * A booking occupies end-of-day when:
 *   pickup < nextDayStartUtc  AND  dropoff >= nextDayStartUtc
 * (dropoff == nextDayStartUtc still occupies the previous day's EOD.)
 */
export function isOccupiedAtEndOfDay(
  projBks: ProjectionBooking[],
  nextDayStartUtc: Date,
): boolean {
  return projBks.some(
    (b) =>
      b.pickupDatetime < nextDayStartUtc &&
      b.dropoffDatetime >= nextDayStartUtc,
  );
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface EligibleVehicle {
  id: number;
  vehicleModelId: number | null;
  status: string | null;
  city: string | null;
}

interface DayMetrics {
  available: number;
  availableEndOfDay: number;
  occupiedEndOfDay: number;
  bookings: number;
  bookingsOverlappingDay: number;
  pickups: number;
  returns: number;
  pending: number;
  shortage: number;
}

interface GroupRecord {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
  modelIds: number[];
}

// ─── In-memory calendar computation ──────────────────────────────────────────

function emptyMetrics(): DayMetrics {
  return {
    available: 0,
    availableEndOfDay: 0,
    occupiedEndOfDay: 0,
    bookings: 0,
    bookingsOverlappingDay: 0,
    pickups: 0,
    returns: 0,
    pending: 0,
    shortage: 0,
  };
}

/**
 * Compute daily metrics for one (group, city, date) cell.
 */
function computeDayGroupCityMetrics(
  groupVehicles: EligibleVehicle[],
  vehicleProjectionBks: Map<number, ProjectionBooking[]>,
  vehicleDisplayBks: Map<number, ProjectionBooking[]>,
  unassignedByModel: Map<number, ProjectionBooking[]>,
  groupModelIds: number[],
  city: CanonicalCity,
  bounds: DayBounds,
  nowInstant: Date,
): DayMetrics {
  const m = emptyMetrics();
  const { dayStartUtc, nextDayStartUtc } = bounds;

  // ── Assigned vehicle metrics ───────────────────────────────────────────────
  for (const vehicle of groupVehicles) {
    if (vehicle.status === "INACTIVE") continue;

    const projBks = vehicleProjectionBks.get(vehicle.id) ?? [];

    // Overdue-blocked vehicle: excluded from supply everywhere
    if (isOverdueBlocked(projBks, nowInstant)) continue;

    // Projected city at end of day D
    const projectedCity = computeProjectedCityAtEndOfDay(
      vehicle.city,
      projBks,
      nextDayStartUtc,
    );
    if (projectedCity !== city) continue;

    // Exclude MAINTENANCE / RESERVED from supply (still loaded for detail)
    if (vehicle.status === "MAINTENANCE" || vehicle.status === "RESERVED") {
      continue;
    }

    m.availableEndOfDay++; // tentative; subtract if occupied below
    m.occupiedEndOfDay += isOccupiedAtEndOfDay(projBks, nextDayStartUtc)
      ? 1
      : 0;
  }
  // Finalise supply-derived metrics
  m.available = Math.max(0, m.availableEndOfDay - m.occupiedEndOfDay);
  m.availableEndOfDay = m.available; // alias for response clarity
  const supply = m.available + m.occupiedEndOfDay; // total projected in city
  m.shortage = Math.max(0, m.occupiedEndOfDay - supply);

  // ── Display events from Q3b (assigned bookings) ────────────────────────────
  for (const vehicle of groupVehicles) {
    if (vehicle.status === "INACTIVE") continue;
    const dispBks = vehicleDisplayBks.get(vehicle.id) ?? [];
    for (const bk of dispBks) {
      const pkCity = canonicalizeCity(bk.pickupCity);
      const drCity = canonicalizeCity(bk.dropoffCity);

      // Bookings: CONFIRMED overlapping D (pickup city = C)
      if (
        bk.status === "CONFIRMED" &&
        pkCity === city &&
        bk.pickupDatetime < nextDayStartUtc &&
        bk.dropoffDatetime > dayStartUtc
      ) {
        m.bookingsOverlappingDay++;
        m.bookings++;
      }

      // Pending: PENDING overlapping D (pickup city = C)
      if (
        bk.status === "PENDING" &&
        pkCity === city &&
        bk.pickupDatetime < nextDayStartUtc &&
        bk.dropoffDatetime > dayStartUtc
      ) {
        m.pending++;
      }

      // Pickups: pickup on D (pickup city = C)
      if (
        pkCity === city &&
        bk.pickupDatetime >= dayStartUtc &&
        bk.pickupDatetime < nextDayStartUtc
      ) {
        m.pickups++;
      }

      // Returns: dropoff on D (dropoff city = C, any status including RETURNED)
      if (
        drCity === city &&
        bk.dropoffDatetime >= dayStartUtc &&
        bk.dropoffDatetime < nextDayStartUtc
      ) {
        m.returns++;
      }
    }
  }

  // ── Unassigned bookings (Q4-style from display map) ────────────────────────
  for (const modelId of groupModelIds) {
    const unBks = unassignedByModel.get(modelId) ?? [];
    for (const bk of unBks) {
      const pkCity = canonicalizeCity(bk.pickupCity);
      if (pkCity !== city) continue;

      const overlaps =
        bk.pickupDatetime < nextDayStartUtc &&
        bk.dropoffDatetime > dayStartUtc;

      if (bk.status === "CONFIRMED" && overlaps) {
        m.bookingsOverlappingDay++;
        m.bookings++;
      }
      if (bk.status === "PENDING" && overlaps) {
        m.pending++;
      }
      if (bk.pickupDatetime >= dayStartUtc && bk.pickupDatetime < nextDayStartUtc) {
        m.pickups++;
      }
    }
  }

  return m;
}

// ─── Calendar endpoint ────────────────────────────────────────────────────────

export interface CalendarQuery {
  city: string;
  startDate: string;
  endDate: string;
}

export async function getAvailabilityCalendar(query: CalendarQuery) {
  const { city, startDate, endDate } = query;
  const nowInstant = new Date();

  const citiesToCompute: CanonicalCity[] =
    city === "All" ? [...CANONICAL_CITIES] : [city as CanonicalCity];

  // ── Q1: Active groups + model IDs ──────────────────────────────────────────
  const q1Rows = await db
    .select({
      groupId: availabilityGroupTable.id,
      groupName: availabilityGroupTable.name,
      groupSortOrder: availabilityGroupTable.sortOrder,
      vehicleModelId: availabilityGroupVehicleModelTable.vehicleModelId,
    })
    .from(availabilityGroupTable)
    .leftJoin(
      availabilityGroupVehicleModelTable,
      eq(
        availabilityGroupVehicleModelTable.groupId,
        availabilityGroupTable.id,
      ),
    )
    .where(eq(availabilityGroupTable.isActive, true))
    .orderBy(
      asc(availabilityGroupTable.sortOrder),
      asc(availabilityGroupTable.id),
    );

  // Aggregate groups
  const groupMap = new Map<number, GroupRecord>();
  for (const row of q1Rows) {
    if (!groupMap.has(row.groupId)) {
      groupMap.set(row.groupId, {
        id: row.groupId,
        name: row.groupName,
        isActive: true,
        sortOrder: row.groupSortOrder,
        modelIds: [],
      });
    }
    if (row.vehicleModelId != null) {
      groupMap.get(row.groupId)!.modelIds.push(row.vehicleModelId);
    }
  }
  const groups = Array.from(groupMap.values());
  const allModelIds = [...new Set(groups.flatMap((g) => g.modelIds))];

  if (allModelIds.length === 0) {
    const dateRange = { start: startDate, end: endDate };
    return {
      dateRange,
      city,
      unclassifiedVehicleCount: 0,
      groups: [],
      byCity: city === "All" ? { Tbilisi: [], Kutaisi: [], Batumi: [] } : null,
    };
  }

  // ── Q2: Eligible vehicles (non-INACTIVE) with location city ───────────────
  const q2Rows = await db
    .select({
      id: vehicleTable.id,
      vehicleModelId: vehicleTable.vehicleModelId,
      status: vehicleTable.status,
      city: locationTable.city,
    })
    .from(vehicleTable)
    .leftJoin(locationTable, eq(locationTable.id, vehicleTable.locationId))
    .where(
      and(
        inArray(vehicleTable.vehicleModelId, allModelIds),
        or(isNull(vehicleTable.status), ne(vehicleTable.status, "INACTIVE")),
      ),
    );

  // Build vehicle maps
  const vehicleById = new Map<number, EligibleVehicle>();
  const vehiclesByModel = new Map<number, EligibleVehicle[]>();
  let unclassifiedVehicleCount = 0;

  for (const v of q2Rows) {
    vehicleById.set(v.id, v);
    if (v.vehicleModelId != null) {
      if (!vehiclesByModel.has(v.vehicleModelId)) {
        vehiclesByModel.set(v.vehicleModelId, []);
      }
      vehiclesByModel.get(v.vehicleModelId)!.push(v);
    }
    if (
      v.status !== "MAINTENANCE" &&
      v.status !== "RESERVED" &&
      v.status !== "INACTIVE" &&
      canonicalizeCity(v.city) === null
    ) {
      unclassifiedVehicleCount++;
    }
  }

  const allVehicleIds = q2Rows.map((v) => v.id);

  // ── Q3a: Projection bookings (future PENDING/CONFIRMED + all DELIVERED) ────
  const pickupLoc = aliasedTable(locationTable, "pickup_loc");
  const dropoffLoc = aliasedTable(locationTable, "dropoff_loc");

  const projectionBksRaw = allVehicleIds.length > 0
    ? await db
        .select({
          id: bookingTable.id,
          vehicleId: bookingTable.vehicleId,
          vehicleModelId: bookingTable.vehicleModelId,
          status: bookingTable.status,
          pickupDatetime: bookingTable.pickupDatetime,
          dropoffDatetime: bookingTable.dropoffDatetime,
          pickupCity: pickupLoc.city,
          dropoffCity: dropoffLoc.city,
        })
        .from(bookingTable)
        .innerJoin(pickupLoc, eq(pickupLoc.id, bookingTable.pickupLocationId))
        .innerJoin(
          dropoffLoc,
          eq(dropoffLoc.id, bookingTable.dropoffLocationId),
        )
        .where(
          and(
            inArray(bookingTable.vehicleId, allVehicleIds),
            isNull(bookingTable.deletedAt),
            or(
              and(
                inArray(bookingTable.status, ["PENDING", "CONFIRMED"]),
                gt(bookingTable.dropoffDatetime, nowInstant),
              ),
              eq(bookingTable.status, "DELIVERED"),
            ),
          ),
        )
    : [];

  // Build projection map: vehicleId → sorted bookings
  const vehicleProjectionBks = new Map<number, ProjectionBooking[]>();
  for (const bk of projectionBksRaw) {
    if (bk.vehicleId == null) continue;
    if (!vehicleProjectionBks.has(bk.vehicleId)) {
      vehicleProjectionBks.set(bk.vehicleId, []);
    }
    vehicleProjectionBks.get(bk.vehicleId)!.push(bk as ProjectionBooking);
  }
  // Sort each vehicle's projection bookings chronologically by dropoff
  for (const [, bks] of vehicleProjectionBks) {
    bks.sort((a, b) => a.dropoffDatetime.getTime() - b.dropoffDatetime.getTime());
  }

  // ── Q3b: Display bookings within range (PENDING/CONFIRMED/DELIVERED/RETURNED)
  const { dayStartUtc: rangeStart } = tbilisiDayBounds(startDate);
  const { nextDayStartUtc: rangeEnd } = tbilisiDayBounds(endDate);

  const displayBksRaw = allVehicleIds.length > 0
    ? await db
        .select({
          id: bookingTable.id,
          vehicleId: bookingTable.vehicleId,
          vehicleModelId: bookingTable.vehicleModelId,
          status: bookingTable.status,
          pickupDatetime: bookingTable.pickupDatetime,
          dropoffDatetime: bookingTable.dropoffDatetime,
          pickupCity: pickupLoc.city,
          dropoffCity: dropoffLoc.city,
        })
        .from(bookingTable)
        .innerJoin(pickupLoc, eq(pickupLoc.id, bookingTable.pickupLocationId))
        .innerJoin(
          dropoffLoc,
          eq(dropoffLoc.id, bookingTable.dropoffLocationId),
        )
        .where(
          and(
            inArray(bookingTable.vehicleId, allVehicleIds),
            inArray(bookingTable.status, [
              "PENDING",
              "CONFIRMED",
              "DELIVERED",
              "RETURNED",
            ]),
            isNull(bookingTable.deletedAt),
            lt(bookingTable.pickupDatetime, rangeEnd),
            gt(bookingTable.dropoffDatetime, rangeStart),
          ),
        )
    : [];

  // Build display map: vehicleId → bookings
  const vehicleDisplayBks = new Map<number, ProjectionBooking[]>();
  for (const bk of displayBksRaw) {
    if (bk.vehicleId == null) continue;
    if (!vehicleDisplayBks.has(bk.vehicleId)) {
      vehicleDisplayBks.set(bk.vehicleId, []);
    }
    vehicleDisplayBks.get(bk.vehicleId)!.push(bk as ProjectionBooking);
  }

  // ── Q4: Unassigned bookings within range ───────────────────────────────────
  const unassignedBksRaw = await db
    .select({
      id: bookingTable.id,
      vehicleId: bookingTable.vehicleId,
      vehicleModelId: bookingTable.vehicleModelId,
      status: bookingTable.status,
      pickupDatetime: bookingTable.pickupDatetime,
      dropoffDatetime: bookingTable.dropoffDatetime,
      pickupCity: pickupLoc.city,
      dropoffCity: dropoffLoc.city,
    })
    .from(bookingTable)
    .innerJoin(pickupLoc, eq(pickupLoc.id, bookingTable.pickupLocationId))
    .innerJoin(dropoffLoc, eq(dropoffLoc.id, bookingTable.dropoffLocationId))
    .where(
      and(
        isNull(bookingTable.vehicleId),
        isNotNull(bookingTable.vehicleModelId),
        inArray(bookingTable.vehicleModelId!, allModelIds),
        inArray(bookingTable.status, ["PENDING", "CONFIRMED"]),
        isNull(bookingTable.deletedAt),
        lt(bookingTable.pickupDatetime, rangeEnd),
        gt(bookingTable.dropoffDatetime, rangeStart),
      ),
    );

  // Build unassigned map: vehicleModelId → bookings
  const unassignedByModel = new Map<number, ProjectionBooking[]>();
  for (const bk of unassignedBksRaw) {
    if (bk.vehicleModelId == null) continue;
    if (!unassignedByModel.has(bk.vehicleModelId)) {
      unassignedByModel.set(bk.vehicleModelId, []);
    }
    unassignedByModel.get(bk.vehicleModelId)!.push(bk as ProjectionBooking);
  }

  // ── Compute date range ─────────────────────────────────────────────────────
  const dates = generateDateRange(startDate, endDate);

  // ── Build result ───────────────────────────────────────────────────────────
  type GroupResult = GroupRecord & {
    days: Record<string, DayMetrics>;
  };

  const buildGroupResults = (targetCity: CanonicalCity): GroupResult[] => {
    return groups.map((group) => {
      const groupVehicles = group.modelIds.flatMap(
        (mid) => vehiclesByModel.get(mid) ?? [],
      );
      const days: Record<string, DayMetrics> = {};
      for (const dateStr of dates) {
        const bounds = tbilisiDayBounds(dateStr);
        days[dateStr] = computeDayGroupCityMetrics(
          groupVehicles,
          vehicleProjectionBks,
          vehicleDisplayBks,
          unassignedByModel,
          group.modelIds,
          targetCity,
          bounds,
          nowInstant,
        );
      }
      return { ...group, days };
    });
  };

  if (city !== "All") {
    return {
      dateRange: { start: startDate, end: endDate },
      city,
      unclassifiedVehicleCount,
      groups: buildGroupResults(city as CanonicalCity),
      byCity: null,
    };
  }

  // All region: compute each city independently, sum for totals
  const byCityResults: Record<string, GroupResult[]> = {};
  for (const c of CANONICAL_CITIES) {
    byCityResults[c] = buildGroupResults(c);
  }

  // Build combined "All" groups summing across cities
  const allGroups: GroupResult[] = groups.map((group, gi) => {
    const days: Record<string, DayMetrics> = {};
    for (const dateStr of dates) {
      const combined = emptyMetrics();
      for (const c of CANONICAL_CITIES) {
        const cm = byCityResults[c][gi].days[dateStr];
        combined.available += cm.available;
        combined.availableEndOfDay += cm.availableEndOfDay;
        combined.occupiedEndOfDay += cm.occupiedEndOfDay;
        combined.bookings += cm.bookings;
        combined.bookingsOverlappingDay += cm.bookingsOverlappingDay;
        combined.pickups += cm.pickups;
        combined.returns += cm.returns;
        combined.pending += cm.pending;
        combined.shortage += cm.shortage; // sum of regional shortages
      }
      days[dateStr] = combined;
    }
    return { ...group, days };
  });

  return {
    dateRange: { start: startDate, end: endDate },
    city: "All",
    unclassifiedVehicleCount,
    groups: allGroups,
    byCity: byCityResults,
  };
}

// ─── Detail endpoint ──────────────────────────────────────────────────────────

export interface DetailQuery {
  groupId: number;
  city: string;
  date: string;
}

export async function getAvailabilityCellDetail(query: DetailQuery) {
  const { groupId, city, date } = query;
  const canonCity = canonicalizeCity(city);
  const nowInstant = new Date();
  const bounds = tbilisiDayBounds(date);
  const { dayStartUtc, nextDayStartUtc } = bounds;

  // Load group + model IDs
  const groupRow = await db
    .select({
      id: availabilityGroupTable.id,
      name: availabilityGroupTable.name,
      vehicleModelId: availabilityGroupVehicleModelTable.vehicleModelId,
    })
    .from(availabilityGroupTable)
    .leftJoin(
      availabilityGroupVehicleModelTable,
      eq(
        availabilityGroupVehicleModelTable.groupId,
        availabilityGroupTable.id,
      ),
    )
    .where(eq(availabilityGroupTable.id, groupId));

  if (groupRow.length === 0) return null;

  const modelIds = groupRow
    .map((r) => r.vehicleModelId)
    .filter((id): id is number => id != null);

  if (modelIds.length === 0) {
    return {
      groupId,
      city,
      date,
      startOfDay: dayStartUtc.toISOString(),
      endOfDay: nextDayStartUtc.toISOString(),
      supply: 0,
      availableVehicles: [],
      assignedVehicles: [],
      overdueVehicles: [],
      excludedVehicles: [],
      unassignedDemand: 0,
      pendingBookings: [],
      pickups: [],
      returns: [],
    };
  }

  // Load vehicles
  const pickupLoc = aliasedTable(locationTable, "pickup_loc");
  const dropoffLoc = aliasedTable(locationTable, "dropoff_loc");

  const vehicles = await db
    .select({
      id: vehicleTable.id,
      vehicleModelId: vehicleTable.vehicleModelId,
      status: vehicleTable.status,
      city: locationTable.city,
    })
    .from(vehicleTable)
    .leftJoin(locationTable, eq(locationTable.id, vehicleTable.locationId))
    .where(
      and(
        inArray(vehicleTable.vehicleModelId, modelIds),
        or(isNull(vehicleTable.status), ne(vehicleTable.status, "INACTIVE")),
      ),
    );

  const vehicleIds = vehicles.map((v) => v.id);

  // Load projection bookings for these vehicles
  const projBksRaw = vehicleIds.length > 0
    ? await db
        .select({
          id: bookingTable.id,
          vehicleId: bookingTable.vehicleId,
          vehicleModelId: bookingTable.vehicleModelId,
          status: bookingTable.status,
          pickupDatetime: bookingTable.pickupDatetime,
          dropoffDatetime: bookingTable.dropoffDatetime,
          pickupCity: pickupLoc.city,
          dropoffCity: dropoffLoc.city,
        })
        .from(bookingTable)
        .innerJoin(pickupLoc, eq(pickupLoc.id, bookingTable.pickupLocationId))
        .innerJoin(
          dropoffLoc,
          eq(dropoffLoc.id, bookingTable.dropoffLocationId),
        )
        .where(
          and(
            inArray(bookingTable.vehicleId, vehicleIds),
            isNull(bookingTable.deletedAt),
            or(
              and(
                inArray(bookingTable.status, ["PENDING", "CONFIRMED"]),
                gt(bookingTable.dropoffDatetime, nowInstant),
              ),
              eq(bookingTable.status, "DELIVERED"),
            ),
          ),
        )
    : [];

  // Build per-vehicle sorted projection bks
  const vehicleProjBks = new Map<number, ProjectionBooking[]>();
  for (const bk of projBksRaw) {
    if (bk.vehicleId == null) continue;
    if (!vehicleProjBks.has(bk.vehicleId)) vehicleProjBks.set(bk.vehicleId, []);
    vehicleProjBks.get(bk.vehicleId)!.push(bk as ProjectionBooking);
  }
  for (const [, bks] of vehicleProjBks) {
    bks.sort((a, b) => a.dropoffDatetime.getTime() - b.dropoffDatetime.getTime());
  }

  // Load display bookings for this day
  const dispBksRaw = vehicleIds.length > 0
    ? await db
        .select({
          id: bookingTable.id,
          vehicleId: bookingTable.vehicleId,
          vehicleModelId: bookingTable.vehicleModelId,
          status: bookingTable.status,
          pickupDatetime: bookingTable.pickupDatetime,
          dropoffDatetime: bookingTable.dropoffDatetime,
          pickupCity: pickupLoc.city,
          dropoffCity: dropoffLoc.city,
        })
        .from(bookingTable)
        .innerJoin(pickupLoc, eq(pickupLoc.id, bookingTable.pickupLocationId))
        .innerJoin(
          dropoffLoc,
          eq(dropoffLoc.id, bookingTable.dropoffLocationId),
        )
        .where(
          and(
            inArray(bookingTable.vehicleId, vehicleIds),
            inArray(bookingTable.status, [
              "PENDING",
              "CONFIRMED",
              "DELIVERED",
              "RETURNED",
            ]),
            isNull(bookingTable.deletedAt),
            lt(bookingTable.pickupDatetime, nextDayStartUtc),
            gt(bookingTable.dropoffDatetime, dayStartUtc),
          ),
        )
    : [];

  // Unassigned bookings for this day
  const unassignedBks = modelIds.length > 0
    ? await db
        .select({
          id: bookingTable.id,
          vehicleId: bookingTable.vehicleId,
          vehicleModelId: bookingTable.vehicleModelId,
          status: bookingTable.status,
          pickupDatetime: bookingTable.pickupDatetime,
          dropoffDatetime: bookingTable.dropoffDatetime,
          pickupCity: pickupLoc.city,
          dropoffCity: dropoffLoc.city,
        })
        .from(bookingTable)
        .innerJoin(pickupLoc, eq(pickupLoc.id, bookingTable.pickupLocationId))
        .innerJoin(
          dropoffLoc,
          eq(dropoffLoc.id, bookingTable.dropoffLocationId),
        )
        .where(
          and(
            isNull(bookingTable.vehicleId),
            isNotNull(bookingTable.vehicleModelId),
            inArray(bookingTable.vehicleModelId!, modelIds),
            inArray(bookingTable.status, ["PENDING", "CONFIRMED"]),
            isNull(bookingTable.deletedAt),
            lt(bookingTable.pickupDatetime, nextDayStartUtc),
            gt(bookingTable.dropoffDatetime, dayStartUtc),
          ),
        )
    : [];

  // Categorise vehicles
  const availableVehicles: typeof vehicles = [];
  const assignedVehicles: typeof vehicles = [];
  const overdueVehicles: typeof vehicles = [];
  const excludedVehicles: typeof vehicles = [];
  let supply = 0;

  for (const v of vehicles) {
    if (v.status === "INACTIVE") continue;
    const projBks = vehicleProjBks.get(v.id) ?? [];

    if (isOverdueBlocked(projBks, nowInstant)) {
      overdueVehicles.push(v);
      continue;
    }

    if (v.status === "MAINTENANCE" || v.status === "RESERVED") {
      excludedVehicles.push(v);
      continue;
    }

    const projectedCity = computeProjectedCityAtEndOfDay(
      v.city,
      projBks,
      nextDayStartUtc,
    );
    if (projectedCity !== canonCity) continue;

    supply++;
    if (isOccupiedAtEndOfDay(projBks, nextDayStartUtc)) {
      assignedVehicles.push(v);
    } else {
      availableVehicles.push(v);
    }
  }

  const pickupsForDay = dispBksRaw.filter(
    (b) =>
      canonicalizeCity(b.pickupCity) === canonCity &&
      b.pickupDatetime >= dayStartUtc &&
      b.pickupDatetime < nextDayStartUtc,
  );

  const returnsForDay = dispBksRaw.filter(
    (b) =>
      canonicalizeCity(b.dropoffCity) === canonCity &&
      b.dropoffDatetime >= dayStartUtc &&
      b.dropoffDatetime < nextDayStartUtc,
  );

  const pendingBookings = dispBksRaw.filter(
    (b) =>
      b.status === "PENDING" &&
      canonicalizeCity(b.pickupCity) === canonCity,
  );

  const unassignedDemand = unassignedBks.filter(
    (b) =>
      b.status === "CONFIRMED" &&
      canonicalizeCity(b.pickupCity) === canonCity,
  ).length;

  const pendingUnassigned = unassignedBks.filter(
    (b) =>
      b.status === "PENDING" &&
      canonicalizeCity(b.pickupCity) === canonCity,
  );

  return {
    groupId,
    city,
    date,
    startOfDay: dayStartUtc.toISOString(),
    endOfDay: nextDayStartUtc.toISOString(),
    supply,
    availableVehicles: availableVehicles.map((v) => ({
      id: v.id,
      status: v.status,
      city: v.city,
    })),
    assignedVehicles: assignedVehicles.map((v) => ({
      id: v.id,
      status: v.status,
      city: v.city,
    })),
    overdueVehicles: overdueVehicles.map((v) => ({
      id: v.id,
      status: v.status,
      city: v.city,
    })),
    excludedVehicles: excludedVehicles.map((v) => ({
      id: v.id,
      status: v.status,
      city: v.city,
    })),
    unassignedDemand,
    pendingBookings: [...pendingBookings, ...pendingUnassigned].map((b) => ({
      id: b.id,
      vehicleId: b.vehicleId,
      status: b.status,
      pickupDatetime: (b.pickupDatetime as Date).toISOString(),
      dropoffDatetime: (b.dropoffDatetime as Date).toISOString(),
      pickupCity: b.pickupCity,
      dropoffCity: b.dropoffCity,
    })),
    pickups: pickupsForDay.map((b) => ({
      id: b.id,
      vehicleId: b.vehicleId,
      status: b.status,
      pickupDatetime: (b.pickupDatetime as Date).toISOString(),
      dropoffDatetime: (b.dropoffDatetime as Date).toISOString(),
      pickupCity: b.pickupCity,
      dropoffCity: b.dropoffCity,
    })),
    returns: returnsForDay.map((b) => ({
      id: b.id,
      vehicleId: b.vehicleId,
      status: b.status,
      pickupDatetime: (b.pickupDatetime as Date).toISOString(),
      dropoffDatetime: (b.dropoffDatetime as Date).toISOString(),
      pickupCity: b.pickupCity,
      dropoffCity: b.dropoffCity,
    })),
  };
}

// ─── Group CRUD ───────────────────────────────────────────────────────────────

export async function listAvailabilityGroups() {
  const rows = await db
    .select({
      groupId: availabilityGroupTable.id,
      groupName: availabilityGroupTable.name,
      groupIsActive: availabilityGroupTable.isActive,
      groupSortOrder: availabilityGroupTable.sortOrder,
      groupCreatedAt: availabilityGroupTable.createdAt,
      groupUpdatedAt: availabilityGroupTable.updatedAt,
      vehicleModelId: availabilityGroupVehicleModelTable.vehicleModelId,
    })
    .from(availabilityGroupTable)
    .leftJoin(
      availabilityGroupVehicleModelTable,
      eq(
        availabilityGroupVehicleModelTable.groupId,
        availabilityGroupTable.id,
      ),
    )
    .orderBy(
      asc(availabilityGroupTable.sortOrder),
      asc(availabilityGroupTable.id),
    );

  const map = new Map<
    number,
    { id: number; name: string; isActive: boolean; sortOrder: number; createdAt: Date; updatedAt: Date; modelIds: number[] }
  >();
  for (const row of rows) {
    if (!map.has(row.groupId)) {
      map.set(row.groupId, {
        id: row.groupId,
        name: row.groupName,
        isActive: row.groupIsActive,
        sortOrder: row.groupSortOrder,
        createdAt: row.groupCreatedAt,
        updatedAt: row.groupUpdatedAt,
        modelIds: [],
      });
    }
    if (row.vehicleModelId != null) {
      map.get(row.groupId)!.modelIds.push(row.vehicleModelId);
    }
  }
  return Array.from(map.values());
}

export async function getAvailabilityGroup(id: number) {
  const rows = await db
    .select({
      groupId: availabilityGroupTable.id,
      groupName: availabilityGroupTable.name,
      groupIsActive: availabilityGroupTable.isActive,
      groupSortOrder: availabilityGroupTable.sortOrder,
      groupCreatedAt: availabilityGroupTable.createdAt,
      groupUpdatedAt: availabilityGroupTable.updatedAt,
      vehicleModelId: availabilityGroupVehicleModelTable.vehicleModelId,
    })
    .from(availabilityGroupTable)
    .leftJoin(
      availabilityGroupVehicleModelTable,
      eq(
        availabilityGroupVehicleModelTable.groupId,
        availabilityGroupTable.id,
      ),
    )
    .where(eq(availabilityGroupTable.id, id));

  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    id: first.groupId,
    name: first.groupName,
    isActive: first.groupIsActive,
    sortOrder: first.groupSortOrder,
    createdAt: first.groupCreatedAt,
    updatedAt: first.groupUpdatedAt,
    modelIds: rows
      .map((r) => r.vehicleModelId)
      .filter((id): id is number => id != null),
  };
}

export async function createAvailabilityGroup(
  data: { name: string; sortOrder?: number },
  actorId: number | null,
) {
  const [inserted] = await db
    .insert(availabilityGroupTable)
    .values({
      name: data.name.trim(),
      sortOrder: data.sortOrder ?? 0,
      isActive: true,
    })
    .returning();

  logAudit({
    actorId,
    entityType: "availability_group",
    entityId: inserted.id,
    action: "CREATE",
    summary: `Created availability group "${inserted.name}" id=${inserted.id}`,
  });

  return { ...inserted, modelIds: [] };
}

export async function updateAvailabilityGroup(
  id: number,
  data: { name?: string; isActive?: boolean; sortOrder?: number },
  actorId: number | null,
) {
  const existing = await getAvailabilityGroup(id);
  if (!existing) return null;

  const updateValues: Partial<typeof availabilityGroupTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.name !== undefined) updateValues.name = data.name.trim();
  if (data.isActive !== undefined) updateValues.isActive = data.isActive;
  if (data.sortOrder !== undefined) updateValues.sortOrder = data.sortOrder;

  const [updated] = await db
    .update(availabilityGroupTable)
    .set(updateValues)
    .where(eq(availabilityGroupTable.id, id))
    .returning();

  // Determine audit action
  const action =
    data.isActive !== undefined &&
    Object.keys(data).filter((k) => k !== "isActive").length === 0
      ? "TOGGLE_ACTIVE"
      : "UPDATE";

  logAudit({
    actorId,
    entityType: "availability_group",
    entityId: id,
    action,
    summary: `${action === "TOGGLE_ACTIVE" ? "Toggled active=" + data.isActive : "Updated"} availability group id=${id}`,
    beforeData: { name: existing.name, isActive: existing.isActive, sortOrder: existing.sortOrder },
    afterData: { name: updated.name, isActive: updated.isActive, sortOrder: updated.sortOrder },
  });

  return updated;
}

export async function deleteAvailabilityGroup(
  id: number,
  actorId: number | null,
) {
  const existing = await getAvailabilityGroup(id);
  if (!existing) return false;

  await db
    .delete(availabilityGroupTable)
    .where(eq(availabilityGroupTable.id, id));

  logAudit({
    actorId,
    entityType: "availability_group",
    entityId: id,
    action: "DELETE",
    summary: `Deleted availability group "${existing.name}" id=${id}`,
    beforeData: { name: existing.name, isActive: existing.isActive },
  });

  return true;
}

// ─── Atomic move-model ────────────────────────────────────────────────────────

export interface MoveModelResult {
  moved: boolean;
  reason?: string;
  fromGroupId?: number | null;
  toGroupId?: number;
}

export async function moveModel(
  vehicleModelId: number,
  targetGroupId: number,
  actorId: number | null,
): Promise<MoveModelResult> {
  const result = await db.transaction(async (tx) => {
    // 1. Validate target group exists
    const [targetGroup] = await tx
      .select({ id: availabilityGroupTable.id, name: availabilityGroupTable.name })
      .from(availabilityGroupTable)
      .where(eq(availabilityGroupTable.id, targetGroupId));

    if (!targetGroup) {
      throw Object.assign(new Error("Target group not found"), {
        code: "NOT_FOUND",
      });
    }

    // 2. Find current owner
    const [currentMembership] = await tx
      .select({
        groupId: availabilityGroupVehicleModelTable.groupId,
      })
      .from(availabilityGroupVehicleModelTable)
      .where(
        eq(availabilityGroupVehicleModelTable.vehicleModelId, vehicleModelId),
      );

    const currentGroupId = currentMembership?.groupId ?? null;

    // 3. Already in target — idempotent
    if (currentGroupId === targetGroupId) {
      return { moved: false, reason: "already_in_target" } as MoveModelResult;
    }

    // 4. Remove from current group if present
    if (currentGroupId != null) {
      await tx
        .delete(availabilityGroupVehicleModelTable)
        .where(
          eq(
            availabilityGroupVehicleModelTable.vehicleModelId,
            vehicleModelId,
          ),
        );
    }

    // 5. Insert into target group
    await tx.insert(availabilityGroupVehicleModelTable).values({
      groupId: targetGroupId,
      vehicleModelId,
    });

    return {
      moved: true,
      fromGroupId: currentGroupId,
      toGroupId: targetGroupId,
    } as MoveModelResult;
  });

  // 7. Log audit after successful commit
  if (result.moved) {
    logAudit({
      actorId,
      entityType: "availability_group_vehicle_model",
      entityId: vehicleModelId,
      action: "MOVE_MODEL",
      summary: `Moved vehicleModelId=${vehicleModelId} from groupId=${result.fromGroupId ?? "none"} to groupId=${targetGroupId}`,
      beforeData: { groupId: result.fromGroupId },
      afterData: { groupId: targetGroupId },
    });
  }

  return result;
}
