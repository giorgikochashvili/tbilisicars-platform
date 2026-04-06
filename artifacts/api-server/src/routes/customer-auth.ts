/**
 * Customer authentication routes — website-facing, separate from admin auth.
 * POST /api/auth/customer/login   — email + password → session cookie
 * POST /api/auth/customer/logout  — destroy session
 * GET  /api/auth/customer/me      — return current customer (session required)
 */
import { Router, type IRouter } from "express";
import { requireCustomer } from "../middlewares/requireCustomer.js";
import {
  loginCustomer,
  logoutCustomer,
  getCustomerById,
} from "../services/customer-auth.service.js";

const router: IRouter = Router();

router.post("/auth/customer/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password?.trim()) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    res.status(400).json({ error: "Invalid email format" });
    return;
  }

  const user = await loginCustomer(email.trim().toLowerCase(), password);
  req.session.customerId = user.id;

  res.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
  });
});

router.post("/auth/customer/logout", async (req, res) => {
  await logoutCustomer(req.session);
  res.json({ message: "Logged out" });
});

router.get("/auth/customer/me", requireCustomer, async (req, res) => {
  const user = await getCustomerById(req.session.customerId!);
  res.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
  });
});

export default router;
