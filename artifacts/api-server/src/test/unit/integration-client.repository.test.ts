/**
 * integration-client.repository.test.ts
 *
 * C3a unit tests — integration-client resolver (6 tests, IC-1 to IC-6).
 *
 * Uses an injected fake RbgDb with a controllable execute() stub.
 * No live DB. No process.env mutation.
 *
 * Tests verify the { rows: [...] } extraction convention, the canonical brand
 * set enforcement, the { found: false } / throw distinction, and the
 * re-throw contract for infrastructure failures.
 *
 * Run via:
 *   node --import tsx --test src/test/unit/integration-client.repository.test.ts
 */

import { test } from "node:test";
import assert   from "node:assert/strict";

import {
  resolveEnabledIntegrationClient,
} from "../../repositories/integration-client.repository.js";
import type { RbgDb } from "../../repositories/regional-intake.repository.js";

// ── Fake DB helpers ───────────────────────────────────────────────────────────

/** Builds a fake RbgDb whose execute() returns the given rows. */
function dbWithRows(rows: Array<Record<string, unknown>>): RbgDb {
  return {
    execute: async (_q: unknown) =>
      ({ rows }) as unknown as ReturnType<RbgDb["execute"]>,
  } as unknown as RbgDb;
}

/** Builds a fake RbgDb whose execute() throws the given error synchronously. */
function dbThrowsSync(err: Error): RbgDb {
  return {
    execute: (_q: unknown): never => { throw err; },
  } as unknown as RbgDb;
}

/** Builds a fake RbgDb whose execute() returns a rejected Promise. */
function dbRejects(err: Error): RbgDb {
  return {
    execute: async (_q: unknown) => Promise.reject(err),
  } as unknown as RbgDb;
}

// ── IC-1: enabled batumicars row ─────────────────────────────────────────────

test("IC-1: enabled batumicars row → { found: true, brandCode: 'batumicars' }", async () => {
  const db     = dbWithRows([{ brand_code: "batumicars" }]);
  const result = await resolveEnabledIntegrationClient(db, "any-key");

  assert.strictEqual(result.found, true);
  if (!result.found) throw new Error("unreachable");
  assert.strictEqual(result.brandCode, "batumicars");
});

// ── IC-2: enabled kutaisicars row ────────────────────────────────────────────

test("IC-2: enabled kutaisicars row → { found: true, brandCode: 'kutaisicars' }", async () => {
  const db     = dbWithRows([{ brand_code: "kutaisicars" }]);
  const result = await resolveEnabledIntegrationClient(db, "any-key");

  assert.strictEqual(result.found, true);
  if (!result.found) throw new Error("unreachable");
  assert.strictEqual(result.brandCode, "kutaisicars");
});

// ── IC-3: empty rows (absent or disabled row filtered by SQL) ─────────────────

test("IC-3: empty rows → { found: false }", async () => {
  const db     = dbWithRows([]);
  const result = await resolveEnabledIntegrationClient(db, "any-key");

  assert.strictEqual(result.found, false);
});

// ── IC-4: unexpected brand_code ───────────────────────────────────────────────

test("IC-4: unexpected brand_code → throws fixed bounded error; raw value absent from message", async () => {
  const db = dbWithRows([{ brand_code: "unexpected-brand-xyz" }]);

  await assert.rejects(
    () => resolveEnabledIntegrationClient(db, "any-key"),
    (err: unknown) => {
      assert.ok(err instanceof Error, "must throw an Error");
      assert.ok(
        !err.message.includes("unexpected-brand-xyz"),
        "raw brand value must not appear in error message",
      );
      return true;
    },
  );
});

// ── IC-5: execute throws synchronously ───────────────────────────────────────

test("IC-5: execute throws synchronously → re-throws; never { found: false }", async () => {
  const sentinel = new Error("IC-5-sentinel-sync-throw");
  const db       = dbThrowsSync(sentinel);

  await assert.rejects(
    () => resolveEnabledIntegrationClient(db, "any-key"),
    (err: unknown) => {
      assert.strictEqual(err, sentinel, "must re-throw the exact original error");
      return true;
    },
  );
});

// ── IC-6: execute returns rejected Promise ────────────────────────────────────

test("IC-6: execute rejects → re-rejects; never { found: false }", async () => {
  const sentinel = new Error("IC-6-sentinel-async-reject");
  const db       = dbRejects(sentinel);

  await assert.rejects(
    () => resolveEnabledIntegrationClient(db, "any-key"),
    (err: unknown) => {
      assert.strictEqual(err, sentinel, "must propagate the exact rejection reason");
      return true;
    },
  );
});
