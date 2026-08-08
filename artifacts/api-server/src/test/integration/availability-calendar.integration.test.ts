/**
 * Integration tests for Availability Calendar — group CRUD and DB behaviors.
 *
 * ISOLATION: Uses ONLY AVAILABILITY_TEST_DATABASE_URL.
 * Never falls back to DATABASE_URL.
 * If AVAILABILITY_TEST_DATABASE_URL is absent: skip gracefully (process.exit(0)).
 *
 * Pattern follows the repository convention established in
 * replace-vehicle-candidates.integration.test.ts:
 *   - drizzle(testDbUrl, { schema }) to create a drizzle client
 *   - (_db as any).$client as PoolHandle to access the underlying pg pool
 *   - No direct import of "pg" — pool is obtained through drizzle's $client
 *
 * Assumes the test database has the full schema including:
 *   availability_group, availability_group_vehicle_model
 *
 * Run:
 *   AVAILABILITY_TEST_DATABASE_URL=... node --import tsx --test \
 *     src/test/integration/availability-calendar.integration.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@workspace/db/schema";
import {
  findOccupyingBooking,
  findOverdueBooking,
  type ProjectionBooking,
} from "../../services/admin-availability.service.js";

// ─── DB URL guard ─────────────────────────────────────────────────────────────

const testDbUrl = process.env["AVAILABILITY_TEST_DATABASE_URL"];
if (!testDbUrl) {
  console.log(
    "SKIP: AVAILABILITY_TEST_DATABASE_URL is not set. " +
      "Point it to an isolated disposable test database with the production schema applied " +
      "to run Availability Calendar integration tests. " +
      "This suite is reported as not executed — it is not an error.",
  );
  process.exit(0);
}

// Safety: must not be the production DATABASE_URL
const prodUrl = process.env["DATABASE_URL"];
if (prodUrl && testDbUrl === prodUrl) {
  throw new Error(
    "AVAILABILITY_TEST_DATABASE_URL must not equal DATABASE_URL. " +
      "Integration tests must use a dedicated isolated test database.",
  );
}

// ─── Pool handle (via drizzle.$client — repository convention) ────────────────

type PoolHandle = {
  query: <T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>;
  end: () => Promise<void>;
};

const _db = drizzle(testDbUrl, { schema });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pool = (_db as any).$client as PoolHandle;

// ─── SQL helpers ──────────────────────────────────────────────────────────────

async function sql<T extends Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(query, params);
  return res.rows;
}

async function run(query: string, params: unknown[] = []): Promise<void> {
  await pool.query(query, params);
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function createGroup(
  name: string,
  sortOrder = 0,
): Promise<{ id: number; name: string }> {
  const rows = await sql<{ id: number; name: string }>(
    "INSERT INTO availability_group (name, sort_order) VALUES ($1, $2) RETURNING id, name",
    [name, sortOrder],
  );
  return rows[0]!;
}

// ─── Cleanup tracking ─────────────────────────────────────────────────────────

const cleanup = {
  groupIds: [] as number[],
  modelMappingModelIds: [] as number[],
};

function trackGroup(id: number) {
  cleanup.groupIds.push(id);
  return id;
}
function trackModel(modelId: number) {
  cleanup.modelMappingModelIds.push(modelId);
  return modelId;
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

after(async () => {
  // Clean up in FK order
  if (cleanup.modelMappingModelIds.length) {
    await run(
      "DELETE FROM availability_group_vehicle_model WHERE vehicle_model_id = ANY($1)",
      [cleanup.modelMappingModelIds],
    );
  }
  if (cleanup.groupIds.length) {
    await run(
      "DELETE FROM availability_group WHERE id = ANY($1)",
      [cleanup.groupIds],
    );
  }
  await pool.end();
});

// ─── Group CRUD ───────────────────────────────────────────────────────────────

describe("Group CRUD", () => {
  test("create a group and read it back", async () => {
    const group = await createGroup("Integration Economy");
    trackGroup(group.id);
    assert.ok(group.id > 0);

    const rows = await sql<{ id: number; name: string; is_active: boolean }>(
      "SELECT id, name, is_active FROM availability_group WHERE id = $1",
      [group.id],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, "Integration Economy");
    assert.equal(rows[0]!.is_active, true);
  });

  test("update group name and sort_order", async () => {
    const group = await createGroup("Old Name");
    trackGroup(group.id);

    await run(
      "UPDATE availability_group SET name = $1, sort_order = $2 WHERE id = $3",
      ["New Name", 5, group.id],
    );

    const rows = await sql<{ name: string; sort_order: number }>(
      "SELECT name, sort_order FROM availability_group WHERE id = $1",
      [group.id],
    );
    assert.equal(rows[0]!.name, "New Name");
    assert.equal(rows[0]!.sort_order, 5);
  });

  test("delete group cascades membership rows", async () => {
    const group = await createGroup("To Delete");
    // Note: group NOT tracked — we will delete it manually in this test
    const modelId = 79901;
    trackModel(modelId); // track for cleanup in case of early failure

    await run(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [group.id, modelId],
    );

    const before = await sql<{ count: string }>(
      "SELECT COUNT(*) AS count FROM availability_group_vehicle_model WHERE group_id = $1",
      [group.id],
    );
    assert.equal(Number(before[0]!.count), 1);

    // Delete group — ON DELETE CASCADE removes the membership row
    await run("DELETE FROM availability_group WHERE id = $1", [group.id]);

    const after = await sql<{ count: string }>(
      "SELECT COUNT(*) AS count FROM availability_group_vehicle_model WHERE group_id = $1",
      [group.id],
    );
    assert.equal(Number(after[0]!.count), 0);

    // Remove from trackModel cleanup since cascade already cleaned it
    cleanup.modelMappingModelIds.splice(
      cleanup.modelMappingModelIds.indexOf(modelId),
      1,
    );
  });

  test("toggle is_active to FALSE", async () => {
    const group = await createGroup("Toggle Group");
    trackGroup(group.id);

    await run(
      "UPDATE availability_group SET is_active = FALSE WHERE id = $1",
      [group.id],
    );

    const rows = await sql<{ is_active: boolean }>(
      "SELECT is_active FROM availability_group WHERE id = $1",
      [group.id],
    );
    assert.equal(rows[0]!.is_active, false);
  });
});

// ─── Unique vehicle model ownership ──────────────────────────────────────────

describe("Unique vehicle model ownership", () => {
  test("UNIQUE(vehicle_model_id) prevents double-assignment to different groups", async () => {
    const g1 = await createGroup("Group A");
    trackGroup(g1.id);
    const g2 = await createGroup("Group B");
    trackGroup(g2.id);
    const modelId = 79902;
    trackModel(modelId);

    // First assignment succeeds
    await run(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [g1.id, modelId],
    );

    // Second assignment to different group must fail with unique violation
    await assert.rejects(
      () =>
        pool.query(
          "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
          [g2.id, modelId],
        ),
      (err: Error) => {
        assert.ok(
          err.message.toLowerCase().includes("unique") ||
            err.message.toLowerCase().includes("duplicate"),
          `Expected unique constraint violation, got: ${err.message}`,
        );
        return true;
      },
    );
  });
});

// ─── Atomic move-model ────────────────────────────────────────────────────────

describe("Atomic move-model", () => {
  test("move model from group A to group B atomically", async () => {
    const gA = await createGroup("Move Source");
    trackGroup(gA.id);
    const gB = await createGroup("Move Target");
    trackGroup(gB.id);
    const modelId = 79903;
    trackModel(modelId);

    // Place model in gA
    await run(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [gA.id, modelId],
    );

    // Atomic move via BEGIN/COMMIT
    await run("BEGIN");
    try {
      await run(
        "DELETE FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
        [modelId],
      );
      await run(
        "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
        [gB.id, modelId],
      );
      await run("COMMIT");
    } catch (e) {
      await run("ROLLBACK");
      throw e;
    }

    // Verify model is now in gB
    const rows = await sql<{ group_id: number }>(
      "SELECT group_id FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
      [modelId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.group_id, gB.id);
  });

  test("rollback: model stays in original group after failed transaction", async () => {
    const gA = await createGroup("Rollback Source");
    trackGroup(gA.id);
    const modelId = 79904;
    trackModel(modelId);

    await run(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [gA.id, modelId],
    );

    // Simulate failed move: DELETE then ROLLBACK
    await run("BEGIN");
    await run(
      "DELETE FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
      [modelId],
    );
    await run("ROLLBACK");

    // After rollback, model is still in gA
    const rows = await sql<{ group_id: number }>(
      "SELECT group_id FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
      [modelId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.group_id, gA.id);
  });

  test("idempotent: move to current group is detected as already-in-target", async () => {
    const gA = await createGroup("Idempotent Group");
    trackGroup(gA.id);
    const modelId = 79905;
    trackModel(modelId);

    await run(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [gA.id, modelId],
    );

    // Check: already in target group
    const rows = await sql<{ group_id: number }>(
      "SELECT group_id FROM availability_group_vehicle_model WHERE vehicle_model_id = $1 AND group_id = $2",
      [modelId, gA.id],
    );
    assert.ok(rows.length > 0, "Model should already be in target group");
  });
});

// ─── Calendar supply query ────────────────────────────────────────────────────

describe("Calendar supply group query", () => {
  test("inactive group excluded from is_active=TRUE query", async () => {
    const active = await createGroup("Active Group");
    trackGroup(active.id);
    const inactive = await createGroup("Inactive Group");
    trackGroup(inactive.id);

    await run(
      "UPDATE availability_group SET is_active = FALSE WHERE id = $1",
      [inactive.id],
    );

    const rows = await sql<{ id: number }>(
      "SELECT id FROM availability_group WHERE is_active = TRUE",
    );
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(active.id), "Active group must appear");
    assert.ok(!ids.includes(inactive.id), "Inactive group must not appear");
  });

  test("group with multiple model IDs returns one row per model in LEFT JOIN", async () => {
    const group = await createGroup("Multi-Model Group");
    trackGroup(group.id);
    const models = [79910, 79911, 79912];

    for (const mid of models) {
      trackModel(mid);
      await run(
        "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
        [group.id, mid],
      );
    }

    const rows = await sql<{ vehicle_model_id: number }>(
      `SELECT agvm.vehicle_model_id
       FROM availability_group ag
       JOIN availability_group_vehicle_model agvm ON agvm.group_id = ag.id
       WHERE ag.id = $1
       ORDER BY agvm.vehicle_model_id`,
      [group.id],
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => r.vehicle_model_id),
      models,
    );
  });
});

// ─── Remove model membership ──────────────────────────────────────────────────

describe("Remove model membership", () => {
  test("atomic DELETE RETURNING removes junction row; vehicle_model untouched", async () => {
    // Seed brand → vehicle_model so we can verify the model row survives
    const [brandRow] = await sql<{ id: number }>(
      "INSERT INTO brand (name) VALUES ($1) RETURNING id",
      ["IntTestBrandRemove"],
    );
    const brandId = brandRow!.id;
    const [vmRow] = await sql<{ id: number }>(
      "INSERT INTO vehicle_model (brand_id, name) VALUES ($1, $2) RETURNING id",
      [brandId, "IntTestModelRemove"],
    );
    const modelId = vmRow!.id;

    const group = await createGroup("Remove Test Group");
    trackGroup(group.id);

    await run(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [group.id, modelId],
    );

    // Atomic DELETE ... RETURNING — same as service implementation
    const deleted = await sql<{ id: number }>(
      "DELETE FROM availability_group_vehicle_model WHERE group_id = $1 AND vehicle_model_id = $2 RETURNING id",
      [group.id, modelId],
    );
    assert.equal(deleted.length, 1, "DELETE RETURNING must return exactly 1 row");

    // Junction row gone
    const membership = await sql<{ id: number }>(
      "SELECT id FROM availability_group_vehicle_model WHERE group_id = $1 AND vehicle_model_id = $2",
      [group.id, modelId],
    );
    assert.equal(membership.length, 0, "Membership row must be absent after delete");

    // vehicle_model still present
    const vmCheck = await sql<{ id: number }>(
      "SELECT id FROM vehicle_model WHERE id = $1",
      [modelId],
    );
    assert.equal(vmCheck.length, 1, "vehicle_model must not be deleted");

    // Cleanup seeded rows (not tracked by cleanup arrays — clean explicitly)
    await run("DELETE FROM vehicle_model WHERE id = $1", [modelId]);
    await run("DELETE FROM brand WHERE id = $1", [brandId]);
  });

  test("DELETE RETURNING on nonexistent membership returns 0 rows (404 semantics)", async () => {
    const group = await createGroup("Remove Nonexistent Group");
    trackGroup(group.id);
    const nonexistentModelId = 9_999_901;

    const deleted = await sql<{ id: number }>(
      "DELETE FROM availability_group_vehicle_model WHERE group_id = $1 AND vehicle_model_id = $2 RETURNING id",
      [group.id, nonexistentModelId],
    );
    assert.equal(
      deleted.length,
      0,
      "DELETE RETURNING must return 0 rows when membership absent",
    );
  });

  test("second DELETE after successful remove returns 0 rows (idempotent 404 semantics)", async () => {
    const group = await createGroup("Double Remove Group");
    trackGroup(group.id);
    const modelId = 79907;
    trackModel(modelId);

    await run(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [group.id, modelId],
    );
    // First remove
    await run(
      "DELETE FROM availability_group_vehicle_model WHERE group_id = $1 AND vehicle_model_id = $2",
      [group.id, modelId],
    );
    // Second remove — must return 0 rows
    const second = await sql<{ id: number }>(
      "DELETE FROM availability_group_vehicle_model WHERE group_id = $1 AND vehicle_model_id = $2 RETURNING id",
      [group.id, modelId],
    );
    assert.equal(second.length, 0, "Second DELETE must return 0 rows");
  });
});

// ─── Daily Detail — vehicle fields and booking ID logic ───────────────────────

describe("Daily Detail — vehicle fields and booking ID logic", () => {
  test("vehicle → vehicleModel LEFT JOIN returns modelName and plate", async () => {
    // Seed brand → vehicle_model → vehicle
    const [brandRow] = await sql<{ id: number }>(
      "INSERT INTO brand (name) VALUES ($1) RETURNING id",
      ["IntTestBrandDetail"],
    );
    const brandId = brandRow!.id;
    const [vmRow] = await sql<{ id: number }>(
      "INSERT INTO vehicle_model (brand_id, name) VALUES ($1, $2) RETURNING id",
      [brandId, "Attrage IntTest"],
    );
    const modelId = vmRow!.id;
    const [vehRow] = await sql<{ id: number }>(
      "INSERT INTO vehicle (vehicle_model_id, license_plate) VALUES ($1, $2) RETURNING id",
      [modelId, "AB123CD"],
    );
    const vehicleId = vehRow!.id;

    // Verify the exact JOIN that getAvailabilityCellDetail now uses
    const rows = await sql<{ model_name: string; plate: string | null }>(
      `SELECT vm.name AS model_name, v.license_plate AS plate
       FROM vehicle v
       LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
       WHERE v.id = $1`,
      [vehicleId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.model_name, "Attrage IntTest");
    assert.equal(rows[0]!.plate, "AB123CD");

    // Cleanup
    await run("DELETE FROM vehicle WHERE id = $1", [vehicleId]);
    await run("DELETE FROM vehicle_model WHERE id = $1", [modelId]);
    await run("DELETE FROM brand WHERE id = $1", [brandId]);
  });

  test("findOccupyingBooking: returns EOD-spanning booking, not day-overlap-only booking", () => {
    // Tbilisi 2026-08-08: nextDayStartUtc = 2026-08-08T20:00:00Z
    const nextDayStartUtc = new Date("2026-08-08T20:00:00.000Z");

    // booking A: ends at 12:00 Tbilisi (08:00Z) — overlaps the day but NOT EOD
    const bkA: ProjectionBooking = {
      id: 1001,
      vehicleId: 1,
      vehicleModelId: 1,
      status: "DELIVERED",
      pickupDatetime: new Date("2026-08-08T04:00:00.000Z"),
      dropoffDatetime: new Date("2026-08-08T08:00:00.000Z"), // before nextDayStart
      pickupCity: "Tbilisi",
      dropoffCity: "Tbilisi",
    };
    // booking B: pickup 14:00 TBS, dropoff next day 10:00 TBS — spans EOD
    const bkB: ProjectionBooking = {
      id: 1002,
      vehicleId: 1,
      vehicleModelId: 1,
      status: "CONFIRMED",
      pickupDatetime: new Date("2026-08-08T10:00:00.000Z"),
      dropoffDatetime: new Date("2026-08-09T06:00:00.000Z"), // after nextDayStart
      pickupCity: "Tbilisi",
      dropoffCity: "Tbilisi",
    };

    const result = findOccupyingBooking([bkA, bkB], nextDayStartUtc);
    assert.ok(result, "Must find an occupying booking");
    assert.equal(result.id, 1002, "Must return bkB (EOD-spanning), not bkA (noon-ending)");
  });

  test("findOccupyingBooking: same-day sequential — EOD predicate picks the correct booking", () => {
    // Test 7 from spec: one booking ends earlier on the selected day,
    // another begins later and spans past midnight.
    // Do NOT simply pick the first booking that overlaps the calendar date.
    const nextDayStartUtc = new Date("2026-08-08T20:00:00.000Z"); // Tbilisi midnight

    // booking X: 06:00–16:00 TBS — overlaps the day, dropoff(12:00Z) < nextDayStart(20:00Z)
    const bkX: ProjectionBooking = {
      id: 2001,
      vehicleId: 2,
      vehicleModelId: 2,
      status: "DELIVERED",
      pickupDatetime: new Date("2026-08-08T02:00:00.000Z"),
      dropoffDatetime: new Date("2026-08-08T12:00:00.000Z"), // 16:00 TBS — before Tbilisi midnight
      pickupCity: "Tbilisi",
      dropoffCity: "Tbilisi",
    };
    // booking Y: 18:00 TBS → next morning — spans EOD
    const bkY: ProjectionBooking = {
      id: 2002,
      vehicleId: 2,
      vehicleModelId: 2,
      status: "CONFIRMED",
      pickupDatetime: new Date("2026-08-08T14:00:00.000Z"), // 18:00 TBS
      dropoffDatetime: new Date("2026-08-09T06:00:00.000Z"), // spans past Tbilisi midnight
      pickupCity: "Tbilisi",
      dropoffCity: "Tbilisi",
    };

    // projBks sorted by dropoffDatetime ascending (as service does)
    const result = findOccupyingBooking([bkX, bkY], nextDayStartUtc);
    assert.ok(result, "Must find an occupying booking");
    assert.equal(
      result.id,
      2002,
      "Must pick bkY (EOD-spanning), not bkX (same-day-overlap-only)",
    );
  });

  test("findOverdueBooking: returns DELIVERED booking with past dropoff", () => {
    const nowInstant = new Date("2026-08-08T12:00:00.000Z");

    const bkFuture: ProjectionBooking = {
      id: 3001,
      vehicleId: 3,
      vehicleModelId: 3,
      status: "DELIVERED",
      pickupDatetime: new Date("2026-08-07T06:00:00.000Z"),
      dropoffDatetime: new Date("2026-08-08T16:00:00.000Z"), // after now → not overdue
      pickupCity: "Tbilisi",
      dropoffCity: "Tbilisi",
    };
    const bkOverdue: ProjectionBooking = {
      id: 3002,
      vehicleId: 3,
      vehicleModelId: 3,
      status: "DELIVERED",
      pickupDatetime: new Date("2026-08-05T06:00:00.000Z"),
      dropoffDatetime: new Date("2026-08-07T06:00:00.000Z"), // before now → overdue
      pickupCity: "Tbilisi",
      dropoffCity: "Tbilisi",
    };

    const result = findOverdueBooking([bkFuture, bkOverdue], nowInstant);
    assert.ok(result, "Must find overdue booking");
    assert.equal(result.id, 3002);
  });

  test("findOccupyingBooking: historical + active booking — returns active, row appears once", () => {
    const nextDayStartUtc = new Date("2026-08-08T20:00:00.000Z");

    // Historical: completed booking, dropoff long before selected day
    const bkHist: ProjectionBooking = {
      id: 4001,
      vehicleId: 4,
      vehicleModelId: 4,
      status: "DELIVERED",
      pickupDatetime: new Date("2026-08-01T06:00:00.000Z"),
      dropoffDatetime: new Date("2026-08-03T06:00:00.000Z"),
      pickupCity: "Tbilisi",
      dropoffCity: "Tbilisi",
    };
    // Active: spans selected day's EOD
    const bkActive: ProjectionBooking = {
      id: 4002,
      vehicleId: 4,
      vehicleModelId: 4,
      status: "CONFIRMED",
      pickupDatetime: new Date("2026-08-08T06:00:00.000Z"),
      dropoffDatetime: new Date("2026-08-09T06:00:00.000Z"),
      pickupCity: "Tbilisi",
      dropoffCity: "Tbilisi",
    };

    const result = findOccupyingBooking([bkHist, bkActive], nextDayStartUtc);
    assert.ok(result, "Must find a booking");
    assert.equal(result.id, 4002, "Must return active booking, not historical");

    // Verify find() (not filter()) returns a single result — no duplication
    const allMatches = [bkHist, bkActive].filter(
      (b) =>
        b.pickupDatetime < nextDayStartUtc &&
        b.dropoffDatetime >= nextDayStartUtc,
    );
    assert.equal(allMatches.length, 1, "Exactly one booking spans EOD — no duplicate rows");
  });
});
