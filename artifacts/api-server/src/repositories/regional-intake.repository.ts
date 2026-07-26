/**
 * regional-intake.repository.ts
 *
 * C2a read-only repository for the Regional Brands Gateway intake pipeline.
 *
 * This file contains ONLY:
 *   - Type-only database executor aliases (zero runtime pool creation)
 *   - lookupGatewayContextsForIdentifiers — combined OR committed-state query
 *   - validateVehicleModelTx             — FOR SHARE read inside a transaction
 *   - validateLocationsTx                — FOR SHARE read inside a transaction
 *
 * No write functions. No customer resolver. No booking writer.
 * No attribution writer. No gateway context writer. No C2b stubs.
 *
 * DATABASE IMPORT RULE:
 *   Do NOT use: import { db } from "@workspace/db"
 *   That is a runtime import that creates a pg.Pool at module load time.
 *   All executor types are imported with `import type` — zero runtime effect.
 */

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@workspace/db/schema";
import type { GatewayBookingContext } from "@workspace/db";

// ── Executor type aliases ─────────────────────────────────────────────────────
//
// These are compile-time aliases only. They produce zero JavaScript output.
// No pool is created. No database connection is opened.

export type RbgDb = NodePgDatabase<typeof schema>;
export type RbgTx = Parameters<Parameters<RbgDb["transaction"]>[0]>[0];

// ── lookupGatewayContextsForIdentifiers ──────────────────────────────────────

/**
 * One combined committed-state OR query for idempotency lookup.
 * Matches rows where:
 *   brand_code = params.brandCode
 *   AND (gateway_booking_id = params.gatewayBookingId::uuid
 *        OR gateway_quote_id = params.gatewayQuoteId::uuid)
 *
 * Returns all matching rows in deterministic ascending id order.
 * Used before the transaction, after 23505 rollback, and in tests.
 *
 * Never use two separate reads — always call this single function.
 *
 * @param executor  A committed-state db executor (NOT an open transaction).
 */
export async function lookupGatewayContextsForIdentifiers(
  executor: RbgDb,
  params: {
    brandCode:        string;
    gatewayBookingId: string;
    gatewayQuoteId:   string;
  },
): Promise<GatewayBookingContext[]> {
  const result = await executor.execute(sql`
    SELECT
      id,
      booking_id,
      brand_code,
      gateway_booking_id,
      gateway_quote_id,
      payload_fingerprint_version,
      payload_fingerprint,
      total_amount_cents,
      created_at
    FROM gateway_booking_context
    WHERE brand_code        = ${params.brandCode}
      AND (
            gateway_booking_id = ${params.gatewayBookingId}::uuid
            OR
            gateway_quote_id   = ${params.gatewayQuoteId}::uuid
          )
    ORDER BY id ASC
  `);

  const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows;
  return rows.map((r) => ({
    id:                        r["id"]                          as number,
    bookingId:                 r["booking_id"]                  as number,
    brandCode:                 r["brand_code"]                  as string,
    gatewayBookingId:          r["gateway_booking_id"]          as string,
    gatewayQuoteId:            r["gateway_quote_id"]            as string,
    payloadFingerprintVersion: r["payload_fingerprint_version"] as number,
    payloadFingerprint:        r["payload_fingerprint"]         as string,
    totalAmountCents:          (() => {
      const v = Number(r["total_amount_cents"]);
      if (!Number.isSafeInteger(v) || v < 1 || v > 9_999_999_999) {
        throw new Error(
          "internal: gateway_booking_context.total_amount_cents violates expected invariant",
        );
      }
      return v;
    })(),
    createdAt:                 r["created_at"]                  as Date,
  }));
}

// ── validateVehicleModelTx ────────────────────────────────────────────────────

/**
 * Validates that a vehicle model is active and available for external systems.
 * Runs inside a transaction with FOR SHARE to prevent concurrent deactivation.
 *
 * Returns { id, name } when the vehicle model passes all checks.
 * Returns null when it is absent, inactive, or not available for external systems.
 *
 * FOR SHARE is implemented via tx.execute(sql`...`) — confirmed absent from
 * Drizzle 0.45.1 chainable API.
 *
 * @param tx  An open transaction executor.
 */
export async function validateVehicleModelTx(
  tx: RbgTx,
  vehicleModelId: number,
): Promise<{ id: number; name: string } | null> {
  const result = await tx.execute(sql`
    SELECT id, name
    FROM vehicle_model
    WHERE id                            = ${vehicleModelId}
      AND active                        = true
      AND available_for_external_systems = true
    FOR SHARE
  `);

  const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows;
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return { id: r["id"] as number, name: r["name"] as string };
}

// ── validateLocationsTx ───────────────────────────────────────────────────────

/**
 * Validates that all requested location IDs are active.
 * Deduplicates IDs and sorts ascending before locking (deterministic lock order).
 * Runs inside a transaction with FOR SHARE.
 *
 * Returns a Map<id, { id, name }> when ALL requested IDs are present and active.
 * Returns null if any requested ID is missing or inactive.
 *
 * Same-pickup-dropoff case: IDs are deduplicated; the single row satisfies both.
 *
 * @param tx  An open transaction executor.
 */
export async function validateLocationsTx(
  tx: RbgTx,
  params: {
    pickupLocationId:  number;
    dropoffLocationId: number;
  },
): Promise<Map<number, { id: number; name: string }> | null> {
  const ids = [...new Set([params.pickupLocationId, params.dropoffLocationId])].sort(
    (a, b) => a - b,
  );

  // Validate every ID before touching the database.
  for (const id of ids) {
    if (!Number.isSafeInteger(id) || id <= 0) return null;
  }

  // Branch explicitly for one vs two distinct IDs.
  // All IDs are bound parameters — no sql.raw, no string-built SQL.
  let result: unknown;
  if (ids.length === 1) {
    const [id0] = ids as [number];
    result = await tx.execute(sql`
      SELECT id, name
      FROM location
      WHERE id = ${id0}
        AND is_active = true
      ORDER BY id ASC
      FOR SHARE
    `);
  } else {
    const [id0, id1] = ids as [number, number];
    result = await tx.execute(sql`
      SELECT id, name
      FROM location
      WHERE (id = ${id0} OR id = ${id1})
        AND is_active = true
      ORDER BY id ASC
      FOR SHARE
    `);
  }

  const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows;
  const locationMap = new Map<number, { id: number; name: string }>(
    rows.map((r) => [r["id"] as number, { id: r["id"] as number, name: r["name"] as string }]),
  );

  // All requested IDs must be present in the result
  for (const id of [params.pickupLocationId, params.dropoffLocationId]) {
    if (!locationMap.has(id)) return null;
  }

  return locationMap;
}
