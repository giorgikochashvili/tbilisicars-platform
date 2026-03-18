import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adminsTable } from "./admins";
import { userTable } from "./users";
import { bookingTable } from "./bookings";

// ─── Cases ────────────────────────────────────────────────────────────────────
// Internal case management for tracking issues, complaints, and incidents (added migration 022).

export const casesTable = pgTable(
  "cases",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 20 }).notNull().default("OPEN"),
    priority: varchar("priority", { length: 20 }).notNull().default("MEDIUM"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => adminsTable.id),
    relatedBookingId: integer("related_booking_id").references(
      () => bookingTable.id,
    ),
    relatedUserId: integer("related_user_id").references(() => userTable.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_cases_created_by").on(t.createdById),
    index("idx_cases_status").on(t.status),
    index("idx_cases_priority").on(t.priority),
    index("idx_cases_related_booking").on(t.relatedBookingId),
    index("idx_cases_related_user").on(t.relatedUserId),
    index("idx_cases_created_at").on(t.createdAt),
  ],
);

// ─── Case Comments ────────────────────────────────────────────────────────────

export const caseCommentsTable = pgTable(
  "case_comments",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => casesTable.id, { onDelete: "cascade" }),
    adminId: integer("admin_id")
      .notNull()
      .references(() => adminsTable.id),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_case_comments_case_id").on(t.caseId),
    index("idx_case_comments_admin_id").on(t.adminId),
  ],
);

// ─── Case Attachments ─────────────────────────────────────────────────────────

export const caseAttachmentsTable = pgTable(
  "case_attachments",
  {
    id: serial("id").primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => casesTable.id, { onDelete: "cascade" }),
    commentId: integer("comment_id").references(() => caseCommentsTable.id, {
      onDelete: "cascade",
    }),
    adminId: integer("admin_id")
      .notNull()
      .references(() => adminsTable.id),
    filename: varchar("filename", { length: 255 }).notNull(),
    filePath: varchar("file_path", { length: 500 }).notNull(),
    fileSize: integer("file_size").notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_case_attachments_case_id").on(t.caseId),
    index("idx_case_attachments_admin_id").on(t.adminId),
  ],
);

// ─── Case Assignments (Junction) ──────────────────────────────────────────────
// NOTE: not explicitly created in the migration SQL files — likely applied outside
// the migration system. Structure inferred from the SQLAlchemy Admin model.

export const caseAssignmentsTable = pgTable(
  "case_assignments",
  {
    caseId: integer("case_id")
      .notNull()
      .references(() => casesTable.id, { onDelete: "cascade" }),
    adminId: integer("admin_id")
      .notNull()
      .references(() => adminsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.adminId] })],
);

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertCaseSchema = createInsertSchema(casesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertCaseCommentSchema = createInsertSchema(
  caseCommentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCaseAttachmentSchema = createInsertSchema(
  caseAttachmentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCaseAssignmentSchema = createInsertSchema(caseAssignmentsTable);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Case = typeof casesTable.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;

export type CaseComment = typeof caseCommentsTable.$inferSelect;
export type InsertCaseComment = z.infer<typeof insertCaseCommentSchema>;

export type CaseAttachment = typeof caseAttachmentsTable.$inferSelect;
export type InsertCaseAttachment = z.infer<typeof insertCaseAttachmentSchema>;

export type CaseAssignment = typeof caseAssignmentsTable.$inferSelect;
export type InsertCaseAssignment = z.infer<typeof insertCaseAssignmentSchema>;
