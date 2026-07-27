/**
 * regional-intake-service.test.ts
 *
 * Pure unit tests for C2b-2: pg-error-metadata extractor (10 tests) and
 * regional-intake service orchestration (17 tests).
 *
 * No DB. No pg. No real SQL. executeRegionalIntakeTransactionTx never runs.
 * Transaction runners throw or exit before callback invocation.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2b2
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPostgresErrorMetadata } from "../../lib/pg-error-metadata.js";
import {
  createRegionalIntakeService,
  type RegionalIntakeTransactionRunner,
} from "../../services/regional-intake.service.js";
import { RegionalIntakeInternalError } from "../../repositories/regional-intake-write.repository.js";
import {
  computePayloadFingerprint,
  FINGERPRINT_VERSION,
} from "../../lib/regional-intake-helpers.js";
import type { RbgDb } from "../../repositories/regional-intake.repository.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A valid fully-formed parsedJson body. */
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

/** Build a mock RbgDb whose execute() returns the given rows on each call. */
function makeDb(
  impl: () => Promise<{ rows: Record<string, unknown>[] }>,
): RbgDb {
  return { execute: impl } as unknown as RbgDb;
}

/** A mock runTransaction that throws immediately without invoking the callback. */
function throwingRunner(
  error: unknown,
): RegionalIntakeTransactionRunner {
  return async (_callback) => {
    throw error;
  };
}

/** A mock runTransaction that never resolves (shouldn't be called). */
const MUST_NOT_CALL_RUNNER: RegionalIntakeTransactionRunner = async (_callback) => {
  assert.fail("runTransaction must not be called in this test");
};

