/**
 * internal-rbg-rate-limit.ts
 *
 * Per-IP rate limiter for the internal RBG booking intake route.
 *
 * Exported:
 *   INTERNAL_RBG_RATE_LIMIT_DEFAULTS  — immutable locked default configuration
 *   InternalRbgRateLimitOptions       — injectable options interface
 *   createInternalRbgRateLimiter()    — factory function
 *
 * Constraints (enforced by verifier):
 *   - No process.env reads
 *   - No DB, Resend, or router dependency
 *   - No request-body access of any kind
 *   - No req.pipe / req.read / req.resume / req.on("data") / async body iteration
 *   - No body-parser import
 */

import { randomUUID }          from "node:crypto";
import type { RequestHandler } from "express";
import rateLimit, { type Options, ipKeyGenerator } from "express-rate-limit";

// ── Immutable default configuration ───────────────────────────────────────────

/**
 * Locked C4a initial defaults.  Unit tests U3–U8 read these values directly;
 * no module spying or monkey-patching is needed.
 *
 * These are per-process, in-memory defaults.  Final production tuning
 * (max, windowMs, shared-store decision) is deferred to C4b after PM2
 * topology and Gateway traffic evidence are available.
 */
export const INTERNAL_RBG_RATE_LIMIT_DEFAULTS = {
  windowMs:               60_000,
  max:                    30,
  standardHeaders:        true,
  legacyHeaders:          false,
  skipSuccessfulRequests: false,
  skipFailedRequests:     false,
} as const;

// ── Options interface ──────────────────────────────────────────────────────────

export interface InternalRbgRateLimitOptions {
  /** Override window duration (ms).  Default: 60 000. */
  windowMs?: number;
  /** Override per-IP request ceiling.  Default: 30. */
  max?: number;
  /**
   * Injectable store — used by tests to inject a MemoryStore instance so
   * resetAll() can be called for deterministic window-reset assertions.
   * Omit in production (uses the default in-memory store).
   */
  store?: Options["store"];
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Creates an Express RequestHandler that enforces a per-IP rate limit.
 *
 * Key design points:
 *   - keyGenerator uses ipKeyGenerator(req.ip ?? "unknown") for IPv6-safe
 *     bucket assignment; using req.ip directly without ipKeyGenerator throws
 *     ERR_ERL_KEY_GEN_IPV6 in express-rate-limit v8.
 *   - standardHeaders: true causes the library to set RateLimit-Limit,
 *     RateLimit-Remaining, RateLimit-Reset, and Retry-After BEFORE calling
 *     the custom handler — the handler does not need to set these.
 *   - The handler sets x-rbg-request-id to a fresh UUID (pre-auth correlation
 *     ID mirroring the router's Step 2 fallback UUID pattern) then sends 429.
 *   - The log event is bounded: no IP, keyId, body, signature, or PII.
 */
export function createInternalRbgRateLimiter(
  opts?: InternalRbgRateLimitOptions,
): RequestHandler {
  const config: Partial<Options> = {
    windowMs:               opts?.windowMs ?? INTERNAL_RBG_RATE_LIMIT_DEFAULTS.windowMs,
    max:                    opts?.max      ?? INTERNAL_RBG_RATE_LIMIT_DEFAULTS.max,
    standardHeaders:        INTERNAL_RBG_RATE_LIMIT_DEFAULTS.standardHeaders,
    legacyHeaders:          INTERNAL_RBG_RATE_LIMIT_DEFAULTS.legacyHeaders,
    skipSuccessfulRequests: INTERNAL_RBG_RATE_LIMIT_DEFAULTS.skipSuccessfulRequests,
    skipFailedRequests:     INTERNAL_RBG_RATE_LIMIT_DEFAULTS.skipFailedRequests,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
    handler: (_req, res) => {
      res.set("x-rbg-request-id", randomUUID());
      console.warn("[rbg-rl] RATE_LIMITED");
      res.status(429).json({ error: "RATE_LIMITED" });
    },
  };

  if (opts?.store !== undefined) {
    config.store = opts.store;
  }

  return rateLimit(config);
}
