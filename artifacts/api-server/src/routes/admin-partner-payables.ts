import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import { logAudit, bookingRef } from "../services/audit.service.js";
import {
  getExchangeRate,
  convertToGel,
} from "../services/admin-accounting.service.js";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// ─── List payables ────────────────────────────────────────────────────────────

router.get(
  "/admin/partners/payables",
  requireAdmin,
  requirePermission("canViewAccounting"),
  async (req, res) => {
    const { status, partner_id, page, limit } = req.query as Record<string, string | undefined>;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      conditions.push(`pp.status = $${params.length}`);
    }
    if (partner_id) {
      params.push(parseInt(partner_id, 10));
      conditions.push(`pp.partner_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const pageNum = Math.max(1, parseInt(page ?? "1", 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? "50", 10)));
    const offset = (pageNum - 1) * limitNum;

    params.push(limitNum, offset);

    const { rows } = await pool.query(
      `SELECT
         pp.id,
         pp.partner_id     AS "partnerId",
         p.name            AS "partnerName",
         pp.booking_id     AS "bookingId",
         pp.vehicle_id     AS "vehicleId",
         v.license_plate   AS "vehiclePlate",
         pp.source_income_accounting_entry_id AS "sourceIncomeAccountingEntryId",
         pp.amount,
         pp.currency,
         pp.status,
         pp.notes,
         pp.created_by_admin_id AS "createdByAdminId",
         pp.paid_by_admin_id    AS "paidByAdminId",
         pp.paid_at             AS "paidAt",
         pp.expense_accounting_entry_id AS "expenseAccountingEntryId",
         pp.created_at          AS "createdAt",
         pp.updated_at          AS "updatedAt"
       FROM partner_payable pp
       JOIN partner p   ON p.id  = pp.partner_id
       LEFT JOIN vehicle v ON v.id = pp.vehicle_id
       ${where}
       ORDER BY pp.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json(rows);
  },
);

// ─── Create payable ───────────────────────────────────────────────────────────

router.post(
  "/admin/partners/payables",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const {
      partnerId,
      bookingId,
      vehicleId,
      sourceIncomeAccountingEntryId,
      amount,
      currency = "GEL",
      notes,
    } = req.body as {
      partnerId?: number;
      bookingId?: number | null;
      vehicleId?: number | null;
      sourceIncomeAccountingEntryId?: number;
      amount?: number | string;
      currency?: string;
      notes?: string;
    };

    // ── Validation ──────────────────────────────────────────────────────────

    if (!partnerId || typeof partnerId !== "number") {
      res.status(400).json({ error: "partnerId is required" });
      return;
    }
    if (!sourceIncomeAccountingEntryId || typeof sourceIncomeAccountingEntryId !== "number") {
      res.status(400).json({ error: "sourceIncomeAccountingEntryId is required" });
      return;
    }

    const amountNum = typeof amount === "string" ? parseFloat(amount) : Number(amount ?? 0);
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const validCurrencies = ["GEL", "USD", "EUR"];
    if (!validCurrencies.includes(currency)) {
      res.status(400).json({ error: `currency must be one of: ${validCurrencies.join(", ")}` });
      return;
    }

    // Fetch source income entry
    const { rows: entryRows } = await pool.query(
      `SELECT ae.id, ae.type, ae.amount AS entry_amount, ae.currency AS entry_currency,
              ae.related_booking_id, ae.related_vehicle_id,
              b.vehicle_id AS booking_vehicle_id
       FROM accounting_entries ae
       LEFT JOIN booking b ON b.id = ae.related_booking_id
       WHERE ae.id = $1`,
      [sourceIncomeAccountingEntryId],
    );
    if (!entryRows[0]) {
      res.status(404).json({ error: "Source accounting entry not found" });
      return;
    }
    const entry = entryRows[0] as {
      id: number;
      type: string;
      related_booking_id: number | null;
      related_vehicle_id: number | null;
      booking_vehicle_id: number | null;
    };

    if (entry.type !== "INCOME") {
      res.status(400).json({ error: "Payables can only be created from INCOME accounting entries" });
      return;
    }

    // Check for duplicate non-canceled payable
    const { rows: dupRows } = await pool.query(
      `SELECT id, status FROM partner_payable
       WHERE source_income_accounting_entry_id = $1 AND status != 'CANCELED'`,
      [sourceIncomeAccountingEntryId],
    );
    if (dupRows[0]) {
      res
        .status(409)
        .json({
          error: `A payable already exists for this income entry (status: ${dupRows[0].status}). Only a canceled payable may be replaced.`,
        });
      return;
    }

    // Validate partnerId matches vehicle owner if vehicle has a partner assigned
    const resolvedVehicleId =
      vehicleId ?? entry.related_vehicle_id ?? entry.booking_vehicle_id ?? null;

    if (resolvedVehicleId) {
      const { rows: vRows } = await pool.query(
        "SELECT partner_id FROM vehicle WHERE id = $1",
        [resolvedVehicleId],
      );
      const vehiclePartnerId = vRows[0]?.partner_id ?? null;
      if (vehiclePartnerId !== null && vehiclePartnerId !== partnerId) {
        res.status(400).json({
          error: "Partner does not match the vehicle's assigned owner",
        });
        return;
      }
    }

    // Validate bookingId matches entry context if provided
    if (bookingId != null && entry.related_booking_id != null && bookingId !== entry.related_booking_id) {
      res.status(400).json({ error: "bookingId does not match the source income entry's booking" });
      return;
    }

    // Validate vehicleId matches entry context if provided
    const entryVehicleId = entry.related_vehicle_id ?? entry.booking_vehicle_id ?? null;
    if (vehicleId != null && entryVehicleId != null && vehicleId !== entryVehicleId) {
      res.status(400).json({ error: "vehicleId does not match the source income entry's vehicle" });
      return;
    }

    // ── Insert ──────────────────────────────────────────────────────────────

    const resolvedBookingId = bookingId ?? entry.related_booking_id ?? null;

    const { rows } = await pool.query(
      `INSERT INTO partner_payable
         (partner_id, booking_id, vehicle_id,
          source_income_accounting_entry_id,
          amount, currency, status, notes, created_by_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8)
       RETURNING
         id, partner_id AS "partnerId", booking_id AS "bookingId",
         vehicle_id AS "vehicleId",
         source_income_accounting_entry_id AS "sourceIncomeAccountingEntryId",
         amount, currency, status, notes,
         created_by_admin_id AS "createdByAdminId",
         created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        partnerId,
        resolvedBookingId,
        resolvedVehicleId,
        sourceIncomeAccountingEntryId,
        amountNum.toFixed(2),
        currency,
        notes ?? null,
        req.session.adminId ?? null,
      ],
    );

    const payable = rows[0];

    logAudit({
      actorId: req.session.adminId ?? null,
      entityType: "partner_payable",
      entityId: payable.id,
      action: "created",
      summary: `Partner payable #${payable.id} created (amount: ${amountNum} ${currency}, source income entry #${sourceIncomeAccountingEntryId})`,
      afterData: {
        partnerId,
        amount: amountNum,
        currency,
        sourceIncomeAccountingEntryId,
        status: "PENDING",
      },
    });

    res.status(201).json(payable);
  },
);

