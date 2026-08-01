/**
 * rbg-runtime-binding.test.ts
 *
 * C3b-1: Pure unit tests for the bindRbgRuntime binder.
 *
 * Test isolation rules:
 *   - Imports only the pure binder, required types, and error class.
 *   - Does NOT import rbg-runtime-adapter.ts.
 *   - Uses injected stubs only; no live DB singleton.
 *   - Does not read or mutate process.env.
 *   - Does not construct Resend.
 *   - Does not send email.
 *   - Does not use module spying or module-cache manipulation.
 *   - Does not assert instanceof express.Router.
 *   - Uses exact sentinel router identity instead.
 *
 * Locked count: 25 tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Router } from "express";

import {
  bindRbgRuntime,
} from "../../lib/rbg-runtime-binding.js";
import type { RbgRuntimeSources } from "../../lib/rbg-runtime-binding.js";
import { RbgCoreIntakeSecretsParseError } from "../../lib/rbg-core-intake-secrets.js";
import { INTAKE_FLAG_WARNING_CODE }        from "../../lib/intake-feature-classifier.js";

// ── Sentinel router (plain object — identity comparison only) ─────────────────

const SENTINEL_ROUTER = {} as Router;

// ── Spy helper ────────────────────────────────────────────────────────────────

function makeSpy<T extends (...args: Parameters<T>) => ReturnType<T>>(
  impl: T,
): { fn: T; calls: Parameters<T>[] } {
  const calls: Parameters<T>[] = [];
  const fn = ((...args: Parameters<T>) => {
    calls.push(args);
    return impl(...args);
  }) as T;
  return { fn, calls };
}

// ── Stub factory ──────────────────────────────────────────────────────────────

interface StubSet {
  readFeatureFlagRaw:  ReturnType<typeof makeSpy<() => string | undefined>>;
  readSecretsJson:     ReturnType<typeof makeSpy<() => string | undefined>>;
  getDb:               ReturnType<typeof makeSpy<() => Record<string, never>>>;
  buildNotifier:       ReturnType<typeof makeSpy<() => Record<string, never>>>;
  buildComposition:    ReturnType<typeof makeSpy<(d: Parameters<RbgRuntimeSources["buildComposition"]>[0]) => { router: Router }>>;
  reportFlagWarning:   ReturnType<typeof makeSpy<(code: typeof INTAKE_FLAG_WARNING_CODE) => void>>;
  sources:             RbgRuntimeSources;
}

function makeStubs(opts: {
  rawFlag:            string | undefined;
  compositionResult?: { router: Router };
  compositionThrow?:  Error;
  warningThrow?:      Error;
}): StubSet {
  const readFeatureFlagRaw = makeSpy((): string | undefined => opts.rawFlag);
  const readSecretsJson    = makeSpy((): string | undefined => "[]");
  const getDb              = makeSpy((): Record<string, never> => ({} as Record<string, never>));
  const buildNotifier      = makeSpy((): Record<string, never> => ({} as Record<string, never>));

  const buildComposition = makeSpy(
    (_deps: Parameters<RbgRuntimeSources["buildComposition"]>[0]): { router: Router } => {
      if (opts.compositionThrow) throw opts.compositionThrow;
      return opts.compositionResult ?? { router: SENTINEL_ROUTER };
    },
  );

  const reportFlagWarning = makeSpy((_code: typeof INTAKE_FLAG_WARNING_CODE): void => {
    if (opts.warningThrow) throw opts.warningThrow;
  });

  const sources: RbgRuntimeSources = {
    readFeatureFlagRaw:       readFeatureFlagRaw.fn,
    readSecretsJson:          readSecretsJson.fn,
    getDb:                    getDb.fn as unknown as RbgRuntimeSources["getDb"],
    buildNotifier:            buildNotifier.fn as unknown as RbgRuntimeSources["buildNotifier"],
    buildComposition:         buildComposition.fn as unknown as RbgRuntimeSources["buildComposition"],
    rbgLogger:                { log() {} },
    notifyLogger:             { log() {} },
    getNowSeconds:            () => 0,
    reportFeatureFlagWarning: reportFlagWarning.fn,
  };

  return {
    readFeatureFlagRaw,
    readSecretsJson,
    getDb,
    buildNotifier,
    buildComposition,
    reportFlagWarning,
    sources,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("bindRbgRuntime", () => {

  // ── Disabled classification (tests 1–4) ──────────────────────────────────

  it("1. undefined raw flag → disabled, router null", () => {
    const { sources } = makeStubs({ rawFlag: undefined });
    const result = bindRbgRuntime(sources);
    assert.strictEqual(result.classification, "disabled");
    assert.strictEqual(result.router, null);
  });

  it("2. blank string raw flag → disabled, router null", () => {
    const { sources } = makeStubs({ rawFlag: "" });
    const result = bindRbgRuntime(sources);
    assert.strictEqual(result.classification, "disabled");
    assert.strictEqual(result.router, null);
  });

  it("3. whitespace-only raw flag → disabled, router null", () => {
    const { sources } = makeStubs({ rawFlag: "   " });
    const result = bindRbgRuntime(sources);
    assert.strictEqual(result.classification, "disabled");
    assert.strictEqual(result.router, null);
  });

  it("4. \"false\" raw flag → disabled, router null", () => {
    const { sources } = makeStubs({ rawFlag: "false" });
    const result = bindRbgRuntime(sources);
    assert.strictEqual(result.classification, "disabled");
    assert.strictEqual(result.router, null);
  });

  // ── disabled_with_warning (tests 5–7) ────────────────────────────────────

  it("5. invalid raw flag → disabled_with_warning, router null", () => {
    const { sources } = makeStubs({ rawFlag: "yes" });
    const result = bindRbgRuntime(sources);
    assert.strictEqual(result.classification, "disabled_with_warning");
    assert.strictEqual(result.router, null);
  });

  it("6. warning sink receives INTAKE_FLAG_WARNING_CODE exactly once", () => {
    const { sources, reportFlagWarning } = makeStubs({ rawFlag: "yes" });
    bindRbgRuntime(sources);
    assert.strictEqual(reportFlagWarning.calls.length, 1);
    assert.strictEqual(reportFlagWarning.calls[0]![0], INTAKE_FLAG_WARNING_CODE);
  });

  it("7. synchronous warning-sink throw is swallowed; binder returns normally", () => {
    const { sources } = makeStubs({ rawFlag: "yes", warningThrow: new Error("boom") });
    let result!: ReturnType<typeof bindRbgRuntime>;
    assert.doesNotThrow(() => {
      result = bindRbgRuntime(sources);
    });
    assert.strictEqual(result.router, null);
  });

  // ── readFeatureFlagRaw called once (test 8) ───────────────────────────────

  it("8. readFeatureFlagRaw is called exactly once", () => {
    const { sources, readFeatureFlagRaw } = makeStubs({ rawFlag: undefined });
    bindRbgRuntime(sources);
    assert.strictEqual(readFeatureFlagRaw.calls.length, 1);
  });

  // ── Disabled branch isolation (tests 9–12) ───────────────────────────────

  it("9. disabled branch never calls readSecretsJson", () => {
    const { sources, readSecretsJson } = makeStubs({ rawFlag: undefined });
    bindRbgRuntime(sources);
    assert.strictEqual(readSecretsJson.calls.length, 0);
  });

  it("10. disabled branch never calls getDb", () => {
    const { sources, getDb } = makeStubs({ rawFlag: undefined });
    bindRbgRuntime(sources);
    assert.strictEqual(getDb.calls.length, 0);
  });

  it("11. disabled branch never calls buildNotifier", () => {
    const { sources, buildNotifier } = makeStubs({ rawFlag: undefined });
    bindRbgRuntime(sources);
    assert.strictEqual(buildNotifier.calls.length, 0);
  });

  it("12. disabled branch never calls buildComposition", () => {
    const { sources, buildComposition } = makeStubs({ rawFlag: undefined });
    bindRbgRuntime(sources);
    assert.strictEqual(buildComposition.calls.length, 0);
  });

  // ── disabled_with_warning isolation (tests 13–16) ────────────────────────

  it("13. disabled_with_warning never calls readSecretsJson", () => {
    const { sources, readSecretsJson } = makeStubs({ rawFlag: "yes" });
    bindRbgRuntime(sources);
    assert.strictEqual(readSecretsJson.calls.length, 0);
  });

  it("14. disabled_with_warning never calls getDb", () => {
    const { sources, getDb } = makeStubs({ rawFlag: "yes" });
    bindRbgRuntime(sources);
    assert.strictEqual(getDb.calls.length, 0);
  });

  it("15. disabled_with_warning never calls buildNotifier", () => {
    const { sources, buildNotifier } = makeStubs({ rawFlag: "yes" });
    bindRbgRuntime(sources);
    assert.strictEqual(buildNotifier.calls.length, 0);
  });

  it("16. disabled_with_warning never calls buildComposition", () => {
    const { sources, buildComposition } = makeStubs({ rawFlag: "yes" });
    bindRbgRuntime(sources);
    assert.strictEqual(buildComposition.calls.length, 0);
  });

  // ── Enabled branch (tests 17–22) ─────────────────────────────────────────

  it("17. enabled branch calls getDb exactly once", () => {
    const { sources, getDb } = makeStubs({ rawFlag: "true" });
    bindRbgRuntime(sources);
    assert.strictEqual(getDb.calls.length, 1);
  });

  it("18. enabled branch calls buildNotifier exactly once", () => {
    const { sources, buildNotifier } = makeStubs({ rawFlag: "true" });
    bindRbgRuntime(sources);
    assert.strictEqual(buildNotifier.calls.length, 1);
  });

  it("19. enabled branch calls buildComposition exactly once", () => {
    const { sources, buildComposition } = makeStubs({ rawFlag: "true" });
    bindRbgRuntime(sources);
    assert.strictEqual(buildComposition.calls.length, 1);
  });

  it("20. enabled passes canonical featureFlagRaw \"true\" to buildComposition", () => {
    const { sources, buildComposition } = makeStubs({ rawFlag: "true" });
    bindRbgRuntime(sources);
    const deps = buildComposition.calls[0]![0];
    assert.strictEqual(deps.featureFlagRaw, "true");
  });

  it("21. enabled passes lazy getSecretsJson callback backed by readSecretsJson", () => {
    const { sources, buildComposition, readSecretsJson } = makeStubs({ rawFlag: "true" });
    bindRbgRuntime(sources);
    const deps = buildComposition.calls[0]![0];
    assert.strictEqual(readSecretsJson.calls.length, 0, "readSecretsJson not called before getSecretsJson()");
    deps.getSecretsJson();
    assert.strictEqual(readSecretsJson.calls.length, 1, "readSecretsJson called once after getSecretsJson()");
  });

  it("22. enabled returns exact router sentinel from buildComposition", () => {
    const { sources } = makeStubs({
      rawFlag:            "true",
      compositionResult:  { router: SENTINEL_ROUTER },
    });
    const result = bindRbgRuntime(sources);
    assert.strictEqual(result.classification, "enabled");
    assert.strictEqual(result.router, SENTINEL_ROUTER);
  });

  // ── Error propagation (tests 23–25) ──────────────────────────────────────

  it("23. MISSING_CONFIG error from buildComposition propagates as exact same object", () => {
    const err23 = new RbgCoreIntakeSecretsParseError("MISSING_CONFIG", "test-missing-config");
    const { sources } = makeStubs({ rawFlag: "true", compositionThrow: err23 });
    let caught: unknown;
    try {
      bindRbgRuntime(sources);
    } catch (e) {
      caught = e;
    }
    assert.strictEqual(caught, err23);
    assert.ok(caught instanceof RbgCoreIntakeSecretsParseError);
    assert.strictEqual((caught as RbgCoreIntakeSecretsParseError).kind, "MISSING_CONFIG");
  });

  it("24. INVALID_JSON error from buildComposition propagates as exact same object", () => {
    const err24 = new RbgCoreIntakeSecretsParseError("INVALID_JSON", "test-invalid-json");
    const { sources } = makeStubs({ rawFlag: "true", compositionThrow: err24 });
    let caught: unknown;
    try {
      bindRbgRuntime(sources);
    } catch (e) {
      caught = e;
    }
    assert.strictEqual(caught, err24);
    assert.ok(caught instanceof RbgCoreIntakeSecretsParseError);
    assert.strictEqual((caught as RbgCoreIntakeSecretsParseError).kind, "INVALID_JSON");
  });

  it("25. INVALID_SHAPE error from buildComposition propagates as exact same object", () => {
    const err25 = new RbgCoreIntakeSecretsParseError("INVALID_SHAPE", "test-invalid-shape");
    const { sources } = makeStubs({ rawFlag: "true", compositionThrow: err25 });
    let caught: unknown;
    try {
      bindRbgRuntime(sources);
    } catch (e) {
      caught = e;
    }
    assert.strictEqual(caught, err25);
    assert.ok(caught instanceof RbgCoreIntakeSecretsParseError);
    assert.strictEqual((caught as RbgCoreIntakeSecretsParseError).kind, "INVALID_SHAPE");
  });

});
