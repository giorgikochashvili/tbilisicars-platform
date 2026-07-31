/**
 * rbg-core-intake-secrets.test.ts
 *
 * C3a unit tests — pure secret-configuration parser (14 tests, SC-1 to SC-14).
 *
 * No process.env mutation. No live DB. No Resend.
 *
 * Each throwing test asserts:
 *   - the error class (instanceof)
 *   - the exact kind property
 *   - non-leakage (raw input / received field values absent from message)
 *
 * Run via:
 *   node --import tsx --test src/test/unit/rbg-core-intake-secrets.test.ts
 */

import { test } from "node:test";
import assert   from "node:assert/strict";

import {
  parseRbgCoreIntakeSecrets,
  RbgCoreIntakeSecretsParseError,
} from "../../lib/rbg-core-intake-secrets.js";
import {
  IntegrationSecretConfigError,
} from "../../lib/integration-secret-store.js";

// ── Test constants ────────────────────────────────────────────────────────────

// Valid standard-Base64 string encoding exactly 32 bytes (32 zero bytes).
const VALID_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// A second valid key for 2-entry tests.
const VALID_JSON_2_ENTRIES = JSON.stringify([
  { keyId: "test-key",  secretBase64: VALID_B64 },
  { keyId: "other-key", secretBase64: VALID_B64 },
]);

// ── SC-1: undefined → MISSING_CONFIG ─────────────────────────────────────────

test("SC-1: raw=undefined → RbgCoreIntakeSecretsParseError MISSING_CONFIG", () => {
  assert.throws(
    () => parseRbgCoreIntakeSecrets(undefined),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "MISSING_CONFIG");
      return true;
    },
  );
});

// ── SC-2: empty string → MISSING_CONFIG ──────────────────────────────────────

test("SC-2: raw='' → RbgCoreIntakeSecretsParseError MISSING_CONFIG", () => {
  assert.throws(
    () => parseRbgCoreIntakeSecrets(""),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "MISSING_CONFIG");
      return true;
    },
  );
});

// ── SC-3: invalid JSON → INVALID_JSON; raw value absent from message ──────────

test("SC-3: raw='not json!!!' → RbgCoreIntakeSecretsParseError INVALID_JSON; raw absent", () => {
  const raw = "not json!!!";
  assert.throws(
    () => parseRbgCoreIntakeSecrets(raw),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "INVALID_JSON");
      assert.ok(!err.message.includes(raw), "raw JSON must not appear in error message");
      return true;
    },
  );
});

// ── SC-4: non-array root → INVALID_SHAPE ─────────────────────────────────────

test("SC-4: raw='{}' (object, not array) → RbgCoreIntakeSecretsParseError INVALID_SHAPE", () => {
  assert.throws(
    () => parseRbgCoreIntakeSecrets("{}"),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "INVALID_SHAPE");
      return true;
    },
  );
});

// ── SC-5: null entry → INVALID_SHAPE ─────────────────────────────────────────

test("SC-5: array entry is null → RbgCoreIntakeSecretsParseError INVALID_SHAPE", () => {
  assert.throws(
    () => parseRbgCoreIntakeSecrets("[null]"),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "INVALID_SHAPE");
      return true;
    },
  );
});

// ── SC-6: array entry is array → INVALID_SHAPE ───────────────────────────────

test("SC-6: array entry is [] → RbgCoreIntakeSecretsParseError INVALID_SHAPE", () => {
  assert.throws(
    () => parseRbgCoreIntakeSecrets("[[]]"),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "INVALID_SHAPE");
      return true;
    },
  );
});

// ── SC-7: entry missing keyId → INVALID_SHAPE ────────────────────────────────

test("SC-7: entry missing keyId → RbgCoreIntakeSecretsParseError INVALID_SHAPE", () => {
  const raw = JSON.stringify([{ secretBase64: VALID_B64 }]);
  assert.throws(
    () => parseRbgCoreIntakeSecrets(raw),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "INVALID_SHAPE");
      return true;
    },
  );
});

// ── SC-8: entry missing secretBase64 → INVALID_SHAPE ─────────────────────────

test("SC-8: entry missing secretBase64 → RbgCoreIntakeSecretsParseError INVALID_SHAPE", () => {
  const raw = JSON.stringify([{ keyId: "test-key" }]);
  assert.throws(
    () => parseRbgCoreIntakeSecrets(raw),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "INVALID_SHAPE");
      return true;
    },
  );
});

// ── SC-9: entry has extra field → INVALID_SHAPE ───────────────────────────────

test("SC-9: entry has extra field → RbgCoreIntakeSecretsParseError INVALID_SHAPE", () => {
  const raw = JSON.stringify([
    { keyId: "test-key", secretBase64: VALID_B64, extra: true },
  ]);
  assert.throws(
    () => parseRbgCoreIntakeSecrets(raw),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError);
      assert.strictEqual(err.kind, "INVALID_SHAPE");
      return true;
    },
  );
});

