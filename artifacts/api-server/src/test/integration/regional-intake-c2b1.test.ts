/**
 * regional-intake-c2b1.test.ts
 *
 * C2b-1 PostgreSQL integration tests: transaction atomicity and write correctness.
 *
 * Tests:
 *   T-R1 — afterCustomerResolve hook throws → all four tables roll back
 *   T-R2 — afterBookingInsert hook throws   → all four tables roll back
 *   T-R3 — afterAttributionInsert hook throws → all four tables roll back
 *   T-R4 — afterContextInsert hook throws   → all four tables roll back
 *   T-C1 — successful four-row atomic commit
 *   T-C2 — existing customer: password_hash preserved, fields not overwritten
 *   T-C3 — new customer: password_hash is NULL
 *   T-C4 — FINGERPRINT_VERSION stored explicitly in GBC row
 *   T-C5 — wall-clock storage: pickup/dropoff round-trip without timezone shift
 *   T-C6 — cents/NUMERIC: total_amount = centsToDecimalString(totalAmountCents)
 *   T-C7 — explicit locked booking values: source, currency, base_rate, customer_contacted, external_reservation_code
 *   T-C8 — complete attribution values: source_domain=null, source_brand=brandCode, UTM/gclid/referrer/landing_path=null
 *   T-C9 — VEHICLE_MODEL_UNAVAILABLE: no customer row, no booking
 *   T-C10 — LOCATION_UNAVAILABLE: no customer row, no booking
 *
 * ISOLATION STRATEGY:
 *   Each test uses unique deterministic fixture identifiers (UUIDs + fixed email
 *   prefix "c2b1-").  Committed rows are cleaned in explicit finally blocks in
 *   reverse FK order.  Rollback tests verify no row was committed before asserting.
 *
 * DB GUARD:
 *   RBG_TEST_DATABASE_URL must be set. Never uses DATABASE_URL.
 *   Exits with code 1 if RBG_TEST_DATABASE_URL is absent.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:integration:c2b1
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
import { type RbgTx } from "../../repositories/regional-intake.repository.js";
import {
  executeRegionalIntakeTransactionTx,
  type RegionalIntakeTxInput,
  type RegionalIntakeTxResult,
  type RegionalIntakeTxTestHooks,
} from "../../lib/regional-intake-transaction.js";
import { FINGERPRINT_VERSION, centsToDecimalString } from "../../lib/regional-intake-helpers.js";

// ── DB URL guard ──────────────────────────────────────────────────────────────

const testDbUrl = (() => {
  const url = process.env["RBG_TEST_DATABASE_URL"];
  if (!url) {
    console.error(
      "STOP: RBG_TEST_DATABASE_URL is not set. " +
      "Set RBG_TEST_DATABASE_URL to a dedicated test database before running " +
      "test:integration:c2b1.",
    );
    process.exit(1);
  }
  return url;
})();

// ── Dedicated test executors ──────────────────────────────────────────────────
// rawDb: committed-state executor used for fixtures and committed-state assertions.
// Never uses DATABASE_URL.

const rawDb = drizzle(testDbUrl, { schema });

// ── Raw query helper ──────────────────────────────────────────────────────────

async function q<T extends Record<string, unknown>>(
  query: ReturnType<typeof drizzleSql>,
): Promise<T[]> {
  const result = await rawDb.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

// ── Shared prerequisite state ─────────────────────────────────────────────────

let sharedBrandId:  number;
let sharedModelId:  number;
let sharedLocAId:   number;
let sharedLocBId:   number;

before(async () => {
  // Insert brand + active external-enabled vehicle model
  const brandRows = await q<{ id: number }>(
    drizzleSql`INSERT INTO brand (name) VALUES ('C2b1 Brand') RETURNING id`,
  );
  sharedBrandId = brandRows[0]!.id;

  const modelRows = await q<{ id: number }>(drizzleSql`
    INSERT INTO vehicle_model (brand_id, name, active, available_for_external_systems)
    VALUES (${sharedBrandId}, 'C2b1 Model', true, true)
    RETURNING id
  `);
  sharedModelId = modelRows[0]!.id;

  // Insert two active locations
  const locARows = await q<{ id: number }>(drizzleSql`
    INSERT INTO location (name, is_active) VALUES ('C2b1 Loc A', true) RETURNING id
  `);
  sharedLocAId = locARows[0]!.id;

  const locBRows = await q<{ id: number }>(drizzleSql`
    INSERT INTO location (name, is_active) VALUES ('C2b1 Loc B', true) RETURNING id
  `);
  sharedLocBId = locBRows[0]!.id;
});

after(async () => {
  // Reverse FK order: model before brand, locations independent
  await rawDb.execute(drizzleSql`DELETE FROM vehicle_model WHERE id = ${sharedModelId}`);
  await rawDb.execute(drizzleSql`DELETE FROM brand          WHERE id = ${sharedBrandId}`);
  await rawDb.execute(drizzleSql`DELETE FROM location       WHERE id = ${sharedLocAId}`);
  await rawDb.execute(drizzleSql`DELETE FROM location       WHERE id = ${sharedLocBId}`);
  // Close the connection pool
  await (rawDb.$client as { end(): Promise<void> }).end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a default valid transaction input with unique IDs. */
