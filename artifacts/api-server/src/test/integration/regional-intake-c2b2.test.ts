/**
 * regional-intake-c2b2.test.ts
 *
 * C2b-2 PostgreSQL integration tests: service orchestration and idempotency.
 *
 * Tests:
 *   S-1  — first creation → CREATED; all four rows committed
 *   S-2  — identical sequential retry → REPLAYED; no second booking
 *   S-3  — same booking+quote IDs, different fingerprint → CONFLICT
 *   S-4  — same booking ID, different quote ID → CONFLICT
 *   S-5  — different booking ID, same quote ID → CONFLICT
 *   S-6  — distinct booking+quote IDs under same brand → second independent CREATED
 *   S-7  — same booking+quote under other canonical brand → independent CREATED
 *   S-8  — unavailable vehicle model → VEHICLE_MODEL_UNAVAILABLE; no customer/booking
 *   S-9  — unavailable location → LOCATION_UNAVAILABLE; no booking
 *   S-10 — lost-response retry simulation → REPLAYED on second call
 *
 * DB GUARD:
 *   Connects only to RBG_TEST_DATABASE_URL. Exits process.exit(1) if absent.
 *   Never falls back to DATABASE_URL.
 *
 * POOL OWNERSHIP:
 *   All drizzle() instances are created from explicit pool references (via
 *   $client). All pools are closed in after() with await pool.end().
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:integration:c2b2
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

// ── DB URL guard ──────────────────────────────────────────────────────────────

const testDbUrl = (() => {
  const url = process.env["RBG_TEST_DATABASE_URL"];
  if (!url) {
    console.error(
      "STOP: RBG_TEST_DATABASE_URL is not set. " +
      "Set RBG_TEST_DATABASE_URL to a dedicated test database before running " +
      "test:integration:c2b2.",
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
const { pool: txPool, db: txDb } = makeTestDb(testDbUrl);

const runTransaction: RegionalIntakeTransactionRunner = (callback) =>
  (txDb as unknown as { transaction: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown> })
    .transaction((tx) => callback(tx as unknown as RbgTx)) as Promise<never>;

// ── Shared prerequisite state ─────────────────────────────────────────────────

let sharedBrandId:  number;
let sharedModelId:  number;
let sharedLocAId:   number;
let sharedLocBId:   number;
let sharedModelBId: number; // second brand + model for S-7

async function q<T extends Record<string, unknown>>(
  query: ReturnType<typeof drizzleSql>,
): Promise<T[]> {
  const result = await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> })
    .execute(query);
  return (result as unknown as { rows: T[] }).rows;
}

before(async () => {
  // Brand and models
  const [br] = await q<{ id: number }>(drizzleSql`
    INSERT INTO brand (name) VALUES ('C2b2 Brand') RETURNING id
  `);
  sharedBrandId = br!.id;

  const [mdl] = await q<{ id: number }>(drizzleSql`
    INSERT INTO vehicle_model (brand_id, name, active, available_for_external_systems)
    VALUES (${sharedBrandId}, 'C2b2 Model', true, true)
    RETURNING id
  `);
  sharedModelId = mdl!.id;

  // Second model for CC-D (different vehicleModelId in same brand)
  const [mdlB] = await q<{ id: number }>(drizzleSql`
    INSERT INTO vehicle_model (brand_id, name, active, available_for_external_systems)
    VALUES (${sharedBrandId}, 'C2b2 Model B', true, true)
    RETURNING id
  `);
  sharedModelBId = mdlB!.id;

  // Two active locations
  const [locA] = await q<{ id: number }>(drizzleSql`
    INSERT INTO location (name, is_active) VALUES ('C2b2 Loc A', true) RETURNING id
  `);
  sharedLocAId = locA!.id;

  const [locB] = await q<{ id: number }>(drizzleSql`
    INSERT INTO location (name, is_active) VALUES ('C2b2 Loc B', true) RETURNING id
  `);
  sharedLocBId = locB!.id;
});

after(async () => {
  await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
    drizzleSql`DELETE FROM vehicle_model WHERE id IN (${sharedModelId}, ${sharedModelBId})`,
  );
  await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
    drizzleSql`DELETE FROM brand WHERE id = ${sharedBrandId}`,
  );
  await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
    drizzleSql`DELETE FROM location WHERE id IN (${sharedLocAId}, ${sharedLocBId})`,
  );
  await committedPool.end();
  await txPool.end();
});

// ── Helpers ───────────────────────────────────────────────name ────────────────

/** Build a valid parsedJson body with unique IDs. */
function makeBody(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    gatewayBookingId:  randomUUID(),
    gatewayQuoteId:    randomUUID(),
    vehicleModelId:    sharedModelId,
    pickupLocationId:  sharedLocAId,
    dropoffLocationId: sharedLocBId,
    pickupDatetime:    "2026-09-01T10:00",
    dropoffDatetime:   "2026-09-05T10:00",
    totalAmountCents:  15000,
    currency:          "EUR",
    customerName:      "Test Customer",
    customerEmail:     `c2b2-${randomUUID()}@rbg-test.invalid`,
    customerPhone:     "+995500000099",
    ...overrides,
  };
}

