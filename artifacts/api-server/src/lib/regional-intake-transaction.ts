/**
 * regional-intake-transaction.ts
 *
 * C2b-1 transaction core for the Regional Brands Gateway intake pipeline.
 *
 * Exports:
 *   RegionalBrandCode          — narrow brand code union type
 *   RegionalIntakeTxResult     — sealed domain outcome union
 *   RegionalIntakeTxTestHooks  — optional test hook interface
 *   RegionalIntakeTxInput      — full transaction input shape
 *   executeRegionalIntakeTransactionTx — orchestrator (does NOT start its own tx)
 *
 * This file has no HTTP, no route, no notification, no committed-state
 * idempotency, and no 23505 recovery.  All of those belong to C2b-2.
 */

import {
  validateVehicleModelTx,
  validateLocationsTx,
  type RbgTx,
} from "../repositories/regional-intake.repository.js";
import {
  resolveCustomerForRegionalIntakeTx,
  insertRegionalBookingTx,
  insertRegionalBookingAttributionTx,
  insertGatewayBookingContextTx,
  type RegionalBrandCode,
} from "../repositories/regional-intake-write.repository.js";

// ── RegionalBrandCode ─────────────────────────────────────────────────────────

/**
 * Narrow union of the two permitted regional brand codes.
 *
 * Canonical declaration lives in regional-intake-write.repository.ts and is
 * re-exported here to preserve the public type surface of this module.
 * There is no runtime import cycle: the write repository does not import this file.
 */
export type { RegionalBrandCode };

// ── RegionalIntakeTxResult ────────────────────────────────────────────────────

/** Sealed domain outcome returned by executeRegionalIntakeTransactionTx. */
export type RegionalIntakeTxResult =
  | {
      kind:                 "SUCCESS";
      bookingId:            number;
      reference:            string;
      pickupLocationName:   string;
      dropoffLocationName:  string;
      vehicleModelName:     string;
    }
  | { kind: "VEHICLE_MODEL_UNAVAILABLE" }
  | { kind: "LOCATION_UNAVAILABLE" };

// ── RegionalIntakeTxTestHooks ─────────────────────────────────────────────────

/**
 * Optional test-only hooks injected at four points inside the transaction.
 *
 * Each hook is awaited after the named write step.  When testing rollback, the
 * supplied function itself throws a deliberate error.  That error propagates
 * through the open transaction callback causing PostgreSQL to roll back the
 * entire transaction.
 *
 * The transaction core MUST NOT:
 *   - throw the hook return value;
 *   - throw undefined;
 *   - catch the deliberate failure inside the callback;
 *   - convert the failure into a success or domain outcome.
 */
export interface RegionalIntakeTxTestHooks {
  afterCustomerResolve?:   () => Promise<void>;
  afterBookingInsert?:     () => Promise<void>;
  afterAttributionInsert?: () => Promise<void>;
  afterContextInsert?:     () => Promise<void>;
}

// ── RegionalIntakeTxInput ─────────────────────────────────────────────────────

/**
 * All inputs for executeRegionalIntakeTransactionTx.
 *
 * brandCode must originate exclusively from AuthenticatedRbgRequestContext.brandCode —
 * never derived from the request body, hostname, key ID text, or sourceDomain.
 *
 * currency is a literal type; the booking writer always stores "EUR".
 *
 * pgLiteral fields are ParsedWallClock.pgLiteral strings ("YYYY-MM-DD HH:mm:00").
 */
export interface RegionalIntakeTxInput {
  brandCode:          RegionalBrandCode;
  gatewayBookingId:   string;
  gatewayQuoteId:     string;
  vehicleModelId:     number;
  pickupLocationId:   number;
  dropoffLocationId:  number;
  pickupPgLiteral:    string;
  dropoffPgLiteral:   string;
  totalAmountCents:   number;
  currency:           "EUR";
  customerName:       string;   // post-normalization (trim only)
  customerEmail:      string;   // post-normalization (trim + lowercase)
  customerPhone:      string;   // post-normalization (trim)
  payloadFingerprint: string;
}

// ── executeRegionalIntakeTransactionTx ────────────────────────────────────────

