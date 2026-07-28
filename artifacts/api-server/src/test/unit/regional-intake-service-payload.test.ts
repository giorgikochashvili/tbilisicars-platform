/**
 * regional-intake-service-payload.test.ts
 *
 * C2b-3b1: Unit tests for RegionalStaffNotification assembly in the service — 3 tests.
 *
 *   P-1: CREATED carries the exact notification assembled from tx SUCCESS fields
 *        and validated/normalized service input.
 *   P-2: pre-transaction REPLAYED carries no notification property.
 *   P-3: approved-23505 recovery REPLAYED carries no notification property.
 *
 * No DB. No pg. No real SQL. Transaction runner is stubbed.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2b3b1
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRegionalIntakeService,
  type RegionalIntakeTransactionRunner,
} from "../../services/regional-intake.service.js";
import type { RegionalStaffNotification } from "../../lib/regional-staff-notifier.js";
import type { RbgDb } from "../../repositories/regional-intake.repository.js";
import {
  computePayloadFingerprint,
  FINGERPRINT_VERSION,
} from "../../lib/regional-intake-helpers.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A fully-formed, valid parsedJson body. */
const VALID_PARSED_JSON = {
  gatewayBookingId:  "00000000-0000-0000-0000-000000000001",
  gatewayQuoteId:    "00000000-0000-0000-0000-000000000002",
  vehicleModelId:    1,
  pickupLocationId:  1,
  dropoffLocationId: 2,
  pickupDatetime:    "2026-09-01T10:00",
  dropoffDatetime:   "2026-09-05T10:00",
  totalAmountCents:  15000,
  currency:          "EUR" as const,
  customerName:      "Test Customer",
  customerEmail:     "unit-test@example.com",
  customerPhone:     "+995500000099",
};

/** Build a mock RbgDb whose execute() is driven by impl. */
function makeDb(
  impl: () => Promise<{ rows: Record<string, unknown>[] }>,
): RbgDb {
  return { execute: impl } as unknown as RbgDb;
}

/** Compute the expected fingerprint for VALID_PARSED_JSON + batumicars. */
function computeExpectedFingerprint(): string {
  return computePayloadFingerprint({
    brandCode:         "batumicars",
    gatewayBookingId:  VALID_PARSED_JSON.gatewayBookingId,
    gatewayQuoteId:    VALID_PARSED_JSON.gatewayQuoteId,
    vehicleModelId:    VALID_PARSED_JSON.vehicleModelId,
    pickupLocationId:  VALID_PARSED_JSON.pickupLocationId,
    dropoffLocationId: VALID_PARSED_JSON.dropoffLocationId,
    pickupDatetime:    VALID_PARSED_JSON.pickupDatetime,
    dropoffDatetime:   VALID_PARSED_JSON.dropoffDatetime,
    totalAmountCents:  VALID_PARSED_JSON.totalAmountCents,
    currency:          VALID_PARSED_JSON.currency,
    customerName:      VALID_PARSED_JSON.customerName,
    customerEmail:     VALID_PARSED_JSON.customerEmail.trim().toLowerCase(),
    customerPhone:     VALID_PARSED_JSON.customerPhone,
  });
}

/** Build a raw GBC row for the mock DB that produces a REPLAY classification. */
function makeGbcRow(overrides?: Record<string, unknown>): Record<string, unknown> {
  const fp = computeExpectedFingerprint();
  return {
    id:                          1,
    booking_id:                  42,
    brand_code:                  "batumicars",
    gateway_booking_id:          VALID_PARSED_JSON.gatewayBookingId,
    gateway_quote_id:            VALID_PARSED_JSON.gatewayQuoteId,
    payload_fingerprint_version: FINGERPRINT_VERSION,
    payload_fingerprint:         fp,
    total_amount_cents:          VALID_PARSED_JSON.totalAmountCents,
    created_at:                  new Date(),
    ...overrides,
  };
}

