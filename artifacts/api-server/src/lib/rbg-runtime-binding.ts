/**
 * rbg-runtime-binding.ts
 *
 * C3b-1: Pure runtime dependency binder for the Regional Brands Gateway intake
 * pipeline.
 *
 * Accepts all runtime sources via an explicit RbgRuntimeSources parameter.
 * Classifies the feature flag exactly once and returns a typed result:
 * - router: null  for "disabled" and "disabled_with_warning" states.
 * - router: Router for the "enabled" state.
 *
 * Purity contract:
 *   - No process.env access.
 *   - No console calls.
 *   - No runtime import from @workspace/db.
 *   - No runtime import of regional-staff-notifier.impl.
 *   - No Resend import.
 *   - No runtime import of buildInternalRbgComposition.
 *   - No customer email, PDF, or voucher reference.
 *   - Type-only imports are used where required for external dependencies.
 *
 * Zero production reachability in C3b-1 — no runtime entry imports this file.
 */

import type { Router } from "express";

import {
  classifyIntakeFeature,
  INTAKE_FLAG_WARNING_CODE,
} from "./intake-feature-classifier.js";
import type { BuildInternalRbgCompositionDeps } from "../composition/internal-rbg.composition.js";
import type { RbgLogger }                       from "../routes/internal-rbg-router.js";
import type { RegionalNotifyLogger }            from "../services/regional-notification-reporter.js";
import type { RbgDb }                           from "../repositories/regional-intake.repository.js";
import type { RegionalStaffNotifier }           from "../lib/regional-staff-notifier.js";

// ── Source interface ───────────────────────────────────────────────────────────

/**
 * All runtime sources injected into bindRbgRuntime. Exactly 9 members.
 *
 * Enabled-only sources (getDb, buildNotifier, buildComposition, readSecretsJson)
 * are called at most once and only when classification === "enabled".
 */
export interface RbgRuntimeSources {
  /** Returns the raw RBG_CORE_INTAKE_ENABLED value — undefined if unset. */
  readFeatureFlagRaw(): string | undefined;

  /** Returns the raw RBG_CORE_INTAKE_SECRETS_JSON value — undefined if unset. */
  readSecretsJson(): string | undefined;

  /** Returns the Drizzle executor. Called at most once — enabled branch only. */
  getDb(): RbgDb;

  /** Constructs the staff notifier. Called at most once — enabled branch only. */
  buildNotifier(): RegionalStaffNotifier;

  /**
   * Builds the internal RBG router composition from explicit deps.
   * Called at most once — enabled branch only.
   * Errors propagate unchanged; binder never catches or wraps them.
   */
  buildComposition(deps: BuildInternalRbgCompositionDeps): { router: Router };

  /** Bounded router-level event logger. Passed to buildComposition (enabled only). */
  rbgLogger: RbgLogger;

  /** Bounded notification-failure event logger. Passed to buildComposition (enabled only). */
  notifyLogger: RegionalNotifyLogger;

  /** Wall-clock seconds provider. Passed to buildComposition (enabled only). */
  getNowSeconds(): number;

  /**
   * Warning sink for the disabled_with_warning case.
   * Called exactly once, receiving only INTAKE_FLAG_WARNING_CODE.
   * The raw feature-flag value is never passed.
   * Synchronous throws from this sink are swallowed; a throwing sink must not
   * prevent the binder from returning normally.
   */
  reportFeatureFlagWarning(code: typeof INTAKE_FLAG_WARNING_CODE): void;
}

// ── Result type ────────────────────────────────────────────────────────────────

export type RbgRuntimeBindingResult =
  | {
      classification: "disabled" | "disabled_with_warning";
      router: null;
    }
  | {
      classification: "enabled";
      router: Router;
    };

// ── Binder ─────────────────────────────────────────────────────────────────────

/**
 * Classify the feature flag once and build the RBG router only for the enabled
 * state. For all disabled states, return router: null.
 *
 * Execution contract:
 *   - readFeatureFlagRaw is called exactly once.
 *   - classifyIntakeFeature is called exactly once.
 *   - "disabled" branch: touches no other source member.
 *   - "disabled_with_warning" branch: calls reportFeatureFlagWarning exactly
 *     once with INTAKE_FLAG_WARNING_CODE; swallows synchronous sink throws;
 *     touches no other source member.
 *   - "enabled" branch: calls getDb, buildNotifier, and buildComposition each
 *     exactly once; passes canonical featureFlagRaw "true"; passes a lazy
 *     getSecretsJson wrapper; lets buildComposition errors propagate unchanged.
 */
export function bindRbgRuntime(sources: RbgRuntimeSources): RbgRuntimeBindingResult {
  const raw            = sources.readFeatureFlagRaw();
  const classification = classifyIntakeFeature(raw);

  if (classification === "disabled") {
    return { classification: "disabled", router: null };
  }

  if (classification === "disabled_with_warning") {
    try {
      sources.reportFeatureFlagWarning(INTAKE_FLAG_WARNING_CODE);
    } catch {
      // Synchronous warning-sink throws are swallowed.
    }
    return { classification: "disabled_with_warning", router: null };
  }

  // classification === "enabled"
  const db       = sources.getDb();
  const notifier = sources.buildNotifier();

  const result = sources.buildComposition({
    db,
    featureFlagRaw:           "true",
    getSecretsJson:           () => sources.readSecretsJson(),
    notifier,
    rbgLogger:                sources.rbgLogger,
    notifyLogger:             sources.notifyLogger,
    getNowSeconds:            sources.getNowSeconds,
    reportFeatureFlagWarning: sources.reportFeatureFlagWarning,
  });

  return { classification: "enabled", router: result.router };
}
