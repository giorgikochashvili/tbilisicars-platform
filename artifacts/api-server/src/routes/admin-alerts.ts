import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// ─── GET /api/admin/alerts ─────────────────────────────────────────────────────
// Query params: type (PICKUP_TODAY|DROPOFF_TODAY|OVERDUE|CONFLICT|SERVICE_WARNING|SERVICE_DUE|SERVICE_OVERDUE), region

router.get("/admin/alerts", requireAdmin, async (req, res) => {
  const { type, region } = req.query as Record<string, string | undefined>;
  const now = new Date().toISOString();
  const alerts: object[] = [];

  // ── 1. PICKUP TODAY ─────────────────────────────────────────────────────────
  if (!type || type === "PICKUP_TODAY") {
    const params: string[] = [];
    const regionClause = region && region !== "all"
      ? `AND l.city = $${params.push(region)}`
      : "";
    const { rows } = await pool.query(`
      SELECT
        b.id AS booking_id,
        v.id AS vehicle_id,
        TRIM(COALESCE(br.name, '') || ' ' || COALESCE(vm.name, bm.name, '')) AS vehicle_label,
        COALESCE(v.license_plate, '—') AS plate,
        COALESCE(l.city, '—') AS region,
        b.pickup_datetime AS event_datetime,
        b.contact_full_name AS customer
      FROM booking b
      LEFT JOIN vehicle v ON v.id = b.vehicle_id
      LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
      LEFT JOIN brand br ON br.id = vm.brand_id
      LEFT JOIN vehicle_model bm ON bm.id = b.vehicle_model_id
      LEFT JOIN location l ON l.id = b.pickup_location_id
      WHERE b.pickup_datetime::date = CURRENT_DATE
        AND b.status IN ('PENDING', 'CONFIRMED')
        AND b.deleted_at IS NULL
        ${regionClause}
      ORDER BY b.pickup_datetime ASC
    `, params);
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
    const params: string[] = [];
    const regionClause = region && region !== "all"
      ? `AND l.city = $${params.push(region)}`
      : "";
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
        ${regionClause}
      ORDER BY b.dropoff_datetime ASC
    `, params);
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
    const params: string[] = [];
    const regionClause = region && region !== "all"
      ? `AND l.city = $${params.push(region)}`
      : "";
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
        ${regionClause}
      ORDER BY b.dropoff_datetime ASC
    `, params);
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
    const params: string[] = [];
    const regionClause = region && region !== "all"
      ? `AND l.city = $${params.push(region)}`
      : "";
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
        ${regionClause}
      ORDER BY b1.vehicle_id, b1.id
    `, params);
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

  // ── 5. MAINTENANCE ALERTS (three severity levels) ──────────────────────────
  // SERVICE_WARNING: approaching in 7 days or within 1000 km
  // SERVICE_DUE: date = today or mileage = threshold
  // SERVICE_OVERDUE: date past or mileage exceeded by >1000 km
  const isMaintType = !type || type === "SERVICE_WARNING" || type === "SERVICE_DUE" || type === "SERVICE_OVERDUE";
  if (isMaintType) {
    const severityFilter = type === "SERVICE_WARNING" ? "WHERE severity = 'SERVICE_WARNING'"
      : type === "SERVICE_DUE" ? "WHERE severity = 'SERVICE_DUE'"
      : type === "SERVICE_OVERDUE" ? "WHERE severity = 'SERVICE_OVERDUE'"
      : "";

    const params: string[] = [];
    const regionFilter = region && region !== "all"
      ? `AND l.city = $${params.push(region)}`
      : "";

    const { rows } = await pool.query(`
      WITH ranked AS (
        SELECT
          ms.id AS service_id,
          ms.vehicle_id,
          ms.next_service_date,
          ms.next_service_mileage,
          v.mileage AS current_mileage,
          TRIM(COALESCE(br.name, '') || ' ' || COALESCE(vm.name, '')) AS vehicle_label,
          COALESCE(v.license_plate, '—') AS plate,
          COALESCE(l.city, '—') AS region,
          NOW() AS event_datetime,
          CASE
            WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date < CURRENT_DATE THEN 'SERVICE_OVERDUE'
            WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
              AND v.mileage > ms.next_service_mileage + 1000 THEN 'SERVICE_OVERDUE'
            WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date = CURRENT_DATE THEN 'SERVICE_DUE'
            WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
              AND v.mileage >= ms.next_service_mileage THEN 'SERVICE_DUE'
            WHEN ms.next_service_date IS NOT NULL
              AND ms.next_service_date > CURRENT_DATE
              AND ms.next_service_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'SERVICE_WARNING'
            WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
              AND v.mileage >= ms.next_service_mileage - 1000
              AND v.mileage < ms.next_service_mileage THEN 'SERVICE_WARNING'
            ELSE NULL
          END AS severity,
          CASE
            WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date < CURRENT_DATE THEN 1
            WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
              AND v.mileage > ms.next_service_mileage + 1000 THEN 1
            WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date = CURRENT_DATE THEN 2
            WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
              AND v.mileage >= ms.next_service_mileage THEN 2
            ELSE 3
          END AS sev_rank
        FROM maintenance_services ms
        JOIN vehicle v ON v.id = ms.vehicle_id
        LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
        LEFT JOIN brand br ON br.id = vm.brand_id
        LEFT JOIN location l ON l.id = v.location_id
        WHERE ms.status NOT IN ('IN_PROGRESS')
          AND (
            ms.next_service_date IS NOT NULL
            OR (ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL)
          )
          ${regionFilter}
      ),
      best AS (
        SELECT DISTINCT ON (vehicle_id) *
        FROM ranked
        WHERE severity IS NOT NULL
        ORDER BY vehicle_id, sev_rank ASC, service_id ASC
      )
      SELECT * FROM best
      ${severityFilter}
      ORDER BY sev_rank ASC, vehicle_id ASC
    `, params);

    for (const r of rows) {
      const label = r.vehicle_label?.trim() || "Unassigned vehicle";
      const plateStr = r.plate !== "—" ? ` (${r.plate})` : "";

      let message = "";
      let detail = "";
      if (r.severity === "SERVICE_OVERDUE") {
        if (r.next_service_date && new Date(r.next_service_date) < new Date()) {
          const days = Math.floor((Date.now() - new Date(r.next_service_date).getTime()) / 86400000);
          detail = ` — overdue by ${days} day${days !== 1 ? "s" : ""}`;
        } else if (r.next_service_mileage != null && r.current_mileage != null) {
          const over = r.current_mileage - r.next_service_mileage;
          detail = ` — ${over.toLocaleString()} km past threshold`;
        }
        message = `Vehicle ${label}${plateStr} service is overdue${detail}`;
      } else if (r.severity === "SERVICE_DUE") {
        if (r.next_service_date) {
          detail = " — service date is today";
        } else {
          detail = ` — at ${r.current_mileage?.toLocaleString()} km threshold`;
        }
        message = `Vehicle ${label}${plateStr} service is due now${detail}`;
      } else {
        if (r.next_service_date) {
          const days = Math.ceil((new Date(r.next_service_date).getTime() - Date.now()) / 86400000);
          detail = ` — due in ${days} day${days !== 1 ? "s" : ""}`;
        } else if (r.next_service_mileage != null && r.current_mileage != null) {
          const remaining = r.next_service_mileage - r.current_mileage;
          detail = ` — ${remaining.toLocaleString()} km remaining`;
        }
        message = `Vehicle ${label}${plateStr} service approaching${detail}`;
      }

      alerts.push({
        id: `maint-${r.service_id}`,
        alertType: r.severity,
        vehicleId: r.vehicle_id,
        bookingId: null,
        serviceId: r.service_id,
        vehicleLabel: label + plateStr,
        region: r.region,
        customer: null,
        nextServiceDate: r.next_service_date,
        nextServiceMileage: r.next_service_mileage,
        currentMileage: r.current_mileage,
        message,
        eventDatetime: r.event_datetime,
        generatedAt: now,
      });
    }
  }

  // ── DELIVERED_NO_PAYMENT ────────────────────────────────────────────────────
  if (!type || type === "DELIVERED_NO_PAYMENT") {
    const params: string[] = [];
    const regionClause = region && region !== "all"
      ? `AND l.city = $${params.push(region)}`
      : "";
    const { rows } = await pool.query(`
      SELECT
        b.id AS booking_id,
        v.id AS vehicle_id,
        TRIM(COALESCE(br.name, '') || ' ' || COALESCE(vm.name, bm.name, '')) AS vehicle_label,
        COALESCE(v.license_plate, '—') AS plate,
        COALESCE(l.city, '—') AS region,
        b.contact_full_name AS customer,
        NOW() AS event_datetime
      FROM booking b
      LEFT JOIN vehicle v ON v.id = b.vehicle_id
      LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
      LEFT JOIN brand br ON br.id = vm.brand_id
      LEFT JOIN vehicle_model bm ON bm.id = b.vehicle_model_id
      LEFT JOIN location l ON l.id = b.pickup_location_id
      LEFT JOIN booking_payment bp ON bp.booking_id = b.id
      WHERE b.status = 'DELIVERED'
        AND b.deleted_at IS NULL
        AND bp.id IS NULL
        ${regionClause}
      ORDER BY b.id DESC
    `, params);
    for (const r of rows) {
      const label = r.vehicle_label?.trim() || "Unassigned vehicle";
      const plateStr = r.plate !== "—" ? ` (${r.plate})` : "";
      alerts.push({
        id: `no-payment-${r.booking_id}`,
        alertType: "DELIVERED_NO_PAYMENT",
        vehicleId: r.vehicle_id,
        bookingId: r.booking_id,
        vehicleLabel: label + plateStr,
        region: r.region,
        customer: r.customer,
        message: `Booking #${r.booking_id} is delivered but has no payment record`,
        eventDatetime: r.event_datetime,
        generatedAt: now,
      });
    }
  }

  // ── PARKING_OVERFLOW ────────────────────────────────────────────────────────
  // AIRPORT capacity = 15. Includes legacy TERMINAL/OUT rows for backwards compat.
  if (!type || type === "PARKING_OVERFLOW") {
    const AIRPORT_CAPACITY = 15;
    const { rows: pRows } = await pool.query(`
      SELECT COUNT(*) AS count
      FROM parking_assignment
      WHERE removed_at IS NULL AND zone IN ('AIRPORT', 'TERMINAL', 'OUT')
    `);
    const airportCount = parseInt(pRows[0]?.count as string ?? "0", 10);
    if (airportCount > AIRPORT_CAPACITY) {
      alerts.push({
        id: "parking-overflow-airport",
        alertType: "PARKING_OVERFLOW",
        vehicleId: null,
        bookingId: null,
        vehicleLabel: "Zone AIRPORT",
        region: "Tbilisi",
        customer: null,
        message: `Zone AIRPORT is over capacity: ${airportCount}/${AIRPORT_CAPACITY}`,
        eventDatetime: now,
        generatedAt: now,
      });
    }
  }

  // Sort by priority
  alerts.sort((a: any, b: any) => {
    const PRIORITY: Record<string, number> = {
      OVERDUE: 0, DELIVERED_NO_PAYMENT: 1, CONFLICT: 2, PARKING_OVERFLOW: 2, SERVICE_OVERDUE: 3, SERVICE_DUE: 4, SERVICE_WARNING: 5, DROPOFF_TODAY: 6, PICKUP_TODAY: 7,
    };
    const pa = PRIORITY[a.alertType] ?? 99;
    const pb = PRIORITY[b.alertType] ?? 99;
    return pa !== pb ? pa - pb : new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
  });

  res.json(alerts);
});

