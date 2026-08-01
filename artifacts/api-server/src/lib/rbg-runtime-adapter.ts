/**
 * rbg-runtime-adapter.ts
 *
 * C3b-1: Thin production adapter that wires concrete runtime dependencies into
 * an RbgRuntimeSources object for use by the C3b-2 app-level binder call.
 *
 * Module-scope restrictions (hard):
 *   - No top-level call to bindRbgRuntime.
 *   - No app.use or route mount.
 *   - No DB query or transaction at module scope.
 *   - No notifier.notify call.
 *   - No email send or new Resend construction.
 *   - No customer email, PDF, or voucher reference.
 *   - No module-scope execution other than imports and the exported declaration.
 *
 * The adapter may import the existing DB singleton, notifier factory, and C3a
 * composition root, but only returns them through the exported factory function.
 *
 * Zero production reachability in C3b-1 — no runtime entry imports this file.
 */

import { db }                                from "@workspace/db";
import { buildInternalRbgComposition }       from "../composition/internal-rbg.composition.js";
import { buildDefaultRegionalStaffNotifier } from "../services/regional-staff-notifier.impl.js";
import type { RbgRuntimeSources }            from "./rbg-runtime-binding.js";

// ── Public factory ─────────────────────────────────────────────────────────────

/**
 * Return a fully-wired RbgRuntimeSources backed by production dependencies.
 *
 * All bindings are wrapped in closures or function references. No source member
 * is invoked at call time; all side effects are deferred to the binder.
 */
export function buildDefaultRbgRuntimeSources(): RbgRuntimeSources {
  return {
    readFeatureFlagRaw:  () => process.env["RBG_CORE_INTAKE_ENABLED"],
    readSecretsJson:     () => process.env["RBG_CORE_INTAKE_SECRETS_JSON"],
    getDb:               () => db,
    buildNotifier:       buildDefaultRegionalStaffNotifier,
    buildComposition:    buildInternalRbgComposition,

    rbgLogger: {
      log(correlationId, event) {
        console.error("[rbg]", correlationId, event.code);
      },
    },

    notifyLogger: {
      log(event) {
        console.error("[rbg-notify]", event.code, event.correlationId, event.bookingId);
      },
    },

    getNowSeconds: () => Math.floor(Date.now() / 1000),

    reportFeatureFlagWarning(code) {
      console.warn("[rbg] feature flag warning:", code);
    },
  };
}
