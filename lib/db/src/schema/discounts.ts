import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  numeric,
  integer,
  boolean,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { locationTable } from "./locations";
import { vehicleModelTable } from "./fleet";

// ─── Discount Type Enum ───────────────────────────────────────────────────────

export const websiteDiscountTypeEnum = pgEnum("websitediscounttypeenum", [
  "PERCENT",
  "FIXED",
]);

// ─── Discount ─────────────────────────────────────────────────────────────────
// A website-only price reduction scoped to a pickup location and date range.
// Does NOT mutate existing rate plans — applied as a separate layer after
// the normal WEB rate is resolved.

export const discountTable = pgTable(
  "website_discount",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    discountType: websiteDiscountTypeEnum("discount_type").notNull(),
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    pickupLocationId: integer("pickup_location_id")
      .notNull()
      .references(() => locationTable.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_website_discount_pickup_location_id").on(t.pickupLocationId),
    index("idx_website_discount_is_active").on(t.isActive),
    index("idx_website_discount_start_date").on(t.startDate),
    index("idx_website_discount_end_date").on(t.endDate),
  ],
);

// ─── Discount ↔ Vehicle Model join ───────────────────────────────────────────
// One discount can target multiple vehicle models.

export const discountVehicleModelTable = pgTable(
  "website_discount_vehicle_model",
  {
    id: serial("id").primaryKey(),
    discountId: integer("discount_id")
      .notNull()
      .references(() => discountTable.id, { onDelete: "cascade" }),
    vehicleModelId: integer("vehicle_model_id")
      .notNull()
      .references(() => vehicleModelTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("idx_wdisc_vm_discount_id").on(t.discountId),
    index("idx_wdisc_vm_vehicle_model_id").on(t.vehicleModelId),
  ],
);

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertDiscountSchema = createInsertSchema(discountTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDiscountVehicleModelSchema = createInsertSchema(
  discountVehicleModelTable,
).omit({ id: true });

// ─── Types ────────────────────────────────────────────────────────────────────

export type Discount = typeof discountTable.$inferSelect;
export type InsertDiscount = z.infer<typeof insertDiscountSchema>;

export type DiscountVehicleModel =
  typeof discountVehicleModelTable.$inferSelect;
export type InsertDiscountVehicleModel = z.infer<
  typeof insertDiscountVehicleModelSchema
>;
