/**
 * Unit tests for integration-secret-store.ts
 *
 * No secret arrays printed in assertion failure output.
 * No process.env mutation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createIntegrationSecretStore,
  IntegrationSecretConfigError,
} from "../../lib/integration-secret-store.js";

// ─── Test fixtures ────────────────────────────────────────────────────────────

// Golden vector secret: 32 sequential bytes 00..1f
const VALID_KEY_ID = "kc-test-v1";
const VALID_BASE64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";

// A second valid secret: 32 zero bytes (all A's, one trailing "=")
const VALID_KEY_ID_2 = "kc-test-v2";
const VALID_BASE64_ZERO = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// Canonical 31-byte Base64 (ends "=="): 10 groups of AAAA (40 chars) + AA== = 44 chars total
// Buffer.alloc(31).toString("base64") === "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="
const BASE64_31_BYTES = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

// Canonical 33-byte Base64 (no padding): 11 groups of AAAA = 44 chars total
// Buffer.alloc(33).toString("base64") === "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const BASE64_33_BYTES = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

// Non-canonical: valid shape, decodes 32 bytes, but last data char has
// non-zero padding bits — Buffer.from accepts it, re-encode gives different char
// "8" (base64 index 60 = 0b111100, lower 2 bits 00) → "9" (index 61 = 0b111101)
const BASE64_NONCANONICAL = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh9=";

// 64-character key ID (maximum valid: 1 + 62 + 1)
const KEY_ID_64 = "a" + "b".repeat(62) + "c";

// 65-character key ID (one over maximum)
const KEY_ID_65 = "a" + "b".repeat(63) + "c";

// ─── Helper ───────────────────────────────────────────────────────────────────

function assertConfigError(
  fn: () => unknown,
  expectedKind: InstanceType<typeof IntegrationSecretConfigError>["kind"],
): IntegrationSecretConfigError {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  assert.ok(caught instanceof IntegrationSecretConfigError, "Expected IntegrationSecretConfigError");
  assert.strictEqual(caught.kind, expectedKind);
  return caught;
}

// ─── Construction — valid cases ───────────────────────────────────────────────

test("valid canonical 32-byte secret constructs successfully; lookup returns found: true", () => {
  const store = createIntegrationSecretStore([
    { keyId: VALID_KEY_ID, secretBase64: VALID_BASE64 },
  ]);
  const result = store.lookup(VALID_KEY_ID);
  assert.strictEqual(result.found, true);
  if (result.found) {
    assert.strictEqual(result.secretBytes.length, 32);
  }
});

test("valid one-character key ID is accepted", () => {
  const store = createIntegrationSecretStore([
    { keyId: "a", secretBase64: VALID_BASE64 },
  ]);
  assert.strictEqual(store.lookup("a").found, true);
});

test("valid 64-character key ID is accepted", () => {
  const store = createIntegrationSecretStore([
    { keyId: KEY_ID_64, secretBase64: VALID_BASE64 },
  ]);
  assert.strictEqual(store.lookup(KEY_ID_64).found, true);
});

// ─── Construction — key-ID rejection ─────────────────────────────────────────

test("65-character key ID throws INVALID_KEY_ID", () => {
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: KEY_ID_65, secretBase64: VALID_BASE64 }]),
    "INVALID_KEY_ID",
  );
});

test("empty key ID throws INVALID_KEY_ID", () => {
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: "", secretBase64: VALID_BASE64 }]),
    "INVALID_KEY_ID",
  );
});

test("uppercase key ID throws INVALID_KEY_ID", () => {
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: "KC-TEST", secretBase64: VALID_BASE64 }]),
    "INVALID_KEY_ID",
  );
});

test("leading-hyphen key ID throws INVALID_KEY_ID", () => {
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: "-abc", secretBase64: VALID_BASE64 }]),
    "INVALID_KEY_ID",
  );
});

test("trailing-hyphen key ID throws INVALID_KEY_ID", () => {
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: "abc-", secretBase64: VALID_BASE64 }]),
    "INVALID_KEY_ID",
  );
});

test("whitespace in key ID throws INVALID_KEY_ID", () => {
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: "ab cd", secretBase64: VALID_BASE64 }]),
    "INVALID_KEY_ID",
  );
});

// ─── Construction — configuration rejection ───────────────────────────────────

test("duplicate key ID throws DUPLICATE_KEY_ID", () => {
  assertConfigError(
    () => createIntegrationSecretStore([
      { keyId: VALID_KEY_ID, secretBase64: VALID_BASE64 },
      { keyId: VALID_KEY_ID, secretBase64: VALID_BASE64_ZERO },
    ]),
    "DUPLICATE_KEY_ID",
  );
});

test("empty configuration [] throws EMPTY_CONFIG", () => {
  assertConfigError(() => createIntegrationSecretStore([]), "EMPTY_CONFIG");
});

// ─── Construction — Base64 rejection (INVALID_BASE64) ────────────────────────

test("missing padding (= removed) throws INVALID_BASE64", () => {
  // Remove the trailing "=" from the valid 32-byte value
  const noPad = VALID_BASE64.slice(0, -1);
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: noPad }]),
    "INVALID_BASE64",
  );
});

test("extra padding throws INVALID_BASE64", () => {
  // Add an extra "=" to the valid 32-byte value (now "==")
  const extraPad = VALID_BASE64 + "=";
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: extraPad }]),
    "INVALID_BASE64",
  );
});

test("URL-safe '-' character throws INVALID_BASE64", () => {
  // Replace a char in the middle with '-'
  const urlSafe = VALID_BASE64.slice(0, 5) + "-" + VALID_BASE64.slice(6);
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: urlSafe }]),
    "INVALID_BASE64",
  );
});

test("URL-safe '_' character throws INVALID_BASE64", () => {
  const urlSafe = VALID_BASE64.slice(0, 5) + "_" + VALID_BASE64.slice(6);
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: urlSafe }]),
    "INVALID_BASE64",
  );
});

test("internal whitespace throws INVALID_BASE64", () => {
  const withSpace = VALID_BASE64.slice(0, 10) + " " + VALID_BASE64.slice(10);
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: withSpace }]),
    "INVALID_BASE64",
  );
});

test("newline in Base64 value throws INVALID_BASE64", () => {
  const withNewline = VALID_BASE64.slice(0, 10) + "\n" + VALID_BASE64.slice(10);
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: withNewline }]),
    "INVALID_BASE64",
  );
});

test("leading whitespace throws INVALID_BASE64", () => {
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: " " + VALID_BASE64 }]),
    "INVALID_BASE64",
  );
});

test("trailing whitespace throws INVALID_BASE64", () => {
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: VALID_BASE64 + " " }]),
    "INVALID_BASE64",
  );
});

test("invalid alphabet character throws INVALID_BASE64", () => {
  // "!" is not in the Base64 alphabet
  const invalid = VALID_BASE64.slice(0, 5) + "!" + VALID_BASE64.slice(6);
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: invalid }]),
    "INVALID_BASE64",
  );
});

test("non-canonical encoding (accepted by Buffer.from, rejected by round-trip check) throws INVALID_BASE64", () => {
  // VALID_BASE64 with last data char "8" changed to "9" — lower 2 bits non-zero.
  // Buffer.from decodes this the same as "8" (ignores padding bits), but
  // re-encoding gives "8=" not "9=", so round-trip check fails.
  assert.notStrictEqual(BASE64_NONCANONICAL, VALID_BASE64, "test setup: values must differ");
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: BASE64_NONCANONICAL }]),
    "INVALID_BASE64",
  );
});

// ─── Construction — length rejection (WRONG_SECRET_LENGTH) ───────────────────

test("canonical valid Base64 decoding to 31 bytes throws WRONG_SECRET_LENGTH", () => {
  // 31 bytes: 40 A's (10 groups of AAAA) + AA== (1 remaining byte = AA==)
  // = 44 chars ending in "=="
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: BASE64_31_BYTES }]),
    "WRONG_SECRET_LENGTH",
  );
});

test("canonical valid Base64 decoding to 33 bytes throws WRONG_SECRET_LENGTH", () => {
  // 33 bytes: 11 groups of AAAA = 44 chars, no padding
  assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: BASE64_33_BYTES }]),
    "WRONG_SECRET_LENGTH",
  );
});

// ─── Lookup ───────────────────────────────────────────────────────────────────

test("unknown key returns { found: false, reason: 'unknown_key' }", () => {
  const store = createIntegrationSecretStore([
    { keyId: VALID_KEY_ID, secretBase64: VALID_BASE64 },
  ]);
  const result = store.lookup("not-a-real-key");
  assert.strictEqual(result.found, false);
  if (!result.found) {
    assert.strictEqual(result.reason, "unknown_key");
  }
});

test("successful lookup returns Uint8Array with correct bytes", () => {
  const store = createIntegrationSecretStore([
    { keyId: VALID_KEY_ID, secretBase64: VALID_BASE64 },
  ]);
  const result = store.lookup(VALID_KEY_ID);
  assert.strictEqual(result.found, true);
  if (result.found) {
    assert.strictEqual(result.secretBytes instanceof Uint8Array, true);
    assert.strictEqual(result.secretBytes.length, 32);
    // Verify the golden vector bytes: 0x00, 0x01, ..., 0x1f
    for (let i = 0; i < 32; i++) {
      assert.strictEqual(result.secretBytes[i], i, `byte[${i}] should be ${i}`);
    }
  }
});

test("two lookups return equal content in different objects", () => {
  const store = createIntegrationSecretStore([
    { keyId: VALID_KEY_ID, secretBase64: VALID_BASE64 },
  ]);
  const r1 = store.lookup(VALID_KEY_ID);
  const r2 = store.lookup(VALID_KEY_ID);
  assert.strictEqual(r1.found, true);
  assert.strictEqual(r2.found, true);
  if (r1.found && r2.found) {
    // Equal content
    assert.deepStrictEqual(r1.secretBytes, r2.secretBytes);
    // Different objects (defensive copy)
    assert.strictEqual(Object.is(r1.secretBytes, r2.secretBytes), false);
  }
});

test("zeroing one returned copy does not corrupt the stored secret", () => {
  const store = createIntegrationSecretStore([
    { keyId: VALID_KEY_ID, secretBase64: VALID_BASE64 },
  ]);
  const r1 = store.lookup(VALID_KEY_ID);
  assert.strictEqual(r1.found, true);
  if (r1.found) {
    // Zero out the returned copy
    r1.secretBytes.fill(0);
    // A subsequent lookup must still return the correct bytes
    const r2 = store.lookup(VALID_KEY_ID);
    assert.strictEqual(r2.found, true);
    if (r2.found) {
      for (let i = 0; i < 32; i++) {
        assert.strictEqual(r2.secretBytes[i], i, `byte[${i}] should still be ${i} after zeroing copy`);
      }
    }
  }
});

// ─── Reconciliation support ───────────────────────────────────────────────────

test("getConfiguredKeyIds() returns values in sorted order", () => {
  // Insert keys in reverse-alpha order
  const store = createIntegrationSecretStore([
    { keyId: "zzz", secretBase64: VALID_BASE64 },
    { keyId: "aaa", secretBase64: VALID_BASE64_ZERO },
  ]);
  const ids = store.getConfiguredKeyIds();
  assert.deepStrictEqual([...ids], ["aaa", "zzz"]);
});

test("getConfiguredKeyIds() returns a new array on every call", () => {
  const store = createIntegrationSecretStore([
    { keyId: VALID_KEY_ID, secretBase64: VALID_BASE64 },
  ]);
  const ids1 = store.getConfiguredKeyIds();
  const ids2 = store.getConfiguredKeyIds();
  assert.strictEqual(Object.is(ids1, ids2), false);
});

test("mutating the returned key ID array does not affect the stored set", () => {
  const store = createIntegrationSecretStore([
    { keyId: VALID_KEY_ID, secretBase64: VALID_BASE64 },
  ]);
  const ids = store.getConfiguredKeyIds() as string[];
  // Push a spurious entry
  ids.push("injected-key");
  // The store must still report the original count
  assert.strictEqual(store.size, 1);
  assert.strictEqual(store.getConfiguredKeyIds().length, 1);
});

// ─── Error message safety ─────────────────────────────────────────────────────

test("INVALID_KEY_ID error message does not contain the test key ID", () => {
  const badKeyId = "BAD-KEY-ID-UPPERCASE";
  const err = assertConfigError(
    () => createIntegrationSecretStore([{ keyId: badKeyId, secretBase64: VALID_BASE64 }]),
    "INVALID_KEY_ID",
  );
  assert.ok(!err.message.includes(badKeyId), "Error message must not contain the key ID");
});

test("INVALID_BASE64 error message does not contain the Base64 value", () => {
  const err = assertConfigError(
    () => createIntegrationSecretStore([{ keyId: VALID_KEY_ID, secretBase64: BASE64_NONCANONICAL }]),
    "INVALID_BASE64",
  );
  assert.ok(!err.message.includes(BASE64_NONCANONICAL), "Error message must not contain the Base64 value");
});

test("errors expose only bounded kind field", () => {
  const validKinds = new Set([
    "INVALID_KEY_ID",
    "INVALID_BASE64",
    "WRONG_SECRET_LENGTH",
    "DUPLICATE_KEY_ID",
    "EMPTY_CONFIG",
  ]);
  const err = assertConfigError(() => createIntegrationSecretStore([]), "EMPTY_CONFIG");
  assert.ok(validKinds.has(err.kind), `kind "${err.kind}" must be one of the five valid values`);
});
