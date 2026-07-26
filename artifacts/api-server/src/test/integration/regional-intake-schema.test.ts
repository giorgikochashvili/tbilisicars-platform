/**
 * regional-intake-schema.test.ts
 *
 * Schema-only integration tests for migration 0014 (regional intake tables).
 *
 * These tests prove:
 *   - Both new tables exist
 *   - All 11 named constraints exist with correct names and types
 *   - Column types match the spec (BIGINT, CHAR, SMALLINT)
 *   - BIGINT round-trip works through Drizzle (type = "number", not "string")
 *   - Timestamp is stored as TIMESTAMP WITHOUT TIME ZONE
 *   - CHECK, UNIQUE, and FK constraints are enforced at the database level
 *   - uq_ic_key_id, uq_gbc_brand_gateway_booking, uq_gbc_brand_gateway_quote enforced
 *   - TIMESTAMP WITHOUT TIME ZONE values are unaffected by session timezone changes
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:integration
 *
 * Requires: RBG_TEST_DATABASE_URL pointing to the migrated test database.
 * When called by verify-migration-0014.ts, this variable is always set.
 *
 * Uses drizzle-orm/node-postgres (connection-string API) — no direct pg import.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql as drizzleSql, eq } from "drizzle-orm";
import { gatewayBookingContextTable } from "@workspace/db";

// ── Database URL guard ────────────────────────────────────────────────────────
const testDbUrl = (() => {
  const url = process.env["RBG_TEST_DATABASE_URL"];
  if (!url) {
    console.error(
      "STOP: RBG_TEST_DATABASE_URL is not set. " +
      "Run this test via verify-migration-0014.ts or set RBG_TEST_DATABASE_URL explicitly.",
    );
    process.exit(1);
  }
  return url;
})();

const db = drizzle(testDbUrl, { schema: { gatewayBookingContextTable } });

// ── Prerequisite data ─────────────────────────────────────────────────────────
let testBookingId: number | undefined;

// ── Helper: raw query ─────────────────────────────────────────────────────────
// Returns rows as an array of Record<string, unknown>.
// db.execute() returns the underlying pg QueryResult.
async function q<T extends Record<string, unknown>>(
  query: ReturnType<typeof drizzleSql>,
): Promise<T[]> {
  const result = await db.execute(query);
  // drizzle returns the pg QueryResult; rows is the standard property
  return (result as unknown as { rows: T[] }).rows;
}

// ── Helper: expect PG error code ──────────────────────────────────────────────
// drizzle-orm may wrap the underlying pg DatabaseError.
// Check both err.code (direct re-throw) and err.cause.code (wrapped).
async function expectPgError(
  fn:           () => Promise<unknown>,
  expectedCode: string,
  label:        string,
): Promise<void> {
  try {
    await fn();
    assert.fail(`${label}: expected error ${expectedCode} but query succeeded`);
  } catch (err: unknown) {
    if (err instanceof assert.AssertionError) throw err;
    const e     = err as Record<string, unknown>;
    const cause = e["cause"] as Record<string, unknown> | undefined;
    const code  =
      (e["code"] as string | undefined) ??
      (cause?.["code"] as string | undefined);
    assert.strictEqual(
      code,
      expectedCode,
      `${label}: expected PG error ${expectedCode}, got ${code ?? String(err)}`,
    );
  }
}

// ── Setup: create prerequisite data ──────────────────────────────────────────
before(async () => {
  // Truncate our tables (clean slate for all tests)
  await db.execute(
    drizzleSql`TRUNCATE gateway_booking_context, integration_client RESTART IDENTITY CASCADE`,
  );

  // Create minimum required data for FK tests: user → location × 2 → booking
  // user table: only id, created_at, updated_at are NOT NULL without defaults

  const userRows = await q<{ id: number }>(
    drizzleSql`INSERT INTO "user" DEFAULT VALUES RETURNING id`,
  );
  const userId = userRows[0]!.id;

  const loc1Rows = await q<{ id: number }>(
    drizzleSql`INSERT INTO location (name) VALUES ('RBG Test Location A') RETURNING id`,
  );
  const loc2Rows = await q<{ id: number }>(
    drizzleSql`INSERT INTO location (name) VALUES ('RBG Test Location B') RETURNING id`,
  );

  const bookingRows = await q<{ id: number }>(
    drizzleSql`
      INSERT INTO booking
        (user_id, pickup_location_id, dropoff_location_id,
         pickup_datetime, dropoff_datetime, contact_full_name)
      VALUES (
        ${userId},
        ${loc1Rows[0]!.id},
        ${loc2Rows[0]!.id},
        NOW() + INTERVAL '1 day',
        NOW() + INTERVAL '2 days',
        'RBG Test Customer'
      )
      RETURNING id
    `,
  );
  testBookingId = bookingRows[0]!.id;
});

// ── Teardown ──────────────────────────────────────────────────────────────────
after(async () => {
  await (db.$client as { end(): Promise<void> }).end();
});

// ── Valid data factories ──────────────────────────────────────────────────────
function validFp(): string {
  return "a".repeat(64); // valid: 64 lowercase hex chars
}

// ── Test 1: Both new tables exist ─────────────────────────────────────────────
test("1. Both 0014 tables exist in the public schema", async () => {
  const rows = await q<{ table_name: string }>(
    drizzleSql`
      SELECT table_name
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('integration_client', 'gateway_booking_context')
       ORDER BY table_name
    `,
  );
  const names = rows.map((r) => r.table_name).sort();
  assert.deepStrictEqual(names, [
    "gateway_booking_context",
    "integration_client",
  ]);
});

// ── Test 2: All 11 named constraints exist with correct types ─────────────────
test("2. All 11 named constraints exist (names and types)", async () => {
  const rows = await q<{ constraint_name: string; constraint_type: string }>(
    drizzleSql`
      SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
       WHERE table_schema  = 'public'
         AND table_name IN ('integration_client', 'gateway_booking_context')
       ORDER BY constraint_name
    `,
  );
  const byName = new Map(rows.map((r) => [r.constraint_name, r.constraint_type]));

  const expected: Array<[string, string]> = [
    ["pk_ic",             "PRIMARY KEY"],
    ["uq_ic_key_id",      "UNIQUE"],
    ["chk_ic_brand_code", "CHECK"],
    ["pk_gbc",                       "PRIMARY KEY"],
    ["uq_gbc_booking_id",            "UNIQUE"],
    ["uq_gbc_brand_gateway_booking", "UNIQUE"],
    ["uq_gbc_brand_gateway_quote",   "UNIQUE"],
    ["fk_gbc_booking_id",            "FOREIGN KEY"],
    ["chk_gbc_brand_code",           "CHECK"],
    ["chk_gbc_total_amount_cents",   "CHECK"],
    ["chk_gbc_fingerprint",          "CHECK"],
  ];

  for (const [name, type] of expected) {
    assert.ok(byName.has(name), `Constraint '${name}' is missing`);
    assert.strictEqual(
      byName.get(name),
      type,
      `Constraint '${name}': expected '${type}', got '${byName.get(name)}'`,
    );
  }
  assert.strictEqual(expected.length, 11, "Sanity: expected 11 constraints");
});

// ── Test 3: Critical column types ─────────────────────────────────────────────
test("3. Critical column types: BIGINT, CHAR(64), SMALLINT", async () => {
  const rows = await q<{
    column_name: string;
    data_type:   string;
    character_maximum_length: string | null;
  }>(
    drizzleSql`
      SELECT column_name, data_type, character_maximum_length::text
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'gateway_booking_context'
         AND column_name IN (
           'total_amount_cents', 'payload_fingerprint', 'payload_fingerprint_version'
         )
       ORDER BY column_name
    `,
  );

  const byCol = new Map(rows.map((r) => [r.column_name, r]));

  const cents = byCol.get("total_amount_cents");
  assert.ok(cents, "total_amount_cents column must exist");
  assert.strictEqual(cents!.data_type, "bigint",
    `total_amount_cents: expected 'bigint', got '${cents!.data_type}'`);

  const fp = byCol.get("payload_fingerprint");
  assert.ok(fp, "payload_fingerprint column must exist");
  assert.strictEqual(fp!.data_type, "character",
    `payload_fingerprint: expected 'character' (CHAR), got '${fp!.data_type}'`);
  assert.strictEqual(fp!.character_maximum_length, "64",
    `payload_fingerprint: expected length 64, got '${fp!.character_maximum_length}'`);

  const ver = byCol.get("payload_fingerprint_version");
  assert.ok(ver, "payload_fingerprint_version column must exist");
  assert.strictEqual(ver!.data_type, "smallint",
    `payload_fingerprint_version: expected 'smallint', got '${ver!.data_type}'`);
});

// ── Test 4: BIGINT via Drizzle — totalAmountCents = 1 returns JS number ───────
test("4. BIGINT read through Drizzle returns JS number (not string) — value 1", async () => {
  assert.ok(testBookingId !== undefined, "testBookingId must be set by before()");

  await db.execute(drizzleSql`
    INSERT INTO gateway_booking_context
      (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
       payload_fingerprint, total_amount_cents)
    VALUES (
      ${testBookingId}, 'batumicars', ${randomUUID()}::uuid, ${randomUUID()}::uuid,
      ${validFp()}, 1
    )
  `);

  const rows = await db
    .select({ totalAmountCents: gatewayBookingContextTable.totalAmountCents })
    .from(gatewayBookingContextTable)
    .where(eq(gatewayBookingContextTable.bookingId, testBookingId!));

  assert.strictEqual(rows.length, 1, "Expected exactly 1 row");
  const val = rows[0]!.totalAmountCents;
  assert.strictEqual(typeof val, "number", `Expected 'number', got '${typeof val}'`);
  assert.strictEqual(val, 1, `Expected totalAmountCents = 1, got ${val}`);

  await db.execute(
    drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${testBookingId}`,
  );
});

// ── Test 5: BIGINT via Drizzle — max value 9_999_999_999 ─────────────────────
test("5. BIGINT read through Drizzle — max value 9_999_999_999 is JS number", async () => {
  assert.ok(testBookingId !== undefined);
  const MAX_CENTS = 9_999_999_999;

  await db.execute(drizzleSql`
    INSERT INTO gateway_booking_context
      (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
       payload_fingerprint, total_amount_cents)
    VALUES (
      ${testBookingId}, 'batumicars', ${randomUUID()}::uuid, ${randomUUID()}::uuid,
      ${validFp()}, ${MAX_CENTS}
    )
  `);

  const rows = await db
    .select({ totalAmountCents: gatewayBookingContextTable.totalAmountCents })
    .from(gatewayBookingContextTable)
    .where(eq(gatewayBookingContextTable.bookingId, testBookingId!));

  assert.strictEqual(rows.length, 1);
  const val = rows[0]!.totalAmountCents;
  assert.strictEqual(typeof val, "number", `Expected 'number', got '${typeof val}'`);
  assert.strictEqual(val, MAX_CENTS, `Expected ${MAX_CENTS}, got ${val}`);
  assert.ok(val <= Number.MAX_SAFE_INTEGER, `${val} must be <= MAX_SAFE_INTEGER`);

  await db.execute(
    drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${testBookingId}`,
  );
});

// ── Test 6: Timestamp stored as TIMESTAMP WITHOUT TIME ZONE ──────────────────
test("6. created_at is TIMESTAMP WITHOUT TIME ZONE", async () => {
  const rows = await q<{ data_type: string }>(
    drizzleSql`
      SELECT data_type
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'gateway_booking_context'
         AND column_name  = 'created_at'
    `,
  );
  assert.strictEqual(rows.length, 1, "created_at column must exist");
  assert.strictEqual(
    rows[0]!.data_type,
    "timestamp without time zone",
    `created_at: expected 'timestamp without time zone', got '${rows[0]!.data_type}'`,
  );
});

// ── Test 7: CHECK — chk_ic_brand_code: invalid value rejected ────────────────
test("7. chk_ic_brand_code: invalid brand_code rejected (23514)", async () => {
  await expectPgError(
    () =>
      db.execute(drizzleSql`
        INSERT INTO integration_client (key_id, brand_code)
        VALUES ('key-check-test', 'unknownbrand')
      `),
    "23514",
    "chk_ic_brand_code",
  );
});

// ── Test 8: CHECK — chk_gbc_total_amount_cents: value 0 rejected ─────────────
test("8. chk_gbc_total_amount_cents: value 0 rejected (23514)", async () => {
  assert.ok(testBookingId !== undefined);
  await expectPgError(
    () =>
      db.execute(drizzleSql`
        INSERT INTO gateway_booking_context
          (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
           payload_fingerprint, total_amount_cents)
        VALUES (
          ${testBookingId}, 'batumicars',
          ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${validFp()}, 0
        )
      `),
    "23514",
    "chk_gbc_total_amount_cents (0)",
  );
});

// ── Test 9: CHECK — chk_gbc_total_amount_cents: value > max rejected ──────────
test("9. chk_gbc_total_amount_cents: value 10_000_000_000 rejected (23514)", async () => {
  assert.ok(testBookingId !== undefined);
  await expectPgError(
    () =>
      db.execute(drizzleSql`
        INSERT INTO gateway_booking_context
          (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
           payload_fingerprint, total_amount_cents)
        VALUES (
          ${testBookingId}, 'batumicars',
          ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${validFp()}, 10000000000
        )
      `),
    "23514",
    "chk_gbc_total_amount_cents (10_000_000_000)",
  );
});

// ── Test 10: CHECK — chk_gbc_fingerprint: non-hex rejected ───────────────────
test("10. chk_gbc_fingerprint: uppercase-G fingerprint rejected (23514)", async () => {
  assert.ok(testBookingId !== undefined);
  const badFp = "G".repeat(64);
  await expectPgError(
    () =>
      db.execute(drizzleSql`
        INSERT INTO gateway_booking_context
          (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
           payload_fingerprint, total_amount_cents)
        VALUES (
          ${testBookingId}, 'batumicars',
          ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${badFp}, 100
        )
      `),
    "23514",
    "chk_gbc_fingerprint (non-hex)",
  );
});

// ── Test 11: CHECK — chk_gbc_fingerprint: 63-char fingerprint rejected ────────
test("11. chk_gbc_fingerprint: 63-char fingerprint rejected (23514)", async () => {
  assert.ok(testBookingId !== undefined);
  const shortFp = "a".repeat(63);
  await expectPgError(
    () =>
      db.execute(drizzleSql`
        INSERT INTO gateway_booking_context
          (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
           payload_fingerprint, total_amount_cents)
        VALUES (
          ${testBookingId}, 'batumicars',
          ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${shortFp}, 100
        )
      `),
    "23514",
    "chk_gbc_fingerprint (63 chars)",
  );
});

// ── Test 12: UNIQUE — uq_gbc_booking_id: duplicate booking_id rejected ────────
test("12. uq_gbc_booking_id: duplicate booking_id rejected (23505)", async () => {
  assert.ok(testBookingId !== undefined);

  await db.execute(drizzleSql`
    INSERT INTO gateway_booking_context
      (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
       payload_fingerprint, total_amount_cents)
    VALUES (
      ${testBookingId}, 'batumicars',
      ${randomUUID()}::uuid, ${randomUUID()}::uuid,
      ${validFp()}, 100
    )
  `);

  await expectPgError(
    () =>
      db.execute(drizzleSql`
        INSERT INTO gateway_booking_context
          (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
           payload_fingerprint, total_amount_cents)
        VALUES (
          ${testBookingId}, 'kutaisicars',
          ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${validFp()}, 200
        )
      `),
    "23505",
    "uq_gbc_booking_id",
  );

  await db.execute(
    drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${testBookingId}`,
  );
});

// ── Test 13: FK — fk_gbc_booking_id: nonexistent booking_id rejected ──────────
test("13. fk_gbc_booking_id: nonexistent booking_id rejected (23503)", async () => {
  const nonExistentId = 999_999_999;
  await expectPgError(
    () =>
      db.execute(drizzleSql`
        INSERT INTO gateway_booking_context
          (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
           payload_fingerprint, total_amount_cents)
        VALUES (
          ${nonExistentId}, 'batumicars',
          ${randomUUID()}::uuid, ${randomUUID()}::uuid,
          ${validFp()}, 100
        )
      `),
    "23503",
    "fk_gbc_booking_id",
  );
});

// ── Test 14: UNIQUE — uq_ic_key_id: duplicate key_id rejected ────────────────
test("14. uq_ic_key_id: duplicate key_id rejected (23505)", async () => {
  const KEY = "dup-key-" + randomUUID().slice(0, 8);

  await db.execute(drizzleSql`
    INSERT INTO integration_client (key_id, brand_code)
    VALUES (${KEY}, 'batumicars')
  `);

  await expectPgError(
    () =>
      db.execute(drizzleSql`
        INSERT INTO integration_client (key_id, brand_code)
        VALUES (${KEY}, 'kutaisicars')
      `),
    "23505",
    "uq_ic_key_id",
  );

  await db.execute(
    drizzleSql`DELETE FROM integration_client WHERE key_id = ${KEY}`,
  );
});

// ── Test 15: UNIQUE — uq_gbc_brand_gateway_booking: same brand+gw_booking_id ──
test("15. uq_gbc_brand_gateway_booking: same brand+gateway_booking_id rejected (23505)", async () => {
  assert.ok(testBookingId !== undefined);

  // Second booking row (different booking_id) — required because uq_gbc_booking_id
  // already prevents two gbc rows sharing the same booking_id.
  const bk2 = await q<{ id: number }>(drizzleSql`
    INSERT INTO booking (user_id, pickup_location_id, dropoff_location_id,
                         pickup_datetime, dropoff_datetime, contact_full_name)
    SELECT user_id, pickup_location_id, dropoff_location_id,
           pickup_datetime + INTERVAL '30 days',
           dropoff_datetime + INTERVAL '30 days',
           'RBG GwBooking Dup'
      FROM booking WHERE id = ${testBookingId}
    RETURNING id
  `);
  const bk2Id = bk2[0]!.id;

  const sharedGwBookingId = randomUUID();

  try {
    await db.execute(drizzleSql`
      INSERT INTO gateway_booking_context
        (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
         payload_fingerprint, total_amount_cents)
      VALUES (
        ${testBookingId}, 'batumicars',
        ${sharedGwBookingId}::uuid, ${randomUUID()}::uuid,
        ${validFp()}, 100
      )
    `);

    await expectPgError(
      () =>
        db.execute(drizzleSql`
          INSERT INTO gateway_booking_context
            (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
             payload_fingerprint, total_amount_cents)
          VALUES (
            ${bk2Id}, 'batumicars',
            ${sharedGwBookingId}::uuid, ${randomUUID()}::uuid,
            ${validFp()}, 200
          )
        `),
      "23505",
      "uq_gbc_brand_gateway_booking",
    );
  } finally {
    await db.execute(
      drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${testBookingId}`,
    );
    await db.execute(
      drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bk2Id}`,
    );
    await db.execute(drizzleSql`DELETE FROM booking WHERE id = ${bk2Id}`);
  }
});

// ── Test 16: UNIQUE — uq_gbc_brand_gateway_quote: same brand+gw_quote_id ──────
test("16. uq_gbc_brand_gateway_quote: same brand+gateway_quote_id rejected (23505)", async () => {
  assert.ok(testBookingId !== undefined);

  // Second booking row (different booking_id) — same reason as test 15.
  const bk2 = await q<{ id: number }>(drizzleSql`
    INSERT INTO booking (user_id, pickup_location_id, dropoff_location_id,
                         pickup_datetime, dropoff_datetime, contact_full_name)
    SELECT user_id, pickup_location_id, dropoff_location_id,
           pickup_datetime + INTERVAL '60 days',
           dropoff_datetime + INTERVAL '60 days',
           'RBG GwQuote Dup'
      FROM booking WHERE id = ${testBookingId}
    RETURNING id
  `);
  const bk2Id = bk2[0]!.id;

  const sharedQuoteId = randomUUID();

  try {
    await db.execute(drizzleSql`
      INSERT INTO gateway_booking_context
        (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
         payload_fingerprint, total_amount_cents)
      VALUES (
        ${testBookingId}, 'batumicars',
        ${randomUUID()}::uuid, ${sharedQuoteId}::uuid,
        ${validFp()}, 100
      )
    `);

    await expectPgError(
      () =>
        db.execute(drizzleSql`
          INSERT INTO gateway_booking_context
            (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
             payload_fingerprint, total_amount_cents)
          VALUES (
            ${bk2Id}, 'batumicars',
            ${randomUUID()}::uuid, ${sharedQuoteId}::uuid,
            ${validFp()}, 200
          )
        `),
      "23505",
      "uq_gbc_brand_gateway_quote",
    );
  } finally {
    await db.execute(
      drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${testBookingId}`,
    );
    await db.execute(
      drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bk2Id}`,
    );
    await db.execute(drizzleSql`DELETE FROM booking WHERE id = ${bk2Id}`);
  }
});

// ── Test 17: TIMESTAMP WITHOUT TIME ZONE wall-clock isolation ─────────────────
//
// pickup_datetime and dropoff_datetime on the booking table are stored as
// TIMESTAMP WITHOUT TIME ZONE.  Changing the PostgreSQL session timezone must
// not alter the wall-clock string returned by to_char().
//
// Both reads run inside a single transaction so SET LOCAL TIME ZONE applies
// to both SELECT calls through the same underlying connection.
test("17. Wall-clock timestamp isolation: pickup/dropoff unaffected by session timezone", async () => {
  assert.ok(testBookingId !== undefined, "testBookingId must be set by before()");

  const PICKUP_WALL  = "2026-03-15 09:30:00";
  const DROPOFF_WALL = "2026-03-15 14:00:00";

  // Insert a booking row using explicit TIMESTAMP WITHOUT TIME ZONE literals.
  // TIMESTAMP '...' is equivalent to CAST('...' AS timestamp without time zone).
  const bkRows = await q<{ id: number }>(drizzleSql`
    INSERT INTO booking (user_id, pickup_location_id, dropoff_location_id,
                         pickup_datetime, dropoff_datetime, contact_full_name)
    SELECT user_id, pickup_location_id, dropoff_location_id,
           TIMESTAMP '2026-03-15 09:30:00',
           TIMESTAMP '2026-03-15 14:00:00',
           'RBG Timestamp Isolation Test'
      FROM booking WHERE id = ${testBookingId}
    RETURNING id
  `);
  const tsBookingId = bkRows[0]!.id;

  try {
    type TsRow = { pickup_str: string; dropoff_str: string };

    await db.transaction(async (tx) => {
      // ── Read under UTC ────────────────────────────────────────────────────
      await tx.execute(drizzleSql`SET LOCAL TIME ZONE 'UTC'`);
      const utcRaw = await tx.execute(drizzleSql`
        SELECT to_char(pickup_datetime,  'YYYY-MM-DD HH24:MI:SS') AS pickup_str,
               to_char(dropoff_datetime, 'YYYY-MM-DD HH24:MI:SS') AS dropoff_str
          FROM booking WHERE id = ${tsBookingId}
      `);
      const utcRow = (utcRaw as unknown as { rows: TsRow[] }).rows[0]!;
      assert.strictEqual(utcRow.pickup_str,  PICKUP_WALL,  "UTC: pickup wall-clock mismatch");
      assert.strictEqual(utcRow.dropoff_str, DROPOFF_WALL, "UTC: dropoff wall-clock mismatch");

      // ── Read under Asia/Tbilisi (UTC+4, no DST) — must be identical ──────
      await tx.execute(drizzleSql`SET LOCAL TIME ZONE 'Asia/Tbilisi'`);
      const tbilisiRaw = await tx.execute(drizzleSql`
        SELECT to_char(pickup_datetime,  'YYYY-MM-DD HH24:MI:SS') AS pickup_str,
               to_char(dropoff_datetime, 'YYYY-MM-DD HH24:MI:SS') AS dropoff_str
          FROM booking WHERE id = ${tsBookingId}
      `);
      const tbilisiRow = (tbilisiRaw as unknown as { rows: TsRow[] }).rows[0]!;
      assert.strictEqual(tbilisiRow.pickup_str,  PICKUP_WALL,  "Asia/Tbilisi: pickup wall-clock mismatch");
      assert.strictEqual(tbilisiRow.dropoff_str, DROPOFF_WALL, "Asia/Tbilisi: dropoff wall-clock mismatch");
    });
  } finally {
    await db.execute(drizzleSql`DELETE FROM booking WHERE id = ${tsBookingId}`);
  }
});
