import { Router } from "express";
import {
  GetAdminBookingParams,
  GetAdminBookingResponse,
  ListAdminBookingsQueryParams,
  ListAdminBookingsResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  getAdminBooking,
  listAdminBookings,
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

router.get("/admin/bookings/:id", requireAdmin, async (req, res) => {
  const { id } = GetAdminBookingParams.parse(req.params);
  const booking = await getAdminBooking(id);
  res.json(GetAdminBookingResponse.parse(booking));
});

export default router;
