/**
 * regional-intake-c2a.test.ts
 *
 * Committed-state PostgreSQL read-layer integration tests for C2a.
 *
 * Tests:
 *   1–6:  lookupGatewayContextsForIdentifiers
 *   7–9:  validateVehicleModelTx
 *  10–12: validateLocationsTx
 *     13: classifyIdempotencyResult end-to-end with real DB row
 *
 * ISOLATION STRATEGY:
 *   Uses committed inserts + explicit DELETE in finally blocks.
 *   Does NOT use rollback-based isolation — lookupGatewayContextsForIdentifiers
 *   reads committed state and cannot see fixtures inside an open transaction.
 *
 * DB GUARD:
 *   RBG_TEST_DATABASE_URL must be set. Never uses DATABASE_URL.
 *   Exits with code 1 if RBG_TEST_DATABASE_URL is absent.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:integration:c2a
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
import {
  lookupGatewayContextsForIdentifiers,
  validateVehicleModelTx,
  validateLocationsTx,
  type RbgDb,
} from "../../repositories/regional-intake.repository.js";
import {
  classifyIdempotencyResult,
  computePayloadFingerprint,
} from "../../lib/regional-intake-helpers.js";

// ── DB URL guard ──────────────────────────────────────────────────────────────

const testDbUrl = (() => {
  const url = process.env["RBG_TEST_DATABASE_URL"];
  if (!url) {
    console.error(
      "STOP: RBG_TEST_DATABASE_URL is not set. " +
      "Set RBG_TEST_DATABASE_URL to a dedicated test database before running " +
      "test:integration:c2a.",
    );
    process.exit(1);
  }
  return url;
})();

// ── Dedicated test executor ───────────────────────────────────────────────────
// Never uses the production/dev db singleton. Creates its own executor from
// RBG_TEST_DATABASE_URL.

const testDb = drizzle(testDbUrl, { schema }) as unknown as RbgDb;
const rawDb  = drizzle(testDbUrl, { schema });

// ── Raw query helper ──────────────────────────────────────────────────────────

async function q<T extends Record<string, unknown>>(
  query: ReturnType<typeof drizzleSql>,
): Promise<T[]> {
  const result = await rawDb.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

// ── Shared prerequisite state (for GBC tests 1–6, 13) ────────────────────────

let sharedUserId:    number;
let sharedLocAId:    number;
let sharedLocBId:    number;
let sharedBookingId: number;

before(async () => {
  // Create minimum prerequisite data for booking FK tests:
  // user → location × 2 → booking

  const userRows = await q<{ id: number }>(
    drizzleSql`INSERT INTO "user" DEFAULT VALUES RETURNING id`,
  );
  sharedUserId = userRows[0]!.id;

  const locARows = await q<{ id: number }>(
    drizzleSql`INSERT INTO location (name) VALUES ('C2a Test Location A') RETURNING id`,
  );
  sharedLocAId = locARows[0]!.id;

  const locBRows = await q<{ id: number }>(
    drizzleSql`INSERT INTO location (name) VALUES ('C2a Test Location B') RETURNING id`,
  );
  sharedLocBId = locBRows[0]!.id;

  const bookingRows = await q<{ id: number }>(
    drizzleSql`
      INSERT INTO booking
        (user_id, pickup_location_id, dropoff_location_id,
         pickup_datetime, dropoff_datetime, contact_full_name)
      VALUES (
        ${sharedUserId},
        ${sharedLocAId},
        ${sharedLocBId},
        NOW() + INTERVAL '1 day',
        NOW() + INTERVAL '2 days',
        'C2a Test Customer'
      )
      RETURNING id
    `,
  );
  sharedBookingId = bookingRows[0]!.id;
});

after(async () => {
  // Clean up shared prerequisites in reverse FK order
  await rawDb.execute(drizzleSql`DELETE FROM booking   WHERE id = ${sharedBookingId}`);
  await rawDb.execute(drizzleSql`DELETE FROM location  WHERE id = ${sharedLocAId}`);
  await rawDb.execute(drizzleSql`DELETE FROM location  WHERE id = ${sharedLocBId}`);
  await rawDb.execute(drizzleSql`DELETE FROM "user"    WHERE id = ${sharedUserId}`);
  // Close the connection pools
  await (rawDb.$client as { end(): Promise<void> }).end();
});

// ── Helper: insert GBC row using unique IDs per test ─────────────────────────

async function insertGBC(params: {
  bookingId:        number;
  brandCode:        string;
  gatewayBookingId: string;
  gatewayQuoteId:   string;
  fingerprint?:     string;
  amountCents?:     number;
}): Promise<void> {
  const fp      = params.fingerprint ?? "a".repeat(64);
  const cents   = params.amountCents ?? 15000;
  await rawDb.execute(drizzleSql`
    INSERT INTO gateway_booking_context
      (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
       payload_fingerprint, total_amount_cents)
    VALUES (
      ${params.bookingId},
      ${params.brandCode},
      ${params.gatewayBookingId}::uuid,
      ${params.gatewayQuoteId}::uuid,
      ${fp},
      ${cents}
    )
  `);
}

async function deleteGBC(bookingId: number): Promise<void> {
  await rawDb.execute(
    drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bookingId}`,
  );
}

// ── Test 1: 0 rows — unknown identifiers ─────────────────────────────────────

test("1. lookupGatewayContextsForIdentifiers — 0 rows for unknown IDs", async () => {
  const rows = await lookupGatewayContextsForIdentifiers(testDb, {
    brandCode:        "batumicars",
    gatewayBookingId: randomUUID(),
    gatewayQuoteId:   randomUUID(),
  });
  assert.strictEqual(rows.length, 0, "expected empty array for unknown IDs");
});

// ── Test 2: match by bookingId only ──────────────────────────────────────────

test("2. lookupGatewayContextsForIdentifiers — match by gateway_booking_id only", async () => {
  const gwBookingId = randomUUID();
  const gwQuoteId   = randomUUID();

  await insertGBC({
    bookingId:        sharedBookingId,
    brandCode:        "batumicars",
    gatewayBookingId: gwBookingId,
    gatewayQuoteId:   gwQuoteId,
  });

  try {
    const rows = await lookupGatewayContextsForIdentifiers(testDb, {
      brandCode:        "batumicars",
      gatewayBookingId: gwBookingId,
      gatewayQuoteId:   randomUUID(),     // different quote ID
    });
    assert.strictEqual(rows.length, 1, "expected 1 row matched by booking ID");
    assert.strictEqual(rows[0]!.gatewayBookingId, gwBookingId);
  } finally {
    await deleteGBC(sharedBookingId);
  }
});

// ── Test 3: match by quoteId only ────────────────────────────────────────────

test("3. lookupGatewayContextsForIdentifiers — match by gateway_quote_id only", async () => {
  const gwBookingId = randomUUID();
  const gwQuoteId   = randomUUID();

  await insertGBC({
    bookingId:        sharedBookingId,
    brandCode:        "batumicars",
    gatewayBookingId: gwBookingId,
    gatewayQuoteId:   gwQuoteId,
  });

  try {
    const rows = await lookupGatewayContextsForIdentifiers(testDb, {
      brandCode:        "batumicars",
      gatewayBookingId: randomUUID(),     // different booking ID
      gatewayQuoteId:   gwQuoteId,
    });
    assert.strictEqual(rows.length, 1, "expected 1 row matched by quote ID");
    assert.strictEqual(rows[0]!.gatewayQuoteId, gwQuoteId);
  } finally {
    await deleteGBC(sharedBookingId);
  }
});

// ── Test 4: match by both — returns exactly 1 row (not duplicated) ────────────

test("4. lookupGatewayContextsForIdentifiers — match by both IDs returns exactly 1 row", async () => {
  const gwBookingId = randomUUID();
  const gwQuoteId   = randomUUID();

  await insertGBC({
    bookingId:        sharedBookingId,
    brandCode:        "batumicars",
    gatewayBookingId: gwBookingId,
    gatewayQuoteId:   gwQuoteId,
  });

  try {
    const rows = await lookupGatewayContextsForIdentifiers(testDb, {
      brandCode:        "batumicars",
      gatewayBookingId: gwBookingId,
      gatewayQuoteId:   gwQuoteId,
    });
    assert.strictEqual(rows.length, 1, "expected exactly 1 row — not duplicated");
  } finally {
    await deleteGBC(sharedBookingId);
  }
});

// ── Test 5: 2 rows — one matches by bookingId, another by quoteId ─────────────

test("5. lookupGatewayContextsForIdentifiers — returns 2 rows in ascending id order", async () => {
  // Need a second booking row (uq_gbc_booking_id prevents two GBC rows per booking)
  const bk2Rows = await q<{ id: number }>(drizzleSql`
    INSERT INTO booking (user_id, pickup_location_id, dropoff_location_id,
                         pickup_datetime, dropoff_datetime, contact_full_name)
    SELECT user_id, pickup_location_id, dropoff_location_id,
           pickup_datetime + INTERVAL '10 days',
           dropoff_datetime + INTERVAL '10 days',
           'C2a Test5 Bk2'
      FROM booking WHERE id = ${sharedBookingId}
    RETURNING id
  `);
  const bk2Id = bk2Rows[0]!.id;

  const sharedGwBookingId = randomUUID();
  const sharedGwQuoteId   = randomUUID();
  const bk1GwQuote        = randomUUID();  // different quote for booking 1
  const bk2GwBooking      = randomUUID();  // different booking for booking 2

  try {
    await insertGBC({
      bookingId:        sharedBookingId,
      brandCode:        "batumicars",
      gatewayBookingId: sharedGwBookingId,
      gatewayQuoteId:   bk1GwQuote,
    });
    await insertGBC({
      bookingId:        bk2Id,
      brandCode:        "batumicars",
      gatewayBookingId: bk2GwBooking,
      gatewayQuoteId:   sharedGwQuoteId,
    });

    const rows = await lookupGatewayContextsForIdentifiers(testDb, {
      brandCode:        "batumicars",
      gatewayBookingId: sharedGwBookingId,  // matches row 1
      gatewayQuoteId:   sharedGwQuoteId,    // matches row 2
    });

    assert.strictEqual(rows.length, 2, "expected 2 rows");
    assert.ok(rows[0]!.id < rows[1]!.id, "expected ascending id order");
  } finally {
    await deleteGBC(sharedBookingId);
    await deleteGBC(bk2Id);
    await rawDb.execute(drizzleSql`DELETE FROM booking WHERE id = ${bk2Id}`);
  }
});

// ── Test 6: brand isolation ───────────────────────────────────────────────────

test("6. lookupGatewayContextsForIdentifiers — brand isolation (kutaisicars sees nothing)", async () => {
  const gwBookingId = randomUUID();
  const gwQuoteId   = randomUUID();

  await insertGBC({
    bookingId:        sharedBookingId,
    brandCode:        "batumicars",
    gatewayBookingId: gwBookingId,
    gatewayQuoteId:   gwQuoteId,
  });

  try {
    const rows = await lookupGatewayContextsForIdentifiers(testDb, {
      brandCode:        "kutaisicars",   // different brand — same IDs
      gatewayBookingId: gwBookingId,
      gatewayQuoteId:   gwQuoteId,
    });
    assert.strictEqual(rows.length, 0, "expected 0 rows for mismatched brand");
  } finally {
    await deleteGBC(sharedBookingId);
  }
});

// ── Tests 7–12 use brand + vehicle_model / location fixtures ──────────────────

// Helper: insert brand + vehicle model, return { brandId, modelId }
async function insertBrandAndModel(
  suffix: string,
  active = true,
  availableForExternal = true,
): Promise<{ brandId: number; modelId: number }> {
  const brandRows = await q<{ id: number }>(
    drizzleSql`INSERT INTO brand (name) VALUES (${"C2a Brand " + suffix}) RETURNING id`,
  );
  const brandId = brandRows[0]!.id;

  const modelRows = await q<{ id: number }>(drizzleSql`
    INSERT INTO vehicle_model (brand_id, name, active, available_for_external_systems)
    VALUES (
      ${brandId},
      ${"C2a Model " + suffix},
      ${active},
      ${availableForExternal}
    )
    RETURNING id
  `);
  return { brandId, modelId: modelRows[0]!.id };
}

async function deleteModel(modelId: number, brandId: number): Promise<void> {
  await rawDb.execute(drizzleSql`DELETE FROM vehicle_model WHERE id = ${modelId}`);
  await rawDb.execute(drizzleSql`DELETE FROM brand          WHERE id = ${brandId}`);
}

// ── Test 7: validateVehicleModelTx — active and external ─────────────────────

test("7. validateVehicleModelTx — active + external → returns { id, name }", async () => {
  const suffix = randomUUID().slice(0, 8);
  const { brandId, modelId } = await insertBrandAndModel(suffix, true, true);

  try {
    let result: { id: number; name: string } | null = null;
    await rawDb.transaction(async (tx) => {
      result = await validateVehicleModelTx(
        tx as unknown as Parameters<typeof validateVehicleModelTx>[0],
        modelId,
      );
    });
    assert.ok(result !== null, "expected non-null result for active+external model");
    assert.strictEqual((result as { id: number; name: string }).id,   modelId);
    assert.ok((result as { id: number; name: string }).name.includes("C2a Model"));
  } finally {
    await deleteModel(modelId, brandId);
  }
});

// ── Test 8: validateVehicleModelTx — inactive ────────────────────────────────

test("8. validateVehicleModelTx — inactive model → returns null", async () => {
  const suffix = randomUUID().slice(0, 8);
  const { brandId, modelId } = await insertBrandAndModel(suffix, false, true);

  try {
    let result: { id: number; name: string } | null | undefined;
    await rawDb.transaction(async (tx) => {
      result = await validateVehicleModelTx(
        tx as unknown as Parameters<typeof validateVehicleModelTx>[0],
        modelId,
      );
    });
    assert.strictEqual(result, null, "expected null for inactive model");
  } finally {
    await deleteModel(modelId, brandId);
  }
});

// ── Test 9: validateVehicleModelTx — not available for external ───────────────

test("9. validateVehicleModelTx — not available_for_external_systems → returns null", async () => {
  const suffix = randomUUID().slice(0, 8);
  const { brandId, modelId } = await insertBrandAndModel(suffix, true, false);

  try {
    let result: { id: number; name: string } | null | undefined;
    await rawDb.transaction(async (tx) => {
      result = await validateVehicleModelTx(
        tx as unknown as Parameters<typeof validateVehicleModelTx>[0],
        modelId,
      );
    });
    assert.strictEqual(result, null, "expected null for model not available for external systems");
  } finally {
    await deleteModel(modelId, brandId);
  }
});

// ── Helper: insert and delete locations for tests 10–12 ──────────────────────

async function insertLocation(suffix: string, isActive = true): Promise<number> {
  const rows = await q<{ id: number }>(drizzleSql`
    INSERT INTO location (name, is_active)
    VALUES (${"C2a Loc " + suffix}, ${isActive})
    RETURNING id
  `);
  return rows[0]!.id;
}

async function deleteLocation(id: number): Promise<void> {
  await rawDb.execute(drizzleSql`DELETE FROM location WHERE id = ${id}`);
}

// ── Test 10: validateLocationsTx — both active ────────────────────────────────

test("10. validateLocationsTx — both locations active → Map with both entries", async () => {
  const sfx1 = randomUUID().slice(0, 8);
  const sfx2 = randomUUID().slice(0, 8);
  const loc1 = await insertLocation("10a-" + sfx1, true);
  const loc2 = await insertLocation("10b-" + sfx2, true);

  try {
    let result: Map<number, { id: number; name: string }> | null | undefined;
    await rawDb.transaction(async (tx) => {
      result = await validateLocationsTx(
        tx as unknown as Parameters<typeof validateLocationsTx>[0],
        { pickupLocationId: loc1, dropoffLocationId: loc2 },
      );
    });
    assert.ok(result instanceof Map, "expected a Map");
    assert.ok(result!.has(loc1), "expected Map to contain pickup location");
    assert.ok(result!.has(loc2), "expected Map to contain dropoff location");
    assert.ok(result!.get(loc1)!.name.includes("C2a Loc"));
    assert.ok(result!.get(loc2)!.name.includes("C2a Loc"));
  } finally {
    await deleteLocation(loc1);
    await deleteLocation(loc2);
  }
});

// ── Test 11: validateLocationsTx — one location inactive ─────────────────────

test("11. validateLocationsTx — one inactive location → null", async () => {
  const sfx1 = randomUUID().slice(0, 8);
  const sfx2 = randomUUID().slice(0, 8);
  const loc1 = await insertLocation("11a-" + sfx1, true);
  const loc2 = await insertLocation("11b-" + sfx2, false);  // inactive

  try {
    let result: Map<number, { id: number; name: string }> | null | undefined;
    await rawDb.transaction(async (tx) => {
      result = await validateLocationsTx(
        tx as unknown as Parameters<typeof validateLocationsTx>[0],
        { pickupLocationId: loc1, dropoffLocationId: loc2 },
      );
    });
    assert.strictEqual(result, null, "expected null when one location is inactive");
  } finally {
    await deleteLocation(loc1);
    await deleteLocation(loc2);
  }
});

// ── Test 12: validateLocationsTx — same pickup and dropoff ID ─────────────────

test("12. validateLocationsTx — same pickup and dropoff ID → Map with 1 entry, both satisfied", async () => {
  const sfx = randomUUID().slice(0, 8);
  const loc  = await insertLocation("12-" + sfx, true);

  try {
    let result: Map<number, { id: number; name: string }> | null | undefined;
    await rawDb.transaction(async (tx) => {
      result = await validateLocationsTx(
        tx as unknown as Parameters<typeof validateLocationsTx>[0],
        { pickupLocationId: loc, dropoffLocationId: loc },
      );
    });
    assert.ok(result instanceof Map, "expected a Map");
    assert.strictEqual(result!.size, 1, "expected Map with 1 entry (deduplicated)");
    assert.ok(result!.has(loc), "expected Map to contain the single location ID");
  } finally {
    await deleteLocation(loc);
  }
});

// ── Test 14: validateLocationsTx — invalid runtime ID (0) returns null ───────

test("14. validateLocationsTx — invalid runtime location ID 0 → null without DB query", async () => {
  // id = 0 is invalid (must be > 0). The guard must return null before any SQL.
  let result: Map<number, { id: number; name: string }> | null | undefined;
  await rawDb.transaction(async (tx) => {
    result = await validateLocationsTx(
      tx as unknown as Parameters<typeof validateLocationsTx>[0],
      { pickupLocationId: 0, dropoffLocationId: 1 },
    );
  });
  assert.strictEqual(result, null, "expected null for invalid location ID 0");
});

// ── Test 13: classifyIdempotencyResult — end-to-end with real DB row ──────────

test("13. classifyIdempotencyResult — REPLAY from real committed GBC row", async () => {
  const gwBookingId = randomUUID();
  const gwQuoteId   = randomUUID();

  // Compute fingerprint for this row
  const fp = computePayloadFingerprint({
    brandCode:         "batumicars",
    gatewayBookingId:  gwBookingId,
    gatewayQuoteId:    gwQuoteId,
    vehicleModelId:    1,
    pickupLocationId:  sharedLocAId,
    dropoffLocationId: sharedLocBId,
    pickupDatetime:    "2026-08-01T10:00",
    dropoffDatetime:   "2026-08-05T10:00",
    totalAmountCents:  15000,
    currency:          "EUR",
    customerName:      "Test Customer",
    customerEmail:     "test@example.com",
    customerPhone:     "+995500000001",
  });

  // Insert the GBC row committed
  await rawDb.execute(drizzleSql`
    INSERT INTO gateway_booking_context
      (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
       payload_fingerprint, total_amount_cents)
    VALUES (
      ${sharedBookingId},
      'batumicars',
      ${gwBookingId}::uuid,
      ${gwQuoteId}::uuid,
      ${fp},
      15000
    )
  `);

  try {
    // Lookup via committed-state query
    const rows = await lookupGatewayContextsForIdentifiers(testDb, {
      brandCode:        "batumicars",
      gatewayBookingId: gwBookingId,
      gatewayQuoteId:   gwQuoteId,
    });

    assert.strictEqual(rows.length, 1, "expected 1 row from lookup");

    // Classify
    const classification = classifyIdempotencyResult(rows, {
      brandCode:          "batumicars",
      gatewayBookingId:   gwBookingId,
      gatewayQuoteId:     gwQuoteId,
      payloadFingerprint: fp,
      totalAmountCents:   15000,
    });

    assert.strictEqual(
      classification.kind,
      "REPLAY",
      "expected REPLAY classification for matching committed row",
    );
  } finally {
    await deleteGBC(sharedBookingId);
  }
});
