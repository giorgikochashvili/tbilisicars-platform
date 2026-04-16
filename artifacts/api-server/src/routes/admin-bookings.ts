import { Router } from "express";
import { ZodError } from "zod";
import { pool } from "@workspace/db";
import {
  GetAdminBookingParams,
  GetAdminBookingResponse,
  ListAdminBookingsQueryParams,
  ListAdminBookingsResponse,
  CreateAdminBookingBody,
  UpdateAdminBookingParams,
  UpdateAdminBookingBody,
  UpdateAdminBookingResponse,
  UpdateAdminBookingStatusParams,
  UpdateAdminBookingStatusBody,
  UpdateAdminBookingStatusResponse,
  DeleteAdminBookingParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  getAdminBooking,
  listAdminBookings,
  createAdminBooking,
  updateAdminBooking,
  updateAdminBookingStatus,
  deleteAdminBooking,
  appendBookingPhotos,
} from "../services/admin-bookings.service.js";
import {
  createHandover,
  getHandoversForBooking,
  schedulePhotoLifecycle,
} from "../services/admin-handovers.service.js";
import { logAudit, bookingRef } from "../services/audit.service.js";

const router = Router();

const VALID_BOOKING_CITIES = ["Tbilisi", "Kutaisi", "Batumi"] as const;

router.get("/admin/bookings", requireAdmin, async (req, res) => {
  // Extract city before Zod parse (generated schema does not include it)
  const rawCity = typeof req.query.city === "string" ? req.query.city : undefined;
  const city = rawCity && (VALID_BOOKING_CITIES as readonly string[]).includes(rawCity) ? rawCity : undefined;
  const query = ListAdminBookingsQueryParams.parse(req.query);
  const result = await listAdminBookings({
    page: query.page,
    limit: query.limit,
    status: query.status,
    paymentStatus: query.paymentStatus,
    search: query.search,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    bookingId: query.bookingId,
    vehicleSearch: query.vehicleSearch,
    locationId: query.locationId,
    phoneSearch: query.phoneSearch,
    city,
  });
  res.json(ListAdminBookingsResponse.parse(result));
});

router.post("/admin/bookings", requireAdmin, async (req, res) => {
  let body: ReturnType<typeof CreateAdminBookingBody.parse>;
  try {
    body = CreateAdminBookingBody.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      console.error("[booking validation error] BODY:", JSON.stringify(req.body));
      console.error("[booking validation error] ISSUES:", JSON.stringify(err.issues));
    }
    throw err;
  }
  const booking = await createAdminBooking(body as any);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "booking",
    entityId: booking.id,
    entityRef: bookingRef(booking.id),
    action: "created",
    summary: `Admin created booking ${bookingRef(booking.id)}`,
    afterData: { status: booking.status, totalAmount: booking.totalAmount, currency: booking.currency },
  });
  res.status(201).json(booking);
});

router.get("/admin/bookings/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminBookingParams.parse(req.params);
  const booking = await getAdminBooking(id);
  res.json(GetAdminBookingResponse.parse(booking));
});

