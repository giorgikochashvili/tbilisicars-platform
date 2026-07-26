/**
 * regional-intake-dto.ts
 *
 * Zod schema and TypeScript type for the Regional Brands Gateway intake DTO.
 *
 * Field names are locked — no aliases permitted:
 *   gatewayBookingId, gatewayQuoteId, vehicleModelId,
 *   pickupLocationId, dropoffLocationId, pickupDatetime, dropoffDatetime,
 *   totalAmountCents, currency, customerName, customerEmail, customerPhone
 *
 * Normalization:
 *   customerEmail  → trim → lowercase → then validate min/max/email
 *   customerName   → trim only (internal spaces preserved)
 *   customerPhone  → trim only
 *
 * UUID enforcement:
 *   Lowercase-only regex rejects uppercase UUIDs with a 422 error.
 *   No .uuid() addition — Zod's .uuid() is case-insensitive and would weaken
 *   enforcement by silently accepting uppercase variants.
 *
 * Unknown fields:
 *   .strict() rejects any field not listed in the schema.
 */

import { z } from "zod";

const LOWERCASE_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const RegionalIntakeDtoSchema = z
  .object({
    // ── Idempotency identifiers ─────────────────────────────────────────────
    gatewayBookingId: z
      .string()
      .regex(LOWERCASE_UUID_REGEX, "must be a canonical lowercase UUID"),

    gatewayQuoteId: z
      .string()
      .regex(LOWERCASE_UUID_REGEX, "must be a canonical lowercase UUID"),

    // ── Resource references ─────────────────────────────────────────────────
    vehicleModelId:    z.number().int().positive(),
    pickupLocationId:  z.number().int().positive(),
    dropoffLocationId: z.number().int().positive(),

    // ── Wall-clock datetimes (semantic validation is done separately) ───────
    pickupDatetime:  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    dropoffDatetime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),

    // ── Money ───────────────────────────────────────────────────────────────
    totalAmountCents: z
      .number()
      .int()
      .min(1)
      .max(9_999_999_999)
      .refine(
        (n) => Number.isSafeInteger(n),
        { message: "totalAmountCents must be a safe integer" },
      ),

    currency: z.literal("EUR"),

    // ── Customer ─────────────────────────────────────────────────────────────
    //
    // customerName: trim only — internal whitespace is preserved unchanged.
    customerName: z.string().trim().min(1).max(200),

    // customerEmail normalization order (locked):
    //   1. transform: trim + lowercase (runs before any validation)
    //   2. pipe: min(1) → rejects empty-after-trim
    //            max(255) → length bound
    //            email() → RFC format validation
    customerEmail: z
      .string()
      .transform((s) => s.trim().toLowerCase())
      .pipe(
        z
          .string()
          .min(1, "customerEmail must not be empty after trim")
          .max(255)
          .email(),
      ),

    customerPhone: z.string().trim().min(1).max(50),
  })
  .strict();

export type RegionalIntakeDto = z.infer<typeof RegionalIntakeDtoSchema>;
