import { db } from "@workspace/db";
import {
  bookingPaymentTable,
  accountingEntriesTable,
  bookingTable,
  bookingHistoryTable,
} from "@workspace/db";
import { eq, desc, sql, and, or, isNull } from "drizzle-orm";
import { getExchangeRate, convertToGel } from "./admin-accounting.service.js";
import { NotFoundError } from "../lib/errors.js";
import { pool } from "@workspace/db";

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentType =
  | "BOOKING_PAYMENT"
  | "DEPOSIT_RECEIVED"
  | "DEPOSIT_RETURNED"
  | "REFUND"
  | "ADJUSTMENT"
  | "ADDITIONAL_PAYMENT"
  | "EXTRA_DAYS_PAYMENT"
  | "ADVANCE_PAYMENT";

export type PaymentMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";
export type PaymentCurrency = "GEL" | "USD" | "EUR";

// Map payment type to accounting category and direction
const PAYMENT_TYPE_ACCOUNTING: Record<
  PaymentType,
  { type: "INCOME" | "EXPENSE"; category: string } | null
> = {
  BOOKING_PAYMENT:    { type: "INCOME",  category: "Booking Payment"    },
  DEPOSIT_RECEIVED:   { type: "INCOME",  category: "Deposit Received"   },
  DEPOSIT_RETURNED:   { type: "EXPENSE", category: "Deposit Returned"   },
  REFUND:             { type: "EXPENSE", category: "Refund"             },
  ADJUSTMENT:         null,
  ADDITIONAL_PAYMENT: { type: "INCOME",  category: "Extra Payment"      },
  EXTRA_DAYS_PAYMENT: { type: "INCOME",  category: "Extra Days Payment" },
  ADVANCE_PAYMENT:    null, // No accounting entry at creation — created on Mark as Received
};

// ─── Payment Summary ──────────────────────────────────────────────────────────

export async function getBookingPaymentSummary(bookingId: number, tx?: TxClient) {
  const client = tx ?? db;

  const bookingRows = await client
    .select({
      currency: bookingTable.currency,
      totalAmount: bookingTable.totalAmount,
    })
    .from(bookingTable)
    .where(eq(bookingTable.id, bookingId))
    .limit(1);

  const bookingCurrency: string = bookingRows[0]?.currency ?? "GEL";
  const bookingTotalAmount: string | null = bookingRows[0]?.totalAmount ?? null;

  const paymentRows = await client
    .select({
      paymentType: bookingPaymentTable.paymentType,
      totalGel: sql<string>`SUM(${bookingPaymentTable.convertedGel}::numeric)`,
      totalOriginal: sql<string>`SUM(CASE WHEN ${bookingPaymentTable.currency} = ${bookingCurrency} THEN ${bookingPaymentTable.amount}::numeric ELSE 0 END)`,
    })
    .from(bookingPaymentTable)
    .where(
      and(
        eq(bookingPaymentTable.bookingId, bookingId),
        // Exclude PENDING advance payments — they are not real income yet.
        // RECEIVED advance payments (advanceStatus = 'RECEIVED') are included.
        or(
          isNull(bookingPaymentTable.advanceStatus),
          eq(bookingPaymentTable.advanceStatus, "RECEIVED"),
        ),
      ),
    )
    .groupBy(bookingPaymentTable.paymentType);

  const totals: Record<string, { gel: number; original: number }> = {};
  for (const r of paymentRows) {
    totals[r.paymentType] = {
      gel: parseFloat(r.totalGel ?? "0"),
      original: parseFloat(r.totalOriginal ?? "0"),
    };
  }

  const totalPaid =
    (totals["BOOKING_PAYMENT"]?.gel    ?? 0) +
    (totals["ADJUSTMENT"]?.gel         ?? 0) +
    (totals["ADDITIONAL_PAYMENT"]?.gel ?? 0) +
    (totals["EXTRA_DAYS_PAYMENT"]?.gel ?? 0) +
    (totals["ADVANCE_PAYMENT"]?.gel    ?? 0); // only RECEIVED rows reach here
  const totalPaidOriginal =
    (totals["BOOKING_PAYMENT"]?.original    ?? 0) +
    (totals["ADJUSTMENT"]?.original         ?? 0) +
    (totals["ADDITIONAL_PAYMENT"]?.original ?? 0) +
    (totals["EXTRA_DAYS_PAYMENT"]?.original ?? 0) +
    (totals["ADVANCE_PAYMENT"]?.original    ?? 0);
  const depositReceived = totals["DEPOSIT_RECEIVED"]?.gel ?? 0;
  const depositReceivedOriginal = totals["DEPOSIT_RECEIVED"]?.original ?? 0;
  const depositReturned = totals["DEPOSIT_RETURNED"]?.gel ?? 0;
  const depositReturnedOriginal = totals["DEPOSIT_RETURNED"]?.original ?? 0;
  const totalRefunded = totals["REFUND"]?.gel ?? 0;
  const totalRefundedOriginal = totals["REFUND"]?.original ?? 0;

  let totalPriceGel: number | null = null;
  if (bookingTotalAmount) {
    const priceNum = parseFloat(bookingTotalAmount);
    if (!isNaN(priceNum)) {
      if (bookingCurrency === "GEL") {
        totalPriceGel = priceNum;
      } else {
        const rate = await getExchangeRate();
        totalPriceGel = rate
          ? convertToGel(priceNum, bookingCurrency as PaymentCurrency, rate)
          : null;
      }
    }
  }

  return {
    currency: bookingCurrency,
    totalPaid,
    totalPaidOriginal,
    depositReceived,
    depositReceivedOriginal,
    depositReturned,
    depositReturnedOriginal,
    totalRefunded,
    totalRefundedOriginal,
    netDeposit: depositReceived - depositReturned,
    netDepositOriginal: depositReceivedOriginal - depositReturnedOriginal,
    totalPriceGel,
  };
}

