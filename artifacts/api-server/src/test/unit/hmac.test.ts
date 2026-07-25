/**
 * Unit tests for internal-hmac.ts
 *
 * Covers all HMAC primitives, the 11-step verification order, and the
 * authoritative golden vector.
 *
 * No process.env mutation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  hashRawBody,
  buildInternalHmacCanonicalString,
  computeInternalHmacSignature,
  isInternalTimestampValid,
  isCanonicalRequestId,
  isValidInternalSignatureShape,
  isValidInternalKeyId,
  timingSafeSignatureEqual,
  verifyInternalHmac,
  prevalidateInternalHmacHeaders,
  verifyInternalHmacAfterPrevalidation,
} from "../../lib/internal-hmac.js";
import type { ValidatedHmacMetadata } from "../../lib/internal-hmac.js";
import type { SecretLookupResult } from "../../lib/integration-secret-store.js";

// ─── Authoritative golden vector ──────────────────────────────────────────────
// These constants are hardcoded. The expected signature is never derived from
// the implementation under test.

const GV_SECRET_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const GV_SECRET_BASE64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const GV_BODY_STR =
  '{"gatewayBookingId":"11111111-1111-4111-8111-111111111111"}';
const GV_BODY_HASH =
  "7bd54def285d685918dde85607f69417c85b55a04e3c8947ce70a0835cd69c99";
const GV_KEY_ID = "kc-test-v1";
const GV_TIMESTAMP = "1783000000";
const GV_REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const GV_CANONICAL =
  "RBG-HMAC-SHA256-V1\nPOST\n/api/internal/regional-brands/bookings\n" +
  "kc-test-v1\n1783000000\n22222222-2222-4222-8222-222222222222\n" +
  "7bd54def285d685918dde85607f69417c85b55a04e3c8947ce70a0835cd69c99";
const GV_SIGNATURE =
  "78d5d955cf3a91ea43cfadd2da2c581dc7f4bf6ac5fa7eeaab3cec4d69fa9e01";

// Derived once for use across tests
const GV_SECRET_BYTES = Buffer.from(GV_SECRET_HEX, "hex");
const GV_BODY_BUF = Buffer.from(GV_BODY_STR);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeResolve(secret: Uint8Array): (keyId: string) => SecretLookupResult {
  return (_keyId) => ({ found: true, secretBytes: new Uint8Array(secret) });
}

function makeUnknownResolve(): (keyId: string) => SecretLookupResult {
  return (_keyId) => ({ found: false, reason: "unknown_key" });
}

function makeThrowingResolve(): (keyId: string) => SecretLookupResult {
  return (_keyId) => { throw new Error("resolveSecret must not be called"); };
}

function makeNonStandardLengthResolve(len: number): (keyId: string) => SecretLookupResult {
  return (_keyId) => ({ found: true, secretBytes: new Uint8Array(len) });
}

// ─── Golden vector: 11 assertions ────────────────────────────────────────────

test("GV-1: decoded secret bytes equal the expected hex bytes", () => {
  assert.strictEqual(GV_SECRET_BYTES.length, 32);
  for (let i = 0; i < 32; i++) {
    assert.strictEqual(GV_SECRET_BYTES[i], i, `byte[${i}] should be ${i}`);
  }
});

test("GV-2: exact raw-body SHA-256 matches authoritative hash", () => {
  const result = hashRawBody(GV_BODY_BUF);
  assert.strictEqual(result, GV_BODY_HASH);
});

test("GV-3: buildInternalHmacCanonicalString produces exact golden canonical string", () => {
  const result = buildInternalHmacCanonicalString(
    GV_KEY_ID,
    GV_TIMESTAMP,
    GV_REQUEST_ID,
    GV_BODY_HASH,
  );
  assert.strictEqual(result, GV_CANONICAL);
});

test("GV-4: canonical string has exactly 7 lines", () => {
  assert.strictEqual(GV_CANONICAL.split("\n").length, 7);
});

test("GV-5: canonical string has exactly 6 LF characters", () => {
  assert.strictEqual((GV_CANONICAL.match(/\n/g)?.length ?? 0), 6);
});

test("GV-6: canonical string is exactly 186 UTF-8 bytes", () => {
  assert.strictEqual(Buffer.byteLength(GV_CANONICAL, "utf8"), 186);
});

test("GV-7: canonical string contains no CR characters", () => {
  assert.strictEqual(GV_CANONICAL.includes("\r"), false);
});

test("GV-8: canonical string has no trailing newline", () => {
  assert.strictEqual(GV_CANONICAL.endsWith("\n"), false);
});

test("GV-9: direct Node crypto.createHmac produces authoritative signature", () => {
  const sig = createHmac("sha256", GV_SECRET_BYTES)
    .update(GV_CANONICAL)
    .digest("hex");
  assert.strictEqual(sig, GV_SIGNATURE);
});

test("GV-10: computeInternalHmacSignature produces authoritative signature", () => {
  const sig = computeInternalHmacSignature(GV_CANONICAL, GV_SECRET_BYTES);
  assert.strictEqual(sig, GV_SIGNATURE);
});

test("GV-11: direct crypto result and implementation result are strictly equal", () => {
  const cryptoSig = createHmac("sha256", GV_SECRET_BYTES)
    .update(GV_CANONICAL)
    .digest("hex");
  const implSig = computeInternalHmacSignature(GV_CANONICAL, GV_SECRET_BYTES);
  assert.strictEqual(cryptoSig, implSig);
  assert.strictEqual(cryptoSig, GV_SIGNATURE);
});

// ─── Canonical string structure ───────────────────────────────────────────────

test("canonical string starts with the correct marker line", () => {
  const s = buildInternalHmacCanonicalString("k", "0", "a".repeat(8) + "-" + "a".repeat(4) + "-" + "a".repeat(4) + "-" + "a".repeat(4) + "-" + "a".repeat(12), "a".repeat(64));
  assert.ok(s.startsWith("RBG-HMAC-SHA256-V1\n"));
});

test("canonical string second line is POST", () => {
  const lines = GV_CANONICAL.split("\n");
  assert.strictEqual(lines[1], "POST");
});

test("canonical string third line is the fixed path", () => {
  const lines = GV_CANONICAL.split("\n");
  assert.strictEqual(lines[2], "/api/internal/regional-brands/bookings");
});

test("canonical string key ID is verbatim in line 4", () => {
  const lines = GV_CANONICAL.split("\n");
  assert.strictEqual(lines[3], GV_KEY_ID);
});

test("canonical string timestamp is verbatim in line 5", () => {
  const lines = GV_CANONICAL.split("\n");
  assert.strictEqual(lines[4], GV_TIMESTAMP);
});

test("canonical string request ID is verbatim in line 6", () => {
  const lines = GV_CANONICAL.split("\n");
  assert.strictEqual(lines[5], GV_REQUEST_ID);
});

test("canonical string body hash is verbatim in line 7", () => {
  const lines = GV_CANONICAL.split("\n");
  assert.strictEqual(lines[6], GV_BODY_HASH);
});

// ─── Raw-body hashing ─────────────────────────────────────────────────────────

test("hashRawBody: known body produces exact known SHA-256", () => {
  assert.strictEqual(hashRawBody(GV_BODY_BUF), GV_BODY_HASH);
});

test("hashRawBody: result is 64-char lowercase hex", () => {
  assert.match(hashRawBody(GV_BODY_BUF), /^[0-9a-f]{64}$/);
});

test("hashRawBody: different raw bytes produce a different hash", () => {
  const other = Buffer.from('{"gatewayBookingId":"different"}');
  assert.notStrictEqual(hashRawBody(other), GV_BODY_HASH);
});

test("hashRawBody: accepts Uint8Array directly", () => {
  const asUint8 = new Uint8Array(GV_BODY_BUF);
  assert.strictEqual(hashRawBody(asUint8), GV_BODY_HASH);
});

// ─── computeInternalHmacSignature — secret-length enforcement ─────────────────

test("computeInternalHmacSignature: exactly 32 bytes accepted", () => {
  const result = computeInternalHmacSignature("test", new Uint8Array(32));
  assert.match(result, /^[0-9a-f]{64}$/);
});

test("computeInternalHmacSignature: 31 bytes throws (no secret material in message)", () => {
  let caught: unknown;
  try {
    computeInternalHmacSignature("test", new Uint8Array(31));
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof Error);
  // Error message must not contain secret material (no long hex or base64 blobs)
  assert.ok(caught.message.length < 200, "Error message should be short and safe");
});

test("computeInternalHmacSignature: 33 bytes throws (no secret material in message)", () => {
  let caught: unknown;
  try {
    computeInternalHmacSignature("test", new Uint8Array(33));
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof Error);
  assert.ok(caught.message.length < 200, "Error message should be short and safe");
});

// ─── isValidInternalKeyId ─────────────────────────────────────────────────────

test("isValidInternalKeyId: 'kc-test-v1' is valid", () => {
  assert.strictEqual(isValidInternalKeyId("kc-test-v1"), true);
});

test("isValidInternalKeyId: single char 'a' is valid", () => {
  assert.strictEqual(isValidInternalKeyId("a"), true);
});

test("isValidInternalKeyId: uppercase 'KC-TEST' is invalid", () => {
  assert.strictEqual(isValidInternalKeyId("KC-TEST"), false);
});

test("isValidInternalKeyId: leading hyphen '-abc' is invalid", () => {
  assert.strictEqual(isValidInternalKeyId("-abc"), false);
});

test("isValidInternalKeyId: trailing hyphen 'abc-' is invalid", () => {
  assert.strictEqual(isValidInternalKeyId("abc-"), false);
});

test("isValidInternalKeyId: whitespace is invalid", () => {
  assert.strictEqual(isValidInternalKeyId("ab cd"), false);
});

test("isValidInternalKeyId: 65-character string is invalid", () => {
  assert.strictEqual(isValidInternalKeyId("a" + "b".repeat(63) + "c"), false);
});

// ─── isInternalTimestampValid ─────────────────────────────────────────────────

test("isInternalTimestampValid: exact now returns true", () => {
  assert.strictEqual(isInternalTimestampValid("1783000000", 1783000000), true);
});

test("isInternalTimestampValid: boundary -300 returns true", () => {
  assert.strictEqual(isInternalTimestampValid("1783000000", 1783000300), true);
});

test("isInternalTimestampValid: boundary +300 returns true", () => {
  assert.strictEqual(isInternalTimestampValid("1783000000", 1782999700), true);
});

test("isInternalTimestampValid: -301 outside tolerance returns false", () => {
  assert.strictEqual(isInternalTimestampValid("1783000000", 1783000301), false);
});

test("isInternalTimestampValid: +301 outside tolerance returns false", () => {
  assert.strictEqual(isInternalTimestampValid("1783000000", 1782999699), false);
});

test("isInternalTimestampValid: literal '0' with nowSeconds=0 returns true", () => {
  assert.strictEqual(isInternalTimestampValid("0", 0), true);
});

test("isInternalTimestampValid: leading zero '01783000000' returns false", () => {
  assert.strictEqual(isInternalTimestampValid("01783000000", 1783000000), false);
});

test("isInternalTimestampValid: plus sign '+1783000000' returns false", () => {
  assert.strictEqual(isInternalTimestampValid("+1783000000", 1783000000), false);
});

test("isInternalTimestampValid: negative '-1' returns false", () => {
  assert.strictEqual(isInternalTimestampValid("-1", 0), false);
});

test("isInternalTimestampValid: decimal '1783000000.0' returns false", () => {
  assert.strictEqual(isInternalTimestampValid("1783000000.0", 1783000000), false);
});

test("isInternalTimestampValid: exponent '1e9' returns false", () => {
  assert.strictEqual(isInternalTimestampValid("1e9", 1000000000), false);
});

test("isInternalTimestampValid: leading whitespace returns false", () => {
  assert.strictEqual(isInternalTimestampValid(" 1783000000", 1783000000), false);
});

test("isInternalTimestampValid: empty string returns false", () => {
  assert.strictEqual(isInternalTimestampValid("", 1783000000), false);
});

test("isInternalTimestampValid: unsafe integer string returns false", () => {
  // Number.MAX_SAFE_INTEGER + 1 as a decimal string
  const unsafe = String(Number.MAX_SAFE_INTEGER + 1);
  assert.strictEqual(isInternalTimestampValid(unsafe, 0), false);
});

test("isInternalTimestampValid: invalid nowSeconds (-1) returns false", () => {
  assert.strictEqual(isInternalTimestampValid("1783000000", -1), false);
});

// ─── isCanonicalRequestId ─────────────────────────────────────────────────────

test("isCanonicalRequestId: golden vector UUID is valid", () => {
  assert.strictEqual(isCanonicalRequestId(GV_REQUEST_ID), true);
});

test("isCanonicalRequestId: uppercase UUID is invalid", () => {
  // Use a UUID that contains hex letters so toUpperCase() changes it
  assert.strictEqual(isCanonicalRequestId("a1b2c3d4-e5f6-7890-abcd-ef1234567890"), true,  "lowercase control must be valid");
  assert.strictEqual(isCanonicalRequestId("A1B2C3D4-E5F6-7890-ABCD-EF1234567890"), false, "uppercase must be invalid");
});

test("isCanonicalRequestId: missing hyphens is invalid", () => {
  assert.strictEqual(isCanonicalRequestId("222222222222422282222222222222222"), false);
});

test("isCanonicalRequestId: extra character is invalid", () => {
  assert.strictEqual(isCanonicalRequestId(GV_REQUEST_ID + "0"), false);
});

test("isCanonicalRequestId: surrounding whitespace is invalid", () => {
  assert.strictEqual(isCanonicalRequestId(" " + GV_REQUEST_ID + " "), false);
});

test("isCanonicalRequestId: empty string is invalid", () => {
  assert.strictEqual(isCanonicalRequestId(""), false);
});

// ─── isValidInternalSignatureShape ───────────────────────────────────────────

test("isValidInternalSignatureShape: valid 64 lowercase hex chars returns true", () => {
  assert.strictEqual(isValidInternalSignatureShape(GV_SIGNATURE), true);
});

test("isValidInternalSignatureShape: 64 uppercase hex chars returns false", () => {
  assert.strictEqual(isValidInternalSignatureShape(GV_SIGNATURE.toUpperCase()), false);
});

test("isValidInternalSignatureShape: 63 chars returns false", () => {
  assert.strictEqual(isValidInternalSignatureShape(GV_SIGNATURE.slice(0, 63)), false);
});

test("isValidInternalSignatureShape: 65 chars returns false", () => {
  assert.strictEqual(isValidInternalSignatureShape(GV_SIGNATURE + "0"), false);
});

test("isValidInternalSignatureShape: non-hex character returns false", () => {
  const nonHex = "g" + GV_SIGNATURE.slice(1);
  assert.strictEqual(isValidInternalSignatureShape(nonHex), false);
});

test("isValidInternalSignatureShape: surrounding whitespace returns false", () => {
  assert.strictEqual(isValidInternalSignatureShape(" " + GV_SIGNATURE), false);
});

// ─── timingSafeSignatureEqual ─────────────────────────────────────────────────

test("timingSafeSignatureEqual: equal same-length lowercase hex strings returns true", () => {
  assert.strictEqual(timingSafeSignatureEqual(GV_SIGNATURE, GV_SIGNATURE), true);
});

test("timingSafeSignatureEqual: unequal same-length lowercase hex strings returns false", () => {
  const different = "0".repeat(64);
  assert.strictEqual(timingSafeSignatureEqual(GV_SIGNATURE, different), false);
});

test("timingSafeSignatureEqual: malformed signature (shape invalid) returns false without comparison", () => {
  // 64-char string with non-hex char — shape is invalid, comparison is skipped
  const malformed = "g" + GV_SIGNATURE.slice(1);
  assert.strictEqual(timingSafeSignatureEqual(GV_SIGNATURE, malformed), false);
});

test("timingSafeSignatureEqual: different-length strings return false without comparison", () => {
  assert.strictEqual(timingSafeSignatureEqual(GV_SIGNATURE, GV_SIGNATURE.slice(0, 63)), false);
});

// ─── Full verifier: verifyInternalHmac ───────────────────────────────────────

test("verifier: valid golden vector request returns { ok: true }", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeResolve(GV_SECRET_BYTES),
  });
  assert.deepStrictEqual(result, { ok: true });
});

test("verifier: missing keyId returns MISSING_HEADERS", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: undefined,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MISSING_HEADERS" });
});

test("verifier: missing timestamp returns MISSING_HEADERS", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: undefined,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MISSING_HEADERS" });
});

test("verifier: missing requestId returns MISSING_HEADERS", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: undefined,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MISSING_HEADERS" });
});

test("verifier: missing signature returns MISSING_HEADERS", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: undefined,
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MISSING_HEADERS" });
});

test("verifier: malformed key ID (uppercase) returns MALFORMED_KEY_ID", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: "KC-TEST-V1",
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MALFORMED_KEY_ID" });
});

test("verifier: invalid nowSeconds (-1) returns INTERNAL_CLOCK_ERROR; resolver not called", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: -1,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "INTERNAL_CLOCK_ERROR" });
});

test("verifier: non-numeric timestamp returns MALFORMED_TIMESTAMP", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: "not-a-number",
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MALFORMED_TIMESTAMP" });
});

test("verifier: stale timestamp (now - 301) returns STALE_TIMESTAMP", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000 + 301,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "STALE_TIMESTAMP" });
});

test("verifier: future timestamp (now + 301) returns STALE_TIMESTAMP", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000 - 301,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "STALE_TIMESTAMP" });
});

test("verifier: uppercase UUID request ID returns MALFORMED_REQUEST_ID", () => {
  // Use a UUID with letters so toUpperCase() produces a genuinely uppercase value
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MALFORMED_REQUEST_ID" });
});

test("verifier: uppercase hex signature returns MALFORMED_SIGNATURE", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE.toUpperCase(),
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MALFORMED_SIGNATURE" });
});

test("verifier: 63-character signature returns MALFORMED_SIGNATURE", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE.slice(0, 63),
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MALFORMED_SIGNATURE" });
});

test("verifier: unknown key ID returns UNKNOWN_KEY", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeUnknownResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "UNKNOWN_KEY" });
});

test("verifier: resolver returning non-32-byte secret returns INTERNAL_SECRET_ERROR", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeNonStandardLengthResolve(16),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "INTERNAL_SECRET_ERROR" });
});

test("verifier: wrong valid-shape signature returns INVALID_SIGNATURE", () => {
  const wrongSig = "0".repeat(64);
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: wrongSig,
    nowSeconds: 1783000000,
    resolveSecret: makeResolve(GV_SECRET_BYTES),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "INVALID_SIGNATURE" });
});

// ─── Ordering proofs ──────────────────────────────────────────────────────────

test("verifier ordering: resolver not called for malformed key ID", () => {
  // If resolver were called, it would throw and the test would fail
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: "BAD_KEY",
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MALFORMED_KEY_ID" });
});

test("verifier ordering: resolver not called for invalid nowSeconds", () => {
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: -1,
    resolveSecret: makeThrowingResolve(),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "INTERNAL_CLOCK_ERROR" });
});

test("verifier ordering: no HMAC comparison after INTERNAL_SECRET_ERROR", () => {
  // Resolver returns a 0-byte secret — step 9 catches it before step 10
  const result = verifyInternalHmac({
    rawBody: GV_BODY_BUF,
    keyId: GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
    resolveSecret: makeNonStandardLengthResolve(0),
  });
  // If step 10 were reached, computeInternalHmacSignature(_, 0-byte key) would
  // throw. The fact that we get INTERNAL_SECRET_ERROR (not a throw) proves
  // step 9 intercepted it before any HMAC operation.
  assert.deepStrictEqual(result, { ok: false, reason: "INTERNAL_SECRET_ERROR" });
});

// ─── Option C seam tests ──────────────────────────────────────────────────────
//
// These tests exercise the two new split functions independently and verify
// that the composition (verifyInternalHmac) still produces identical results
// to the original 129-test implementation.

// Helper: turn the golden vector into a ValidatedHmacMetadata
// (GV_SECRET_BYTES and GV_BODY_BUF are declared earlier in this file;
//  Buffer extends Uint8Array so they can be passed to Uint8Array parameters directly.)
const GV_METADATA: ValidatedHmacMetadata = {
  keyId:     GV_KEY_ID,
  timestamp: GV_TIMESTAMP,
  requestId: GV_REQUEST_ID,
  signature: GV_SIGNATURE,
};

// ── prevalidateInternalHmacHeaders ───────────────────────────────────────────

test("prevalidate: golden vector headers → { ok: true, metadata }", () => {
  const result = prevalidateInternalHmacHeaders({
    keyId:     GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
  });
  assert.ok(result.ok);
  assert.deepStrictEqual(result.metadata, GV_METADATA);
});

test("prevalidate: missing keyId → MISSING_HEADERS", () => {
  const result = prevalidateInternalHmacHeaders({
    keyId:     undefined,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MISSING_HEADERS" });
});

test("prevalidate: empty keyId → MISSING_HEADERS", () => {
  const result = prevalidateInternalHmacHeaders({
    keyId:     "",
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MISSING_HEADERS" });
});

test("prevalidate: malformed keyId → MALFORMED_KEY_ID", () => {
  const result = prevalidateInternalHmacHeaders({
    keyId:     "UPPERCASE-KEY",
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MALFORMED_KEY_ID" });
});

test("prevalidate: stale timestamp → STALE_TIMESTAMP", () => {
  const result = prevalidateInternalHmacHeaders({
    keyId:     GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000 + 301, // 301 s ahead → stale
  });
  assert.deepStrictEqual(result, { ok: false, reason: "STALE_TIMESTAMP" });
});

test("prevalidate: malformed request ID → MALFORMED_REQUEST_ID", () => {
  const result = prevalidateInternalHmacHeaders({
    keyId:     GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: "not-a-uuid",
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000,
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MALFORMED_REQUEST_ID" });
});

test("prevalidate: malformed signature shape → MALFORMED_SIGNATURE", () => {
  const result = prevalidateInternalHmacHeaders({
    keyId:     GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: "tooshort",
    nowSeconds: 1783000000,
  });
  assert.deepStrictEqual(result, { ok: false, reason: "MALFORMED_SIGNATURE" });
});

// Freshness boundary: exactly ±300 s is acceptable
test("prevalidate: timestamp exactly 300 s in past → ok", () => {
  const result = prevalidateInternalHmacHeaders({
    keyId:     GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000 + 300,
  });
  assert.ok(result.ok);
});

test("prevalidate: timestamp exactly 300 s in future → ok", () => {
  const result = prevalidateInternalHmacHeaders({
    keyId:     GV_KEY_ID,
    timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE,
    nowSeconds: 1783000000 - 300,
  });
  assert.ok(result.ok);
});

// ── verifyInternalHmacAfterPrevalidation ─────────────────────────────────────

test("verifyAfterPrevalidation: golden vector → { ok: true }", () => {
  const result = verifyInternalHmacAfterPrevalidation({
    rawBody:     GV_BODY_BUF,
    metadata:    GV_METADATA,
    secretBytes: GV_SECRET_BYTES,
  });
  assert.deepStrictEqual(result, { ok: true });
});

test("verifyAfterPrevalidation: 31-byte secret → INTERNAL_SECRET_ERROR", () => {
  const result = verifyInternalHmacAfterPrevalidation({
    rawBody:     GV_BODY_BUF,
    metadata:    GV_METADATA,
    secretBytes: new Uint8Array(31),
  });
  assert.deepStrictEqual(result, { ok: false, reason: "INTERNAL_SECRET_ERROR" });
});

test("verifyAfterPrevalidation: wrong secret (all zeros) → INVALID_SIGNATURE", () => {
  const result = verifyInternalHmacAfterPrevalidation({
    rawBody:     GV_BODY_BUF,
    metadata:    GV_METADATA,
    secretBytes: new Uint8Array(32), // 32 zero bytes ≠ GV secret
  });
  assert.deepStrictEqual(result, { ok: false, reason: "INVALID_SIGNATURE" });
});

test("verifyAfterPrevalidation: body tampered → INVALID_SIGNATURE", () => {
  const tampered = Buffer.from(GV_BODY_STR + "x");
  const result = verifyInternalHmacAfterPrevalidation({
    rawBody:     tampered,
    metadata:    GV_METADATA,
    secretBytes: GV_SECRET_BYTES,
  });
  assert.deepStrictEqual(result, { ok: false, reason: "INVALID_SIGNATURE" });
});

// ── Composition property: verifyInternalHmac == pre + lookup + after ──────────

test("composition: verifyInternalHmac golden vector matches composed result", () => {
  const composed = verifyInternalHmacAfterPrevalidation({
    rawBody:     GV_BODY_BUF,
    metadata:    GV_METADATA,
    secretBytes: GV_SECRET_BYTES,
  });
  const full = verifyInternalHmac({
    rawBody:       GV_BODY_BUF,
    keyId:         GV_KEY_ID,
    timestamp:     GV_TIMESTAMP,
    requestId:     GV_REQUEST_ID,
    signature:     GV_SIGNATURE,
    nowSeconds:    1783000000,
    resolveSecret: () => ({ found: true, secretBytes: GV_SECRET_BYTES }),
  });
  assert.deepStrictEqual(composed, full);
});

test("composition: prevalidate failure propagates identically through verifyInternalHmac", () => {
  // Stale timestamp → both approaches should give STALE_TIMESTAMP
  const preResult = prevalidateInternalHmacHeaders({
    keyId: GV_KEY_ID, timestamp: GV_TIMESTAMP, requestId: GV_REQUEST_ID,
    signature: GV_SIGNATURE, nowSeconds: 1783009999,
  });
  const fullResult = verifyInternalHmac({
    rawBody: GV_BODY_BUF, keyId: GV_KEY_ID, timestamp: GV_TIMESTAMP,
    requestId: GV_REQUEST_ID, signature: GV_SIGNATURE, nowSeconds: 1783009999,
    resolveSecret: () => ({ found: true, secretBytes: GV_SECRET_BYTES }),
  });
  assert.deepStrictEqual(preResult, { ok: false, reason: "STALE_TIMESTAMP" });
  assert.deepStrictEqual(fullResult, { ok: false, reason: "STALE_TIMESTAMP" });
});