// ── SC-10: non-string keyId → INVALID_SHAPE (not INVALID_KEY_ID) ─────────────

test("SC-10: non-string keyId (number 123) → RbgCoreIntakeSecretsParseError INVALID_SHAPE", () => {
  const raw = JSON.stringify([{ keyId: 123, secretBase64: VALID_B64 }]);
  assert.throws(
    () => parseRbgCoreIntakeSecrets(raw),
    (err: unknown) => {
      assert.ok(err instanceof RbgCoreIntakeSecretsParseError,
        "must throw RbgCoreIntakeSecretsParseError, not IntegrationSecretConfigError");
      assert.strictEqual(err.kind, "INVALID_SHAPE");
      return true;
    },
  );
});

// ── SC-11: valid 2-entry JSON → returns IntegrationSecretStore ───────────────

test("SC-11: valid 2-entry JSON → returns IntegrationSecretStore; size=2; both keys resolvable", () => {
  const store = parseRbgCoreIntakeSecrets(VALID_JSON_2_ENTRIES);

  assert.strictEqual(store.size, 2, "store size must be 2");

  const r1 = store.lookup("test-key");
  assert.strictEqual(r1.found, true, "test-key must be found");

  const r2 = store.lookup("other-key");
  assert.strictEqual(r2.found, true, "other-key must be found");

  const rMiss = store.lookup("not-configured");
  assert.strictEqual(rMiss.found, false, "non-configured key must not be found");
});

// ── SC-12: duplicate keyId → IntegrationSecretConfigError DUPLICATE_KEY_ID ───

test("SC-12: duplicate keyId → IntegrationSecretConfigError DUPLICATE_KEY_ID (not INVALID_SHAPE)", () => {
  const raw = JSON.stringify([
    { keyId: "dup-key", secretBase64: VALID_B64 },
    { keyId: "dup-key", secretBase64: VALID_B64 },
  ]);
  assert.throws(
    () => parseRbgCoreIntakeSecrets(raw),
    (err: unknown) => {
      assert.ok(err instanceof IntegrationSecretConfigError,
        "must throw IntegrationSecretConfigError, not RbgCoreIntakeSecretsParseError");
      assert.strictEqual(err.kind, "DUPLICATE_KEY_ID");
      return true;
    },
  );
});

// ── SC-13: invalid Base64 → IntegrationSecretConfigError INVALID_BASE64 ──────

test("SC-13: invalid Base64 secretBase64 → IntegrationSecretConfigError INVALID_BASE64 (not INVALID_SHAPE)", () => {
  const raw = JSON.stringify([
    { keyId: "test-key", secretBase64: "not-valid-base64!!!" },
  ]);
  assert.throws(
    () => parseRbgCoreIntakeSecrets(raw),
    (err: unknown) => {
      assert.ok(err instanceof IntegrationSecretConfigError,
        "must throw IntegrationSecretConfigError, not RbgCoreIntakeSecretsParseError");
      assert.strictEqual(err.kind, "INVALID_BASE64");
      return true;
    },
  );
});

// ── SC-14: non-leakage assertions on error messages ───────────────────────────

test("SC-14: error messages must not contain raw JSON or received field values", () => {
  // INVALID_JSON: raw JSON string must not appear in message
  const rawJson = "this is definitely not json !!!";
  let caughtJson: RbgCoreIntakeSecretsParseError | undefined;
  try {
    parseRbgCoreIntakeSecrets(rawJson);
  } catch (err) {
    if (err instanceof RbgCoreIntakeSecretsParseError) {
      caughtJson = err;
    }
  }
  assert.ok(caughtJson !== undefined, "must throw for invalid JSON");
  assert.strictEqual(caughtJson.kind, "INVALID_JSON");
  assert.ok(
    !caughtJson.message.includes(rawJson),
    "INVALID_JSON message must not contain the raw JSON string",
  );

  // INVALID_SHAPE (extra field): field name and value must not appear in message
  const rawExtra = JSON.stringify([
    { keyId: "test-key", secretBase64: VALID_B64, secretFieldNameShouldNotLeak: "secretValueShouldNotLeak" },
  ]);
  let caughtShape: RbgCoreIntakeSecretsParseError | undefined;
  try {
    parseRbgCoreIntakeSecrets(rawExtra);
  } catch (err) {
    if (err instanceof RbgCoreIntakeSecretsParseError) {
      caughtShape = err;
    }
  }
  assert.ok(caughtShape !== undefined, "must throw for extra field");
  assert.strictEqual(caughtShape.kind, "INVALID_SHAPE");
  assert.ok(
    !caughtShape.message.includes("secretFieldNameShouldNotLeak"),
    "INVALID_SHAPE message must not contain received field name",
  );
  assert.ok(
    !caughtShape.message.includes("secretValueShouldNotLeak"),
    "INVALID_SHAPE message must not contain received field value",
  );
});
