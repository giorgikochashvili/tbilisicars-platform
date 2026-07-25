/**
 * Factory for the Regional Brands Gateway intake error-boundary middleware.
 *
 * This is a router-scoped Express error handler (four-argument signature).
 * It must be the LAST middleware registered on the internal-RBG router so
 * that errors thrown or forwarded by any preceding middleware are captured.
 *
 * Design contract:
 *   - Always preserves the x-rbg-request-id response header set in step 2 of
 *     the routing pipeline. The header is already on the response before any
 *     handler runs, so no additional action is required — res.json() does not
 *     clear other headers.
 *   - Maps express.raw() overflow errors (entity.too.large) → 413
 *   - Maps express.raw() encoding errors (encoding.unsupported) → 415
 *   - Maps everything else → 500
 *   - Never calls the global (application-level) error handler via next(err).
 *     Calls next() without arguments only to satisfy Express's arity check.
 *   - Never includes stack traces, error messages, or raw error values in the
 *     response body.
 *   - SyntaxError and TypeError from the authenticated handler reach here as
 *     500 (they are caught inline in the router pipeline before reaching here
 *     only for UTF-8 / JSON.parse failures; handler-originated errors go to
 *     next(err) and reach this boundary).
 */

import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns a four-argument Express error handler that provides bounded error
 * semantics for the internal RBG router.
 *
 * Register it as the last `router.use()` call after all route handlers and
 * the body parser:
 *
 *   router.use(createInternalRbgErrorBoundary());
 */
export function createInternalRbgErrorBoundary(): ErrorRequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return function internalRbgErrorBoundary(
    err: unknown,
    _req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // Guard: if headers already sent, fall through. Express would ignore a
    // res.json() call anyway, and calling next(err) would hand to the global
    // handler. Calling next() without args satisfies Express's arity contract.
    if (res.headersSent) {
      next();
      return;
    }

    // Classify the error by its type annotation (set by body-parser / Express)
    const errType = (err as Record<string, unknown>)?.["type"];

    if (errType === "entity.too.large") {
      res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
      return;
    }

    if (errType === "encoding.unsupported") {
      res.status(415).json({ error: "UNSUPPORTED_MEDIA_TYPE" });
      return;
    }

    // Everything else is an internal error. Never expose err details.
    res.status(500).json({ error: "INTERNAL_ERROR" });
  };
}
