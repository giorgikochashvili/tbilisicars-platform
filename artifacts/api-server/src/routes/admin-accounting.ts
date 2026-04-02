import { Router } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import {
  listAccountingEntries,
  getAccountingEntry,
  createAccountingEntry,
  updateAccountingEntry,
  deleteAccountingEntry,
  getExchangeRate,
  upsertExchangeRate,
  getAccountingSummary,
  seedDefaultExchangeRate,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
} from "../services/admin-accounting.service";

const router = Router();

// Seed default exchange rate on startup
seedDefaultExchangeRate().catch(console.error);

// ─── Categories metadata ───────────────────────────────────────────────────────

router.get("/admin/accounting/categories", requireAdmin, requirePermission("canViewAccounting"), (_req, res) => {
  res.json({
    income: [...INCOME_CATEGORIES],
    expense: [...EXPENSE_CATEGORIES],
  });
});

// ─── Exchange rate ─────────────────────────────────────────────────────────────

router.get("/admin/accounting/rates", requireAdmin, requirePermission("canViewAccounting"), async (_req, res) => {
  const rate = await getExchangeRate();
  res.json(rate);
});

router.put("/admin/accounting/rates", requireAdmin, requirePermission("canManageAccounting"), async (req, res) => {
  const { usdToGel, eurToGel } = req.body as { usdToGel: string; eurToGel: string };
  if (!usdToGel || !eurToGel) {
    res.status(400).json({ error: "usdToGel and eurToGel are required" });
    return;
  }
  const rate = await upsertExchangeRate(usdToGel, eurToGel);
  res.json(rate);
});

// ─── Summary (for dashboard) ───────────────────────────────────────────────────

router.get("/admin/accounting/summary", requireAdmin, requirePermission("canViewAccounting"), async (_req, res) => {
  const summary = await getAccountingSummary();
  res.json(summary);
});

// ─── List ──────────────────────────────────────────────────────────────────────

router.get("/admin/accounting", requireAdmin, requirePermission("canViewAccounting"), async (req, res) => {
  const { type, category, currency, dateFrom, dateTo, city, page, limit } =
    req.query as Record<string, string | undefined>;
  const entries = await listAccountingEntries({
    type: type as "INCOME" | "EXPENSE" | undefined,
    category,
    currency: currency as "GEL" | "USD" | "EUR" | undefined,
    dateFrom,
    dateTo,
    city: city || undefined,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 50,
  });
  res.json(entries);
});

// ─── Create ───────────────────────────────────────────────────────────────────

router.post("/admin/accounting", requireAdmin, requirePermission("canManageAccounting"), async (req, res) => {
  const body = req.body as {
    type: "INCOME" | "EXPENSE";
    category: string;
    amount: string;
    currency: "GEL" | "USD" | "EUR";
    entryDate: string;
    notes?: string;
    relatedBookingId?: number;
    relatedVehicleId?: number;
    relatedServiceId?: number;
    convertedGel?: string;
  };
  const entry = await createAccountingEntry({
    ...body,
    adminId: (req as any).admin?.id ?? null,
  });
  res.json(entry);
});

// ─── Single ───────────────────────────────────────────────────────────────────

router.get("/admin/accounting/:id", requireAdmin, requirePermission("canViewAccounting"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const entry = await getAccountingEntry(id);
  res.json(entry);
});

// ─── Update ───────────────────────────────────────────────────────────────────

router.patch("/admin/accounting/:id", requireAdmin, requirePermission("canManageAccounting"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const entry = await updateAccountingEntry(id, req.body);
  res.json(entry);
});

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete("/admin/accounting/:id", requireAdmin, requirePermission("canManageAccounting"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const result = await deleteAccountingEntry(id);
  res.json(result);
});

export default router;
