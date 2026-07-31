/**
 * internal-rbg.composition.ts
 *
 * C3a: Single composition root for the Regional Brands Gateway intake stack.
 *
 * Pure dependency injection — accepts all external dependencies via an
 * explicit parameter. No @workspace/db import, no process.env access, no
 * console calls, no Resend construction, no test-only overrides.
 *
 * ZERO runtime side effects at import time.
 * Construction must not execute a DB query, transaction, notifier call,
 * Resend call, or any network call.
 *
 * Production reachability: ZERO until C3b explicitly imports and mounts the
 * router. No runtime entry imports this file in C3a.
 */

import express from "express";

import {
  classifyIntakeFeature,
  INTAKE_FLAG_WARNING_CODE,
} from "../lib/intake-feature-classifier.js";
import { parseRbgCoreIntakeSecrets }       from "../lib/rbg-core-intake-secrets.js";
import type { IntegrationSecretStore }     from "../lib/integration-secret-store.js";
import { createInternalRbgRouter }         from "../routes/internal-rbg-router.js";
import type { RbgLogger, RegionalBrandCode }
                                           from "../routes/internal-rbg-router.js";
import { createRegionalIntakeService }     from "../services/regional-intake.service.js";
import type { RegionalIntakeTransactionRunner }
                                           from "../services/regional-intake.service.js";
import { createRegionalIntakeHandler }     from "../routes/regional-intake-handler.js";
import { createRegionalNotificationFailureReporter }
                                           from "../services/regional-notification-reporter.js";
import type { RegionalNotifyLogger }       from "../services/regional-notification-reporter.js";
import type { RegionalStaffNotifier }      from "../lib/regional-staff-notifier.js";
import { resolveEnabledIntegrationClient } from "../repositories/integration-client.repository.js";
import type { RbgDb }                      from "../repositories/regional-intake.repository.js";

// ── Module-private disabled no-op store ───────────────────────────────────────

/**
 * Returns a no-op IntegrationSecretStore stub for disabled states.
 *
 * The router's feature gate returns 404 before any secret-store lookup
 * when featureEnabled is false, so this stub is never consulted in practice.
 * It satisfies the non-optional secretStore parameter of createInternalRbgRouter.
 */
function createDisabledStub(): IntegrationSecretStore {
  return {
    lookup(_keyId: string) {
      return { found: false as const, reason: "unknown_key" as const };
    },
    getConfiguredKeyIds(): readonly string[] {
      return [];
    },
    get size(): number {
      return 0;
    },
  };
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface BuildInternalRbgCompositionDeps {
  /** Injected Drizzle executor (read + write). Provided by C3b runtime binder. */
  db:             RbgDb;

  /** Raw value of RBG_CORE_INTAKE_ENABLED — undefined if not set. */
  featureFlagRaw: string | undefined;

  /**
   * Lazy secrets accessor. Called at most once, only when featureEnabled=true.
   * Must return the raw RBG_CORE_INTAKE_SECRETS_JSON string or undefined.
   * Provided by C3b runtime binder.
   */
  getSecretsJson: () => string | undefined;

  /** Pre-constructed notifier (e.g. buildDefaultRegionalStaffNotifier in C3b). */
  notifier:       RegionalStaffNotifier;

  /** Logger for router-level bounded events. */
  rbgLogger:      RbgLogger;

  /** Logger for notification-failure bounded events. */
  notifyLogger:   RegionalNotifyLogger;

  /** Wall-clock seconds provider for HMAC timestamp validation. */
  getNowSeconds:  () => number;

  /**
   * Warning sink — invoked exactly once when classifyIntakeFeature returns
   * "disabled_with_warning". Receives only the fixed INTAKE_FLAG_WARNING_CODE.
   * The raw featureFlagRaw value is never passed.
   * Synchronous throws from this sink are swallowed; a throwing sink must not
   * prevent composition from completing.
   * The real console binding belongs to C3b.
   */
  reportFeatureFlagWarning: (code: typeof INTAKE_FLAG_WARNING_CODE) => void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function buildInternalRbgComposition(
  deps: BuildInternalRbgCompositionDeps,
): { router: express.Router } {
  // Step 1: classify the feature flag
  const classification = classifyIntakeFeature(deps.featureFlagRaw);

  // Step 2: emit bounded warning if needed — swallow sink throws
  if (classification === "disabled_with_warning") {
    try {
      deps.reportFeatureFlagWarning(INTAKE_FLAG_WARNING_CODE);
    } catch {
      // Warning-sink failure must not prevent composition from completing.
    }
  }

  // Step 3: derive feature state
  const featureEnabled = classification === "enabled";

  // Step 4: build secret store (lazy — only when enabled)
  const secretStore: IntegrationSecretStore = featureEnabled
    ? parseRbgCoreIntakeSecrets(deps.getSecretsJson())
    : createDisabledStub();

  // Step 5: enabled-client resolver closure
  // Validates the DB result and casts into the router's opaque RegionalBrandCode.
  const resolveEnabledClient = async (keyId: string) => {
    const result = await resolveEnabledIntegrationClient(deps.db, keyId);
    if (result.found) {
      return {
        found:     true  as const,
        brandCode: result.brandCode as unknown as RegionalBrandCode,
      };
    }
    return result;
  };

  // Step 6: transaction runner — no custom isolation level
  const runTransaction: RegionalIntakeTransactionRunner = (cb) =>
    deps.db.transaction(cb);

  // Step 7: intake service
  const service = createRegionalIntakeService({
    committedDb:    deps.db,
    runTransaction,
  });

  // Step 8: notification failure reporter
  const reporter = createRegionalNotificationFailureReporter(deps.notifyLogger);

  // Step 9: authenticated handler
  const handler = createRegionalIntakeHandler({
    service,
    notifier:                  deps.notifier,
    reportNotificationFailure: reporter,
  });

  // Step 10: router
  const router = createInternalRbgRouter({
    featureEnabled,
    resolveEnabledClient,
    secretStore,
    getNowSeconds:        deps.getNowSeconds,
    authenticatedHandler: handler,
    logger:               deps.rbgLogger,
  });

  return { router };
}
