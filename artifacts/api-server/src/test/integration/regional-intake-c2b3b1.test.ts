/**
 * regional-intake-c2b3b1.test.ts
 *
 * C2b-3b1 PostgreSQL integration tests — 2 tests.
 *
 *   I-1: first committed creation → 201 body; notifier called once with exact
 *        committed payload; res.json occurs before notifier.
 *   I-2: identical lost-response-style retry → REPLAYED on second call;
 *        notifier count stays exactly 1; exactly one booking/context row.
 *
 * Uses:
 *   - real RegionalIntakeServiceFn against RBG_TEST_DATABASE_URL
 *   - createRegionalIntakeHandler directly (no mounted route)
 *   - fake RegionalStaffNotifier and fake RegionalNotificationFailureReporter
 *   - lightweight request/response/next stubs
 *   - no real email provider
 *
 * DB GUARD:
 *   Connects only to RBG_TEST_DATABASE_URL. Exits process.exit(1) if absent.
 *   Never falls back to DATABASE_URL.
 *
 * CLEANUP ORDER:
 *   gateway_booking_context → booking (cascades attribution) → user
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:integration:c2b3b1
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
import type { RbgDb, RbgTx } from "../../repositories/regional-intake.repository.js";
import {
  createRegionalIntakeService,
  type RegionalIntakeTransactionRunner,
} from "../../services/regional-intake.service.js";
import {
  createRegionalIntakeHandler,
} from "../../routes/regional-intake-handler.js";
import type {
  AuthenticatedRbgRequestContext,
  RegionalBrandCode,
} from "../../routes/internal-rbg-router.js";
import type {
  RegionalStaffNotification,
  RegionalStaffNotifier,
  RegionalNotificationFailureReporter,
} from "../../lib/regional-staff-notifier.js";
import type { Request, Response, NextFunction } from "express";

// ── DB URL guard ──────────────────────────────────────────────────────────────

const testDbUrl = (() => {
  const url = process.env["RBG_TEST_DATABASE_URL"];
  if (!url) {
    console.error(
      "STOP: RBG_TEST_DATABASE_URL is not set. " +
      "Set RBG_TEST_DATABASE_URL to a dedicated test database before running " +
      "test:integration:c2b3b1.",
    );
    process.exit(1);
  }
  return url;
})();

// ── Pool ownership ────────────────────────────────────────────────────────────

type PoolHandle = { end: () => Promise<void> };

function makeTestDb(url: string): { pool: PoolHandle; db: RbgDb } {
  const instance = drizzle(url, { schema });
  const db = instance as unknown as RbgDb;
  const pool = (instance as unknown as { $client: PoolHandle }).$client;
  return { pool, db };
}

const { pool: committedPool, db: committedDb } = makeTestDb(testDbUrl);
const { pool: txPool,       db: txDb }         = makeTestDb(testDbUrl);

const runTransaction: RegionalIntakeTransactionRunner = (callback) =>
  (txDb as unknown as { transaction: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown> })
    .transaction((tx) => callback(tx as unknown as RbgTx)) as Promise<never>;

// ── SQL helpers ───────────────────────────────────────────────────────────────

async function q<T extends Record<string, unknown>>(
  query: ReturnType<typeof drizzleSql>,
): Promise<T[]> {
  const result = await (committedDb as unknown as {
    execute: (q: unknown) => Promise<unknown>;
  }).execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

async function exec(query: ReturnType<typeof drizzleSql>): Promise<void> {
  await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(query);
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

let sharedBrandId: number;
let sharedModelId: number;
let sharedLocAId:  number;
let sharedLocBId:  number;

before(async () => {
  const [br] = await q<{ id: number }>(drizzleSql`
    INSERT INTO brand (name) VALUES ('C2b3b1 Brand') RETURNING id
  `);
  sharedBrandId = br!.id;

  const [mdl] = await q<{ id: number }>(drizzleSql`
    INSERT INTO vehicle_model (brand_id, name, active, available_for_external_systems)
    VALUES (${sharedBrandId}, 'C2b3b1 Model', true, true)
    RETURNING id
  `);
  sharedModelId = mdl!.id;

  const [locA] = await q<{ id: number }>(drizzleSql`
    INSERT INTO location (name, is_active) VALUES ('C2b3b1 Loc A', true) RETURNING id
  `);
  sharedLocAId = locA!.id;

  const [locB] = await q<{ id: number }>(drizzleSql`
    INSERT INTO location (name, is_active) VALUES ('C2b3b1 Loc B', true) RETURNING id
  `);
  sharedLocBId = locB!.id;
});

after(async () => {
  await exec(drizzleSql`DELETE FROM vehicle_model WHERE id = ${sharedModelId}`);
  await exec(drizzleSql`DELETE FROM brand WHERE id = ${sharedBrandId}`);
  await exec(drizzleSql`DELETE FROM location WHERE id IN (${sharedLocAId}, ${sharedLocBId})`);
  await committedPool.end();
  await txPool.end();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBody(
  overrides?: Record<string, unknown>,
): Record<string, unknown> & { customerEmail: string } {
  const body = {
    gatewayBookingId:  randomUUID(),
    gatewayQuoteId:    randomUUID(),
    vehicleModelId:    sharedModelId,
    pickupLocationId:  sharedLocAId,
    dropoffLocationId: sharedLocBId,
    pickupDatetime:    "2026-09-01T10:00",
    dropoffDatetime:   "2026-09-05T10:00",
    totalAmountCents:  15000,
    currency:          "EUR",
    customerName:      "Integration Customer",
    customerEmail:     `c2b3b1-${randomUUID()}@rbg-test.invalid`,
    customerPhone:     "+995500000099",
    ...overrides,
  };
  return body as typeof body & { customerEmail: string };
}

async function cleanupCreated(bookingId: number, email: string): Promise<void> {
  await exec(drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bookingId}`);
  await exec(drizzleSql`DELETE FROM booking WHERE id = ${bookingId}`);
  await exec(drizzleSql`DELETE FROM "user" WHERE email = ${email}`);
}

function makeBrandCode(s: string): RegionalBrandCode {
  return s as RegionalBrandCode;
}

function makeCtx(parsedJson: unknown): AuthenticatedRbgRequestContext {
  return {
    correlationId: `corr-c2b3b1-${randomUUID()}`,
    brandCode:     makeBrandCode("batumicars"),
    parsedJson,
    rawBody:       new Uint8Array([1, 2, 3]),
  };
}

/** Deterministic Deferred for synchronising async notification. */
class Deferred<T> {
  promise: Promise<T>;
  resolve!: (v: T) => void;
  reject!: (e: unknown) => void;
  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject  = rej;
    });
  }
}