/** Build a raw mock GBC row for lookupGatewayContextsForIdentifiers. */
function makeGbcRow(overrides?: Record<string, unknown>): Record<string, unknown> {
  const fp = computeExpectedFingerprint();
  return {
    id:                        1,
    booking_id:                42,
    brand_code:                "batumicars",
    gateway_booking_id:        VALID_PARSED_JSON.gatewayBookingId,
    gateway_quote_id:          VALID_PARSED_JSON.gatewayQuoteId,
    payload_fingerprint_version: FINGERPRINT_VERSION,
    payload_fingerprint:       fp,
    total_amount_cents:        VALID_PARSED_JSON.totalAmountCents,
    created_at:                new Date(),
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// PG METADATA EXTRACTOR — 10 tests
// ══════════════════════════════════════════════════════════════════════════════

test("PG-1: direct error with code and constraint → both extracted", () => {
  const err = Object.assign(new Error("dup"), { code: "23505", constraint: "uq_test" });
  const result = extractPostgresErrorMetadata(err);
  assert.strictEqual(result.code, "23505");
  assert.strictEqual(result.constraint, "uq_test");
});

test("PG-2: one-level cause-wrapped — code/constraint on cause → extracted", () => {
  const cause = Object.assign(new Error("inner"), { code: "23505", constraint: "uq_inner" });
  const outer = Object.assign(new Error("outer"), { cause });
  const result = extractPostgresErrorMetadata(outer);
  assert.strictEqual(result.code, "23505");
  assert.strictEqual(result.constraint, "uq_inner");
});

test("PG-3: code-only — constraint absent → only code returned", () => {
  const err = Object.assign(new Error("dup"), { code: "23505" });
  const result = extractPostgresErrorMetadata(err);
  assert.strictEqual(result.code, "23505");
  assert.strictEqual(result.constraint, undefined);
});

test("PG-4: constraint-only — code absent → only constraint returned", () => {
  const err = Object.assign(new Error("dup"), { constraint: "uq_foo" });
  const result = extractPostgresErrorMetadata(err);
  assert.strictEqual(result.code, undefined);
  assert.strictEqual(result.constraint, "uq_foo");
});

test("PG-5: non-string code and constraint (numbers) → {} returned for each", () => {
  const cases: unknown[] = [
    Object.assign(new Error("a"), { code: 23505, constraint: 99 }),
    Object.assign(new Error("b"), { code: 23505 }),
  ];
  for (const c of cases) {
    const r = extractPostgresErrorMetadata(c);
    assert.strictEqual(typeof r.code === "string" ? r.code : undefined, undefined,
      "numeric code must not be extracted as string");
    assert.strictEqual(typeof r.constraint === "string" ? r.constraint : undefined, undefined,
      "numeric constraint must not be extracted as string");
  }
});

test("PG-6: null and primitives → {} returned for each (table-driven)", () => {
  const inputs: unknown[] = [null, 0, "str", undefined];
  for (const input of inputs) {
    const r = extractPostgresErrorMetadata(input);
    assert.strictEqual(r.code, undefined, `code must be undefined for ${String(input)}`);
    assert.strictEqual(r.constraint, undefined, `constraint must be undefined for ${String(input)}`);
  }
});

test("PG-7: self-referential cause cycle → {} with no infinite loop or throw", () => {
  const err = new Error("cycle") as Error & { cause?: unknown };
  err.cause = err;
  let result!: { code?: string; constraint?: string };
  assert.doesNotThrow(() => {
    result = extractPostgresErrorMetadata(err);
  });
  assert.strictEqual(result.code, undefined);
  assert.strictEqual(result.constraint, undefined);
});

test("PG-8: direct and cause both present but neither has code or constraint → {}", () => {
  const cause = new Error("inner");
  const outer = Object.assign(new Error("outer"), { cause });
  const result = extractPostgresErrorMetadata(outer);
  assert.strictEqual(result.code, undefined);
  assert.strictEqual(result.constraint, undefined);
});

test("PG-9: throwing code and constraint getters → extractor must not throw", () => {
  const err = Object.create(Error.prototype) as Record<string, unknown>;
  Object.defineProperty(err, "code", { get() { throw new Error("hostile"); }, configurable: true });
  Object.defineProperty(err, "constraint", { get() { throw new Error("hostile"); }, configurable: true });
  let result!: { code?: string; constraint?: string };
  assert.doesNotThrow(() => {
    result = extractPostgresErrorMetadata(err);
  });
  // Result is bounded partial or empty — must not throw
  assert.ok(result !== null && typeof result === "object");
});

test("PG-10: throwing cause getter → extractor returns {} and must not throw", () => {
  const err = Object.create(Error.prototype) as Record<string, unknown>;
  Object.defineProperty(err, "cause", { get() { throw new Error("hostile cause"); }, configurable: true });
  let result!: { code?: string; constraint?: string };
  assert.doesNotThrow(() => {
    result = extractPostgresErrorMetadata(err);
  });
  assert.strictEqual(result.code, undefined);
  assert.strictEqual(result.constraint, undefined);
});

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE UNIT TESTS — 17 tests
// ══════════════════════════════════════════════════════════════════════════════

test("SVC-1: missing-field validation → VALIDATION_ERROR with path+code, no message key", async () => {
  const db = makeDb(async () => ({ rows: [] }));
  const svc = createRegionalIntakeService({ committedDb: db, runTransaction: MUST_NOT_CALL_RUNNER });
  const result = await svc({ brandCode: "batumicars", parsedJson: { gatewayBookingId: "bad" } });
  assert.strictEqual(result.kind, "VALIDATION_ERROR");
  if (result.kind !== "VALIDATION_ERROR") return;
  assert.ok(result.issues.length >= 1, "must have at least one issue");
  for (const iss of result.issues) {
    assert.strictEqual(typeof iss.path, "string");
    assert.strictEqual(typeof iss.code, "string");
    assert.ok(!("message" in iss), "issues must not have a message key");
  }
});

test("SVC-2: strict extra-field validation → VALIDATION_ERROR, path does not expose key name", async () => {
  const db = makeDb(async () => ({ rows: [] }));
  const svc = createRegionalIntakeService({ committedDb: db, runTransaction: MUST_NOT_CALL_RUNNER });
  const parsedJson = { ...VALID_PARSED_JSON, unknownExtraField: "oops" };
  const result = await svc({ brandCode: "batumicars", parsedJson });
  assert.strictEqual(result.kind, "VALIDATION_ERROR");
  if (result.kind !== "VALIDATION_ERROR") return;
  assert.ok(result.issues.length >= 1);
  // The path for unrecognized_keys is empty ("") — the key name must not appear
  for (const iss of result.issues) {
    assert.ok(!iss.path.includes("unknownExtraField"),
      "path must not expose the unrecognized key name");
  }
});

test("SVC-3: validation issues capped at 8 — {} input (12 missing fields)", async () => {
  const db = makeDb(async () => ({ rows: [] }));
  const svc = createRegionalIntakeService({ committedDb: db, runTransaction: MUST_NOT_CALL_RUNNER });
  const result = await svc({ brandCode: "batumicars", parsedJson: {} });
  assert.strictEqual(result.kind, "VALIDATION_ERROR");
  if (result.kind !== "VALIDATION_ERROR") return;
  assert.strictEqual(result.issues.length, 8, "issues must be capped at exactly 8");
});

test("SVC-4: invalid pickup datetime → INVALID_DATETIME, no DB or tx calls", async () => {
  // "2026-13-01T10:00" matches the DTO regex but month 13 is semantically invalid.
  let dbCalled = false;
  const db = makeDb(async () => { dbCalled = true; return { rows: [] }; });
  const svc = createRegionalIntakeService({ committedDb: db, runTransaction: MUST_NOT_CALL_RUNNER });
  const result = await svc({
    brandCode:  "batumicars",
    parsedJson: { ...VALID_PARSED_JSON, pickupDatetime: "2026-13-01T10:00" },
  });
  assert.strictEqual(result.kind, "INVALID_DATETIME");
  assert.strictEqual(dbCalled, false, "committedDb must not be called");
});

test("SVC-5: invalid dropoff datetime → INVALID_DATETIME, no DB calls", async () => {
  // "2026-02-30T10:00" passes the DTO regex but February 30 is semantically invalid.
  let dbCalled = false;
  const db = makeDb(async () => { dbCalled = true; return { rows: [] }; });
  const svc = createRegionalIntakeService({ committedDb: db, runTransaction: MUST_NOT_CALL_RUNNER });
  const result = await svc({
    brandCode:  "batumicars",
    parsedJson: { ...VALID_PARSED_JSON, dropoffDatetime: "2026-02-30T10:00" },
  });
  assert.strictEqual(result.kind, "INVALID_DATETIME");
  assert.strictEqual(dbCalled, false, "committedDb must not be called");
});

test("SVC-6: non-later interval (dropoff == pickup) → INVALID_DATETIME, no DB calls", async () => {
  let dbCalled = false;
  const db = makeDb(async () => { dbCalled = true; return { rows: [] }; });
  const svc = createRegionalIntakeService({ committedDb: db, runTransaction: MUST_NOT_CALL_RUNNER });
  const result = await svc({
    brandCode:  "batumicars",
    parsedJson: { ...VALID_PARSED_JSON, pickupDatetime: "2026-09-05T10:00", dropoffDatetime: "2026-09-05T10:00" },
  });
  assert.strictEqual(result.kind, "INVALID_DATETIME");
  assert.strictEqual(dbCalled, false, "committedDb must not be called");
});

test("SVC-7: pre-read REPLAYED — no transaction, no proceed hook called", async () => {
  const replayRow = makeGbcRow();
  const db = makeDb(async () => ({ rows: [replayRow] }));
  let txCalled = false;
  let hookCalled = false;
  const runner: RegionalIntakeTransactionRunner = async (_cb) => { txCalled = true; return undefined as never; };
  const svc = createRegionalIntakeService({
    committedDb:   db,
    runTransaction: runner,
    svcTestHooks:  { afterPreReadProceed: async () => { hookCalled = true; } },
  });
  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "REPLAYED");
  if (result.kind !== "REPLAYED") return;
  assert.strictEqual(result.bookingId, 42);
  assert.strictEqual(result.created, false);
  assert.strictEqual(txCalled, false, "runTransaction must not be called");
  assert.strictEqual(hookCalled, false, "afterPreReadProceed must not be called");
});

test("SVC-8: pre-read CONFLICT — no transaction, no proceed hook called", async () => {
  // Same booking ID, different fingerprint → CONFLICT
  const conflictRow = makeGbcRow({ payload_fingerprint: "a".repeat(64) });
  const db = makeDb(async () => ({ rows: [conflictRow] }));
  let txCalled = false;
  let hookCalled = false;
  const runner: RegionalIntakeTransactionRunner = async (_cb) => { txCalled = true; return undefined as never; };
  const svc = createRegionalIntakeService({
    committedDb:   db,
    runTransaction: runner,
    svcTestHooks:  { afterPreReadProceed: async () => { hookCalled = true; } },
  });
  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "CONFLICT");
  assert.strictEqual(txCalled, false, "runTransaction must not be called");
  assert.strictEqual(hookCalled, false, "afterPreReadProceed must not be called");
});

