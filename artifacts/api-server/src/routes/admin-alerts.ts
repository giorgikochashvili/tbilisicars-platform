import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// ─── GET /api/admin/alerts ─────────────────────────────────────────────────────
// Returns all operational alerts computed dynamically from live data.
// Query params: type (PICKUP_TODAY|DROPOFF_TODAY|OVERDUE|CONFLICT|SERVICE_DUE), region

router.get("/admin/alerts", requireAdmin, async (req, res) => {
  const { type, region } = req.query as Record<string, string | undefined>;
  const now = new Date().toISOString();
  const alerts: object[] = [];

  // ── 1. PICKUP TODAY ─────────────────────────────────────────────────────────
  if (!type || type === "PICKUP_TODAY") {
    const { rows } = await pool.query(`
      SELECT
        b.id AS booking_id,
        v.id AS vehicle_id,
        TRIM(COALESCE(br.name, b.vehicle_model_id::text, '') || ' ' || COALESCE(vm.name, '')) AS vehicle_label,
        COALESCE(v.license_plate, '—') AS plate,
        COALESCE(l.city, '—') AS region,
        b.pickup_datetime AS event_datetime,
        b.contact_full_name AS customer
      FROM booking b
      LEFT JOIN vehicle v ON v.id = b.vehicle_id
      LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
      LEFT JOIN brand br ON br.id = vm.brand_id
      LEFT JOIN location l ON l.id = b.pickup_location_id
      WHERE b.pickup_datetime::date = CURRENT_DATE
        AND b.status IN ('PENDING', 'CONFIRMED')
        AND b.deleted_at IS NULL
        ${region && region !== "all" ? `AND l.city = '${region.replace(/'/g, "''")}'` : ""}
      ORDER BY b.pickup_datetime ASC
    `);
    for (const r of rows) {
      const label = r.vehicle_label?.trim() || "Unassigned vehicle";
      const plateStr = r.plate !== "—" ? ` (${r.plate})` : "";
      alerts.push({
        id: `pickup-${r.booking_id}`,
        alertType: "PICKUP_TODAY",
        vehicleId: r.vehicle_id,
        bookingId: r.booking_id,
        vehicleLabel: label + plateStr,
        region: r.region,
        customer: r.customer,
        message: `Vehicle ${label}${plateStr} scheduled for pickup today`,
        eventDatetime: r.event_datetime,
        generatedAt: now,
      });
    }
  }

  // ── 2. DROPOFF TODAY ────────────────────────────────────────────────────────
  if (!type || type === "DROPOFF_TODAY") {
    const { rows } = await pool.query(`
      SELECT
        b.id AS booking_id,
        v.id AS vehicle_id,
        TRIM(COALESCE(br.name, '') || ' ' || COALESCE(vm.name, '')) AS vehicle_label,
        COALESCE(v.license_plate, '—') AS plate,
        COALESCE(l.city, '—') AS region,
        b.dropoff_datetime AS event_datetime,
        b.contact_full_name AS customer
      FROM booking b
      LEFT JOIN vehicle v ON v.id = b.vehicle_id
      LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
      LEFT JOIN brand br ON br.id = vm.brand_id
      LEFT JOIN location l ON l.id = b.pickup_location_id
      WHERE b.dropoff_datetime::date = CURRENT_DATE
        AND b.status IN ('CONFIRMED', 'DELIVERED')
        AND b.deleted_at IS NULL
        ${region && region !== "all" ? `AND l.city = '${region.replace(/'/g, "''")}'` : ""}
      ORDER BY b.dropoff_datetime ASC
    `);
    for (const r of rows) {
      const label = r.vehicle_label?.trim() || "Unassigned vehicle";
      const plateStr = r.plate !== "—" ? ` (${r.plate})` : "";
      alerts.push({
        id: `dropoff-${r.booking_id}`,
        alertType: "DROPOFF_TODAY",
        vehicleId: r.vehicle_id,
        bookingId: r.booking_id,
        vehicleLabel: label + plateStr,
        region: r.region,
        customer: r.customer,
        message: `Vehicle ${label}${plateStr} scheduled for return today`,
        eventDatetime: r.event_datetime,
        generatedAt: now,
      });
    }
  }

  // ── 3. OVERDUE RETURN ───────────────────────────────────────────────────────
  if (!type || type === "OVERDUE") {
    const { rows } = await pool.query(`
      SELECT
        b.id AS booking_id,
        v.id AS vehicle_id,
        TRIM(COALESCE(br.name, '') || ' ' || COALESCE(vm.name, '')) AS vehicle_label,
        COALESCE(v.license_plate, '—') AS plate,
        COALESCE(l.city, '—') AS region,
        b.dropoff_datetime AS event_datetime,
        b.contact_full_name AS customer,
        EXTRACT(DAY FROM NOW() - b.dropoff_datetime)::int AS days_overdue
      FROM booking b
      LEFT JOIN vehicle v ON v.id = b.vehicle_id
      LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
      LEFT JOIN brand br ON br.id = vm.brand_id
      LEFT JOIN location l ON l.id = b.pickup_location_id
      WHERE b.dropoff_datetime < NOW()
        AND b.status NOT IN ('RETURNED', 'CANCELED', 'NO_SHOW')
        AND b.deleted_at IS NULL
        ${region && region !== "all" ? `AND l.city = '${region.replace(/'/g, "''")}'` : ""}
      ORDER BY b.dropoff_datetime ASC
    `);
    for (const r of rows) {
      const label = r.vehicle_label?.trim() || "Unassigned vehicle";
      const plateStr = r.plate !== "—" ? ` (${r.plate})` : "";
      const days = r.days_overdue > 0 ? ` — ${r.days_overdue} day${r.days_overdue !== 1 ? "s" : ""} overdue` : " — overdue";
      alerts.push({
        id: `overdue-${r.booking_id}`,
        alertType: "OVERDUE",
        vehicleId: r.vehicle_id,
        bookingId: r.booking_id,
        vehicleLabel: label + plateStr,
        region: r.region,
        customer: r.customer,
        daysOverdue: r.days_overdue,
        message: `Vehicle ${label}${plateStr} is overdue for return${days}`,
        eventDatetime: r.event_datetime,
        generatedAt: now,
      });
    }
  }

  // ── 4. BOOKING CONFLICT ─────────────────────────────────────────────────────
  if (!type || type === "CONFLICT") {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (b1.vehicle_id)
        b1.vehicle_id,
        b1.id AS booking_id,
        TRIM(COALESCE(br.name, '') || ' ' || COALESCE(vm.name, '')) AS vehicle_label,
        COALESCE(v.license_plate, '—') AS plate,
        COALESCE(l.city, '—') AS region,
        COUNT(*) OVER (PARTITION BY b1.vehicle_id) AS conflict_count,
        NOW() AS event_datetime
      FROM booking b1
      JOIN booking b2 ON b1.vehicle_id = b2.vehicle_id AND b1.id < b2.id
      JOIN vehicle v ON v.id = b1.vehicle_id
      LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
      LEFT JOIN brand br ON br.id = vm.brand_id
      LEFT JOIN location l ON l.id = b1.pickup_location_id
      WHERE b1.vehicle_id IS NOT NULL
        AND b1.status NOT IN ('CANCELED', 'NO_SHOW', 'RETURNED')
        AND b2.status NOT IN ('CANCELED', 'NO_SHOW', 'RETURNED')
        AND b1.pickup_datetime < b2.dropoff_datetime
        AND b1.dropoff_datetime > b2.pickup_datetime
        AND b1.deleted_at IS NULL AND b2.deleted_at IS NULL
        ${region && region !== "all" ? `AND l.city = '${region.replace(/'/g, "''")}'` : ""}
      ORDER BY b1.vehicle_id, b1.id
    `);
    for (const r of rows) {
      const label = r.vehicle_label?.trim() || "Unassigned vehicle";
      const plateStr = r.plate !== "—" ? ` (${r.plate})` : "";
      alerts.push({
        id: `conflict-${r.vehicle_id}`,
        alertType: "CONFLICT",
        vehicleId: r.vehicle_id,
        bookingId: r.booking_id,
        vehicleLabel: label + plateStr,
        region: r.region,
        customer: null,
        message: `Vehicle ${label}${plateStr} has overlapping bookings`,
        eventDatetime: r.event_datetime,
        generatedAt: now,
      });
    }
  }

  // ── 5. SERVICE DUE ──────────────────────────────────────────────────────────
  if (!type || type === "SERVICE_DUE") {
    const { rows } = await pool.query(`
      SELECT
        ms.id AS service_id,
        v.id AS vehicle_id,
        TRIM(COALESCE(br.name, '') || ' ' || COALESCE(vm.name, '')) AS vehicle_label,
        COALESCE(v.license_plate, '—') AS plate,
        COALESCE(l.city, '—') AS region,
        ms.next_service_date,
        ms.next_service_mileage,
        v.mileage AS current_mileage,
        CASE
          WHEN ms.next_service_date <= CURRENT_DATE THEN 'date'
          WHEN ms.next_service_mileage IS NOT NULL AND v.mileage >= ms.next_service_mileage THEN 'mileage'
        END AS trigger_reason,
        NOW() AS event_datetime
      FROM maintenance_services ms
      JOIN vehicle v ON v.id = ms.vehicle_id
      LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
      LEFT JOIN brand br ON br.id = vm.brand_id
      LEFT JOIN location l ON l.id = v.location_id
      WHERE (
        (ms.next_service_date IS NOT NULL AND ms.next_service_date <= CURRENT_DATE)
        OR (ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL AND v.mileage >= ms.next_service_mileage)
      )
        AND ms.status NOT IN ('IN_PROGRESS')
        ${region && region !== "all" ? `AND l.city = '${region.replace(/'/g, "''")}'` : ""}
      ORDER BY ms.next_service_date ASC NULLS LAST, v.id
    `);
    // Deduplicate by vehicle_id — show only one alert per vehicle
    const seen = new Set<number>();
    for (const r of rows) {
      if (seen.has(r.vehicle_id)) continue;
      seen.add(r.vehicle_id);
      const label = r.vehicle_label?.trim() || "Unassigned vehicle";
      const plateStr = r.plate !== "—" ? ` (${r.plate})` : "";
      const reason = r.trigger_reason === "mileage"
        ? ` — mileage threshold reached (${r.current_mileage} km)`
        : r.next_service_date
        ? ` — service date was ${r.next_service_date}`
        : "";
      alerts.push({
        id: `service-${r.service_id}`,
        alertType: "SERVICE_DUE",
        vehicleId: r.vehicle_id,
        bookingId: null,
        serviceId: r.service_id,
        vehicleLabel: label + plateStr,
        region: r.region,
        customer: null,
        message: `Vehicle ${label}${plateStr} requires scheduled maintenance${reason}`,
        eventDatetime: r.event_datetime,
        generatedAt: now,
      });
    }
  }

  // Sort: newest event first
  alerts.sort((a: any, b: any) => {
    const PRIORITY: Record<string, number> = { OVERDUE: 0, CONFLICT: 1, SERVICE_DUE: 2, DROPOFF_TODAY: 3, PICKUP_TODAY: 4 };
    const pa = PRIORITY[a.alertType] ?? 99;
    const pb = PRIORITY[b.alertType] ?? 99;
    return pa !== pb ? pa - pb : new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
  });

  res.json(alerts);
});

// ─── GET /api/admin/alerts/summary ────────────────────────────────────────────
// Lightweight summary counts — used by dashboard panel and sidebar badge

router.get("/admin/alerts/summary", requireAdmin, async (req, res) => {
  const [pickupRes, dropoffRes, overdueRes, conflictRes, serviceRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS n FROM booking WHERE pickup_datetime::date = CURRENT_DATE AND status IN ('PENDING','CONFIRMED') AND deleted_at IS NULL`),
    pool.query(`SELECT COUNT(*) AS n FROM booking WHERE dropoff_datetime::date = CURRENT_DATE AND status IN ('CONFIRMED','DELIVERED') AND deleted_at IS NULL`),
    pool.query(`SELECT COUNT(*) AS n FROM booking WHERE dropoff_datetime < NOW() AND status NOT IN ('RETURNED','CANCELED','NO_SHOW') AND deleted_at IS NULL`),
    pool.query(`
      SELECT COUNT(DISTINCT b1.vehicle_id) AS n
      FROM booking b1
      JOIN booking b2 ON b1.vehicle_id = b2.vehicle_id AND b1.id < b2.id
      WHERE b1.vehicle_id IS NOT NULL
        AND b1.status NOT IN ('CANCELED','NO_SHOW','RETURNED')
        AND b2.status NOT IN ('CANCELED','NO_SHOW','RETURNED')
        AND b1.pickup_datetime < b2.dropoff_datetime
        AND b1.dropoff_datetime > b2.pickup_datetime
        AND b1.deleted_at IS NULL AND b2.deleted_at IS NULL
    `),
    pool.query(`
      SELECT COUNT(DISTINCT v.id) AS n
      FROM maintenance_services ms
      JOIN vehicle v ON v.id = ms.vehicle_id
      WHERE (
        (ms.next_service_date IS NOT NULL AND ms.next_service_date <= CURRENT_DATE)
        OR (ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL AND v.mileage >= ms.next_service_mileage)
      ) AND ms.status NOT IN ('IN_PROGRESS')
    `),
  ]);

  const pickup = parseInt(pickupRes.rows[0].n, 10);
  const dropoff = parseInt(dropoffRes.rows[0].n, 10);
  const overdue = parseInt(overdueRes.rows[0].n, 10);
  const conflict = parseInt(conflictRes.rows[0].n, 10);
  const service = parseInt(serviceRes.rows[0].n, 10);
  const total = pickup + dropoff + overdue + conflict + service;

  res.json({ total, pickup, dropoff, overdue, conflict, service });
});

// ─── GET /api/admin/alerts/meta ───────────────────────────────────────────────

router.get("/admin/alerts/meta", requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(`SELECT DISTINCT city FROM location WHERE city IS NOT NULL ORDER BY city`);
  res.json({
    alertTypes: ["PICKUP_TODAY", "DROPOFF_TODAY", "OVERDUE", "CONFLICT", "SERVICE_DUE"],
    regions: rows.map((r: any) => r.city),
  });
});

export default router;
