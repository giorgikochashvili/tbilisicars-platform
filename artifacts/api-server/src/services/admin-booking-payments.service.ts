import { db } from "@workspace/db";
import {
  bookingPaymentTable,
  accountingEntriesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getExchangeRate, convertToGel } from "./admin-accounting.service.js";
import { NotFoundError } from "../lib/errors.js";
import { pool } from "@workspace/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentType =
  | "BOOKING_PAYMENT"
  | "DEPOSIT_RECEIVED"
  | "DEPOSIT_RETURNED"
  | "REFUND"
  | "ADJUSTMENT";

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
export type PaymentCurrency = "GEL" | "USD" | "EUR";

// Map payment type to accounting category and direction
const PAYMENT_TYPE_ACCOUNTING: Record<
  PaymentType,
  { type: "INCOME" | "EXPENSE"; category: string } | null
> = {
  BOOKING_PAYMENT: { type: "INCOME", category: "Booking Payment" },
  DEPOSIT_RECEIVED: { type: "INCOME", category: "Deposit Received" },
  DEPOSIT_RETURNED: { type: "EXPENSE", category: "Deposit Returned" },
  REFUND: { type: "EXPENSE", category: "Refund" },
  ADJUSTMENT: null,
};

// ─── Payment Summary ──────────────────────────────────────────────────────────

export async function getBookingPaymentSummary(bookingId: number) {
  const { rows } = await pool.query(
    `SELECT
      payment_type,
      SUM(converted_gel::numeric) AS total_gel
    FROM booking_payment
    WHERE booking_id = $1
    GROUP BY payment_type`,
    [bookingId],
  );

  const totals: Record<string, number> = {};
  for (const r of rows) {
    totals[r.payment_type] = parseFloat(r.total_gel ?? "0");
  }

  const totalPaid = (totals["BOOKING_PAYMENT"] ?? 0) + (totals["ADJUSTMENT"] ?? 0);
  const depositReceived = totals["DEPOSIT_RECEIVED"] ?? 0;
  const depositReturned = totals["DEPOSIT_RETURNED"] ?? 0;
  const totalRefunded = totals["REFUND"] ?? 0;

  return {
    totalPaid,
    depositReceived,
    depositReturned,
    totalRefunded,
    netDeposit: depositReceived - depositReturned,
  };
}

// ─── Derive & persist booking payment status ──────────────────────────────────
//
// Compares the GEL-equivalent total paid against the booking's total amount
// (converted to GEL) and writes the resulting paymentStatus to the booking row.

async function updateBookingPaymentStatus(
  bookingId: number,
  summary: Awaited<ReturnType<typeof getBookingPaymentSummary>>,
) {
  const { rows: bookingRows } = await pool.query(
    `SELECT total_amount, currency FROM booking WHERE id = $1`,
    [bookingId],
  );
  const b = bookingRows[0];
  if (!b) return;

  const totalPaidGel = summary.totalPaid;

  let newStatus: "UNPAID" | "HALF" | "PAID";

  if (totalPaidGel <= 0) {
    newStatus = "UNPAID";
  } else if (!b.total_amount) {
    // No booking price set — cannot confirm fully paid
    newStatus = "HALF";
  } else {
    const bookingTotal = parseFloat(b.total_amount);
    let bookingTotalGel: number;

    if (!b.currency || b.currency === "GEL") {
      bookingTotalGel = bookingTotal;
    } else {
      const rate = await getExchangeRate();
      bookingTotalGel = rate
        ? convertToGel(bookingTotal, b.currency as PaymentCurrency, rate)
        : bookingTotal;
    }

    newStatus = totalPaidGel >= bookingTotalGel - 0.005 ? "PAID" : "HALF";
  }

  await pool.query(
    `UPDATE booking SET payment_status = $1, updated_at = NOW() WHERE id = $2`,
    [newStatus, bookingId],
  );
}

// ─── List Payments ────────────────────────────────────────────────────────────

export async function listBookingPayments(bookingId: number) {
  const payments = await db
    .select()
    .from(bookingPaymentTable)
    .where(eq(bookingPaymentTable.bookingId, bookingId))
    .orderBy(desc(bookingPaymentTable.paymentDate), desc(bookingPaymentTable.id));

  const summary = await getBookingPaymentSummary(bookingId);

  return { payments, summary };
}

// ─── Add Payment ──────────────────────────────────────────────────────────────

export interface AddPaymentInput {
  bookingId: number;
  paymentType: PaymentType;
  amount: number;
  currency: PaymentCurrency;
  paymentDate: string;
  method: PaymentMethod;
  notes?: string | null;
  adminId?: number;
}

export async function addBookingPayment(input: AddPaymentInput) {
  const { bookingId, paymentType, amount, currency, paymentDate, method, notes, adminId } = input;

  if (amount <= 0) throw new Error("Amount must be greater than zero");

  const { rows: bookingRows } = await pool.query(
    `SELECT id FROM booking WHERE id = $1`,
    [bookingId],
  );
  if (!bookingRows[0]) throw new NotFoundError(`Booking ${bookingId} not found`);

  const rate = await getExchangeRate();
  const convertedGel = rate
    ? convertToGel(amount, currency, rate)
    : currency === "GEL"
      ? amount
      : amount;

  let accountingEntryId: number | null = null;

  const acctMapping = PAYMENT_TYPE_ACCOUNTING[paymentType];
  if (acctMapping) {
    const [entry] = await db
      .insert(accountingEntriesTable)
      .values({
        type: acctMapping.type,
        category: acctMapping.category,
        amount: String(amount),
        currency: currency as "GEL" | "USD" | "EUR",
        convertedGel: String(convertedGel),
        entryDate: paymentDate,
        notes: notes ?? null,
        relatedBookingId: bookingId,
        adminId: adminId ?? null,
      })
      .returning({ id: accountingEntriesTable.id });
    accountingEntryId = entry.id;
  }

  const [payment] = await db
    .insert(bookingPaymentTable)
    .values({
      bookingId,
      paymentType,
      amount: String(amount),
      currency: currency as "GEL" | "USD" | "EUR",
      convertedGel: String(convertedGel),
      paymentDate,
      method,
      notes: notes ?? null,
      accountingEntryId,
    })
    .returning();

  const summary = await getBookingPaymentSummary(bookingId);

  await updateBookingPaymentStatus(bookingId, summary);

  return { payment, summary };
}

// ─── Delete Payment ───────────────────────────────────────────────────────────

export async function deleteBookingPayment(bookingId: number, paymentId: number) {
  const [existing] = await db
    .select()
    .from(bookingPaymentTable)
    .where(eq(bookingPaymentTable.id, paymentId));

  if (!existing || existing.bookingId !== bookingId) {
    throw new NotFoundError(`Payment ${paymentId} not found on booking ${bookingId}`);
  }

  if (existing.accountingEntryId) {
    await db
      .delete(accountingEntriesTable)
      .where(eq(accountingEntriesTable.id, existing.accountingEntryId));
  }

  await db
    .delete(bookingPaymentTable)
    .where(eq(bookingPaymentTable.id, paymentId));

  const summary = await getBookingPaymentSummary(bookingId);

  await updateBookingPaymentStatus(bookingId, summary);

  return { summary };
}