function makeInput(overrides: Partial<RegionalIntakeTxInput> = {}): RegionalIntakeTxInput {
  return {
    brandCode:          "batumicars",
    gatewayBookingId:   randomUUID(),
    gatewayQuoteId:     randomUUID(),
    vehicleModelId:     sharedModelId,
    pickupLocationId:   sharedLocAId,
    dropoffLocationId:  sharedLocBId,
    pickupPgLiteral:    "2026-09-01 10:00:00",
    dropoffPgLiteral:   "2026-09-05 10:00:00",
    totalAmountCents:   15000,
    currency:           "EUR",
    customerName:       "Test Customer",
    customerEmail:      `c2b1-${randomUUID()}@rbg-test.invalid`,
    customerPhone:      "+995500000099",
    payloadFingerprint: "a".repeat(64),
    ...overrides,
  };
}

/**
 * Run executeRegionalIntakeTransactionTx inside a rawDb.transaction and return
 * the domain result.  Throws if the transaction callback throws.
 */
async function runTx(
  input: RegionalIntakeTxInput,
  hooks?: RegionalIntakeTxTestHooks,
): Promise<RegionalIntakeTxResult> {
  let result!: RegionalIntakeTxResult;
  await rawDb.transaction(async (tx) => {
    result = await executeRegionalIntakeTransactionTx(
      tx as unknown as RbgTx,
      input,
      hooks,
    );
  });
  return result;
}

