import { Router } from "express";
import {
  GetAdminDashboardSummaryResponse,
  GetAdminDashboardTodayResponse,
  GetAdminFleetSnapshotResponse,
  GetAdminFleetCalendarResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  getDashboardSummary,
  getFleetSnapshot,
  getTodayActivity,
  getFleetCalendar,
} from "../services/admin-dashboard.service.js";

const router = Router();

const VALID_CITIES = ["Tbilisi", "Kutaisi", "Batumi"] as const;

function parseCity(raw: unknown): string | undefined {
  if (typeof raw === "string" && (VALID_CITIES as readonly string[]).includes(raw)) {
    return raw;
  }
  return undefined;
}

function parseDateParam(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

router.get("/admin/dashboard/summary", requireAdmin, async (req, res) => {
  const city = parseCity(req.query.city);
  const summary = await getDashboardSummary(city);
  res.json(GetAdminDashboardSummaryResponse.parse(summary));
});

router.get("/admin/dashboard/today", requireAdmin, async (req, res) => {
  const city = parseCity(req.query.city);
  const rawDate = req.query.date;
  const date = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;
  const activity = await getTodayActivity(city, date);
  res.json(GetAdminDashboardTodayResponse.parse(activity));
});

router.get("/admin/dashboard/fleet-snapshot", requireAdmin, async (req, res) => {
  const city = parseCity(req.query.city);
  const snapshot = await getFleetSnapshot(city);
  res.json(GetAdminFleetSnapshotResponse.parse(snapshot));
});

router.get("/admin/dashboard/fleet-calendar", requireAdmin, async (req, res) => {
  const city = parseCity(req.query.city);
  const dateFrom = parseDateParam(req.query.dateFrom);
  const dateTo = parseDateParam(req.query.dateTo);

  const now = new Date();
  const start = dateFrom ?? now;
  const end = dateTo ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const data = await getFleetCalendar(start, end, city);

  // Serialize dates to ISO strings for the response (Zod zod.date() parse fails on Date objects post-JSON)
  res.json({
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    vehicles: data.vehicles.map((v) => ({
      vehicleId: v.vehicleId,
      licensePlate: v.licensePlate ?? null,
      modelName: v.modelName ?? null,
      brandName: v.brandName ?? null,
      status: v.status ?? null,
      bookings: v.bookings.map((b) => ({
        id: b.id,
        status: b.status,
        customerName: b.customerName,
        pickupDatetime: b.pickupDatetime instanceof Date ? b.pickupDatetime.toISOString() : b.pickupDatetime,
        dropoffDatetime: b.dropoffDatetime instanceof Date ? b.dropoffDatetime.toISOString() : b.dropoffDatetime,
      })),
    })),
  });
});

export default router;
