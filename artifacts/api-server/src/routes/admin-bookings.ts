import { Router } from "express";
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
} from "../services/admin-bookings.service.js";

const router = Router();

router.get("/admin/bookings", requireAdmin, async (req, res) => {
  const query = ListAdminBookingsQueryParams.parse(req.query);
  const result = await listAdminBookings({
    page: query.page,
    limit: query.limit,
    status: query.status,
    paymentStatus: query.paymentStatus,
    search: query.search,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  });
  res.json(ListAdminBookingsResponse.parse(result));
});

router.post("/admin/bookings", requireAdmin, async (req, res) => {
  const body = CreateAdminBookingBody.parse(req.body);
  const booking = await createAdminBooking(body as any);
  res.status(201).json(booking);
});

router.get("/admin/bookings/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminBookingParams.parse(req.params);
  const booking = await getAdminBooking(id);
  res.json(GetAdminBookingResponse.parse(booking));
});

router.get("/admin/bookings/:id/document-data", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
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
  const bookingId = parseInt(req.params.bookingId, 10);
  const paymentId = parseInt(req.params.paymentId, 10);
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
  res.json(UpdateAdminBookingResponse.parse(booking));
});

router.patch("/admin/bookings/:id/status", requireAdmin, async (req, res) => {
  const { id } = UpdateAdminBookingStatusParams.parse(req.params);
  const { status } = UpdateAdminBookingStatusBody.parse(req.body);
  const booking = await updateAdminBookingStatus(id, status as any);
  res.json(UpdateAdminBookingStatusResponse.parse(booking));
});

router.delete("/admin/bookings/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteAdminBookingParams.parse(req.params);
  const result = await deleteAdminBooking(id);
  res.json(result);
});

export default router;
