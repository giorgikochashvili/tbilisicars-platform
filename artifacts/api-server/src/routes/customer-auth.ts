/**
 * Customer authentication routes — website-facing, separate from admin auth.
 * POST /api/auth/customer/login   — email + password → session cookie
 * POST /api/auth/customer/logout  — destroy session
 * GET  /api/auth/customer/me      — return current customer (session required)
 * GET  /api/customer/bookings     — list customer's own bookings (session required)
 */
import { Router, type IRouter } from "express";
import { and, desc, isNull, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  bookingTable,
  vehicleTable,
  vehicleModelTable,
  brandTable,
  locationTable,
} from "@workspace/db";
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

// ─── Customer bookings list ───────────────────────────────────────────────────

const pickupLoc = alias(locationTable, "pickup_loc");
const dropoffLoc = alias(locationTable, "dropoff_loc");
const vehicleModelAlias = alias(vehicleModelTable, "vehicle_model_a");
const bookingModelAlias = alias(vehicleModelTable, "booking_model_a");
const vehicleBrandAlias = alias(brandTable, "vehicle_brand_a");
const bookingBrandAlias = alias(brandTable, "booking_brand_a");

router.get("/customer/bookings", requireCustomer, async (req, res) => {
  const customerId = req.session.customerId!;

  const rows = await db
    .select({
      id: bookingTable.id,
      status: bookingTable.status,
      pickupDatetime: bookingTable.pickupDatetime,
      dropoffDatetime: bookingTable.dropoffDatetime,
      totalAmount: bookingTable.totalAmount,
      currency: bookingTable.currency,
      createdAt: bookingTable.createdAt,
      pickupLocationName: pickupLoc.name,
      dropoffLocationName: dropoffLoc.name,
      vehicleBrandName: vehicleBrandAlias.name,
      vehicleModelName: vehicleModelAlias.name,
      bookingBrandName: bookingBrandAlias.name,
      bookingModelName: bookingModelAlias.name,
    })
    .from(bookingTable)
    .innerJoin(pickupLoc, eq(bookingTable.pickupLocationId, pickupLoc.id))
    .innerJoin(dropoffLoc, eq(bookingTable.dropoffLocationId, dropoffLoc.id))
    .leftJoin(vehicleTable, eq(bookingTable.vehicleId, vehicleTable.id))
    .leftJoin(vehicleModelAlias, eq(vehicleTable.vehicleModelId, vehicleModelAlias.id))
    .leftJoin(vehicleBrandAlias, eq(vehicleModelAlias.brandId, vehicleBrandAlias.id))
    .leftJoin(bookingModelAlias, eq(bookingTable.vehicleModelId, bookingModelAlias.id))
    .leftJoin(bookingBrandAlias, eq(bookingModelAlias.brandId, bookingBrandAlias.id))
    .where(
      and(
        eq(bookingTable.userId, customerId),
        isNull(bookingTable.deletedAt),
      ),
    )
    .orderBy(desc(bookingTable.createdAt))
    .limit(50);

  const bookings = rows.map((row) => {
    const reference = `TC-${String(row.id).padStart(5, "0")}`;
    const vehicleName =
      row.vehicleBrandName && row.vehicleModelName
        ? `${row.vehicleBrandName} ${row.vehicleModelName}`
        : row.bookingBrandName && row.bookingModelName
          ? `${row.bookingBrandName} ${row.bookingModelName}`
          : null;

    return {
      id: row.id,
      reference,
      status: row.status,
      pickupDatetime: row.pickupDatetime,
      dropoffDatetime: row.dropoffDatetime,
      totalAmount: row.totalAmount,
      currency: row.currency ?? "GEL",
      createdAt: row.createdAt,
      pickupLocationName: row.pickupLocationName,
      dropoffLocationName: row.dropoffLocationName,
      vehicleName,
    };
  });

  res.json(bookings);
});

export default router;
