/**
 * Minimal structural interface for a pg Pool — avoids importing the pg package directly.
 * Any `pg.Pool` instance satisfies this shape.
 */
interface QueryablePool {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}

/**
 * Canonical rental day-count calculation used by the website quote and booking endpoints.
 *
 * Rules (per spec):
 *   1. Count full 24-hour blocks elapsed between pickup and dropoff (floor).
 *   2. Compute the remaining time beyond those full blocks.
 *      - 0 – 120 minutes remaining → no extra day.
 *      - 121+ minutes remaining   → add 1 extra day.
 *   3. Enforce a minimum of 2 chargeable days.
 */
export function calculateChargeableDays(pickup: Date, dropoff: Date): number {
  const elapsedMs = dropoff.getTime() - pickup.getTime();
  const fullBlocks = Math.floor(elapsedMs / 86_400_000);
  const remainderMinutes = (elapsedMs - fullBlocks * 86_400_000) / 60_000;
  const extraDay = remainderMinutes > 120 ? 1 : 0;
  return Math.max(2, fullBlocks + extraDay);
}

// ─── Rate resolution ──────────────────────────────────────────────────────────

/**
 * The single pricing record that wins for a given booking context.
 */
export interface ResolvedTier {
  tierId: number;
  rateId: number;
  rateName: string;
  pricePerDay: number;
  currency: string;
}

/**
 * Resolve the best active WEB rate tier for a vehicle model + pickup date + booking duration.
 *
 * Priority order (highest first):
 *   1. Child rates (parent_rate_id IS NOT NULL) over parent rates.
 *   2. More recently started validity period (valid_from DESC).
 *   3. Higher day-range floor (from_days DESC) — more specific duration match.
 *
 * Constraints applied:
 *   - rate must be active (is_active = true)
 *   - rate_type must be 'web' or NULL (broker rates excluded)
 *   - pickup date must fall within [valid_from, valid_until]
 *   - booking duration must satisfy the tier's [from_days, to_days] window
 *     (to_days = NULL or 0 means unlimited)
 *   - booking duration must satisfy the rate's [min_days, max_days] constraint
 *     (min_days = NULL or 0 means no lower bound; max_days = NULL or 0 means unlimited)
 *
 * Returns null if no matching tier is found (vehicle has no applicable rate).
 */
export async function resolveRateTier(
  pool: QueryablePool,
  vehicleModelId: number,
  pickupDateStr: string,
  days: number,
): Promise<ResolvedTier | null> {
  const { rows } = await pool.query<{
    tier_id: number;
    rate_id: number;
    rate_name: string;
    price_per_day: string;
    currency: string;
  }>(
    `SELECT rt.id AS tier_id, rt.rate_id, r.name AS rate_name,
            rt.price_per_day, rt.currency
     FROM ratetier rt
     JOIN rate r ON r.id = rt.rate_id
     WHERE rt.vehicle_model_id = $1
       AND r.is_active = true
       AND (r.rate_type = 'web' OR r.rate_type IS NULL)
       AND r.valid_from::date <= $2::date
       AND r.valid_until::date >= $2::date
       AND rt.price_per_day > 0
       AND rt.from_days <= $3
       AND (rt.to_days IS NULL OR rt.to_days = 0 OR rt.to_days >= $3)
       AND ($3 >= COALESCE(r.min_days, 0) OR r.min_days IS NULL OR r.min_days = 0)
       AND ($3 <= r.max_days OR r.max_days IS NULL OR r.max_days = 0)
     ORDER BY
       (CASE WHEN r.parent_rate_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
       r.valid_from DESC,
       rt.from_days DESC
     LIMIT 1`,
    [vehicleModelId, pickupDateStr, days],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    tierId: row.tier_id,
    rateId: row.rate_id,
    rateName: row.rate_name,
    pricePerDay: Number(row.price_per_day),
    currency: row.currency,
  };
}

// ─── Extras calculation ───────────────────────────────────────────────────────

/**
 * Extra line item used by computeExtrasTotal.
 */
export interface ExtraLineItem {
  price: number;
  pricingType: "per_day" | "per_trip";
  maxDays: number | null;
  quantity: number;
}

/**
 * Compute the total cost of all extras for a booking.
 *
 * Rules:
 *   per_day  → price × quantity × min(days, maxDays ?? days)
 *   per_trip → price × quantity (flat fee, charged once regardless of duration)
 */
export function computeExtrasTotal(items: ExtraLineItem[], days: number): number {
  let total = 0;
  for (const item of items) {
    if (item.pricingType === "per_trip") {
      total += item.price * item.quantity;
    } else {
      const billableDays =
        item.maxDays != null && item.maxDays > 0 ? Math.min(days, item.maxDays) : days;
      total += item.price * item.quantity * billableDays;
    }
  }
  return total;
}

// ─── Website discount ─────────────────────────────────────────────────────────

/**
 * Compute the discount amount for a website discount against a base rental total.
 *
 * Always returns a non-negative value, capped at baseTotal.
 * Applies to the rental base price only — extras and one-way fees are untouched.
 *
 * discountType "PERCENT" → baseTotal × (discountValue / 100), rounded to 2 dp.
 * discountType "FIXED"   → min(discountValue, baseTotal).
 */
export function applyWebsiteDiscount(
  baseTotal: number,
  discountType: "PERCENT" | "FIXED",
  discountValue: number,
): number {
  if (discountType === "PERCENT") {
    return Math.round(baseTotal * (discountValue / 100) * 100) / 100;
  }
  return Math.min(discountValue, baseTotal);
}

// ─── Promo discount ───────────────────────────────────────────────────────────

/**
 * Compute the discount amount for a given promo against a base rental total.
 *
 * Always returns a non-negative value, capped at baseTotal.
 * Applies to the rental base only — extras are not discounted.
 */
export function applyPromoDiscount(
  baseTotal: number,
  discountType: string,
  discountValue: number,
): number {
  if (discountType === "percentage") {
    return Math.round(baseTotal * (discountValue / 100) * 100) / 100;
  }
  return Math.min(discountValue, baseTotal);
}

// ─── Website discount resolution ──────────────────────────────────────────────

export interface ResolvedWebsiteDiscount {
  discountId: number;
  discountName: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
}

/**
 * Finds the highest-value active website discount that applies to the given
 * vehicle model, pickup location, and pickup date.
 *
 * Uses the customer's pickup date (YYYY-MM-DD), never the current server date.
 * Returns null if no discount applies.
 */
export async function resolveWebsiteDiscount(
  pool: QueryablePool,
  vehicleModelId: number,
  pickupLocationId: number,
  pickupDateStr: string,
): Promise<ResolvedWebsiteDiscount | null> {
  const { rows } = await pool.query<{
    discount_id: number;
    discount_name: string;
    discount_type: string;
    value: string;
  }>(
    `SELECT d.id AS discount_id, d.name AS discount_name,
            d.discount_type, d.value
     FROM website_discount d
     JOIN website_discount_vehicle_model dvm ON dvm.discount_id = d.id
     WHERE dvm.vehicle_model_id = $1
       AND d.pickup_location_id = $2
       AND d.is_active = true
       AND d.start_date <= $3::date
       AND d.end_date >= $3::date
     ORDER BY d.value DESC
     LIMIT 1`,
    [vehicleModelId, pickupLocationId, pickupDateStr],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    discountId: row.discount_id,
    discountName: row.discount_name,
    discountType: row.discount_type as "PERCENT" | "FIXED",
    discountValue: Number(row.value),
  };
}
