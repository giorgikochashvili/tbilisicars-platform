/**
 * regional-intake.service.ts
 *
 * C2b-2 service and idempotency orchestration layer for the Regional Brands
 * Gateway intake pipeline.
 *
 * No module-level db/pool/pg import.  All executors are injected via the
 * factory.  No cast from string to RegionalBrandCode anywhere in this file.
 * Constraint names are module-private and never appear in any service result.
 */

import { RegionalIntakeDtoSchema } from "../lib/regional-intake-dto.js";
import type { RegionalBrandCode } from "../repositories/regional-intake-write.repository.js";
import { RegionalIntakeInternalError } from "../repositories/regional-intake-write.repository.js";
import type { RbgDb, RbgTx } from "../repositories/regional-intake.repository.js";
import { lookupGatewayContextsForIdentifiers } from "../repositories/regional-intake.repository.js";
import {
  executeRegionalIntakeTransactionTx,
  type RegionalIntakeTxResult,
  type RegionalIntakeTxTestHooks,
} from "../lib/regional-intake-transaction.js";
import {
  parseAndValidateWallClockDatetime,
  validateWallClockInterval,
  computePayloadFingerprint,
  classifyIdempotencyResult,
  type ParsedWallClock,
} from "../lib/regional-intake-helpers.js";
import { extractPostgresErrorMetadata } from "../lib/pg-error-metadata.js";

// ── Approved 23505 constraints (module-private) ───────────────────────────────

type ApprovedGatewayContextConstraint =
  | "uq_gbc_brand_gateway_booking"
  | "uq_gbc_brand_gateway_quote";

function isApprovedGatewayContextConstraint(
  value: unknown,
): value is ApprovedGatewayContextConstraint {
  return (
    value === "uq_gbc_brand_gateway_booking" ||
    value === "uq_gbc_brand_gateway_quote"
  );
}

// ── Exported types ────────────────────────────────────────────────────────────

/** Injected transaction runner — typed over RbgTx. */
export type RegionalIntakeTransactionRunner = <T>(
  callback: (tx: RbgTx) => Promise<T>,
) => Promise<T>;

/** Service-level test hook (C2b-2 layer only). */
export interface RegionalIntakeSvcTestHooks {
  afterPreReadProceed?: () => Promise<void>; // fires after pre-read returns PROCEED
}

/**
 * Bounded structured validation issue.
 * No message text. No received values. No unrecognized-key names.
 */
export interface RegionalValidationIssue {
  path: string; // derived from issue.path; max 80 characters
  code: string; // derived from issue.code only
}

/** Service result union (locked contract). */
export type RegionalIntakeSvcResult =
  | { kind: "CREATED";                   bookingId: number; reference: string; created: true  }
  | { kind: "REPLAYED";                  bookingId: number; reference: string; created: false }
  | { kind: "VALIDATION_ERROR";          issues: readonly RegionalValidationIssue[] }
  | { kind: "INVALID_DATETIME" }
  | { kind: "VEHICLE_MODEL_UNAVAILABLE" }
  | { kind: "LOCATION_UNAVAILABLE" }
  | { kind: "CONFLICT" }
  | { kind: "SERVICE_UNAVAILABLE" }
  | { kind: "INTERNAL_ERROR" };

/**
 * Service function shape.
 * brandCode is RegionalBrandCode (never plain string) — narrowed by C2b-3
 * adapter before invocation.
 */