// ─── Derive & persist booking payment status ──────────────────────────────────
//
// Compares the GEL-equivalent total paid against the booking's total amount
// (converted to GEL) and writes the resulting paymentStatus to the booking row.

export async function updateBookingPaymentStatus(
  bookingId: number,
  summary: Awaited<ReturnType<typeof getBookingPaymentSummary>>,
  tx?: TxClient,
) {
  const client = tx ?? db;

  const bookingRows = await client
    .select({
      totalAmount: bookingTable.totalAmount,
      currency: bookingTable.currency,
    })
    .from(bookingTable)
    .where(eq(bookingTable.id, bookingId))
    .limit(1);

  const b = bookingRows[0];
  if (!b) return;

  const totalPaidGel = summary.totalPaid;

  let newStatus: "UNPAID" | "HALF" | "PAID";

  if (totalPaidGel <= 0) {
    newStatus = "UNPAID";
  } else if (!b.totalAmount) {
    // No booking price set — cannot confirm fully paid
    newStatus = "HALF";
  } else {
    const bookingTotal = parseFloat(b.totalAmount);
    let bookingTotalGel: number;

    if (!b.currency || b.currency === "GEL") {
      bookingTotalGel = bookingTotal;
    } else {
      const rate = await getExchangeRate();
      if (!rate) {
        console.error(
          `[PAYMENT STATUS SKIPPED] bookingId=${bookingId} | currency=${b.currency} | reason=missing exchange rate`,
        );
        return;
      }
      bookingTotalGel = convertToGel(bookingTotal, b.currency as PaymentCurrency, rate);
    }

    newStatus = totalPaidGel >= bookingTotalGel - 0.005 ? "PAID" : "HALF";
  }

  await client
    .update(bookingTable)
    .set({ paymentStatus: newStatus, updatedAt: new Date() })
    .where(eq(bookingTable.id, bookingId));
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
  advanceStatus?: "PENDING" | null;
}

