import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehicleTable } from "./fleet";

// ─── Partner ──────────────────────────────────────────────────────────────────
// External partner companies or brokers that refer bookings (added migration 030).

export const partnerTable = pgTable(
  "partner",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    contactNumber: varchar("contact_number", { length: 50 }),
    contactEmail: varchar("contact_email", { length: 150 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_partner_name").on(t.name),
    index("idx_partner_name").on(t.name),
    index("idx_partner_email").on(t.contactEmail),
  ],
);

// ─── Partner Document ─────────────────────────────────────────────────────────
// Documents uploaded for a partner (contracts, agreements, etc.).

export const partnerDocumentTable = pgTable(
  "partner_document",
  {
    id: serial("id").primaryKey(),
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partnerTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 150 }).notNull(),
    filePath: varchar("file_path", { length: 500 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_partner_document_partner_id").on(t.partnerId)],
);

// ─── Partner Vehicle (Junction) ───────────────────────────────────────────────
// Many-to-many between partners and vehicles they manage or supply.

export const partnerVehicleTable = pgTable(
  "partner_vehicle",
  {
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partnerTable.id, { onDelete: "cascade" }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.partnerId, t.vehicleId] })],
);

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertPartnerSchema = createInsertSchema(partnerTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertPartnerDocumentSchema = createInsertSchema(
  partnerDocumentTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPartnerVehicleSchema = createInsertSchema(partnerVehicleTable);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Partner = typeof partnerTable.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;

export type PartnerDocument = typeof partnerDocumentTable.$inferSelect;
export type InsertPartnerDocument = z.infer<typeof insertPartnerDocumentSchema>;

export type PartnerVehicle = typeof partnerVehicleTable.$inferSelect;
export type InsertPartnerVehicle = z.infer<typeof insertPartnerVehicleSchema>;
