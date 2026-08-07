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
