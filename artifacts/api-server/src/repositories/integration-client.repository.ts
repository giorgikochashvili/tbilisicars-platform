/**
 * integration-client.repository.ts
 *
 * C3a: Enabled-client resolver for the Regional Brands Gateway intake pipeline.
 *
 * Queries integration_client by key_id WHERE disabled_at IS NULL.
 * Returns the canonical brandCode for an enabled client, { found: false } for
 * absent or disabled rows, and re-throws on infrastructure failure.
 *
 * ZERO runtime side effects at import time.
 * No @workspace/db singleton import.
 * No process.env.
 * No logging.
 * No module-level DB work.
 */

import { sql } from "drizzle-orm";
import type { RbgDb } from "./regional-intake.repository.js";

// ── Exported types ────────────────────────────────────────────────────────────

export interface EnabledIntegrationClient {
  found:     true;
  /** Validated canonical brand code — always "batumicars" | "kutaisicars". */
  brandCode: string;
}

export type IntegrationClientLookupResult =
  | EnabledIntegrationClient
  | { found: false };

// ── Module-private constants ──────────────────────────────────────────────────

const CANONICAL_BRANDS = new Set(["batumicars", "kutaisicars"]);

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Async enabled-client resolver.
 *
 * Semantics:
 *   - enabled row with valid brand   → { found: true, brandCode }
 *   - row absent or disabled_at set  → { found: false }
 *   - unexpected brand_code          → throws with a fixed bounded message
 *                                      (raw value never included)
 *   - DB / infrastructure failure    → re-throws; never converts to { found: false }
 */
export async function resolveEnabledIntegrationClient(
  db:    RbgDb,
  keyId: string,
): Promise<IntegrationClientLookupResult> {
  const result = await db.execute(
    sql`SELECT brand_code
        FROM   integration_client
        WHERE  key_id      = ${keyId}
          AND  disabled_at IS NULL
        LIMIT  1`,
  );

  const rows = (
    result as unknown as { rows: Array<Record<string, unknown>> }
  ).rows;

  if (rows.length === 0) {
    return { found: false };
  }

  const brandCode = rows[0]["brand_code"];

  if (typeof brandCode !== "string" || !CANONICAL_BRANDS.has(brandCode)) {
    // Fixed bounded message — raw value never included.
    throw new Error("Unexpected brand_code from integration_client");
  }

  return { found: true, brandCode };
}
