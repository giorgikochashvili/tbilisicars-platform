import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  date,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { vehicleModelTable } from "./fleet";

// ─── Stop Sell rule ───────────────────────────────────────────────────────────
// An admin-managed rule that suppresses matching vehicle models from public
// website results for a given city + date range. Does not affect CRM manual,
// broker, or RBG intake flows.

export const stopSellTable = pgTable(
  "stop_sell",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_stop_sell_is_active").on(t.isActive),
    index("idx_stop_sell_start_date").on(t.startDate),
    index("idx_stop_sell_end_date").on(t.endDate),
  ],
);

// ─── Stop Sell ↔ Vehicle Model (many-to-many) ─────────────────────────────────

export const stopSellVehicleModelTable = pgTable(
  "stop_sell_vehicle_model",
  {
    stopSellId: integer("stop_sell_id")
      .notNull()
      .references(() => stopSellTable.id, { onDelete: "cascade" }),
    vehicleModelId: integer("vehicle_model_id")
      .notNull()
      .references(() => vehicleModelTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.stopSellId, t.vehicleModelId] }),
    index("idx_ssvm_model").on(t.vehicleModelId),
  ],
);

// ─── Stop Sell ↔ Region / City (many-to-many) ────────────────────────────────
// city column constrained to Tbilisi | Kutaisi | Batumi via DB CHECK.

export const stopSellRegionTable = pgTable(
  "stop_sell_region",
  {
    stopSellId: integer("stop_sell_id")
      .notNull()
      .references(() => stopSellTable.id, { onDelete: "cascade" }),
    city: varchar("city", { length: 100 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.stopSellId, t.city] }),
    index("idx_ssr_city").on(t.city),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type StopSell = typeof stopSellTable.$inferSelect;
export type InsertStopSell = typeof stopSellTable.$inferInsert;
export type StopSellVehicleModel = typeof stopSellVehicleModelTable.$inferSelect;
export type StopSellRegion = typeof stopSellRegionTable.$inferSelect;
