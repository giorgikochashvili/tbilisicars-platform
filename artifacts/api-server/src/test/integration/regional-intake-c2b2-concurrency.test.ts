/**
 * regional-intake-c2b2-concurrency.test.ts
 *
 * Deterministic concurrency tests for C2b-2 service/idempotency.
 *
 * Tests:
 *   CC-A — same email, two concurrent bookings → 1 user, 2 bookings, both CREATED
 *   CC-B — identical simultaneous requests (booking+quote) → CREATED + REPLAYED
 *   CC-C — same quote ID, different booking IDs → CREATED + CONFLICT (quote constraint)
 *   CC-D — same booking ID, different quote IDs → CREATED + CONFLICT (booking constraint)
 *   CC-E — reversed location overlap regression → both CREATED, no hang
 *
 * Uses explicit Deferred barriers — not timers or unguarded Promise.all.
 * Per-request service instances with separate transaction pools.
 * Pre-committed customer fixtures for CC-B/C/D/E.
 * CC-A uses pg_backend_pid() + pg_stat_activity blocking proof.
 *
 * DB GUARD:
 *   Hard fails at module initialization if RBG_TEST_DATABASE_URL is absent.
 *   Never falls back to DATABASE_URL.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:concurrency:c2b2
 */

import { test, after } from "node:test";
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
import { extractPostgresErrorMetadata } from "../../lib/pg-error-metadata.js";

// ── DB URL guard (hard fail at module init) ───────────────────────────────────

const testDbUrl = (() => {
  const url = process.env["RBG_TEST_DATABASE_URL"];
  if (!url) {
    console.error(
      "STOP: RBG_TEST_DATABASE_URL is not set. " +
      "Never falls back to DATABASE_URL.",
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

// File-level shared pools (closed in after())
const { pool: sharedPool, db: sharedDb } = makeTestDb(testDbUrl);
const { pool: obsPool,    db: obsDb    } = makeTestDb(testDbUrl); // CC-A observation

after(async () => {
  await sharedPool.end();
  await obsPool.end();
});

// ── Deferred barrier primitive ────────────────────────────────────────────────

class Deferred<T = void> {
  readonly promise: Promise<T>;
  resolve!: (value: T | PromiseLike<T>) => void;
  reject!:  (reason?: unknown) => void;
  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = res;
      this.reject  = rej;
    });
  }
}

// ── withDeadline helper ───────────────────────────────────────────────────────

/**
 * Wrap a promise with a bounded deadline. Clears the timer after resolution or
 * rejection so no detached timers remain. Rejects with fixed non-secret text if
 * the deadline fires first. For timeout detection only — not business logic.
 */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`STOP: deadline exceeded after ${ms}ms — ${label}`));
    }, ms);
    promise.then(
      (value)  => { clearTimeout(timer); resolve(value); },
      (reason) => { clearTimeout(timer); reject(reason as Error); },
    );
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type DbExec = { execute: (q: unknown) => Promise<unknown> };
type DbTx   = { transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T> };

async function q<T extends Record<string, unknown>>(
  db: RbgDb,
  query: ReturnType<typeof drizzleSql>,
): Promise<T[]> {
  const result = await (db as unknown as DbExec).execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

function makeRunner(db: RbgDb): RegionalIntakeTransactionRunner {
  return (callback) =>
    (db as unknown as DbTx).transaction((tx) => callback(tx as unknown as RbgTx));
}

/** Build a valid service body with unique identifiers. */
function makeBody(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    gatewayBookingId:  randomUUID(),
    gatewayQuoteId:    randomUUID(),
    vehicleModelId:    -1, // overridden per test
    pickupLocationId:  -1,
    dropoffLocationId: -1,
    pickupDatetime:    "2026-09-01T10:00",
    dropoffDatetime:   "2026-09-05T10:00",
    totalAmountCents:  15000,
    currency:          "EUR",
    customerName:      "Concurrent Customer",
    customerEmail:     `c2b2-cc-${randomUUID()}@rbg-test.invalid`,
    customerPhone:     "+995500000099",
    ...overrides,
  };
}

/** Insert a committed brand + model + 2 locations and return their IDs. */
async function setupFixtures(label: string): Promise<{
  brandId: number;
  modelId: number;
  locAId:  number;
  locBId:  number;
}> {
  const [br] = await q<{ id: number }>(sharedDb,
    drizzleSql`INSERT INTO brand (name) VALUES (${`C2b2 CC ${label}`}) RETURNING id`,
  );
  const [md] = await q<{ id: number }>(sharedDb, drizzleSql`
    INSERT INTO vehicle_model (brand_id, name, active, available_for_external_systems)
    VALUES (${br!.id}, ${`C2b2 CC ${label} Model`}, true, true)
    RETURNING id
  `);
  const [la] = await q<{ id: number }>(sharedDb, drizzleSql`
    INSERT INTO location (name, is_active) VALUES (${`C2b2 CC ${label} Loc A`}, true) RETURNING id
  `);
  const [lb] = await q<{ id: number }>(sharedDb, drizzleSql`
    INSERT INTO location (name, is_active) VALUES (${`C2b2 CC ${label} Loc B`}, true) RETURNING id
  `);
  return { brandId: br!.id, modelId: md!.id, locAId: la!.id, locBId: lb!.id };
}