/** Delete committed rows created by a successful transaction (reverse FK order). */
async function cleanupSuccess(bookingId: number, userEmail: string): Promise<void> {
  await rawDb.execute(
    drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bookingId}`,
  );
  // booking_attribution is cascade-deleted when booking is deleted
  await rawDb.execute(drizzleSql`DELETE FROM booking WHERE id = ${bookingId}`);
  await rawDb.execute(drizzleSql`DELETE FROM "user" WHERE email = ${userEmail}`);
}

/**
 * Assert that no rows were committed for the given email / gwBookingId.
 * Used after rollback tests.
 */
async function assertRollbackClean(email: string, gwBookingId: string): Promise<void> {
  const [u] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM "user" WHERE email = ${email}
  `);
  assert.strictEqual(Number(u!.c), 0, `No new user row committed for email ${email}`);

  const [b] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM booking
    WHERE source = 'gateway' AND external_reservation_code = ${gwBookingId}
  `);
  assert.strictEqual(Number(b!.c), 0, "No booking row committed");

  // No attribution since booking was not committed
  const [a] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM booking_attribution
    WHERE booking_id IN (
      SELECT id FROM booking WHERE external_reservation_code = ${gwBookingId}
    )
  `);
  assert.strictEqual(Number(a!.c), 0, "No booking_attribution row committed");

  const [g] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM gateway_booking_context
    WHERE gateway_booking_id = ${gwBookingId}::uuid
  `);
  assert.strictEqual(Number(g!.c), 0, "No gateway_booking_context row committed");
}

// ── T-R1: afterCustomerResolve throws — full rollback ─────────────────────────

test("T-R1: afterCustomerResolve hook throws — no rows committed in any table", async () => {
  const input = makeInput();
  const deliberateError = new Error("deliberate-rollback-r1");

  try {
    await runTx(input, {
      afterCustomerResolve: async () => { throw deliberateError; },
    });
    assert.fail("Expected the transaction to throw");
  } catch (err) {
    assert.strictEqual(err, deliberateError, "Deliberate error must propagate unchanged");
  }

  await assertRollbackClean(input.customerEmail, input.gatewayBookingId);
});

// ── T-R2: afterBookingInsert throws — full rollback ───────────────────────────

test("T-R2: afterBookingInsert hook throws — no rows committed in any table", async () => {
  const input = makeInput();
  const deliberateError = new Error("deliberate-rollback-r2");

  try {
    await runTx(input, {
      afterBookingInsert: async () => { throw deliberateError; },
    });
    assert.fail("Expected the transaction to throw");
  } catch (err) {
    assert.strictEqual(err, deliberateError, "Deliberate error must propagate unchanged");
  }

  await assertRollbackClean(input.customerEmail, input.gatewayBookingId);
});

// ── T-R3: afterAttributionInsert throws — full rollback ───────────────────────

test("T-R3: afterAttributionInsert hook throws — no rows committed in any table", async () => {
  const input = makeInput();
  const deliberateError = new Error("deliberate-rollback-r3");

  try {
    await runTx(input, {
      afterAttributionInsert: async () => { throw deliberateError; },
    });
    assert.fail("Expected the transaction to throw");
  } catch (err) {
    assert.strictEqual(err, deliberateError, "Deliberate error must propagate unchanged");
  }

  await assertRollbackClean(input.customerEmail, input.gatewayBookingId);
});

// ── T-R4: afterContextInsert throws — full rollback ───────────────────────────

test("T-R4: afterContextInsert hook throws — no rows committed in any table", async () => {
  const input = makeInput();
  const deliberateError = new Error("deliberate-rollback-r4");

  try {
    await runTx(input, {
      afterContextInsert: async () => { throw deliberateError; },
    });
    assert.fail("Expected the transaction to throw");
  } catch (err) {
    assert.strictEqual(err, deliberateError, "Deliberate error must propagate unchanged");
  }

  await assertRollbackClean(input.customerEmail, input.gatewayBookingId);
});

// ── T-C1: successful four-row atomic commit ───────────────────────────────────

test("T-C1: successful commit — all four rows present in committed state", async () => {
  const input = makeInput();
  let result!: RegionalIntakeTxResult;

  try {
    result = await runTx(input);
    assert.strictEqual(result.kind, "SUCCESS");
    const r = result as Extract<RegionalIntakeTxResult, { kind: "SUCCESS" }>;

    // GBC row committed
    const [gbc] = await q<{ booking_id: number }>(drizzleSql`
      SELECT booking_id FROM gateway_booking_context
      WHERE gateway_booking_id = ${input.gatewayBookingId}::uuid
    `);
    assert.ok(gbc, "GBC row must be committed");
    assert.strictEqual(gbc!.booking_id, r.bookingId);

    // Booking row committed
    const [bk] = await q<{ id: number }>(drizzleSql`
      SELECT id FROM booking WHERE id = ${r.bookingId}
    `);
    assert.ok(bk, "Booking row must be committed");

    // Attribution row committed
    const [attr] = await q<{ id: number }>(drizzleSql`
      SELECT id FROM booking_attribution WHERE booking_id = ${r.bookingId}
    `);
    assert.ok(attr, "Attribution row must be committed");

    // User row committed
    const [usr] = await q<{ id: number }>(drizzleSql`
      SELECT id FROM "user" WHERE email = ${input.customerEmail}
    `);
    assert.ok(usr, "User row must be committed");

    // Reference format
    const expected = "TC-" + String(r.bookingId).padStart(5, "0");
    assert.strictEqual(r.reference, expected, "Reference format must be TC-NNNNN");
  } finally {
    if (result?.kind === "SUCCESS") {
      await cleanupSuccess(result.bookingId, input.customerEmail);
    }
  }
});

// ── T-C2: existing customer — password_hash preserved ─────────────────────────

test("T-C2: existing customer — password_hash preserved, no field overwrite", async () => {
  const email = `c2b1-existing-${randomUUID()}@rbg-test.invalid`;
  const originalHash = "existing-hash-value";

  // Pre-create a user with a password_hash
  const [preUser] = await q<{ id: number }>(drizzleSql`
    INSERT INTO "user" (email, full_name, phone, password_hash)
    VALUES (${email}, 'Pre Existing', '+995599000001', ${originalHash})
    RETURNING id
  `);
  const preUserId = preUser!.id;

  const input = makeInput({ customerEmail: email, customerName: "Different Name" });
  let bookingId: number | undefined;

  try {
    const result = await runTx(input);
    assert.strictEqual(result.kind, "SUCCESS");
    bookingId = (result as Extract<RegionalIntakeTxResult, { kind: "SUCCESS" }>).bookingId;

    // All four original customer fields must be exactly preserved (DO NOTHING — no overwrite)
    const [usr] = await q<{
      email:         string | null;
      full_name:     string | null;
      phone:         string | null;
      password_hash: string | null;
    }>(drizzleSql`
      SELECT email, full_name, phone, password_hash FROM "user" WHERE id = ${preUserId}
    `);
    assert.strictEqual(usr!.email,         email,           "email must not be overwritten");
    assert.strictEqual(usr!.full_name,     "Pre Existing",  "full_name must not be overwritten");
    assert.strictEqual(usr!.phone,         "+995599000001", "phone must not be overwritten");
    assert.strictEqual(usr!.password_hash, originalHash,    "password_hash must not be overwritten");

    // booking.user_id must reference the exact pre-existing user
    const [bk] = await q<{ user_id: number }>(drizzleSql`
      SELECT user_id FROM booking WHERE id = ${bookingId}
    `);
    assert.strictEqual(bk!.user_id, preUserId, "booking.user_id must reference the pre-existing user");
  } finally {
    if (bookingId !== undefined) {
      await rawDb.execute(
        drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bookingId}`,
      );
      await rawDb.execute(drizzleSql`DELETE FROM booking WHERE id = ${bookingId}`);
    }
    await rawDb.execute(drizzleSql`DELETE FROM "user" WHERE id = ${preUserId}`);
  }
});