// ─── Get payable by id ────────────────────────────────────────────────────────

router.get(
  "/admin/partners/payables/:id",
  requireAdmin,
  requirePermission("canViewAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid payable id" }); return; }

    const { rows } = await pool.query(
      `SELECT
         pp.id,
         pp.partner_id     AS "partnerId",
         p.name            AS "partnerName",
         p.agreement_notes AS "partnerAgreementNotes",
         pp.booking_id     AS "bookingId",
         pp.vehicle_id     AS "vehicleId",
         v.license_plate   AS "vehiclePlate",
         pp.source_income_accounting_entry_id AS "sourceIncomeAccountingEntryId",
         pp.amount,
         pp.currency,
         pp.status,
         pp.notes,
         pp.created_by_admin_id AS "createdByAdminId",
         pp.paid_by_admin_id    AS "paidByAdminId",
         pp.paid_at             AS "paidAt",
         pp.expense_accounting_entry_id AS "expenseAccountingEntryId",
         pp.created_at          AS "createdAt",
         pp.updated_at          AS "updatedAt"
       FROM partner_payable pp
       JOIN partner p   ON p.id  = pp.partner_id
       LEFT JOIN vehicle v ON v.id = pp.vehicle_id
       WHERE pp.id = $1`,
      [id],
    );

    if (!rows[0]) { res.status(404).json({ error: "Payable not found" }); return; }
    res.json(rows[0]);
  },
);

