/**
 * regional-intake-write.repository.ts
 *
 * C2b-1 write-only repository for the Regional Brands Gateway intake pipeline.
 *
 * This file contains ONLY:
 *   - RegionalIntakeInternalError  — typed fixed internal error class
 *   - resolveCustomerForRegionalIntakeTx — INSERT … ON CONFLICT DO NOTHING + fallback SELECT
 *   - insertRegionalBookingTx       — inserts a booking row and returns { bookingId, reference }
 *   - insertRegionalBookingAttributionTx — inserts a booking_attribution row
 *   - insertGatewayBookingContextTx — inserts a gateway_booking_context row (UUID casts)
 *
 * IMPORT RULES (enforced):
 *   Runtime schema objects imported only from @workspace/db/schema.
 *   Raw SQL helper: sql from drizzle-orm.
 *   RbgTx is type-only (import type) from the C2a read repository.
 *   Nothing imported from @workspace/db (that creates a pg.Pool at module load).
 *   No module-level db, pool, pg, Pool, or PoolClient.
 *   No function opens a connection or starts a transaction.
 */

import {
  bookingTable,
  bookingAttributionTable,
} from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import type { RbgTx } from "./regional-intake.repository.js";
import {
  FINGERPRINT_VERSION,
  centsToDecimalString,
} from "../lib/regional-intake-helpers.js";

// ── RegionalBrandCode ─────────────────────────────────────────────────────────

/**
 * Narrow union of the two permitted regional brand codes.
 * Exported here as the canonical source; regional-intake-transaction.ts
 * re-exports this type to preserve its public surface.
 */
export type RegionalBrandCode = "batumicars" | "kutaisicars";

// ── RegionalIntakeInternalError ───────────────────────────────────────────────

/**
 * Typed internal error for regional intake write failures.
 * No PII or raw database values in the message — only a fixed code string.
 */
export class RegionalIntakeInternalError extends Error {
  constructor(public readonly code: string) {
    super("internal: regional intake error");
    this.name = "RegionalIntakeInternalError";
  }
}

// ── parsePositiveSafeDatabaseId ───────────────────────────────────────────────

/**
 * Validates a database-returned id as a positive safe integer.
 *
 * Returns the value only when:
 *   - typeof value === "number"
 *   - Number.isSafeInteger(value)
 *   - value > 0
 *
 * Otherwise throws RegionalIntakeInternalError with the supplied fixed code only.
 * Never includes the raw value, row contents, SQL, PII, or database messages.
 */
function parsePositiveSafeDatabaseId(value: unknown, errorCode: string): number {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    return value;
  }
  throw new RegionalIntakeInternalError(errorCode);
}

// ── resolveCustomerForRegionalIntakeTx ────────────────────────────────────────

/**
 * Resolves the customer for a gateway intake request inside an open transaction.
 *
 * Strategy:
 *   1. INSERT INTO "user" … ON CONFLICT (email) WHERE email IS NOT NULL DO NOTHING RETURNING id
 *   2. If INSERT returned a row → new customer created; return its id.
 *   3. If INSERT returned 0 rows (conflict fired) → SELECT the existing row by email.
 *   4. If both paths yield no row → throw RegionalIntakeInternalError("customer-resolve-failed").
 *
 * READ COMMITTED blocking:
 *   If another transaction holds an uncommitted INSERT on the same email, this INSERT
 *   blocks until that transaction commits or rolls back.  If it commits, ON CONFLICT
 *   DO NOTHING fires and we fall through to the SELECT.  If it rolls back, our INSERT
 *   succeeds.  Either path returns the correct id — never an incorrect result.
 *
 * Constraints:
 *   - Only email, full_name, phone are inserted; password_hash is always NULL (column default).
 *   - Existing customer rows are never overwritten (DO NOTHING, not DO UPDATE).
 *   - Rolls back atomically with the enclosing transaction.
 *   - No PII in error messages.
 */
