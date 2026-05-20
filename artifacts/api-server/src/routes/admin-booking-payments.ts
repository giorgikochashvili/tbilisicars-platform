import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listBookingPayments,
  addBookingPayment,
  deleteBookingPayment,
} from "../services/admin-booking-payments.service.js";
import { NotFoundError } from "../lib/errors.js";
import { logAudit, bookingRef, paymentRef } from "../services/audit.service.js";

const router: IRouter = Router();

// ─── GET /api/admin/bookings/:id/payments ─────────────────────────────────────

router.get("/admin/bookings/:id/payments", requireAdmin, async (req, res) => {
  const bookingId = parseInt(String(req.params.id), 10);
  if (isNaN(bookingId)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }

  const result = await listBookingPayments(bookingId);
  res.json(result);
});

// ─── POST /api/admin/bookings/:id/payments ────────────────────────────────────

router.post("/admin/bookings/:id/payments", requireAdmin, async (req, res) => {
  const bookingId = parseInt(String(req.params.id), 10);
  if (isNaN(bookingId)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }

  const { paymentType, amount, currency, paymentDate, method, notes } = req.body as {
    paymentType?: string;
    amount?: number;
    currency?: string;
    paymentDate?: string;
    method?: string;
    notes?: string;
  };

  const errors: string[] = [];
  if (!paymentType) errors.push("Payment type is required");
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) errors.push("Amount must be greater than zero");
  if (!currency || !["GEL", "USD", "EUR"].includes(currency)) errors.push("Valid currency (GEL/USD/EUR) is required");
  if (!paymentDate) errors.push("Payment date is required");
  if (!method) errors.push("Payment method is required");
  const validTypes = ["BOOKING_PAYMENT", "ADDITIONAL_PAYMENT", "EXTRA_DAYS_PAYMENT"];
  if (paymentType && !validTypes.includes(paymentType)) errors.push("Invalid payment type");
  const validMethods = ["CASH", "CARD", "BANK_TRANSFER", "OTHER"];
  if (method && !validMethods.includes(method)) errors.push("Invalid payment method");

  if (errors.length > 0) {
    res.status(422).json({ errors });
    return;
  }

  try {
    const adminId = req.session.adminId ?? undefined;
    const result = await addBookingPayment({
      bookingId,
      paymentType: paymentType as any,
      amount: Number(amount),
      currency: currency as any,
      paymentDate: paymentDate ?? new Date().toISOString(),
      method: method as any,
      notes: notes || null,
      adminId,
    });

    const actionMap: Record<string, string> = {
      DEPOSIT_RECEIVED:   "deposit_received",
      DEPOSIT_RETURNED:   "deposit_returned",
      REFUND:             "refund_added",
      ADDITIONAL_PAYMENT: "additional_payment_added",
      EXTRA_DAYS_PAYMENT: "extra_days_payment_added",
    };
    const action = actionMap[paymentType!] ?? "payment_added";
    const amtStr = `${currency} ${Number(amount).toFixed(2)}`;
    const typeLabel: Record<string, string> = {
      BOOKING_PAYMENT:    "booking payment",
      DEPOSIT_RECEIVED:   "deposit received",
      DEPOSIT_RETURNED:   "deposit returned",
      REFUND:             "refund",
      ADJUSTMENT:         "adjustment",
      ADDITIONAL_PAYMENT: "additional payment",
      EXTRA_DAYS_PAYMENT: "extra days payment",
    };

    logAudit({
      actorId: adminId ?? null,
      entityType: "payment",
      entityId: result.payment.id,
      entityRef: paymentRef(result.payment.id),
      action,
      summary: `Admin added ${typeLabel[paymentType!] ?? paymentType} of ${amtStr} to booking ${bookingRef(bookingId)}`,
      afterData: { bookingId, paymentType, amount: Number(amount), currency, method },
    });

    res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ─── DELETE /api/admin/bookings/:id/payments/:paymentId ───────────────────────

router.delete("/admin/bookings/:id/payments/:paymentId", requireAdmin, async (req, res) => {
  const bookingId = parseInt(String(req.params.id), 10);
  const paymentId = parseInt(String(req.params.paymentId), 10);
  if (isNaN(bookingId) || isNaN(paymentId)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  try {
    const result = await deleteBookingPayment(bookingId, paymentId);
    logAudit({
      actorId: req.session.adminId ?? null,
      entityType: "payment",
      entityId: paymentId,
      entityRef: paymentRef(paymentId),
      action: "payment_deleted",
      summary: `Admin deleted payment ${paymentRef(paymentId)} from booking ${bookingRef(bookingId)}`,
      beforeData: { bookingId },
    });
    res.json(result);
  } catch (err: any) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
