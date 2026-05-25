import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  db,
  vehicleTable,
  vehicleModelTable,
  brandTable,
  locationTable,
  bookingTable,
} from "@workspace/db";
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/admin/fleet-calendar", requireAdmin, async (req, res) => {
  const { startDate, endDate, city } = req.query as Record<string, string | undefined>;

  if (!startDate || !endDate) {
    res.status(400).json({ error: "startDate and endDate are required" });
    return;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  // Make endDate inclusive: extend to end of that day
  end.setHours(23, 59, 59, 999);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ error: "Invalid date format" });
    return;
  }

  // ── 1. Load vehicles with brand, model, location ────────────────────────────
  const vehicleRows = await db
    .select({
      id: vehicleTable.id,
      licensePlate: vehicleTable.licensePlate,
      status: vehicleTable.status,
      locationId: vehicleTable.locationId,
      city: locationTable.city,
      modelId: vehicleModelTable.id,
      modelName: vehicleModelTable.name,
      modelCategory: vehicleModelTable.category,
      brandName: brandTable.name,
    })
    .from(vehicleTable)
    .leftJoin(vehicleModelTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .leftJoin(locationTable, eq(vehicleTable.locationId, locationTable.id));

  // Apply city filter
  const filteredVehicles =
    city && city !== "all" ? vehicleRows.filter((v) => v.city === city) : vehicleRows;

  if (filteredVehicles.length === 0) {
    res.json({ vehicles: [], dateRange: { start: startDate, end: endDate } });
    return;
  }

  const vehicleIds = filteredVehicles.map((v) => v.id);

  // ── 2. Load bookings within date range for these vehicles ───────────────────
  const bookings = await db
    .select({
      id: bookingTable.id,
      vehicleId: bookingTable.vehicleId,
      status: bookingTable.status,
      pickupDatetime: bookingTable.pickupDatetime,
      dropoffDatetime: bookingTable.dropoffDatetime,
      contactFullName: bookingTable.contactFullName,
    })
    .from(bookingTable)
    .where(
      and(
        isNotNull(bookingTable.vehicleId),
        inArray(bookingTable.vehicleId, vehicleIds),
        // Booking overlaps visible range: pickup <= rangeEnd AND dropoff >= rangeStart
        lte(bookingTable.pickupDatetime, end),
        gte(bookingTable.dropoffDatetime, start),
      ),
    );

  // ── 3. Group bookings by vehicle ────────────────────────────────────────────
  const bookingsByVehicle = new Map<number, typeof bookings>();
  for (const b of bookings) {
    if (b.vehicleId == null) continue;
    if (!bookingsByVehicle.has(b.vehicleId)) bookingsByVehicle.set(b.vehicleId, []);
    bookingsByVehicle.get(b.vehicleId)!.push(b);
  }

  // ── 4. Build response ────────────────────────────────────────────────────────
  const vehicles = filteredVehicles.map((v) => {
    const vBookings = bookingsByVehicle.get(v.id) ?? [];
    return {
      id: v.id,
      label: [v.brandName, v.modelName].filter(Boolean).join(" ") || v.licensePlate,
      plate: v.licensePlate,
      status: v.status,
      city: v.city,
      // Read-only enrichment — display only, no mutations
      modelId: v.modelId ?? null,
      modelName: v.modelName ?? null,
      brandName: v.brandName ?? null,
      categoryName: v.modelCategory ?? null,
      bookings: vBookings.map((b) => ({
        id: b.id,
        status: b.status,
        // Date-only strings — preserved for compatibility
        pickupDate: b.pickupDatetime.toISOString().split("T")[0],
        dropoffDate: b.dropoffDatetime.toISOString().split("T")[0],
        // Full ISO datetimes — read-only, for hour-aware overdue display logic
        pickupDateTime: b.pickupDatetime.toISOString(),
        dropoffDateTime: b.dropoffDatetime.toISOString(),
        customerName: b.contactFullName,
      })),
    };
  });

  res.json({ vehicles, dateRange: { start: startDate, end: endDate } });
});

export default router;
