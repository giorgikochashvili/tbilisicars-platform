/**
 * Factory for the Regional Brands Gateway intake preflight middleware.
 *
 * Mounted at the very front of the internal-RBG router so shape violations are
 * rejected cheaply — before express.raw() reads any bytes.
 *
 * Checks performed (in order):
 *   1. Path is exactly "/"                 → 404 NOT_FOUND
 *   2. Method is POST                      → 405 METHOD_NOT_ALLOWED
 *   3. Query string is absent              → 400 INVALID_REQUEST
 *   4. Content-Type base type is application/json,
 *      and charset (if present) is utf-8   → 415 UNSUPPORTED_MEDIA_TYPE
 *   5. Content-Encoding (if present) is identity only
 *                                          → 415 UNSUPPORTED_MEDIA_TYPE
 *
 * No side effects. No logging. Does not read the request body.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";

// ─── Internal helpers ──────────────────────────────────────────────────────────

function isAcceptableContentType(header: string | undefined): boolean {
  if (!header) return false;
  const semi       = header.indexOf(";");
  const baseType   = (semi === -1 ? header : header.slice(0, semi))
    .trim()
    .toLowerCase();
  if (baseType !== "application/json") return false;
  if (semi === -1) return true; // no params → accept

  const params = header.slice(semi + 1);
  const charsetMatch = /charset\s*=\s*"?([^";,\s]+)"?/i.exec(params);
  if (!charsetMatch) return true; // no charset param → accept
  return charsetMatch[1]!.toLowerCase() === "utf-8";
}

function isAcceptableContentEncoding(header: string | undefined): boolean {
  if (header === undefined) return true; // absent → accept
  const norm = header.trim().toLowerCase();
  return norm === "" || norm === "identity";
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Returns a single Express RequestHandler that enforces preflight rules for
 * the internal RBG booking route.
 *
 * No deps injected — behaviour is unconditional. Mount it first on the router,
 * before any body parser.
 */
export function createInternalRbgPreflight(): RequestHandler {
  return function internalRbgPreflight(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    // 1. Path must be exactly "/"
    if (req.path !== "/") {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }

    // 2. Method must be POST
    if (req.method !== "POST") {
      res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
      return;
    }

    // 3. Query string must be absent
    if (Object.keys(req.query).length > 0) {
      res.status(400).json({ error: "INVALID_REQUEST" });
      return;
    }

    // 4. Content-Type
    if (!isAcceptableContentType(req.headers["content-type"])) {
      res.status(415).json({ error: "UNSUPPORTED_MEDIA_TYPE" });
      return;
    }

    // 5. Content-Encoding
    if (!isAcceptableContentEncoding(req.headers["content-encoding"])) {
      res.status(415).json({ error: "UNSUPPORTED_MEDIA_TYPE" });
      return;
    }

    next();
  };
}