function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Deadline exceeded: ${label}`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

interface IntRes {
  res:          Partial<Response>;
  statusCodes:  number[];
  responseBodies: unknown[];
}

function makeIntRes(
  callOrder: string[],
  onJson: () => void,
): IntRes {
  const statusCodes:    number[]  = [];
  const responseBodies: unknown[] = [];
  const res: Partial<Response> = {
    status(code: number): Response {
      statusCodes.push(code);
      return this as unknown as Response;
    },
    json(body: unknown): Response {
      callOrder.push("res.json");
      responseBodies.push(body);
      onJson();
      return this as unknown as Response;
    },
  };
  return { res, statusCodes, responseBodies };
}

// ── I-1: first committed creation ─────────────────────────────────────────────

test("I-1: first committed creation → 201 body; notifier called once with exact payload; response before notify", async () => {
  const body    = makeBody();
  const email   = body.customerEmail;
  const service = createRegionalIntakeService({ committedDb, runTransaction });

  const callOrder:        string[]                     = [];
  const notifierPayloads: RegionalStaffNotification[]  = [];
  const jsonDeferred      = new Deferred<void>();
  const notifierDeferred  = new Deferred<void>();

  const notifier: RegionalStaffNotifier = {
    notify: async (payload) => {
      callOrder.push("notifier");
      notifierPayloads.push(payload);
      notifierDeferred.resolve();
    },
  };

  const reporter: RegionalNotificationFailureReporter = (_input) => {
    assert.fail("reporter must not be called when notifier succeeds");
  };

  const handler = createRegionalIntakeHandler({
    service,
    notifier,
    reportNotificationFailure: reporter,
  });

  const ctx                                                 = makeCtx(body);
  const { res, statusCodes, responseBodies }                = makeIntRes(callOrder, () => jsonDeferred.resolve());
  const nextCalls: unknown[]                                = [];
  const next = ((e: unknown) => nextCalls.push(e)) as unknown as NextFunction;

  let bookingId: number | undefined;
  try {
    handler(ctx, {} as Request, res as Response, next);

    await withDeadline(jsonDeferred.promise,     10_000, "I-1 res.json");
    await withDeadline(notifierDeferred.promise, 10_000, "I-1 notifier");

    assert.equal(nextCalls.length, 0, "next must not be called");
    assert.deepEqual(statusCodes, [201], "status must be 201");

    const rb = responseBodies[0] as { bookingId: number; reference: string; created: boolean };
    assert.ok(rb.bookingId > 0, "bookingId must be a positive integer");
    assert.match(rb.reference, /^TC-\d{5,}$/, "reference must match TC-NNNNN format");
    assert.strictEqual(rb.created, true, "created must be true");
    bookingId = rb.bookingId;

    // Response-before-notify ordering
    assert.deepEqual(callOrder, ["res.json", "notifier"], "res.json must occur before notifier");

    // Notifier called exactly once
    assert.equal(notifierPayloads.length, 1, "notifier called exactly once");
    const n = notifierPayloads[0]!;

    // From committed SUCCESS
    assert.strictEqual(n.bookingId,           bookingId);
    assert.strictEqual(n.reference,           rb.reference);
    assert.strictEqual(n.pickupLocationName,  "C2b3b1 Loc A");
    assert.strictEqual(n.dropoffLocationName, "C2b3b1 Loc B");
    assert.strictEqual(n.vehicleModelName,    "C2b3b1 Model");

    // From validated/normalized service input
    assert.strictEqual(n.brandCode,        "batumicars");
    assert.strictEqual(n.customerName,     "Integration Customer");
    assert.strictEqual(n.customerEmail,    email);
    assert.strictEqual(n.customerPhone,    "+995500000099");
    assert.strictEqual(n.pickupDatetime,   "2026-09-01T10:00");
    assert.strictEqual(n.dropoffDatetime,  "2026-09-05T10:00");
    assert.strictEqual(n.totalAmountCents, 15000);
    assert.strictEqual(n.currency,         "EUR");

  } finally {
    if (bookingId !== undefined) await cleanupCreated(bookingId, email);
  }
});

// ── I-2: lost-response-style identical retry ───────────────────────────────────

test("I-2: identical lost-response retry → REPLAYED; notifier count stays 1; one booking row", async () => {
  const body    = makeBody();
  const email   = body.customerEmail;
  const service = createRegionalIntakeService({ committedDb, runTransaction });

  let notifierCallCount = 0;
  const notifier: RegionalStaffNotifier = {
    notify: async (_payload) => { notifierCallCount++; },
  };

  let reporterCallCount = 0;
  const reporter: RegionalNotificationFailureReporter = (_input) => {
    reporterCallCount++;
  };

  const handler = createRegionalIntakeHandler({
    service,
    notifier,
    reportNotificationFailure: reporter,
  });

  let bookingId: number | undefined;
  try {
    // ── First call ─────────────────────────────────────────────────────────────
    const jsonDeferred1 = new Deferred<void>();
    const notifierDeferred1 = new Deferred<void>();
    const originalNotify = notifier.notify.bind(notifier);
    let notifyHooked = false;
    notifier.notify = async (payload) => {
      if (!notifyHooked) {
        notifyHooked = true;
        await originalNotify(payload);
        notifierDeferred1.resolve();
      }
    };

    const { res: res1, statusCodes: sc1, responseBodies: rb1 } =
      makeIntRes([], () => jsonDeferred1.resolve());
    const nextCalls1: unknown[] = [];
    const next1 = ((e: unknown) => nextCalls1.push(e)) as unknown as NextFunction;

    handler(makeCtx(body), {} as Request, res1 as Response, next1);
    await withDeadline(jsonDeferred1.promise,      10_000, "I-2 first res.json");
    await withDeadline(notifierDeferred1.promise,  10_000, "I-2 first notifier");

    assert.equal(nextCalls1.length, 0, "first call: next must not be called");
    assert.deepEqual(sc1, [201], "first call: status 201");

    const rb1body = rb1[0] as { bookingId: number; reference: string; created: boolean };
    assert.strictEqual(rb1body.created, true, "first call: created:true");
    bookingId = rb1body.bookingId;
    assert.strictEqual(notifierCallCount, 1, "after first call: notifier called once");
    assert.strictEqual(reporterCallCount, 0, "after first call: reporter not called");

    // ── Second call (same body = identical retry) ──────────────────────────────
    const jsonDeferred2 = new Deferred<void>();
    const { res: res2, statusCodes: sc2, responseBodies: rb2 } =
      makeIntRes([], () => jsonDeferred2.resolve());
    const nextCalls2: unknown[] = [];
    const next2 = ((e: unknown) => nextCalls2.push(e)) as unknown as NextFunction;

    handler(makeCtx(body), {} as Request, res2 as Response, next2);
    await withDeadline(jsonDeferred2.promise, 10_000, "I-2 second res.json");
    // Drain microtasks to confirm notifier chain did not fire
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(nextCalls2.length, 0, "second call: next must not be called");
    assert.deepEqual(sc2, [200], "second call: status 200 (REPLAYED)");

    const rb2body = rb2[0] as { bookingId: number; reference: string; created: boolean };
    assert.strictEqual(rb2body.created, false, "second call: created:false");
    assert.strictEqual(rb2body.bookingId, bookingId, "second call: same bookingId");
    assert.strictEqual(notifierCallCount, 1, "after second call: notifier count still 1");
    assert.strictEqual(reporterCallCount, 0, "after second call: reporter still not called");

    // ── DB row count ──────────────────────────────────────────────────────────
    const [bCnt] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking WHERE id = ${bookingId}
    `);
    assert.strictEqual(Number(bCnt!.c), 1, "exactly 1 booking row");

    const [gCnt] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context WHERE booking_id = ${bookingId}
    `);
    assert.strictEqual(Number(gCnt!.c), 1, "exactly 1 gateway_booking_context row");

  } finally {
    if (bookingId !== undefined) await cleanupCreated(bookingId, email);
  }
});