export async function resolveCustomerForRegionalIntakeTx(
  tx: RbgTx,
  params: {
    normalizedEmail: string;
    normalizedName:  string;
    normalizedPhone: string;
  },
): Promise<{ userId: number }> {
  // Step 1: attempt INSERT with partial-index conflict target
  const insertResult = await tx.execute(sql`
    INSERT INTO "user" (email, full_name, phone)
    VALUES (
      ${params.normalizedEmail},
      ${params.normalizedName},
      ${params.normalizedPhone}
    )
    ON CONFLICT (email) WHERE email IS NOT NULL
    DO NOTHING
    RETURNING id
  `);

  const insertRows = (
    insertResult as unknown as { rows: Array<Record<string, unknown>> }
  ).rows;

  if (insertRows.length > 1) {
    throw new RegionalIntakeInternalError("customer-insert-multi-row");
  }

  if (insertRows.length === 1) {
    return {
      userId: parsePositiveSafeDatabaseId(
        insertRows[0]!["id"],
        "customer-insert-id-invalid",
      ),
    };
  }

  // Step 2: conflict fired — read the existing row (no LIMIT so >1 can be detected)
  const selectResult = await tx.execute(sql`
    SELECT id FROM "user" WHERE email = ${params.normalizedEmail}
  `);

  const selectRows = (
    selectResult as unknown as { rows: Array<Record<string, unknown>> }
  ).rows;

  if (selectRows.length === 1) {
    return {
      userId: parsePositiveSafeDatabaseId(
        selectRows[0]!["id"],
        "customer-select-id-invalid",
      ),
    };
  }

  if (selectRows.length > 1) {
    throw new RegionalIntakeInternalError("customer-select-multi-row");
  }

  // Both paths returned no row — should never happen under normal operation
  throw new RegionalIntakeInternalError("customer-resolve-failed");
}

// ── insertRegionalBookingTx ───────────────────────────────────────────────────

/** All pre-validated, pre-normalized, pre-parsed inputs for the booking insert. */
export interface InsertRegionalBookingInput {
  userId:            number;
  vehicleModelId:    number;
  pickupLocationId:  number;
  dropoffLocationId: number;
  pickupPgLiteral:   string;   // ParsedWallClock.pgLiteral — "YYYY-MM-DD HH:mm:00"
  dropoffPgLiteral:  string;
  totalAmountCents:  number;
  customerName:      string;
  customerEmail:     string;
  customerPhone:     string;
  gatewayBookingId:  string;
}

/**
 * Inserts a booking row inside an open transaction.
 *
 * Applies the complete source-confirmed 54-column booking matrix:
 *   - 1  serial/generated:   id (RETURNING)
 *   - 22 explicit values:    user_id, vehicle_id (NULL), vehicle_group_id (NULL),
 *                            vehicle_model_id, pickup_location_id, dropoff_location_id,
 *                            pickup_datetime, dropoff_datetime, status ("PENDING"),
 *                            payment_status ("UNPAID"), rate_id (NULL), rate_tier_id (NULL),
 *                            price_per_day (NULL), base_rate ("0"), total_amount,
 *                            currency ("EUR"), contact_full_name, contact_email,
 *                            contact_phone, source ("gateway"),
 *                            external_reservation_code, customer_contacted (false)
 *   - 8  omitted DB defaults: taxes, fees, discount, one_way_fee, delivery_fee,
 *                             deposit, created_at, updated_at
 *   - 23 omitted nullable NULLs: all remaining columns
 *
 * Timestamp columns use sql`${pgLiteral}::timestamp` — no JavaScript Date conversion.
 *
 * Returns { bookingId, reference } where reference = "TC-" + id.padStart(5, "0").
 */
