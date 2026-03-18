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
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    deadline: timestamp("deadline"),
    completedAt: timestamp("completed_at"),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"),
    priority: varchar("priority", { length: 20 }).notNull().default("MEDIUM"),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => adminsTable.id, { onDelete: "cascade" }),
    // Single-assignee retained for pre-043 data; multi-assignee via task_assignees junction
    assignedToId: integer("assigned_to_id").references(() => adminsTable.id, {
      onDelete: "set null",
    }),
    // FK to vehicle.id and booking.id omitted as plain integers to avoid circular module deps
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
    index("idx_tasks_deadline").on(t.deadline),
    index("idx_tasks_related_vehicle").on(t.relatedVehicleId),
    index("idx_tasks_related_booking").on(t.relatedBookingId),
  ],
);

// ─── Task Assignees (Junction) ────────────────────────────────────────────────
// Multi-assignee support added in migration 043.

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

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTaskAssigneeSchema = createInsertSchema(taskAssigneesTable);

export type Task = typeof tasksTable.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskAssignee = typeof taskAssigneesTable.$inferSelect;
export type InsertTaskAssignee = z.infer<typeof insertTaskAssigneeSchema>;
