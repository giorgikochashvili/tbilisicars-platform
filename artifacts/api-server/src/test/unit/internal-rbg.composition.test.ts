/**
 * internal-rbg.composition.test.ts
 *
 * C3a unit tests — composition factory (16 tests, CO-1 to CO-16).
 *
 * Uses only normal injected dependencies. No _testOverrides. No module spying.
 * No live DB. No process.env mutation. No Resend.
 *
 * deps.db is a minimal fake with non-callable execute() and transaction() stubs
 * (construction must not invoke either). deps.notifier, deps.rbgLogger,
 * deps.notifyLogger, deps.getNowSeconds are no-op stubs. deps.getSecretsJson
 * and deps.reportFeatureFlagWarning are controlled spies.
 *
 * Run via:
 *   node --import tsx --test src/test/unit/internal-rbg.composition.test.ts
 */

import { test } from "node:test";
import assert   from "node:assert/strict";
import express  from "express";

import {
  buildInternalRbgComposition,
  type BuildInternalRbgCompositionDeps,
} from "../../composition/internal-rbg.composition.js";
import {
  RbgCoreIntakeSecretsParseError,
} from "../../lib/rbg-core-intake-secrets.js";
import {
  IntegrationSecretConfigError,
} from "../../lib/integration-secret-store.js";
import {
  INTAKE_FLAG_WARNING_CODE,
} from "../../lib/intake-feature-classifier.js";
import type { RbgDb }          from "../../repositories/regional-intake.repository.js";
import type { RbgLogger }      from "../../routes/internal-rbg-router.js";
import type { RegionalNotifyLogger } from "../../services/regional-notification-reporter.js";
import type { RegionalStaffNotifier } from "../../lib/regional-staff-notifier.js";

// ── Test constants ────────────────────────────────────────────────────────────

// Valid 32-byte base64 (32 zero bytes).
const VALID_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

const VALID_SECRETS_JSON = JSON.stringify([
  { keyId: "test-key", secretBase64: VALID_B64 },
]);

const DUPLICATE_SECRETS_JSON = JSON.stringify([
  { keyId: "dup-key", secretBase64: VALID_B64 },
  { keyId: "dup-key", secretBase64: VALID_B64 },
]);

const INVALID_B64_SECRETS_JSON = JSON.stringify([
  { keyId: "test-key", secretBase64: "not-valid-base64!!!" },
]);

// ── Deps factory ─────────────────────────────────────────────────────────────

interface SpyDb {
  executeCalls:    number;
  transactionCalls: number;
  db:              RbgDb;
}

function makeSpyDb(): SpyDb {
  const spy: SpyDb = { executeCalls: 0, transactionCalls: 0, db: null! };
  spy.db = {
    execute: async (_q: unknown) => {
      spy.executeCalls++;
      return { rows: [] } as unknown as ReturnType<RbgDb["execute"]>;
    },
    transaction: async (cb: unknown) => {
      spy.transactionCalls++;
      return (cb as (tx: unknown) => unknown)({} as unknown);
    },
  } as unknown as RbgDb;
  return spy;
}

function makeTestDeps(
  overrides: Partial<BuildInternalRbgCompositionDeps> = {},
): BuildInternalRbgCompositionDeps & { warnCalls: number; warnArgs: unknown[] } {
  const spyDb = makeSpyDb();
  const warnArgs: unknown[] = [];
  let warnCalls = 0;

  const deps: BuildInternalRbgCompositionDeps & { warnCalls: number; warnArgs: unknown[] } = {
    db:             spyDb.db,
    featureFlagRaw: undefined,
    getSecretsJson: () => VALID_SECRETS_JSON,
    notifier:       { notify: async () => {} } as RegionalStaffNotifier,
    rbgLogger:      { log: () => {} } as RbgLogger,
    notifyLogger:   { log: () => {} } as RegionalNotifyLogger,
    getNowSeconds:  () => Math.floor(Date.now() / 1000),
    reportFeatureFlagWarning: (code) => {
      warnCalls++;
      warnArgs.push(code);
    },
    get warnCalls() { return warnCalls; },
    get warnArgs()  { return warnArgs; },
    ...overrides,
  };

  return deps;
}

// ── CO-1: featureFlagRaw=undefined → disabled; no side effects ───────────────

test("CO-1: featureFlagRaw=undefined → disabled; getSecretsJson not called; sink not called; router returned", () => {
  let secretsCalled = 0;
  let sinkCalled    = 0;

  const deps = makeTestDeps({
    featureFlagRaw:          undefined,
    getSecretsJson:          () => { secretsCalled++; return VALID_SECRETS_JSON; },
    reportFeatureFlagWarning: () => { sinkCalled++; },
  });

  const { router } = buildInternalRbgComposition(deps);

  assert.strictEqual(secretsCalled, 0, "getSecretsJson must not be called when disabled");
  assert.strictEqual(sinkCalled,    0, "reportFeatureFlagWarning must not be called when disabled");
  assert.ok(router instanceof express.Router || typeof router === "function",
    "must return an Express router");
});

// ── CO-2: featureFlagRaw="false" → same as disabled ──────────────────────────

