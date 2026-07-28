/**
 * regional-intake-handler.test.ts
 *
 * C2b-3a: Unit tests for createRegionalIntakeHandler — 6 tests.
 *
 * The handler returns void and completes asynchronously via its internal
 * Promise chain.  Every async test uses a test-owned Deferred resolved by the
 * relevant stub (res.json for success paths, next spy for the failure path).
 * All Deferred waits are wrapped in withDeadline to prevent hangs.
 * No sleep, no polling, no awaiting a returned handler Promise.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2b3a
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegionalIntakeHandler } from "../../routes/regional-intake-handler.js";
import type { RegionalIntakeServiceFn } from "../../services/regional-intake.service.js";
import type {
  AuthenticatedRbgRequestContext,
  RegionalBrandCode,
} from "../../routes/internal-rbg-router.js";
import type {
  RegionalStaffNotification,
  RegionalNotificationFailureInput,
} from "../../lib/regional-staff-notifier.js";
import type { Request, Response, NextFunction } from "express";

// ── Test infrastructure ───────────────────────────────────────────────────────

class Deferred<T> {
  promise: Promise<T>;
  resolve!: (v: T) => void;
  reject!: (e: unknown) => void;
  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
}

function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Deadline exceeded: ${label}`)),
      ms,
    );
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

function makeBrandCode(s: string): RegionalBrandCode {
  return s as RegionalBrandCode;
}

/** Build a minimal AuthenticatedRbgRequestContext. */
function makeCtx(
  overrides?: Partial<AuthenticatedRbgRequestContext>,
): AuthenticatedRbgRequestContext {
  return {
    correlationId: "corr-001",
    brandCode:     makeBrandCode("batumicars"),
    parsedJson:    { x: 1 },
    rawBody:       new Uint8Array([1, 2, 3]),
    ...overrides,
  };
}

interface ResSpy {
  res: Partial<Response>;
  statusArgs: number[];
  jsonArgs: unknown[];
}

/**
 * Build a minimal chainable Express response stub.
 * res.status(code) records the code and returns res.
 * res.json(body) records the body and returns res.
 */
function makeRes(): ResSpy {
  const statusArgs: number[] = [];
  const jsonArgs: unknown[]  = [];
  const res: Partial<Response> = {
    status(code: number): Response {
      statusArgs.push(code);
      return this as unknown as Response;
    },
    json(body: unknown): Response {
      jsonArgs.push(body);
      return this as unknown as Response;
    },
  };
  return { res, statusArgs, jsonArgs };
}

// ── Minimal notification fixture ──────────────────────────────────────────────

/**
 * Minimal valid RegionalStaffNotification for use in H-1/H-2/H-3/H-6 CREATED
 * fixtures.  These tests verify routing and response behavior, not notification
 * content — that is covered by N-1 in regional-intake-handler-notification.test.ts.
 */
const FAKE_NOTIFICATION: RegionalStaffNotification = {
  bookingId:            0,
  reference:            "TC-00000",
  brandCode:            "batumicars",
  customerName:         "Fake Customer",
  customerEmail:        "fake@example.com",
  customerPhone:        "+995500000000",
  pickupDatetime:       "2026-09-01T10:00",
  dropoffDatetime:      "2026-09-05T10:00",
  pickupLocationName:   "Loc A",
  dropoffLocationName:  "Loc B",
  vehicleModelName:     "Model X",
  totalAmountCents:     10000,
  currency:             "EUR",
};

/**
 * Build a compatible deps object from a service function.
 * The fake notifier resolves immediately; the fake reporter is a no-op.
 * Neither is asserted in these tests — notification behavior is tested in
 * regional-intake-handler-notification.test.ts.
 */
