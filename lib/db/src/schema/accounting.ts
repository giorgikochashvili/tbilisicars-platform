import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
  text,
  date,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingTable, paymentStatusEnum } from "./bookings";
import { userTable } from "./users";

// ─── Booking Payment Enums ────────────────────────────────────────────────────

export const bookingPaymentTypeEnum = pgEnum("booking_payment_type_enum", [
  "BOOKING_PAYMENT",
  "DEPOSIT_RECEIVED",
  "DEPOSIT_RETURNED",
  "REFUND",
  "ADJUSTMENT",
]);

export const bookingPaymentMethodEnum = pgEnum("booking_payment_method_enum", [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "OTHER",
]);

// ─── Enums ───────────────────────────────────────────────────────────────────

export const paymentMethodEnum = pgEnum("paymentmethodenum", [
  "CARD",
  "CASH",
  "BANK_TRANSFER",
  "STRIPE",
  "PAYPAL",
]);

// ─── Payment ──────────────────────────────────────────────────────────────────

export const paymentTable = pgTable(
  "payment",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "restrict" }),
    method: paymentMethodEnum("method").notNull(),
    // Payment status mirrors booking-level paymentStatus but is specific to this payment record
    status: paymentStatusEnum("status").notNull().default("UNPAID"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    transactionId: varchar("transaction_id", { length: 255 }),
    processorResponse: varchar("processor_response", { length: 2000 }),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_payment_booking_id").on(t.bookingId),
    index("idx_payment_user_id").on(t.userId),
    index("idx_payment_method").on(t.method),
    index("idx_payment_status").on(t.status),
    index("idx_payment_paid_at").on(t.paidAt),
  ],
);

// ─── Insert Schema ────────────────────────────────────────────────────────────

export const insertPaymentSchema = createInsertSchema(paymentTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Payment = typeof paymentTable.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// ─── Operational Accounting ───────────────────────────────────────────────────

export const accountingEntryTypeEnum = pgEnum("accounting_entry_type_enum", [
  "INCOME",
  "EXPENSE",
]);

export const accountingCurrencyEnum = pgEnum("accounting_currency_enum", [
  "GEL",
  "USD",
  "EUR",
]);

// Exchange rates — single row updated by admin; rates are USD→GEL and EUR→GEL
export const exchangeRatesTable = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  usdToGel: numeric("usd_to_gel", { precision: 10, scale: 4 }).notNull(),
  eurToGel: numeric("eur_to_gel", { precision: 10, scale: 4 }).notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Operational accounting entries (income / expense ledger)
export const accountingEntriesTable = pgTable(
  "accounting_entries",
  {
    id: serial("id").primaryKey(),
    type: accountingEntryTypeEnum("type").notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: accountingCurrencyEnum("currency").notNull().default("GEL"),
    convertedGel: numeric("converted_gel", { precision: 12, scale: 2 }).notNull(),
    entryDate: date("entry_date").notNull(),
    notes: text("notes"),
    relatedBookingId: integer("related_booking_id"),
    relatedVehicleId: integer("related_vehicle_id"),
    relatedServiceId: integer("related_service_id"),
    adminId: integer("admin_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_accounting_entries_type").on(t.type),
    index("idx_accounting_entries_currency").on(t.currency),
    index("idx_accounting_entries_entry_date").on(t.entryDate),
    index("idx_accounting_entries_category").on(t.category),
  ],
);

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertExchangeRateSchema = createInsertSchema(exchangeRatesTable).omit({
  id: true,
  updatedAt: true,
});

export const insertAccountingEntrySchema = createInsertSchema(accountingEntriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExchangeRate = typeof exchangeRatesTable.$inferSelect;
export type AccountingEntry = typeof accountingEntriesTable.$inferSelect;

// ─── Booking Payment Table ─────────────────────────────────────────────────────

export const bookingPaymentTable = pgTable(
  "booking_payment",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    paymentType: bookingPaymentTypeEnum("payment_type").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: accountingCurrencyEnum("currency").notNull().default("GEL"),
    convertedGel: numeric("converted_gel", { precision: 12, scale: 2 }).notNull(),
    paymentDate: date("payment_date").notNull(),
    method: bookingPaymentMethodEnum("method").notNull(),
    notes: text("notes"),
    accountingEntryId: integer("accounting_entry_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_booking_payment_booking_id").on(t.bookingId),
    index("idx_booking_payment_type").on(t.paymentType),
    index("idx_booking_payment_date").on(t.paymentDate),
  ],
);

export const insertBookingPaymentSchema = createInsertSchema(bookingPaymentTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BookingPayment = typeof bookingPaymentTable.$inferSelect;
export type InsertBookingPayment = z.infer<typeof insertBookingPaymentSchema>;