test("CO-2: featureFlagRaw='false' → disabled; getSecretsJson not called; sink not called; router returned", () => {
  let secretsCalled = 0;
  let sinkCalled    = 0;

  const deps = makeTestDeps({
    featureFlagRaw:          "false",
    getSecretsJson:          () => { secretsCalled++; return VALID_SECRETS_JSON; },
    reportFeatureFlagWarning: () => { sinkCalled++; },
  });

  const { router } = buildInternalRbgComposition(deps);

  assert.strictEqual(secretsCalled, 0);
  assert.strictEqual(sinkCalled,    0);
  assert.ok(router instanceof express.Router || typeof router === "function");
});

// ── CO-3: featureFlagRaw="disabled_with_warning" ──────────────────────────────

test("CO-3: disabled_with_warning → sink called once with INTAKE_FLAG_WARNING_CODE; getSecretsJson not called; router returned", () => {
  let secretsCalled = 0;
  let sinkCalls     = 0;
  const sinkArgs: unknown[] = [];

  const deps = makeTestDeps({
    featureFlagRaw:          "disabled_with_warning",
    getSecretsJson:          () => { secretsCalled++; return VALID_SECRETS_JSON; },
    reportFeatureFlagWarning: (code) => { sinkCalls++; sinkArgs.push(code); },
  });

  const { router } = buildInternalRbgComposition(deps);

  assert.strictEqual(sinkCalls,    1,                    "sink must be called exactly once");
  assert.strictEqual(sinkArgs[0],  INTAKE_FLAG_WARNING_CODE, "sink must receive the fixed code");
  assert.strictEqual(secretsCalled, 0,                   "getSecretsJson must not be called");
  assert.ok(router instanceof express.Router || typeof router === "function");
});

// ── CO-4: featureFlagRaw="true" + valid secrets ───────────────────────────────

test("CO-4: featureFlagRaw='true' + valid secrets → getSecretsJson called once; sink not called; router returned", () => {
  let secretsCalled = 0;
  let sinkCalled    = 0;

  const deps = makeTestDeps({
    featureFlagRaw:          "true",
    getSecretsJson:          () => { secretsCalled++; return VALID_SECRETS_JSON; },
    reportFeatureFlagWarning: () => { sinkCalled++; },
  });

  const { router } = buildInternalRbgComposition(deps);

  assert.strictEqual(secretsCalled, 1, "getSecretsJson must be called exactly once");
  assert.strictEqual(sinkCalled,    0, "reportFeatureFlagWarning must not be called when enabled");
  assert.ok(router instanceof express.Router || typeof router === "function");
});

// ── CO-5: enabled + getSecretsJson returns undefined → MISSING_CONFIG ─────────

test("CO-5: enabled + getSecretsJson()=undefined → throws RbgCoreIntakeSecretsParseError MISSING_CONFIG", () => {
  const deps = makeTestDeps({
    featureFlagRaw: "true",
    getSecretsJson: () => undefined,
  });

  assert.throws(
    () => buildInternalRbgComposition(deps),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "MISSING_CONFIG");
      return true;
    },
  );
});

// ── CO-6: enabled + invalid JSON → INVALID_JSON ───────────────────────────────

test("CO-6: enabled + getSecretsJson()='invalid json' → throws RbgCoreIntakeSecretsParseError INVALID_JSON", () => {
  const deps = makeTestDeps({
    featureFlagRaw: "true",
    getSecretsJson: () => "invalid json !!!",
  });

  assert.throws(
    () => buildInternalRbgComposition(deps),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "INVALID_JSON");
      return true;
    },
  );
});

// ── CO-7: enabled + non-array root → INVALID_SHAPE ───────────────────────────

test("CO-7: enabled + getSecretsJson()='{}' → throws RbgCoreIntakeSecretsParseError INVALID_SHAPE", () => {
  const deps = makeTestDeps({
    featureFlagRaw: "true",
    getSecretsJson: () => "{}",
  });

  assert.throws(
    () => buildInternalRbgComposition(deps),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "INVALID_SHAPE");
      return true;
    },
  );
});

// ── CO-8: disabled → getSecretsJson never called ─────────────────────────────

test("CO-8: disabled (featureFlagRaw=undefined) → getSecretsJson call count === 0", () => {
  let secretsCalled = 0;

  const deps = makeTestDeps({
    featureFlagRaw: undefined,
    getSecretsJson: () => { secretsCalled++; return VALID_SECRETS_JSON; },
  });

  buildInternalRbgComposition(deps);

  assert.strictEqual(secretsCalled, 0, "getSecretsJson must never be called when disabled");
});

// ── CO-9: disabled_with_warning → getSecretsJson never called; sink once ─────

test("CO-9: disabled_with_warning → getSecretsJson=0 calls; reportFeatureFlagWarning=1 call", () => {
  let secretsCalled = 0;
  let sinkCalls     = 0;

  const deps = makeTestDeps({
    featureFlagRaw:          "disabled_with_warning",
    getSecretsJson:          () => { secretsCalled++; return VALID_SECRETS_JSON; },
    reportFeatureFlagWarning: () => { sinkCalls++; },
  });

  buildInternalRbgComposition(deps);

  assert.strictEqual(secretsCalled, 0, "getSecretsJson must never be called");
  assert.strictEqual(sinkCalls,     1, "reportFeatureFlagWarning must be called exactly once");
});

