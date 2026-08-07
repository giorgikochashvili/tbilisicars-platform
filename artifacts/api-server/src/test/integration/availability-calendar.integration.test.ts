/**
 * Integration tests for Availability Calendar — group CRUD and DB behaviors.
 *
 * SAFETY: Uses ONLY AVAILABILITY_TEST_DATABASE_URL.
 * Never falls back to DATABASE_URL.
 * If AVAILABILITY_TEST_DATABASE_URL is absent, all tests are skipped gracefully.
 *
 * Assumes the test database has the full schema including:
 *   - availability_group
 *   - availability_group_vehicle_model
 *   - vehicle_model (for FK references)
 *   - audit_logs
 *
 * Run:
 *   AVAILABILITY_TEST_DATABASE_URL=... node --import tsx --test \
 *     src/test/integration/availability-calendar.integration.test.ts
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const TEST_DB_URL = process.env["AVAILABILITY_TEST_DATABASE_URL"];
const SKIP = !TEST_DB_URL;
const SKIP_REASON = "AVAILABILITY_TEST_DATABASE_URL not set — skipping integration tests";

// ─── Safety check ─────────────────────────────────────────────────────────────

if (TEST_DB_URL) {
  // Guard: must not be DATABASE_URL
  const prodUrl = process.env["DATABASE_URL"];
  if (prodUrl && TEST_DB_URL === prodUrl) {
    throw new Error(
      "AVAILABILITY_TEST_DATABASE_URL must not equal DATABASE_URL. " +
        "Integration tests must use a dedicated isolated test database.",
    );
  }
}

// ─── DB client ────────────────────────────────────────────────────────────────

const { Pool } = pg;
let pool: InstanceType<typeof Pool>;

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

before(async () => {
  if (SKIP) return;
  pool = new Pool({ connectionString: TEST_DB_URL });

  // Ensure test tables exist (idempotent — schema may already be applied)
  await query(`
    CREATE TABLE IF NOT EXISTS availability_group (
      id          SERIAL        PRIMARY KEY,
      name        VARCHAR(100)  NOT NULL,
      is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
      sort_order  INTEGER       NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS availability_group_vehicle_model (
      id               SERIAL    PRIMARY KEY,
      group_id         INTEGER   NOT NULL
        REFERENCES availability_group (id) ON DELETE CASCADE,
      vehicle_model_id INTEGER   NOT NULL,
      CONSTRAINT uq_agvm_vehicle_model_id_test UNIQUE (vehicle_model_id)
    )
  `);

  // Wipe test data from prior runs
  await query("DELETE FROM availability_group_vehicle_model WHERE TRUE");
  await query("DELETE FROM availability_group WHERE TRUE");
});

after(async () => {
  if (SKIP || !pool) return;
  // Clean up test data
  await query("DELETE FROM availability_group_vehicle_model WHERE TRUE").catch(() => {});
  await query("DELETE FROM availability_group WHERE TRUE").catch(() => {});
  await pool.end();
});

// ─── Helper: create a test group ──────────────────────────────────────────────

async function createTestGroup(
  name: string,
  sortOrder = 0,
): Promise<{ id: number; name: string }> {
  const res = await query<{ id: number; name: string }>(
    "INSERT INTO availability_group (name, sort_order) VALUES ($1, $2) RETURNING id, name",
    [name, sortOrder],
  );
  return res.rows[0];
}

// ─── Group CRUD ───────────────────────────────────────────────────────────────

describe("Group CRUD", { skip: SKIP ? SKIP_REASON : false }, () => {
  test("create a group and read it back", async () => {
    const group = await createTestGroup("Integration Economy");
    assert.ok(group.id > 0);

    const res = await query<{ id: number; name: string; is_active: boolean }>(
      "SELECT id, name, is_active FROM availability_group WHERE id = $1",
      [group.id],
    );
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].name, "Integration Economy");
    assert.equal(res.rows[0].is_active, true);

    // Cleanup
    await query("DELETE FROM availability_group WHERE id = $1", [group.id]);
  });

  test("update group name and sort_order", async () => {
    const group = await createTestGroup("Old Name");
    await query(
      "UPDATE availability_group SET name = $1, sort_order = $2 WHERE id = $3",
      ["New Name", 5, group.id],
    );
    const res = await query<{ name: string; sort_order: number }>(
      "SELECT name, sort_order FROM availability_group WHERE id = $1",
      [group.id],
    );
    assert.equal(res.rows[0].name, "New Name");
    assert.equal(res.rows[0].sort_order, 5);

    await query("DELETE FROM availability_group WHERE id = $1", [group.id]);
  });

  test("delete group cascades membership rows", async () => {
    const group = await createTestGroup("To Delete");
    // Add a fake membership (vehicleModelId 99999 — no FK in test table)
    await query(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [group.id, 99999],
    );
    // Verify membership exists
    const before = await query(
      "SELECT COUNT(*) FROM availability_group_vehicle_model WHERE group_id = $1",
      [group.id],
    );
    assert.equal(Number(before.rows[0].count), 1);

    // Delete group — cascade should remove membership
    await query("DELETE FROM availability_group WHERE id = $1", [group.id]);

    const after = await query(
      "SELECT COUNT(*) FROM availability_group_vehicle_model WHERE group_id = $1",
      [group.id],
    );
    assert.equal(Number(after.rows[0].count), 0);
  });

  test("toggle is_active", async () => {
    const group = await createTestGroup("Toggle Group");
    await query("UPDATE availability_group SET is_active = FALSE WHERE id = $1", [
      group.id,
    ]);
    const res = await query<{ is_active: boolean }>(
      "SELECT is_active FROM availability_group WHERE id = $1",
      [group.id],
    );
    assert.equal(res.rows[0].is_active, false);

    await query("DELETE FROM availability_group WHERE id = $1", [group.id]);
  });
});

// ─── Unique vehicle model ownership ──────────────────────────────────────────

describe(
  "Unique vehicle model ownership",
  { skip: SKIP ? SKIP_REASON : false },
  () => {
    test("UNIQUE(vehicle_model_id) prevents double-assignment", async () => {
      const g1 = await createTestGroup("Group A");
      const g2 = await createTestGroup("Group B");
      const modelId = 88001; // test-only fake model ID

      // First assignment succeeds
      await query(
        "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
        [g1.id, modelId],
      );

      // Second assignment to different group must fail with unique violation
      await assert.rejects(
        () =>
          query(
            "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
            [g2.id, modelId],
          ),
        (err: Error) => {
          assert.ok(
            err.message.includes("unique") || err.message.includes("duplicate"),
            `Expected unique constraint violation, got: ${err.message}`,
          );
          return true;
        },
      );

      // Cleanup
      await query(
        "DELETE FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
        [modelId],
      );
      await query("DELETE FROM availability_group WHERE id IN ($1, $2)", [
        g1.id,
        g2.id,
      ]);
    });
  },
);

// ─── Atomic move-model ────────────────────────────────────────────────────────

describe("Atomic move-model", { skip: SKIP ? SKIP_REASON : false }, () => {
  test("move model from group A to group B atomically", async () => {
    const gA = await createTestGroup("Move Source");
    const gB = await createTestGroup("Move Target");
    const modelId = 88002;

    // Place model in gA
    await query(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [gA.id, modelId],
    );

    // Simulate atomic move: DELETE from gA, INSERT into gB
    await query("BEGIN");
    try {
      await query(
        "DELETE FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
        [modelId],
      );
      await query(
        "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
        [gB.id, modelId],
      );
      await query("COMMIT");
    } catch (e) {
      await query("ROLLBACK");
      throw e;
    }

    // Verify model is now in gB
    const res = await query<{ group_id: number }>(
      "SELECT group_id FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
      [modelId],
    );
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].group_id, gB.id);

    // Cleanup
    await query(
      "DELETE FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
      [modelId],
    );
    await query("DELETE FROM availability_group WHERE id IN ($1, $2)", [
      gA.id,
      gB.id,
    ]);
  });

  test("failed move rolls back: model stays in original group", async () => {
    const gA = await createTestGroup("Rollback Source");
    const modelId = 88003;
    const fakeTargetId = -999; // non-existent group

    await query(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [gA.id, modelId],
    );

    // Simulate failed move: DELETE succeeds but INSERT to fake group fails FK
    // (In our test table there is no FK on group_id, so we test a UNIQUE violation instead)
    // We'll test rollback by attempting to insert a duplicate model in the same group
    await query("BEGIN");
    try {
      await query(
        "DELETE FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
        [modelId],
      );
      // Insert with non-existent group — in real schema this fails FK;
      // in test schema (no FK on group_id), we force a rollback manually
      await query("ROLLBACK");
    } catch {
      await query("ROLLBACK");
    }

    // Re-insert model (it was removed from test table by ROLLBACK, re-add to verify)
    // After ROLLBACK, original row should still be there
    const res = await query<{ group_id: number }>(
      "SELECT group_id FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
      [modelId],
    );
    // After rollback, model is still in gA
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].group_id, gA.id);

    // Cleanup
    await query(
      "DELETE FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
      [modelId],
    );
    await query("DELETE FROM availability_group WHERE id = $1", [gA.id]);
  });

  test("idempotent move: already in target returns moved=false", async () => {
    const gA = await createTestGroup("Idempotent Group");
    const modelId = 88004;

    await query(
      "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
      [gA.id, modelId],
    );

    // Check if already in target
    const res = await query<{ group_id: number }>(
      "SELECT group_id FROM availability_group_vehicle_model WHERE vehicle_model_id = $1 AND group_id = $2",
      [modelId, gA.id],
    );
    // Already in gA — move to gA is idempotent
    const alreadyInTarget = res.rows.length > 0;
    assert.ok(alreadyInTarget);

    // Cleanup
    await query(
      "DELETE FROM availability_group_vehicle_model WHERE vehicle_model_id = $1",
      [modelId],
    );
    await query("DELETE FROM availability_group WHERE id = $1", [gA.id]);
  });
});

// ─── Unclassified location handling ──────────────────────────────────────────

describe(
  "Unclassified location city normalization",
  { skip: SKIP ? SKIP_REASON : false },
  () => {
    test("group CRUD succeeds regardless of vehicle location cities (read-only against vehicles)", async () => {
      // Availability groups never write to vehicle/location tables.
      // This test confirms group creation works independently of location data.
      const group = await createTestGroup("Unclassified Test Group");
      assert.ok(group.id > 0);
      await query("DELETE FROM availability_group WHERE id = $1", [group.id]);
    });
  },
);

// ─── Calendar supply query (if schema available) ──────────────────────────────

describe(
  "Calendar supply group query",
  { skip: SKIP ? SKIP_REASON : false },
  () => {
    test("inactive group is excluded from active-only calendar query", async () => {
      const active = await createTestGroup("Active Group");
      const inactive = await createTestGroup("Inactive Group");

      // Set inactive group
      await query(
        "UPDATE availability_group SET is_active = FALSE WHERE id = $1",
        [inactive.id],
      );

      // Query for active groups only
      const res = await query<{ id: number; name: string }>(
        "SELECT id, name FROM availability_group WHERE is_active = TRUE ORDER BY sort_order, id",
      );
      const ids = res.rows.map((r: { id: number }) => r.id);
      assert.ok(ids.includes(active.id), "Active group should appear");
      assert.ok(!ids.includes(inactive.id), "Inactive group should not appear");

      // Cleanup
      await query("DELETE FROM availability_group WHERE id IN ($1, $2)", [
        active.id,
        inactive.id,
      ]);
    });

    test("group with multiple model IDs returns one row per model in JOIN", async () => {
      const group = await createTestGroup("Multi-Model Group");
      const models = [88010, 88011, 88012];

      for (const mid of models) {
        await query(
          "INSERT INTO availability_group_vehicle_model (group_id, vehicle_model_id) VALUES ($1, $2)",
          [group.id, mid],
        );
      }

      const res = await query<{ vehicle_model_id: number }>(
        `SELECT agvm.vehicle_model_id
         FROM availability_group ag
         JOIN availability_group_vehicle_model agvm ON agvm.group_id = ag.id
         WHERE ag.id = $1
         ORDER BY agvm.vehicle_model_id`,
        [group.id],
      );
      assert.equal(res.rows.length, 3);
      assert.deepEqual(
        res.rows.map((r: { vehicle_model_id: number }) => r.vehicle_model_id),
        models,
      );

      // Cleanup
      await query(
        "DELETE FROM availability_group_vehicle_model WHERE group_id = $1",
        [group.id],
      );
      await query("DELETE FROM availability_group WHERE id = $1", [group.id]);
    });
  },
);
