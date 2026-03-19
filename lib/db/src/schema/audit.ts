import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id"),
    actorName: varchar("actor_name", { length: 255 }),
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: integer("entity_id").notNull(),
    entityRef: varchar("entity_ref", { length: 100 }),
    action: varchar("action", { length: 50 }).notNull(),
    summary: text("summary").notNull(),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_audit_logs_entity_type").on(t.entityType),
    index("idx_audit_logs_entity_id").on(t.entityId),
    index("idx_audit_logs_actor_id").on(t.actorId),
    index("idx_audit_logs_created_at").on(t.createdAt),
  ],
);

export type AuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
