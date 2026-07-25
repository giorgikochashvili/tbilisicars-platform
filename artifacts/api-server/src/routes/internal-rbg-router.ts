/**
 * Factory for the Regional Brands Gateway internal intake router (Phase B).
 *
 * ZERO runtime effect — this module only exports a factory function. No route
 * is mounted in production until Phase C wires it into the application. No DB
 * access, no emails, no side effects at import time.
 *
 * Pipeline (17 steps):
 *
 *   Step  1 — Preflight (path, method, query, Content-Type, Content-Encoding)
 *   Step  2 — Assign fallback correlation UUID; set x-rbg-request-id header
 *   Step  3 — Feature-gate: featureEnabled === false → 404, stop
 *   Step  4 — express.raw({ type:"application/json", limit:"64kb", inflate:false })
 *   Step  5 — Reject if body was not buffered (e.g. wrong Content-Type slipped through)
 *   Steps 6-7 — Extract HMAC header fields; call prevalidateInternalHmacHeaders
 *               On STALE_TIMESTAMP/MISSING_HEADERS/MALFORMED_* → 401
 *   Step  8 — resolveEnabledClient(keyId) → enabled client metadata; on failure → 503
 *   Step  9 — secretStore.lookup(keyId); on not-found → 401
 *   Step 10 — verifyInternalHmacAfterPrevalidation; promote correlation UUID
 *             to the validated request ID; on failure reason → 401 or 503
 *   Step 11 — Inline strict-UTF-8 decode (fatal: true); TypeError → 400
 *   Step 12 — Inline JSON.parse; SyntaxError → 400
 *   Step 13 — Compose AuthenticatedRbgRequestContext
 *   Step 14 — Call authenticatedHandler; errors propagate to error boundary → 500
 *   Step 15 — Error boundary (last router.use)
 *
 * Safety contracts:
 *   • UTF-8 decode failures and JSON.parse failures are caught INLINE (steps
 *     11–12) and produce 400 without going through the error boundary.
 *   • SyntaxError / TypeError from the authenticatedHandler propagates via
 *     next(err) to the error boundary → 500.
 *   • All logger.log() calls are wrapped in safeLog() which swallows throws
 *     silently — logger failures must never change HTTP behaviour.
 *   • The error boundary never calls next(err) (no global-handler leak).
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

import {
  prevalidateInternalHmacHeaders,
  verifyInternalHmacAfterPrevalidation,
} from "../lib/internal-hmac.js";
import type { IntegrationSecretStore } from "../lib/integration-secret-store.js";
import { createInternalRbgPreflight } from "../middlewares/internal-rbg-preflight.js";
import { createInternalRbgErrorBoundary } from "../middlewares/internal-rbg-error-boundary.js";

// ─── Domain types (Phase B — no booking DTO) ──────────────────────────────────

/** ISO 3166-1-alpha-2-like brand code for a regional partner. */
export type RegionalBrandCode = string & { readonly __brand: "RegionalBrandCode" };

export interface EnabledClientLookupResult {
  found: true;
  brandCode: RegionalBrandCode;
}

export type ResolveEnabledClientResult =
  | EnabledClientLookupResult
  | { found: false };

/**
 * Async lookup from keyId → enabled client metadata.
 * Must throw — not return { found: false } — if the lookup itself fails.
 */
export type ResolveEnabledClient = (
  keyId: string,
) => Promise<ResolveEnabledClientResult>;

/** Context handed to the authenticated handler after all auth checks pass. */
export interface AuthenticatedRbgRequestContext {
  /** The validated correlation ID from the HMAC header. */
  readonly correlationId: string;
  /** Brand code from the DB metadata layer. */
  readonly brandCode: RegionalBrandCode;
  /** Parsed request body (Zod validation and business logic are Phase C). */
  readonly parsedJson: unknown;
}

/**
 * Handler invoked only after successful authentication.
 * Errors thrown or forwarded via next(err) reach the router-scoped boundary.
 * The handler MUST call res.end() (or equivalent) or forward to next().
 */
export type AuthenticatedRbgHandler = (
  ctx: AuthenticatedRbgRequestContext,
  req: Request,
  res: Response,
  next: NextFunction,
) => void;