export type RegionalIntakeServiceFn = (input: {
  brandCode:  RegionalBrandCode;
  parsedJson: unknown;
}) => Promise<RegionalIntakeSvcResult>;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRegionalIntakeService(deps: {
  committedDb:    RbgDb;
  runTransaction: RegionalIntakeTransactionRunner;
  svcTestHooks?:  RegionalIntakeSvcTestHooks;
  txTestHooks?:   RegionalIntakeTxTestHooks;
}): RegionalIntakeServiceFn {
  return async function regionalIntakeService(input: {
    brandCode:  RegionalBrandCode;
    parsedJson: unknown;
  }): Promise<RegionalIntakeSvcResult> {

    // ── Step 1: Parse DTO ───────────────────────────────────────────────────
    const parseResult = RegionalIntakeDtoSchema.safeParse(input.parsedJson);
    if (!parseResult.success) {
      const issues: RegionalValidationIssue[] = parseResult.error.issues
        .slice(0, 8)
        .map((iss) => ({
          path: iss.path.map(String).join(".").slice(0, 80),
          code: iss.code,
        }));
      return { kind: "VALIDATION_ERROR", issues };
    }
    const dto = parseResult.data;

    // ── Step 2: Parse pickup datetime ───────────────────────────────────────
    let pickup: ParsedWallClock;
    try { pickup = parseAndValidateWallClockDatetime(dto.pickupDatetime); }
    catch { return { kind: "INVALID_DATETIME" }; }

    // ── Step 3: Parse dropoff datetime ──────────────────────────────────────
    let dropoff: ParsedWallClock;
    try { dropoff = parseAndValidateWallClockDatetime(dto.dropoffDatetime); }
    catch { return { kind: "INVALID_DATETIME" }; }

    // ── Step 4: Validate interval ────────────────────────────────────────────
    try { validateWallClockInterval(pickup.canonical, dropoff.canonical); }
    catch { return { kind: "INVALID_DATETIME" }; }

    // ── Step 5: Compute fingerprint ──────────────────────────────────────────
    // 12 DTO fields + authenticated brandCode = 13 total fingerprint inputs.
    const fingerprint = computePayloadFingerprint({
      brandCode:         input.brandCode,
      gatewayBookingId:  dto.gatewayBookingId,
      gatewayQuoteId:    dto.gatewayQuoteId,
      vehicleModelId:    dto.vehicleModelId,
      pickupLocationId:  dto.pickupLocationId,
      dropoffLocationId: dto.dropoffLocationId,
      pickupDatetime:    pickup.canonical,
      dropoffDatetime:   dropoff.canonical,
      totalAmountCents:  dto.totalAmountCents,
      currency:          dto.currency,
      customerName:      dto.customerName,
      customerEmail:     dto.customerEmail,
      customerPhone:     dto.customerPhone,
    });

    // ── Step 6: Initial committed-state pre-read (contained) ─────────────────
    let preReadRows: Awaited<ReturnType<typeof lookupGatewayContextsForIdentifiers>>;
    try {
      preReadRows = await lookupGatewayContextsForIdentifiers(
        deps.committedDb,
        {
          brandCode:        input.brandCode,
          gatewayBookingId: dto.gatewayBookingId,
          gatewayQuoteId:   dto.gatewayQuoteId,
        },
      );
    } catch {
      return { kind: "SERVICE_UNAVAILABLE" }; // Case A
    }

    // ── Step 7: Classify pre-read ─────────────────────────────────────────────
    const preClass = classifyIdempotencyResult(preReadRows, {
      brandCode:          input.brandCode,
      gatewayBookingId:   dto.gatewayBookingId,
      gatewayQuoteId:     dto.gatewayQuoteId,
      payloadFingerprint: fingerprint,
      totalAmountCents:   dto.totalAmountCents,
    });

    // ── Step 8: REPLAY exit (no transaction) ─────────────────────────────────
    if (preClass.kind === "REPLAY") {
      return {
        kind:      "REPLAYED",
        bookingId: preClass.context.bookingId,
        reference: "TC-" + String(preClass.context.bookingId).padStart(5, "0"),
        created:   false,
      };
    }

    // ── Step 9: CONFLICT exit (no transaction) ───────────────────────────────
    if (preClass.kind === "CONFLICT") {
      return { kind: "CONFLICT" };
    }

    // ── Step 10: Fire proceed hook ────────────────────────────────────────────
    await deps.svcTestHooks?.afterPreReadProceed?.();

    // ── Step 11: Run transaction (contained) ─────────────────────────────────
    // txResult is definitely assigned on success, or the catch handles the
    // failure and returns before the success-outcome switch is reached.
    let txResult: RegionalIntakeTxResult;
    try {
      txResult = await deps.runTransaction((tx: RbgTx) =>
        executeRegionalIntakeTransactionTx(
          tx,
          {
            brandCode:          input.brandCode,
            gatewayBookingId:   dto.gatewayBookingId,
            gatewayQuoteId:     dto.gatewayQuoteId,
            vehicleModelId:     dto.vehicleModelId,
            pickupLocationId:   dto.pickupLocationId,
            dropoffLocationId:  dto.dropoffLocationId,
            pickupPgLiteral:    pickup.pgLiteral,
            dropoffPgLiteral:   dropoff.pgLiteral,
            totalAmountCents:   dto.totalAmountCents,
            currency:           "EUR",
            customerName:       dto.customerName,
            customerEmail:      dto.customerEmail,
            customerPhone:      dto.customerPhone,
            payloadFingerprint: fingerprint,
          },
          deps.txTestHooks,
        ),
      );
    } catch (err) {
      // Complete classification; every branch returns.
      // err is never referenced outside this block.

      // Case B: known internal error
      if (err instanceof RegionalIntakeInternalError) {
        return { kind: "INTERNAL_ERROR" };
      }

      // Extract PG metadata
      const { code, constraint } = extractPostgresErrorMetadata(err);

      // Case C: non-23505 or no structured code
      if (code !== "23505") {
        return { kind: "SERVICE_UNAVAILABLE" };
      }

      // Case D: 23505 with unapproved, missing, or malformed constraint
      if (!isApprovedGatewayContextConstraint(constraint)) {
        return { kind: "INTERNAL_ERROR" }; // no fresh read
      }

      // Case E: approved 23505 — transaction is fully rolled back by pg.
      // Use a fresh committed-state call through deps.committedDb only.
      let retryRows: Awaited<ReturnType<typeof lookupGatewayContextsForIdentifiers>>;
      try {
        retryRows = await lookupGatewayContextsForIdentifiers(
          deps.committedDb,
          {
            brandCode:        input.brandCode,
            gatewayBookingId: dto.gatewayBookingId,
            gatewayQuoteId:   dto.gatewayQuoteId,
          },
        );
      } catch {
        return { kind: "SERVICE_UNAVAILABLE" }; // Case F
      }

      const retryClass = classifyIdempotencyResult(retryRows, {
        brandCode:          input.brandCode,
        gatewayBookingId:   dto.gatewayBookingId,
        gatewayQuoteId:     dto.gatewayQuoteId,
        payloadFingerprint: fingerprint,
        totalAmountCents:   dto.totalAmountCents,
      });

      // Case G
      if (retryClass.kind === "REPLAY") {
        return {
          kind:      "REPLAYED",
          bookingId: retryClass.context.bookingId,
          reference: "TC-" + String(retryClass.context.bookingId).padStart(5, "0"),
          created:   false,
        };
      }
      if (retryClass.kind === "CONFLICT") {
        return { kind: "CONFLICT" };
      }
      return { kind: "SERVICE_UNAVAILABLE" }; // PROCEED after approved 23505
    }
    // txResult is definitely assigned here; err is not in scope.

    // ── Step 12: Map transaction SUCCESS outcomes ─────────────────────────────
    switch (txResult.kind) {
      case "SUCCESS":
        return {
          kind:      "CREATED",
          bookingId: txResult.bookingId,
          reference: txResult.reference,
          created:   true,
        };
      case "VEHICLE_MODEL_UNAVAILABLE":
        return { kind: "VEHICLE_MODEL_UNAVAILABLE" };
      case "LOCATION_UNAVAILABLE":
        return { kind: "LOCATION_UNAVAILABLE" };
    }
  };
}