// ── T-C3: new customer — password_hash is NULL ────────────────────────────────

test("T-C3: new customer — password_hash is NULL", async () => {
  const input = makeInput();
  let result!: RegionalIntakeTxResult;

  try {
    result = await runTx(input);
    assert.strictEqual(result.kind, "SUCCESS");
    const r = result as Extract<RegionalIntakeTxResult, { kind: "SUCCESS" }>;

    const [usr] = await q<{ password_hash: string | null }>(drizzleSql`
      SELECT password_hash FROM "user" WHERE email = ${input.customerEmail}
    `);
    assert.strictEqual(usr!.password_hash, null, "New gateway customer must have NULL password_hash");
  } finally {
    if (result?.kind === "SUCCESS") {
      await cleanupSuccess(result.bookingId, input.customerEmail);
    }
  }
});

// ── T-C4: FINGERPRINT_VERSION stored explicitly ───────────────────────────────

test("T-C4: FINGERPRINT_VERSION stored explicitly in gateway_booking_context", async () => {
  const input = makeInput();
  let result!: RegionalIntakeTxResult;

  try {
    result = await runTx(input);
    assert.strictEqual(result.kind, "SUCCESS");
    const r = result as Extract<RegionalIntakeTxResult, { kind: "SUCCESS" }>;

    const [gbc] = await q<{
      booking_id:                  number;
      brand_code:                  string;
      gateway_booking_id:          string;
      gateway_quote_id:            string;
      payload_fingerprint_version: number;
      payload_fingerprint:         string;
      total_amount_cents:          string;   // BIGINT returned as string by raw pg driver
    }>(drizzleSql`
      SELECT
        booking_id,
        brand_code,
        gateway_booking_id::text      AS gateway_booking_id,
        gateway_quote_id::text        AS gateway_quote_id,
        payload_fingerprint_version,
        payload_fingerprint,
        total_amount_cents::text      AS total_amount_cents
      FROM gateway_booking_context
      WHERE booking_id = ${r.bookingId}
    `);
    assert.ok(gbc, "GBC row must be committed");
    assert.strictEqual(gbc!.booking_id,                  r.bookingId,                        "booking_id must match returned bookingId");
    assert.strictEqual(gbc!.brand_code,                  input.brandCode,                    "brand_code must match input.brandCode");
    assert.strictEqual(gbc!.gateway_booking_id,          input.gatewayBookingId,             "gateway_booking_id::text must match input");
    assert.strictEqual(gbc!.gateway_quote_id,            input.gatewayQuoteId,               "gateway_quote_id::text must match input");
    assert.strictEqual(gbc!.payload_fingerprint_version, FINGERPRINT_VERSION,                `payload_fingerprint_version must equal FINGERPRINT_VERSION (${FINGERPRINT_VERSION})`);
    assert.strictEqual(gbc!.payload_fingerprint,         input.payloadFingerprint,           "payload_fingerprint must match input");
    assert.strictEqual(gbc!.total_amount_cents,          String(input.totalAmountCents),     "total_amount_cents::text must match String(input.totalAmountCents)");
  } finally {
    if (result?.kind === "SUCCESS") {
      await cleanupSuccess(result.bookingId, input.customerEmail);
    }
  }
});

