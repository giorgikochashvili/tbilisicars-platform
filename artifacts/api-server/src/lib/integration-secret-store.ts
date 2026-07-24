/**
 * Runtime integration-secret store for the Regional Brands Gateway (HOP B).
 *
 * Holds only validated key IDs and validated 32-byte secret byte arrays.
 * Contains no active/disabled status, no database state, no brand metadata.
 *
 * The future integration_client database table remains the sole authority for
 * active or disabled client status. The runtime store is unaware of that
 * distinction.
 *
 * No logging anywhere in this module. No process.env access.
 */

const KEY_ID_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * General canonical standard-Base64 syntax check.
 *
 * Accepts groups of 4 chars, optionally followed by either a 2-char + "==" group
 * or a 3-char + "=" group. This allows values that decode to 31 bytes (ending
 * "=="), 32 bytes (ending "="), or 33 bytes (no trailing padding on the last
 * full group), so WRONG_SECRET_LENGTH remains reachable and distinguishable
 * from INVALID_BASE64 after decoding.
 *
 * The empty string is rejected separately before this regex is applied.
 * URL-safe characters ("-", "_") and whitespace are also rejected before
 * this regex is applied.
 */
const BASE64_GENERAL_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface RawSecretEntry {
  /** Key ID in the format ^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$ */
  keyId: string;
  /** Canonical standard Base64 representing exactly 32 bytes. */
  secretBase64: string;
}

export type SecretLookupResult =
  | { found: true; secretBytes: Uint8Array }
  | { found: false; reason: "unknown_key" };

export interface IntegrationSecretStore {
  /**
   * Returns a fresh defensive copy of the secret bytes for the given key ID.
   * Never returns the internally stored array by reference.
   * Callers may zero their returned copy; the internal store is unaffected.
   */
  lookup(keyId: string): SecretLookupResult;

  /**
   * Returns a new sorted defensive array of all configured key IDs.
   * Enables exact set comparison with the future database active-client list.
   * Never exposes secret bytes. Never automatically logged.
   * Key IDs must not appear in thrown error messages.
   * Expose only to trusted internal startup code.
   */
  getConfiguredKeyIds(): readonly string[];

  /** Count of loaded entries — for a future startup layer's use only. */
  readonly size: number;
}

/** Thrown by createIntegrationSecretStore on any configuration failure. */
export class IntegrationSecretConfigError extends Error {
  readonly kind:
    | "INVALID_KEY_ID"
    | "INVALID_BASE64"
    | "WRONG_SECRET_LENGTH"
    | "DUPLICATE_KEY_ID"
    | "EMPTY_CONFIG";

  constructor(
    kind: IntegrationSecretConfigError["kind"],
    message: string,
  ) {
    super(message);
    this.name = "IntegrationSecretConfigError";
    this.kind = kind;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Validate a Base64 secret string and return its decoded bytes.
 * Uses the 8-step validation process: empty check, whitespace rejection,
 * URL-safe character rejection, general Base64 syntax check, decode,
 * round-trip re-encode equality check, and exact 32-byte length check.
 *
 * Throws IntegrationSecretConfigError. Error messages never contain the
 * input value, key IDs, or decoded bytes.
 */
function validateBase64Secret(secretBase64: string): Uint8Array {
  // Step 1: Reject empty string
  if (secretBase64.length === 0) {
    throw new IntegrationSecretConfigError(
      "INVALID_BASE64",
      "Secret Base64 value is empty.",
    );
  }

  // Step 2: Reject whitespace anywhere
  if (/\s/.test(secretBase64)) {
    throw new IntegrationSecretConfigError(
      "INVALID_BASE64",
      "Secret Base64 value contains whitespace.",
    );
  }

  // Step 3: Reject URL-safe characters ("-" and "_")
  if (secretBase64.includes("-") || secretBase64.includes("_")) {
    throw new IntegrationSecretConfigError(
      "INVALID_BASE64",
      "Secret Base64 value contains URL-safe characters.",
    );
  }

  // Step 4: Validate general canonical standard-Base64 syntax and padding
  if (!BASE64_GENERAL_REGEX.test(secretBase64)) {
    throw new IntegrationSecretConfigError(
      "INVALID_BASE64",
      "Secret Base64 value has invalid syntax or padding.",
    );
  }

  // Step 5: Decode
  const decoded = Buffer.from(secretBase64, "base64");

  // Step 6: Re-encode and require exact string equality (canonical round-trip)
  const reEncoded = decoded.toString("base64");
  if (reEncoded !== secretBase64) {
    throw new IntegrationSecretConfigError(
      "INVALID_BASE64",
      "Secret Base64 value is not in canonical form.",
    );
  }

  // Steps 7–8: Check decoded byte length — exactly 32 bytes required
  if (decoded.length !== 32) {
    throw new IntegrationSecretConfigError(
      "WRONG_SECRET_LENGTH",
      `Secret decoded to ${decoded.length.toString()} bytes; exactly 32 are required.`,
    );
  }

  return new Uint8Array(decoded);
}

/**
 * Validate and store integration secrets.
 * Throws IntegrationSecretConfigError on any validation failure.
 * Performs no logging.
 */
export function createIntegrationSecretStore(
  entries: RawSecretEntry[],
): IntegrationSecretStore {
  if (entries.length === 0) {
    throw new IntegrationSecretConfigError(
      "EMPTY_CONFIG",
      "Integration secret store requires at least one entry.",
    );
  }

  // Private map — held in closure, never exposed by reference
  const store = new Map<string, Uint8Array>();

  for (const entry of entries) {
    // Validate key ID
    if (!KEY_ID_REGEX.test(entry.keyId)) {
      throw new IntegrationSecretConfigError(
        "INVALID_KEY_ID",
        "An entry contains an invalid key ID.",
      );
    }

    // Check for duplicate key ID
    if (store.has(entry.keyId)) {
      throw new IntegrationSecretConfigError(
        "DUPLICATE_KEY_ID",
        "Duplicate key ID encountered in integration secret configuration.",
      );
    }

    // Validate and decode secret — errors contain no key ID or secret material
    const secretBytes = validateBase64Secret(entry.secretBase64);
    store.set(entry.keyId, secretBytes);
  }

  return {
    lookup(keyId: string): SecretLookupResult {
      const stored = store.get(keyId);
      if (stored === undefined) {
        return { found: false, reason: "unknown_key" };
      }
      // Return a fresh defensive copy — never the stored reference
      return { found: true, secretBytes: new Uint8Array(stored) };
    },

    getConfiguredKeyIds(): readonly string[] {
      // New array every call; sorted for deterministic set comparison
      return [...store.keys()].sort();
    },

    get size(): number {
      return store.size;
    },
  };
}