router.get("/admin/bookings/:id/document-data", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }
  const { rows } = await pool.query(
    `SELECT
      b.id, b.status, b.payment_status,
      b.contact_full_name, b.contact_email, b.contact_phone,
      b.pickup_datetime, b.dropoff_datetime,
      b.total_amount, b.currency, b.deposit,
      b.notes, b.source, b.document_type, b.document_number,
      u.full_name AS customer_name,
      u.email AS customer_email,
      v.id AS vehicle_id,
      v.license_plate,
      v.mileage AS vehicle_mileage,
      v.color AS vehicle_color,
      v.year AS vehicle_year,
      vm.name AS vehicle_model_name,
      br.name AS vehicle_brand_name,
      bm.name AS booking_model_name,
      bbr.name AS booking_brand_name,
      pl.name AS pickup_location,
      dl.name AS dropoff_location
    FROM booking b
    JOIN "user" u ON u.id = b.user_id
    LEFT JOIN vehicle v ON v.id = b.vehicle_id
    LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
    LEFT JOIN brand br ON br.id = vm.brand_id
    LEFT JOIN vehicle_model bm ON bm.id = b.vehicle_model_id
    LEFT JOIN brand bbr ON bbr.id = bm.brand_id
    JOIN location pl ON pl.id = b.pickup_location_id
    JOIN location dl ON dl.id = b.dropoff_location_id
    WHERE b.id = $1 AND b.deleted_at IS NULL`,
    [id],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }
  const { rows: extras } = await pool.query(
    `SELECT be.quantity, be.price_at_booking, e.name AS extra_name
     FROM bookingextra be
     JOIN extra e ON e.id = be.extra_id
     WHERE be.booking_id = $1`,
    [id],
  );
  const { rows: paySummary } = await pool.query(
    `SELECT
      COALESCE(SUM(amount::numeric) FILTER (WHERE payment_type IN ('BOOKING_PAYMENT','ADJUSTMENT')), 0)::numeric AS total_paid,
      COALESCE(SUM(amount::numeric) FILTER (WHERE payment_type = 'DEPOSIT_RECEIVED'), 0)::numeric AS deposit_received,
      COALESCE(SUM(amount::numeric) FILTER (WHERE payment_type = 'DEPOSIT_RETURNED'), 0)::numeric AS deposit_returned
     FROM booking_payment WHERE booking_id = $1`,
    [id],
  );
  res.json({ ...rows[0], extras, payment_summary: paySummary[0] });
});

router.get("/admin/bookings/:bookingId/payments/:paymentId/document-data", requireAdmin, async (req, res) => {
  const bookingId = parseInt(String(req.params.bookingId), 10);
  const paymentId = parseInt(String(req.params.paymentId), 10);
  if (!bookingId || isNaN(bookingId) || !paymentId || isNaN(paymentId)) {
    res.status(400).json({ error: "Invalid booking or payment ID" });
    return;
  }
  const { rows } = await pool.query(
    `SELECT
      bp.id AS payment_id,
      bp.booking_id,
      bp.payment_type,
      bp.amount,
      bp.currency,
      bp.converted_gel,
      bp.payment_date,
      bp.method,
      bp.notes,
      b.status AS booking_status,
      b.contact_full_name,
      b.contact_email,
      b.contact_phone,
      b.total_amount,
      b.deposit,
      u.full_name AS customer_name,
      u.email AS customer_email,
      v.id AS vehicle_id,
      v.license_plate,
      vm.name AS vehicle_model_name,
      br.name AS vehicle_brand_name,
      bm.name AS booking_model_name,
      bbr.name AS booking_brand_name
    FROM booking_payment bp
    JOIN booking b ON b.id = bp.booking_id
    JOIN "user" u ON u.id = b.user_id
    LEFT JOIN vehicle v ON v.id = b.vehicle_id
    LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
    LEFT JOIN brand br ON br.id = vm.brand_id
    LEFT JOIN vehicle_model bm ON bm.id = b.vehicle_model_id
    LEFT JOIN brand bbr ON bbr.id = bm.brand_id
    WHERE bp.id = $1 AND bp.booking_id = $2 AND b.deleted_at IS NULL`,
    [paymentId, bookingId],
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  res.json(rows[0]);
});

router.patch("/admin/bookings/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminBookingParams.parse(req.params);
  const body = UpdateAdminBookingBody.parse(req.body);
  const booking = await updateAdminBooking(id, body as any);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "booking",
    entityId: id,
    entityRef: bookingRef(id),
    action: "updated",
    summary: `Admin updated booking ${bookingRef(id)}`,
    afterData: { status: (booking as any).status },
  });
  res.json(UpdateAdminBookingResponse.parse(booking));
});

router.patch("/admin/bookings/:id/status", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminBookingStatusParams.parse(req.params);
  const { status } = UpdateAdminBookingStatusBody.parse(req.body);

  // Fetch current status for before snapshot
  const { rows: cur } = await pool.query<{ status: string }>(
    "SELECT status FROM booking WHERE id = $1 AND deleted_at IS NULL",
    [id],
  );
  const prevStatus = cur[0]?.status ?? null;

  const booking = await updateAdminBookingStatus(id, status as any);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "booking",
    entityId: id,
    entityRef: bookingRef(id),
    action: "status_changed",
    summary: prevStatus
      ? `Admin changed booking ${bookingRef(id)} status from ${prevStatus} to ${status}`
      : `Admin changed booking ${bookingRef(id)} status to ${status}`,
    beforeData: prevStatus ? { status: prevStatus } : null,
    afterData: { status },
  });
  res.json(UpdateAdminBookingStatusResponse.parse(booking));
});

