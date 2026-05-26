import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  integer,
  text,
  boolean,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehicleTable } from "./fleet";
import { accountingEntriesTable, accountingCurrencyEnum } from "./accounting";
import { adminsTable } from "./admins";
import { bookingTable } from "./bookings";

// ─── Partner Role ─────────────────────────────────────────────────────────────

export const partnerRoleEnum = pgEnum("partner_role_enum", [
  "VEHICLE_OWNER",
  "BROKER_REFERRER",
  "OTHER",
]);

// ─── Partner Payable Status ───────────────────────────────────────────────────

export const partnerPayableStatusEnum = pgEnum("partner_payable_status_enum", [
  "PENDING",
  "PAID",
  "CANCELED",
]);

// ─── Partner ──────────────────────────────────────────────────────────────────
// External partner companies or brokers that refer bookings (added migration 030).
// Extended in migration 0012 with role, business, and banking fields.
//
// partner_role defaults to 'BROKER_REFERRER' so all existing rows retain their
// current broker/referrer meaning.  New vehicle-owner partners use 'VEHICLE_OWNER'.

export const partnerTable = pgTable(
  "partner",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    partnerRole: partnerRoleEnum("partner_role").notNull().default("BROKER_REFERRER"),
    // Personal or company information
    type: varchar("type", { length: 20 }).default("Individual"),           // 'Individual' | 'Company'
    contactNumber: varchar("contact_number", { length: 50 }),
    contactEmail: varchar("contact_email", { length: 150 }),
    personalIdOrCompanyId: varchar("personal_id_or_company_id", { length: 100 }),
    // Banking details
    bankName: varchar("bank_name", { length: 150 }),
    bankAccount: varchar("bank_account", { length: 100 }),
    iban: varchar("iban", { length: 50 }),
    accountHolderName: varchar("account_holder_name", { length: 150 }),
    // Notes — informational only, never used for calculations
    agreementNotes: text("agreement_notes"),
    generalNotes: text("general_notes"),
    // Status
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_partner_name").on(t.name),
    index("idx_partner_name").on(t.name),
    index("idx_partner_email").on(t.contactEmail),
    index("idx_partner_role").on(t.partnerRole),
    index("idx_partner_is_active").on(t.isActive),
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
// Note: single vehicle ownership uses vehicle.partner_id FK instead of this table.

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

// ─── Partner Payable ──────────────────────────────────────────────────────────
// A manually-entered payable owed to a vehicle-owner partner.
// Created by finance from an Income accounting entry linked to the partner's vehicle.
// Marking as PAID automatically creates an EXPENSE accounting entry.
//
// DB-level uniqueness:  one non-CANCELED payable per source_income_accounting_entry_id.
// The partial unique index (uq_pp_active_per_income) is defined in the migration SQL
// because Drizzle cannot express partial unique indexes declaratively.

export const partnerPayableTable = pgTable(
  "partner_payable",
  {
    id: serial("id").primaryKey(),
    partnerId: integer("partner_id")
      .notNull()
      .references(() => partnerTable.id),
    bookingId: integer("booking_id")
      .references(() => bookingTable.id, { onDelete: "set null" }),
    vehicleId: integer("vehicle_id")
      .references(() => vehicleTable.id, { onDelete: "set null" }),
    sourceIncomeAccountingEntryId: integer("source_income_accounting_entry_id")
      .notNull()
      .references(() => accountingEntriesTable.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: accountingCurrencyEnum("currency").notNull().default("GEL"),
    status: partnerPayableStatusEnum("status").notNull().default("PENDING"),
    notes: text("notes"),
    createdByAdminId: integer("created_by_admin_id")
      .references(() => adminsTable.id, { onDelete: "set null" }),
    paidByAdminId: integer("paid_by_admin_id")
      .references(() => adminsTable.id, { onDelete: "set null" }),
    paidAt: timestamp("paid_at"),
    expenseAccountingEntryId: integer("expense_accounting_entry_id")
      .references(() => accountingEntriesTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_pp_partner_id").on(t.partnerId),
    index("idx_pp_source_income_id").on(t.sourceIncomeAccountingEntryId),
    index("idx_pp_status").on(t.status),
    index("idx_pp_booking_id").on(t.bookingId),
    index("idx_pp_vehicle_id").on(t.vehicleId),
  ],
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
export const insertPartnerPayableSchema = createInsertSchema(partnerPayableTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Partner = typeof partnerTable.$inferSelect;
export type InsertPartner = z.infer<typeof insertPartnerSchema>;

export type PartnerDocument = typeof partnerDocumentTable.$inferSelect;
export type InsertPartnerDocument = z.infer<typeof insertPartnerDocumentSchema>;

export type PartnerVehicle = typeof partnerVehicleTable.$inferSelect;
export type InsertPartnerVehicle = z.infer<typeof insertPartnerVehicleSchema>;

export type PartnerPayable = typeof partnerPayableTable.$inferSelect;
export type InsertPartnerPayable = z.infer<typeof insertPartnerPayableSchema>;
