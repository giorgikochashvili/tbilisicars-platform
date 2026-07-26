/**
 * regional-intake-dto.test.ts
 *
 * 16 locked test cases for the Regional Intake DTO Zod schema.
 * Tests parse/normalization semantics, rejection, and .strict() enforcement.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2a
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RegionalIntakeDtoSchema } from "../../lib/regional-intake-dto.js";

// ── Valid base body ───────────────────────────────────────────────────────────

function validBody(): Record<string, unknown> {
  return {
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
}

// ── Helper ────────────────────────────────────────────────────────────────────

function parse(body: Record<string, unknown>) {
  return RegionalIntakeDtoSchema.safeParse(body);
}

// ── Test cases ────────────────────────────────────────────────────────────────

describe("RegionalIntakeDtoSchema — 16 locked cases", () => {

  // Case 1: complete valid body
  test("1. complete valid body parses successfully with expected normalizations", () => {
    const result = parse(validBody());
    assert.ok(result.success, "expected parse success");
    if (!result.success) return;
    assert.strictEqual(result.data.customerEmail, "alice@example.com");
    assert.strictEqual(result.data.customerName,  "Alice Smith");
    assert.strictEqual(result.data.customerPhone, "+995500000000");
    assert.strictEqual(result.data.currency,      "EUR");
    assert.strictEqual(result.data.totalAmountCents, 15000);
  });

  // Case 2: extra unknown field → .strict() rejects
  test("2. extra unknown field rejected by .strict()", () => {
    const result = parse({ ...validBody(), extraField: "should fail" });
    assert.ok(!result.success, "expected parse failure for unknown field");
  });

  // Case 3: missing required field (customerPhone)
  test("3. missing customerPhone → parse error", () => {
    const body = validBody();
    delete body["customerPhone"];
    const result = parse(body);
    assert.ok(!result.success, "expected parse failure for missing customerPhone");
  });

  // Case 4: uppercase UUID in gatewayBookingId → regex rejects
  test("4. gatewayBookingId with uppercase hex (A) → parse error", () => {
    const result = parse({
      ...validBody(),
      gatewayBookingId: "00000000-0000-0000-0000-00000000000A",
    });
    assert.ok(!result.success, "expected parse failure for uppercase UUID");
  });

  // Case 5: non-UUID string in gatewayBookingId → regex rejects
  test("5. gatewayBookingId = 'not-a-uuid' → parse error", () => {
    const result = parse({ ...validBody(), gatewayBookingId: "not-a-uuid" });
    assert.ok(!result.success, "expected parse failure for non-UUID string");
  });

  // Case 6: whitespace-padded mixed-case email → normalized to lowercase, trimmed
  test("6. customerEmail '  Alice@EXAMPLE.COM  ' → parsed as 'alice@example.com'", () => {
    const result = parse({ ...validBody(), customerEmail: "  Alice@EXAMPLE.COM  " });
    assert.ok(result.success, "expected parse success");
    if (!result.success) return;
    assert.strictEqual(result.data.customerEmail, "alice@example.com");
  });

  // Case 7: whitespace-only email → empty after trim → min(1) fails
  test("7. customerEmail = '   ' (whitespace only) → parse error after trim", () => {
    const result = parse({ ...validBody(), customerEmail: "   " });
    assert.ok(!result.success, "expected parse failure for whitespace-only email");
  });

  // Case 8: non-email string (after normalization) → .email() fails
  test("8. customerEmail = 'notanemail' → parse error from .email()", () => {
    const result = parse({ ...validBody(), customerEmail: "notanemail" });
    assert.ok(!result.success, "expected parse failure for invalid email format");
  });

  // Case 9: internal spaces in customerName are preserved (trim only)
  test("9. customerName 'Alice  Smith' (two spaces) → output preserves internal spaces", () => {
    const result = parse({ ...validBody(), customerName: "Alice  Smith" });
    assert.ok(result.success, "expected parse success");
    if (!result.success) return;
    assert.strictEqual(result.data.customerName, "Alice  Smith");
  });

  // Case 10: customerPhone with surrounding whitespace → trimmed
  test("10. customerPhone '  +995500000000  ' → trimmed to '+995500000000'", () => {
    const result = parse({ ...validBody(), customerPhone: "  +995500000000  " });
    assert.ok(result.success, "expected parse success");
    if (!result.success) return;
    assert.strictEqual(result.data.customerPhone, "+995500000000");
  });

  // Case 11: currency GEL → z.literal("EUR") fails
  test("11. currency = 'GEL' → parse error (must be EUR)", () => {
    const result = parse({ ...validBody(), currency: "GEL" });
    assert.ok(!result.success, "expected parse failure for currency GEL");
  });

  // Case 12: totalAmountCents = 0 → .min(1) fails
  test("12. totalAmountCents = 0 → parse error (.min(1))", () => {
    const result = parse({ ...validBody(), totalAmountCents: 0 });
    assert.ok(!result.success, "expected parse failure for totalAmountCents = 0");
  });

  // Case 13: totalAmountCents = 9_999_999_999 → at maximum, valid
  test("13. totalAmountCents = 9_999_999_999 → parses successfully (maximum)", () => {
    const result = parse({ ...validBody(), totalAmountCents: 9_999_999_999 });
    assert.ok(result.success, "expected parse success at maximum cents");
    if (!result.success) return;
    assert.strictEqual(result.data.totalAmountCents, 9_999_999_999);
  });

  // Case 14: totalAmountCents = 10_000_000_000 → .max() fails
  test("14. totalAmountCents = 10_000_000_000 → parse error (.max(9_999_999_999))", () => {
    const result = parse({ ...validBody(), totalAmountCents: 10_000_000_000 });
    assert.ok(!result.success, "expected parse failure above maximum cents");
  });

  // Case 15: totalAmountCents = 1.5 → .int() fails
  test("15. totalAmountCents = 1.5 → parse error (.int())", () => {
    const result = parse({ ...validBody(), totalAmountCents: 1.5 });
    assert.ok(!result.success, "expected parse failure for non-integer cents");
  });

  // Case 16: totalAmountCents = Number.MAX_SAFE_INTEGER + 1 → .refine() fails
  test("16. totalAmountCents = Number.MAX_SAFE_INTEGER + 1 → parse error (.refine isSafeInteger)", () => {
    const result = parse({ ...validBody(), totalAmountCents: Number.MAX_SAFE_INTEGER + 1 });
    assert.ok(!result.success, "expected parse failure for unsafe integer");
  });

});
