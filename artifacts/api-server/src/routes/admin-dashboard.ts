import { Router } from "express";
import {
  GetAdminDashboardSummaryResponse,
  GetAdminDashboardTodayResponse,
  GetAdminFleetSnapshotResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  getDashboardSummary,
  getFleetSnapshot,
  getTodayActivity,
} from "../services/admin-dashboard.service.js";

const router = Router();

router.get("/admin/dashboard/summary", requireAdmin, async (_req, res) => {
  const summary = await getDashboardSummary();
  res.json(GetAdminDashboardSummaryResponse.parse(summary));
});

router.get("/admin/dashboard/today", requireAdmin, async (_req, res) => {
  const activity = await getTodayActivity();
  res.json(GetAdminDashboardTodayResponse.parse(activity));
});

router.get("/admin/dashboard/fleet-snapshot", requireAdmin, async (_req, res) => {
  const snapshot = await getFleetSnapshot();
  res.json(GetAdminFleetSnapshotResponse.parse(snapshot));
});

export default router;