// ── T-C5: wall-clock storage — no timezone shift ──────────────────────────────

test("T-C5: wall-clock storage — pickup/dropoff round-trip exactly", async () => {
  const pickupLiteral  = "2026-10-15 09:30:00";
  const dropoffLiteral = "2026-10-20 17:45:00";
  const input = makeInput({
    pickupPgLiteral:  pickupLiteral,
    dropoffPgLiteral: dropoffLiteral,
  });
  let result!: RegionalIntakeTxResult;

  try {
    result = await runTx(input);
    assert.strictEqual(result.kind, "SUCCESS");
    const r = result as Extract<RegionalIntakeTxResult, { kind: "SUCCESS" }>;

    const [bk] = await q<{ pickup: string; dropoff: string }>(drizzleSql`
      SELECT
        to_char(pickup_datetime,  'YYYY-MM-DD HH24:MI:SS') AS pickup,
        to_char(dropoff_datetime, 'YYYY-MM-DD HH24:MI:SS') AS dropoff
      FROM booking
      WHERE id = ${r.bookingId}
    `);
    assert.strictEqual(bk!.pickup,  pickupLiteral,  "Pickup datetime must round-trip without shift");
    assert.strictEqual(bk!.dropoff, dropoffLiteral, "Dropoff datetime must round-trip without shift");
  } finally {
    if (result?.kind === "SUCCESS") {
      await cleanupSuccess(result.bookingId, input.customerEmail);
    }
  }
});

// ── T-C6: cents/NUMERIC — total_amount exact ──────────────────────────────────

test("T-C6: cents/NUMERIC — total_amount equals centsToDecimalString(totalAmountCents)", async () => {
  const totalAmountCents = 123456;   // → "1234.56"
  const input = makeInput({ totalAmountCents });
  let result!: RegionalIntakeTxResult;

  try {
    result = await runTx(input);
    assert.strictEqual(result.kind, "SUCCESS");
    const r = result as Extract<RegionalIntakeTxResult, { kind: "SUCCESS" }>;

    const [bk] = await q<{ total_amount: string }>(drizzleSql`
      SELECT total_amount::text AS total_amount FROM booking WHERE id = ${r.bookingId}
    `);
    const expected = centsToDecimalString(totalAmountCents);
    assert.strictEqual(bk!.total_amount, expected, `total_amount must equal ${expected}`);
  } finally {
    if (result?.kind === "SUCCESS") {
      await cleanupSuccess(result.bookingId, input.customerEmail);
    }
  }
});

// ── T-C7: explicit locked booking fields ──────────────────────────────────────