// ── CO-10: construction does not execute any DB query ────────────────────────

test("CO-10: construction must not execute a DB query (db.execute call count === 0)", () => {
  const spyDb = makeSpyDb();

  const deps = makeTestDeps({
    featureFlagRaw: "true",
    db:             spyDb.db,
    getSecretsJson: () => VALID_SECRETS_JSON,
  });

  buildInternalRbgComposition(deps);

  assert.strictEqual(
    spyDb.executeCalls, 0,
    "db.execute must not be called during composition construction",
  );
});

// ── CO-11: construction does not execute any DB transaction ──────────────────

test("CO-11: construction must not execute a DB transaction (db.transaction call count === 0)", () => {
  const spyDb = makeSpyDb();

  const deps = makeTestDeps({
    featureFlagRaw: "true",
    db:             spyDb.db,
    getSecretsJson: () => VALID_SECRETS_JSON,
  });

  buildInternalRbgComposition(deps);

  assert.strictEqual(
    spyDb.transactionCalls, 0,
    "db.transaction must not be called during composition construction",
  );
});

// ── CO-12: enabled + duplicate keyId → IntegrationSecretConfigError ──────────

test("CO-12: enabled + duplicate keyId → throws IntegrationSecretConfigError DUPLICATE_KEY_ID", () => {
  const deps = makeTestDeps({
    featureFlagRaw: "true",
    getSecretsJson: () => DUPLICATE_SECRETS_JSON,
  });

  assert.throws(
    () => buildInternalRbgComposition(deps),
    (err: unknown) => {
      assert.ok(err instanceof IntegrationSecretConfigError,
        "must throw IntegrationSecretConfigError");
      assert.strictEqual(err.kind, "DUPLICATE_KEY_ID");
      return true;
    },
  );
});

// ── CO-13: enabled + invalid Base64 → IntegrationSecretConfigError ────────────

test("CO-13: enabled + invalid Base64 → throws IntegrationSecretConfigError INVALID_BASE64", () => {
  const deps = makeTestDeps({
    featureFlagRaw: "true",
    getSecretsJson: () => INVALID_B64_SECRETS_JSON,
  });

  assert.throws(
    () => buildInternalRbgComposition(deps),
    (err: unknown) => {
      assert.ok(err instanceof IntegrationSecretConfigError,
        "must throw IntegrationSecretConfigError");
      assert.strictEqual(err.kind, "INVALID_BASE64");
      return true;
    },
  );
});

// ── CO-14: warning sink argument isolation ────────────────────────────────────

test("CO-14: disabled_with_warning → sink called once; arg === INTAKE_FLAG_WARNING_CODE; raw featureFlagRaw absent", () => {
  const rawFlag = "some-unrecognised-value-xyz";
  const receivedArgs: unknown[] = [];

  const deps = makeTestDeps({
    featureFlagRaw:          rawFlag,
    getSecretsJson:          () => VALID_SECRETS_JSON,
    reportFeatureFlagWarning: (code) => { receivedArgs.push(code); },
  });

  buildInternalRbgComposition(deps);

  assert.strictEqual(receivedArgs.length, 1, "sink must be called exactly once");
  assert.strictEqual(receivedArgs[0], INTAKE_FLAG_WARNING_CODE,
    "sink argument must be exactly INTAKE_FLAG_WARNING_CODE");
  assert.ok(
    !String(receivedArgs[0]).includes(rawFlag),
    "raw featureFlagRaw value must not appear in the sink argument",
  );
});

// ── CO-15: throwing warning sink is swallowed ─────────────────────────────────

test("CO-15: throwing reportFeatureFlagWarning is swallowed; composition returns { router } normally", () => {
  const deps = makeTestDeps({
    featureFlagRaw:          "disabled_with_warning",
    getSecretsJson:          () => VALID_SECRETS_JSON,
    reportFeatureFlagWarning: () => {
      throw new Error("warning-sink-intentional-throw");
    },
  });

  // Must not throw — the sink throw is swallowed.
  let result: { router: express.Router } | undefined;
  assert.doesNotThrow(
    () => { result = buildInternalRbgComposition(deps); },
    "composition must return normally even if the warning sink throws",
  );
  assert.ok(result !== undefined);
  assert.ok(result.router instanceof express.Router || typeof result.router === "function");
});

// ── CO-16: enabled → reportFeatureFlagWarning never called ───────────────────

test("CO-16: featureFlagRaw='true' (enabled) → reportFeatureFlagWarning never called", () => {
  let sinkCalls = 0;

  const deps = makeTestDeps({
    featureFlagRaw:          "true",
    getSecretsJson:          () => VALID_SECRETS_JSON,
    reportFeatureFlagWarning: () => { sinkCalls++; },
  });

  buildInternalRbgComposition(deps);

  assert.strictEqual(sinkCalls, 0,
    "reportFeatureFlagWarning must never be called when feature is enabled");
});
