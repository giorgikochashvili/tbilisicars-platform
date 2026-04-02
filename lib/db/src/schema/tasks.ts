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

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const tasksTable = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    // DB column "name" kept; exposed as "title" in JS API layer
    title: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    // DB column "deadline" kept; exposed as "dueDate" in JS API layer
    dueDate: timestamp("deadline"),
    completedAt: timestamp("completed_at"),
    status: varchar("status", { length: 20 }).notNull().default("To Do"),
    priority: varchar("priority", { length: 20 }).notNull().default("Medium"),
    progressPercent: integer("progress_percent").notNull().default(0),
    startDate: timestamp("start_date"),
    relatedType: varchar("related_type", { length: 50 }),
    relatedId: integer("related_id"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => adminsTable.id, { onDelete: "cascade" }),
    assignedToId: integer("assigned_to_id").references(() => adminsTable.id, {
      onDelete: "set null",
    }),
    // Legacy columns retained for backward compat (do not use in new code)
    relatedVehicleId: integer("related_vehicle_id"),
    relatedBookingId: integer("related_booking_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_tasks_status").on(t.status),
    index("idx_tasks_priority").on(t.priority),
    index("idx_tasks_created_by").on(t.createdById),
    index("idx_tasks_assigned_to").on(t.assignedToId),
    index("idx_tasks_deadline").on(t.dueDate),
    index("idx_tasks_related_vehicle").on(t.relatedVehicleId),
    index("idx_tasks_related_booking").on(t.relatedBookingId),
    index("idx_tasks_due_date").on(t.dueDate),
    index("idx_tasks_start_date").on(t.startDate),
  ],
);

// ─── Task Assignees (Junction) ────────────────────────────────────────────────

export const taskAssigneesTable = pgTable(
  "task_assignees",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    adminId: integer("admin_id")
      .notNull()
      .references(() => adminsTable.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.adminId] })],
);

// ─── Task Comments ─────────────────────────────────────────────────────────────

export const taskCommentsTable = pgTable(
  "task_comments",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    authorId: integer("author_id")
      .notNull()
      .references(() => adminsTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_task_comments_task_id").on(t.taskId),
    index("idx_task_comments_author_id").on(t.authorId),
  ],
);

// ─── Task Activity Log ─────────────────────────────────────────────────────────

export const taskActivityLogTable = pgTable(
  "task_activity_log",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasksTable.id, { onDelete: "cascade" }),
    actorId: integer("actor_id")
      .notNull()
      .references(() => adminsTable.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 100 }).notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_task_activity_task_id").on(t.taskId),
    index("idx_task_activity_actor_id").on(t.actorId),
    index("idx_task_activity_created_at").on(t.createdAt),
  ],
);

// ─── Drizzle-zod schemas & types ──────────────────────────────────────────────

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTaskAssigneeSchema = createInsertSchema(taskAssigneesTable);
export const insertTaskCommentSchema = createInsertSchema(taskCommentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTaskActivitySchema = createInsertSchema(taskActivityLogTable).omit({
  id: true,
  createdAt: true,
});

export type Task = typeof tasksTable.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskAssignee = typeof taskAssigneesTable.$inferSelect;
export type InsertTaskAssignee = z.infer<typeof insertTaskAssigneeSchema>;

export type TaskComment = typeof taskCommentsTable.$inferSelect;
export type InsertTaskComment = z.infer<typeof insertTaskCommentSchema>;

export type TaskActivity = typeof taskActivityLogTable.$inferSelect;
export type InsertTaskActivity = z.infer<typeof insertTaskActivitySchema>;
