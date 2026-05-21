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
  listFixedExpenseTemplates,
  createFixedExpenseTemplate,
  updateFixedExpenseTemplate,
  deleteFixedExpenseTemplate,
  postFixedExpenseForMonth,
  getPostedMonthsForTemplate,
} from "../services/admin-accounting.service";
import { NotFoundError } from "../lib/errors.js";

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

// ─── Fixed Expense Templates ──────────────────────────────────────────────────
//
// Routes are defined BEFORE /admin/accounting/:id to prevent Express matching
// "fixed-expenses" as an id parameter.

// GET /admin/accounting/fixed-expenses — list templates
router.get(
  "/admin/accounting/fixed-expenses",
  requireAdmin,
  requirePermission("canViewAccounting"),
  async (req, res) => {
    const activeOnly = req.query.activeOnly === "true";
    const templates = await listFixedExpenseTemplates(activeOnly);
    res.json(templates);
  },
);

// POST /admin/accounting/fixed-expenses — create template
router.post(
  "/admin/accounting/fixed-expenses",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const body = req.body as {
      name?: string;
      category?: string;
      amount?: number;
      currency?: string;
      dueDay?: number;
      notes?: string;
    };

    const errors: string[] = [];
    if (!body.name?.trim()) errors.push("name is required");
    if (!body.category) errors.push("category is required");
    if (body.category && !(EXPENSE_CATEGORIES as readonly string[]).includes(body.category)) {
      errors.push(`category must be one of: ${EXPENSE_CATEGORIES.join(", ")}`);
    }
    if (!body.amount || isNaN(Number(body.amount)) || Number(body.amount) <= 0) {
      errors.push("amount must be a positive number");
    }
    if (!body.currency || !["GEL", "USD", "EUR"].includes(body.currency)) {
      errors.push("currency must be GEL, USD, or EUR");
    }
    if (body.dueDay !== undefined) {
      const d = Number(body.dueDay);
      if (!Number.isInteger(d) || d < 1 || d > 28) errors.push("dueDay must be an integer between 1 and 28");
    }
    if (errors.length > 0) {
      res.status(422).json({ errors });
      return;
    }

    const adminId = req.session.adminId ?? undefined;
    const template = await createFixedExpenseTemplate({
      name: body.name!.trim(),
      category: body.category!,
      amount: Number(body.amount),
      currency: body.currency as "GEL" | "USD" | "EUR",
      dueDay: body.dueDay ?? 1,
      notes: body.notes ?? null,
      createdById: adminId ?? null,
    });

    logAudit({
      actorId: adminId ?? null,
      entityType: "fixed_expense_template",
      entityId: template.id,
      entityRef: `FET-${String(template.id).padStart(5, "0")}`,
      action: "fixed_expense_template.created",
      summary: `Admin created fixed expense template: ${template.name} — ${template.currency} ${Number(template.amount).toFixed(2)}`,
      afterData: {
        name: template.name,
        category: template.category,
        amount: template.amount,
        currency: template.currency,
        dueDay: template.dueDay,
      },
    });

    res.status(201).json(template);
  },
);

// PATCH /admin/accounting/fixed-expenses/:id — update template
router.patch(
  "/admin/accounting/fixed-expenses/:id",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid template ID" }); return; }

    const body = req.body as {
      name?: string;
      category?: string;
      amount?: number;
      currency?: string;
      dueDay?: number;
      notes?: string | null;
      isActive?: boolean;
    };

    const errors: string[] = [];
    if (body.category !== undefined && !(EXPENSE_CATEGORIES as readonly string[]).includes(body.category)) {
      errors.push(`category must be one of: ${EXPENSE_CATEGORIES.join(", ")}`);
    }
    if (body.amount !== undefined && (isNaN(Number(body.amount)) || Number(body.amount) <= 0)) {
      errors.push("amount must be a positive number");
    }
    if (body.currency !== undefined && !["GEL", "USD", "EUR"].includes(body.currency)) {
      errors.push("currency must be GEL, USD, or EUR");
    }
    if (body.dueDay !== undefined) {
      const d = Number(body.dueDay);
      if (!Number.isInteger(d) || d < 1 || d > 28) errors.push("dueDay must be between 1 and 28");
    }
    if (errors.length > 0) { res.status(422).json({ errors }); return; }

    try {
      const adminId = req.session.adminId ?? undefined;
      const template = await updateFixedExpenseTemplate(id, {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.amount !== undefined && { amount: Number(body.amount) }),
        ...(body.currency !== undefined && { currency: body.currency as "GEL" | "USD" | "EUR" }),
        ...(body.dueDay !== undefined && { dueDay: Number(body.dueDay) }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      });

      const action =
        body.isActive === false ? "fixed_expense_template.deactivated"
        : body.isActive === true ? "fixed_expense_template.reactivated"
        : "fixed_expense_template.updated";

      logAudit({
        actorId: adminId ?? null,
        entityType: "fixed_expense_template",
        entityId: id,
        entityRef: `FET-${String(id).padStart(5, "0")}`,
        action,
        summary: `Admin ${action.split(".")[1]} fixed expense template FET-${String(id).padStart(5, "0")}: ${template.name}`,
        afterData: body,
      });

      res.json(template);
    } catch (err: any) {
      if (err instanceof NotFoundError) { res.status(404).json({ error: err.message }); return; }
      throw err;
    }
  },
);

