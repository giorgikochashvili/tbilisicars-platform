import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── User (Customer) ──────────────────────────────────────────────────────────
// email became nullable in migration 021. The original constraint was a partial
// unique index (WHERE email IS NOT NULL), which we replicate with .where() below.

export const userTable = pgTable(
  "user",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    fullName: varchar("full_name", { length: 255 }),
    country: varchar("country", { length: 100 }),
    passportId: varchar("passport_id", { length: 100 }),
    drivingLicense: varchar("driving_license", { length: 100 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Partial unique index — only enforce uniqueness when email is present
    uniqueIndex("uq_user_email_not_null")
      .on(t.email)
      .where(sql`${t.email} IS NOT NULL`),
    index("idx_user_phone").on(t.phone),
  ],
);

export const insertUserSchema = createInsertSchema(userTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type User = typeof userTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