async function teardownFixtures(ids: {
  brandId: number;
  modelId: number;
  locAId:  number;
  locBId:  number;
}): Promise<void> {
  await (sharedDb as unknown as DbExec).execute(
    drizzleSql`DELETE FROM vehicle_model WHERE id = ${ids.modelId}`,
  );
  await (sharedDb as unknown as DbExec).execute(
    drizzleSql`DELETE FROM brand WHERE id = ${ids.brandId}`,
  );
  await (sharedDb as unknown as DbExec).execute(
    drizzleSql`DELETE FROM location WHERE id IN (${ids.locAId}, ${ids.locBId})`,
  );
}

/** Insert a committed customer and return their id. */
async function insertCommittedCustomer(email: string): Promise<number> {
  const [u] = await q<{ id: number }>(sharedDb, drizzleSql`
    INSERT INTO "user" (email, full_name, phone)
    VALUES (${email}, 'Pre Customer', '+995500000001')
    RETURNING id
  `);
  return u!.id;
}

async function deleteCommittedCustomer(email: string): Promise<void> {
  await (sharedDb as unknown as DbExec).execute(
    drizzleSql`DELETE FROM "user" WHERE email = ${email}`,
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CC-A: Same normalized email, two concurrent bookings
// ══════════════════════════════════════════════════════════════════════════════

test("CC-A: same email concurrent bookings → 1 user, 2 bookings, both CREATED", async () => {
  const fixtures = await setupFixtures("CCA");
  const { pool: aPool, db: aDb } = makeTestDb(testDbUrl);
  const { pool: bPool, db: bDb } = makeTestDb(testDbUrl);
  const sharedEmail = `c2b2-cc-a-${randomUUID()}@rbg-test.invalid`;

  // Deferreds declared outside try so finally can release them.
  const aPidDeferred = new Deferred<number>();
  const bPidDeferred = new Deferred<number>();
  const aReady       = new Deferred<void>();
  const aRelease     = new Deferred<void>();

  const aBookingIds: number[] = [];
  const bBookingIds: number[] = [];
  let aPromise: Promise<unknown> | undefined;
  let bPromise: Promise<unknown> | undefined;

  try {
    // A's runner: capture PID before invoking callback
    const aRunner: RegionalIntakeTransactionRunner = (callback) =>
      (aDb as unknown as DbTx).transaction(async (tx) => {
        const pidResult = await (tx as unknown as DbExec).execute(
          drizzleSql`SELECT pg_backend_pid() AS pid`,
        );
        const pidRows = (pidResult as unknown as { rows: { pid: number }[] }).rows;
        aPidDeferred.resolve(pidRows[0]!.pid);
        return callback(tx as unknown as RbgTx);
      });

    // B's runner: capture PID before invoking callback
    const bRunner: RegionalIntakeTransactionRunner = (callback) =>
      (bDb as unknown as DbTx).transaction(async (tx) => {
        const pidResult = await (tx as unknown as DbExec).execute(
          drizzleSql`SELECT pg_backend_pid() AS pid`,
        );
        const pidRows = (pidResult as unknown as { rows: { pid: number }[] }).rows;
        bPidDeferred.resolve(pidRows[0]!.pid);
        return callback(tx as unknown as RbgTx);
      });

    const bodyA = makeBody({
      vehicleModelId:    fixtures.modelId,
      pickupLocationId:  fixtures.locAId,
      dropoffLocationId: fixtures.locBId,
      customerEmail:     sharedEmail,
      gatewayBookingId:  randomUUID(),
      gatewayQuoteId:    randomUUID(),
    });
    const bodyB = makeBody({
      vehicleModelId:    fixtures.modelId,
      pickupLocationId:  fixtures.locAId,
      dropoffLocationId: fixtures.locBId,
      customerEmail:     sharedEmail,
      gatewayBookingId:  randomUUID(),
      gatewayQuoteId:    randomUUID(),
    });

    const aSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: aRunner,
      txTestHooks: {
        afterCustomerResolve: async () => {
          aReady.resolve();
          await aRelease.promise;
        },
      },
    });
    const bSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: bRunner,
    });

    // Start A; wait until A has inserted the customer and is paused
    aPromise = aSvc({ brandCode: "batumicars", parsedJson: bodyA });
    const aPid = await withDeadline(aPidDeferred.promise, 5000, "CC-A: A PID readiness");
    await withDeadline(aReady.promise, 5000, "CC-A: A afterCustomerResolve readiness");

    // Start B; wait for B's PID
    bPromise = bSvc({ brandCode: "batumicars", parsedJson: bodyB });
    const bPid = await withDeadline(bPidDeferred.promise, 5000, "CC-A: B PID readiness");

    // ── Blocking proof: poll pg_stat_activity ──────────────────────────────
    const DEADLINE_MS   = 5000;
    const POLL_INTERVAL = 50;
    const start         = Date.now();
    let blockingConfirmed = false;

    while (Date.now() - start < DEADLINE_MS) {
      const pollRows = await q<{
        wait_event_type: string | null;
        blocking_pids:   unknown;
      }>(obsDb, drizzleSql`
        SELECT wait_event_type,
               pg_blocking_pids(${bPid}::int) AS blocking_pids
        FROM   pg_stat_activity
        WHERE  pid = ${bPid}::int
      `);

      if (pollRows.length === 0) {
        throw new Error(`STOP: B's PID ${bPid} disappeared from pg_stat_activity`);
      }

      const row     = pollRows[0]!;
      const rawPids = row.blocking_pids;
      let blockers: number[] = [];

      if (Array.isArray(rawPids)) {
        blockers = rawPids.map(Number);
      } else if (typeof rawPids === "string") {
        const matched = (rawPids as string).match(/\d+/g);
        blockers = matched ? matched.map(Number) : [];
      }

      if (row.wait_event_type === "Lock" && blockers.includes(aPid)) {
        blockingConfirmed = true;
        break;
      }

      await new Promise<void>((res) => setTimeout(res, POLL_INTERVAL));
    }

    if (!blockingConfirmed) {
      throw new Error(
        `STOP: B not confirmed blocked by A within ${DEADLINE_MS}ms. ` +
        `A_PID=${aPid} B_PID=${bPid}`,
      );
    }

    // Release A; A commits
    aRelease.resolve();
    const aResult = await withDeadline(
      aPromise as Promise<{ kind: string; bookingId?: number }>,
      8000,
      "CC-A: A service result",
    );
    assert.strictEqual(aResult.kind, "CREATED");
    if (aResult.kind !== "CREATED") return;
    aBookingIds.push(aResult.bookingId!);

    // B unblocks and commits
    const bResult = await withDeadline(
      bPromise as Promise<{ kind: string; bookingId?: number }>,
      8000,
      "CC-A: B service result",
    );
    assert.strictEqual(bResult.kind, "CREATED");
    if (bResult.kind !== "CREATED") return;
    bBookingIds.push(bResult.bookingId!);

    assert.notStrictEqual(aResult.bookingId, bResult.bookingId, "must produce two distinct bookings");

    // Assert: 1 user row
    const [uCnt] = await q<{ c: string }>(sharedDb,
      drizzleSql`SELECT COUNT(*)::text AS c FROM "user" WHERE email = ${sharedEmail}`,
    );
    assert.strictEqual(Number(uCnt!.c), 1, "exactly 1 user row");

    // Assert: 2 bookings
    const [bCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking
      WHERE id IN (${aResult.bookingId}, ${bResult.bookingId})
    `);
    assert.strictEqual(Number(bCnt!.c), 2, "exactly 2 bookings");

    // Assert: same user_id on both bookings
    const bkRows = await q<{ user_id: number }>(sharedDb, drizzleSql`
      SELECT user_id FROM booking
      WHERE id IN (${aResult.bookingId}, ${bResult.bookingId})
    `);
    assert.strictEqual(bkRows.length, 2);
    assert.strictEqual(
      bkRows[0]!.user_id, bkRows[1]!.user_id,
      "both bookings must share the same user_id",
    );

  } finally {
    try {
      // 1. Release every paused hook so transactions can finish or abort.
      aRelease.resolve();
      // 2. Boundedly drain any started service promises.
      const promises = [aPromise, bPromise].filter(Boolean) as Promise<unknown>[];
      if (promises.length > 0) {
        await withDeadline(Promise.allSettled(promises), 8000, "CC-A: finally drain");
      }
      // 3. Delete GBC rows for all recorded booking IDs (reverse-FK order).
      const allIds = [...aBookingIds, ...bBookingIds];
      for (const id of allIds) {
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${id}`,
        );
      }
      // 4. Delete all recorded booking rows.
      for (const id of allIds) {
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM booking WHERE id = ${id}`,
        );
      }
      // 5. Delete the shared customer exactly once.
      await (sharedDb as unknown as DbExec).execute(
        drizzleSql`DELETE FROM "user" WHERE email = ${sharedEmail}`,
      );
      // 6. Teardown brand/model/location fixtures.
      await teardownFixtures(fixtures);
    } finally {
      // 7. Close request-specific pools — runs even if DB cleanup fails.
      await aPool.end();
      await bPool.end();
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CC-B: Identical simultaneous requests → CREATED + REPLAYED
// ══════════════════════════════════════════════════════════════════════════════

test("CC-B: identical simultaneous requests → CREATED + REPLAYED", async () => {
  const fixtures = await setupFixtures("CCB");
  const { pool: aPool, db: aDb } = makeTestDb(testDbUrl);
  const { pool: bPool, db: bDb } = makeTestDb(testDbUrl);

  const customerEmail    = `c2b2-cc-b-${randomUUID()}@rbg-test.invalid`;
  const customerId       = await insertCommittedCustomer(customerEmail);
  const gatewayBookingId = randomUUID();
  const gatewayQuoteId   = randomUUID();

  const body = makeBody({
    vehicleModelId:    fixtures.modelId,
    pickupLocationId:  fixtures.locAId,
    dropoffLocationId: fixtures.locBId,
    customerEmail,
    gatewayBookingId,
    gatewayQuoteId,
  });

  // All deferreds declared outside try so finally can release them.
  const aProceedReady   = new Deferred<void>();
  const aProceedRelease = new Deferred<void>();
  const bProceedReady   = new Deferred<void>();
  const bProceedRelease = new Deferred<void>();
  const bAttrReady      = new Deferred<void>();
  const bAttrRelease    = new Deferred<void>();
  const bConstraint     = new Deferred<{ code?: string; constraint?: string }>();

  let aBookingId: number | undefined;
  let aPromise: Promise<unknown> | undefined;
  let bPromise: Promise<unknown> | undefined;

  try {
    const aRunner: RegionalIntakeTransactionRunner = makeRunner(aDb);
    const bRunner: RegionalIntakeTransactionRunner = async (callback) => {
      try {
        return await (bDb as unknown as DbTx).transaction((tx) => callback(tx as unknown as RbgTx));
      } catch (error) {
        const meta = extractPostgresErrorMetadata(error);
        bConstraint.resolve({ code: meta.code, constraint: meta.constraint });
        throw error;
      }
    };

    const aSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: aRunner,
      svcTestHooks: {
        afterPreReadProceed: async () => {
          aProceedReady.resolve();
          await aProceedRelease.promise;
        },
      },
    });
    const bSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: bRunner,
      svcTestHooks: {
        afterPreReadProceed: async () => {
          bProceedReady.resolve();
          await bProceedRelease.promise;
        },
      },
      txTestHooks: {
        afterAttributionInsert: async () => {
          bAttrReady.resolve();
          await bAttrRelease.promise;
        },
      },
    });

    aPromise = aSvc({ brandCode: "batumicars", parsedJson: body });
    bPromise = bSvc({ brandCode: "batumicars", parsedJson: body });

    // Wait until both have reached PROCEED
    await withDeadline(
      Promise.all([aProceedReady.promise, bProceedReady.promise]),
      5000,
      "CC-B: proceed readiness",
    );

    // Release B first → B enters transaction
    bProceedRelease.resolve();
    // Wait until B is paused after attribution insert
    await withDeadline(bAttrReady.promise, 5000, "CC-B: B attribution readiness");

    // Release A → A runs its full transaction and commits
    aProceedRelease.resolve();
    const aResult = await withDeadline(
      aPromise as Promise<{ kind: string; bookingId?: number }>,
      8000,
      "CC-B: A service result",
    );
    assert.strictEqual(aResult.kind, "CREATED");
    if (aResult.kind !== "CREATED") return;
    aBookingId = aResult.bookingId;

    // Release B → B tries context insert → hits approved 23505
    bAttrRelease.resolve();
    const bResult = await withDeadline(
      bPromise as Promise<{ kind: string; bookingId?: number; created?: boolean }>,
      8000,
      "CC-B: B service result",
    );
    assert.strictEqual(bResult.kind, "REPLAYED");
    if (bResult.kind !== "REPLAYED") return;
    assert.strictEqual(bResult.bookingId, aBookingId, "REPLAYED must reference A's booking");
    assert.strictEqual(bResult.created, false);

    // Verify captured constraint (already resolved by the time bPromise resolved)
    const meta = await withDeadline(bConstraint.promise, 2000, "CC-B: captured constraint");
    assert.strictEqual(meta.code, "23505", "captured code must be 23505");
    assert.ok(
      meta.constraint === "uq_gbc_brand_gateway_booking" ||
      meta.constraint === "uq_gbc_brand_gateway_quote",
      `captured constraint must be one of the two approved constraints, got: ${meta.constraint}`,
    );

    // ── Strengthened assertions: prove B's booking and attribution rolled back ──

    // Exactly one booking exists; its id equals A's bookingId
    const [bkCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking WHERE id = ${aBookingId}
    `);
    assert.strictEqual(Number(bkCnt!.c), 1, "exactly 1 booking");

    // booking.user_id equals the pre-committed customer ID
    const [bkRow] = await q<{ id: number; user_id: number }>(sharedDb, drizzleSql`
      SELECT id, user_id FROM booking WHERE id = ${aBookingId}
    `);
    assert.ok(bkRow, "booking row must exist");
    assert.strictEqual(bkRow!.user_id, customerId, "booking user_id must equal pre-committed customer ID");

    // Exactly one booking_attribution exists
    const [attrCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking_attribution WHERE booking_id = ${aBookingId}
    `);
    assert.strictEqual(Number(attrCnt!.c), 1, "exactly 1 attribution");

    // Exactly one gateway_booking_context exists
    const [gbcCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context WHERE booking_id = ${aBookingId}
    `);
    assert.strictEqual(Number(gbcCnt!.c), 1, "exactly 1 GBC");

    // No second booking exists for the test gateway booking identifier
    const [dupCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context
      WHERE gateway_booking_id = ${gatewayBookingId}::uuid
    `);
    assert.strictEqual(Number(dupCnt!.c), 1, "no second booking for the gateway booking ID");

    // Pre-committed user exists exactly once; email, full_name and phone unchanged
    const [usr] = await q<{ id: number; email: string; full_name: string; phone: string }>(
      sharedDb,
      drizzleSql`SELECT id, email, full_name, phone FROM "user" WHERE id = ${customerId}`,
    );
    assert.ok(usr, "pre-committed user must exist");
    assert.strictEqual(usr!.email,     customerEmail,   "user email must be unchanged");
    assert.strictEqual(usr!.full_name, "Pre Customer",  "user full_name must be unchanged");
    assert.strictEqual(usr!.phone,     "+995500000001", "user phone must be unchanged");

  } finally {
    try {
      // 1. Resolve every release gate unconditionally.
      aProceedRelease.resolve();
      bProceedRelease.resolve();
      bAttrRelease.resolve();
      // 2. Boundedly drain started service promises.
      const promises = [aPromise, bPromise].filter(Boolean) as Promise<unknown>[];
      if (promises.length > 0) {
        await withDeadline(Promise.allSettled(promises), 8000, "CC-B: finally drain");
      }
      // 3. Reverse-FK DB cleanup.
      if (aBookingId !== undefined) {
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${aBookingId}`,
        );
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM booking WHERE id = ${aBookingId}`,
        );
      }
      await deleteCommittedCustomer(customerEmail);
      await teardownFixtures(fixtures);
    } finally {
      // 4. Close request-specific pools — runs even if DB cleanup fails.
      await aPool.end();
      await bPool.end();
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CC-C: Same quote ID, different booking IDs → CREATED + CONFLICT
// ══════════════════════════════════════════════════════════════════════════════

test("CC-C: same quote ID, different booking IDs → CREATED + CONFLICT (quote constraint)", async () => {
  const fixtures = await setupFixtures("CCC");
  const { pool: aPool, db: aDb } = makeTestDb(testDbUrl);
  const { pool: bPool, db: bDb } = makeTestDb(testDbUrl);

  const customerEmail = `c2b2-cc-c-${randomUUID()}@rbg-test.invalid`;
  const customerId    = await insertCommittedCustomer(customerEmail);

  const sharedQuoteId = randomUUID(); // same for A and B
  const bookingIdA    = randomUUID(); // different
  const bookingIdB    = randomUUID(); // different

  const bodyA = makeBody({
    vehicleModelId:    fixtures.modelId,
    pickupLocationId:  fixtures.locAId,
    dropoffLocationId: fixtures.locBId,
    customerEmail,
    gatewayBookingId:  bookingIdA,
    gatewayQuoteId:    sharedQuoteId,
  });
  const bodyB = makeBody({
    vehicleModelId:    fixtures.modelId,
    pickupLocationId:  fixtures.locAId,
    dropoffLocationId: fixtures.locBId,
    customerEmail,
    gatewayBookingId:  bookingIdB,
    gatewayQuoteId:    sharedQuoteId,
  });

  // All deferreds declared outside try so finally can release them.
  const aProceedReady   = new Deferred<void>();
  const aProceedRelease = new Deferred<void>();
  const bProceedReady   = new Deferred<void>();
  const bProceedRelease = new Deferred<void>();
  const bAttrReady      = new Deferred<void>();
  const bAttrRelease    = new Deferred<void>();
  const bConstraint     = new Deferred<{ code?: string; constraint?: string }>();

  let aBookingId: number | undefined;
  let aPromise: Promise<unknown> | undefined;
  let bPromise: Promise<unknown> | undefined;

  try {
    const aRunner: RegionalIntakeTransactionRunner = makeRunner(aDb);
    const bRunner: RegionalIntakeTransactionRunner = async (callback) => {
      try {
        return await (bDb as unknown as DbTx).transaction((tx) => callback(tx as unknown as RbgTx));
      } catch (error) {
        const meta = extractPostgresErrorMetadata(error);
        bConstraint.resolve({ code: meta.code, constraint: meta.constraint });
        throw error;
      }
    };

    const aSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: aRunner,
      svcTestHooks: {
        afterPreReadProceed: async () => { aProceedReady.resolve(); await aProceedRelease.promise; },
      },
    });
    const bSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: bRunner,
      svcTestHooks: {
        afterPreReadProceed: async () => { bProceedReady.resolve(); await bProceedRelease.promise; },
      },
      txTestHooks: {
        afterAttributionInsert: async () => { bAttrReady.resolve(); await bAttrRelease.promise; },
      },
    });

    aPromise = aSvc({ brandCode: "batumicars", parsedJson: bodyA });
    bPromise = bSvc({ brandCode: "batumicars", parsedJson: bodyB });

    await withDeadline(
      Promise.all([aProceedReady.promise, bProceedReady.promise]),
      5000,
      "CC-C: proceed readiness",
    );
    bProceedRelease.resolve();
    await withDeadline(bAttrReady.promise, 5000, "CC-C: B attribution readiness");

    aProceedRelease.resolve();
    const aResult = await withDeadline(
      aPromise as Promise<{ kind: string; bookingId?: number }>,
      8000,
      "CC-C: A service result",
    );
    assert.strictEqual(aResult.kind, "CREATED");
    if (aResult.kind !== "CREATED") return;
    aBookingId = aResult.bookingId;

    bAttrRelease.resolve();
    const bResult = await withDeadline(
      bPromise as Promise<{ kind: string }>,
      8000,
      "CC-C: B service result",
    );
    assert.strictEqual(bResult.kind, "CONFLICT");

    // Verify captured constraint — must be the quote constraint specifically
    const meta = await withDeadline(bConstraint.promise, 2000, "CC-C: captured constraint");
    assert.strictEqual(meta.code, "23505");
    assert.strictEqual(
      meta.constraint, "uq_gbc_brand_gateway_quote",
      "CC-C must isolate the quote constraint",
    );

    // ── Strengthened assertions ──

    // Exactly one booking across A and B external reservation codes
    const [totCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context
      WHERE gateway_booking_id = ${bookingIdA}::uuid
         OR gateway_booking_id = ${bookingIdB}::uuid
    `);
    assert.strictEqual(Number(totCnt!.c), 1, "exactly one booking across A and B booking IDs");

    // That booking corresponds to A's gatewayBookingId
    const [aCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context
      WHERE gateway_booking_id = ${bookingIdA}::uuid
    `);
    assert.strictEqual(Number(aCnt!.c), 1, "surviving GBC has A's gatewayBookingId");

    // surviving booking's user_id equals pre-committed customer ID
    const [bkRow] = await q<{ user_id: number }>(sharedDb, drizzleSql`
      SELECT user_id FROM booking WHERE id = ${aBookingId}
    `);
    assert.ok(bkRow, "booking row must exist");
    assert.strictEqual(bkRow!.user_id, customerId, "booking user_id must equal pre-committed customer ID");

    // Exactly one attribution for the surviving booking
    const [attrCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking_attribution WHERE booking_id = ${aBookingId}
    `);
    assert.strictEqual(Number(attrCnt!.c), 1, "exactly 1 attribution");

    // Exactly one GBC for the shared quote ID
    const [gbcCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context
      WHERE gateway_quote_id = ${sharedQuoteId}::uuid
    `);
    assert.strictEqual(Number(gbcCnt!.c), 1, "exactly 1 GBC for shared quote ID");

    // No booking for B's gatewayBookingId
    const [bCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context
      WHERE gateway_booking_id = ${bookingIdB}::uuid
    `);
    assert.strictEqual(Number(bCnt!.c), 0, "no booking for B's gatewayBookingId");

    // Pre-committed user's email, full_name and phone unchanged
    const [usr] = await q<{ email: string; full_name: string; phone: string }>(
      sharedDb,
      drizzleSql`SELECT email, full_name, phone FROM "user" WHERE id = ${customerId}`,
    );
    assert.ok(usr, "pre-committed user must exist");
    assert.strictEqual(usr!.email,     customerEmail,   "user email must be unchanged");
    assert.strictEqual(usr!.full_name, "Pre Customer",  "user full_name must be unchanged");
    assert.strictEqual(usr!.phone,     "+995500000001", "user phone must be unchanged");

  } finally {
    try {
      // 1. Resolve every release gate unconditionally.
      aProceedRelease.resolve();
      bProceedRelease.resolve();
      bAttrRelease.resolve();
      // 2. Boundedly drain started service promises.
      const promises = [aPromise, bPromise].filter(Boolean) as Promise<unknown>[];
      if (promises.length > 0) {
        await withDeadline(Promise.allSettled(promises), 8000, "CC-C: finally drain");
      }
      // 3. Reverse-FK DB cleanup.
      if (aBookingId !== undefined) {
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${aBookingId}`,
        );
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM booking WHERE id = ${aBookingId}`,
        );
      }
      await deleteCommittedCustomer(customerEmail);
      await teardownFixtures(fixtures);
    } finally {
      // 4. Close request-specific pools — runs even if DB cleanup fails.
      await aPool.end();
      await bPool.end();
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CC-D: Same booking ID, different quote IDs → CREATED + CONFLICT
// ══════════════════════════════════════════════════════════════════════════════

test("CC-D: same booking ID, different quote IDs → CREATED + CONFLICT (booking constraint)", async () => {
  const fixtures = await setupFixtures("CCD");
  // Second model for distinct fingerprint — cleaned up in finally before fixtures.
  const [md2] = await q<{ id: number }>(sharedDb, drizzleSql`
    INSERT INTO vehicle_model (brand_id, name, active, available_for_external_systems)
    VALUES (${fixtures.brandId}, 'C2b2 CC CCD Model B', true, true)
    RETURNING id
  `);
  const modelBId = md2!.id;

  const { pool: aPool, db: aDb } = makeTestDb(testDbUrl);
  const { pool: bPool, db: bDb } = makeTestDb(testDbUrl);

  const customerEmail   = `c2b2-cc-d-${randomUUID()}@rbg-test.invalid`;
  const customerId      = await insertCommittedCustomer(customerEmail);

  const sharedBookingId = randomUUID(); // same for A and B
  const quoteIdA        = randomUUID(); // different
  const quoteIdB        = randomUUID(); // different

  const bodyA = makeBody({
    vehicleModelId:    fixtures.modelId,
    pickupLocationId:  fixtures.locAId,
    dropoffLocationId: fixtures.locBId,
    customerEmail,
    gatewayBookingId:  sharedBookingId,
    gatewayQuoteId:    quoteIdA,
    totalAmountCents:  15000,
  });
  const bodyB = makeBody({
    vehicleModelId:    modelBId,    // different model → different fingerprint
    pickupLocationId:  fixtures.locAId,
    dropoffLocationId: fixtures.locBId,
    customerEmail,
    gatewayBookingId:  sharedBookingId,
    gatewayQuoteId:    quoteIdB,
    totalAmountCents:  25000,       // different amount → different fingerprint
  });

  // All deferreds declared outside try so finally can release them.
  const aProceedReady   = new Deferred<void>();
  const aProceedRelease = new Deferred<void>();
  const bProceedReady   = new Deferred<void>();
  const bProceedRelease = new Deferred<void>();
  const bAttrReady      = new Deferred<void>();
  const bAttrRelease    = new Deferred<void>();
  const bConstraint     = new Deferred<{ code?: string; constraint?: string }>();

  let aBookingId: number | undefined;
  let aPromise: Promise<unknown> | undefined;
  let bPromise: Promise<unknown> | undefined;

  try {
    const aRunner: RegionalIntakeTransactionRunner = makeRunner(aDb);
    const bRunner: RegionalIntakeTransactionRunner = async (callback) => {
      try {
        return await (bDb as unknown as DbTx).transaction((tx) => callback(tx as unknown as RbgTx));
      } catch (error) {
        const meta = extractPostgresErrorMetadata(error);
        bConstraint.resolve({ code: meta.code, constraint: meta.constraint });
        throw error;
      }
    };

    const aSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: aRunner,
      svcTestHooks: {
        afterPreReadProceed: async () => { aProceedReady.resolve(); await aProceedRelease.promise; },
      },
    });
    const bSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: bRunner,
      svcTestHooks: {
        afterPreReadProceed: async () => { bProceedReady.resolve(); await bProceedRelease.promise; },
      },
      txTestHooks: {
        afterAttributionInsert: async () => { bAttrReady.resolve(); await bAttrRelease.promise; },
      },
    });

    aPromise = aSvc({ brandCode: "batumicars", parsedJson: bodyA });
    bPromise = bSvc({ brandCode: "batumicars", parsedJson: bodyB });

    await withDeadline(
      Promise.all([aProceedReady.promise, bProceedReady.promise]),
      5000,
      "CC-D: proceed readiness",
    );
    bProceedRelease.resolve();
    await withDeadline(bAttrReady.promise, 5000, "CC-D: B attribution readiness");

    aProceedRelease.resolve();
    const aResult = await withDeadline(
      aPromise as Promise<{ kind: string; bookingId?: number }>,
      8000,
      "CC-D: A service result",
    );
    assert.strictEqual(aResult.kind, "CREATED");
    if (aResult.kind !== "CREATED") return;
    aBookingId = aResult.bookingId;

    bAttrRelease.resolve();
    const bResult = await withDeadline(
      bPromise as Promise<{ kind: string }>,
      8000,
      "CC-D: B service result",
    );
    assert.strictEqual(bResult.kind, "CONFLICT");

    // Verify captured constraint — must be the booking constraint specifically
    const meta = await withDeadline(bConstraint.promise, 2000, "CC-D: captured constraint");
    assert.strictEqual(meta.code, "23505");
    assert.strictEqual(
      meta.constraint, "uq_gbc_brand_gateway_booking",
      "CC-D must isolate the booking constraint",
    );

    // ── Strengthened assertions ──

    // Exactly one booking for the shared external reservation code
    const [extCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking
      WHERE external_reservation_code = ${sharedBookingId}
    `);
    assert.strictEqual(Number(extCnt!.c), 1, "exactly 1 booking for shared booking ID");

    // Surviving booking has A's vehicleModelId and A's exact total amount
    const [bkRow] = await q<{ vehicle_model_id: number; user_id: number }>(sharedDb, drizzleSql`
      SELECT vehicle_model_id, user_id FROM booking WHERE id = ${aBookingId}
    `);
    assert.ok(bkRow, "booking row must exist");
    assert.strictEqual(bkRow!.vehicle_model_id, fixtures.modelId, "surviving booking has A's vehicleModelId");
    assert.strictEqual(bkRow!.user_id, customerId, "booking user_id must equal pre-committed customer ID");

    const [gbcRow] = await q<{ total_amount_cents: number; gateway_quote_id: string }>(sharedDb, drizzleSql`
      SELECT total_amount_cents, gateway_quote_id::text AS gateway_quote_id
      FROM gateway_booking_context WHERE booking_id = ${aBookingId}
    `);
    assert.ok(gbcRow, "GBC row must exist");
    assert.strictEqual(Number(gbcRow!.total_amount_cents), 15000, "surviving GBC has A's totalAmountCents");

    // Exactly one attribution exists
    const [attrCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking_attribution WHERE booking_id = ${aBookingId}
    `);
    assert.strictEqual(Number(attrCnt!.c), 1, "exactly 1 attribution");

    // Exactly one GBC exists
    const [gbcCnt] = await q<{ c: string }>(sharedDb, drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context WHERE booking_id = ${aBookingId}
    `);
    assert.strictEqual(Number(gbcCnt!.c), 1, "exactly 1 GBC");

    // Surviving GBC contains A's quote ID, not B's quote ID
    assert.strictEqual(
      gbcRow!.gateway_quote_id.toLowerCase(), quoteIdA.toLowerCase(),
      "surviving GBC has A's quote ID",
    );
    assert.notStrictEqual(
      gbcRow!.gateway_quote_id.toLowerCase(), quoteIdB.toLowerCase(),
      "surviving GBC must not have B's quote ID",
    );

    // Pre-committed user's email, full_name and phone unchanged
    const [usr] = await q<{ email: string; full_name: string; phone: string }>(
      sharedDb,
      drizzleSql`SELECT email, full_name, phone FROM "user" WHERE id = ${customerId}`,
    );
    assert.ok(usr, "pre-committed user must exist");
    assert.strictEqual(usr!.email,     customerEmail,   "user email must be unchanged");
    assert.strictEqual(usr!.full_name, "Pre Customer",  "user full_name must be unchanged");
    assert.strictEqual(usr!.phone,     "+995500000001", "user phone must be unchanged");

  } finally {
    try {
      // 1. Resolve every release gate unconditionally.
      aProceedRelease.resolve();
      bProceedRelease.resolve();
      bAttrRelease.resolve();
      // 2. Boundedly drain started service promises.
      const promises = [aPromise, bPromise].filter(Boolean) as Promise<unknown>[];
      if (promises.length > 0) {
        await withDeadline(Promise.allSettled(promises), 8000, "CC-D: finally drain");
      }
      // 3. Reverse-FK DB cleanup.
      if (aBookingId !== undefined) {
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${aBookingId}`,
        );
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM booking WHERE id = ${aBookingId}`,
        );
      }
      await deleteCommittedCustomer(customerEmail);
      // Extra model must be deleted before the brand it belongs to.
      await (sharedDb as unknown as DbExec).execute(
        drizzleSql`DELETE FROM vehicle_model WHERE id = ${modelBId}`,
      );
      await teardownFixtures(fixtures);
    } finally {
      // 4. Close request-specific pools — runs even if DB cleanup fails.
      await aPool.end();
      await bPool.end();
    }
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CC-E: Reversed-location overlap regression (no deadlock claim)
// ══════════════════════════════════════════════════════════════════════════════

test("CC-E: reversed-location overlap → both CREATED within bounded deadline, no hang", async () => {
  const fixtures = await setupFixtures("CCE");
  const { pool: aPool, db: aDb } = makeTestDb(testDbUrl);
  const { pool: bPool, db: bDb } = makeTestDb(testDbUrl);

  // Two distinct pre-committed customers
  const emailA = `c2b2-cc-e-a-${randomUUID()}@rbg-test.invalid`;
  const emailB = `c2b2-cc-e-b-${randomUUID()}@rbg-test.invalid`;
  await insertCommittedCustomer(emailA);
  await insertCommittedCustomer(emailB);

  // Disjoint gateway identifiers for A and B
  const bookingIdA = randomUUID();
  const quoteIdA   = randomUUID();
  const bookingIdB = randomUUID();
  const quoteIdB   = randomUUID();

  assert.notStrictEqual(bookingIdA, bookingIdB, "booking IDs must be disjoint");
  assert.notStrictEqual(quoteIdA,   quoteIdB,   "quote IDs must be disjoint");

  const bodyA = makeBody({
    vehicleModelId:    fixtures.modelId,
    pickupLocationId:  fixtures.locAId,  // Loc-E1
    dropoffLocationId: fixtures.locBId,  // Loc-E2
    customerEmail:     emailA,
    gatewayBookingId:  bookingIdA,
    gatewayQuoteId:    quoteIdA,
  });
  const bodyB = makeBody({
    vehicleModelId:    fixtures.modelId,
    pickupLocationId:  fixtures.locBId,  // Loc-E2 (reversed)
    dropoffLocationId: fixtures.locAId,  // Loc-E1 (reversed)
    customerEmail:     emailB,
    gatewayBookingId:  bookingIdB,
    gatewayQuoteId:    quoteIdB,
  });

  // All deferreds declared outside try so finally can release them.
  const aProceedReady    = new Deferred<void>();
  const aProceedRelease  = new Deferred<void>();
  const bProceedReady    = new Deferred<void>();
  const bProceedRelease  = new Deferred<void>();
  const aCustomerReady   = new Deferred<void>();
  const aCustomerRelease = new Deferred<void>();
  const bCustomerReady   = new Deferred<void>();
  const bCustomerRelease = new Deferred<void>();

  let aBookingId: number | undefined;
  let bBookingId: number | undefined;
  let aPromise: Promise<unknown> | undefined;
  let bPromise: Promise<unknown> | undefined;

  try {
    const aSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: makeRunner(aDb),
      svcTestHooks: {
        afterPreReadProceed: async () => { aProceedReady.resolve(); await aProceedRelease.promise; },
      },
      txTestHooks: {
        afterCustomerResolve: async () => {
          // FOR SHARE locks on both locations already acquired at this point.
          aCustomerReady.resolve();
          await aCustomerRelease.promise;
        },
      },
    });
    const bSvc = createRegionalIntakeService({
      committedDb:    sharedDb,
      runTransaction: makeRunner(bDb),
      svcTestHooks: {
        afterPreReadProceed: async () => { bProceedReady.resolve(); await bProceedRelease.promise; },
      },
      txTestHooks: {
        afterCustomerResolve: async () => {
          bCustomerReady.resolve();
          await bCustomerRelease.promise;
        },
      },
    });

    aPromise = aSvc({ brandCode: "batumicars", parsedJson: bodyA });
    bPromise = bSvc({ brandCode: "batumicars", parsedJson: bodyB });

    // Wait until both have reached PROCEED
    await withDeadline(
      Promise.all([aProceedReady.promise, bProceedReady.promise]),
      5000,
      "CC-E: proceed readiness",
    );

    // Release both into their transactions
    aProceedRelease.resolve();
    bProceedRelease.resolve();

    // Wait until both have acquired FOR SHARE locks and are paused at afterCustomerResolve
    await withDeadline(
      Promise.all([aCustomerReady.promise, bCustomerReady.promise]),
      5000,
      "CC-E: customer readiness",
    );

    // Release both (FOR SHARE locks are mutually compatible — no deadlock)
    aCustomerRelease.resolve();
    bCustomerRelease.resolve();

    // Both must complete within bounded deadline (hang detector only)
    const [aResult, bResult] = await withDeadline(
      Promise.all([
        aPromise as Promise<{ kind: string; bookingId?: number }>,
        bPromise as Promise<{ kind: string; bookingId?: number }>,
      ]),
      5000,
      "CC-E: both service results",
    );

    assert.strictEqual(aResult.kind, "CREATED");
    assert.strictEqual(bResult.kind, "CREATED");
    if (aResult.kind !== "CREATED" || bResult.kind !== "CREATED") return;

    aBookingId = aResult.bookingId;
    bBookingId = bResult.bookingId;
    assert.notStrictEqual(aBookingId, bBookingId, "must produce two distinct bookings");

  } finally {
    try {
      // 1. Resolve every release gate unconditionally.
      aProceedRelease.resolve();
      bProceedRelease.resolve();
      aCustomerRelease.resolve();
      bCustomerRelease.resolve();
      // 2. Boundedly drain started service promises.
      const promises = [aPromise, bPromise].filter(Boolean) as Promise<unknown>[];
      if (promises.length > 0) {
        await withDeadline(Promise.allSettled(promises), 8000, "CC-E: finally drain");
      }
      // 3. Reverse-FK DB cleanup.
      if (aBookingId !== undefined) {
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${aBookingId}`,
        );
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM booking WHERE id = ${aBookingId}`,
        );
      }
      if (bBookingId !== undefined) {
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bBookingId}`,
        );
        await (sharedDb as unknown as DbExec).execute(
          drizzleSql`DELETE FROM booking WHERE id = ${bBookingId}`,
        );
      }
      await deleteCommittedCustomer(emailA);
      await deleteCommittedCustomer(emailB);
      await teardownFixtures(fixtures);
    } finally {
      // 4. Close request-specific pools — runs even if DB cleanup fails.
      await aPool.end();
      await bPool.end();
    }
  }
});