function makeDeps(service: RegionalIntakeServiceFn) {
  return {
    service,
    notifier: {
      notify: async (_n: RegionalStaffNotification): Promise<void> => { /* no-op */ },
    },
    reportNotificationFailure: (_input: RegionalNotificationFailureInput): void => { /* no-op */ },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// H-1: ctx.brandCode and ctx.parsedJson forwarded exactly; body brand cannot override
test("H-1: ctx.brandCode and ctx.parsedJson forwarded exactly; body brand cannot override", async () => {
  const deferred = new Deferred<void>();
  const serviceCallArgs: Array<{ brandCode: unknown; parsedJson: unknown }> = [];

  const service: RegionalIntakeServiceFn = async (input) => {
    serviceCallArgs.push({ brandCode: input.brandCode, parsedJson: input.parsedJson });
    return { kind: "CREATED", bookingId: 1, reference: "TC-001", created: true, notification: FAKE_NOTIFICATION };
  };

  const ctx = makeCtx({ brandCode: makeBrandCode("batumicars"), parsedJson: { x: 1 } });
  const req = { body: { brandCode: "evil" } } as unknown as Request;
  const { res, jsonArgs } = makeRes();

  // Wrap res.json to signal completion
  const originalJson = res.json!.bind(res);
  res.json = function (body: unknown): Response {
    const r = originalJson(body);
    deferred.resolve();
    return r;
  };

  const next = (() => {}) as unknown as NextFunction;

  const handler = createRegionalIntakeHandler(makeDeps(service));
  handler(ctx, req, res as Response, next);
  await withDeadline(deferred.promise, 1000, "H-1");

  assert.equal(serviceCallArgs.length, 1, "service called once");
  assert.deepEqual(
    serviceCallArgs[0],
    { brandCode: "batumicars", parsedJson: { x: 1 } },
    "service received exactly ctx.brandCode and ctx.parsedJson",
  );
  assert.equal(jsonArgs.length, 1, "res.json called once");
});

// H-2: CREATED → exact 201 status and body
test("H-2: CREATED writes exact 201 status and body", async () => {
  const deferred = new Deferred<void>();

  const service: RegionalIntakeServiceFn = async () => ({
    kind:         "CREATED",
    bookingId:    42,
    reference:    "TC-ABC",
    created:      true,
    notification: FAKE_NOTIFICATION,
  });

  const ctx = makeCtx();
  const req = {} as Request;
  const { res, statusArgs, jsonArgs } = makeRes();

  const originalJson = res.json!.bind(res);
  res.json = function (body: unknown): Response {
    const r = originalJson(body);
    deferred.resolve();
    return r;
  };

  const next = (() => {}) as unknown as NextFunction;
  const handler = createRegionalIntakeHandler(makeDeps(service));
  handler(ctx, req, res as Response, next);
  await withDeadline(deferred.promise, 1000, "H-2");

  assert.deepEqual(statusArgs, [201]);
  assert.deepEqual(jsonArgs, [{ bookingId: 42, reference: "TC-ABC", created: true }]);
});

// H-3: successful response written exactly once; next never called
test("H-3: successful response written exactly once; next never called", async () => {
  const deferred = new Deferred<void>();
  let nextCallCount = 0;

  const service: RegionalIntakeServiceFn = async () => ({
    kind:         "CREATED",
    bookingId:    7,
    reference:    "TC-XYZ",
    created:      true,
    notification: FAKE_NOTIFICATION,
  });

  const ctx = makeCtx();
  const req = {} as Request;
  const { res, jsonArgs } = makeRes();

  const originalJson = res.json!.bind(res);
  res.json = function (body: unknown): Response {
    const r = originalJson(body);
    deferred.resolve();
    return r;
  };

  const next = (() => { nextCallCount++; }) as unknown as NextFunction;
  const handler = createRegionalIntakeHandler(makeDeps(service));
  handler(ctx, req, res as Response, next);
  await withDeadline(deferred.promise, 1000, "H-3");

  assert.equal(jsonArgs.length, 1, "res.json called exactly once");
  assert.equal(nextCallCount, 0, "next never called on success");
});

// H-4: non-success result → exact bounded response; next never called
test("H-4: LOCATION_UNAVAILABLE → exact 422 response; next never called", async () => {
  const deferred = new Deferred<void>();
  let nextCallCount = 0;

  const service: RegionalIntakeServiceFn = async () => ({
    kind: "LOCATION_UNAVAILABLE",
  });

  const ctx = makeCtx();
  const req = {} as Request;
  const { res, statusArgs, jsonArgs } = makeRes();

  const originalJson = res.json!.bind(res);
  res.json = function (body: unknown): Response {
    const r = originalJson(body);
    deferred.resolve();
    return r;
  };

  const next = (() => { nextCallCount++; }) as unknown as NextFunction;
  const handler = createRegionalIntakeHandler(makeDeps(service));
  handler(ctx, req, res as Response, next);
  await withDeadline(deferred.promise, 1000, "H-4");

  assert.deepEqual(statusArgs, [422]);
  assert.deepEqual(jsonArgs, [{ error: "LOCATION_UNAVAILABLE" }]);
  assert.equal(nextCallCount, 0, "next never called on mapped service result");
});

// H-5: rejected service → next(err) called once with exact error; no response write
test("H-5: service rejection forwarded to next exactly once; no response written", async () => {
  const deferred = new Deferred<Error>();
  const err = new Error("db failure");
  const nextCallArgs: Error[] = [];

  const service: RegionalIntakeServiceFn = () => Promise.reject(err);

  const ctx = makeCtx();
  const req = {} as Request;
  const { res, statusArgs, jsonArgs } = makeRes();

  const next = ((e: unknown) => {
    nextCallArgs.push(e as Error);
    deferred.resolve(e as Error);
  }) as unknown as NextFunction;

  const handler = createRegionalIntakeHandler(makeDeps(service));
  handler(ctx, req, res as Response, next);
  const received = await withDeadline(deferred.promise, 1000, "H-5");

  assert.equal(nextCallArgs.length, 1, "next called exactly once");
  assert.strictEqual(received, err, "next received the original Error instance");
  assert.equal(statusArgs.length, 0, "res.status not called on rejection");
  assert.equal(jsonArgs.length, 0, "res.json not called on rejection");
});

// H-6: service invoked exactly once with exactly { brandCode, parsedJson } — no extra keys
test("H-6: service called once with exactly { brandCode, parsedJson }; no extra properties", async () => {
  const deferred = new Deferred<void>();
  const callArgs: Array<Record<string, unknown>> = [];

  const service: RegionalIntakeServiceFn = async (input) => {
    callArgs.push(input as Record<string, unknown>);
    return { kind: "CREATED", bookingId: 99, reference: "TC-999", created: true, notification: FAKE_NOTIFICATION };
  };

  const ctx: AuthenticatedRbgRequestContext = {
    correlationId: "corr-h6",
    brandCode:     makeBrandCode("batumicars"),
    parsedJson:    { foo: "bar" },
    rawBody:       new Uint8Array([9]),
  };

  const req = {} as Request;
  const { res } = makeRes();

  const originalJson = res.json!.bind(res);
  res.json = function (body: unknown): Response {
    const r = originalJson(body);
    deferred.resolve();
    return r;
  };

  const next = (() => {}) as unknown as NextFunction;
  const handler = createRegionalIntakeHandler(makeDeps(service));
  handler(ctx, req, res as Response, next);
  await withDeadline(deferred.promise, 1000, "H-6");

  assert.equal(callArgs.length, 1, "service called exactly once");
  const arg = callArgs[0]!;
  assert.deepEqual(
    Object.keys(arg).sort(),
    ["brandCode", "parsedJson"],
    "input object has exactly the keys brandCode and parsedJson",
  );
  assert.equal(arg["brandCode"], "batumicars", "brandCode matches ctx.brandCode");
  assert.deepEqual(arg["parsedJson"], { foo: "bar" }, "parsedJson matches ctx.parsedJson");
});