test("T-C7: explicit locked booking fields — source, currency, base_rate, customer_contacted, external_reservation_code", async () => {
  const input = makeInput();
  let result!: RegionalIntakeTxResult;

  try {
    result = await runTx(input);
    assert.strictEqual(result.kind, "SUCCESS");
    const r = result as Extract<RegionalIntakeTxResult, { kind: "SUCCESS" }>;

    const [bk] = await q<{
      user_id:                   number;
      vehicle_id:                number | null;
      vehicle_group_id:          number | null;
      vehicle_model_id:          number;
      pickup_location_id:        number;
      dropoff_location_id:       number;
      status:                    string;
      payment_status:            string;
      rate_id:                   number | null;
      rate_tier_id:              number | null;
      price_per_day:             string | null;
      base_rate:                 string;
      taxes:                     string;
      fees:                      string;
      discount:                  string;
      one_way_fee:               string;
      delivery_fee:              string;
      deposit:                   string;
      deposit_currency:          string | null;
      total_amount:              string;
      currency:                  string;
      contact_full_name:         string;
      contact_email:             string;
      contact_phone:             string;
      source:                    string;
      external_reservation_code: string;
      customer_contacted:        boolean;
    }>(drizzleSql`
      SELECT
        user_id,
        vehicle_id,
        vehicle_group_id,
        vehicle_model_id,
        pickup_location_id,
        dropoff_location_id,
        status,
        payment_status,
        rate_id,
        rate_tier_id,
        price_per_day::text    AS price_per_day,
        base_rate::text        AS base_rate,
        taxes::text            AS taxes,
        fees::text             AS fees,
        discount::text         AS discount,
        one_way_fee::text      AS one_way_fee,
        delivery_fee::text     AS delivery_fee,
        deposit::text          AS deposit,
        deposit_currency,
        total_amount::text     AS total_amount,
        currency,
        contact_full_name,
        contact_email,
        contact_phone,
        source,
        external_reservation_code,
        customer_contacted
      FROM booking
      WHERE id = ${r.bookingId}
    `);

    assert.ok(bk, "Booking row must be committed");
    assert.ok(bk!.user_id > 0,                                                                     "user_id must be a positive integer");
    assert.strictEqual(bk!.vehicle_id,                  null,                                       "vehicle_id must be NULL");
    assert.strictEqual(bk!.vehicle_group_id,            null,                                       "vehicle_group_id must be NULL");
    assert.strictEqual(bk!.vehicle_model_id,            input.vehicleModelId,                       "vehicle_model_id must match input");
    assert.strictEqual(bk!.pickup_location_id,          input.pickupLocationId,                     "pickup_location_id must match input");
    assert.strictEqual(bk!.dropoff_location_id,         input.dropoffLocationId,                    "dropoff_location_id must match input");
    assert.strictEqual(bk!.status,                      "PENDING",                                  "status must be 'PENDING'");
    assert.strictEqual(bk!.payment_status,              "UNPAID",                                   "payment_status must be 'UNPAID'");
    assert.strictEqual(bk!.rate_id,                     null,                                       "rate_id must be NULL");
    assert.strictEqual(bk!.rate_tier_id,                null,                                       "rate_tier_id must be NULL");
    assert.strictEqual(bk!.price_per_day,               null,                                       "price_per_day must be NULL");
    assert.strictEqual(bk!.base_rate,                   "0.00",                                     "base_rate must be '0.00' (numeric(10,2) storage)");
    assert.strictEqual(bk!.taxes,                       "0.00",                                     "taxes must be '0.00' (DB default)");
    assert.strictEqual(bk!.fees,                        "0.00",                                     "fees must be '0.00' (DB default)");
    assert.strictEqual(bk!.discount,                    "0.00",                                     "discount must be '0.00' (DB default)");
    assert.strictEqual(bk!.one_way_fee,                 "0.00",                                     "one_way_fee must be '0.00' (DB default)");
    assert.strictEqual(bk!.delivery_fee,                "0.00",                                     "delivery_fee must be '0.00' (DB default)");
    assert.strictEqual(bk!.deposit,                     "0.00",                                     "deposit must be '0.00' (DB default)");
    assert.strictEqual(bk!.deposit_currency,            null,                                       "deposit_currency must be NULL");
    assert.strictEqual(bk!.total_amount,                centsToDecimalString(input.totalAmountCents), "total_amount must equal centsToDecimalString(totalAmountCents)");
    assert.strictEqual(bk!.currency,                    "EUR",                                      "currency must be 'EUR'");
    assert.strictEqual(bk!.contact_full_name,           input.customerName,                         "contact_full_name must match customerName");
    assert.strictEqual(bk!.contact_email,               input.customerEmail,                        "contact_email must match customerEmail");
    assert.strictEqual(bk!.contact_phone,               input.customerPhone,                        "contact_phone must match customerPhone");
    assert.strictEqual(bk!.source,                      "gateway",                                  "source must be 'gateway'");
    assert.strictEqual(bk!.external_reservation_code,  input.gatewayBookingId,                     "external_reservation_code must equal gatewayBookingId");
    assert.strictEqual(bk!.customer_contacted,          false,                                      "customer_contacted must be false");
  } finally {
    if (result?.kind === "SUCCESS") {
      await cleanupSuccess(result.bookingId, input.customerEmail);
    }
  }
});