// ─── Edit PENDING payable ─────────────────────────────────────────────────────

router.patch(
  "/admin/partners/payables/:id",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid payable id" }); return; }

    const { rows: cur } = await pool.query(
      "SELECT id, status, amount, currency, notes FROM partner_payable WHERE id = $1",
      [id],
    );
    if (!cur[0]) { res.status(404).json({ error: "Payable not found" }); return; }
    if (cur[0].status !== "PENDING") {
      res.status(400).json({ error: "Only PENDING payables can be edited" });
      return;
    }

    const { amount, currency, notes } = req.body as {
      amount?: number | string;
      currency?: string;
      notes?: string;
    };

    const setClauses: string[] = ["updated_at = now()"];
    const params: unknown[] = [];

    if (amount !== undefined) {
      const amountNum = typeof amount === "string" ? parseFloat(amount) : Number(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        res.status(400).json({ error: "amount must be a positive number" });
        return;
      }
      params.push(amountNum.toFixed(2));
      setClauses.push(`amount = $${params.length}`);
    }
    if (currency !== undefined) {
      const validCurrencies = ["GEL", "USD", "EUR"];
      if (!validCurrencies.includes(currency)) {
        res.status(400).json({ error: `currency must be one of: ${validCurrencies.join(", ")}` });
        return;
      }
      params.push(currency);
      setClauses.push(`currency = $${params.length}`);
    }
    if (notes !== undefined) {
      params.push(notes);
      setClauses.push(`notes = $${params.length}`);
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE partner_payable SET ${setClauses.join(", ")}
       WHERE id = $${params.length}
       RETURNING
         id, partner_id AS "partnerId", booking_id AS "bookingId",
         vehicle_id AS "vehicleId",
         source_income_accounting_entry_id AS "sourceIncomeAccountingEntryId",
         amount, currency, status, notes,
         paid_at AS "paidAt",
         expense_accounting_entry_id AS "expenseAccountingEntryId",
         updated_at AS "updatedAt"`,
      params,
    );

    logAudit({
      actorId: req.session.adminId ?? null,
      entityType: "partner_payable",
      entityId: id,
      action: "updated",
      summary: `Partner payable #${id} updated`,
      beforeData: { amount: cur[0].amount, currency: cur[0].currency, notes: cur[0].notes },
      afterData: { amount: rows[0]?.amount, currency: rows[0]?.currency, notes: rows[0]?.notes },
    });

    res.json(rows[0]);
  },
);

// ─── Cancel payable ───────────────────────────────────────────────────────────

router.post(
  "/admin/partners/payables/:id/cancel",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid payable id" }); return; }

    const { rows: cur } = await pool.query(
      "SELECT id, status FROM partner_payable WHERE id = $1",
      [id],
    );
    if (!cur[0]) { res.status(404).json({ error: "Payable not found" }); return; }
    if (cur[0].status !== "PENDING") {
      res.status(400).json({ error: "Only PENDING payables can be canceled" });
      return;
    }

    const { rows } = await pool.query(
      `UPDATE partner_payable SET status = 'CANCELED', updated_at = now()
       WHERE id = $1
       RETURNING id, status, updated_at AS "updatedAt"`,
      [id],
    );

    logAudit({
      actorId: req.session.adminId ?? null,
      entityType: "partner_payable",
      entityId: id,
      action: "canceled",
      summary: `Partner payable #${id} canceled`,
      beforeData: { status: "PENDING" },
      afterData: { status: "CANCELED" },
    });

    res.json(rows[0]);
  },
);

// ─── Mark as Paid ─────────────────────────────────────────────────────────────

