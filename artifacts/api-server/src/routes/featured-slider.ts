import { Router } from "express";
import {
  getSliderSettings,
  listActiveSliderItems,
} from "../services/admin-featured-slider.service.js";

const router = Router();

// ─── GET /api/public/featured-slider ─────────────────────────────────────────

router.get("/public/featured-slider", async (_req, res) => {
  const settings = await getSliderSettings();

  if (!settings.isSectionActive) {
    res.json({ settings, items: [] });
    return;
  }

  const items = await listActiveSliderItems();
  res.json({ settings, items });
});

export default router;
