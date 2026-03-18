import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  integer,
  boolean,
  numeric,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehiclegroupTable } from "./fleet";
import { rateTable } from "./rates";

// ─── Enums ───────────────────────────────────────────────────────────────────

// Values uppercased in migration 003
export const discountTypeEnum = pgEnum("discounttypeenum", [
  "PERCENT",
  "FIXED",
]);

// ─── Promo ────────────────────────────────────────────────────────────────────
// NOTE: code is nullable (made optional in migration 003).
// vehicle_group_id scopes the promo to a specific vehicle group.
// rate_id links the promo to a specific rate (added migration 038).

export const promoTable = pgTable(
  "promo",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 100 }),
    vehicleGroupId: integer("vehicle_group_id").references(
      () => vehiclegroupTable.id,
      { onDelete: "cascade" },
    ),
    rateId: integer("rate_id").references(() => rateTable.id, {
      onDelete: "set null",
    }),
    discountType: discountTypeEnum("discount_type").notNull(),
    discountValue: numeric("discount_value", {
      precision: 10,
      scale: 2,
    }).notNull(),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    maxUses: integer("max_uses"),
    timesUsed: integer("times_used").default(0),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("ix_promo_vehicle_group_id").on(t.vehicleGroupId),
    index("idx_promo_rate_id").on(t.rateId),
    index("idx_promo_code").on(t.code),
    index("idx_promo_active").on(t.active),
  ],
);

// ─── Insert Schema ────────────────────────────────────────────────────────────

export const insertPromoSchema = createInsertSchema(promoTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Promo = typeof promoTable.$inferSelect;
export type InsertPromo = z.infer<typeof insertPromoSchema>;
