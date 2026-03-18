import {
  pgTable,
  serial,
  integer,
  boolean,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./users";
import { bookingTable } from "./bookings";
import { vehicleTable } from "./fleet";

// ─── Review ───────────────────────────────────────────────────────────────────
// Customer reviews of vehicles or bookings.
// TODO: verify — pre-migration baseline; no migration modifies this table.
// Column list inferred from route handlers and SQLAlchemy model.

export const reviewTable = pgTable(
  "review",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").references(() => bookingTable.id),
    userId: integer("user_id").references(() => userTable.id),
    vehicleId: integer("vehicle_id").references(() => vehicleTable.id),
    rating: integer("rating"), // 1–5
    comment: text("comment"),
    isApproved: boolean("is_approved").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_review_booking_id").on(t.bookingId),
    index("idx_review_user_id").on(t.userId),
    index("idx_review_vehicle_id").on(t.vehicleId),
    index("idx_review_is_approved").on(t.isApproved),
  ],
);

export const insertReviewSchema = createInsertSchema(reviewTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Review = typeof reviewTable.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
