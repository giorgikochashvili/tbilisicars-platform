import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  integer,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingTable, paymentStatusEnum } from "./bookings";
import { userTable } from "./users";

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