export async function addBookingPayment(input: AddPaymentInput) {
  const { bookingId, paymentType, amount, currency, paymentDate, method, notes, adminId } = input;
  // ADVANCE_PAYMENT always uses PENDING status; null means normal payment
  const advanceStatus = paymentType === "ADVANCE_PAYMENT" ? "PENDING" : null;

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

  // Payment insert, accounting entry, summary calculation, and payment_status
  // update are all inside the same transaction so a crash between operations
  // cannot leave the booking in a stale payment_status state.
  const { payment, summary } = await db.transaction(async (tx) => {
    let accountingEntryId: number | null = null;

    // ADVANCE_PAYMENT maps to null in PAYMENT_TYPE_ACCOUNTING, so no accounting
    // entry is created here. Entry is created only on Mark as Received.
    const acctMapping = PAYMENT_TYPE_ACCOUNTING[paymentType];
    if (acctMapping) {
      const [entry] = await tx
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

    const [payment] = await tx
      .insert(bookingPaymentTable)
      .values({
        bookingId,
        paymentType: paymentType as any,
        amount: String(amount),
        currency: currency as "GEL" | "USD" | "EUR",
        convertedGel: String(convertedGel),
        paymentDate,
        method,
        notes: notes ?? null,
        accountingEntryId,
        advanceStatus,
      })
      .returning();

    if (advanceStatus === "PENDING") {
      await tx.insert(bookingHistoryTable).values({
        bookingId,
        changedById: adminId ?? null,
        actionType: "ADVANCE_PENDING",
        fieldName: "advance_status",
        oldValue: null,
        newValue: "PENDING",
        description: `Advance payment of ${currency} ${amount.toFixed(2)} recorded as pending receivable`,
      });
    }

    const summary = await getBookingPaymentSummary(bookingId, tx);
    await updateBookingPaymentStatus(bookingId, summary, tx);

    return { payment, summary };
  });

  return { payment, summary };
}

// ─── Receive Advance Payment ──────────────────────────────────────────────────
//
// Atomically marks a PENDING advance payment as RECEIVED, creates the
// accounting income entry, and recalculates paymentStatus. Idempotent guard:
// if the row is not PENDING the operation is rejected before any writes.

export async function receiveAdvancePayment(
  paymentId: number,
  bookingId: number,
  adminId?: number,
) {
  const [existing] = await db
    .select()
    .from(bookingPaymentTable)
    .where(eq(bookingPaymentTable.id, paymentId));

  if (!existing || existing.bookingId !== bookingId) {
    throw new NotFoundError(`Payment ${paymentId} not found on booking ${bookingId}`);
  }
  if (existing.paymentType !== "ADVANCE_PAYMENT") {
    throw new Error("Payment is not an advance payment");
  }
  if (existing.advanceStatus !== "PENDING") {
    throw new Error("Advance payment has already been received");
  }

  const amount = parseFloat(String(existing.amount));
  const currency = existing.currency as PaymentCurrency;

  const rate = await getExchangeRate();
  const convertedGel = rate
    ? convertToGel(amount, currency, rate)
    : currency === "GEL"
      ? amount
      : parseFloat(String(existing.convertedGel));

  const today = new Date().toISOString().slice(0, 10);

  const { payment, summary } = await db.transaction(async (tx) => {
    // 1. Create accounting income entry
    const [entry] = await tx
      .insert(accountingEntriesTable)
      .values({
        type: "INCOME",
        category: "Advance Payment",
        amount: String(amount),
        currency: currency as "GEL" | "USD" | "EUR",
        convertedGel: String(convertedGel),
        entryDate: today,
        notes: existing.notes ?? null,
        relatedBookingId: bookingId,
        adminId: adminId ?? null,
      })
      .returning({ id: accountingEntriesTable.id });

    // 2. Mark booking_payment as RECEIVED and link accounting entry
    const [payment] = await tx
      .update(bookingPaymentTable)
      .set({
        advanceStatus: "RECEIVED",
        accountingEntryId: entry.id,
        receivedAt: new Date(),
        receivedById: adminId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(bookingPaymentTable.id, paymentId))
      .returning();

    // 3. Recalculate summary (RECEIVED row now included) and paymentStatus
    const summary = await getBookingPaymentSummary(bookingId, tx);
    await updateBookingPaymentStatus(bookingId, summary, tx);

    // 4. Audit history
    await tx.insert(bookingHistoryTable).values({
      bookingId,
      changedById: adminId ?? null,
      actionType: "ADVANCE_RECEIVED",
      fieldName: "advance_status",
      oldValue: "PENDING",
      newValue: "RECEIVED",
      description: `Advance payment of ${currency} ${amount.toFixed(2)} marked as received`,
    });

    return { payment, summary };
  });

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

  // Payment delete, accounting entry delete, summary calculation, and
  // payment_status update are all inside the same transaction.
  const { summary } = await db.transaction(async (tx) => {
    if (existing.accountingEntryId) {
      await tx
        .delete(accountingEntriesTable)
        .where(eq(accountingEntriesTable.id, existing.accountingEntryId));
    }

    await tx
      .delete(bookingPaymentTable)
      .where(eq(bookingPaymentTable.id, paymentId));

    const summary = await getBookingPaymentSummary(bookingId, tx);
    await updateBookingPaymentStatus(bookingId, summary, tx);

    return { summary };
  });

  return { summary };
}
