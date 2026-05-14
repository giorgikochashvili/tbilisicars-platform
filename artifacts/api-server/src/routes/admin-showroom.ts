import { Router } from "express";
import { z } from "zod/v4";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listSlides,
  getSlide,
  createSlide,
  updateSlide,
  deleteSlide,
  listPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  replacePlaylistItems,
  listPrices,
  upsertPrice,
  getSettings,
  updateSettings,
} from "../services/admin-showroom.service.js";

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const slideBodySchema = z.object({
  vehicleModelId: z.number().int().positive().nullable().optional(),
  titleEn: z.string().max(200).nullable().optional(),
  titleHe: z.string().max(200).nullable().optional(),
  titleAr: z.string().max(200).nullable().optional(),
  bodyEn: z.string().nullable().optional(),
  bodyHe: z.string().nullable().optional(),
  bodyAr: z.string().nullable().optional(),
  badgeEn: z.string().max(100).nullable().optional(),
  badgeHe: z.string().max(100).nullable().optional(),
  badgeAr: z.string().max(100).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const playlistBodySchema = z.object({
  name: z.string().min(1).max(200),
  active: z.boolean().optional(),
});

const playlistItemSchema = z.object({
  slideId: z.number().int().positive(),
  position: z.number().int(),
  durationSeconds: z.number().int().min(1).max(120).optional(),
});

const playlistItemsBodySchema = z.object({
  items: z.array(playlistItemSchema),
});

const priceBodySchema = z.object({
  priceUsd: z.string().nullable(),
  active: z.boolean().optional(),
});

const settingsBodySchema = z.object({
  usdToEurRate: z.string().min(1),
});

function parseId(raw: unknown): number | null {
  const n = parseInt(String(raw), 10);
  return isNaN(n) ? null : n;
}

// ─── Slides ───────────────────────────────────────────────────────────────────

router.get("/admin/showroom/slides", requireAdmin, async (_req, res) => {
  const slides = await listSlides();
  res.json(slides);
});

router.post("/admin/showroom/slides", requireAdmin, async (req, res) => {
  const parsed = slideBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const slide = await createSlide(parsed.data);
  res.status(201).json(slide);
});

router.put("/admin/showroom/slides/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = slideBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const slide = await updateSlide(id, parsed.data);
  res.json(slide);
});

router.delete("/admin/showroom/slides/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await deleteSlide(id);
  res.json({ message: "Deleted" });
});

// ─── Playlists ────────────────────────────────────────────────────────────────

router.get("/admin/showroom/playlists", requireAdmin, async (_req, res) => {
  const playlists = await listPlaylists();
  res.json(playlists);
});

router.post("/admin/showroom/playlists", requireAdmin, async (req, res) => {
  const parsed = playlistBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const playlist = await createPlaylist(parsed.data);
  res.status(201).json(playlist);
});

router.get("/admin/showroom/playlists/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const playlist = await getPlaylist(id);
  res.json(playlist);
});

router.put("/admin/showroom/playlists/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = playlistBodySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const playlist = await updatePlaylist(id, parsed.data);
  res.json(playlist);
});

router.delete("/admin/showroom/playlists/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await deletePlaylist(id);
  res.json({ message: "Deleted" });
});

router.put("/admin/showroom/playlists/:id/items", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = playlistItemsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const playlist = await replacePlaylistItems(id, parsed.data.items);
  res.json(playlist);
});

// ─── Prices ───────────────────────────────────────────────────────────────────

router.get("/admin/showroom/prices", requireAdmin, async (_req, res) => {
  const prices = await listPrices();
  res.json(prices);
});

router.put("/admin/showroom/prices/:vehicleModelId", requireAdmin, async (req, res) => {
  const modelId = parseId(req.params.vehicleModelId);
  if (!modelId) { res.status(400).json({ error: "Invalid vehicleModelId" }); return; }
  const parsed = priceBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const price = await upsertPrice(modelId, parsed.data);
  res.json(price);
});

// ─── Settings ─────────────────────────────────────────────────────────────────

router.get("/admin/showroom/settings", requireAdmin, async (_req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

router.put("/admin/showroom/settings", requireAdmin, async (req, res) => {
  const parsed = settingsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const settings = await updateSettings(parsed.data);
  res.json(settings);
});

export default router;
