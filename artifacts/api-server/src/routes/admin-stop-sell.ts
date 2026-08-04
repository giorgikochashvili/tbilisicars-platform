/**
 * admin-stop-sell.ts
 *
 * Admin CRUD routes for Stop Sell rules.
 * Every endpoint requires: requireAdmin + requirePermission("canManageRates").
 *
 * GET    /api/admin/stop-sell          — list all rules
 * POST   /api/admin/stop-sell          — create a rule
 * PATCH  /api/admin/stop-sell/:id      — partial update
 * DELETE /api/admin/stop-sell/:id      — delete
 */

import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import {
  ALLOWED_STOP_SELL_CITIES,
  listStopSells,
  createStopSell,
  updateStopSell,
  deleteStopSell,
} from "../services/admin-stop-sell.service.js";
import { NotFoundError } from "../lib/errors.js";

const router: IRouter = Router();

// ─── Inline validation helpers ────────────────────────────────────────────────

function validateCities(cities: unknown[]): string {
  for (const city of cities) {
    if (!(ALLOWED_STOP_SELL_CITIES as readonly unknown[]).includes(city)) {
      return `Invalid city "${String(city)}". Allowed values: ${ALLOWED_STOP_SELL_CITIES.join(", ")}.`;
    }
  }
  return "";
}

// ─── GET /api/admin/stop-sell ─────────────────────────────────────────────────

router.get(
  "/admin/stop-sell",
  requireAdmin,
  requirePermission("canManageRates"),
  async (_req, res) => {
    const rules = await listStopSells();
    res.json(rules);
  },
);

// ─── POST /api/admin/stop-sell ────────────────────────────────────────────────

router.post(
  "/admin/stop-sell",
  requireAdmin,
  requirePermission("canManageRates"),
  async (req, res) => {
    const body = req.body as {
      name?: string | null;
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
      vehicleModelIds?: unknown;
      cities?: unknown;
    };

    // Required field checks
    if (!body.startDate || typeof body.startDate !== "string") {
      return res.status(422).json({ error: "startDate is required (YYYY-MM-DD)" });
    }
    if (!body.endDate || typeof body.endDate !== "string") {
      return res.status(422).json({ error: "endDate is required (YYYY-MM-DD)" });
    }
    if (!Array.isArray(body.vehicleModelIds) || body.vehicleModelIds.length === 0) {
      return res.status(422).json({ error: "vehicleModelIds must be a non-empty array" });
    }
    if (!Array.isArray(body.cities) || body.cities.length === 0) {
      return res.status(422).json({ error: "cities must be a non-empty array" });
    }

    const cityError = validateCities(body.cities);
    if (cityError) return res.status(422).json({ error: cityError });

    const vehicleModelIds = (body.vehicleModelIds as unknown[]).map(Number).filter(
      (n) => Number.isInteger(n) && n > 0,
    );
    if (vehicleModelIds.length !== body.vehicleModelIds.length) {
      return res.status(422).json({ error: "vehicleModelIds must be positive integers" });
    }

    try {
      const rule = await createStopSell(
        {
          name: typeof body.name === "string" ? body.name : null,
          startDate: body.startDate,
          endDate: body.endDate,
          isActive: body.isActive !== false,
          vehicleModelIds,
          cities: body.cities as string[],
        },
        req.session.adminId ?? null,
      );
      return res.status(201).json(rule);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("VALIDATION:")) {
        return res.status(422).json({ error: msg.replace("VALIDATION: ", "") });
      }
      throw err;
    }
  },
);

// ─── PATCH /api/admin/stop-sell/:id ──────────────────────────────────────────

router.patch(
  "/admin/stop-sell/:id",
  requireAdmin,
  requirePermission("canManageRates"),
  async (req, res) => {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id) || id <= 0) {
      return res.status(422).json({ error: "Invalid id" });
    }

    const body = req.body as {
      name?: string | null;
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
      vehicleModelIds?: unknown;
      cities?: unknown;
    };

    // Validate cities if provided
    if (body.cities !== undefined) {
      if (!Array.isArray(body.cities) || body.cities.length === 0) {
        return res.status(422).json({ error: "cities must be a non-empty array" });
      }
      const cityError = validateCities(body.cities);
      if (cityError) return res.status(422).json({ error: cityError });
    }

    // Validate vehicleModelIds if provided
    let vehicleModelIds: number[] | undefined;
    if (body.vehicleModelIds !== undefined) {
      if (!Array.isArray(body.vehicleModelIds) || body.vehicleModelIds.length === 0) {
        return res.status(422).json({ error: "vehicleModelIds must be a non-empty array" });
      }
      vehicleModelIds = (body.vehicleModelIds as unknown[]).map(Number).filter(
        (n) => Number.isInteger(n) && n > 0,
      );
      if (vehicleModelIds.length !== body.vehicleModelIds.length) {
        return res.status(422).json({ error: "vehicleModelIds must be positive integers" });
      }
    }

    try {
      const rule = await updateStopSell(
        id,
        {
          name: body.name,
          startDate: body.startDate,
          endDate: body.endDate,
          isActive: body.isActive,
          vehicleModelIds,
          cities: Array.isArray(body.cities) ? (body.cities as string[]) : undefined,
        },
        req.session.adminId ?? null,
      );
      return res.json(rule);
    } catch (err: unknown) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("VALIDATION:")) {
        return res.status(422).json({ error: msg.replace("VALIDATION: ", "") });
      }
      throw err;
    }
  },
);

// ─── DELETE /api/admin/stop-sell/:id ─────────────────────────────────────────

router.delete(
  "/admin/stop-sell/:id",
  requireAdmin,
  requirePermission("canManageRates"),
  async (req, res) => {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id) || id <= 0) {
      return res.status(422).json({ error: "Invalid id" });
    }

    try {
      await deleteStopSell(id, req.session.adminId ?? null);
      return res.status(204).send();
    } catch (err: unknown) {
      if (err instanceof NotFoundError) {
        return res.status(404).json({ error: err.message });
      }
      throw err;
    }
  },
);

export default router;
