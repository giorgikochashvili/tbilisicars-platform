import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import { logAudit } from "../services/audit.service.js";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// ─── List partners ────────────────────────────────────────────────────────────
// GET /admin/partners?isActive=true&partnerRole=VEHICLE_OWNER&search=...

router.get(
  "/admin/partners",
  requireAdmin,
  requirePermission("canViewAccounting"),
  async (req, res) => {
    const { isActive, search, partnerRole } = req.query as Record<string, string | undefined>;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (isActive === "true") {
      params.push(true);
      conditions.push(`p.is_active = $${params.length}`);
    } else if (isActive === "false") {
      params.push(false);
      conditions.push(`p.is_active = $${params.length}`);
    }

    if (partnerRole) {
      params.push(partnerRole);
      conditions.push(`p.partner_role = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`p.name ILIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.partner_role    AS "partnerRole",
         p.type,
         p.contact_number  AS "contactNumber",
         p.contact_email   AS "contactEmail",
         p.is_active       AS "isActive",
         p.created_at      AS "createdAt",
         COUNT(v.id)::int  AS "ownedVehicleCount"
       FROM partner p
       LEFT JOIN vehicle v ON v.partner_id = p.id
       ${where}
       GROUP BY p.id
       ORDER BY p.name ASC`,
      params,
    );

    res.json(rows);
  },
);

// ─── Create partner ───────────────────────────────────────────────────────────

router.post(
  "/admin/partners",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const {
      name,
      partnerRole = "BROKER_REFERRER",
      type = "Individual",
      contactNumber,
      contactEmail,
      personalIdOrCompanyId,
      bankName,
      bankAccount,
      iban,
      accountHolderName,
      agreementNotes,
      generalNotes,
    } = req.body as Record<string, string | undefined>;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const validRoles = ["VEHICLE_OWNER", "BROKER_REFERRER", "OTHER"];
    if (!validRoles.includes(partnerRole as string)) {
      res.status(400).json({ error: `partnerRole must be one of: ${validRoles.join(", ")}` });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO partner
         (name, partner_role, type, contact_number, contact_email,
          personal_id_or_company_id, bank_name, bank_account, iban,
          account_holder_name, agreement_notes, general_notes, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
       RETURNING
         id, name,
         partner_role AS "partnerRole",
         type,
         contact_number  AS "contactNumber",
         contact_email   AS "contactEmail",
         personal_id_or_company_id AS "personalIdOrCompanyId",
         bank_name       AS "bankName",
         bank_account    AS "bankAccount",
         iban,
         account_holder_name AS "accountHolderName",
         agreement_notes AS "agreementNotes",
         general_notes   AS "generalNotes",
         is_active       AS "isActive",
         created_at      AS "createdAt",
         updated_at      AS "updatedAt"`,
      [
        name.trim(),
        partnerRole,
        type ?? "Individual",
        contactNumber ?? null,
        contactEmail ?? null,
        personalIdOrCompanyId ?? null,
        bankName ?? null,
        bankAccount ?? null,
        iban ?? null,
        accountHolderName ?? null,
        agreementNotes ?? null,
        generalNotes ?? null,
      ],
    );

    const partner = rows[0];

    logAudit({
      actorId: req.session.adminId ?? null,
      entityType: "partner",
      entityId: partner.id,
      entityRef: partner.name,
      action: "created",
      summary: `Partner "${partner.name}" (${partner.partnerRole}) created`,
      afterData: { name: partner.name, partnerRole: partner.partnerRole, type: partner.type },
    });

    res.status(201).json(partner);
  },
);

// ─── Get partner by id ────────────────────────────────────────────────────────

router.get(
  "/admin/partners/:id",
  requireAdmin,
  requirePermission("canViewAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid partner id" }); return; }

    const { rows: partnerRows } = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.partner_role              AS "partnerRole",
         p.type,
         p.contact_number            AS "contactNumber",
         p.contact_email             AS "contactEmail",
         p.personal_id_or_company_id AS "personalIdOrCompanyId",
         p.bank_name                 AS "bankName",
         p.bank_account              AS "bankAccount",
         p.iban,
         p.account_holder_name       AS "accountHolderName",
         p.agreement_notes           AS "agreementNotes",
         p.general_notes             AS "generalNotes",
         p.is_active                 AS "isActive",
         p.created_at                AS "createdAt",
         p.updated_at                AS "updatedAt"
       FROM partner p
       WHERE p.id = $1`,
      [id],
    );

    if (!partnerRows[0]) {
      res.status(404).json({ error: "Partner not found" });
      return;
    }

    const { rows: vehicleRows } = await pool.query(
      `SELECT
         v.id,
         v.license_plate  AS "licensePlate",
         vm.name          AS "modelName",
         br.name          AS "brandName",
         v.status
       FROM vehicle v
       LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
       LEFT JOIN brand br         ON br.id = vm.brand_id
       WHERE v.partner_id = $1
       ORDER BY v.license_plate ASC`,
      [id],
    );

    res.json({ ...partnerRows[0], ownedVehicles: vehicleRows });
  },
);

// ─── Update partner ───────────────────────────────────────────────────────────

router.patch(
  "/admin/partners/:id",
  requireAdmin,
  requirePermission("canManageAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid partner id" }); return; }

    // Fetch current state for audit
    const { rows: before } = await pool.query(
      "SELECT id, name, is_active AS \"isActive\", partner_role AS \"partnerRole\" FROM partner WHERE id = $1",
      [id],
    );
    if (!before[0]) { res.status(404).json({ error: "Partner not found" }); return; }
    const prev = before[0] as { id: number; name: string; isActive: boolean; partnerRole: string };

    const {
      name,
      partnerRole,
      type,
      contactNumber,
      contactEmail,
      personalIdOrCompanyId,
      bankName,
      bankAccount,
      iban,
      accountHolderName,
      agreementNotes,
      generalNotes,
      isActive,
    } = req.body as Record<string, unknown>;

    const setClauses: string[] = ["updated_at = now()"];
    const params: unknown[] = [];

    const setField = (col: string, val: unknown) => {
      params.push(val);
      setClauses.push(`${col} = $${params.length}`);
    };

    if (name !== undefined) setField("name", name);
    if (partnerRole !== undefined) setField("partner_role", partnerRole);
    if (type !== undefined) setField("type", type);
    if (contactNumber !== undefined) setField("contact_number", contactNumber);
    if (contactEmail !== undefined) setField("contact_email", contactEmail);
    if (personalIdOrCompanyId !== undefined) setField("personal_id_or_company_id", personalIdOrCompanyId);
    if (bankName !== undefined) setField("bank_name", bankName);
    if (bankAccount !== undefined) setField("bank_account", bankAccount);
    if (iban !== undefined) setField("iban", iban);
    if (accountHolderName !== undefined) setField("account_holder_name", accountHolderName);
    if (agreementNotes !== undefined) setField("agreement_notes", agreementNotes);
    if (generalNotes !== undefined) setField("general_notes", generalNotes);
    if (isActive !== undefined) setField("is_active", isActive);

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE partner SET ${setClauses.join(", ")}
       WHERE id = $${params.length}
       RETURNING
         id, name,
         partner_role AS "partnerRole",
         type,
         contact_number  AS "contactNumber",
         contact_email   AS "contactEmail",
         personal_id_or_company_id AS "personalIdOrCompanyId",
         bank_name       AS "bankName",
         bank_account    AS "bankAccount",
         iban,
         account_holder_name AS "accountHolderName",
         agreement_notes AS "agreementNotes",
         general_notes   AS "generalNotes",
         is_active       AS "isActive",
         created_at      AS "createdAt",
         updated_at      AS "updatedAt"`,
      params,
    );

    if (!rows[0]) { res.status(404).json({ error: "Partner not found" }); return; }

    const updated = rows[0] as { id: number; name: string; isActive: boolean };

    // Audit: deactivated / reactivated / updated
    let action = "updated";
    let summary = `Partner "${updated.name}" updated`;
    if (isActive !== undefined) {
      if (!isActive && prev.isActive) {
        action = "deactivated";
        summary = `Partner "${updated.name}" deactivated`;
      } else if (isActive && !prev.isActive) {
        action = "reactivated";
        summary = `Partner "${updated.name}" reactivated`;
      }
    }

    logAudit({
      actorId: req.session.adminId ?? null,
      entityType: "partner",
      entityId: id,
      entityRef: (updated as any).name,
      action,
      summary,
      beforeData: { name: prev.name, isActive: prev.isActive },
      afterData: { name: (updated as any).name, isActive: (updated as any).isActive },
    });

    res.json(rows[0]);
  },
);

// ─── List vehicles owned by partner ──────────────────────────────────────────

router.get(
  "/admin/partners/:id/vehicles",
  requireAdmin,
  requirePermission("canViewAccounting"),
  async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid partner id" }); return; }

    const { rows } = await pool.query(
      `SELECT
         v.id,
         v.license_plate  AS "licensePlate",
         vm.name          AS "modelName",
         br.name          AS "brandName",
         v.status,
         v.year,
         v.color
       FROM vehicle v
       LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
       LEFT JOIN brand br         ON br.id = vm.brand_id
       WHERE v.partner_id = $1
       ORDER BY v.license_plate ASC`,
      [id],
    );

    res.json(rows);
  },
);

export default router;
