import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// ─── GET /api/admin/audit-logs ────────────────────────────────────────────────
// Filters: entityType, action, actorId, entityRef (search), dateFrom, dateTo
// Pagination: limit (default 50), offset (default 0)

router.get("/admin/audit-logs", requireAdmin, async (req, res) => {
  const {
    entityType,
    action,
    actorId,
    entityRef,
    dateFrom,
    dateTo,
    limit: limitRaw = "50",
    offset: offsetRaw = "0",
  } = req.query as Record<string, string>;

  const limit = Math.min(Math.max(parseInt(limitRaw) || 50, 1), 200);
  const offset = Math.max(parseInt(offsetRaw) || 0, 0);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (entityType) {
    conditions.push(`al.entity_type = $${idx++}`);
    params.push(entityType);
  }
  if (action) {
    conditions.push(`al.action = $${idx++}`);
    params.push(action);
  }
  if (actorId) {
    conditions.push(`al.actor_id = $${idx++}`);
    params.push(parseInt(actorId));
  }
  if (entityRef) {
    conditions.push(`al.entity_ref ILIKE $${idx++}`);
    params.push(`%${entityRef}%`);
  }
  if (dateFrom) {
    conditions.push(`al.created_at >= $${idx++}`);
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push(`al.created_at < $${idx++}`);
    // dateTo inclusive — add 1 day
    const dt = new Date(dateTo);
    dt.setDate(dt.getDate() + 1);
    params.push(dt.toISOString().split("T")[0]);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countQ = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM audit_logs al ${where}`,
    params,
  );
  const total = parseInt(countQ.rows[0]?.total ?? "0");

  params.push(limit, offset);
  const dataQ = await pool.query(
    `SELECT
       al.id,
       al.actor_id,
       al.actor_name,
       al.entity_type,
       al.entity_id,
       al.entity_ref,
       al.action,
       al.summary,
       al.before_data,
       al.after_data,
       al.created_at
     FROM audit_logs al
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    params,
  );

  res.json({ total, rows: dataQ.rows });
});

// ─── GET /api/admin/audit-logs/entity ─────────────────────────────────────────
// Quick recent-activity for a specific entity (used in detail views)

router.get("/admin/audit-logs/entity", requireAdmin, async (req, res) => {
  const { entityType, entityId, limit: limitRaw = "10" } = req.query as Record<string, string>;

  if (!entityType || !entityId) {
    res.status(400).json({ error: "entityType and entityId are required" });
    return;
  }

  const limit = Math.min(Math.max(parseInt(limitRaw) || 10, 1), 50);
  const id = parseInt(entityId);
  if (isNaN(id)) {
    res.status(400).json({ error: "entityId must be a number" });
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, actor_id, actor_name, entity_type, entity_id, entity_ref,
            action, summary, created_at
     FROM audit_logs
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [entityType, id, limit],
  );

  res.json({ rows });
});

export default router;
