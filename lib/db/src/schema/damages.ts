import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehicleTable } from "./fleet";
import { userTable } from "./users";

// ─── Damage Report ────────────────────────────────────────────────────────────
// Vehicle damage records reported during or after a booking.
//
// TODO: verify — the base CREATE TABLE SQL for damagereport is not in the migrations
// (pre-migration baseline). Columns beyond id/vehicle_id/booking_id/user_id are
// inferred from the SQLAlchemy model. Adjust conservatively if actual schema differs.
//
// NOTE: booking_id is defined as a plain integer (no .references()) to avoid a circular
// import with bookings.ts, which itself imports from fleet.ts and users.ts.

export const damagereportTable = pgTable(
  "damagereport",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "cascade" }),
    // Plain integer to avoid circular import: damages.ts ← bookings.ts ← fleet.ts ← damages.ts
    bookingId: integer("booking_id"),
    userId: integer("user_id").references(() => userTable.id, {
      onDelete: "set null",
    }),
    description: text("description"),
    damageDate: timestamp("damage_date"),
    repairCost: numeric("repair_cost", { precision: 10, scale: 2 }),
    // TODO: verify — status and photo_urls column types are unclear from migrations
    status: varchar("status", { length: 50 }),
    photoUrls: text("photo_urls"), // JSON array of photo paths stored as text
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_damagereport_vehicle_id").on(t.vehicleId),
    index("idx_damagereport_booking_id").on(t.bookingId),
    index("idx_damagereport_user_id").on(t.userId),
  ],
);

// ─── Insert Schema ────────────────────────────────────────────────────────────

export const insertDamagereportSchema = createInsertSchema(
  damagereportTable,
).omit({ id: true, createdAt: true, updatedAt: true });

// ─── Types ────────────────────────────────────────────────────────────────────

export type Damagereport = typeof damagereportTable.$inferSelect;
export type InsertDamagereport = z.infer<typeof insertDamagereportSchema>;