test("SVC-9: PROCEED — afterPreReadProceed fires before runTransaction, in exact order", async () => {
  const db = makeDb(async () => ({ rows: [] })); // PROCEED
  const callOrder: string[] = [];

  let hookCallCount = 0;
  let txCallCount = 0;

  const runner: RegionalIntakeTransactionRunner = async (_cb) => {
    callOrder.push("tx");
    txCallCount++;
    // Throw non-23505 sentinel without invoking callback
    throw Object.assign(new Error("sentinel"), {});
  };

  const svc = createRegionalIntakeService({
    committedDb:   db,
    runTransaction: runner,
    svcTestHooks: {
      afterPreReadProceed: async () => {
        callOrder.push("hook");
        hookCallCount++;
      },
    },
  });

  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "SERVICE_UNAVAILABLE");
  assert.strictEqual(hookCallCount, 1, "afterPreReadProceed must be called exactly once");
  assert.strictEqual(txCallCount, 1, "runTransaction must be called exactly once");
  assert.deepStrictEqual(callOrder, ["hook", "tx"],
    "afterPreReadProceed must be called before runTransaction");
});

test("SVC-10: initial committed lookup failure → SERVICE_UNAVAILABLE, no tx call", async () => {
  const db = makeDb(async () => { throw new Error("pg timeout"); });
  let txCalled = false;
  const runner: RegionalIntakeTransactionRunner = async (_cb) => { txCalled = true; return undefined as never; };
  const svc = createRegionalIntakeService({ committedDb: db, runTransaction: runner });
  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "SERVICE_UNAVAILABLE");
  assert.strictEqual(txCalled, false, "runTransaction must not be called");
});

