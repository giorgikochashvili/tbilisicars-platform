import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { vehicleModelTable } from "./fleet";

// ─── Availability Group ───────────────────────────────────────────────────────
// Display-only groups for fleet capacity planning in the CRM.
// Deleting a group cascades only to availability_group_vehicle_model rows;
// no operational vehicle, model, or booking data is affected.

export const availabilityGroupTable = pgTable("availability_group", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Availability Group → Vehicle Model (membership) ─────────────────────────
// UNIQUE(vehicle_model_id): one model belongs to at most one group at a time.
// Service layer enforces with a 409 conflict response; the CRM shows a
// "Move from [Group X]?" prompt when a model is already assigned elsewhere.

export const availabilityGroupVehicleModelTable = pgTable(
  "availability_group_vehicle_model",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => availabilityGroupTable.id, { onDelete: "cascade" }),
    vehicleModelId: integer("vehicle_model_id")
      .notNull()
      .references(() => vehicleModelTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("uq_agvm_vehicle_model_id").on(t.vehicleModelId),
    index("idx_agvm_group_id").on(t.groupId),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type AvailabilityGroup = typeof availabilityGroupTable.$inferSelect;
export type InsertAvailabilityGroup =
  typeof availabilityGroupTable.$inferInsert;

export type AvailabilityGroupVehicleModel =
  typeof availabilityGroupVehicleModelTable.$inferSelect;
export type InsertAvailabilityGroupVehicleModel =
  typeof availabilityGroupVehicleModelTable.$inferInsert;
