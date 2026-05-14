import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vehicleModelTable } from "./fleet";

// ─── Showroom Slides ──────────────────────────────────────────────────────────

export const showroomSlideTable = pgTable("showroom_slides", {
  id: serial("id").primaryKey(),
  vehicleModelId: integer("vehicle_model_id").references(
    () => vehicleModelTable.id,
    { onDelete: "set null" },
  ),
  titleEn: varchar("title_en", { length: 200 }),
  titleHe: varchar("title_he", { length: 200 }),
  titleAr: varchar("title_ar", { length: 200 }),
  bodyEn: text("body_en"),
  bodyHe: text("body_he"),
  bodyAr: text("body_ar"),
  badgeEn: varchar("badge_en", { length: 100 }),
  badgeHe: varchar("badge_he", { length: 100 }),
  badgeAr: varchar("badge_ar", { length: 100 }),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ─── Showroom Playlists ───────────────────────────────────────────────────────

export const showroomPlaylistTable = pgTable("showroom_playlists", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ─── Showroom Playlist Items ──────────────────────────────────────────────────

export const showroomPlaylistItemTable = pgTable("showroom_playlist_items", {
  id: serial("id").primaryKey(),
  playlistId: integer("playlist_id")
    .notNull()
    .references(() => showroomPlaylistTable.id, { onDelete: "cascade" }),
  slideId: integer("slide_id")
    .notNull()
    .references(() => showroomSlideTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  durationSeconds: integer("duration_seconds").notNull().default(8),
});

// ─── Showroom Model Prices ────────────────────────────────────────────────────

export const showroomModelPriceTable = pgTable("showroom_model_prices", {
  id: serial("id").primaryKey(),
  vehicleModelId: integer("vehicle_model_id")
    .notNull()
    .references(() => vehicleModelTable.id, { onDelete: "cascade" }),
  priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ─── Showroom Settings ────────────────────────────────────────────────────────

export const showroomSettingTable = pgTable("showroom_settings", {
  id: serial("id").primaryKey(),
  usdToEurRate: numeric("usd_to_eur_rate", { precision: 10, scale: 6 })
    .notNull()
    .default("0.920000"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShowroomSlide = typeof showroomSlideTable.$inferSelect;
export type ShowroomPlaylist = typeof showroomPlaylistTable.$inferSelect;
export type ShowroomPlaylistItem = typeof showroomPlaylistItemTable.$inferSelect;
export type ShowroomModelPrice = typeof showroomModelPriceTable.$inferSelect;
export type ShowroomSetting = typeof showroomSettingTable.$inferSelect;