test("SVC-11: non-23505 transaction failure → SERVICE_UNAVAILABLE", async () => {
  const db = makeDb(async () => ({ rows: [] }));
  const svc = createRegionalIntakeService({
    committedDb:    db,
    runTransaction: throwingRunner(new Error("connection reset")),
  });
  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "SERVICE_UNAVAILABLE");
});

test("SVC-12: RegionalIntakeInternalError → INTERNAL_ERROR", async () => {
  const db = makeDb(async () => ({ rows: [] }));
  const svc = createRegionalIntakeService({
    committedDb:    db,
    runTransaction: throwingRunner(new RegionalIntakeInternalError("INVARIANT_VIOLATION")),
  });
  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "INTERNAL_ERROR");
});

test("SVC-13: unexpected named 23505 → INTERNAL_ERROR, no fresh committed read", async () => {
  let dbCallCount = 0;
  const db = makeDb(async () => { dbCallCount++; return { rows: [] }; });
  const svc = createRegionalIntakeService({
    committedDb:    db,
    runTransaction: throwingRunner(
      Object.assign(new Error("dup"), { code: "23505", constraint: "uq_ic_key_id" }),
    ),
  });
  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "INTERNAL_ERROR");
  // First call is the pre-read; no second call for unapproved constraint
  assert.strictEqual(dbCallCount, 1, "fresh committed read must not be triggered for unapproved constraint");
});

