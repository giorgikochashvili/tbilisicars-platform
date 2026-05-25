import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  db,
  vehicleTable,
  vehicleModelTable,
  brandTable,
  locationTable,
  bookingTable,
  maintenanceServicesTable,
  parkingAssignmentTable,
} from "@workspace/db";
import { and, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";

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
      // Display-only amounts — read from booking record, no mutations
      totalAmount: bookingTable.totalAmount,
      currency: bookingTable.currency,
      deposit: bookingTable.deposit,
      depositCurrency: bookingTable.depositCurrency,
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

  // ── 3. Active service records (SCHEDULED or IN_PROGRESS) ───────────────────
  // Read-only: used to display wrench icon on vehicle label. No mutations.
  const activeServiceRows = await db
    .select({ vehicleId: maintenanceServicesTable.vehicleId })
    .from(maintenanceServicesTable)
    .where(
      and(
        inArray(maintenanceServicesTable.vehicleId, vehicleIds),
        inArray(maintenanceServicesTable.status, ["SCHEDULED", "IN_PROGRESS"]),
      ),
    );
  const activeServiceSet = new Set(activeServiceRows.map((r) => r.vehicleId));

  // ── 4. Active parking assignments (removedAt IS NULL) ──────────────────────
  // Read-only: used to display parking zone in vehicle label tooltip. No mutations.
  const parkingRows = await db
    .select({
      vehicleId: parkingAssignmentTable.vehicleId,
      zone: parkingAssignmentTable.zone,
    })
    .from(parkingAssignmentTable)
    .where(
      and(
        inArray(parkingAssignmentTable.vehicleId, vehicleIds),
        isNull(parkingAssignmentTable.removedAt),
      ),
    );
  const parkingMap = new Map(parkingRows.map((r) => [r.vehicleId, r.zone]));

  // ── 5. Group bookings by vehicle ────────────────────────────────────────────
  const bookingsByVehicle = new Map<number, typeof bookings>();
  for (const b of bookings) {
    if (b.vehicleId == null) continue;
    if (!bookingsByVehicle.has(b.vehicleId)) bookingsByVehicle.set(b.vehicleId, []);
    bookingsByVehicle.get(b.vehicleId)!.push(b);
  }

  // ── 6. Build response ────────────────────────────────────────────────────────
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
      hasActiveService: activeServiceSet.has(v.id),
      parkingZone: parkingMap.get(v.id) ?? null,
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
        // Display-only booking amounts — read from record, not payment aggregations
        totalAmount: b.totalAmount ?? null,
        currency: b.currency ?? null,
        deposit: b.deposit ?? null,
        depositCurrency: b.depositCurrency ?? null,
      })),
    };
  });

  res.json({ vehicles, dateRange: { start: startDate, end: endDate } });
});

export default router;
