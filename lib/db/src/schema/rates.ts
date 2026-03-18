import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehicleModelTable } from "./fleet";

// ─── Rate ─────────────────────────────────────────────────────────────────────
// A named pricing strategy with a validity period and optional parent (for increments).

export const rateTable = pgTable(
  "rate",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    // Self-referential FK to rate.id — plain integer to avoid circular TypeScript inference.
    // The FK constraint (ON DELETE SET NULL) is enforced at the DB layer.
    parentRateId: integer("parent_rate_id"),
    incrementType: varchar("increment_type", { length: 20 }),
    incrementValue: numeric("increment_value", { precision: 10, scale: 2 }),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until").notNull(),
    minDays: integer("min_days").default(2),
    maxDays: integer("max_days").default(300),
    unlimitedKm: boolean("unlimited_km").default(true),
    editableBy: varchar("editable_by", { length: 50 }).default("all"),
    isActive: boolean("is_active").default(true),
    priceModifierName: varchar("price_modifier_name", { length: 100 }),
    priceModifierType: varchar("price_modifier_type", { length: 20 }),
    priceModifierValue: numeric("price_modifier_value", {
      precision: 10,
      scale: 2,
    }),
    priceModifierAppliesToAgreementOnly: boolean(
      "price_modifier_applies_to_agreement_only",
    ).default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_rate_name").on(t.name),
    index("idx_rate_is_active").on(t.isActive),
    index("idx_rate_valid_from").on(t.validFrom),
    index("idx_rate_valid_until").on(t.validUntil),
    index("idx_rate_parent_rate_id").on(t.parentRateId),
  ],
);

// ─── Rate Tier ────────────────────────────────────────────────────────────────
// Per-vehicle-model pricing within a rate, scoped to a day range.
// IMPORTANT: references vehicle_model_id (NOT vehicle_group_id) — migrated in 035.

export const ratetierTable = pgTable(
  "ratetier",
  {
    id: serial("id").primaryKey(),
    rateId: integer("rate_id")
      .notNull()
      .references(() => rateTable.id, { onDelete: "cascade" }),
    vehicleModelId: integer("vehicle_model_id")
      .notNull()
      .references(() => vehicleModelTable.id, { onDelete: "cascade" }),
    fromDays: integer("from_days").default(0),
    toDays: integer("to_days"), // NULL = unlimited
    pricePerDay: numeric("price_per_day", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("EUR"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_ratetier_rate_id").on(t.rateId),
    index("idx_ratetier_vehicle_model").on(t.vehicleModelId),
  ],
);

// ─── Rate Day Range ───────────────────────────────────────────────────────────
// Day range buckets within a rate (for display/grouping purposes).

export const ratedayrangeTable = pgTable(
  "ratedayrange",
  {
    id: serial("id").primaryKey(),
    rateId: integer("rate_id")
      .notNull()
      .references(() => rateTable.id, { onDelete: "cascade" }),
    fromDays: integer("from_days").notNull(),
    toDays: integer("to_days"), // NULL = unlimited
    label: varchar("label", { length: 50 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_ratedayrange_rate_id").on(t.rateId)],
);

// ─── Rate Hour Range ──────────────────────────────────────────────────────────
// Hour-based pricing ranges for short rentals.

export const ratehourrangeTable = pgTable(
  "ratehourrange",
  {
    id: serial("id").primaryKey(),
    rateId: integer("rate_id")
      .notNull()
      .references(() => rateTable.id, { onDelete: "cascade" }),
    fromHours: integer("from_hours").notNull(),
    toHours: integer("to_hours"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_ratehourrange_rate_id").on(t.rateId)],
);

// ─── Rate Km Range ────────────────────────────────────────────────────────────
// Mileage-based pricing tiers within a rate.

export const ratekmrangeTable = pgTable(
  "ratekmrange",
  {
    id: serial("id").primaryKey(),
    rateId: integer("rate_id")
      .notNull()
      .references(() => rateTable.id, { onDelete: "cascade" }),
    fromKm: integer("from_km").default(0),
    toKm: integer("to_km"),
    label: varchar("label", { length: 50 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_ratekmrange_rate_id").on(t.rateId)],
);

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertRateSchema = createInsertSchema(rateTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertRatetierSchema = createInsertSchema(ratetierTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertRatedayrangeSchema = createInsertSchema(
  ratedayrangeTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRatehourrangeSchema = createInsertSchema(
  ratehourrangeTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRatekmrangeSchema = createInsertSchema(ratekmrangeTable).omit(
  { id: true, createdAt: true, updatedAt: true },
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Rate = typeof rateTable.$inferSelect;
export type InsertRate = z.infer<typeof insertRateSchema>;

export type Ratetier = typeof ratetierTable.$inferSelect;
export type InsertRatetier = z.infer<typeof insertRatetierSchema>;

export type Ratedayrange = typeof ratedayrangeTable.$inferSelect;
export type InsertRatedayrange = z.infer<typeof insertRatedayrangeSchema>;

export type Ratehourrange = typeof ratehourrangeTable.$inferSelect;
export type InsertRatehourrange = z.infer<typeof insertRatehourrangeSchema>;

export type Ratekmrange = typeof ratekmrangeTable.$inferSelect;
export type InsertRatekmrange = z.infer<typeof insertRatekmrangeSchema>;
