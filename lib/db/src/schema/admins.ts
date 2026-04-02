import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adminRoleEnum = pgEnum("adminroleenum", [
  "admin",
  "regional_manager",
  "service_manager",
  "rental_agent",
]);

export const adminRolesTable = pgTable(
  "admin_roles",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    description: varchar("description", { length: 500 }),
    color: varchar("color", { length: 20 }),
    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_admin_roles_is_active").on(t.isActive),
  ],
);

export const adminRolePermissionsTable = pgTable(
  "admin_role_permissions",
  {
    id: serial("id").primaryKey(),
    roleId: integer("role_id").notNull().references(() => adminRolesTable.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 60 }).notNull(),
    granted: boolean("granted").notNull().default(false),
  },
  (t) => [
    uniqueIndex("uq_role_permission").on(t.roleId, t.permissionKey),
    index("idx_role_permissions_role_id").on(t.roleId),
  ],
);

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
    roleId: integer("role_id").references(() => adminRolesTable.id),
    // Deprecated field — superseded by admin_role (migration 004), retained for compat
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    phoneNumber: varchar("phone_number", { length: 30 }),
    lastLogin: timestamp("last_login"),
    // Granular permission flags — source of truth set by role seeder/backfill
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
    canManageCases: boolean("can_manage_cases").notNull().default(true),
    // New permission flags (all default false — seeder sets correct values)
    canManageService: boolean("can_manage_service").notNull().default(false),
    canViewAccounting: boolean("can_view_accounting").notNull().default(false),
    canManageAccounting: boolean("can_manage_accounting").notNull().default(false),
    canViewAlerts: boolean("can_view_alerts").notNull().default(false),
    canViewAuditLog: boolean("can_view_audit_log").notNull().default(false),
    canManageParking: boolean("can_manage_parking").notNull().default(false),
    canUseAdminAI: boolean("can_use_admin_ai").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_admin_email").on(t.email),
    uniqueIndex("uq_admin_username").on(t.username),
    index("idx_admins_role").on(t.adminRole),
    index("idx_admins_role_id").on(t.roleId),
    index("idx_admins_is_active").on(t.isActive),
  ],
);

export const insertAdminSchema = createInsertSchema(adminsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Admin = typeof adminsTable.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type AdminRole = typeof adminRolesTable.$inferSelect;
export type AdminRolePermission = typeof adminRolePermissionsTable.$inferSelect;
