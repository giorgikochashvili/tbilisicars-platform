import { Router } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import { logAudit } from "../services/audit.service.js";
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
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "accounting_entry",
    entityId: entry.id,
    entityRef: `ACC-${String(entry.id).padStart(6, "0")}`,
    action: "accounting_entry.created",
    summary: `Admin created ${body.type} accounting entry: ${body.category} — ${body.currency} ${Number(body.amount).toFixed(2)}`,
    afterData: {
      type: body.type,
      category: body.category,
      amount: body.amount,
      currency: body.currency,
      entryDate: body.entryDate,
      ...(body.relatedBookingId ? { relatedBookingId: body.relatedBookingId } : {}),
    },
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
  const existing = await getAccountingEntry(id);
  const entry = await updateAccountingEntry(id, req.body);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "accounting_entry",
    entityId: id,
    entityRef: `ACC-${String(id).padStart(6, "0")}`,
    action: "accounting_entry.updated",
    summary: `Admin updated accounting entry ACC-${String(id).padStart(6, "0")} (${existing?.category ?? "?"})`,
    beforeData: existing
      ? { type: existing.type, category: existing.category, amount: existing.amount, currency: existing.currency }
      : null,
    afterData: req.body,
  });
  res.json(entry);
});

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete("/admin/accounting/:id", requireAdmin, requirePermission("canManageAccounting"), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const existing = await getAccountingEntry(id);
  const result = await deleteAccountingEntry(id);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "accounting_entry",
    entityId: id,
    entityRef: `ACC-${String(id).padStart(6, "0")}`,
    action: "accounting_entry.deleted",
    summary: `Admin deleted ${existing?.type ?? "?"} accounting entry ACC-${String(id).padStart(6, "0")}: ${existing?.category ?? "?"} — ${existing?.currency ?? "?"} ${Number(existing?.amount ?? 0).toFixed(2)}`,
    beforeData: existing
      ? { type: existing.type, category: existing.category, amount: existing.amount, currency: existing.currency, entryDate: existing.entryDate }
      : null,
  });
  res.json(result);
});

export default router;
