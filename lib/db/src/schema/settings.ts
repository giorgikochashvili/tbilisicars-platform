import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// TODO: verify — migration 037 content was truncated; this is a conservative key-value
// store implementation inferred from the table purpose. Adjust columns if the real
// structure differs (e.g. typed values, JSON, per-section tables, etc.).
export const companySettingsTable = pgTable(
  "company_settings",
  {
    id: serial("id").primaryKey(),
    category: varchar("category", { length: 100 }).notNull(),
    key: varchar("key", { length: 100 }).notNull(),
    value: text("value"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_company_settings_category_key").on(t.category, t.key),
    index("idx_company_settings_category").on(t.category),
  ],
);

export const insertCompanySettingSchema = createInsertSchema(
  companySettingsTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type CompanySetting = typeof companySettingsTable.$inferSelect;
export type InsertCompanySetting = z.infer<typeof insertCompanySettingSchema>;
