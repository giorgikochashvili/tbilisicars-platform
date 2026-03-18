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
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingTable } from "./bookings";

export const extraPricingTypeEnum = pgEnum("extrapricingtypeenum", [
  "per_day",
  "per_trip",
]);

// ─── Extra ────────────────────────────────────────────────────────────────────

export const extraTable = pgTable(
  "extra",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    pricingType: extraPricingTypeEnum("pricing_type")
      .notNull()
      .default("per_day"),
    // Maximum days charged for per_day extras (added migration 039)
    maxDays: integer("max_days"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_extra_is_active").on(t.isActive),
    index("idx_extra_pricing_type").on(t.pricingType),
  ],
);

// ─── Booking Extra (Junction) ─────────────────────────────────────────────────
// TODO: verify — pre-migration baseline table; structure inferred from routes/models.

export const bookingextraTable = pgTable(
  "bookingextra",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    extraId: integer("extra_id")
      .notNull()
      .references(() => extraTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").default(1),
    priceAtBooking: numeric("price_at_booking", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_bookingextra_booking_id").on(t.bookingId),
    index("idx_bookingextra_extra_id").on(t.extraId),
  ],
);

export const insertExtraSchema = createInsertSchema(extraTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertBookingextraSchema = createInsertSchema(
  bookingextraTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type Extra = typeof extraTable.$inferSelect;
export type InsertExtra = z.infer<typeof insertExtraSchema>;

export type Bookingextra = typeof bookingextraTable.$inferSelect;
export type InsertBookingextra = z.infer<typeof insertBookingextraSchema>;
