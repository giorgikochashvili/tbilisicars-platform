import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const adminRoleEnum = pgEnum("admin_role_enum", [
  "admin",
  "regional_manager",
  "service_manager",
  "rental_agent",
]);

// ─── User (Customer) ──────────────────────────────────────────────────────────
// NOTE: email is nullable (became optional since migration 021). The unique constraint
// is a PARTIAL unique index (WHERE email IS NOT NULL) which cannot be expressed
// directly in Drizzle column definition — defined as a unique index in the extras
// callback with a where clause. We approximate with uniqueIndex here; enforce the
// partial uniqueness at the application/DB level.

export const userTable = pgTable(
  "user",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    fullName: varchar("full_name", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // TODO: ideally this should be a partial unique index WHERE email IS NOT NULL
    // Use drizzle sql template or raw SQL migration to enforce partial uniqueness.
    index("idx_user_email").on(t.email),
    index("idx_user_phone").on(t.phone),
  ],
);

// ─── Admins ───────────────────────────────────────────────────────────────────

export const adminsTable = pgTable(
  "admins",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 50 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    hashedPassword: varchar("hashed_password", { length: 255 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    adminRole: adminRoleEnum("admin_role").notNull().default("rental_agent"),
    // DEPRECATED: kept for backward compatibility (was replaced by admin_role in 004)
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    lastLogin: timestamp("last_login"),
    // Granular permission flags (added incrementally across migrations 004, 012, and later)
    canManageVehicles: boolean("can_manage_vehicles").notNull().default(true),
    canManageBookings: boolean("can_manage_bookings").notNull().default(true),
    canManageUsers: boolean("can_manage_users").notNull().default(false),
    canViewReports: boolean("can_view_reports").notNull().default(true),
    canManageSettings: boolean("can_manage_settings").notNull().default(false),
    canManageRates: boolean("can_manage_rates").notNull().default(true),
    canManageExtras: boolean("can_manage_extras").notNull().default(true),
    canManagePromotions: boolean("can_manage_promotions").notNull().default(true),
    canManageLocations: boolean("can_manage_locations").notNull().default(false),
    canViewReviews: boolean("can_view_reviews").notNull().default(true),
    canManageDamages: boolean("can_manage_damages").notNull().default(true),
    canManageTasks: boolean("can_manage_tasks").notNull().default(true),
    canViewCalendar: boolean("can_view_calendar").notNull().default(true),
    // NOTE: can_manage_cases added post-022 — no dedicated migration found, inferred from model
    canManageCases: boolean("can_manage_cases").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_admin_email").on(t.email),
    uniqueIndex("uq_admin_username").on(t.username),
    index("idx_admins_role").on(t.adminRole),
    index("idx_admins_is_active").on(t.isActive),
  ],
);

// ─── Tasks ────────────────────────────────────────────────────────────────────
// NOTE: related_vehicle_id and related_booking_id are defined as plain integers
// (no .references()) to avoid circular imports between users.ts ↔ fleet.ts ↔ bookings.ts.
// The FK relationships are enforced at the DB layer via separate raw SQL if needed,
// or validated at the application layer.

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
    // Single-assignee field retained for backward compat with pre-043 data;
    // multi-assignee is handled by task_assignees junction
    assignedToId: integer("assigned_to_id").references(() => adminsTable.id, {
      onDelete: "set null",
    }),
    // Lazy int refs — FK to vehicle and booking intentionally omitted here to
    // prevent circular module deps (fleet.ts and bookings.ts import from users.ts via admins)
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
// Added in migration 043 to support multiple assignees per task.

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

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(userTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertAdminSchema = createInsertSchema(adminsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertTaskAssigneeSchema = createInsertSchema(taskAssigneesTable);

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof userTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Admin = typeof adminsTable.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;

export type Task = typeof tasksTable.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type TaskAssignee = typeof taskAssigneesTable.$inferSelect;
export type InsertTaskAssignee = z.infer<typeof insertTaskAssigneeSchema>;
