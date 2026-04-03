import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehicleModelTable } from "./fleet";

// ─── Homepage Featured Slider ─────────────────────────────────────────────────

export const homepageFeaturedSliderTable = pgTable(
  "homepage_featured_slider",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    subtitle: varchar("subtitle", { length: 500 }),
    badgeText: varchar("badge_text", { length: 100 }),
    displayPriceText: varchar("display_price_text", { length: 100 }).notNull(),
    ctaLabel: varchar("cta_label", { length: 100 }),
    imageUrl: varchar("image_url", { length: 500 }).notNull(),
    vehicleModelId: integer("vehicle_model_id")
      .notNull()
      .references(() => vehicleModelTable.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_hfs_sort_order").on(t.sortOrder),
    index("idx_hfs_is_active").on(t.isActive),
    index("idx_hfs_vehicle_model_id").on(t.vehicleModelId),
  ],
);

export const insertHomepageFeaturedSliderSchema = createInsertSchema(
  homepageFeaturedSliderTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type HomepageFeaturedSlider =
  typeof homepageFeaturedSliderTable.$inferSelect;
export type InsertHomepageFeaturedSlider = z.infer<
  typeof insertHomepageFeaturedSliderSchema
>;
