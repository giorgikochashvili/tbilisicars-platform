import { pool } from "@workspace/db";

export interface AuditParams {
  actorId?: number | null;
  entityType: string;
  entityId: number;
  entityRef?: string | null;
  action: string;
  summary: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}

export function logAudit(params: AuditParams): void {
  (async () => {
    let actorName: string | null = null;
    if (params.actorId) {
      try {
        const { rows } = await pool.query<{ full_name: string }>(
          "SELECT full_name FROM admins WHERE id = $1",
          [params.actorId],
        );
        actorName = rows[0]?.full_name ?? null;
      } catch {
        // name lookup failure must not block log write
      }
    }

    await pool.query(
      `INSERT INTO audit_logs
         (actor_id, actor_name, entity_type, entity_id, entity_ref, action, summary, before_data, after_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.actorId ?? null,
        actorName,
        params.entityType,
        params.entityId,
        params.entityRef ?? null,
        params.action,
        params.summary,
        params.beforeData != null ? JSON.stringify(params.beforeData) : null,
        params.afterData != null ? JSON.stringify(params.afterData) : null,
      ],
    );
  })().catch((err) => console.error("[AUDIT LOG ERROR]", err));
}

export function bookingRef(id: number): string {
  return `TC-${String(id).padStart(6, "0")}`;
}

export function paymentRef(id: number): string {
  return `TC-REC-${String(id).padStart(6, "0")}`;
}

export function vehicleRef(plate: string | null | undefined, id: number): string {
  return plate ?? `VEH-${id}`;
}
