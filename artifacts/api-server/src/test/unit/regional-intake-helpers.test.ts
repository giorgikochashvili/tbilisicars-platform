/**
 * regional-intake-helpers.test.ts
 *
 * Unit tests for all helpers in regional-intake-helpers.ts.
 * No database. No network. No I/O.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2a
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  centsToDecimalString,
  parseAndValidateWallClockDatetime,
  validateWallClockInterval,
  computePayloadFingerprint,
  classifyIdempotencyResult,
} from "../../lib/regional-intake-helpers.js";
import type {
  GatewayBookingContextRow,
  FingerprintInput,
} from "../../lib/regional-intake-helpers.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<GatewayBookingContextRow> = {}): GatewayBookingContextRow {
  return {
    id:                        1,
    bookingId:                 10,
    brandCode:                 "batumicars",
    gatewayBookingId:          "00000000-0000-0000-0000-000000000001",
    gatewayQuoteId:            "00000000-0000-0000-0000-000000000002",
    payloadFingerprintVersion: 1,
    payloadFingerprint:        "a".repeat(64),
    totalAmountCents:          15000,
    createdAt:                 new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ── centsToDecimalString ──────────────────────────────────────────────────────

describe("centsToDecimalString", () => {
  test("100 → '1.00'", () => {
    assert.strictEqual(centsToDecimalString(100), "1.00");
  });

  test("1 → '0.01'", () => {
    assert.strictEqual(centsToDecimalString(1), "0.01");
  });

  test("50 → '0.50'", () => {
    assert.strictEqual(centsToDecimalString(50), "0.50");
  });

  test("9999999999 → '99999999.99'", () => {
    assert.strictEqual(centsToDecimalString(9_999_999_999), "99999999.99");
  });

  test("15000 → '150.00'", () => {
    assert.strictEqual(centsToDecimalString(15000), "150.00");
  });

  test("0 → TypeError", () => {
    assert.throws(() => centsToDecimalString(0), TypeError);
  });

  test("-1 → TypeError", () => {
    assert.throws(() => centsToDecimalString(-1), TypeError);
  });

  test("10_000_000_000 → TypeError", () => {
    assert.throws(() => centsToDecimalString(10_000_000_000), TypeError);
  });

  test("1.5 (non-integer) → TypeError", () => {
    assert.throws(() => centsToDecimalString(1.5), TypeError);
  });

  test("Number.MAX_SAFE_INTEGER + 1 (unsafe integer) → TypeError", () => {
    assert.throws(() => centsToDecimalString(Number.MAX_SAFE_INTEGER + 1), TypeError);
  });
});

// ── parseAndValidateWallClockDatetime ─────────────────────────────────────────

describe("parseAndValidateWallClockDatetime", () => {
  test("valid datetime → correct canonical and pgLiteral", () => {
    const result = parseAndValidateWallClockDatetime("2026-08-01T10:00");
    assert.strictEqual(result.canonical, "2026-08-01T10:00");
    assert.strictEqual(result.pgLiteral, "2026-08-01 10:00:00");
  });

  test("2024-02-29T23:59 → valid (leap year 2024)", () => {
    const result = parseAndValidateWallClockDatetime("2024-02-29T23:59");
    assert.strictEqual(result.canonical, "2024-02-29T23:59");
    assert.strictEqual(result.pgLiteral, "2024-02-29 23:59:00");
  });

  test("2025-02-29T00:00 → TypeError (2025 is not a leap year)", () => {
    assert.throws(
      () => parseAndValidateWallClockDatetime("2025-02-29T00:00"),
      TypeError,
    );
  });

  test("2100-02-29T00:00 → TypeError (2100 divisible by 100 but not 400)", () => {
    assert.throws(
      () => parseAndValidateWallClockDatetime("2100-02-29T00:00"),
      TypeError,
    );
  });

  test("2000-02-29T00:00 → valid (2000 divisible by 400)", () => {
    const result = parseAndValidateWallClockDatetime("2000-02-29T00:00");
    assert.strictEqual(result.canonical, "2000-02-29T00:00");
  });

  test("2026-13-01T10:00 → TypeError (invalid month)", () => {
    assert.throws(
      () => parseAndValidateWallClockDatetime("2026-13-01T10:00"),
      TypeError,
    );
  });

  test("2026-08-32T10:00 → TypeError (invalid day)", () => {
    assert.throws(
      () => parseAndValidateWallClockDatetime("2026-08-32T10:00"),
      TypeError,
    );
  });

  test("2026-08-01T24:00 → TypeError (invalid hour)", () => {
    assert.throws(
      () => parseAndValidateWallClockDatetime("2026-08-01T24:00"),
      TypeError,
    );
  });

  test("2026-08-01T10:60 → TypeError (invalid minute)", () => {
    assert.throws(
      () => parseAndValidateWallClockDatetime("2026-08-01T10:60"),
      TypeError,
    );
  });

  test("'2026-08-01T10:00:00' (19 chars) → TypeError (wrong length)", () => {
    assert.throws(
      () => parseAndValidateWallClockDatetime("2026-08-01T10:00:00"),
      TypeError,
    );
  });

  test("'2026-08-01' (no time) → TypeError", () => {
    assert.throws(
      () => parseAndValidateWallClockDatetime("2026-08-01"),
      TypeError,
    );
  });

  test("'' (empty string) → TypeError", () => {
    assert.throws(
      () => parseAndValidateWallClockDatetime(""),
      TypeError,
    );
  });
});

// ── validateWallClockInterval ─────────────────────────────────────────────────

describe("validateWallClockInterval", () => {
  test("valid interval (4 days apart) → no throw", () => {
    assert.doesNotThrow(() =>
      validateWallClockInterval("2026-08-01T10:00", "2026-08-05T10:00"),
    );
  });

  test("equal datetimes → TypeError (not strictly after)", () => {
    assert.throws(
      () => validateWallClockInterval("2026-08-01T10:00", "2026-08-01T10:00"),
      TypeError,
    );
  });

  test("dropoff earlier than pickup → TypeError", () => {
    assert.throws(
      () => validateWallClockInterval("2026-08-05T10:00", "2026-08-01T10:00"),
      TypeError,
    );
  });

  test("valid cross-day interval → no throw", () => {
    assert.doesNotThrow(() =>
      validateWallClockInterval("2026-08-01T23:00", "2026-08-02T00:00"),
    );
  });

  test("valid cross-month interval → no throw", () => {
    assert.doesNotThrow(() =>
      validateWallClockInterval("2026-08-31T23:59", "2026-09-01T00:00"),
    );
  });

  test("valid cross-year interval → no throw", () => {
    assert.doesNotThrow(() =>
      validateWallClockInterval("2026-12-31T23:59", "2027-01-01T00:00"),
    );
  });

  test("valid leap-day interval → no throw", () => {
    assert.doesNotThrow(() =>
      validateWallClockInterval("2024-02-29T10:00", "2024-03-01T10:00"),
    );
  });

  test("dropoff one minute earlier → TypeError", () => {
    assert.throws(
      () => validateWallClockInterval("2026-08-01T10:00", "2026-08-01T09:59"),
      TypeError,
    );
  });
});

// ── computePayloadFingerprint ─────────────────────────────────────────────────

describe("computePayloadFingerprint", () => {
  const goldenInput: FingerprintInput = {
    brandCode:         "batumicars",
    gatewayBookingId:  "00000000-0000-0000-0000-000000000001",
    gatewayQuoteId:    "00000000-0000-0000-0000-000000000002",
    vehicleModelId:    42,
    pickupLocationId:  7,
    dropoffLocationId: 9,
    pickupDatetime:    "2026-08-01T10:00",
    dropoffDatetime:   "2026-08-05T10:00",
    totalAmountCents:  15000,
    currency:          "EUR",
    customerName:      "Alice Smith",
    customerEmail:     "alice@example.com",
    customerPhone:     "+995500000000",
  };

  const EXPECTED_HASH =
    "0b2dacc56670f63af222afa413a4da3cf5f8b5eb14ee97cd4a28b835d121dbf3";

  test("golden vector matches locked expected hash", () => {
    assert.strictEqual(computePayloadFingerprint(goldenInput), EXPECTED_HASH);
  });

  test("changing brandCode changes the fingerprint", () => {
    const h = computePayloadFingerprint({ ...goldenInput, brandCode: "kutaisicars" });
    assert.notStrictEqual(h, EXPECTED_HASH);
  });

  test("changing vehicleModelId changes the fingerprint", () => {
    const h = computePayloadFingerprint({ ...goldenInput, vehicleModelId: 99 });
    assert.notStrictEqual(h, EXPECTED_HASH);
  });

  test("changing customerEmail changes the fingerprint", () => {
    const h = computePayloadFingerprint({ ...goldenInput, customerEmail: "bob@example.com" });
    assert.notStrictEqual(h, EXPECTED_HASH);
  });
});

// ── classifyIdempotencyResult ─────────────────────────────────────────────────

describe("classifyIdempotencyResult", () => {
  const baseParams = {
    brandCode:          "batumicars",
    gatewayBookingId:   "00000000-0000-0000-0000-000000000001",
    gatewayQuoteId:     "00000000-0000-0000-0000-000000000002",
    payloadFingerprint: "a".repeat(64),
    totalAmountCents:   15000,
  };

  const matchingRow = makeRow({
    brandCode:                 baseParams.brandCode,
    gatewayBookingId:          baseParams.gatewayBookingId,
    gatewayQuoteId:            baseParams.gatewayQuoteId,
    payloadFingerprintVersion: 1,
    payloadFingerprint:        baseParams.payloadFingerprint,
    totalAmountCents:          baseParams.totalAmountCents,
  });

  test("0 rows → PROCEED", () => {
    const result = classifyIdempotencyResult([], baseParams);
    assert.strictEqual(result.kind, "PROCEED");
  });

  test("1 matching row → REPLAY with context", () => {
    const result = classifyIdempotencyResult([matchingRow], baseParams);
    assert.strictEqual(result.kind, "REPLAY");
    if (result.kind === "REPLAY") {
      assert.strictEqual(result.context, matchingRow);
    }
  });

  test("1 row with different fingerprint → CONFLICT", () => {
    const row = makeRow({ payloadFingerprint: "b".repeat(64) });
    const result = classifyIdempotencyResult([row], baseParams);
    assert.strictEqual(result.kind, "CONFLICT");
  });

  test("1 row with different gatewayQuoteId → CONFLICT", () => {
    const row = makeRow({ gatewayQuoteId: "00000000-0000-0000-0000-000000000099" });
    const result = classifyIdempotencyResult([row], baseParams);
    assert.strictEqual(result.kind, "CONFLICT");
  });

  test("1 row with different gatewayBookingId → CONFLICT", () => {
    const row = makeRow({ gatewayBookingId: "00000000-0000-0000-0000-000000000099" });
    const result = classifyIdempotencyResult([row], baseParams);
    assert.strictEqual(result.kind, "CONFLICT");
  });

  test("1 row with different totalAmountCents → CONFLICT", () => {
    const row = makeRow({ totalAmountCents: 99999 });
    const result = classifyIdempotencyResult([row], baseParams);
    assert.strictEqual(result.kind, "CONFLICT");
  });

  test("1 row with payloadFingerprintVersion = 2 → CONFLICT", () => {
    const row = makeRow({ payloadFingerprintVersion: 2 });
    const result = classifyIdempotencyResult([row], baseParams);
    assert.strictEqual(result.kind, "CONFLICT");
  });

  test("2 rows → CONFLICT", () => {
    const result = classifyIdempotencyResult([matchingRow, makeRow({ id: 2 })], baseParams);
    assert.strictEqual(result.kind, "CONFLICT");
  });
});