// ─── Logger types ──────────────────────────────────────────────────────────────

/** Closed union of event codes the router may log. */
export type RbgLogEvent =
  | { code: "RBG_AUTH_FAILED";        reason: string }
  | { code: "RBG_CLIENT_LOOKUP_FAIL"; detail: "exception" }
  | { code: "RBG_SECRET_MISSING";     keyId: string }
  | { code: "RBG_BODY_INVALID";       detail: "utf8" | "json" }
  | { code: "RBG_UNAVAILABLE" };

export interface RbgLogger {
  log(correlationId: string, event: RbgLogEvent): void;
}

// ─── Deps ──────────────────────────────────────────────────────────────────────

export interface CreateInternalRbgRouterDeps {
  /** If false the router returns 404 for all requests (no-op). */
  featureEnabled: boolean;
  /**
   * Async: resolves keyId → enabled client metadata.
   * Must throw on lookup failure; returning { found: false } signals 401.
   */
  resolveEnabledClient: ResolveEnabledClient;
  /** Runtime secret store. Synchronous. */
  secretStore: IntegrationSecretStore;
  /** Returns current Unix time in seconds. */
  getNowSeconds: () => number;
  /** Invoked after auth succeeds. Errors reach the error boundary → 500. */
  authenticatedHandler: AuthenticatedRbgHandler;
  /** Required. Logger failures are swallowed silently. */
  logger: RbgLogger;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Wraps logger.log(); swallows any throws silently. */
function safeLog(
  logger: RbgLogger,
  correlationId: string,
  event: RbgLogEvent,
): void {
  try {
    logger.log(correlationId, event);
  } catch {
    // logger failures must never change HTTP behaviour
  }
}

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates and returns a fully-configured Express Router that implements the
 * HOP-B intake pipeline.
 *
 * The returned router is not mounted anywhere — Phase C will attach it to the
 * application at the correct path.
 */
export function createInternalRbgRouter(
  deps: CreateInternalRbgRouterDeps,
): express.Router {
  const {
    featureEnabled,
    resolveEnabledClient,
    secretStore,
    getNowSeconds,
    authenticatedHandler,
    logger,
  } = deps;

  const router = express.Router();

  // ── Step 1: Preflight ────────────────────────────────────────────────────────
  router.use(createInternalRbgPreflight());

  // ── Steps 2–3: Correlation ID + feature gate (BEFORE body parser) ───────────
  // These run first so that:
  //  (a) x-rbg-request-id is set on the response before express.raw() can
  //      emit a 413 — ensuring the header is present on every response code,
  //      and the error boundary can preserve it.
  //  (b) A large body sent to a disabled route returns 404 (not 413), because
  //      express.raw() never runs when the feature gate fires early.
  router.post(
    "/",

    function rbgPreBody(
      _req: Request,
      res: Response,
      next: NextFunction,
    ): void {
      // Step 2: Assign fallback correlation UUID; set response header immediately.
      const correlationId = randomUUID();
      res.locals["rbgCorrelationId"] = correlationId;
      res.setHeader("x-rbg-request-id", correlationId);

      // Step 3: Feature gate
      if (!featureEnabled) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      next();
    },

    // Step 4: Buffer raw body (runs only when feature is enabled)
    express.raw({ type: "application/json", limit: "64kb", inflate: false }),

    async function internalRbgHandler(
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> {
      // Read the correlation ID set by rbgPreBody (fallback to fresh UUID in
      // the unlikely event res.locals was cleared).
      let correlationId: string =
        (res.locals["rbgCorrelationId"] as string | undefined) ?? randomUUID();

      // Step 5: Confirm body was buffered
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }

      const rawBody = new Uint8Array(
        req.body.buffer,
        req.body.byteOffset,
        req.body.byteLength,
      );

      // Steps 6–7: Extract HMAC header fields; prevalidate (steps 1–7 of HMAC)
      const keyId     = req.headers["x-rbg-key-id"];
      const timestamp = req.headers["x-rbg-timestamp"];
      const requestId = req.headers["x-rbg-request-id"];
      const signature = req.headers["x-rbg-signature"];

      const pre = prevalidateInternalHmacHeaders({
        keyId:      Array.isArray(keyId)     ? keyId[0]     : keyId,
        timestamp:  Array.isArray(timestamp) ? timestamp[0] : timestamp,
        requestId:  Array.isArray(requestId) ? requestId[0] : requestId,
        signature:  Array.isArray(signature) ? signature[0] : signature,
        nowSeconds: getNowSeconds(),
      });

      if (!pre.ok) {
        safeLog(logger, correlationId, {
          code: "RBG_AUTH_FAILED",
          reason: pre.reason,
        });
        res.status(401).json({ error: "AUTHENTICATION_FAILED" });
        return;
      }

      // Step 8: Resolve enabled client (async; throws on infra failure)
      let clientResult: ResolveEnabledClientResult;
      try {
        clientResult = await resolveEnabledClient(pre.metadata.keyId);
      } catch {
        safeLog(logger, correlationId, {
          code: "RBG_CLIENT_LOOKUP_FAIL",
          detail: "exception",
        });
        res.status(503).json({ error: "SERVICE_UNAVAILABLE" });
        return;
      }

      if (!clientResult.found) {
        safeLog(logger, correlationId, {
          code: "RBG_AUTH_FAILED",
          reason: "CLIENT_NOT_ENABLED",
        });
        res.status(401).json({ error: "AUTHENTICATION_FAILED" });
        return;
      }

      // Step 9: Secret lookup (synchronous; not-found → 401)
      const secretResult = secretStore.lookup(pre.metadata.keyId);
      if (!secretResult.found) {
        safeLog(logger, correlationId, {
          code: "RBG_SECRET_MISSING",
          keyId: pre.metadata.keyId,
        });
        res.status(401).json({ error: "AUTHENTICATION_FAILED" });
        return;
      }

      // Step 10: Final HMAC verification; on success promote correlation ID
      const hmacResult = verifyInternalHmacAfterPrevalidation({
        rawBody,
        metadata:    pre.metadata,
        secretBytes: secretResult.secretBytes,
      });

      if (!hmacResult.ok) {
        if (
          hmacResult.reason === "INTERNAL_SECRET_ERROR" ||
          hmacResult.reason === "INTERNAL_CLOCK_ERROR"
        ) {
          safeLog(logger, correlationId, {
            code: "RBG_AUTH_FAILED",
            reason: hmacResult.reason,
          });
          res.status(503).json({ error: "SERVICE_UNAVAILABLE" });
          return;
        }
        safeLog(logger, correlationId, {
          code: "RBG_AUTH_FAILED",
          reason: hmacResult.reason,
        });
        res.status(401).json({ error: "AUTHENTICATION_FAILED" });
        return;
      }

      // Promote: replace fallback UUID with the validated request ID
      correlationId = pre.metadata.requestId;
      res.setHeader("x-rbg-request-id", correlationId);

      // Step 11: Inline strict-UTF-8 decode (fatal: true)
      // TypeError here is caught inline → 400; never forwarded to the boundary.
      let bodyText: string;
      try {
        bodyText = UTF8_DECODER.decode(rawBody);
      } catch {
        safeLog(logger, correlationId, {
          code: "RBG_BODY_INVALID",
          detail: "utf8",
        });
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }

      // Step 12: Inline JSON.parse
      // SyntaxError here is caught inline → 400; never forwarded to the boundary.
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(bodyText);
      } catch {
        safeLog(logger, correlationId, {
          code: "RBG_BODY_INVALID",
          detail: "json",
        });
        res.status(400).json({ error: "INVALID_REQUEST" });
        return;
      }

      // Step 13: Compose context
      const ctx: AuthenticatedRbgRequestContext = {
        correlationId,
        brandCode:  clientResult.brandCode,
        parsedJson,
      };

      // Step 14: Call authenticated handler.
      // Errors thrown or forwarded via next(err) reach the error boundary → 500.
      // This includes any SyntaxError / TypeError thrown by the handler itself.
      try {
        authenticatedHandler(ctx, req, res, next);
      } catch (err) {
        next(err);
      }
    },
  );

  // ── Step 15: Router-scoped error boundary ────────────────────────────────────
  router.use(createInternalRbgErrorBoundary());

  return router;
}