test("SVC-14: missing-constraint 23505 → INTERNAL_ERROR, no fresh read", async () => {
  let dbCallCount = 0;
  const db = makeDb(async () => { dbCallCount++; return { rows: [] }; });
  const svc = createRegionalIntakeService({
    committedDb:    db,
    runTransaction: throwingRunner(
      Object.assign(new Error("dup"), { code: "23505" }), // no constraint property
    ),
  });
  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "INTERNAL_ERROR");
  assert.strictEqual(dbCallCount, 1, "fresh committed read must not be triggered for missing constraint");
});

test("SVC-15: approved 23505 + fresh REPLAY → REPLAYED", async () => {
  const replayRow = makeGbcRow();
  let callCount = 0;
  const db = makeDb(async () => {
    callCount++;
    if (callCount === 1) return { rows: [] }; // first call → PROCEED
    return { rows: [replayRow] };              // second call → REPLAY
  });
  const svc = createRegionalIntakeService({
    committedDb:    db,
    runTransaction: throwingRunner(
      Object.assign(new Error("dup"), { code: "23505", constraint: "uq_gbc_brand_gateway_booking" }),
    ),
  });
  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "REPLAYED");
  if (result.kind !== "REPLAYED") return;
  assert.strictEqual(result.bookingId, 42);
  assert.strictEqual(result.created, false);
});

test("SVC-16: approved 23505 + fresh CONFLICT → CONFLICT", async () => {
  const conflictRow = makeGbcRow({ payload_fingerprint: "b".repeat(64) });
  let callCount = 0;
  const db = makeDb(async () => {
    callCount++;
    if (callCount === 1) return { rows: [] };
    return { rows: [conflictRow] }; // CONFLICT
  });
  const svc = createRegionalIntakeService({
    committedDb:    db,
    runTransaction: throwingRunner(
      Object.assign(new Error("dup"), { code: "23505", constraint: "uq_gbc_brand_gateway_quote" }),
    ),
  });
  const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
  assert.strictEqual(result.kind, "CONFLICT");
});

test("SVC-17: approved 23505 + fresh PROCEED or fresh-read failure → both SERVICE_UNAVAILABLE", async () => {
  const subCases = [
    {
      label:       "Sub-A: fresh PROCEED (rows=[]) → SERVICE_UNAVAILABLE",
      dbFactory:   () => {
        let n = 0;
        return makeDb(async () => { n++; return { rows: [] }; }); // both calls return []
      },
    },
    {
      label:       "Sub-B: fresh read throws → SERVICE_UNAVAILABLE",
      dbFactory:   () => {
        let n = 0;
        return makeDb(async () => {
          n++;
          if (n === 1) return { rows: [] };   // first call PROCEED
          throw new Error("db failure");       // second call throws
        });
      },
    },
  ];

  for (const sub of subCases) {
    const db = sub.dbFactory();
    const svc = createRegionalIntakeService({
      committedDb:    db,
      runTransaction: throwingRunner(
        Object.assign(new Error("dup"), { code: "23505", constraint: "uq_gbc_brand_gateway_booking" }),
      ),
    });
    const result = await svc({ brandCode: "batumicars", parsedJson: VALID_PARSED_JSON });
    assert.strictEqual(result.kind, "SERVICE_UNAVAILABLE", `${sub.label}`);
  }
});