// ─── GET /api/admin/alerts/summary ────────────────────────────────────────────
//
// Optional ?city=Tbilisi|Kutaisi|Batumi query param.
// When city is provided, all counts are scoped to bookings/vehicles whose
// location.city = city (using the existing sub-location model).
// Parking overflow is TBS-specific and is excluded from regional totals.

const VALID_SUMMARY_CITIES = ["Tbilisi", "Kutaisi", "Batumi"] as const;

router.get("/admin/alerts/summary", requireAdmin, async (req, res) => {
  const rawCity = req.query.city;
  const city =
    typeof rawCity === "string" &&
    (VALID_SUMMARY_CITIES as readonly string[]).includes(rawCity)
      ? rawCity
      : undefined;

  const cp = city ? [city] : [];

  const [pickupRes, dropoffRes, overdueRes, noPaymentRes, conflictRes, maintRes, overflowRes] = await Promise.all([
    city
      ? pool.query(
          `SELECT COUNT(*) AS n
           FROM booking b
           JOIN location l ON l.id = b.pickup_location_id
           WHERE b.pickup_datetime::date = CURRENT_DATE
             AND b.status IN ('PENDING','CONFIRMED')
             AND b.deleted_at IS NULL
             AND l.city = $1`,
          cp,
        )
      : pool.query(`SELECT COUNT(*) AS n FROM booking WHERE pickup_datetime::date = CURRENT_DATE AND status IN ('PENDING','CONFIRMED') AND deleted_at IS NULL`),

    city
      ? pool.query(
          `SELECT COUNT(*) AS n
           FROM booking b
           JOIN location l ON l.id = b.dropoff_location_id
           WHERE b.dropoff_datetime::date = CURRENT_DATE
             AND b.status IN ('CONFIRMED','DELIVERED')
             AND b.deleted_at IS NULL
             AND l.city = $1`,
          cp,
        )
      : pool.query(`SELECT COUNT(*) AS n FROM booking WHERE dropoff_datetime::date = CURRENT_DATE AND status IN ('CONFIRMED','DELIVERED') AND deleted_at IS NULL`),

    city
      ? pool.query(
          `SELECT COUNT(*) AS n
           FROM booking b
           JOIN location pl ON pl.id = b.pickup_location_id
           JOIN location dl ON dl.id = b.dropoff_location_id
           WHERE b.dropoff_datetime < NOW()
             AND b.status NOT IN ('RETURNED','CANCELED','NO_SHOW')
             AND b.deleted_at IS NULL
             AND (pl.city = $1 OR dl.city = $1)`,
          cp,
        )
      : pool.query(`SELECT COUNT(*) AS n FROM booking WHERE dropoff_datetime < NOW() AND status NOT IN ('RETURNED','CANCELED','NO_SHOW') AND deleted_at IS NULL`),

    city
      ? pool.query(
          `SELECT COUNT(*) AS n
           FROM booking b
           LEFT JOIN booking_payment bp ON bp.booking_id = b.id
           JOIN location pl ON pl.id = b.pickup_location_id
           JOIN location dl ON dl.id = b.dropoff_location_id
           WHERE b.status = 'DELIVERED'
             AND b.deleted_at IS NULL
             AND bp.id IS NULL
             AND (pl.city = $1 OR dl.city = $1)`,
          cp,
        )
      : pool.query(`SELECT COUNT(*) AS n FROM booking b LEFT JOIN booking_payment bp ON bp.booking_id = b.id WHERE b.status = 'DELIVERED' AND b.deleted_at IS NULL AND bp.id IS NULL`),

    city
      ? pool.query(
          `SELECT COUNT(DISTINCT b1.vehicle_id) AS n
           FROM booking b1
           JOIN booking b2 ON b1.vehicle_id = b2.vehicle_id AND b1.id < b2.id
           JOIN vehicle v ON v.id = b1.vehicle_id
           JOIN location l ON l.id = v.location_id
           WHERE b1.vehicle_id IS NOT NULL
             AND b1.status NOT IN ('CANCELED','NO_SHOW','RETURNED')
             AND b2.status NOT IN ('CANCELED','NO_SHOW','RETURNED')
             AND b1.pickup_datetime < b2.dropoff_datetime
             AND b1.dropoff_datetime > b2.pickup_datetime
             AND b1.deleted_at IS NULL AND b2.deleted_at IS NULL
             AND l.city = $1`,
          cp,
        )
      : pool.query(`
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

    // Three-level maintenance counts (worst alert per vehicle)
    city
      ? pool.query(
          `WITH ranked AS (
            SELECT
              ms.vehicle_id,
              CASE
                WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date < CURRENT_DATE THEN 'SERVICE_OVERDUE'
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage > ms.next_service_mileage + 1000 THEN 'SERVICE_OVERDUE'
                WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date = CURRENT_DATE THEN 'SERVICE_DUE'
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage >= ms.next_service_mileage THEN 'SERVICE_DUE'
                WHEN ms.next_service_date IS NOT NULL
                  AND ms.next_service_date > CURRENT_DATE
                  AND ms.next_service_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'SERVICE_WARNING'
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage >= ms.next_service_mileage - 1000
                  AND v.mileage < ms.next_service_mileage THEN 'SERVICE_WARNING'
                ELSE NULL
              END AS severity,
              CASE
                WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date < CURRENT_DATE THEN 1
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage > ms.next_service_mileage + 1000 THEN 1
                WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date = CURRENT_DATE THEN 2
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage >= ms.next_service_mileage THEN 2
                ELSE 3
              END AS sev_rank
            FROM maintenance_services ms
            JOIN vehicle v ON v.id = ms.vehicle_id
            JOIN location l ON l.id = v.location_id
            WHERE ms.status NOT IN ('IN_PROGRESS')
              AND (ms.next_service_date IS NOT NULL OR (ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL))
              AND l.city = $1
          ),
          best AS (
            SELECT DISTINCT ON (vehicle_id) vehicle_id, severity
            FROM ranked
            WHERE severity IS NOT NULL
            ORDER BY vehicle_id, sev_rank ASC
          )
          SELECT
            COUNT(*) FILTER (WHERE severity = 'SERVICE_WARNING') AS warning,
            COUNT(*) FILTER (WHERE severity = 'SERVICE_DUE') AS due,
            COUNT(*) FILTER (WHERE severity = 'SERVICE_OVERDUE') AS overdue
          FROM best`,
          cp,
        )
      : pool.query(`
          WITH ranked AS (
            SELECT
              ms.vehicle_id,
              CASE
                WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date < CURRENT_DATE THEN 'SERVICE_OVERDUE'
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage > ms.next_service_mileage + 1000 THEN 'SERVICE_OVERDUE'
                WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date = CURRENT_DATE THEN 'SERVICE_DUE'
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage >= ms.next_service_mileage THEN 'SERVICE_DUE'
                WHEN ms.next_service_date IS NOT NULL
                  AND ms.next_service_date > CURRENT_DATE
                  AND ms.next_service_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'SERVICE_WARNING'
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage >= ms.next_service_mileage - 1000
                  AND v.mileage < ms.next_service_mileage THEN 'SERVICE_WARNING'
                ELSE NULL
              END AS severity,
              CASE
                WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date < CURRENT_DATE THEN 1
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage > ms.next_service_mileage + 1000 THEN 1
                WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date = CURRENT_DATE THEN 2
                WHEN ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL
                  AND v.mileage >= ms.next_service_mileage THEN 2
                ELSE 3
              END AS sev_rank
            FROM maintenance_services ms
            JOIN vehicle v ON v.id = ms.vehicle_id
            WHERE ms.status NOT IN ('IN_PROGRESS')
              AND (ms.next_service_date IS NOT NULL OR (ms.next_service_mileage IS NOT NULL AND v.mileage IS NOT NULL))
          ),
          best AS (
            SELECT DISTINCT ON (vehicle_id) vehicle_id, severity
            FROM ranked
            WHERE severity IS NOT NULL
            ORDER BY vehicle_id, sev_rank ASC
          )
          SELECT
            COUNT(*) FILTER (WHERE severity = 'SERVICE_WARNING') AS warning,
            COUNT(*) FILTER (WHERE severity = 'SERVICE_DUE') AS due,
            COUNT(*) FILTER (WHERE severity = 'SERVICE_OVERDUE') AS overdue
          FROM best
        `),

    // Parking overflow — TBS-specific, only meaningful globally.
    // AIRPORT capacity = 15; includes legacy TERMINAL/OUT rows.
    city
      ? Promise.resolve({ rows: [{ n: "0" }] })
      : pool.query(`
          SELECT CASE WHEN COUNT(*) > 15 THEN 1 ELSE 0 END AS n
          FROM parking_assignment
          WHERE removed_at IS NULL AND zone IN ('AIRPORT', 'TERMINAL', 'OUT')
        `),
  ]);

  const pickup = parseInt(pickupRes.rows[0].n, 10);
  const dropoff = parseInt(dropoffRes.rows[0].n, 10);
  const overdue = parseInt(overdueRes.rows[0].n, 10);
  const deliveredNoPayment = parseInt(noPaymentRes.rows[0].n, 10);
  const conflict = parseInt(conflictRes.rows[0].n, 10);
  const serviceWarning = parseInt(maintRes.rows[0].warning, 10);
  const serviceDue = parseInt(maintRes.rows[0].due, 10);
  const serviceOverdue = parseInt(maintRes.rows[0].overdue, 10);
  const service = serviceWarning + serviceDue + serviceOverdue;
  const parkingOverflow = city ? 0 : parseInt(overflowRes.rows[0].n, 10);
  const total = pickup + dropoff + overdue + deliveredNoPayment + conflict + service + parkingOverflow;

  res.json({ total, pickup, dropoff, overdue, deliveredNoPayment, conflict, service, serviceWarning, serviceDue, serviceOverdue, parkingOverflow });
});

// ─── GET /api/admin/alerts/meta ───────────────────────────────────────────────

router.get("/admin/alerts/meta", requireAdmin, async (_req, res) => {
  const { rows } = await pool.query(`SELECT DISTINCT city FROM location WHERE city IS NOT NULL ORDER BY city`);
  res.json({
    alertTypes: ["PICKUP_TODAY", "DROPOFF_TODAY", "OVERDUE", "DELIVERED_NO_PAYMENT", "CONFLICT", "PARKING_OVERFLOW", "SERVICE_OVERDUE", "SERVICE_DUE", "SERVICE_WARNING"],
    regions: rows.map((r: any) => r.city),
  });
});

export default router;