router.post(
  "/admin/partners/payables/:id/mark-paid",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid payable id" }); return; }

    const adminId = req.session.adminId ?? null;

    // Run entire operation in a single transaction
    const client = await (pool as any).connect();
    try {
      await client.query("BEGIN");

      // Lock the row
      const { rows: ppRows } = await client.query(
        `SELECT
           pp.id, pp.partner_id, pp.booking_id, pp.vehicle_id,
           pp.source_income_accounting_entry_id,
           pp.amount, pp.currency, pp.status,
           pp.expense_accounting_entry_id,
           p.name AS partner_name,
           p.agreement_notes AS partner_agreement_notes,
           v.license_plate AS vehicle_plate
         FROM partner_payable pp
         JOIN partner p ON p.id = pp.partner_id
         LEFT JOIN vehicle v ON v.id = pp.vehicle_id
         WHERE pp.id = $1
         FOR UPDATE`,
        [id],
      );

      if (!ppRows[0]) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Payable not found" });
        return;
      }

      const pp = ppRows[0] as {
        id: number;
        partner_id: number;
        booking_id: number | null;
        vehicle_id: number | null;
        source_income_accounting_entry_id: number;
        amount: string;
        currency: string;
        status: string;
        expense_accounting_entry_id: number | null;
        partner_name: string;
        partner_agreement_notes: string | null;
        vehicle_plate: string | null;
      };

      if (pp.status !== "PENDING") {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Only PENDING payables can be marked as paid" });
        return;
      }

      if (pp.expense_accounting_entry_id !== null) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "This payable has already been paid (expense entry already exists)" });
        return;
      }

      // Get GEL equivalent using existing helpers
      const rate = await getExchangeRate();
      const amountNum = parseFloat(pp.amount);
      const currency = pp.currency as "GEL" | "USD" | "EUR";
      const convertedGel = rate ? convertToGel(amountNum, currency, rate) : amountNum;

      // Build auto-generated notes with full context
      const entryNotes = [
        `Partner: ${pp.partner_name}`,
        pp.booking_id ? `Booking: ${bookingRef(pp.booking_id)}` : null,
        pp.vehicle_plate ? `Vehicle: ${pp.vehicle_plate}` : null,
        `Source income entry: #${pp.source_income_accounting_entry_id}`,
        `Payable: #${pp.id}`,
      ].filter(Boolean).join(" | ");

      // Insert EXPENSE accounting entry
      const today = new Date().toISOString().slice(0, 10);
      const { rows: expRows } = await client.query(
        `INSERT INTO accounting_entries
           (type, category, amount, currency, converted_gel,
            entry_date, notes, related_booking_id, related_vehicle_id, admin_id)
         VALUES ('EXPENSE', 'Partner Vehicle Payout', $1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, type, category, amount, currency, converted_gel AS "convertedGel",
                   entry_date AS "entryDate", notes, related_booking_id AS "relatedBookingId",
                   related_vehicle_id AS "relatedVehicleId"`,
        [
          amountNum.toFixed(2),
          currency,
          convertedGel.toFixed(2),
          today,
          entryNotes,
          pp.booking_id,
          pp.vehicle_id,
          adminId,
        ],
      );

      const expenseEntry = expRows[0] as { id: number };

      // Update payable to PAID
      const { rows: updatedRows } = await client.query(
        `UPDATE partner_payable
         SET status = 'PAID',
             paid_at = now(),
             paid_by_admin_id = $1,
             expense_accounting_entry_id = $2,
             updated_at = now()
         WHERE id = $3
         RETURNING
           id, partner_id AS "partnerId", booking_id AS "bookingId",
           vehicle_id AS "vehicleId",
           source_income_accounting_entry_id AS "sourceIncomeAccountingEntryId",
           amount, currency, status,
           paid_at AS "paidAt",
           paid_by_admin_id AS "paidByAdminId",
           expense_accounting_entry_id AS "expenseAccountingEntryId",
           updated_at AS "updatedAt"`,
        [adminId, expenseEntry.id, id],
      );

      await client.query("COMMIT");

      // Audit logs (fire-and-forget, outside transaction)
      logAudit({
        actorId: adminId,
        entityType: "partner_payable",
        entityId: id,
        action: "marked_paid",
        summary: `Partner payable #${id} marked as paid — expense entry #${expenseEntry.id} created`,
        beforeData: { status: "PENDING", amount: pp.amount, currency: pp.currency },
        afterData: { status: "PAID", expenseAccountingEntryId: expenseEntry.id },
      });

      logAudit({
        actorId: adminId,
        entityType: "accounting_entry",
        entityId: expenseEntry.id,
        action: "partner_payout_created",
        summary: `Partner payout expense #${expenseEntry.id} auto-created from payable #${id} (${pp.partner_name})`,
        afterData: {
          partnerPayableId: id,
          partnerId: pp.partner_id,
          partnerName: pp.partner_name,
          amount: amountNum,
          currency,
          sourceIncomeEntryId: pp.source_income_accounting_entry_id,
        },
      });

      res.json({
        payable: updatedRows[0],
        expenseEntry: { id: expenseEntry.id },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
);

export default router;
