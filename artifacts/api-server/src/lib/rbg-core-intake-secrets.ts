/**
 * rbg-core-intake-secrets.ts
 *
 * C3a: Pure secret-configuration parser for the Regional Brands Gateway intake
 * pipeline.
 *
 * Accepts raw string | undefined and returns a validated IntegrationSecretStore.
 * Fully stateless. No process.env access, no logging, no side effects.
 *
 * Error taxonomy:
 *   RbgCoreIntakeSecretsParseError (MISSING_CONFIG | INVALID_JSON | INVALID_SHAPE)
 *     — thrown for outer structural failures before key/secret validation.
 *
 *   IntegrationSecretConfigError (INVALID_KEY_ID | INVALID_BASE64 |
 *     WRONG_SECRET_LENGTH | DUPLICATE_KEY_ID | EMPTY_CONFIG)
 *     — propagated as-is from createIntegrationSecretStore; never re-wrapped.
 *
 * No raw JSON, key IDs, secrets, decoded bytes, or received field values
 * ever appear in error messages.
 */

import {
  createIntegrationSecretStore,
} from "./integration-secret-store.js";
import type { IntegrationSecretStore } from "./integration-secret-store.js";

// ── Exported error class ──────────────────────────────────────────────────────

/**
 * Thrown by parseRbgCoreIntakeSecrets when the raw input fails outer structural
 * validation (missing config, unparseable JSON, or invalid array/object shape).
 *
 * Does NOT cover key ID or secret material validation — those errors are
 * propagated as IntegrationSecretConfigError from createIntegrationSecretStore.
 */
export class RbgCoreIntakeSecretsParseError extends Error {
  readonly kind:
    | "MISSING_CONFIG"   // raw is undefined or blank after trim
    | "INVALID_JSON"     // JSON.parse threw SyntaxError
    | "INVALID_SHAPE";   // root is not an array, or an entry is not a plain
                         // object with exactly { keyId: string, secretBase64: string }

  constructor(
    kind: RbgCoreIntakeSecretsParseError["kind"],
    message: string,
  ) {
    super(message);
    this.name = "RbgCoreIntakeSecretsParseError";
    this.kind = kind;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Exported parser ───────────────────────────────────────────────────────────

/**
 * Parse and strictly validate the raw RBG secrets configuration string.
 *
 * Validation steps:
 *   1. raw is not undefined or blank                → MISSING_CONFIG
 *   2. JSON.parse(raw) succeeds                    → INVALID_JSON
 *   3. parsed value is an Array                    → INVALID_SHAPE
 *   4. each element is a non-null, non-array object → INVALID_SHAPE
 *   5. each element has a string "keyId" field      → INVALID_SHAPE
 *   6. each element has a string "secretBase64" field → INVALID_SHAPE
 *   7. each element has no extra fields             → INVALID_SHAPE
 *   8. delegate to createIntegrationSecretStore     → propagates IntegrationSecretConfigError
 */
export function parseRbgCoreIntakeSecrets(
  raw: string | undefined,
): IntegrationSecretStore {
  // Step 1: missing or blank
  if (raw === undefined || raw.trim() === "") {
    throw new RbgCoreIntakeSecretsParseError(
      "MISSING_CONFIG",
      "RBG secrets configuration is missing or blank.",
    );
  }

  // Step 2: JSON.parse — never attach the native SyntaxError as cause
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RbgCoreIntakeSecretsParseError(
      "INVALID_JSON",
      "RBG secrets configuration is not valid JSON.",
    );
  }

  // Step 3: must be an array
  if (!Array.isArray(parsed)) {
    throw new RbgCoreIntakeSecretsParseError(
      "INVALID_SHAPE",
      "RBG secrets configuration must be a JSON array.",
    );
  }

  // Steps 4–7: validate each entry
  for (const entry of parsed) {
    // Step 4: non-null, non-array object
    if (entry === null || Array.isArray(entry) || typeof entry !== "object") {
      throw new RbgCoreIntakeSecretsParseError(
        "INVALID_SHAPE",
        "Each RBG secrets entry must be a plain object.",
      );
    }

    const obj = entry as Record<string, unknown>;

    // Step 5: keyId present and string
    if (
      !Object.prototype.hasOwnProperty.call(obj, "keyId") ||
      typeof obj["keyId"] !== "string"
    ) {
      throw new RbgCoreIntakeSecretsParseError(
        "INVALID_SHAPE",
        "Each RBG secrets entry must have a string keyId field.",
      );
    }

    // Step 6: secretBase64 present and string
    if (
      !Object.prototype.hasOwnProperty.call(obj, "secretBase64") ||
      typeof obj["secretBase64"] !== "string"
    ) {
      throw new RbgCoreIntakeSecretsParseError(
        "INVALID_SHAPE",
        "Each RBG secrets entry must have a string secretBase64 field.",
      );
    }

    // Step 7: no extra fields (exactly keyId and secretBase64)
    const keys = Object.keys(obj);
    if (keys.length !== 2) {
      throw new RbgCoreIntakeSecretsParseError(
        "INVALID_SHAPE",
        "Each RBG secrets entry must contain exactly keyId and secretBase64.",
      );
    }
  }

  // Step 8: delegate — propagate IntegrationSecretConfigError as-is
  const entries = (parsed as Array<Record<string, unknown>>).map((e) => ({
    keyId:        e["keyId"]        as string,
    secretBase64: e["secretBase64"] as string,
  }));

  return createIntegrationSecretStore(entries);
}
