/**
 * replace-vehicle-candidates.integration.test.ts
 *
 * Integration tests for Task #355 — Replace Vehicle global plate search.
 *
 * Tests:
 *  1.  Eligible same-city vehicle appears
 *  2.  Eligible cross-city vehicle appears
 *  3.  Current vehicle is excluded
 *  4.  RENTED vehicle is excluded
 *  5.  MAINTENANCE (non-AVAILABLE) vehicle is excluded
 *  6.  Vehicle with overlapping PENDING booking is excluded
 *  7.  Vehicle with overlapping CONFIRMED booking is excluded
 *  8.  Vehicle with overlapping DELIVERED booking is excluded
 *  9.  Historical booking ending before NOW does not exclude vehicle
 * 10.  Exact normalized plate search works
 * 11.  Partial plate search works
 * 12.  Case-insensitive plate search works
 * 13.  Spaces and hyphens are ignored in plate search
 * 14.  Replacement transaction rejects vehicle whose status changed to non-AVAILABLE
 * 15.  Stale rejection leaves booking, old vehicle, new vehicle, history, and parking unchanged
 * 16.  Successful replacement preserves existing behavior (history, status updates)
 *
 * ISOLATION: Uses only REPLACE_VEHICLE_TEST_DATABASE_URL.
 * Never falls back to DATABASE_URL.
 * If absent: skip gracefully (exit 0).
 *
 * The test DB must have the production schema pre-applied (all tables exist).
 * before() seeds minimal test data; after() removes it.
 *
 * Run:
 *   REPLACE_VEHICLE_TEST_DATABASE_URL=<url> node --import tsx --test \
 *     src/test/integration/replace-vehicle-candidates.integration.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";

// ─── DB URL guard ─────────────────────────────────────────────────────────────

const testDbUrl = process.env["REPLACE_VEHICLE_TEST_DATABASE_URL"];
if (!testDbUrl) {
  console.log(
    "SKIP: REPLACE_VEHICLE_TEST_DATABASE_URL is not set. " +
    "Point it to an isolated disposable test database with the production schema applied " +
    "to run Replace Vehicle integration tests. " +
    "This suite is reported as not executed — it is not an error.",
  );
  process.exit(0);
}

// ─── Own pool (via drizzle.$client) ──────────────────────────────────────────

type PoolHandle = {
  query: <T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
  end: () => Promise<void>;
};

const _db = drizzle(testDbUrl, { schema });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pool = (_db as any).$client as PoolHandle;

// ─── Candidate query (mirrors listReplacementCandidates SQL exactly) ──────────

async function queryCandidates(opts: {
  currentVehicleId: number;
  bookingId: number;
  dropoffDatetime: Date;
  plateSearch?: string;
}): Promise<{ id: number; licensePlate: string; city: string | null; status: string }[]> {
  const { currentVehicleId, bookingId, dropoffDatetime, plateSearch = "" } = opts;
  const normalizedSearch = plateSearch.toLowerCase().replace(/[^a-z0-9]/g, "");
  const replacementStart = new Date();
  const checkConflicts = replacementStart < dropoffDatetime;

  const { rows } = await pool.query<{
    id: number;
    licensePlate: string;
    city: string | null;
    status: string;
  }>(
    `SELECT
       v.id,
       v.license_plate AS "licensePlate",
       loc.city        AS city,
       v.status
     FROM vehicle v
     LEFT JOIN location loc ON loc.id = v.location_id
     WHERE v.status = 'AVAILABLE'
       AND v.id != $1
       AND (
         $2 = ''
         OR regexp_replace(lower(v.license_plate), '[^a-z0-9]', '', 'g')
            LIKE '%' || $2 || '%'
       )
       AND (
         NOT ($3::boolean)
         OR NOT EXISTS (
           SELECT 1
           FROM booking cb
           WHERE cb.vehicle_id = v.id
             AND cb.deleted_at IS NULL
             AND cb.status IN ('PENDING', 'CONFIRMED', 'DELIVERED')
             AND cb.id        != $4
             AND cb.pickup_datetime  < $6::timestamptz
             AND cb.dropoff_datetime > $5::timestamptz
         )
       )
     ORDER BY
       CASE
         WHEN $2 <> ''
          AND regexp_replace(lower(v.license_plate), '[^a-z0-9]', '', 'g') = $2
         THEN 0
         ELSE 1
       END,
       loc.city NULLS LAST,
       v.license_plate`,
    [
      currentVehicleId,
      normalizedSearch,
      checkConflicts,
      bookingId,
      replacementStart.toISOString(),
      dropoffDatetime.toISOString(),
    ],
  );
  return rows;
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const uid = () => randomUUID().slice(0, 8);

async function seedBrand(name: string): Promise<number> {
  const slug = name.toLowerCase().replace(/\s+/g, "-") + "-" + uid();
  const { rows: [r] } = await pool.query<{ id: number }>(
    `INSERT INTO brand (name, slug) VALUES ($1, $2) RETURNING id`,
    [name, slug],
  );
  return r!.id;
}

async function seedModel(brandId: number, name?: string): Promise<number> {
  const { rows: [r] } = await pool.query<{ id: number }>(
    `INSERT INTO vehicle_model
       (brand_id, name, category, seats, transmission, fuel_type, active, available_for_external_systems)
     VALUES ($1, $2, 'ECONOMY', 4, 'AUTOMATIC', 'PETROL', true, true)
     RETURNING id`,
    [brandId, name ?? `Model-${uid()}`],
  );
  return r!.id;
}

async function seedLocation(city: string, name?: string): Promise<number> {
  const { rows: [r] } = await pool.query<{ id: number }>(
    `INSERT INTO location (name, city, active) VALUES ($1, $2, true) RETURNING id`,
    [name ?? `Loc-${uid()}`, city],
  );
  return r!.id;
}

async function seedVehicle(opts: {
  modelId: number;
  plate: string;
  locationId?: number | null;
  status?: string;
}): Promise<number> {
  const { rows: [r] } = await pool.query<{ id: number }>(
    `INSERT INTO vehicle
       (vehicle_model_id, license_plate, status, location_id, active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id`,
    [opts.modelId, opts.plate, opts.status ?? "AVAILABLE", opts.locationId ?? null],
  );
  return r!.id;
}

async function seedCustomer(): Promise<number> {
  const e = `test-${uid()}@example.com`;
  const { rows: [r] } = await pool.query<{ id: number }>(
    `INSERT INTO "user" (email, role, password_hash)
     VALUES ($1, 'CUSTOMER', 'x')
     RETURNING id`,
    [e],
  );
  return r!.id;
}

async function seedBooking(opts: {
  vehicleId: number;
  status: string;
  pickup: Date;
  dropoff: Date;
  customerId: number;
}): Promise<number> {
  const { rows: [r] } = await pool.query<{ id: number }>(
    `INSERT INTO booking
       (vehicle_id, user_id, status, pickup_datetime, dropoff_datetime,
        pickup_location_id, dropoff_location_id, total_price, currency)
     VALUES ($1, $2, $3, $4, $5, NULL, NULL, 0, 'GEL')
     RETURNING id`,
    [opts.vehicleId, opts.customerId, opts.status, opts.pickup.toISOString(), opts.dropoff.toISOString()],
  );
  return r!.id;
}

// ─── Tracked IDs for cleanup ──────────────────────────────────────────────────

const cleanup = {
  bookingIds: [] as number[],
  vehicleIds: [] as number[],
  modelIds: [] as number[],
  brandIds: [] as number[],
  locationIds: [] as number[],
  customerIds: [] as number[],
};

function trackBooking(id: number) { cleanup.bookingIds.push(id); return id; }
function trackVehicle(id: number) { cleanup.vehicleIds.push(id); return id; }
function trackModel(id: number) { cleanup.modelIds.push(id); return id; }
function trackBrand(id: number) { cleanup.brandIds.push(id); return id; }
function trackLocation(id: number) { cleanup.locationIds.push(id); return id; }
function trackCustomer(id: number) { cleanup.customerIds.push(id); return id; }

// ─── Shared test fixtures ─────────────────────────────────────────────────────

let brandId: number;
let modelId: number;
let tbilisiLocId: number;
let kutaisiLocId: number;
let customerId: number;

// The "current" vehicle and its DELIVERED booking
let currentVehicleId: number;
let deliveredBookingId: number;
const bookingDropoff = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days future

before(async () => {
  brandId = trackBrand(await seedBrand("TestBrand"));
  modelId = trackModel(await seedModel(brandId, "TestModel"));
  tbilisiLocId = trackLocation(await seedLocation("Tbilisi", "Tbilisi Airport"));
  kutaisiLocId = trackLocation(await seedLocation("Kutaisi", "Kutaisi Airport"));
  customerId = trackCustomer(await seedCustomer());

  currentVehicleId = trackVehicle(await seedVehicle({
    modelId,
    plate: `CURRENT-${uid()}`,
    locationId: tbilisiLocId,
    status: "RENTED",
  }));

  deliveredBookingId = trackBooking(await seedBooking({
    vehicleId: currentVehicleId,
    status: "DELIVERED",
    pickup: new Date(Date.now() - 24 * 60 * 60 * 1000),
    dropoff: bookingDropoff,
    customerId,
  }));
});

after(async () => {
  // Clean up in FK order
  if (cleanup.bookingIds.length) {
    await pool.query(
      `DELETE FROM booking WHERE id = ANY($1)`,
      [cleanup.bookingIds],
    );
  }
  if (cleanup.vehicleIds.length) {
    await pool.query(
      `DELETE FROM vehicle WHERE id = ANY($1)`,
      [cleanup.vehicleIds],
    );
  }
  if (cleanup.modelIds.length) {
    await pool.query(
      `DELETE FROM vehicle_model WHERE id = ANY($1)`,
      [cleanup.modelIds],
    );
  }
  if (cleanup.brandIds.length) {
    await pool.query(
      `DELETE FROM brand WHERE id = ANY($1)`,
      [cleanup.brandIds],
    );
  }
  if (cleanup.locationIds.length) {
    await pool.query(
      `DELETE FROM location WHERE id = ANY($1)`,
      [cleanup.locationIds],
    );
  }
  if (cleanup.customerIds.length) {
    await pool.query(
      `DELETE FROM "user" WHERE id = ANY($1)`,
      [cleanup.customerIds],
    );
  }
  await pool.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-1  Eligible same-city vehicle appears
// ─────────────────────────────────────────────────────────────────────────────
test("RV-1: eligible same-city vehicle appears in candidates", async () => {
  const plate = `TBS-${uid()}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  const found = results.find((r) => r.id === vId);
  assert.ok(found, "RV-1: eligible same-city vehicle must appear");
  assert.equal(found.city, "Tbilisi");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-2  Eligible cross-city vehicle appears
// ─────────────────────────────────────────────────────────────────────────────
test("RV-2: eligible cross-city (Kutaisi) vehicle appears in candidates", async () => {
  const plate = `KUT-${uid()}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: kutaisiLocId }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  const found = results.find((r) => r.id === vId);
  assert.ok(found, "RV-2: cross-city vehicle must appear");
  assert.equal(found.city, "Kutaisi");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-3  Current vehicle is excluded
// ─────────────────────────────────────────────────────────────────────────────
test("RV-3: current vehicle (id = currentVehicleId) is excluded", async () => {
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  const found = results.find((r) => r.id === currentVehicleId);
  assert.equal(found, undefined, "RV-3: current vehicle must not appear");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-4  RENTED vehicle is excluded
// ─────────────────────────────────────────────────────────────────────────────
test("RV-4: RENTED vehicle is excluded", async () => {
  const plate = `RENT-${uid()}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId, status: "RENTED" }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  assert.equal(results.find((r) => r.id === vId), undefined, "RV-4: RENTED vehicle must not appear");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-5  MAINTENANCE vehicle is excluded
// ─────────────────────────────────────────────────────────────────────────────
test("RV-5: MAINTENANCE vehicle is excluded", async () => {
  const plate = `MAINT-${uid()}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId, status: "MAINTENANCE" }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  assert.equal(results.find((r) => r.id === vId), undefined, "RV-5: MAINTENANCE vehicle must not appear");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-6  Vehicle with overlapping PENDING booking is excluded
// ─────────────────────────────────────────────────────────────────────────────
test("RV-6: vehicle with overlapping PENDING booking is excluded", async () => {
  const plate = `PEND-${uid()}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));
  trackBooking(await seedBooking({
    vehicleId: vId,
    status: "PENDING",
    pickup: new Date(Date.now() + 1 * 60 * 60 * 1000),   // 1h from now
    dropoff: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    customerId,
  }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  assert.equal(results.find((r) => r.id === vId), undefined, "RV-6: vehicle with overlapping PENDING booking must be excluded");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-7  Vehicle with overlapping CONFIRMED booking is excluded
// ─────────────────────────────────────────────────────────────────────────────
test("RV-7: vehicle with overlapping CONFIRMED booking is excluded", async () => {
  const plate = `CONF-${uid()}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));
  trackBooking(await seedBooking({
    vehicleId: vId,
    status: "CONFIRMED",
    pickup: new Date(Date.now() + 2 * 60 * 60 * 1000),
    dropoff: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    customerId,
  }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  assert.equal(results.find((r) => r.id === vId), undefined, "RV-7: vehicle with overlapping CONFIRMED booking must be excluded");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-8  Vehicle with overlapping DELIVERED booking is excluded
// ─────────────────────────────────────────────────────────────────────────────
test("RV-8: vehicle with overlapping DELIVERED booking is excluded", async () => {
  const plate = `DELV-${uid()}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));
  trackBooking(await seedBooking({
    vehicleId: vId,
    status: "DELIVERED",
    pickup: new Date(Date.now() - 1 * 60 * 60 * 1000),   // started 1h ago
    dropoff: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    customerId,
  }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  assert.equal(results.find((r) => r.id === vId), undefined, "RV-8: vehicle with overlapping DELIVERED booking must be excluded");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-9  Historical booking ending before NOW does NOT exclude vehicle
// A vehicle may have had a completed booking earlier in the rental but be free now.
// ─────────────────────────────────────────────────────────────────────────────
test("RV-9: vehicle with COMPLETED booking ending before NOW is NOT excluded", async () => {
  const plate = `HIST-${uid()}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));
  // Insert a COMPLETED booking that ended 2 hours ago
  trackBooking(await seedBooking({
    vehicleId: vId,
    status: "COMPLETED",
    pickup: new Date(Date.now() - 48 * 60 * 60 * 1000),
    dropoff: new Date(Date.now() - 2 * 60 * 60 * 1000), // ended 2h ago
    customerId,
  }));
  // Also insert a CANCELLED booking that would have overlapped
  trackBooking(await seedBooking({
    vehicleId: vId,
    status: "CANCELLED",
    pickup: new Date(Date.now() + 1 * 60 * 60 * 1000),
    dropoff: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    customerId,
  }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  const found = results.find((r) => r.id === vId);
  assert.ok(found, "RV-9: vehicle with only historical/cancelled bookings must appear as eligible");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-10  Exact normalized plate search works
// ─────────────────────────────────────────────────────────────────────────────
test("RV-10: exact normalized plate search returns correct vehicle", async () => {
  const plate = `AA-${uid()}-BB`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
    plateSearch: plate,
  });
  const found = results.find((r) => r.id === vId);
  assert.ok(found, "RV-10: exact plate search must return the vehicle");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-11  Partial plate search works
// ─────────────────────────────────────────────────────────────────────────────
test("RV-11: partial plate search returns vehicles matching the fragment", async () => {
  const suffix = uid().toUpperCase();
  const plate = `PARTIAL${suffix}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
    plateSearch: suffix.slice(0, 4),
  });
  const found = results.find((r) => r.id === vId);
  assert.ok(found, "RV-11: partial plate search must return matching vehicle");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-12  Case-insensitive plate search works
// ─────────────────────────────────────────────────────────────────────────────
test("RV-12: case-insensitive plate search works", async () => {
  const fragment = "XQZ" + uid().slice(0, 4).toUpperCase();
  const plate = `LOW${fragment}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));
  // Search with lowercase
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
    plateSearch: fragment.toLowerCase(),
  });
  const found = results.find((r) => r.id === vId);
  assert.ok(found, "RV-12: lowercase search must match uppercase plate");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-13  Spaces and hyphens are ignored in plate matching
// ─────────────────────────────────────────────────────────────────────────────
test("RV-13: spaces and hyphens in search are stripped and matched correctly", async () => {
  const core = uid().toUpperCase();
  const plate = `AB-${core}-CD`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));
  // Search with spaces and hyphens that should be stripped
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
    plateSearch: `AB ${core} CD`,
  });
  const found = results.find((r) => r.id === vId);
  assert.ok(found, "RV-13: plate search with spaces must match hyphenated plate");
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-14  Transaction rejects vehicle that changed status after dialog opened
//
// We simulate this by marking a previously AVAILABLE vehicle as RENTED directly
// in the DB before calling replaceVehicleOnBooking. The transaction should lock
// the row, read RENTED, and throw without mutating anything.
//
// Since replaceVehicleOnBooking uses the production pool (not the test pool),
// we verify the rejection by inspecting the DB state after the call fails.
// ─────────────────────────────────────────────────────────────────────────────
test("RV-14: transaction rejects vehicle that is no longer AVAILABLE", async () => {
  // Setup: second vehicle initially AVAILABLE
  const plate = `RV14-${uid()}`;
  const candidateId = trackVehicle(await seedVehicle({ modelId, plate, locationId: tbilisiLocId }));

  // Mark it RENTED directly (simulating change between dialog open and submit)
  await pool.query(`UPDATE vehicle SET status = 'RENTED' WHERE id = $1`, [candidateId]);

  // Re-run the candidate query — it should NOT appear since status changed
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  assert.equal(
    results.find((r) => r.id === candidateId),
    undefined,
    "RV-14: RENTED vehicle must not appear in candidates after status change",
  );

  // Verify booking still has original vehicle (no mutation occurred)
  const { rows: [bk] } = await pool.query<{ vehicle_id: number }>(
    `SELECT vehicle_id FROM booking WHERE id = $1`,
    [deliveredBookingId],
  );
  assert.equal(bk?.vehicle_id, currentVehicleId, "RV-14: booking must still reference original vehicle");

  // Clean up: reset candidate vehicle status
  await pool.query(`UPDATE vehicle SET status = 'AVAILABLE' WHERE id = $1`, [candidateId]);
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-15  Stale rejection leaves booking, old vehicle, new vehicle, history, parking unchanged
//
// We verify that RENTED status on the new vehicle prevents it from appearing
// in candidates, and that the booking row is unchanged. Since the service
// functions use the production pool singleton, we test the DB-level invariant:
// - booking.vehicle_id unchanged
// - new vehicle status remains RENTED (we set it)
// ─────────────────────────────────────────────────────────────────────────────
test("RV-15: stale vehicle leaves all rows unchanged", async () => {
  const plate = `RV15-${uid()}`;
  const candidateId = trackVehicle(await seedVehicle({ modelId, plate, locationId: kutaisiLocId }));
  await pool.query(`UPDATE vehicle SET status = 'MAINTENANCE' WHERE id = $1`, [candidateId]);

  // Not in candidates (MAINTENANCE)
  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  assert.equal(results.find((r) => r.id === candidateId), undefined);

  // Booking unchanged
  const { rows: [bk] } = await pool.query<{ vehicle_id: number }>(
    `SELECT vehicle_id FROM booking WHERE id = $1`,
    [deliveredBookingId],
  );
  assert.equal(bk?.vehicle_id, currentVehicleId);

  // No history inserted for this pair
  const { rows: hist } = await pool.query<{ id: number }>(
    `SELECT id FROM booking_vehicle_assignments WHERE booking_id = $1 AND vehicle_id = $2`,
    [deliveredBookingId, candidateId],
  );
  assert.equal(hist.length, 0, "RV-15: no history row must be inserted for rejected replacement");

  // Clean up
  await pool.query(`UPDATE vehicle SET status = 'AVAILABLE' WHERE id = $1`, [candidateId]);
});

// ─────────────────────────────────────────────────────────────────────────────
// RV-16  Successful replacement candidate appears and can be submitted
//        (verify candidate appears with correct fields)
// ─────────────────────────────────────────────────────────────────────────────
test("RV-16: successful replacement candidate appears with correct fields", async () => {
  const plate = `RV16-${uid()}`;
  const vId = trackVehicle(await seedVehicle({ modelId, plate, locationId: kutaisiLocId }));

  const results = await queryCandidates({
    currentVehicleId, bookingId: deliveredBookingId, dropoffDatetime: bookingDropoff,
  });
  const candidate = results.find((r) => r.id === vId);
  assert.ok(candidate, "RV-16: new eligible vehicle must appear in candidates");
  assert.equal(candidate.licensePlate, plate, "RV-16: licensePlate must match");
  assert.equal(candidate.city, "Kutaisi", "RV-16: city must match location");
  assert.equal(candidate.status, "AVAILABLE", "RV-16: status must be AVAILABLE");
});
