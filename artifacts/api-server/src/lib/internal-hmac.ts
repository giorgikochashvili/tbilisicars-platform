/**
 * HOP-B HMAC-SHA256 primitives for the Regional Brands Gateway → Core intake.
 *
 * This is a separate protocol from the existing website → Gateway HMAC
 * implementation. Do not import or reuse Gateway inbound signing helpers.
 * All names clearly identify this as the Core internal HOP-B protocol.
 *
 * Pure lib module: no Express imports, no DB access, no module-level side
 * effects, no process.env reads, no logging.
 */

import {
  createHash,
  createHmac,
  timingSafeEqual as cryptoTimingSafeEqual,
} from "node:crypto";
import type { SecretLookupResult } from "./integration-secret-store.js";

// ─── Regexes ─────────────────────────────────────────────────────────────────

const KEY_ID_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Canonical unsigned decimal — no sign, no decimal, no exponent, no leading zeros. */
const TIMESTAMP_REGEX = /^(0|[1-9][0-9]*)$/;

/** Canonical lowercase UUID. */
const REQUEST_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lowercase hex, exactly 64 characters. */
const SIGNATURE_REGEX = /^[0-9a-f]{64}$/;

// ─── Fixed canonical string components ───────────────────────────────────────

const CANONICAL_MARKER = "RBG-HMAC-SHA256-V1";
const CANONICAL_METHOD = "POST";
const CANONICAL_PATH = "/api/internal/regional-brands/bookings";

// ─── Public result types ──────────────────────────────────────────────────────

export type VerifyInternalHmacResult =
  | { ok: true }
  | { ok: false; reason: InternalHmacFailReason };

export type InternalHmacFailReason =
  | "MISSING_HEADERS"
  | "MALFORMED_KEY_ID"
  | "INTERNAL_CLOCK_ERROR"
  | "MALFORMED_TIMESTAMP"
  | "STALE_TIMESTAMP"
  | "MALFORMED_REQUEST_ID"
  | "MALFORMED_SIGNATURE"
  | "UNKNOWN_KEY"
  | "INTERNAL_SECRET_ERROR"
  | "INVALID_SIGNATURE";

export interface VerifyInternalHmacInput {
  rawBody: Uint8Array;
  keyId: string | undefined;
  timestamp: string | undefined;
  requestId: string | undefined;
  signature: string | undefined;
  nowSeconds: number;
  /** Called only after key-ID shape validation passes (step 8 of verifier). */
  resolveSecret(keyId: string): SecretLookupResult;
}

// ─── Option C split types ──────────────────────────────────────────────────────

/**
 * Immutable validated metadata returned by prevalidateInternalHmacHeaders on
 * success. Serves as the explicit typed handoff to
 * verifyInternalHmacAfterPrevalidation so steps 1–7 are never repeated.
 */
export interface ValidatedHmacMetadata {
  readonly keyId:     string;
  readonly timestamp: string;
  readonly requestId: string;
  readonly signature: string;
}

export type PrevalidateInternalHmacResult =
  | { ok: true;  metadata: ValidatedHmacMetadata }
  | { ok: false; reason:   InternalHmacFailReason };

// ─── Pure primitive functions ─────────────────────────────────────────────────

/**
 * SHA-256 of rawBody → 64 lowercase hex characters.
 * Accepts raw Uint8Array bytes. Performs no JSON parsing and no serialization
 * or re-serialization of any kind.
 */