// ── T-C8: complete attribution values ─────────────────────────────────────────

test("T-C8: attribution values — source_domain=null, source_brand=brandCode, UTM/gclid/referrer/landing_path=null", async () => {
  const brandCode = "kutaisicars";
  const input = makeInput({ brandCode });
  let result!: RegionalIntakeTxResult;

  try {
    result = await runTx(input);
    assert.strictEqual(result.kind, "SUCCESS");
    const r = result as Extract<RegionalIntakeTxResult, { kind: "SUCCESS" }>;

    const [attr] = await q<{
      source_domain:  string | null;
      source_brand:   string | null;
      utm_source:     string | null;
      utm_medium:     string | null;
      utm_campaign:   string | null;
      utm_content:    string | null;
      utm_term:       string | null;
      gclid:          string | null;
      referrer:       string | null;
      landing_path:   string | null;
    }>(drizzleSql`
      SELECT
        source_domain, source_brand,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        gclid, referrer, landing_path
      FROM booking_attribution
      WHERE booking_id = ${r.bookingId}
    `);

    assert.strictEqual(attr!.source_domain, null,      "source_domain must be null");
    assert.strictEqual(attr!.source_brand,  brandCode, "source_brand must equal brandCode");
    assert.strictEqual(attr!.utm_source,    null,      "utm_source must be null");
    assert.strictEqual(attr!.utm_medium,    null,      "utm_medium must be null");
    assert.strictEqual(attr!.utm_campaign,  null,      "utm_campaign must be null");
    assert.strictEqual(attr!.utm_content,   null,      "utm_content must be null");
    assert.strictEqual(attr!.utm_term,      null,      "utm_term must be null");
    assert.strictEqual(attr!.gclid,         null,      "gclid must be null");
    assert.strictEqual(attr!.referrer,      null,      "referrer must be null");
    assert.strictEqual(attr!.landing_path,  null,      "landing_path must be null");
  } finally {
    if (result?.kind === "SUCCESS") {
      await cleanupSuccess(result.bookingId, input.customerEmail);
    }
  }
});

// ── T-C9: VEHICLE_MODEL_UNAVAILABLE — no customer row, no booking ─────────────

test("T-C9: VEHICLE_MODEL_UNAVAILABLE — outcome returned without creating any rows", async () => {
  // Use a vehicle model ID that does not exist in the test DB
  const nonExistentModelId = 999_999_998;
  const input = makeInput({ vehicleModelId: nonExistentModelId });

  const result = await runTx(input);
  assert.strictEqual(result.kind, "VEHICLE_MODEL_UNAVAILABLE");

  // No customer row should have been created
  const [u] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM "user" WHERE email = ${input.customerEmail}
  `);
  assert.strictEqual(Number(u!.c), 0, "No user row must be created for unavailable model");

  const [b] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM booking
    WHERE external_reservation_code = ${input.gatewayBookingId}
  `);
  assert.strictEqual(Number(b!.c), 0, "No booking row must be created for unavailable model");
});

// ── T-C10: LOCATION_UNAVAILABLE — no customer row, no booking ────────────────

test("T-C10: LOCATION_UNAVAILABLE — outcome returned without creating any rows", async () => {
  // Insert an inactive location for this test only
  const [inactiveLoc] = await q<{ id: number }>(drizzleSql`
    INSERT INTO location (name, is_active) VALUES ('C2b1 Loc Inactive', false) RETURNING id
  `);
  const inactiveLocId = inactiveLoc!.id;

  const input = makeInput({
    pickupLocationId:  inactiveLocId,
    dropoffLocationId: sharedLocBId,
  });

  try {
    const result = await runTx(input);
    assert.strictEqual(result.kind, "LOCATION_UNAVAILABLE");

    // No customer row should have been created
    const [u] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM "user" WHERE email = ${input.customerEmail}
    `);
    assert.strictEqual(Number(u!.c), 0, "No user row must be created for unavailable location");

    const [b] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking
      WHERE external_reservation_code = ${input.gatewayBookingId}
    `);
    assert.strictEqual(Number(b!.c), 0, "No booking row must be created for unavailable location");
  } finally {
    await rawDb.execute(drizzleSql`DELETE FROM location WHERE id = ${inactiveLocId}`);
  }
});
