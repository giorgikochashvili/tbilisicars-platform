/**
 * Public booking intake API — no authentication required.
 * These endpoints serve the public website booking form.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { db, bookingextraTable, bookingTable, promoTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendBookingConfirmationEmail, sendNewBookingInternalEmail } from "../services/email.service.js";
import {
  calculateChargeableDays,
  resolveRateTier,
  computeExtrasTotal,
  applyPromoDiscount,
  applyWebsiteDiscount,
  resolveWebsiteDiscount,
} from "../lib/pricing.js";
import type { ExtraLineItem } from "../lib/pricing.js";
import { upsertCustomerByEmail } from "../services/customer-auth.service.js";

const router: IRouter = Router();

// ─── GET /api/public/booking-config ───────────────────────────────────────────
// Returns data needed to render the website booking form:
// locations, vehicle models available for website (with min price), extras

router.get("/public/booking-config", async (req, res) => {
  // Optional: filter vehicle models by pickup location's city.
  const locationIdRaw = req.query.location_id;
  const locationId =
    locationIdRaw && !Array.isArray(locationIdRaw)
      ? parseInt(String(locationIdRaw), 10)
      : NaN;
  const filterByLocation = !isNaN(locationId) && locationId > 0;

  // Optional: filter available vehicle count by date range.
  // Both must be present and valid for the filter to activate.
  const pickupDtRaw = req.query.pickup_datetime;
  const dropoffDtRaw = req.query.dropoff_datetime;
  const pickupDt = pickupDtRaw && !Array.isArray(pickupDtRaw) ? String(pickupDtRaw) : null;
  const dropoffDt = dropoffDtRaw && !Array.isArray(dropoffDtRaw) ? String(dropoffDtRaw) : null;
  const filterByDates =
    pickupDt !== null &&
    dropoffDt !== null &&
    !isNaN(new Date(pickupDt).getTime()) &&
    !isNaN(new Date(dropoffDt).getTime());

  // Optional: select the rate tier matching the given trip duration so vehicle
  // cards display the correct per-day price rather than the global minimum.
  const daysRaw = req.query.days;
  const daysInt = daysRaw && !Array.isArray(daysRaw) ? parseInt(String(daysRaw), 10) : NaN;
  const filterDays = !isNaN(daysInt) && daysInt > 0;

  // Shared price lateral — identical across all four query variants.
  // Only WEB rates that are currently valid contribute to the "from" price;
  // broker rates and expired/future rates are excluded.
  //
  // Two-step logic:
  //   1. Pick the winning rate for this model: child rates (parent_rate_id IS NOT NULL)
  //      take priority over parent rates; among same level, most recently started wins.
  //      Only rates that have at least one non-zero tier for this model are considered.
  //   2. From the winning rate's tiers, return the minimum price_per_day > 0.
  //      price_per_day = 0 is treated as an unfilled placeholder and ignored.
  //   If no valid non-zero tier exists the lateral returns NULL (LEFT JOIN propagates).
  const priceLateral = `
    LEFT JOIN LATERAL (
      SELECT rt.price_per_day AS min_price_per_day, rt.currency AS price_currency
      FROM ratetier rt
      JOIN rate r ON r.id = rt.rate_id
      WHERE rt.vehicle_model_id = vm.id
        AND rt.price_per_day > 0
        AND r.is_active = true
        AND (r.rate_type = 'web' OR r.rate_type IS NULL)
        AND r.valid_from::date <= CURRENT_DATE
        AND r.valid_until::date >= CURRENT_DATE
        AND r.id = (
          SELECT r2.id
          FROM rate r2
          JOIN ratetier rt2 ON rt2.rate_id = r2.id
            AND rt2.vehicle_model_id = vm.id
            AND rt2.price_per_day > 0
          WHERE r2.is_active = true
            AND (r2.rate_type = 'web' OR r2.rate_type IS NULL)
            AND r2.valid_from::date <= CURRENT_DATE
            AND r2.valid_until::date >= CURRENT_DATE
          ORDER BY
            (CASE WHEN r2.parent_rate_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
            r2.valid_from DESC
          LIMIT 1
        )
      ORDER BY
        ${filterDays ? `(CASE WHEN rt.from_days <= ${daysInt} AND (rt.to_days IS NULL OR rt.to_days = 0 OR rt.to_days >= ${daysInt}) THEN 0 ELSE 1 END) ASC,` : ""}
        rt.price_per_day ASC
      LIMIT 1
    ) price_info ON true`;

  // The available-vehicle FILTER condition.
  // When dates are provided, additionally exclude MAINTENANCE vehicles and
  // vehicles with an overlapping active booking (PENDING/CONFIRMED/DELIVERED
  // — the same set already used throughout the system for availability checks).
  // $p1 = pickup_datetime, $p2 = dropoff_datetime (positions vary per query).
  const baseCountFilter = `v.status != 'INACTIVE'`;
  const dateCountFilter = (p1: string, p2: string) =>
    `v.status != 'INACTIVE'
      AND v.status != 'MAINTENANCE'
      AND NOT EXISTS (
        SELECT 1 FROM booking b
        WHERE b.vehicle_id = v.id
          AND b.deleted_at IS NULL
          AND b.status IN ('PENDING', 'CONFIRMED', 'DELIVERED')
          AND b.pickup_datetime < ${p2}::timestamptz
          AND b.dropoff_datetime > ${p1}::timestamptz
      )`;

  // ── Global queries (no location filter) ───────────────────────────────────

  const globalModelSql = `
    SELECT
      vm.id,
      br.name AS brand,
      vm.name AS model,
      vm.category,
      vm.seats,
      vm.transmission,
      vm.fuel_type,
      vm.description,
      vm.image_url,
      vm.deposit,
      COUNT(v.id) FILTER (WHERE ${baseCountFilter}) AS vehicle_count,
      price_info.min_price_per_day,
      price_info.price_currency
    FROM vehicle_model vm
    JOIN brand br ON br.id = vm.brand_id
    LEFT JOIN vehicle v ON v.vehicle_model_id = vm.id
    ${priceLateral}
    WHERE vm.available_for_external_systems = true AND vm.active = true
    GROUP BY vm.id, br.name, price_info.min_price_per_day, price_info.price_currency
    ORDER BY br.name, vm.name
  `;

  // $1 = pickup_datetime, $2 = dropoff_datetime
  const globalModelWithDatesSql = `
    SELECT
      vm.id,
      br.name AS brand,
      vm.name AS model,
      vm.category,
      vm.seats,
      vm.transmission,
      vm.fuel_type,
      vm.description,
      vm.image_url,
      vm.deposit,
      COUNT(v.id) FILTER (WHERE ${dateCountFilter("$1", "$2")}) AS vehicle_count,
      price_info.min_price_per_day,
      price_info.price_currency
    FROM vehicle_model vm
    JOIN brand br ON br.id = vm.brand_id
    LEFT JOIN vehicle v ON v.vehicle_model_id = vm.id
    ${priceLateral}
    WHERE vm.available_for_external_systems = true AND vm.active = true
    GROUP BY vm.id, br.name, price_info.min_price_per_day, price_info.price_currency
    ORDER BY br.name, vm.name
  `;

  // ── City-scoped queries ($1 = location_id) ─────────────────────────────────
  // HAVING clause intentionally removed: models with zero city-scoped vehicles
  // are returned with vehicle_count = 0 so the frontend can show them as
  // "On Request" instead of hiding them entirely.

  const cityModelSql = `
    SELECT
      vm.id,
      br.name AS brand,
      vm.name AS model,
      vm.category,
      vm.seats,
      vm.transmission,
      vm.fuel_type,
      vm.description,
      vm.image_url,
      vm.deposit,
      COUNT(v.id) FILTER (WHERE ${baseCountFilter}) AS vehicle_count,
      price_info.min_price_per_day,
      price_info.price_currency
    FROM vehicle_model vm
    JOIN brand br ON br.id = vm.brand_id
    LEFT JOIN vehicle v
      ON v.vehicle_model_id = vm.id
      AND v.location_id IN (
        SELECT id FROM location
        WHERE city = (SELECT city FROM location WHERE id = $1)
      )
    ${priceLateral}
    WHERE vm.available_for_external_systems = true AND vm.active = true
    GROUP BY vm.id, br.name, price_info.min_price_per_day, price_info.price_currency
    ORDER BY br.name, vm.name
  `;

  // $1 = location_id, $2 = pickup_datetime, $3 = dropoff_datetime
  const cityModelWithDatesSql = `
    SELECT
      vm.id,
      br.name AS brand,
      vm.name AS model,
      vm.category,
      vm.seats,
      vm.transmission,
      vm.fuel_type,
      vm.description,
      vm.image_url,
      vm.deposit,
      COUNT(v.id) FILTER (WHERE ${dateCountFilter("$2", "$3")}) AS vehicle_count,
      price_info.min_price_per_day,
      price_info.price_currency
    FROM vehicle_model vm
    JOIN brand br ON br.id = vm.brand_id
    LEFT JOIN vehicle v
      ON v.vehicle_model_id = vm.id
      AND v.location_id IN (
        SELECT id FROM location
        WHERE city = (SELECT city FROM location WHERE id = $1)
      )
    ${priceLateral}
    WHERE vm.available_for_external_systems = true AND vm.active = true
    GROUP BY vm.id, br.name, price_info.min_price_per_day, price_info.price_currency
    ORDER BY br.name, vm.name
  `;

  // Choose the appropriate query based on which filters are active.
  let modelQueryPromise: Promise<{ rows: unknown[] }>;
  if (filterByLocation && filterByDates) {
    modelQueryPromise = pool.query(cityModelWithDatesSql, [locationId, pickupDt, dropoffDt]);
  } else if (filterByLocation) {
    modelQueryPromise = pool.query(cityModelSql, [locationId]);
  } else if (filterByDates) {
    modelQueryPromise = pool.query(globalModelWithDatesSql, [pickupDt, dropoffDt]);
  } else {
    modelQueryPromise = pool.query(globalModelSql);
  }

  const [locRows, modelRows, extraRows] = await Promise.all([
    pool.query(`SELECT id, name, city FROM location ORDER BY city, name`),
    modelQueryPromise,
    pool.query(`
      SELECT id, name, description, price, currency, pricing_type, max_days
      FROM extra
      WHERE is_active = true
      ORDER BY name
    `),
  ]);

  // node-postgres returns COUNT() as a string (bigint → string).
  // Normalise vehicle_count to a number here so callers never need to coerce it.
  // A vehicle_count of 0 means no physically available vehicles exist in the
  // requested region (or globally), which the website interprets as "On Request".
  const rawModels = (modelRows.rows as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    vehicle_count: Number(row.vehicle_count ?? 0),
    min_price_per_day: row.min_price_per_day != null ? Number(row.min_price_per_day) : null,
  }));

  // ── Discount enrichment (Step 6): only when both location + pickup_datetime are present ──
  // Resolve active website discounts for all returned vehicle models and attach them.
  // Uses the customer's pickup date (not today) to check discount date range.
  let vehicleModels = rawModels;
  const pickupDtMs = pickupDt ? new Date(pickupDt).getTime() : NaN;
  if (filterByLocation && pickupDt && !isNaN(pickupDtMs)) {
    const pickupDateStr = new Date(pickupDtMs).toISOString().slice(0, 10);
    const modelIds = rawModels.map((m) => Number(m.id));
    if (modelIds.length > 0) {
      const { rows: discountRows } = await pool.query<{
        vehicle_model_id: number;
        discount_id: number;
        discount_name: string;
        discount_type: string;
        value: string;
      }>(
        `SELECT dvm.vehicle_model_id, d.id AS discount_id, d.name AS discount_name,
                d.discount_type, d.value
         FROM website_discount d
         JOIN website_discount_vehicle_model dvm ON dvm.discount_id = d.id
         WHERE d.pickup_location_id = $1
           AND d.is_active = true
           AND d.start_date <= $2::date
           AND d.end_date >= $2::date
           AND dvm.vehicle_model_id = ANY($3)
         ORDER BY d.value DESC`,
        [locationId, pickupDateStr, modelIds],
      );
      // Build a map: vehicleModelId → first (highest value) discount
      const discountMap = new Map<number, { discountId: number; discountName: string; discountType: string; discountValue: number }>();
      for (const row of discountRows) {
        if (!discountMap.has(row.vehicle_model_id)) {
          discountMap.set(row.vehicle_model_id, {
            discountId: row.discount_id,
            discountName: row.discount_name,
            discountType: row.discount_type,
            discountValue: Number(row.value),
          });
        }
      }

      vehicleModels = rawModels.map((m) => {
        const disc = discountMap.get(Number(m.id));
        if (!disc || !m.min_price_per_day) return m;
        const originalPrice = Number(m.min_price_per_day);
        const discountAmt = disc.discountType === "PERCENT"
          ? Math.round(originalPrice * (disc.discountValue / 100) * 100) / 100
          : Math.min(disc.discountValue, originalPrice);
        return {
          ...m,
          has_website_discount: true,
          website_discount_id: disc.discountId,
          website_discount_name: disc.discountName,
          website_discount_type: disc.discountType,
          website_discount_value: disc.discountValue,
          website_discount_amount: discountAmt,
          original_min_price_per_day: originalPrice,
          discounted_min_price_per_day: Math.max(0, originalPrice - discountAmt),
        };
      });
    }
  }

  res.json({
    locations: locRows.rows,
    vehicleModels,
    extras: extraRows.rows,
  });
});

// ─── POST /api/public/validate-promo ──────────────────────────────────────────
// Validate a promo code and return discount info

router.post("/public/validate-promo", async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code?.trim()) {
    return res.status(400).json({ valid: false, error: "No promo code provided" });
  }

  const { rows } = await pool.query(
    `SELECT id, code, discount_type, discount_value, valid_from, valid_until, active, max_uses, times_used
     FROM promo WHERE code = $1 LIMIT 1`,
    [code.trim().toUpperCase()],
  );

  const promo = rows[0];
  if (!promo || !promo.active) {
    return res.json({ valid: false, error: "Invalid or expired promo code" });
  }

  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now) {
    return res.json({ valid: false, error: "Promo code is not active yet" });
  }
  if (promo.valid_until && new Date(promo.valid_until) < now) {
    return res.json({ valid: false, error: "Promo code has expired" });
  }
  if (promo.max_uses !== null && (promo.times_used ?? 0) >= promo.max_uses) {
    return res.json({ valid: false, error: "Promo code has reached its usage limit" });
  }

  return res.json({
    valid: true,
    promoId: promo.id,
    discountType: promo.discount_type,
    discountValue: Number(promo.discount_value),
  });
});

// ─── POST /api/public/quote ────────────────────────────────────────────────────
// Estimate a booking total using CRM rate data.
// Returns a structured quote; does NOT create a booking.

router.post("/public/quote", async (req, res) => {
  const body = req.body as {
    vehicleModelId?: number;
    pickupDatetime?: string;
    dropoffDatetime?: string;
    pickupLocationId?: number;
    dropoffLocationId?: number;
    extras?: Array<{ extraId: number; quantity: number }>;
    promoCode?: string;
  };

  if (!body.vehicleModelId || !body.pickupDatetime || !body.dropoffDatetime) {
    return res.status(400).json({ error: "vehicleModelId, pickupDatetime and dropoffDatetime are required" });
  }

  const pickupDate = new Date(body.pickupDatetime);
  const dropoffDate = new Date(body.dropoffDatetime);
  if (isNaN(pickupDate.getTime()) || isNaN(dropoffDate.getTime()) || dropoffDate <= pickupDate) {
    return res.status(400).json({ error: "Invalid dates" });
  }

  const days = calculateChargeableDays(pickupDate, dropoffDate);
  const pickupDateStr = pickupDate.toISOString().slice(0, 10);

  // Resolve best active WEB rate tier (shared function — also used by POST /public/bookings).
  const tier = await resolveRateTier(pool, body.vehicleModelId, pickupDateStr, days);
  const basePricePerDay: number | null = tier ? tier.pricePerDay : null;
  const baseCurrency: string | null = tier ? tier.currency : null;
  const baseTotal: number | null = basePricePerDay !== null ? basePricePerDay * days : null;

  // Fetch extras with pricing_type and max_days for accurate calculation.
  let extrasTotal = 0;
  if (body.extras && body.extras.length > 0) {
    const extraIds = body.extras.map((e) => e.extraId);
    const { rows: extraRows } = await pool.query(
      `SELECT id, price, pricing_type, max_days FROM extra WHERE id = ANY($1) AND is_active = true`,
      [extraIds],
    );
    const extraMap = new Map<number, { price: number; pricingType: string; maxDays: number | null }>(
      extraRows.map((r: { id: number; price: string; pricing_type: string; max_days: number | null }) => [
        r.id,
        { price: Number(r.price), pricingType: r.pricing_type, maxDays: r.max_days != null ? Number(r.max_days) : null },
      ]),
    );
    const lineItems: ExtraLineItem[] = body.extras.flatMap((item) => {
      const ex = extraMap.get(item.extraId);
      if (!ex) return [];
      return [{ price: ex.price, pricingType: ex.pricingType as "per_day" | "per_trip", maxDays: ex.maxDays, quantity: item.quantity }];
    });
    extrasTotal = computeExtrasTotal(lineItems, days);
  }

  // ── Website discount (priority: discount wins, promo skipped if discount applies) ──
  let websiteDiscountId: number | null = null;
  let websiteDiscountName: string | null = null;
  let websiteDiscountType: "PERCENT" | "FIXED" | null = null;
  let websiteDiscountValue: number | null = null;
  let websiteDiscountAmount: number | null = null;
  let originalRentalPrice: number | null = baseTotal;
  let discountedRentalPrice: number | null = baseTotal;
  let hasWebsiteDiscount = false;
  let promoSkippedDueToDiscount = false;

  const pickupLocId = body.pickupLocationId ? Number(body.pickupLocationId) : null;
  const dropoffLocId = body.dropoffLocationId ? Number(body.dropoffLocationId) : null;

  if (baseTotal !== null && body.vehicleModelId && pickupLocId) {
    const resolved = await resolveWebsiteDiscount(
      pool,
      Number(body.vehicleModelId),
      pickupLocId,
      pickupDateStr,
    );
    if (resolved) {
      hasWebsiteDiscount = true;
      websiteDiscountId = resolved.discountId;
      websiteDiscountName = resolved.discountName;
      websiteDiscountType = resolved.discountType;
      websiteDiscountValue = resolved.discountValue;
      websiteDiscountAmount = applyWebsiteDiscount(baseTotal, resolved.discountType, resolved.discountValue);
      originalRentalPrice = baseTotal;
      discountedRentalPrice = Math.max(0, baseTotal - websiteDiscountAmount);

      if (body.promoCode?.trim()) {
        promoSkippedDueToDiscount = true;
      }
    }
  }

  // ── Promo discount (only when no website discount applies) ───────────────────
  let promoDiscountType: string | null = null;
  let promoDiscountValue: number | null = null;
  let discountAmount: number | null = null;

  if (!hasWebsiteDiscount && body.promoCode?.trim()) {
    const { rows: promoRows } = await pool.query(
      `SELECT discount_type, discount_value FROM promo
       WHERE code = $1 AND active = true
         AND (valid_from IS NULL OR valid_from <= NOW())
         AND (valid_until IS NULL OR valid_until >= NOW())
       LIMIT 1`,
      [body.promoCode.trim().toUpperCase()],
    );
    if (promoRows[0]) {
      promoDiscountType = promoRows[0].discount_type as string;
      promoDiscountValue = Number(promoRows[0].discount_value);
      if (baseTotal !== null) {
        discountAmount = applyPromoDiscount(baseTotal, promoDiscountType, promoDiscountValue);
        discountedRentalPrice = Math.max(0, baseTotal - discountAmount);
      }
    }
  }

  // Effective discount amount for total calculation
  const effectiveDiscountAmount = hasWebsiteDiscount
    ? (websiteDiscountAmount ?? 0)
    : (discountAmount ?? 0);

  // One-way fee: only when pickup and dropoff differ and both are provided.
  let oneWayFee: number | undefined;
  if (pickupLocId && dropoffLocId && pickupLocId !== dropoffLocId) {
    const { rows: feeRows } = await pool.query(
      `SELECT fee FROM one_way_fees WHERE from_location_id = $1 AND to_location_id = $2 LIMIT 1`,
      [pickupLocId, dropoffLocId],
    );
    if (feeRows[0] && Number(feeRows[0].fee) > 0) {
      oneWayFee = Number(feeRows[0].fee);
    }
  }

  // Price order: base rental → discount (website or promo, mutually exclusive) → extras → one-way fee.
  const rentalAfterDiscount: number | null = baseTotal !== null
    ? Math.max(0, baseTotal - effectiveDiscountAmount)
    : null;
  const estimatedTotal: number | null = rentalAfterDiscount !== null
    ? rentalAfterDiscount + extrasTotal + (oneWayFee ?? 0)
    : null;

  return res.json({
    quotable: baseTotal !== null,
    days,
    rateId: tier?.rateId ?? null,
    rateTierId: tier?.tierId ?? null,
    rateName: tier?.rateName ?? null,
    basePricePerDay,
    baseCurrency,
    baseTotal,
    extrasTotal,
    // Website discount fields
    hasWebsiteDiscount,
    websiteDiscountId,
    websiteDiscountName,
    websiteDiscountType,
    websiteDiscountValue,
    websiteDiscountAmount,
    originalRentalPrice,
    discountedRentalPrice,
    promoSkippedDueToDiscount,
    // Legacy promo fields (null when website discount applies)
    promoDiscountType,
    promoDiscountValue,
    discountAmount,
    ...(oneWayFee !== undefined ? { oneWayFee } : {}),
    estimatedTotal,
  });
});

// ─── POST /api/public/bookings ─────────────────────────────────────────────────
// Create a real CRM booking from website form submission

router.post("/public/bookings", async (req, res) => {
  const body = req.body as {
    pickupLocationId?: number;
    dropoffLocationId?: number;
    pickupDatetime?: string;
    dropoffDatetime?: string;
    vehicleModelId?: number;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    notes?: string;
    extras?: Array<{ extraId: number; quantity: number }>;
    promoCode?: string;
    currency?: string;
    resolvedRateId?: number | null;
    resolvedRateTierId?: number | null;
    resolvedBaseRate?: number | null;
    resolvedTotal?: number | null;
    // Website fields — stored in booking notes [WEBSITE DATA] block
    nationality?: string;
    paymentMethod?: string;
    insurancePlan?: string;
    whatsAppOptIn?: boolean;
    age?: string;
    flightNumber?: string;
  };

  const errors: string[] = [];
  if (!body.pickupLocationId) errors.push("Pickup location is required");
  if (!body.dropoffLocationId) errors.push("Drop-off location is required");
  if (!body.pickupDatetime) errors.push("Pickup date is required");
  if (!body.dropoffDatetime) errors.push("Drop-off date is required");
  if (!body.vehicleModelId) errors.push("Vehicle selection is required");
  if (!body.firstName?.trim()) errors.push("First name is required");
  if (!body.lastName?.trim()) errors.push("Last name is required");
  if (!body.email?.trim()) errors.push("Email is required");
  if (!body.phone?.trim()) errors.push("Phone number is required");

  if (body.age !== undefined && body.age !== "") {
    if (!/^\d+$/.test(body.age)) {
      errors.push("Age must be a valid number");
    } else if (parseInt(body.age, 10) < 21) {
      errors.push("Driver must be at least 21 years old");
    }
  }

  if (errors.length > 0) {
    return res.status(422).json({ errors });
  }

  const pickupDate = new Date(body.pickupDatetime!);
  const dropoffDate = new Date(body.dropoffDatetime!);

  if (isNaN(pickupDate.getTime()) || isNaN(dropoffDate.getTime())) {
    return res.status(422).json({ errors: ["Invalid date format"] });
  }
  if (dropoffDate <= pickupDate) {
    return res.status(422).json({ errors: ["Drop-off date must be after pickup date"] });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email!)) {
    return res.status(422).json({ errors: ["Invalid email address"] });
  }

  // ── Customer account upsert ────────────────────────────────────────────────
  // Resolve (or create) the customer account identified by email.
  // For new accounts: a 6-char alphanumeric password is generated, hashed,
  // and stored. The plain-text value is captured here for the response only.
  // For existing accounts: no password change; generatedPassword = null.
  const contactFullNameEarly = `${body.firstName!.trim()} ${body.lastName!.trim()}`;
  const { user: customerUser, generatedPassword } = await upsertCustomerByEmail({
    email: body.email!.trim().toLowerCase(),
    fullName: contactFullNameEarly,
    phone: body.phone?.trim() ?? null,
  });

  const { rows: modelRows } = await pool.query(
    `SELECT vm.id, br.name AS brand, vm.name AS model
     FROM vehicle_model vm
     JOIN brand br ON br.id = vm.brand_id
     WHERE vm.id = $1 AND vm.available_for_external_systems = true AND vm.active = true`,
    [body.vehicleModelId],
  );
  if (!modelRows[0]) {
    return res.status(422).json({ errors: ["Selected vehicle model is not available for online booking"] });
  }

  // Determine initial booking status using the same availability signal the website
  // shows to customers: vehicle_count === 0 means "On Request" → PENDING,
  // vehicle_count > 0 means immediately bookable → CONFIRMED.
  // The filter mirrors dateCountFilter defined at the top of this file exactly.
  const { rows: availRows } = await pool.query<{ available_count: number }>(
    `SELECT COUNT(v.id)::int AS available_count
     FROM vehicle v
     WHERE v.vehicle_model_id = $1
       AND v.status != 'INACTIVE'
       AND v.status != 'MAINTENANCE'
       AND NOT EXISTS (
         SELECT 1 FROM booking b
         WHERE b.vehicle_id = v.id
           AND b.deleted_at IS NULL
           AND b.status IN ('PENDING', 'CONFIRMED', 'DELIVERED')
           AND b.pickup_datetime < $3::timestamptz
           AND b.dropoff_datetime > $2::timestamptz
       )`,
    [body.vehicleModelId, pickupDate.toISOString(), dropoffDate.toISOString()],
  );
  const initialStatus: "PENDING" | "CONFIRMED" =
    (availRows[0]?.available_count ?? 0) > 0 ? "CONFIRMED" : "PENDING";

  // Promo lookup is deferred until after website discount resolution.
  // Mutual exclusion: if an active website discount applies, promo validation is skipped entirely.
  let discount: string | null = null;
  let promoDiscountType: string | null = null;
  let promoDiscountValue: number | null = null;
  // Store raw promo row for later use (fetched only once to avoid duplicate DB queries).
  let promoRow: { discount_type: string; discount_value: string; max_uses: number | null; times_used: number; active: boolean } | null = null;
  if (body.promoCode) {
    const { rows: preRows } = await pool.query(
      `SELECT discount_type, discount_value, max_uses, times_used, active FROM promo WHERE code = $1 LIMIT 1`,
      [body.promoCode.trim().toUpperCase()],
    );
    promoRow = preRows[0] ?? null;
    // Validation is intentionally deferred — applied only when no website discount found.
  }

  const rentalDays = calculateChargeableDays(pickupDate, dropoffDate);
  // Fetch extras with pricing_type and max_days for correct per_day vs per_trip calculation.
  const validatedExtras: Array<{ extraId: number; quantity: number; price: number; name: string; pricingType: string; maxDays: number | null }> = [];
  if (body.extras && body.extras.length > 0) {
    const extraIds = body.extras.map((e) => e.extraId);
    const { rows: extraRows } = await pool.query(
      `SELECT id, name, price, pricing_type, max_days FROM extra WHERE id = ANY($1) AND is_active = true`,
      [extraIds],
    );
    const extraMap = new Map<number, { price: number; name: string; pricingType: string; maxDays: number | null }>(
      extraRows.map((r: { id: number; name: string; price: string; pricing_type: string; max_days: number | null }) => [
        r.id,
        { price: Number(r.price), name: r.name, pricingType: r.pricing_type, maxDays: r.max_days != null ? Number(r.max_days) : null },
      ]),
    );
    for (const item of body.extras) {
      const ex = extraMap.get(item.extraId);
      if (ex != null) {
        validatedExtras.push({ extraId: item.extraId, quantity: item.quantity, price: ex.price, name: ex.name, pricingType: ex.pricingType, maxDays: ex.maxDays });
      }
    }
  }

  const extrasLineItems: ExtraLineItem[] = validatedExtras.map((e) => ({
    price: e.price,
    pricingType: e.pricingType as "per_day" | "per_trip",
    maxDays: e.maxDays,
    quantity: e.quantity,
  }));
  const extrasTotal = computeExtrasTotal(extrasLineItems, rentalDays);

  const contactFullName = `${body.firstName!.trim()} ${body.lastName!.trim()}`;
  const currency = body.currency ?? "GEL";

  // Resolve one-way fee server-side — do NOT trust client-supplied value.
  let resolvedOneWayFee: number | null = null;
  if (body.pickupLocationId && body.dropoffLocationId &&
      Number(body.pickupLocationId) !== Number(body.dropoffLocationId)) {
    const { rows: owfRows } = await pool.query(
      `SELECT fee FROM one_way_fees WHERE from_location_id = $1 AND to_location_id = $2 LIMIT 1`,
      [Number(body.pickupLocationId), Number(body.dropoffLocationId)],
    );
    if (owfRows[0] && Number(owfRows[0].fee) > 0) {
      resolvedOneWayFee = Number(owfRows[0].fee);
    }
  }

  // Resolve rate server-side — do NOT trust client-submitted resolvedTotal / resolvedRateId.
  const pickupDateStr = pickupDate.toISOString().slice(0, 10);
  const resolvedTier = await resolveRateTier(pool, Number(body.vehicleModelId), pickupDateStr, rentalDays);
  const serverBaseRate: number | null = resolvedTier ? resolvedTier.pricePerDay : null;
  const serverBaseTotal: number | null = serverBaseRate !== null ? serverBaseRate * rentalDays : null;

  // If the client had a rate at quote time but the server can no longer find one
  // (e.g. rate expired between quote and submit), flag it in booking notes for staff.
  let rateExpiredNote: string | null = null;
  if (resolvedTier === null && (body.resolvedRateId != null || body.resolvedRateTierId != null)) {
    rateExpiredNote = "[RATE EXPIRED AT BOOKING TIME — re-check pricing with staff]";
  }

  // ── Website discount server-side resolution (mutual exclusion: discount wins over promo) ──
  let serverWebsiteDiscountId: number | null = null;
  let serverWebsiteDiscountName: string | null = null;
  let serverWebsiteDiscountType: "PERCENT" | "FIXED" | null = null;
  let serverWebsiteDiscountValue: number | null = null;
  let serverWebsiteDiscountAmount: number | null = null;
  let serverOriginalRentalPrice: number | null = serverBaseTotal;
  let serverDiscountedRentalPrice: number | null = serverBaseTotal;
  let hasServerWebsiteDiscount = false;

  if (serverBaseTotal !== null && body.pickupLocationId) {
    const resolvedDiscount = await resolveWebsiteDiscount(
      pool,
      Number(body.vehicleModelId),
      Number(body.pickupLocationId),
      pickupDateStr,
    );
    if (resolvedDiscount) {
      hasServerWebsiteDiscount = true;
      serverWebsiteDiscountId = resolvedDiscount.discountId;
      serverWebsiteDiscountName = resolvedDiscount.discountName;
      serverWebsiteDiscountType = resolvedDiscount.discountType;
      serverWebsiteDiscountValue = resolvedDiscount.discountValue;
      serverWebsiteDiscountAmount = applyWebsiteDiscount(serverBaseTotal, resolvedDiscount.discountType, resolvedDiscount.discountValue);
      serverOriginalRentalPrice = serverBaseTotal;
      serverDiscountedRentalPrice = Math.max(0, serverBaseTotal - serverWebsiteDiscountAmount);
      // Mutual exclusion: discount wins, promo is skipped
      discount = null;
      promoDiscountType = null;
      promoDiscountValue = null;
    }
  }

  // Deferred promo validation — only when NO website discount applies (mutual exclusion).
  // If a website discount applies, promo errors are silently ignored.
  if (!hasServerWebsiteDiscount && promoRow !== null) {
    if (!promoRow.active) {
      return res.status(422).json({ errors: ["Invalid or inactive promo code"] });
    }
    if (promoRow.max_uses !== null && promoRow.times_used >= promoRow.max_uses) {
      return res.status(422).json({ errors: ["Promo code has reached its usage limit"] });
    }
    promoDiscountType = String(promoRow.discount_type);
    promoDiscountValue = Number(promoRow.discount_value);
    discount = String(promoRow.discount_value);
  }

  // Promo discount (only applied when no website discount is in effect)
  let serverPromoDiscountAmount: number | null = null;
  if (!hasServerWebsiteDiscount && serverBaseTotal !== null && promoDiscountType && promoDiscountValue !== null) {
    serverPromoDiscountAmount = applyPromoDiscount(serverBaseTotal, promoDiscountType, promoDiscountValue);
    serverDiscountedRentalPrice = Math.max(0, serverBaseTotal - serverPromoDiscountAmount);
  }

  // The CRM `discount` column stores the promo discount amount (legacy); website discount has its own columns.
  const serverDiscountAmount: number | null = hasServerWebsiteDiscount
    ? null
    : serverPromoDiscountAmount;
  if (serverDiscountAmount !== null) {
    discount = String(serverDiscountAmount);
  } else if (hasServerWebsiteDiscount) {
    discount = null;
  }

  const rentalAfterDiscount = serverBaseTotal !== null
    ? Math.max(0, serverBaseTotal - (hasServerWebsiteDiscount ? (serverWebsiteDiscountAmount ?? 0) : (serverPromoDiscountAmount ?? 0)))
    : null;
  const serverEstimatedTotal: number | null = rentalAfterDiscount !== null
    ? rentalAfterDiscount + extrasTotal + (resolvedOneWayFee ?? 0)
    : null;

  const totalAmount: string | null = serverEstimatedTotal !== null
    ? String(serverEstimatedTotal)
    : extrasTotal > 0
      ? String(extrasTotal)
      : null;

  // ── Build structured notes block ────────────────────────────────────────────
  // Append [WEBSITE DATA] block; preserve any free-text notes from the user
  const websiteDataLines: string[] = [];
  if (body.nationality?.trim()) websiteDataLines.push(`Nationality: ${body.nationality.trim()}`);
  if (body.age?.trim()) websiteDataLines.push(`Age: ${body.age.trim()}`);
  if (body.whatsAppOptIn) websiteDataLines.push(`WhatsApp: Yes (phone number above)`);
  if (body.flightNumber?.trim()) websiteDataLines.push(`Flight Number: ${body.flightNumber.trim()}`);
  if (body.paymentMethod?.trim()) websiteDataLines.push(`Payment Method: ${body.paymentMethod.trim()}`);
  if (body.insurancePlan?.trim()) websiteDataLines.push(`Insurance: ${body.insurancePlan.trim()}`);

  let combinedNotes: string | null = body.notes?.trim() || null;
  if (websiteDataLines.length > 0) {
    const websiteBlock = `[WEBSITE DATA]\n${websiteDataLines.join("\n")}`;
    combinedNotes = combinedNotes
      ? `${combinedNotes}\n\n${websiteBlock}`
      : websiteBlock;
  }
  if (rateExpiredNote) {
    combinedNotes = combinedNotes ? `${combinedNotes}\n\n${rateExpiredNote}` : rateExpiredNote;
  }

  let bookingId: number;
  try {
    ({ bookingId } = await db.transaction(async (tx) => {
      // Only increment promo usage when no website discount superseded it (mutual exclusion).
      if (body.promoCode && !hasServerWebsiteDiscount) {
        const [promoRow] = await tx
          .select({ id: promoTable.id, maxUses: promoTable.maxUses, timesUsed: promoTable.timesUsed })
          .from(promoTable)
          .where(eq(promoTable.code, body.promoCode.trim().toUpperCase()))
          .for("update");

        if (!promoRow) {
          throw new Error("PROMO_INVALID");
        }
        if (promoRow.maxUses !== null && (promoRow.timesUsed ?? 0) >= promoRow.maxUses) {
          throw new Error("PROMO_EXHAUSTED");
        }

        await tx
          .update(promoTable)
          .set({ timesUsed: sql`COALESCE(${promoTable.timesUsed}, 0) + 1` })
          .where(eq(promoTable.id, promoRow.id));
      }

      const [row] = await tx
        .insert(bookingTable)
        .values({
          userId: customerUser.id,
          contactFullName,
          contactEmail: body.email!.trim(),
          contactPhone: body.phone!.trim(),
          pickupLocationId: Number(body.pickupLocationId),
          dropoffLocationId: Number(body.dropoffLocationId),
          pickupDatetime: pickupDate,
          dropoffDatetime: dropoffDate,
          vehicleModelId: Number(body.vehicleModelId),
          currency,
          discount: hasServerWebsiteDiscount ? null : (serverPromoDiscountAmount !== null ? String(serverPromoDiscountAmount) : null),
          totalAmount,
          notes: combinedNotes,
          source: "website" as const,
          status: initialStatus,
          paymentStatus: "UNPAID" as const,
          rateId: resolvedTier?.rateId ?? null,
          rateTierId: resolvedTier?.tierId ?? null,
          pricePerDay: resolvedTier ? String(resolvedTier.pricePerDay) : null,
          baseRate: serverBaseRate !== null ? String(serverBaseRate) : null,
          oneWayFee: resolvedOneWayFee !== null ? String(resolvedOneWayFee) : null,
          // Website discount snapshot columns
          websiteDiscountId: serverWebsiteDiscountId,
          websiteDiscountName: serverWebsiteDiscountName,
          websiteDiscountType: serverWebsiteDiscountType,
          websiteDiscountValue: serverWebsiteDiscountValue !== null ? String(serverWebsiteDiscountValue) : null,
          websiteDiscountAmount: serverWebsiteDiscountAmount !== null ? String(serverWebsiteDiscountAmount) : null,
          originalRentalPrice: serverOriginalRentalPrice !== null ? String(serverOriginalRentalPrice) : null,
          discountedRentalPrice: serverDiscountedRentalPrice !== null ? String(serverDiscountedRentalPrice) : null,
        })
        .returning({ id: bookingTable.id });

      if (validatedExtras.length > 0) {
        await tx.insert(bookingextraTable).values(
          validatedExtras.map((e) => ({
            bookingId: row!.id,
            extraId: e.extraId,
            quantity: e.quantity,
            priceAtBooking: String(e.price),
          })),
        );
      }

      return { bookingId: row!.id };
    }));
  } catch (err) {
    if (err instanceof Error && err.message === "PROMO_EXHAUSTED") {
      return res.status(422).json({ errors: ["Promo code has reached its usage limit"] });
    }
    if (err instanceof Error && err.message === "PROMO_INVALID") {
      return res.status(422).json({ errors: ["Invalid or inactive promo code"] });
    }
    throw err;
  }

  const reference = `TC-${String(bookingId).padStart(5, "0")}`;
  const vehicleName = `${modelRows[0]!.brand} ${modelRows[0]!.model}`;

  // Send confirmation email — entire prep is non-blocking; a failure here
  // cannot affect the already-sent 201 response.
  const emailParams = {
    toEmail: body.email!.trim(),
    toName: contactFullName,
    reference,
    bookingId,
    vehicle: vehicleName,
    pickupDatetime: body.pickupDatetime!,
    dropoffDatetime: body.dropoffDatetime!,
    estimatedExtras: validatedExtras.map((e) => ({
      name: e.name,
      quantity: e.quantity,
      pricePerUnit: e.price,
      pricingType: e.pricingType,
      maxDays: e.maxDays,
    })),
    insurancePlan: body.insurancePlan?.trim() || undefined,
    paymentMethod: body.paymentMethod?.trim() || undefined,
    flightNumber: body.flightNumber?.trim() || undefined,
    nationality: body.nationality?.trim() || undefined,
    age: body.age?.trim() || undefined,
    estimatedTotal: serverEstimatedTotal,
    resolvedBaseRate: serverBaseRate,
    oneWayFee: resolvedOneWayFee,
    discountAmount: hasServerWebsiteDiscount ? null : serverPromoDiscountAmount,
    websiteDiscountName: serverWebsiteDiscountName,
    websiteDiscountAmount: serverWebsiteDiscountAmount,
    originalRentalPrice: serverOriginalRentalPrice,
    discountedRentalPrice: serverDiscountedRentalPrice,
    promoCode: hasServerWebsiteDiscount ? undefined : (body.promoCode?.trim() || undefined),
    promoDiscountType: hasServerWebsiteDiscount ? null : promoDiscountType,
    promoDiscountValue: hasServerWebsiteDiscount ? null : promoDiscountValue,
    currency: body.currency ?? "GEL",
    pickupLocationId: Number(body.pickupLocationId),
    dropoffLocationId: Number(body.dropoffLocationId),
    rentalDays,
    generatedPassword: generatedPassword ?? null,
    customerPhone: body.phone?.trim() || undefined,
    bookingStatus: initialStatus,
    paymentStatus: "UNPAID",
    // Full notes including internal blocks — rendering layer strips [WEBSITE DATA]
    // and [RATE EXPIRED] before showing anything to the customer.
    bookingNotes: combinedNotes,
  };

  setImmediate(() => {
    (async () => {
      try {
        const { rows: locationRows } = await pool.query(
          `SELECT id, name, city FROM location WHERE id = ANY($1)`,
          [[emailParams.pickupLocationId, emailParams.dropoffLocationId]],
        );
        const locMap = new Map<number, { label: string; city: string }>(
          locationRows.map((l: any) => [l.id as number, { label: `${l.name}, ${l.city}`, city: String(l.city) }]),
        );
        const pickupLocData = locMap.get(emailParams.pickupLocationId);
        const pickupLocation = pickupLocData?.label ?? String(emailParams.pickupLocationId);
        const pickupCity = pickupLocData?.city;
        const dropoffLocation = locMap.get(emailParams.dropoffLocationId)?.label ?? String(emailParams.dropoffLocationId);

        const baseTotal: number | null = emailParams.resolvedBaseRate != null && emailParams.rentalDays > 0
          ? emailParams.resolvedBaseRate * emailParams.rentalDays
          : null;

        // ── Customer confirmation email ─────────────────────────────────────
        console.log(`[email] preparing_customer_email bookingId=${emailParams.bookingId}`);
        try {
          await sendBookingConfirmationEmail({
            toEmail: emailParams.toEmail,
            toName: emailParams.toName,
            reference: emailParams.reference,
            bookingId: emailParams.bookingId,
            vehicle: emailParams.vehicle,
            pickupLocation,
            dropoffLocation,
            pickupDatetime: emailParams.pickupDatetime,
            dropoffDatetime: emailParams.dropoffDatetime,
            pickupCity,
            extras: emailParams.estimatedExtras,
            insurancePlan: emailParams.insurancePlan,
            paymentMethod: emailParams.paymentMethod,
            flightNumber: emailParams.flightNumber,
            nationality: emailParams.nationality,
            age: emailParams.age,
            estimatedTotal: emailParams.estimatedTotal,
            baseTotal,
            oneWayFee: emailParams.oneWayFee,
            promoCode: emailParams.promoCode,
            discountAmount: emailParams.discountAmount,
            websiteDiscountName: emailParams.websiteDiscountName,
            websiteDiscountAmount: emailParams.websiteDiscountAmount,
            originalRentalPrice: emailParams.originalRentalPrice,
            discountedRentalPrice: emailParams.discountedRentalPrice,
            currency: emailParams.currency,
            generatedPassword: emailParams.generatedPassword,
            attachPdfVoucher: true,
            bookingStatus: emailParams.bookingStatus,
            paymentStatus: emailParams.paymentStatus,
            bookingNotes: emailParams.bookingNotes,
          });
          console.log(`[email] customer_email_sent bookingId=${emailParams.bookingId}`);
        } catch (err) {
          console.error(`[email] customer_email_failed bookingId=${emailParams.bookingId}`, err);
        }

        // ── Internal staff notification ─────────────────────────────────────
        try {
          await sendNewBookingInternalEmail({
            bookingId: emailParams.bookingId,
            referenceNumber: emailParams.reference,
            customerName: emailParams.toName,
            customerEmail: emailParams.toEmail,
            customerPhone: emailParams.customerPhone,
            pickupDate: new Date(emailParams.pickupDatetime),
            dropoffDate: new Date(emailParams.dropoffDatetime),
            pickupLocation,
            dropoffLocation,
            vehicleModel: emailParams.vehicle,
            totalAmount: emailParams.estimatedTotal ?? 0,
            currency: emailParams.currency,
            notes: emailParams.bookingNotes || undefined,
            bookingStatus: emailParams.bookingStatus,
          });
        } catch (err) {
          console.error(`[email] reservations_email_failed bookingId=${emailParams.bookingId}`, err);
        }
      } catch (err) {
        console.error(`[email] Failed to prepare/send confirmation ref=${emailParams.reference}:`, err);
      }
    })();
  });

  return res.status(201).json({
    success: true,
    bookingId,
    reference,
    vehicle: vehicleName,
    pickupDatetime: body.pickupDatetime,
    dropoffDatetime: body.dropoffDatetime,
    pickupLocationId: body.pickupLocationId,
    status: initialStatus,
    message: initialStatus === "CONFIRMED"
      ? "Your booking is confirmed."
      : "Your booking request has been received. We will confirm shortly.",
    generatedPassword,
  });
});

export default router;
