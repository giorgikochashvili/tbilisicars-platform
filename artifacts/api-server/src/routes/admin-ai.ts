/**
 * Super Admin AI — Phase 1 Read-Only Endpoints
 *
 * All routes are under /api/admin-ai/* and require an active admin session.
 * All responses are normalized JSON — no raw DB errors or stack traces.
 */

import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  getAISummary,
  getAIBookings,
  getAIBooking,
  getAIVehicles,
  getAICustomers,
  getAILogs,
} from "../services/admin-ai.service.js";

const router: IRouter = Router();

// ─── Shared error handler ─────────────────────────────────────────────────────

function safeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred";
}

// ─── GET /api/admin-ai/summary ────────────────────────────────────────────────
// Compact operational snapshot: booking counts, fleet status, parking, today's activity

router.get("/admin-ai/summary", requireAdmin, async (_req, res) => {
  try {
    const data = await getAISummary();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ─── GET /api/admin-ai/bookings ───────────────────────────────────────────────
// Filterable, paginated booking list
// Query: status, source, paymentStatus, dateFrom, dateTo, locationId, limit, offset

router.get("/admin-ai/bookings", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;

  const locationId = q.locationId ? parseInt(q.locationId, 10) : undefined;
  if (q.locationId && (isNaN(locationId!) || locationId! <= 0)) {
    res.status(400).json({ error: "locationId must be a positive integer" });
    return;
  }

  const limit = q.limit ? parseInt(q.limit, 10) : undefined;
  const offset = q.offset ? parseInt(q.offset, 10) : undefined;
  if ((q.limit && isNaN(limit!)) || (q.offset && isNaN(offset!))) {
    res.status(400).json({ error: "limit and offset must be integers" });
    return;
  }

  try {
    const data = await getAIBookings({
      status: q.status,
      source: q.source,
      paymentStatus: q.paymentStatus,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      locationId,
      limit,
      offset,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ─── GET /api/admin-ai/bookings/:id ───────────────────────────────────────────
// Deep single-booking view: customer, vehicle, pricing, payments, extras, handovers, audit

router.get("/admin-ai/bookings/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Booking ID must be a positive integer" });
    return;
  }

  try {
    const data = await getAIBooking(id);
    if (!data) {
      res.status(404).json({ error: `Booking #${id} not found` });
      return;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ─── GET /api/admin-ai/vehicles ───────────────────────────────────────────────
// All vehicles with display name, plate, status, location, parking zone, current booking
// Query: status, locationId

router.get("/admin-ai/vehicles", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;

  const locationId = q.locationId ? parseInt(q.locationId, 10) : undefined;
  if (q.locationId && (isNaN(locationId!) || locationId! <= 0)) {
    res.status(400).json({ error: "locationId must be a positive integer" });
    return;
  }

  try {
    const data = await getAIVehicles({
      status: q.status,
      locationId,
    });
    res.json({ total: data.length, vehicles: data });
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ─── GET /api/admin-ai/customers ──────────────────────────────────────────────
// All customers with contact info, booking count, last booking date
// Query: search, limit, offset

router.get("/admin-ai/customers", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;

  const limit = q.limit ? parseInt(q.limit, 10) : undefined;
  const offset = q.offset ? parseInt(q.offset, 10) : undefined;
  if ((q.limit && isNaN(limit!)) || (q.offset && isNaN(offset!))) {
    res.status(400).json({ error: "limit and offset must be integers" });
    return;
  }

  try {
    const data = await getAICustomers({
      search: q.search,
      limit,
      offset,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

// ─── GET /api/admin-ai/logs ───────────────────────────────────────────────────
// Structured audit feed + synthesized operational anomaly diagnostics
// Query: module (entity type label), dateFrom, dateTo, limit, offset

router.get("/admin-ai/logs", requireAdmin, async (req, res) => {
  const q = req.query as Record<string, string>;

  const limit = q.limit ? parseInt(q.limit, 10) : undefined;
  const offset = q.offset ? parseInt(q.offset, 10) : undefined;
  if ((q.limit && isNaN(limit!)) || (q.offset && isNaN(offset!))) {
    res.status(400).json({ error: "limit and offset must be integers" });
    return;
  }

  try {
    const data = await getAILogs({
      module: q.module,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      limit,
      offset,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: safeError(err) });
  }
});

export default router;
