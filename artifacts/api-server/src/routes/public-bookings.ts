/**
 * Public booking intake API — no authentication required.
 * These endpoints serve the public website booking form.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { createAdminBooking } from "../services/admin-bookings.service.js";
import { db, bookingextraTable } from "@workspace/db";
import { sendBookingConfirmationEmail } from "../services/email.service.js";

const router: IRouter = Router();

// ─── GET /api/public/booking-config ───────────────────────────────────────────
// Returns data needed to render the website booking form:
// locations, vehicle models available for website (with min price), extras

router.get("/public/booking-config", async (_req, res) => {
  const [locRows, modelRows, extraRows] = await Promise.all([
    pool.query(`SELECT id, name, city FROM location ORDER BY city, name`),
    pool.query(`
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
        COUNT(v.id) FILTER (WHERE v.status != 'INACTIVE') AS vehicle_count,
        price_info.min_price_per_day,
        price_info.price_currency
      FROM vehicle_model vm
      JOIN brand br ON br.id = vm.brand_id
      LEFT JOIN vehicle v ON v.vehicle_model_id = vm.id
      LEFT JOIN LATERAL (
        SELECT rt.price_per_day AS min_price_per_day, rt.currency AS price_currency
        FROM ratetier rt
        JOIN rate r ON r.id = rt.rate_id
        WHERE rt.vehicle_model_id = vm.id
          AND r.is_active = true
        ORDER BY rt.price_per_day ASC
        LIMIT 1
      ) price_info ON true
      WHERE vm.available_for_external_systems = true AND vm.active = true
      GROUP BY vm.id, br.name, price_info.min_price_per_day, price_info.price_currency
      ORDER BY br.name, vm.name
    `),
    pool.query(`
      SELECT id, name, description, price, currency, pricing_type
      FROM extra
      WHERE is_active = true
      ORDER BY name
    `),
  ]);

  res.json({
    locations: locRows.rows,
    vehicleModels: modelRows.rows,
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
    `SELECT id, code, discount_type, discount_value, valid_from, valid_until, active
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

  const days = Math.max(1, Math.ceil((dropoffDate.getTime() - pickupDate.getTime()) / (1000 * 60 * 60 * 24)));
  const pickupDateStr = pickupDate.toISOString().slice(0, 10);

  // Resolve best active rate tier for this vehicle model + dates + duration
  const { rows: tierRows } = await pool.query(
    `SELECT rt.id AS tier_id, rt.rate_id, rt.price_per_day, rt.currency,
            r.name AS rate_name, r.valid_from, r.valid_until
     FROM ratetier rt
     JOIN rate r ON r.id = rt.rate_id
     WHERE rt.vehicle_model_id = $1
       AND r.is_active = true
       AND r.valid_from::date <= $2::date
       AND r.valid_until::date >= $2::date
       AND rt.from_days <= $3
       AND (rt.to_days IS NULL OR rt.to_days = 0 OR rt.to_days >= $3)
     ORDER BY r.valid_from DESC, rt.from_days DESC
     LIMIT 1`,
    [body.vehicleModelId, pickupDateStr, days],
  );

  const tier = tierRows[0] ?? null;
  const basePricePerDay: number | null = tier ? Number(tier.price_per_day) : null;
  const baseCurrency: string | null = tier ? (tier.currency as string) : null;
  const baseTotal: number | null = basePricePerDay !== null ? basePricePerDay * days : null;

  let extrasTotal = 0;
  if (body.extras && body.extras.length > 0) {
    const extraIds = body.extras.map((e) => e.extraId);
    const { rows: extraRows } = await pool.query(
      `SELECT id, price FROM extra WHERE id = ANY($1) AND is_active = true`,
      [extraIds],
    );
    const extraPriceMap = new Map(extraRows.map((r: any) => [r.id, Number(r.price)]));
    for (const item of body.extras) {
      const price = extraPriceMap.get(item.extraId);
      if (price != null) {
        extrasTotal += price * item.quantity * days;
      }
    }
  }

  let promoDiscountType: string | null = null;
  let promoDiscountValue: number | null = null;
  let discountAmount: number | null = null;

  if (body.promoCode?.trim()) {
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
        discountAmount = promoDiscountType === "percentage"
          ? Math.round(baseTotal * (promoDiscountValue / 100) * 100) / 100
          : Math.min(promoDiscountValue, baseTotal);
      }
    }
  }

  const estimatedTotal: number | null = baseTotal !== null
    ? Math.max(0, baseTotal - (discountAmount ?? 0)) + extrasTotal
    : null;

  return res.json({
    quotable: baseTotal !== null,
    days,
    rateId: tier?.rate_id ?? null,
    rateTierId: tier?.tier_id ?? null,
    rateName: tier?.rate_name ?? null,
    basePricePerDay,
    baseCurrency,
    baseTotal,
    extrasTotal,
    promoDiscountType,
    promoDiscountValue,
    discountAmount,
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

  let discount: string | null = null;
  let promoDiscountType: string | null = null;
  let promoDiscountValue: number | null = null;
  if (body.promoCode) {
    const { rows: promoRows } = await pool.query(
      `SELECT id, discount_type, discount_value FROM promo WHERE code = $1 AND active = true LIMIT 1`,
      [body.promoCode.trim().toUpperCase()],
    );
    if (promoRows[0]) {
      discount = String(promoRows[0].discount_value);
      promoDiscountType = String(promoRows[0].discount_type);
      promoDiscountValue = Number(promoRows[0].discount_value);
    }
  }

  const rentalDays = Math.ceil((dropoffDate.getTime() - pickupDate.getTime()) / (1000 * 60 * 60 * 24));
  let extrasTotal = 0;
  const validatedExtras: Array<{ extraId: number; quantity: number; price: number; name: string; pricingType: string }> = [];
  if (body.extras && body.extras.length > 0) {
    const extraIds = body.extras.map((e) => e.extraId);
    const { rows: extraRows } = await pool.query(
      `SELECT id, name, price, pricing_type FROM extra WHERE id = ANY($1) AND is_active = true`,
      [extraIds],
    );
    const extraMap = new Map<number, { price: number; name: string; pricingType: string }>(
      extraRows.map((r: any) => [r.id as number, { price: Number(r.price), name: String(r.name), pricingType: String(r.pricing_type) }]),
    );
    for (const item of body.extras) {
      const ex = extraMap.get(item.extraId);
      if (ex != null) {
        const multiplier = ex.pricingType === "per_booking" ? 1 : rentalDays;
        extrasTotal += ex.price * item.quantity * multiplier;
        validatedExtras.push({ extraId: item.extraId, quantity: item.quantity, price: ex.price, name: ex.name, pricingType: ex.pricingType });
      }
    }
  }

  const contactFullName = `${body.firstName!.trim()} ${body.lastName!.trim()}`;
  const currency = body.currency ?? "GEL";

  const totalAmount: string | null = body.resolvedTotal != null
    ? String(body.resolvedTotal)
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

  const booking = await createAdminBooking({
    contactFullName,
    contactEmail: body.email!.trim(),
    contactPhone: body.phone!.trim(),
    customerEmail: body.email!.trim(),
    customerPhone: body.phone!.trim(),
    customerFullName: contactFullName,
    pickupLocationId: Number(body.pickupLocationId),
    dropoffLocationId: Number(body.dropoffLocationId),
    pickupDatetime: body.pickupDatetime!,
    dropoffDatetime: body.dropoffDatetime!,
    vehicleModelId: Number(body.vehicleModelId),
    currency,
    discount,
    totalAmount,
    notes: combinedNotes,
    source: "website",
    status: "PENDING",
    paymentStatus: "UNPAID",
    rateId: body.resolvedRateId ?? null,
    rateTierId: body.resolvedRateTierId ?? null,
    baseRate: body.resolvedBaseRate != null ? String(body.resolvedBaseRate) : null,
  });

  if (validatedExtras.length > 0) {
    await db.insert(bookingextraTable).values(
      validatedExtras.map((e) => ({
        bookingId: booking.id,
        extraId: e.extraId,
        quantity: e.quantity,
        priceAtBooking: String(e.price),
      })),
    );
  }

  const reference = `TC-${String(booking.id).padStart(5, "0")}`;
  const vehicleName = `${modelRows[0]!.brand} ${modelRows[0]!.model}`;

  // Send confirmation email (non-blocking — fire and forget)
  const { rows: locationRows } = await pool.query(
    `SELECT id, name, city FROM location WHERE id = ANY($1)`,
    [[body.pickupLocationId, body.dropoffLocationId]],
  );
  const locMap = new Map<number, { label: string; city: string }>(
    locationRows.map((l: any) => [l.id as number, { label: `${l.name}, ${l.city}`, city: String(l.city) }]),
  );
  const pickupLocData = locMap.get(Number(body.pickupLocationId));
  const pickupLocation = pickupLocData?.label ?? String(body.pickupLocationId);
  const pickupCity = pickupLocData?.city;
  const dropoffLocation = locMap.get(Number(body.dropoffLocationId))?.label ?? String(body.dropoffLocationId);

  // Base rate × days for email display (pre-discount, pre-extras)
  const baseTotal: number | null = body.resolvedBaseRate != null && rentalDays > 0
    ? body.resolvedBaseRate * rentalDays
    : null;

  // Compute discount amount for email display
  const emailDiscountAmount: number | null = (() => {
    if (!promoDiscountType || promoDiscountValue == null || baseTotal == null) return null;
    if (promoDiscountType === "percentage") {
      return Math.round(baseTotal * (promoDiscountValue / 100) * 100) / 100;
    }
    return Math.min(promoDiscountValue, baseTotal);
  })();

  sendBookingConfirmationEmail({
    toEmail: body.email!.trim(),
    toName: contactFullName,
    reference,
    vehicle: vehicleName,
    pickupLocation,
    dropoffLocation,
    pickupDatetime: body.pickupDatetime!,
    dropoffDatetime: body.dropoffDatetime!,
    pickupCity,
    extras: validatedExtras.map((e) => ({
      name: e.name,
      quantity: e.quantity,
      pricePerUnit: e.price,
      pricingType: e.pricingType,
    })),
    insurancePlan: body.insurancePlan?.trim() || undefined,
    paymentMethod: body.paymentMethod?.trim() || undefined,
    flightNumber: body.flightNumber?.trim() || undefined,
    nationality: body.nationality?.trim() || undefined,
    age: body.age?.trim() || undefined,
    estimatedTotal: body.resolvedTotal ?? null,
    baseTotal,
    promoCode: body.promoCode?.trim() || undefined,
    discountAmount: emailDiscountAmount,
    currency: body.currency ?? "GEL",
  }).catch((err) => console.error("[email] Unexpected error:", err));

  return res.status(201).json({
    success: true,
    bookingId: booking.id,
    reference,
    vehicle: vehicleName,
    pickupDatetime: body.pickupDatetime,
    dropoffDatetime: body.dropoffDatetime,
    pickupLocationId: body.pickupLocationId,
    status: "PENDING",
    message: "Your booking request has been received. We will confirm shortly.",
  });
});

export default router;
