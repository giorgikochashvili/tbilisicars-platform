import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listBookingPayments,
  addBookingPayment,
  deleteBookingPayment,
} from "../services/admin-booking-payments.service.js";
import { NotFoundError } from "../lib/errors.js";

const router: IRouter = Router();

// ─── GET /api/admin/bookings/:id/payments ─────────────────────────────────────

router.get("/admin/bookings/:id/payments", requireAdmin, async (req, res) => {
  const bookingId = parseInt(req.params.id);
  if (isNaN(bookingId)) return res.status(400).json({ error: "Invalid booking ID" });

  const result = await listBookingPayments(bookingId);
  res.json(result);
});

// ─── POST /api/admin/bookings/:id/payments ────────────────────────────────────

router.post("/admin/bookings/:id/payments", requireAdmin, async (req, res) => {
  const bookingId = parseInt(req.params.id);
  if (isNaN(bookingId)) return res.status(400).json({ error: "Invalid booking ID" });

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
  const validTypes = ["BOOKING_PAYMENT", "DEPOSIT_RECEIVED", "DEPOSIT_RETURNED", "REFUND", "ADJUSTMENT"];
  if (paymentType && !validTypes.includes(paymentType)) errors.push("Invalid payment type");
  const validMethods = ["CASH", "CARD", "BANK_TRANSFER", "OTHER"];
  if (method && !validMethods.includes(method)) errors.push("Invalid payment method");

  if (errors.length > 0) return res.status(422).json({ errors });

  try {
    const adminId = req.session.adminId ?? undefined;
    const result = await addBookingPayment({
      bookingId,
      paymentType: paymentType as any,
      amount: Number(amount),
      currency: currency as any,
      paymentDate,
      method: method as any,
      notes: notes || null,
      adminId,
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// ─── DELETE /api/admin/bookings/:id/payments/:paymentId ───────────────────────

router.delete("/admin/bookings/:id/payments/:paymentId", requireAdmin, async (req, res) => {
  const bookingId = parseInt(req.params.id);
  const paymentId = parseInt(req.params.paymentId);
  if (isNaN(bookingId) || isNaN(paymentId)) return res.status(400).json({ error: "Invalid ID" });

  try {
    const result = await deleteBookingPayment(bookingId, paymentId);
    res.json(result);
  } catch (err: any) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

export default router;
