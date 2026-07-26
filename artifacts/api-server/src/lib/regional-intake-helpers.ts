/**
 * regional-intake-helpers.ts
 *
 * Pure, stateless helpers for the Regional Brands Gateway intake pipeline.
 * No database imports. No pg. No pool. No runtime @workspace/db dependency.
 *
 * Exports:
 *   ParsedWallClock               — datetime parse result
 *   FingerprintInput              — fingerprint computation input shape
 *   GatewayBookingContextRow      — structural mirror of GatewayBookingContext
 *   IdempotencyClassification     — sealed union returned by classifier
 *   centsToDecimalString          — BigInt-only money conversion
 *   parseAndValidateWallClockDatetime — real-calendar YYYY-MM-DDTHH:mm parser
 *   validateWallClockInterval     — lexicographic dropoff-after-pickup check
 *   computePayloadFingerprint     — SHA-256 over fixed-order JSON.stringify array
 *   classifyIdempotencyResult     — pure idempotency classifier
 */

import { createHash } from "node:crypto";

// ── ParsedWallClock ───────────────────────────────────────────────────────────

/**
 * Result of parseAndValidateWallClockDatetime.
 * - canonical: original validated input, used for fingerprinting.
 * - pgLiteral: "YYYY-MM-DD HH:mm:00", passed to PostgreSQL as TIMESTAMP literal.
 */
export interface ParsedWallClock {
  canonical: string;
  pgLiteral:  string;
}

// ── FingerprintInput ──────────────────────────────────────────────────────────

/** All fields consumed by computePayloadFingerprint, in definition order. */
export interface FingerprintInput {
  brandCode:         string;
  gatewayBookingId:  string;
  gatewayQuoteId:    string;
  vehicleModelId:    number;   // JSON.stringify encodes as number literal
  pickupLocationId:  number;
  dropoffLocationId: number;
  pickupDatetime:    string;   // canonical wall-clock string (ParsedWallClock.canonical)
  dropoffDatetime:   string;
  totalAmountCents:  number;
  currency:          string;
  customerName:      string;   // post-normalization: trim only
  customerEmail:     string;   // post-normalization: trim + lowercase
  customerPhone:     string;   // post-normalization: trim
}

// ── GatewayBookingContextRow ──────────────────────────────────────────────────

/**
 * Structural mirror of GatewayBookingContext from @workspace/db.
 * Defined here so regional-intake-helpers.ts has zero database runtime imports.
 * GatewayBookingContext from the DB is structurally assignable to this type.
 */
export interface GatewayBookingContextRow {
  id:                        number;
  bookingId:                 number;
  brandCode:                 string;
  gatewayBookingId:          string;
  gatewayQuoteId:            string;
  payloadFingerprintVersion: number;
  payloadFingerprint:        string;
  totalAmountCents:          number;
  createdAt:                 Date;
}

// ── IdempotencyClassification ─────────────────────────────────────────────────

export type IdempotencyClassification =
  | { kind: "PROCEED" }
  | { kind: "REPLAY";   context: GatewayBookingContextRow }
  | { kind: "CONFLICT" };

// ── centsToDecimalString ──────────────────────────────────────────────────────

/**
 * Converts an integer cent value to a decimal string using BigInt arithmetic.
 * No Math.floor. No floating-point division.
 *
 * @throws TypeError when cents is not a safe integer in [1, 9_999_999_999].
 *
 * Examples: 100 → "1.00", 50 → "0.50", 15000 → "150.00", 9999999999 → "99999999.99"
 */
export function centsToDecimalString(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 9_999_999_999) {
    throw new TypeError("centsToDecimalString: invalid input");
  }
  const n        = BigInt(cents);
  const whole    = n / 100n;
  const fraction = n % 100n;
  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

// ── parseAndValidateWallClockDatetime ─────────────────────────────────────────

/**
 * Returns the number of days in the given month.
 * month is 1-based (1 = January, 12 = December).
 * Applies proleptic Gregorian leap-year rule.
 */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/**
 * Parses and validates a YYYY-MM-DDTHH:mm wall-clock datetime string.
 *
 * Validation rules (in order):
 *   1. raw.length === 16
 *   2. regex /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
 *   3. month in [1, 12]
 *   4. day in [1, daysInMonth(year, month)]  — real-calendar, leap-year aware
 *   5. hour in [0, 23]
 *   6. minute in [0, 59]
 *
 * @throws TypeError with a bounded message (no raw input values) on any failure.
 *
 * new Date() is prohibited on this path.
 */
