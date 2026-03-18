import {
  pgTable,
  pgEnum,
  serial,
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
    // Deprecated field — superseded by admin_role (migration 004), retained for compat
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    lastLogin: timestamp("last_login"),
    // Granular permission flags added across migrations 004, 012, and post-022
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

export const insertAdminSchema = createInsertSchema(adminsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Admin = typeof adminsTable.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