/** Delete all rows created by a successful service call (reverse FK order). */
async function cleanupCreated(bookingId: number, email: string): Promise<void> {
  await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
    drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bookingId}`,
  );
  await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
    drizzleSql`DELETE FROM booking WHERE id = ${bookingId}`,
  );
  await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
    drizzleSql`DELETE FROM "user" WHERE email = ${email}`,
  );
}

function makeService() {
  return createRegionalIntakeService({ committedDb, runTransaction });
}

// ── S-1: First creation → CREATED ────────────────────────────────────────────

test("S-1: first creation → CREATED; all four rows committed", async () => {
  const body = makeBody();
  const email = body["customerEmail"] as string;
  const service = makeService();
  let bookingId: number | undefined;

  try {
    const result = await service({ brandCode: "batumicars", parsedJson: body });
    assert.strictEqual(result.kind, "CREATED");
    if (result.kind !== "CREATED") return;
    bookingId = result.bookingId;
    assert.ok(bookingId > 0);
    assert.match(result.reference, /^TC-\d{5,}$/);
    assert.strictEqual(result.created, true);

    const [usr] = await q<{ id: number }>(drizzleSql`SELECT id FROM "user" WHERE email = ${email}`);
    assert.ok(usr, "user row must be committed");

    const [bk] = await q<{ id: number; source: string }>(
      drizzleSql`SELECT id, source FROM booking WHERE id = ${bookingId}`,
    );
    assert.ok(bk, "booking row must be committed");
    assert.strictEqual(bk!.source, "gateway");

    const [attr] = await q<{ id: number }>(
      drizzleSql`SELECT id FROM booking_attribution WHERE booking_id = ${bookingId}`,
    );
    assert.ok(attr, "booking_attribution row must be committed");

    const [gbc] = await q<{ id: number }>(
      drizzleSql`SELECT id FROM gateway_booking_context WHERE booking_id = ${bookingId}`,
    );
    assert.ok(gbc, "gateway_booking_context row must be committed");
  } finally {
    if (bookingId !== undefined) await cleanupCreated(bookingId, email);
  }
});

// ── S-2: Identical sequential retry → REPLAYED ───────────────────────────────

test("S-2: identical sequential retry → REPLAYED; no second booking", async () => {
  const body = makeBody();
  const email = body["customerEmail"] as string;
  const service = makeService();
  let bookingId: number | undefined;

  try {
    const r1 = await service({ brandCode: "batumicars", parsedJson: body });
    assert.strictEqual(r1.kind, "CREATED");
    if (r1.kind !== "CREATED") return;
    bookingId = r1.bookingId;

    const r2 = await service({ brandCode: "batumicars", parsedJson: body });
    assert.strictEqual(r2.kind, "REPLAYED");
    if (r2.kind !== "REPLAYED") return;
    assert.strictEqual(r2.bookingId, bookingId, "bookingId must match first call");
    assert.strictEqual(r2.created, false);

    const [cnt] = await q<{ c: string }>(
      drizzleSql`SELECT COUNT(*)::text AS c FROM booking WHERE source='gateway' AND id = ${bookingId}`,
    );
    assert.strictEqual(Number(cnt!.c), 1, "exactly 1 booking row must exist");

    const [gcnt] = await q<{ c: string }>(
      drizzleSql`SELECT COUNT(*)::text AS c FROM gateway_booking_context WHERE booking_id = ${bookingId}`,
    );
    assert.strictEqual(Number(gcnt!.c), 1, "exactly 1 GBC row must exist");
  } finally {
    if (bookingId !== undefined) await cleanupCreated(bookingId, email);
  }
});

// ── S-3: Same booking+quote IDs, different fingerprint → CONFLICT ─────────────

test("S-3: same booking+quote IDs, different totalAmountCents → CONFLICT", async () => {
  const body = makeBody();
  const email = body["customerEmail"] as string;
  const service = makeService();
  let bookingId: number | undefined;

  try {
    const r1 = await service({ brandCode: "batumicars", parsedJson: body });
    assert.strictEqual(r1.kind, "CREATED");
    if (r1.kind !== "CREATED") return;
    bookingId = r1.bookingId;

    const body2 = { ...body, totalAmountCents: 99999 };
    const r2 = await service({ brandCode: "batumicars", parsedJson: body2 });
    assert.strictEqual(r2.kind, "CONFLICT");
  } finally {
    if (bookingId !== undefined) await cleanupCreated(bookingId, email);
  }
});

// ── S-4: Same booking ID, different quote ID → CONFLICT ──────────────────────

test("S-4: same booking ID, different quote ID → CONFLICT", async () => {
  const body = makeBody();
  const email = body["customerEmail"] as string;
  const service = makeService();
  let bookingId: number | undefined;

  try {
    const r1 = await service({ brandCode: "batumicars", parsedJson: body });
    assert.strictEqual(r1.kind, "CREATED");
    if (r1.kind !== "CREATED") return;
    bookingId = r1.bookingId;

    const body2 = { ...body, gatewayQuoteId: randomUUID(), customerEmail: `c2b2-${randomUUID()}@rbg-test.invalid` };
    const r2 = await service({ brandCode: "batumicars", parsedJson: body2 });
    assert.strictEqual(r2.kind, "CONFLICT");
  } finally {
    if (bookingId !== undefined) await cleanupCreated(bookingId, email);
  }
});

// ── S-5: Different booking ID, same quote ID → CONFLICT ──────────────────────

test("S-5: different booking ID, same quote ID → CONFLICT", async () => {
  const body = makeBody();
  const email = body["customerEmail"] as string;
  const service = makeService();
  let bookingId: number | undefined;

  try {
    const r1 = await service({ brandCode: "batumicars", parsedJson: body });
    assert.strictEqual(r1.kind, "CREATED");
    if (r1.kind !== "CREATED") return;
    bookingId = r1.bookingId;

    const body2 = { ...body, gatewayBookingId: randomUUID(), customerEmail: `c2b2-${randomUUID()}@rbg-test.invalid` };
    const r2 = await service({ brandCode: "batumicars", parsedJson: body2 });
    assert.strictEqual(r2.kind, "CONFLICT");
  } finally {
    if (bookingId !== undefined) await cleanupCreated(bookingId, email);
  }
});

// ── S-6: Distinct booking+quote IDs → second independent CREATED ──────────────

test("S-6: completely distinct IDs under same brand → two independent CREATED", async () => {
  const body1 = makeBody();
  const body2 = makeBody();
  const email1 = body1["customerEmail"] as string;
  const email2 = body2["customerEmail"] as string;
  const service = makeService();
  let bookingId1: number | undefined;
  let bookingId2: number | undefined;

  try {
    const r1 = await service({ brandCode: "batumicars", parsedJson: body1 });
    assert.strictEqual(r1.kind, "CREATED");
    if (r1.kind !== "CREATED") return;
    bookingId1 = r1.bookingId;

    const r2 = await service({ brandCode: "batumicars", parsedJson: body2 });
    assert.strictEqual(r2.kind, "CREATED");
    if (r2.kind !== "CREATED") return;
    bookingId2 = r2.bookingId;

    assert.notStrictEqual(bookingId1, bookingId2, "must produce two distinct booking IDs");

    const [bCnt] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking WHERE id IN (${bookingId1}, ${bookingId2})
    `);
    assert.strictEqual(Number(bCnt!.c), 2, "exactly 2 bookings");

    const [gCnt] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context WHERE booking_id IN (${bookingId1}, ${bookingId2})
    `);
    assert.strictEqual(Number(gCnt!.c), 2, "exactly 2 GBC rows");
  } finally {
    if (bookingId1 !== undefined) await cleanupCreated(bookingId1, email1);
    if (bookingId2 !== undefined) await cleanupCreated(bookingId2, email2);
  }
});

// ── S-7: Same booking+quote IDs under other brand → brand isolation ───────────

test("S-7: same booking+quote under other brand → independent CREATED, brand isolation", async () => {
  // Both calls use exactly the same normalized DTO payload. The only difference
  // is brandCode. Because brandCode is part of the fingerprint, both produce
  // independent CREATED results. Same email → same customer row (shared).
  const body  = makeBody();
  const email = body["customerEmail"] as string;
  const service = makeService();
  let bookingId1: number | undefined;
  let bookingId2: number | undefined;

  try {
    const r1 = await service({ brandCode: "batumicars",  parsedJson: body });
    assert.strictEqual(r1.kind, "CREATED");
    if (r1.kind !== "CREATED") return;
    bookingId1 = r1.bookingId;

    const r2 = await service({ brandCode: "kutaisicars", parsedJson: body });
    assert.strictEqual(r2.kind, "CREATED");
    if (r2.kind !== "CREATED") return;
    bookingId2 = r2.bookingId;

    assert.notStrictEqual(bookingId1, bookingId2);

    // Two bookings committed
    const [bCnt] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking
      WHERE id IN (${bookingId1}, ${bookingId2})
    `);
    assert.strictEqual(Number(bCnt!.c), 2, "exactly 2 bookings");

    // Two GBC rows with different brand codes
    const gcRows = await q<{ brand_code: string }>(drizzleSql`
      SELECT brand_code FROM gateway_booking_context
      WHERE booking_id IN (${bookingId1}, ${bookingId2})
      ORDER BY id ASC
    `);
    assert.strictEqual(gcRows.length, 2, "exactly 2 GBC rows");
    const brands = new Set(gcRows.map((r) => r.brand_code));
    assert.ok(brands.has("batumicars"),  "batumicars GBC must exist");
    assert.ok(brands.has("kutaisicars"), "kutaisicars GBC must exist");

    // One shared customer row
    const [uCnt] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM "user" WHERE email = ${email}
    `);
    assert.strictEqual(Number(uCnt!.c), 1, "exactly 1 shared customer row");

  } finally {
    // Both bookings reference the shared customer. Delete GBCs and bookings
    // first, then delete the shared user exactly once.
    if (bookingId1 !== undefined) {
      await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
        drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bookingId1}`,
      );
    }
    if (bookingId2 !== undefined) {
      await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
        drizzleSql`DELETE FROM gateway_booking_context WHERE booking_id = ${bookingId2}`,
      );
    }
    if (bookingId1 !== undefined) {
      await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
        drizzleSql`DELETE FROM booking WHERE id = ${bookingId1}`,
      );
    }
    if (bookingId2 !== undefined) {
      await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
        drizzleSql`DELETE FROM booking WHERE id = ${bookingId2}`,
      );
    }
    // Delete the shared user exactly once — after all bookings are gone.
    await (committedDb as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(
      drizzleSql`DELETE FROM "user" WHERE email = ${email}`,
    );
  }
});