export function hashRawBody(rawBody: Uint8Array | Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

/**
 * Assemble the 7-line HOP-B canonical string.
 * Result has exactly 6 LF characters and no trailing LF.
 * All inputs are used verbatim — no normalization.
 */
export function buildInternalHmacCanonicalString(
  keyId: string,
  timestampStr: string,
  requestIdStr: string,
  bodyHashHex: string,
): string {
  return [
    CANONICAL_MARKER,
    CANONICAL_METHOD,
    CANONICAL_PATH,
    keyId,
    timestampStr,
    requestIdStr,
    bodyHashHex,
  ].join("\n");
}

/**
 * HMAC-SHA256 of canonical string using secretBytes → 64 lowercase hex chars.
 *
 * Requires secretBytes to be exactly 32 bytes. Throws a fixed safe error
 * (containing no secret material, no key ID, no canonical string) if the
 * length differs. verifyInternalHmac pre-validates the length at step 9 and
 * returns INTERNAL_SECRET_ERROR rather than allowing this throw to escape.
 */
export function computeInternalHmacSignature(
  canonical: string,
  secretBytes: Uint8Array,
): string {
  if (secretBytes.length !== 32) {
    throw new Error(
      "Internal HMAC secret must be exactly 32 bytes.",
    );
  }
  return createHmac("sha256", secretBytes).update(canonical).digest("hex");
}

/**
 * Returns true iff:
 * - nowSeconds is a non-negative safe integer,
 * - timestampStr matches ^(0|[1-9][0-9]*)$ and parses to a non-negative safe integer,
 * - Math.abs(parsedTimestamp - nowSeconds) <= 300.
 */
export function isInternalTimestampValid(
  timestampStr: string,
  nowSeconds: number,
): boolean {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return false;
  if (!TIMESTAMP_REGEX.test(timestampStr)) return false;
  const parsed = Number(timestampStr);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return false;
  return Math.abs(parsed - nowSeconds) <= 300;
}

/**
 * Returns true iff requestIdStr matches the canonical lowercase UUID pattern:
 * ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$
 * No normalization.
 */
export function isCanonicalRequestId(requestIdStr: string): boolean {
  return REQUEST_ID_REGEX.test(requestIdStr);
}

/**
 * Returns true iff sig matches ^[0-9a-f]{64}$.
 * Lowercase hex only. No normalization.
 */
export function isValidInternalSignatureShape(sig: string): boolean {
  return SIGNATURE_REGEX.test(sig);
}

/**
 * Returns true iff keyId matches the key-ID format:
 * ^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$
 */
export function isValidInternalKeyId(keyId: string): boolean {
  return KEY_ID_REGEX.test(keyId);
}

/**
 * Constant-time comparison of two signature strings.
 *
 * Returns false immediately (non-constant time) if lengths differ — length
 * mismatch is already caught by isValidInternalSignatureShape. When both
 * strings are valid 64-char lowercase hex, calls crypto.timingSafeEqual on
 * equal-length Buffers (UTF-8 encoding: 1 byte per ASCII char → 64 bytes each).
 * Returns false if either string is not valid 64-char lowercase hex.
 */
export function timingSafeSignatureEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  if (!SIGNATURE_REGEX.test(a) || !SIGNATURE_REGEX.test(b)) return false;
  return cryptoTimingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ─── Option C split functions ──────────────────────────────────────────────────

/**
 * Performs exactly steps 1–7 of the HOP-B HMAC verification:
 *
 * 1. All four metadata fields present and non-empty  → MISSING_HEADERS
 * 2. Key-ID syntax valid                             → MALFORMED_KEY_ID
 * 3. nowSeconds is non-negative safe integer         → INTERNAL_CLOCK_ERROR
 * 4. Timestamp canonical decimal syntax + safe int   → MALFORMED_TIMESTAMP
 * 5. Freshness tolerance abs(ts - now) <= 300        → STALE_TIMESTAMP
 * 6. Request ID canonical lowercase UUID             → MALFORMED_REQUEST_ID
 * 7. Signature shape ^[0-9a-f]{64}$                  → MALFORMED_SIGNATURE
 *
 * Performs no DB call, secret lookup, raw-body hash, or HMAC calculation.
 * Pure and synchronous.
 */
export function prevalidateInternalHmacHeaders(input: {
  keyId:      string | undefined;
  timestamp:  string | undefined;
  requestId:  string | undefined;
  signature:  string | undefined;
  nowSeconds: number;
}): PrevalidateInternalHmacResult {
  const { keyId, timestamp, requestId, signature, nowSeconds } = input;

  // Step 1: All four metadata fields present and non-empty
  if (
    keyId === undefined || keyId === "" ||
    timestamp === undefined || timestamp === "" ||
    requestId === undefined || requestId === "" ||
    signature === undefined || signature === ""
  ) {
    return { ok: false, reason: "MISSING_HEADERS" };
  }

  // Step 2: Key-ID syntax
  if (!isValidInternalKeyId(keyId)) {
    return { ok: false, reason: "MALFORMED_KEY_ID" };
  }

  // Step 3: nowSeconds must be a non-negative safe integer
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    return { ok: false, reason: "INTERNAL_CLOCK_ERROR" };
  }

  // Step 4: Timestamp canonical decimal syntax and safe-integer value
  if (!TIMESTAMP_REGEX.test(timestamp)) {
    return { ok: false, reason: "MALFORMED_TIMESTAMP" };
  }
  const parsedTimestamp = Number(timestamp);
  if (!Number.isSafeInteger(parsedTimestamp) || parsedTimestamp < 0) {
    return { ok: false, reason: "MALFORMED_TIMESTAMP" };
  }

  // Step 5: Freshness tolerance
  if (Math.abs(parsedTimestamp - nowSeconds) > 300) {
    return { ok: false, reason: "STALE_TIMESTAMP" };
  }

  // Step 6: Request ID canonical lowercase UUID
  if (!isCanonicalRequestId(requestId)) {
    return { ok: false, reason: "MALFORMED_REQUEST_ID" };
  }

  // Step 7: Signature shape
  if (!isValidInternalSignatureShape(signature)) {
    return { ok: false, reason: "MALFORMED_SIGNATURE" };
  }

  return {
    ok: true,
    metadata: { keyId, timestamp, requestId, signature },
  };
}

