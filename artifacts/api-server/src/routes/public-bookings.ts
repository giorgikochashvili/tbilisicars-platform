/**
 * Public booking intake API — no authentication required.
 * These endpoints serve the public website booking form.
 */
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { createAdminBooking } from "../services/admin-bookings.service.js";
import { db, bookingextraTable, extraTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ─── GET /api/public/booking-config ───────────────────────────────────────────
// Returns data needed to render the website booking form:
// locations, vehicle models available for website, extras

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
        -- Check if any active vehicle of this model exists
        COUNT(v.id) FILTER (WHERE v.status != 'INACTIVE') AS vehicle_count
      FROM vehicle_model vm
      JOIN brand br ON br.id = vm.brand_id
      LEFT JOIN vehicle v ON v.vehicle_model_id = vm.id
      WHERE vm.available_for_external_systems = true AND vm.active = true
      GROUP BY vm.id, br.name
      HAVING COUNT(v.id) FILTER (WHERE v.status != 'INACTIVE') > 0
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

  // Date validity check
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
  };

  // ── Validate required fields ────────────────────────────────────────────────
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

  // ── Date validation ─────────────────────────────────────────────────────────
  const pickupDate = new Date(body.pickupDatetime!);
  const dropoffDate = new Date(body.dropoffDatetime!);

  if (isNaN(pickupDate.getTime()) || isNaN(dropoffDate.getTime())) {
    return res.status(422).json({ errors: ["Invalid date format"] });
  }
  if (dropoffDate <= pickupDate) {
    return res.status(422).json({ errors: ["Drop-off date must be after pickup date"] });
  }

  // ── Basic email format validation ───────────────────────────────────────────
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email!)) {
    return res.status(422).json({ errors: ["Invalid email address"] });
  }

  // ── Validate vehicle model is available for website ─────────────────────────
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

  // ── Resolve promo discount ──────────────────────────────────────────────────
  let discount: string | null = null;
  if (body.promoCode) {
    const { rows: promoRows } = await pool.query(
      `SELECT id, discount_type, discount_value FROM promo WHERE code = $1 AND active = true LIMIT 1`,
      [body.promoCode.trim().toUpperCase()],
    );
    if (promoRows[0]) {
      discount = String(promoRows[0].discount_value);
    }
  }

  // ── Calculate extras cost ───────────────────────────────────────────────────
  let extrasTotal = 0;
  const validatedExtras: Array<{ extraId: number; quantity: number; price: number }> = [];
  if (body.extras && body.extras.length > 0) {
    const extraIds = body.extras.map((e) => e.extraId);
    const { rows: extraRows } = await pool.query(
      `SELECT id, price FROM extra WHERE id = ANY($1) AND is_active = true`,
      [extraIds],
    );
    const extraPriceMap = new Map(extraRows.map((r: any) => [r.id, Number(r.price)]));
    const days = Math.ceil((dropoffDate.getTime() - pickupDate.getTime()) / (1000 * 60 * 60 * 24));
    for (const item of body.extras) {
      const price = extraPriceMap.get(item.extraId);
      if (price != null) {
        extrasTotal += price * item.quantity * days;
        validatedExtras.push({ extraId: item.extraId, quantity: item.quantity, price });
      }
    }
  }

  // ── Create the CRM booking ──────────────────────────────────────────────────
  const contactFullName = `${body.firstName!.trim()} ${body.lastName!.trim()}`;
  const currency = body.currency ?? "GEL";

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
    totalAmount: extrasTotal > 0 ? String(extrasTotal) : null,
    notes: body.notes?.trim() || null,
    source: "website",
    status: "PENDING",
    paymentStatus: "UNPAID",
  });

  // ── Attach extras to the booking ────────────────────────────────────────────
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

  return res.status(201).json({
    success: true,
    bookingId: booking.id,
    reference: `TC-${String(booking.id).padStart(5, "0")}`,
    vehicle: `${modelRows[0]!.brand} ${modelRows[0]!.model}`,
    pickupDatetime: body.pickupDatetime,
    dropoffDatetime: body.dropoffDatetime,
    status: "PENDING",
    message: "Your booking request has been received. We will confirm shortly.",
  });
});

export default router;