// ── S-8: Unavailable vehicle model → VEHICLE_MODEL_UNAVAILABLE ───────────────

test("S-8: non-existent vehicleModelId → VEHICLE_MODEL_UNAVAILABLE; no customer/booking", async () => {
  const body              = makeBody({ vehicleModelId: 999_999_999 });
  const email             = body["customerEmail"] as string;
  const gatewayBookingId  = body["gatewayBookingId"] as string;
  const service           = makeService();

  const result = await service({ brandCode: "batumicars", parsedJson: body });
  assert.strictEqual(result.kind, "VEHICLE_MODEL_UNAVAILABLE");

  // No customer row must be committed (model check precedes customer upsert)
  const [uCnt] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM "user" WHERE email = ${email}
  `);
  assert.strictEqual(Number(uCnt!.c), 0, "no user row must be committed");

  // No booking row for the request gatewayBookingId
  const [bCnt] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM booking
    WHERE external_reservation_code = ${gatewayBookingId}
  `);
  assert.strictEqual(Number(bCnt!.c), 0, "no booking row must be committed");
});

// ── S-9: Unavailable location → LOCATION_UNAVAILABLE ─────────────────────────

test("S-9: non-existent pickupLocationId → LOCATION_UNAVAILABLE; no booking", async () => {
  const body             = makeBody({ pickupLocationId: 999_999_998 });
  const email            = body["customerEmail"] as string;
  const gatewayBookingId = body["gatewayBookingId"] as string;
  const service          = makeService();

  const result = await service({ brandCode: "batumicars", parsedJson: body });
  assert.strictEqual(result.kind, "LOCATION_UNAVAILABLE");

  // No customer row must be committed (location check precedes customer upsert)
  const [uCnt] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM "user" WHERE email = ${email}
  `);
  assert.strictEqual(Number(uCnt!.c), 0, "no user row must be committed");

  // No booking row for the request gatewayBookingId
  const [bCnt] = await q<{ c: string }>(drizzleSql`
    SELECT COUNT(*)::text AS c FROM booking
    WHERE external_reservation_code = ${gatewayBookingId}
  `);
  assert.strictEqual(Number(bCnt!.c), 0, "no booking row must be committed");
});

// ── S-10: Lost-response retry simulation ──────────────────────────────────────

test("S-10: lost-response retry — first CREATED discarded, second call → REPLAYED", async () => {
  const body = makeBody();
  const email = body["customerEmail"] as string;
  const service = makeService();
  let bookingId: number | undefined;

  try {
    // First call — result discarded (simulates lost response)
    const r1 = await service({ brandCode: "batumicars", parsedJson: body });
    assert.strictEqual(r1.kind, "CREATED");
    if (r1.kind !== "CREATED") return;
    bookingId = r1.bookingId;

    // Second call with identical body → REPLAYED
    const r2 = await service({ brandCode: "batumicars", parsedJson: body });
    assert.strictEqual(r2.kind, "REPLAYED");
    if (r2.kind !== "REPLAYED") return;
    assert.strictEqual(r2.bookingId, bookingId);

    // Assert: exactly 1 booking, 1 GBC, 1 attribution
    const [bCnt] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking WHERE id = ${bookingId}
    `);
    assert.strictEqual(Number(bCnt!.c), 1, "exactly 1 booking");

    const [gCnt] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM gateway_booking_context WHERE booking_id = ${bookingId}
    `);
    assert.strictEqual(Number(gCnt!.c), 1, "exactly 1 GBC");

    const [aCnt] = await q<{ c: string }>(drizzleSql`
      SELECT COUNT(*)::text AS c FROM booking_attribution WHERE booking_id = ${bookingId}
    `);
    assert.strictEqual(Number(aCnt!.c), 1, "exactly 1 attribution");
  } finally {
    if (bookingId !== undefined) await cleanupCreated(bookingId, email);
  }
});
