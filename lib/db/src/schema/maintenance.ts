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
// NOTE: service_date column was added in migration 016, made nullable in 019,
// and DROPPED in migration 020. The final effective schema does NOT have service_date.

export const maintenanceServicesTable = pgTable(
  "maintenance_services",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "cascade" }),
    serviceTypeId: integer("service_type_id")
      .notNull()
      .references(() => maintenanceServiceTypesTable.id, {
        onDelete: "restrict",
      }),
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

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertMaintenanceServiceTypeSchema = createInsertSchema(
  maintenanceServiceTypesTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export const insertMaintenanceServiceSchema = createInsertSchema(
  maintenanceServicesTable,
).omit({ id: true, createdAt: true, updatedAt: true });

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
