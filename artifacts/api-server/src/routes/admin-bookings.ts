import { Router } from "express";
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
