/**
 * admin-availability.ts
 *
 * Admin routes for Availability Calendar — fleet capacity planning.
 *
 * Group metadata endpoints:
 *   GET    /admin/availability-groups
 *   POST   /admin/availability-groups/move-model   ← must be before /:id
 *   POST   /admin/availability-groups
 *   GET    /admin/availability-groups/:id
 *   PATCH  /admin/availability-groups/:id
 *   DELETE /admin/availability-groups/:id
 *   POST   /admin/availability-groups/:id/models
 *   DELETE /admin/availability-groups/:groupId/models/:modelId
 *
 * Calendar endpoints:
 *   GET    /admin/availability-calendar
 *   GET    /admin/availability-calendar/detail
 *
 * All endpoints require requireAdmin.
 * This service is READ-ONLY against booking/vehicle/location tables.
 * It writes only to availability_group, availability_group_vehicle_model,
 * and audit_logs (via logAudit).
 */

import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  canonicalizeCity,
  CANONICAL_CITIES,
  listAvailabilityGroups,
  getAvailabilityGroup,
  createAvailabilityGroup,
  updateAvailabilityGroup,
  deleteAvailabilityGroup,
  moveModel,
  getAvailabilityCalendar,
  getAvailabilityCellDetail,
} from "../services/admin-availability.service.js";

const router: IRouter = Router();

// ─── Group CRUD ───────────────────────────────────────────────────────────────

// GET /admin/availability-groups — list all groups with model IDs
router.get("/admin/availability-groups", requireAdmin, async (req, res) => {
  try {
    const groups = await listAvailabilityGroups();
    res.json({ groups });
  } catch (err) {
    console.error("[availability] listGroups error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /admin/availability-groups/move-model — atomic move (must be before /:id)
router.post(
  "/admin/availability-groups/move-model",
  requireAdmin,
  async (req, res) => {
    const { vehicleModelId, targetGroupId } = req.body as {
      vehicleModelId?: number;
      targetGroupId?: number;
    };

    if (
      typeof vehicleModelId !== "number" ||
      typeof targetGroupId !== "number"
    ) {
      res
        .status(400)
        .json({ error: "vehicleModelId and targetGroupId are required numbers" });
      return;
    }

    try {
      const result = await moveModel(
        vehicleModelId,
        targetGroupId,
        req.session.adminId ?? null,
      );
      if (!result.moved && result.reason === "TARGET_NOT_FOUND") {
        res.status(404).json({ error: "Target group not found" });
        return;
      }
      res.json(result);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err as NodeJS.ErrnoException & { code?: string }).code === "NOT_FOUND"
      ) {
        res.status(404).json({ error: "Target group not found" });
        return;
      }
      console.error("[availability] moveModel error", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /admin/availability-groups — create group
router.post("/admin/availability-groups", requireAdmin, async (req, res) => {
  const { name, sortOrder } = req.body as {
    name?: string;
    sortOrder?: number;
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    const group = await createAvailabilityGroup(
      { name, sortOrder },
      req.session.adminId ?? null,
    );
    res.status(201).json({ group });
  } catch (err) {
    console.error("[availability] createGroup error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/availability-groups/:id
router.get(
  "/admin/availability-groups/:id",
  requireAdmin,
  async (req, res) => {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }
    try {
      const group = await getAvailabilityGroup(id);
      if (!group) {
        res.status(404).json({ error: "Group not found" });
        return;
      }
      res.json({ group });
    } catch (err) {
      console.error("[availability] getGroup error", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /admin/availability-groups/:id — update name / sortOrder / isActive
router.patch(
  "/admin/availability-groups/:id",
  requireAdmin,
  async (req, res) => {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }

    const { name, isActive, sortOrder } = req.body as {
      name?: string;
      isActive?: boolean;
      sortOrder?: number;
    };

    try {
      const updated = await updateAvailabilityGroup(
        id,
        { name, isActive, sortOrder },
        req.session.adminId ?? null,
      );
      if (!updated) {
        res.status(404).json({ error: "Group not found" });
        return;
      }
      res.json({ group: updated });
    } catch (err) {
      console.error("[availability] updateGroup error", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /admin/availability-groups/:id
router.delete(
  "/admin/availability-groups/:id",
  requireAdmin,
  async (req, res) => {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }
    try {
      const deleted = await deleteAvailabilityGroup(
        id,
        req.session.adminId ?? null,
      );
      if (!deleted) {
        res.status(404).json({ error: "Group not found" });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[availability] deleteGroup error", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ─── Calendar endpoints ───────────────────────────────────────────────────────

// GET /admin/availability-calendar
router.get("/admin/availability-calendar", requireAdmin, async (req, res) => {
  const { city, startDate, endDate } = req.query as Record<
    string,
    string | undefined
  >;

  // Validate city
  const validCities = [...CANONICAL_CITIES, "All"];
  if (!city || !validCities.includes(city)) {
    res.status(400).json({
      error: `city must be one of: ${validCities.join(", ")}`,
    });
    return;
  }

  // Validate date shape (YYYY-MM-DD)
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!startDate || !ISO_DATE.test(startDate)) {
    res
      .status(400)
      .json({ error: "startDate must be a valid YYYY-MM-DD date" });
    return;
  }
  if (!endDate || !ISO_DATE.test(endDate)) {
    res.status(400).json({ error: "endDate must be a valid YYYY-MM-DD date" });
    return;
  }

  if (endDate < startDate) {
    res.status(400).json({ error: "endDate must be >= startDate" });
    return;
  }

  // Validate max range (60 days)
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  const dayDiff =
    (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000) + 1;
  if (dayDiff > 60) {
    res
      .status(400)
      .json({ error: "Date range must not exceed 60 days" });
    return;
  }

  try {
    const result = await getAvailabilityCalendar({ city, startDate, endDate });
    res.json(result);
  } catch (err) {
    console.error("[availability] getCalendar error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /admin/availability-calendar/detail
router.get(
  "/admin/availability-calendar/detail",
  requireAdmin,
  async (req, res) => {
    const { groupId, city, date } = req.query as Record<
      string,
      string | undefined
    >;

    const parsedGroupId = groupId ? parseInt(groupId, 10) : NaN;
    if (isNaN(parsedGroupId)) {
      res.status(400).json({ error: "groupId must be a number" });
      return;
    }

    if (!city || !canonicalizeCity(city)) {
      res.status(400).json({
        error: `city must be one of: ${CANONICAL_CITIES.join(", ")}`,
      });
      return;
    }

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (!date || !ISO_DATE.test(date)) {
      res.status(400).json({ error: "date must be a valid YYYY-MM-DD date" });
      return;
    }

    try {
      const detail = await getAvailabilityCellDetail({
        groupId: parsedGroupId,
        city,
        date,
      });
      if (!detail) {
        res.status(404).json({ error: "Group not found" });
        return;
      }
      res.json(detail);
    } catch (err) {
      console.error("[availability] getCellDetail error", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