/** A transaction runner that returns a known SUCCESS result without invoking the callback. */
const SUCCESS_TX_RESULT = {
  kind:                "SUCCESS" as const,
  bookingId:           42,
  reference:           "TC-00042",
  pickupLocationName:  "Kutaisi Airport",
  dropoffLocationName: "Batumi Hotel",
  vehicleModelName:    "Sedan X",
};

const successRunner = (async (_cb: unknown) =>
  SUCCESS_TX_RESULT
) as unknown as RegionalIntakeTransactionRunner;

/** A transaction runner that must never be called. */
const MUST_NOT_CALL_RUNNER: RegionalIntakeTransactionRunner = async (_cb) => {
  assert.fail("runTransaction must not be called in this test");
};

// ── Tests ─────────────────────────────────────────────────────────────────────

// P-1: CREATED carries exact notification assembled from SUCCESS fields + validated input
test("P-1: CREATED notification exactly matches committed SUCCESS fields and validated service input", async () => {
  // DB returns empty rows → PROCEED (no existing context)
  const db = makeDb(async () => ({ rows: [] }));
  const svc = createRegionalIntakeService({ committedDb: db, runTransaction: successRunner });

  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "CREATED");
  if (result.kind !== "CREATED") return;

  const n: RegionalStaffNotification = result.notification;

  // From tx SUCCESS
  assert.strictEqual(n.bookingId,            SUCCESS_TX_RESULT.bookingId);
  assert.strictEqual(n.reference,            SUCCESS_TX_RESULT.reference);
  assert.strictEqual(n.pickupLocationName,   SUCCESS_TX_RESULT.pickupLocationName);
  assert.strictEqual(n.dropoffLocationName,  SUCCESS_TX_RESULT.dropoffLocationName);
  assert.strictEqual(n.vehicleModelName,     SUCCESS_TX_RESULT.vehicleModelName);

  // From validated/normalized service input
  assert.strictEqual(n.brandCode,            "batumicars");
  assert.strictEqual(n.customerName,         "Test Customer");    // trim only
  assert.strictEqual(n.customerEmail,        "unit-test@example.com"); // trim + lowercase
  assert.strictEqual(n.customerPhone,        "+995500000099");   // trim only
  assert.strictEqual(n.pickupDatetime,       "2026-09-01T10:00"); // ParsedWallClock.canonical
  assert.strictEqual(n.dropoffDatetime,      "2026-09-05T10:00");
  assert.strictEqual(n.totalAmountCents,     15000);
  assert.strictEqual(n.currency,             "EUR");
});

// P-2: pre-transaction REPLAYED carries no notification property
test("P-2: pre-transaction REPLAYED result carries no notification property", async () => {
  // DB returns matching GBC row → REPLAY classification at pre-read step
  const db = makeDb(async () => ({ rows: [makeGbcRow()] }));
  const svc = createRegionalIntakeService({
    committedDb:    db,
    runTransaction: MUST_NOT_CALL_RUNNER,
  });

  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "REPLAYED");
  assert.ok(
    !Object.prototype.hasOwnProperty.call(result, "notification"),
    "REPLAYED result must not contain a notification property",
  );
});

// P-3: approved-23505 recovery REPLAYED carries no notification property
test("P-3: approved-23505 recovery REPLAYED carries no notification property", async () => {
  const replayRow = makeGbcRow();
  let callCount = 0;
  // First call → PROCEED (empty); second call (after 23505 recovery) → REPLAY
  const db = makeDb(async () => {
    callCount++;
    if (callCount === 1) return { rows: [] };
    return { rows: [replayRow] };
  });

  const runner: RegionalIntakeTransactionRunner = async (_cb) => {
    throw Object.assign(new Error("dup"), {
      code:       "23505",
      constraint: "uq_gbc_brand_gateway_booking",
    });
  };

  const svc = createRegionalIntakeService({ committedDb: db, runTransaction: runner });

  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "REPLAYED");
  assert.ok(
    !Object.prototype.hasOwnProperty.call(result, "notification"),
    "23505-recovery REPLAYED result must not contain a notification property",
  );
});