export async function insertRegionalBookingTx(
  tx: RbgTx,
  input: InsertRegionalBookingInput,
): Promise<{ bookingId: number; reference: string }> {
  const rows = await tx
    .insert(bookingTable)
    .values({
      userId:                   input.userId,
      vehicleId:                null,
      vehicleGroupId:           null,
      vehicleModelId:           input.vehicleModelId,
      pickupLocationId:         input.pickupLocationId,
      dropoffLocationId:        input.dropoffLocationId,
      // pgLiteral::timestamp avoids any Date/timezone conversion
      pickupDatetime:           sql`${input.pickupPgLiteral}::timestamp` as unknown as Date,
      dropoffDatetime:          sql`${input.dropoffPgLiteral}::timestamp` as unknown as Date,
      status:                   "PENDING" as const,
      paymentStatus:            "UNPAID" as const,
      rateId:                   null,
      rateTierId:               null,
      pricePerDay:              null,
      baseRate:                 "0",
      // taxes, fees, discount, oneWayFee, deliveryFee, deposit — omitted (DB default "0")
      // depositCurrency — omitted (NULL)
      totalAmount:              centsToDecimalString(input.totalAmountCents),
      currency:                 "EUR",
      contactFullName:          input.customerName,
      contactEmail:             input.customerEmail,
      contactPhone:             input.customerPhone,
      // notes, broker, brokerId, partnerId — omitted (NULL)
      // pickupPhoto, returnPhoto — omitted (NULL)
      // deletedAt — omitted (NULL)
      // documentType, documentNumber — omitted (NULL)
      source:                   "gateway",
      // pickupType, pickupAddress, dropoffType, dropoffAddress — omitted (NULL)
      // reservationCode — omitted (NULL)
      externalReservationCode:  input.gatewayBookingId,
      // voucherImportRef — omitted (NULL)
      // websiteDiscountId … discountedRentalPrice — omitted (NULL)
      customerContacted:        false,
      // createdAt, updatedAt — omitted (DB default now())
    })
    .returning({ id: bookingTable.id });

  if (rows.length !== 1) {
    throw new RegionalIntakeInternalError("booking-insert-row-count");
  }
  const bookingId = parsePositiveSafeDatabaseId(rows[0]!.id, "booking-insert-id-invalid");
  const reference = "TC-" + String(bookingId).padStart(5, "0");
  return { bookingId, reference };
}

// ── insertRegionalBookingAttributionTx ────────────────────────────────────────

/**
 * Inserts a booking_attribution row inside an open transaction.
 *
 * Explicit values:
 *   - bookingId:    the resolved booking id
 *   - sourceDomain: null (server-derived; no domain is known for gateway requests)
 *   - sourceBrand:  authenticated brandCode (from AuthenticatedRbgRequestContext.brandCode —
 *                   never from request body, hostname, key text, or sourceDomain)
 *
 * All other columns (UTM, gclid, referrer, landingPath) are omitted (NULL).
 * createdAt is omitted (DB default now()).
 */
export async function insertRegionalBookingAttributionTx(
  tx: RbgTx,
  params: {
    bookingId: number;
    brandCode: RegionalBrandCode;
  },
): Promise<void> {
  await tx
    .insert(bookingAttributionTable)
    .values({
      bookingId:    params.bookingId,
      sourceDomain: null,
      sourceBrand:  params.brandCode,
      // utmSource, utmMedium, utmCampaign, utmContent, utmTerm — omitted (NULL)
      // gclid, referrer, landingPath — omitted (NULL)
      // createdAt — omitted (DB default now())
    });
}

// ── insertGatewayBookingContextTx ─────────────────────────────────────────────

/** All inputs for the gateway_booking_context insert. */
export interface InsertGatewayBookingContextInput {
  bookingId:          number;
  brandCode:          RegionalBrandCode;
  gatewayBookingId:   string;   // UUID string
  gatewayQuoteId:     string;   // UUID string
  payloadFingerprint: string;
  totalAmountCents:   number;
}

/**
 * Inserts a gateway_booking_context row inside an open transaction.
 *
 * Uses raw SQL because gateway_booking_id and gateway_quote_id are UUID columns
 * requiring explicit ::uuid casts for bound parameters.
 *
 * FINGERPRINT_VERSION is stored explicitly — never hardcoded as 1.
 *
 * May produce a 23505 unique constraint violation (handled by C2b-2).
 * No RETURNING needed.
 */
export async function insertGatewayBookingContextTx(
  tx: RbgTx,
  input: InsertGatewayBookingContextInput,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO gateway_booking_context
      (booking_id, brand_code, gateway_booking_id, gateway_quote_id,
       payload_fingerprint_version, payload_fingerprint, total_amount_cents)
    VALUES (
      ${input.bookingId},
      ${input.brandCode},
      ${input.gatewayBookingId}::uuid,
      ${input.gatewayQuoteId}::uuid,
      ${FINGERPRINT_VERSION},
      ${input.payloadFingerprint},
      ${input.totalAmountCents}
    )
  `);
}
