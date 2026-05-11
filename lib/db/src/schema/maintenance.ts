import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehicleTable } from "./fleet";
import { adminsTable } from "./admins";
import { relations } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const maintenanceStatusEnum = pgEnum("maintenancestatusenum", [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

// ─── Maintenance Service Types ────────────────────────────────────────────────
// Catalogue of service types (Oil Change, Brake Pads, etc.).

export const maintenanceServiceTypesTable = pgTable(
  "maintenance_service_types",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    averageTimeHours: numeric("average_time_hours", { precision: 5, scale: 2 }),
    defaultPrice: numeric("default_price", { precision: 10, scale: 2 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_maintenance_service_types_name").on(t.name)],
);

// ─── Maintenance Services ─────────────────────────────────────────────────────
// Individual service records for a vehicle.

export const maintenanceServicesTable = pgTable(
  "maintenance_services",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "cascade" }),
    serviceTypeId: integer("service_type_id")
      .references(() => maintenanceServiceTypesTable.id, {
        onDelete: "restrict",
      }),
    serviceCategories: text("service_categories"),
    serviceDate: date("service_date"),
    mileage: integer("mileage"),
    cost: numeric("cost", { precision: 10, scale: 2 }),
    description: text("description"),
    mechanicName: varchar("mechanic_name", { length: 100 }),
    shopName: varchar("shop_name", { length: 200 }),
    nextServiceDate: date("next_service_date"),
    nextServiceMileage: integer("next_service_mileage"),
    status: maintenanceStatusEnum("status").notNull().default("SCHEDULED"),
    adminId: integer("admin_id").references(() => adminsTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_maintenance_services_vehicle_id").on(t.vehicleId),
    index("idx_maintenance_services_service_type_id").on(t.serviceTypeId),
    index("idx_maintenance_services_admin_id").on(t.adminId),
    index("idx_maintenance_services_next_service_date").on(t.nextServiceDate),
    index("idx_maintenance_services_status").on(t.status),
  ],
);

// ─── Maintenance Service Comments ─────────────────────────────────────────────
// Append-only internal staff comments on a service record.

export const maintenanceServiceCommentTable = pgTable(
  "maintenance_service_comments",
  {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => maintenanceServicesTable.id, { onDelete: "cascade" }),
    authorAdminId: integer("author_admin_id").references(
      () => adminsTable.id,
      { onDelete: "set null" },
    ),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_svc_comments_service_id").on(t.serviceId),
    index("idx_svc_comments_created_at").on(t.createdAt),
  ],
);

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertMaintenanceServiceTypeSchema = createInsertSchema(
  maintenanceServiceTypesTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertMaintenanceServiceSchema = createInsertSchema(
  maintenanceServicesTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertMaintenanceServiceCommentSchema = createInsertSchema(
  maintenanceServiceCommentTable,
).omit({ id: true, createdAt: true });

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaintenanceServiceType =
  typeof maintenanceServiceTypesTable.$inferSelect;
export type InsertMaintenanceServiceType = z.infer<
  typeof insertMaintenanceServiceTypeSchema
>;

export type MaintenanceService = typeof maintenanceServicesTable.$inferSelect;
export type InsertMaintenanceService = z.infer<
  typeof insertMaintenanceServiceSchema
>;

export type MaintenanceServiceComment =
  typeof maintenanceServiceCommentTable.$inferSelect;
export type InsertMaintenanceServiceComment = z.infer<
  typeof insertMaintenanceServiceCommentSchema
>;
