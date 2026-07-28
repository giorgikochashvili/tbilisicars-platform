/**
 * regional-intake-handler-notification.test.ts
 *
 * C2b-3b1: Unit tests for handler notification orchestration — 7 tests.
 *
 *   N-1: CREATED writes response first, then notifier called once with exact payload.
 *   N-2: REPLAYED never calls notifier.
 *   N-3: CONFLICT never calls notifier.
 *   N-4: all remaining non-CREATED result kinds never call notifier (table-driven).
 *   N-5: async notifier rejection → reporter called once; no next; no second response.
 *   N-6: synchronous notifier throw → same bounded behavior as N-5.
 *   N-7: reporter failure (async rejection + sync throw, table-driven) swallowed;
 *        no unhandled rejection; no next; response remains 201.
 *
 * Uses test-owned Deferreds and bounded deadlines.
 * No sleeps, no polling, no awaiting a returned handler Promise.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2b3b1
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRegionalIntakeHandler } from "../../routes/regional-intake-handler.js";
import type {
  RegionalIntakeServiceFn,
  RegionalIntakeSvcResult,
} from "../../services/regional-intake.service.js";
import type {
  AuthenticatedRbgRequestContext,
  RegionalBrandCode,
} from "../../routes/internal-rbg-router.js";
import type {
  RegionalStaffNotification,
  RegionalStaffNotifier,
  RegionalNotificationFailureInput,
  RegionalNotificationFailureReporter,
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

function makeCtx(
  overrides?: Partial<AuthenticatedRbgRequestContext>,
): AuthenticatedRbgRequestContext {
  return {
    correlationId: "corr-n-test",
    brandCode:     makeBrandCode("batumicars"),
    parsedJson:    { x: 1 },
    rawBody:       new Uint8Array([1]),
    ...overrides,
  };
}

interface ResSpy {
  res: Partial<Response>;
  statusArgs: number[];
  jsonArgs: unknown[];
}

function makeRes(onJson?: () => void): ResSpy {
  const statusArgs: number[] = [];
  const jsonArgs: unknown[]  = [];
  const res: Partial<Response> = {
    status(code: number): Response {
      statusArgs.push(code);
      return this as unknown as Response;
    },
    json(body: unknown): Response {
      jsonArgs.push(body);
      onJson?.();
      return this as unknown as Response;
    },
  };
  return { res, statusArgs, jsonArgs };
}

// ── Known notification fixture ────────────────────────────────────────────────

const KNOWN_NOTIFICATION: RegionalStaffNotification = {
  bookingId:            42,
  reference:            "TC-00042",
  brandCode:            "batumicars",
  customerName:         "Test Customer",
  customerEmail:        "test@rbg.invalid",
  customerPhone:        "+995500000099",
  pickupDatetime:       "2026-09-01T10:00",
  dropoffDatetime:      "2026-09-05T10:00",
  pickupLocationName:   "Airport",
  dropoffLocationName:  "Hotel",
  vehicleModelName:     "Sedan",
  totalAmountCents:     15000,
  currency:             "EUR",
};

const CREATED_RESULT: RegionalIntakeSvcResult = {
  kind:         "CREATED",
  bookingId:    42,
  reference:    "TC-00042",
  created:      true,
  notification: KNOWN_NOTIFICATION,
};

// ── N-1: CREATED → response first, then notifier once with exact payload ──────

test("N-1: CREATED writes response first, then notifier called once with exact payload", async () => {
  const callOrder: string[] = [];
  const notifierPayloads: RegionalStaffNotification[] = [];
  const jsonDeferred   = new Deferred<void>();
  const notifierDeferred = new Deferred<void>();

  const service: RegionalIntakeServiceFn = async () => ({ ...CREATED_RESULT });

  const notifier: RegionalStaffNotifier = {
    notify: async (payload) => {
      callOrder.push("notifier");
      notifierPayloads.push(payload);
      notifierDeferred.resolve();
    },
  };

  const reporter: RegionalNotificationFailureReporter = () => {
    assert.fail("reporter must not be called on notifier success");
  };

  const ctx = makeCtx();
  const { res, statusArgs } = makeRes(() => { callOrder.push("res.json"); jsonDeferred.resolve(); });
  const next = (() => { assert.fail("next must not be called"); }) as unknown as NextFunction;

  createRegionalIntakeHandler({ service, notifier, reportNotificationFailure: reporter })(
    ctx, {} as Request, res as Response, next,
  );

  await withDeadline(jsonDeferred.promise,    1000, "N-1 res.json");
  await withDeadline(notifierDeferred.promise, 1000, "N-1 notifier");

  assert.deepEqual(callOrder, ["res.json", "notifier"], "response must be written before notifier is called");
  assert.equal(notifierPayloads.length, 1, "notifier called exactly once");
  assert.deepEqual(notifierPayloads[0], KNOWN_NOTIFICATION, "notifier received exact notification payload");
  assert.deepEqual(statusArgs, [201], "status is 201");
});

// ── N-2: REPLAYED → notifier never called ────────────────────────────────────

test("N-2: REPLAYED does not call notifier", async () => {
  const jsonDeferred = new Deferred<void>();
  let notifierCallCount = 0;

  const service: RegionalIntakeServiceFn = async () => ({
    kind: "REPLAYED", bookingId: 1, reference: "TC-00001", created: false,
  });

  const notifier: RegionalStaffNotifier = {
    notify: async () => { notifierCallCount++; },
  };

  const { res, statusArgs } = makeRes(() => jsonDeferred.resolve());
  const next = (() => {}) as unknown as NextFunction;

  createRegionalIntakeHandler({ service, notifier, reportNotificationFailure: () => {} })(
    makeCtx(), {} as Request, res as Response, next,
  );
  await withDeadline(jsonDeferred.promise, 1000, "N-2 res.json");

  // Drain one microtask cycle to confirm no notification chain was queued
  await Promise.resolve();
  assert.equal(notifierCallCount, 0, "notifier must not be called for REPLAYED");
  assert.deepEqual(statusArgs, [200]);
});

// ── N-3: CONFLICT → notifier never called ────────────────────────────────────

test("N-3: CONFLICT does not call notifier", async () => {
  const jsonDeferred = new Deferred<void>();
  let notifierCallCount = 0;

  const service: RegionalIntakeServiceFn = async () => ({ kind: "CONFLICT" });

  const notifier: RegionalStaffNotifier = {
    notify: async () => { notifierCallCount++; },
  };

  const { res, statusArgs } = makeRes(() => jsonDeferred.resolve());
  const next = (() => {}) as unknown as NextFunction;

  createRegionalIntakeHandler({ service, notifier, reportNotificationFailure: () => {} })(
    makeCtx(), {} as Request, res as Response, next,
  );
  await withDeadline(jsonDeferred.promise, 1000, "N-3 res.json");

  await Promise.resolve();
  assert.equal(notifierCallCount, 0, "notifier must not be called for CONFLICT");
  assert.deepEqual(statusArgs, [409]);
});

// ── N-4: all remaining non-CREATED kinds → notifier never called (table-driven)

test("N-4: all non-CREATED result kinds never call notifier (table-driven)", async () => {
  const nonCreatedCases: RegionalIntakeSvcResult[] = [
    { kind: "VALIDATION_ERROR",         issues: [] },
    { kind: "INVALID_DATETIME" },
    { kind: "VEHICLE_MODEL_UNAVAILABLE" },
    { kind: "LOCATION_UNAVAILABLE" },
    { kind: "SERVICE_UNAVAILABLE" },
    { kind: "INTERNAL_ERROR" },
  ];

  for (const svcResult of nonCreatedCases) {
    const jsonDeferred = new Deferred<void>();
    let notifierCallCount = 0;

    const service: RegionalIntakeServiceFn = async () => svcResult;
    const notifier: RegionalStaffNotifier = {
      notify: async () => { notifierCallCount++; },
    };

    const { res } = makeRes(() => jsonDeferred.resolve());
    const next = (() => {}) as unknown as NextFunction;

    createRegionalIntakeHandler({ service, notifier, reportNotificationFailure: () => {} })(
      makeCtx(), {} as Request, res as Response, next,
    );
    await withDeadline(jsonDeferred.promise, 1000, `N-4[${svcResult.kind}] res.json`);

    await Promise.resolve();
    assert.equal(
      notifierCallCount, 0,
      `notifier must not be called for ${svcResult.kind}`,
    );
  }
});

// ── N-5: async notifier rejection → reporter called; no next; no second response

test("N-5: async notifier rejection → 201 written; reporter called once; no next; no second response", async () => {
  const jsonDeferred      = new Deferred<void>();
  const reporterDeferred  = new Deferred<void>();
  const reporterCallArgs: RegionalNotificationFailureInput[] = [];
  let nextCallCount = 0;

  const service: RegionalIntakeServiceFn = async () => ({ ...CREATED_RESULT });

  const notifier: RegionalStaffNotifier = {
    notify: async (_n): Promise<void> => {
      throw new Error("async provider failure");
    },
  };

  const reporter: RegionalNotificationFailureReporter = (input) => {
    reporterCallArgs.push(input);
    reporterDeferred.resolve();
  };

  const ctx = makeCtx({ correlationId: "corr-n5" });
  const { res, statusArgs, jsonArgs } = makeRes(() => jsonDeferred.resolve());
  const next = ((_e: unknown) => { nextCallCount++; }) as unknown as NextFunction;

  createRegionalIntakeHandler({ service, notifier, reportNotificationFailure: reporter })(
    ctx, {} as Request, res as Response, next,
  );

  await withDeadline(jsonDeferred.promise,     1000, "N-5 res.json");
  await withDeadline(reporterDeferred.promise, 1000, "N-5 reporter");

  assert.deepEqual(statusArgs, [201], "status remains 201");
  assert.equal(jsonArgs.length, 1, "no second response write");
  assert.equal(nextCallCount, 0, "next not called");
  assert.equal(reporterCallArgs.length, 1, "reporter called exactly once");
  assert.strictEqual(reporterCallArgs[0]?.correlationId, "corr-n5", "correlationId matches ctx");
  assert.strictEqual(reporterCallArgs[0]?.bookingId, 42, "bookingId matches result");
});

// ── N-6: synchronous notifier throw → same bounded behavior as N-5 ────────────

test("N-6: synchronous notifier throw → 201 written; reporter called once; no next; no second response", async () => {
  const jsonDeferred      = new Deferred<void>();
  const reporterDeferred  = new Deferred<void>();
  const reporterCallArgs: RegionalNotificationFailureInput[] = [];
  let nextCallCount = 0;

  const service: RegionalIntakeServiceFn = async () => ({ ...CREATED_RESULT });

  const notifier: RegionalStaffNotifier = {
    notify: (_n): Promise<void> => {
      throw new Error("sync notifier failure");
    },
  };

  const reporter: RegionalNotificationFailureReporter = (input) => {
    reporterCallArgs.push(input);
    reporterDeferred.resolve();
  };

  const ctx = makeCtx({ correlationId: "corr-n6" });
  const { res, statusArgs, jsonArgs } = makeRes(() => jsonDeferred.resolve());
  const next = ((_e: unknown) => { nextCallCount++; }) as unknown as NextFunction;

  createRegionalIntakeHandler({ service, notifier, reportNotificationFailure: reporter })(
    ctx, {} as Request, res as Response, next,
  );

  await withDeadline(jsonDeferred.promise,     1000, "N-6 res.json");
  await withDeadline(reporterDeferred.promise, 1000, "N-6 reporter");

  assert.deepEqual(statusArgs, [201], "status remains 201");
  assert.equal(jsonArgs.length, 1, "no second response write");
  assert.equal(nextCallCount, 0, "next not called");
  assert.equal(reporterCallArgs.length, 1, "reporter called exactly once");
  assert.strictEqual(reporterCallArgs[0]?.correlationId, "corr-n6");
  assert.strictEqual(reporterCallArgs[0]?.bookingId, 42);
});

// ── N-7: reporter failure swallowed (async rejection + sync throw, table-driven)

test("N-7: reporter failure (async rejection and sync throw) swallowed; no unhandled rejection; no next; response 201", async () => {
  const subcases = [
    {
      label: "async rejection",
      makeReporter: (signal: () => void): RegionalNotificationFailureReporter =>
        (_input) => {
          signal();
          return Promise.reject(new Error("async reporter failure"));
        },
    },
    {
      label: "sync throw",
      makeReporter: (signal: () => void): RegionalNotificationFailureReporter =>
        (_input) => {
          signal();
          throw new Error("sync reporter failure");
        },
    },
  ] as const;

  for (const sc of subcases) {
    const jsonDeferred           = new Deferred<void>();
    const reporterCalledDeferred = new Deferred<void>();
    let nextCallCount = 0;

    const service: RegionalIntakeServiceFn = async () => ({ ...CREATED_RESULT });

    // Notifier always rejects to trigger the reporter path
    const notifier: RegionalStaffNotifier = {
      notify: (_n): Promise<void> => {
        throw new Error("notifier failure to trigger reporter");
      },
    };

    const reporter = sc.makeReporter(() => reporterCalledDeferred.resolve());

    const { res, statusArgs, jsonArgs } = makeRes(() => jsonDeferred.resolve());
    const next = ((_e: unknown) => { nextCallCount++; }) as unknown as NextFunction;

    createRegionalIntakeHandler({ service, notifier, reportNotificationFailure: reporter })(
      makeCtx(), {} as Request, res as Response, next,
    );

    await withDeadline(jsonDeferred.promise,           1000, `N-7[${sc.label}] res.json`);
    await withDeadline(reporterCalledDeferred.promise, 1000, `N-7[${sc.label}] reporter called`);

    // Drain microtasks so the inner .catch(() => {}) processes the reporter's rejection
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(nextCallCount, 0,      `${sc.label}: next must not be called`);
    assert.equal(jsonArgs.length, 1,    `${sc.label}: no second response write`);
    assert.deepEqual(statusArgs, [201], `${sc.label}: status remains 201`);
  }
});