router.delete("/admin/bookings/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminBookingParams.parse(req.params);
  const result = await deleteAdminBooking(id);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "booking",
    entityId: id,
    entityRef: bookingRef(id),
    action: "deleted",
    summary: `Admin deleted booking ${bookingRef(id)}`,
  });
  res.json(result);
});

// ─── Handover routes ──────────────────────────────────────────────────────────

router.get("/admin/bookings/:id/handovers", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }
  const result = await getHandoversForBooking(id);
  res.json(result);
});

router.post("/admin/bookings/:id/pickup", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }
  const { actionAt, mileage, fuelLevel, notes, photoUrls } = req.body as {
    actionAt?: string;
    mileage?: number | null;
    fuelLevel?: number | null;
    notes?: string | null;
    photoUrls?: string[];
  };
  if (!actionAt) {
    res.status(400).json({ error: "actionAt is required" });
    return;
  }
  const handover = await createHandover({
    bookingId: id,
    handoverType: "PICKUP",
    actionAt,
    mileage: mileage ?? null,
    fuelLevel: fuelLevel ?? null,
    performedByAdminId: req.session.adminId ?? null,
    notes: notes ?? null,
    photoUrls: photoUrls ?? [],
  });
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "booking",
    entityId: id,
    entityRef: bookingRef(id),
    action: "pickup",
    summary: `Admin recorded Pick Up for booking ${bookingRef(id)}`,
    afterData: { mileage, fuelLevel, photoCount: (photoUrls ?? []).length },
  });
  res.status(201).json(handover);
});

router.post("/admin/bookings/:id/dropoff", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }
  const { actionAt, mileage, fuelLevel, notes, photoUrls } = req.body as {
    actionAt?: string;
    mileage?: number | null;
    fuelLevel?: number | null;
    notes?: string | null;
    photoUrls?: string[];
  };
  if (!actionAt) {
    res.status(400).json({ error: "actionAt is required" });
    return;
  }
  const handover = await createHandover({
    bookingId: id,
    handoverType: "DROPOFF",
    actionAt,
    mileage: mileage ?? null,
    fuelLevel: fuelLevel ?? null,
    performedByAdminId: req.session.adminId ?? null,
    notes: notes ?? null,
    photoUrls: photoUrls ?? [],
  });
  schedulePhotoLifecycle(id, "DROPOFF");
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "booking",
    entityId: id,
    entityRef: bookingRef(id),
    action: "dropoff",
    summary: `Admin recorded Drop Off for booking ${bookingRef(id)}`,
    afterData: { mileage, fuelLevel, photoCount: (photoUrls ?? []).length },
  });
  res.status(201).json(handover);
});

// Append photos to a booking without touching booking_handover or status.
// Used for pre-pickup uploads and for adding more pickup photos after pickup
// has already been recorded. Hand-rolled (no zod codegen) to keep blast radius small.
router.post("/admin/bookings/:id/photos", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }
  const body = req.body as { photoType?: string; photoUrls?: unknown };
  const photoType = body.photoType;
  if (photoType !== "PICKUP" && photoType !== "RETURN" && photoType !== "GENERAL") {
    res.status(400).json({ error: "photoType must be PICKUP, RETURN, or GENERAL" });
    return;
  }
  if (!Array.isArray(body.photoUrls) || body.photoUrls.some((u) => typeof u !== "string")) {
    res.status(400).json({ error: "photoUrls must be an array of strings" });
    return;
  }
  const photoUrls = body.photoUrls as string[];
  if (photoUrls.length === 0) {
    res.status(400).json({ error: "At least one photoUrl is required" });
    return;
  }
  const result = await appendBookingPhotos(id, photoType, photoUrls);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "booking",
    entityId: id,
    entityRef: bookingRef(id),
    action: "photos_appended",
    summary: `Admin appended ${result.added} ${photoType.toLowerCase()} photo(s) to booking ${bookingRef(id)}`,
    afterData: { photoType, count: result.added },
  });
  res.status(201).json(result);
});

export default router;
