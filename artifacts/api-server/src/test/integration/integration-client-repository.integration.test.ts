/**
 * integration-client-repository.integration.test.ts
 *
 * C3a PostgreSQL integration tests — enabled-client resolver (3 tests, ICI-1 to ICI-3).
 *
 * Connects only to RBG_TEST_DATABASE_URL. Exits process.exit(1) if absent.
 * Never falls back to DATABASE_URL.
 * Never imports the live @workspace/db db or pool singleton.
 *
 * Each test:
 *   - generates a collision-safe key_id using randomUUID()
 *   - inserts a row in setup (ICI-1, ICI-2) or uses no row (ICI-3)
 *   - deletes its own rows in finally
 *
 * DB POOL:
 *   Created from testDbUrl via drizzle(). Closed in after() via $client.end().
 *
 * RUN AFTER:
 *   scripts/verify-c2b2.sh (which resets the disposable test DB and applies
 *   migration 0014, creating the integration_client table).
 *
 * Run via:
 *   node --import tsx --test \
 *     src/test/integration/integration-client-repository.integration.test.ts
 */

import { test, before, after } from "node:test";
import assert                  from "node:assert/strict";
import { randomUUID }          from "node:crypto";
import { drizzle }             from "drizzle-orm/node-postgres";
import { sql }                 from "drizzle-orm";
import * as schema             from "@workspace/db/schema";

import type { RbgDb }          from "../../repositories/regional-intake.repository.js";
import {
  resolveEnabledIntegrationClient,
} from "../../repositories/integration-client.repository.js";

// ── DB URL guard ──────────────────────────────────────────────────────────────

const testDbUrl = (() => {
  const url = process.env["RBG_TEST_DATABASE_URL"];
  if (!url) {
    console.error(
      "STOP: RBG_TEST_DATABASE_URL is not set. " +
      "Set RBG_TEST_DATABASE_URL to a dedicated disposable test database before " +
      "running C3a PostgreSQL integration tests. " +
      "Never fall back to DATABASE_URL.",
    );
    process.exit(1);
  }
  return url;
})();

// ── Own pool and executor ─────────────────────────────────────────────────────

type PoolHandle = { end: () => Promise<void> };

function makeTestDb(url: string): { pool: PoolHandle; db: RbgDb } {
  const instance = drizzle(url, { schema });
  const pool     = (instance as unknown as { $client: PoolHandle }).$client;
  return { pool, db: instance as unknown as RbgDb };
}

const { pool: testPool, db } = makeTestDb(testDbUrl);

// ── Exec helper ───────────────────────────────────────────────────────────────

async function exec(query: ReturnType<typeof sql>): Promise<void> {
  await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(query);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

before(async () => {
  // Smoke-check: verify integration_client table is accessible
  await exec(sql`SELECT 1 FROM integration_client LIMIT 0`);
});

after(async () => {
  await testPool.end();
});

// ── ICI-1: enabled batumicars row ─────────────────────────────────────────────

test("ICI-1: enabled batumicars row → { found: true, brandCode: 'batumicars' }", async () => {
  const keyId = `test-ic-${randomUUID()}`;

  try {
    await exec(sql`
      INSERT INTO integration_client (key_id, brand_code, disabled_at)
      VALUES (${keyId}, 'batumicars', NULL)
    `);

    const result = await resolveEnabledIntegrationClient(db, keyId);

    assert.strictEqual(result.found, true, "must find the enabled batumicars row");
    if (!result.found) throw new Error("unreachable");
    assert.strictEqual(result.brandCode, "batumicars");
  } finally {
    await exec(sql`DELETE FROM integration_client WHERE key_id = ${keyId}`);
  }
});

// ── ICI-2: disabled row (disabled_at set) ────────────────────────────────────

test("ICI-2: kutaisicars row with disabled_at=NOW() → { found: false }", async () => {
  const keyId = `test-ic-${randomUUID()}`;

  try {
    await exec(sql`
      INSERT INTO integration_client (key_id, brand_code, disabled_at)
      VALUES (${keyId}, 'kutaisicars', NOW())
    `);

    const result = await resolveEnabledIntegrationClient(db, keyId);

    assert.strictEqual(result.found, false, "disabled row must not be found");
  } finally {
    await exec(sql`DELETE FROM integration_client WHERE key_id = ${keyId}`);
  }
});

// ── ICI-3: no row for the generated key ──────────────────────────────────────

test("ICI-3: no row for generated key_id → { found: false }", async () => {
  const keyId = `test-ic-${randomUUID()}`;

  // No INSERT — the key does not exist in the database.
  const result = await resolveEnabledIntegrationClient(db, keyId);

  assert.strictEqual(result.found, false, "absent row must return { found: false }");
});
