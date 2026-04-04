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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const locationTypeEnum = pgEnum("locationtypeenum", [
  "meet_and_greet",
  "rental_office",
]);

export const locationTable = pgTable(
  "location",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    address: varchar("address", { length: 500 }),
    city: varchar("city", { length: 100 }),
    country: varchar("country", { length: 100 }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    locationType: locationTypeEnum("location_type").notNull().default("meet_and_greet"),
    isActive: boolean("is_active").notNull().default(true),
    // Prefix used to generate reservation codes (e.g. "TBS", "KUT", "BAT")
    reservationCodePrefix: varchar("reservation_code_prefix", { length: 10 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_location_city").on(t.city),
    index("idx_location_is_active").on(t.isActive),
  ],
);

export const oneWayFeesTable = pgTable(
  "one_way_fees",
  {
    id: serial("id").primaryKey(),
    fromLocationId: integer("from_location_id")
      .notNull()
      .references(() => locationTable.id, { onDelete: "cascade" }),
    toLocationId: integer("to_location_id")
      .notNull()
      .references(() => locationTable.id, { onDelete: "cascade" }),
    fee: numeric("fee", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_one_way_fee_locations").on(t.fromLocationId, t.toLocationId),
    index("idx_one_way_fees_from_location").on(t.fromLocationId),
    index("idx_one_way_fees_to_location").on(t.toLocationId),
  ],
);

export const insertLocationSchema = createInsertSchema(locationTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertOneWayFeeSchema = createInsertSchema(oneWayFeesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Location = typeof locationTable.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type OneWayFee = typeof oneWayFeesTable.$inferSelect;
export type InsertOneWayFee = z.infer<typeof insertOneWayFeeSchema>;