/**
 * Orchestrates the Regional Brands Gateway write pipeline inside an already-open
 * RbgTx.  Does NOT start its own transaction.
 *
 * Exact execution order:
 *   1. validateVehicleModelTx   — returns VEHICLE_MODEL_UNAVAILABLE if null (no customer write)
 *   2. validateLocationsTx      — returns LOCATION_UNAVAILABLE if null (no customer write)
 *   3. resolveCustomerForRegionalIntakeTx
 *   4. await testHooks?.afterCustomerResolve?.()
 *   5. insertRegionalBookingTx
 *   6. await testHooks?.afterBookingInsert?.()
 *   7. insertRegionalBookingAttributionTx
 *   8. await testHooks?.afterAttributionInsert?.()
 *   9. insertGatewayBookingContextTx
 *  10. await testHooks?.afterContextInsert?.()
 *  11. return SUCCESS result
 *
 * Any error thrown by a test hook propagates through this function and through
 * the caller's transaction callback, causing PostgreSQL to roll back all writes
 * atomically.
 */
export async function executeRegionalIntakeTransactionTx(
  tx: RbgTx,
  input: RegionalIntakeTxInput,
  testHooks?: RegionalIntakeTxTestHooks,
): Promise<RegionalIntakeTxResult> {
  // ── Step 1: validate vehicle model ─────────────────────────────────────────
  const vehicleModel = await validateVehicleModelTx(tx, input.vehicleModelId);
  if (vehicleModel === null) {
    return { kind: "VEHICLE_MODEL_UNAVAILABLE" };
  }

  // ── Step 2: validate locations ─────────────────────────────────────────────
  const locationMap = await validateLocationsTx(tx, {
    pickupLocationId:  input.pickupLocationId,
    dropoffLocationId: input.dropoffLocationId,
  });
  if (locationMap === null) {
    return { kind: "LOCATION_UNAVAILABLE" };
  }

  const pickupLocation  = locationMap.get(input.pickupLocationId)!;
  const dropoffLocation = locationMap.get(input.dropoffLocationId)!;

  // ── Step 3: resolve customer ────────────────────────────────────────────────
  const { userId } = await resolveCustomerForRegionalIntakeTx(tx, {
    normalizedEmail: input.customerEmail,
    normalizedName:  input.customerName,
    normalizedPhone: input.customerPhone,
  });

  // ── Step 4: hook ────────────────────────────────────────────────────────────
  await testHooks?.afterCustomerResolve?.();

  // ── Step 5: insert booking ──────────────────────────────────────────────────
  const { bookingId, reference } = await insertRegionalBookingTx(tx, {
    userId,
    vehicleModelId:    input.vehicleModelId,
    pickupLocationId:  input.pickupLocationId,
    dropoffLocationId: input.dropoffLocationId,
    pickupPgLiteral:   input.pickupPgLiteral,
    dropoffPgLiteral:  input.dropoffPgLiteral,
    totalAmountCents:  input.totalAmountCents,
    customerName:      input.customerName,
    customerEmail:     input.customerEmail,
    customerPhone:     input.customerPhone,
    gatewayBookingId:  input.gatewayBookingId,
  });

  // ── Step 6: hook ────────────────────────────────────────────────────────────
  await testHooks?.afterBookingInsert?.();

  // ── Step 7: insert booking attribution ─────────────────────────────────────
  await insertRegionalBookingAttributionTx(tx, {
    bookingId,
    brandCode: input.brandCode,
  });

  // ── Step 8: hook ────────────────────────────────────────────────────────────
  await testHooks?.afterAttributionInsert?.();

  // ── Step 9: insert gateway booking context ──────────────────────────────────
  await insertGatewayBookingContextTx(tx, {
    bookingId,
    brandCode:          input.brandCode,
    gatewayBookingId:   input.gatewayBookingId,
    gatewayQuoteId:     input.gatewayQuoteId,
    payloadFingerprint: input.payloadFingerprint,
    totalAmountCents:   input.totalAmountCents,
  });

  // ── Step 10: hook ───────────────────────────────────────────────────────────
  await testHooks?.afterContextInsert?.();

  // ── Step 11: return SUCCESS ─────────────────────────────────────────────────
  return {
    kind:                "SUCCESS",
    bookingId,
    reference,
    pickupLocationName:  pickupLocation.name,
    dropoffLocationName: dropoffLocation.name,
    vehicleModelName:    vehicleModel.name,
  };
}