export function parseAndValidateWallClockDatetime(raw: string): ParsedWallClock {
  if (raw.length !== 16) {
    throw new TypeError("datetime must be exactly 16 characters (YYYY-MM-DDTHH:mm)");
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    throw new TypeError("datetime must match YYYY-MM-DDTHH:mm");
  }

  const year   = parseInt(raw.slice(0,  4),  10);
  const month  = parseInt(raw.slice(5,  7),  10);
  const day    = parseInt(raw.slice(8,  10), 10);
  const hour   = parseInt(raw.slice(11, 13), 10);
  const minute = parseInt(raw.slice(14, 16), 10);

  if (month < 1 || month > 12) {
    throw new TypeError("datetime has invalid month");
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new TypeError("datetime has invalid day for the given month and year");
  }
  if (hour > 23) {
    throw new TypeError("datetime has invalid hour");
  }
  if (minute > 59) {
    throw new TypeError("datetime has invalid minute");
  }

  return {
    canonical: raw,
    pgLiteral: raw.replace("T", " ") + ":00",
  };
}

// ── validateWallClockInterval ─────────────────────────────────────────────────

/**
 * Validates that dropoff is strictly after pickup.
 * Both inputs must already be validated YYYY-MM-DDTHH:mm canonical strings.
 * Lexicographic string comparison is correct for ISO-8601 wall-clock strings
 * of equal length (YYYY-MM-DDTHH:mm).
 *
 * No Date construction.
 * Does not include request values in the exception message.
 *
 * @throws TypeError when dropoff is not strictly after pickup.
 */
export function validateWallClockInterval(
  pickup:  string,
  dropoff: string,
): void {
  if (dropoff <= pickup) {
    throw new TypeError("dropoffDatetime must be strictly after pickupDatetime");
  }
}

// ── computePayloadFingerprint ─────────────────────────────────────────────────

/**
 * Computes SHA-256 fingerprint over a fixed-order JSON.stringify array.
 *
 * Element order is locked and must never change:
 *   [ "rbg-core-intake-v1", brandCode, gatewayBookingId, gatewayQuoteId,
 *     vehicleModelId, pickupLocationId, dropoffLocationId,
 *     pickupDatetime, dropoffDatetime, totalAmountCents,
 *     currency, customerName, customerEmail, customerPhone ]
 *
 * Number fields are encoded as JSON number literals (not strings).
 * Do NOT use delimiter join.
 *
 * @returns Exactly 64 lowercase hex characters.
 */
export function computePayloadFingerprint(input: FingerprintInput): string {
  const arr = [
    "rbg-core-intake-v1",
    input.brandCode,
    input.gatewayBookingId,
    input.gatewayQuoteId,
    input.vehicleModelId,
    input.pickupLocationId,
    input.dropoffLocationId,
    input.pickupDatetime,
    input.dropoffDatetime,
    input.totalAmountCents,
    input.currency,
    input.customerName,
    input.customerEmail,
    input.customerPhone,
  ];
  const serialized = JSON.stringify(arr);
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

// ── classifyIdempotencyResult ─────────────────────────────────────────────────

/**
 * Pure idempotency classifier. No I/O.
 *
 * Rules:
 *   rows.length === 0                     → PROCEED
 *   rows.length === 1 AND all five match  → REPLAY
 *     (brandCode, gatewayBookingId, gatewayQuoteId,
 *      payloadFingerprintVersion === 1, payloadFingerprint, totalAmountCents)
 *   rows.length === 1 AND any mismatch    → CONFLICT
 *   rows.length >= 2                      → CONFLICT
 *
 * Never classify a single booking-ID match alone as REPLAY.
 */
export function classifyIdempotencyResult(
  rows: GatewayBookingContextRow[],
  params: {
    brandCode:          string;
    gatewayBookingId:   string;
    gatewayQuoteId:     string;
    payloadFingerprint: string;
    totalAmountCents:   number;
  },
): IdempotencyClassification {
  if (rows.length === 0) {
    return { kind: "PROCEED" };
  }
  if (rows.length > 1) {
    return { kind: "CONFLICT" };
  }
  const row = rows[0]!;
  const isReplay =
    row.brandCode                 === params.brandCode          &&
    row.gatewayBookingId          === params.gatewayBookingId   &&
    row.gatewayQuoteId            === params.gatewayQuoteId     &&
    row.payloadFingerprintVersion === 1                         &&
    row.payloadFingerprint        === params.payloadFingerprint &&
    row.totalAmountCents          === params.totalAmountCents;
  return isReplay ? { kind: "REPLAY", context: row } : { kind: "CONFLICT" };
}