/**
 * Performs exactly steps 9–11 of the HOP-B HMAC verification:
 *
 * 9.  Resolved secret is exactly 32 bytes            → INTERNAL_SECRET_ERROR
 * 10. Hash body, build canonical, compute expected,
 *     timing-safe compare                            → INVALID_SIGNATURE
 * 11. Return { ok: true }
 *
 * Receives pre-validated metadata from prevalidateInternalHmacHeaders and the
 * resolved secret bytes from the runtime secret store. Steps 1–7 are never
 * repeated. Pure and synchronous.
 */
export function verifyInternalHmacAfterPrevalidation(input: {
  rawBody:     Uint8Array;
  metadata:    ValidatedHmacMetadata;
  secretBytes: Uint8Array;
}): VerifyInternalHmacResult {
  const { rawBody, metadata, secretBytes } = input;

  // Step 9: Resolved secret must be exactly 32 bytes
  if (secretBytes.length !== 32) {
    return { ok: false, reason: "INTERNAL_SECRET_ERROR" };
  }

  // Step 10: Hash body, build canonical string, compute expected signature,
  //          timing-safe compare. computeInternalHmacSignature won't throw
  //          here because we validated the length at step 9.
  const bodyHashHex = hashRawBody(rawBody);
  const canonical   = buildInternalHmacCanonicalString(
    metadata.keyId,
    metadata.timestamp,
    metadata.requestId,
    bodyHashHex,
  );
  const expected = computeInternalHmacSignature(canonical, secretBytes);

  if (!timingSafeSignatureEqual(expected, metadata.signature)) {
    return { ok: false, reason: "INVALID_SIGNATURE" };
  }

  // Step 11: All checks passed
  return { ok: true };
}

// ─── End-to-end verifier ──────────────────────────────────────────────────────

/**
 * Pure end-to-end HOP-B HMAC verification.
 *
 * Evaluates the following 11 steps in exact order, short-circuiting on
 * the first failure:
 *
 * 1.  All four metadata fields present and non-empty → MISSING_HEADERS
 * 2.  Key-ID syntax valid                            → MALFORMED_KEY_ID
 * 3.  nowSeconds is non-negative safe integer        → INTERNAL_CLOCK_ERROR
 * 4.  Timestamp canonical decimal syntax + safe int  → MALFORMED_TIMESTAMP
 * 5.  Freshness tolerance abs(ts - now) <= 300       → STALE_TIMESTAMP
 * 6.  Request ID canonical lowercase UUID            → MALFORMED_REQUEST_ID
 * 7.  Signature shape ^[0-9a-f]{64}$                 → MALFORMED_SIGNATURE
 * 8.  Secret lookup by validated key ID              → UNKNOWN_KEY
 * 9.  Resolved secret is exactly 32 bytes            → INTERNAL_SECRET_ERROR
 * 10. Hash body, build canonical, compute expected,
 *     timing-safe compare                            → INVALID_SIGNATURE
 * 11. Return { ok: true }
 *
 * No result value ever contains secret bytes, key IDs, signatures, expected
 * signatures, canonical strings, body hashes, raw bodies, env values, or
 * raw errors.
 */
/**
 * Pure end-to-end HOP-B HMAC verification.
 *
 * Compatibility composition of prevalidateInternalHmacHeaders (steps 1–7),
 * the synchronous resolveSecret callback (step 8), and
 * verifyInternalHmacAfterPrevalidation (steps 9–11).
 *
 * Observable behaviour is identical to the original 11-step implementation.
 * All Phase A tests continue to exercise this composed function.
 *
 * No result value ever contains secret bytes, key IDs, signatures, expected
 * signatures, canonical strings, body hashes, raw bodies, env values, or
 * raw errors.
 */
export function verifyInternalHmac(
  input: VerifyInternalHmacInput,
): VerifyInternalHmacResult {
  const { rawBody, keyId, timestamp, requestId, signature, nowSeconds,
    resolveSecret } = input;

  // Steps 1–7: metadata prevalidation
  const pre = prevalidateInternalHmacHeaders({
    keyId, timestamp, requestId, signature, nowSeconds,
  });
  if (!pre.ok) {
    return { ok: false, reason: pre.reason };
  }

  // Step 8: Secret lookup (called only after key-ID shape validation passed)
  const secretResult = resolveSecret(pre.metadata.keyId);
  if (!secretResult.found) {
    return { ok: false, reason: "UNKNOWN_KEY" };
  }

  // Steps 9–11: final verification
  return verifyInternalHmacAfterPrevalidation({
    rawBody,
    metadata:    pre.metadata,
    secretBytes: secretResult.secretBytes,
  });
}
