import { Router } from "express";
import { z } from "zod/v4";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import {
  listSliderItems,
  getSliderItem,
  createSliderItem,
  updateSliderItem,
  deleteSliderItem,
  getSliderSettings,
  saveSliderSettings,
} from "../services/admin-featured-slider.service.js";

const router = Router();

const itemBodySchema = z.object({
  title: z.string().min(1).max(255),
  subtitle: z.string().max(500).nullable().optional(),
  badgeText: z.string().max(100).nullable().optional(),
  displayPriceText: z.string().min(1).max(100),
  ctaLabel: z.string().max(100).nullable().optional(),
  imageUrl: z.string().min(1).max(500),
  vehicleModelId: z.number().int().positive(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateItemBodySchema = itemBodySchema.partial();

const settingsBodySchema = z.object({
  sectionTitle: z.string().min(1).max(255),
  sectionSubtitle: z.string().max(1000),
  isSectionActive: z.boolean(),
});

// ─── GET /api/admin/featured-slider/settings ──────────────────────────────────

router.get(
  "/admin/featured-slider/settings",
  requireAdmin,
  requirePermission("canManageVehicles"),
  async (_req, res) => {
    const settings = await getSliderSettings();
    res.json(settings);
  },
);

// ─── PUT /api/admin/featured-slider/settings ──────────────────────────────────

router.put(
  "/admin/featured-slider/settings",
  requireAdmin,
  requirePermission("canManageVehicles"),
  async (req, res) => {
    const parsed = settingsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid settings", details: parsed.error.issues });
      return;
    }
    await saveSliderSettings(parsed.data);
    const settings = await getSliderSettings();
    res.json(settings);
  },
);

// ─── GET /api/admin/featured-slider ───────────────────────────────────────────

router.get(
  "/admin/featured-slider",
  requireAdmin,
  requirePermission("canManageVehicles"),
  async (_req, res) => {
    const items = await listSliderItems();
    res.json(items);
  },
);

// ─── POST /api/admin/featured-slider ──────────────────────────────────────────

router.post(
  "/admin/featured-slider",
  requireAdmin,
  requirePermission("canManageVehicles"),
  async (req, res) => {
    const parsed = itemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const item = await createSliderItem(parsed.data);
    res.status(201).json(item);
  },
);

// ─── PUT /api/admin/featured-slider/:id ───────────────────────────────────────

router.put(
  "/admin/featured-slider/:id",
  requireAdmin,
  requirePermission("canManageVehicles"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = updateItemBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const item = await updateSliderItem(id, parsed.data);
    res.json(item);
  },
);

// ─── DELETE /api/admin/featured-slider/:id ────────────────────────────────────

router.delete(
  "/admin/featured-slider/:id",
  requireAdmin,
  requirePermission("canManageVehicles"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await deleteSliderItem(id);
    res.json({ message: "Deleted" });
  },
);

export default router;