// DELETE /admin/accounting/fixed-expenses/:id — delete template (blocked if has posts)
router.delete(
  "/admin/accounting/fixed-expenses/:id",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid template ID" }); return; }

    try {
      const adminId = req.session.adminId ?? undefined;
      const result = await deleteFixedExpenseTemplate(id);

      logAudit({
        actorId: adminId ?? null,
        entityType: "fixed_expense_template",
        entityId: id,
        entityRef: `FET-${String(id).padStart(5, "0")}`,
        action: "fixed_expense_template.deleted",
        summary: `Admin deleted fixed expense template FET-${String(id).padStart(5, "0")}`,
        beforeData: { id },
      });

      res.json(result);
    } catch (err: any) {
      if (err instanceof NotFoundError) { res.status(404).json({ error: err.message }); return; }
      if (err.code === "HAS_POSTS") { res.status(422).json({ error: err.message }); return; }
      throw err;
    }
  },
);

// POST /admin/accounting/fixed-expenses/:id/post — post template for a month
router.post(
  "/admin/accounting/fixed-expenses/:id/post",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid template ID" }); return; }

    const { month } = req.body as { month?: string };
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      res.status(422).json({ error: "month is required and must be in YYYY-MM format" });
      return;
    }

    try {
      const adminId = req.session.adminId ?? undefined;
      const { entry, template } = await postFixedExpenseForMonth(id, month, adminId);

      // Log the template post action
      logAudit({
        actorId: adminId ?? null,
        entityType: "fixed_expense_template",
        entityId: id,
        entityRef: `FET-${String(id).padStart(5, "0")}`,
        action: "fixed_expense_template.posted",
        summary: `Admin posted fixed expense "${template.name}" for ${month} — ${template.currency} ${Number(template.amount).toFixed(2)} → ACC-${String(entry.id).padStart(6, "0")}`,
        afterData: { month, entryId: entry.id, amount: template.amount, currency: template.currency },
      });

      // Log the resulting accounting entry creation
      logAudit({
        actorId: adminId ?? null,
        entityType: "accounting_entry",
        entityId: entry.id,
        entityRef: `ACC-${String(entry.id).padStart(6, "0")}`,
        action: "accounting_entry.created",
        summary: `Admin created EXPENSE accounting entry via fixed expense template "${template.name}" for ${month}: ${entry.currency} ${Number(entry.amount).toFixed(2)}`,
        afterData: {
          type: entry.type,
          category: entry.category,
          amount: entry.amount,
          currency: entry.currency,
          entryDate: entry.entryDate,
          fixedExpenseTemplateId: id,
          fixedExpenseMonth: month,
        },
      });

      res.status(201).json({ entry, template });
    } catch (err: any) {
      if (err instanceof NotFoundError) { res.status(404).json({ error: err.message }); return; }
      if (err.code === "DUPLICATE_POST" || err.message?.includes("already been posted") || err.message?.includes("inactive")) {
        res.status(422).json({ error: err.message });
        return;
      }
      throw err;
    }
  },
);

// GET /admin/accounting/fixed-expenses/:id/posted-months — months already posted
router.get(
  "/admin/accounting/fixed-expenses/:id/posted-months",
  requireAdmin,
  requirePermission("canViewAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid template ID" }); return; }
    try {
      const months = await getPostedMonthsForTemplate(id);
      res.json({ templateId: id, postedMonths: months });
    } catch (err: any) {
      if (err instanceof NotFoundError) { res.status(404).json({ error: err.message }); return; }
      throw err;
    }
  },
);

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
