import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// ─── Booking Report ────────────────────────────────────────────────────────────

router.get("/admin/reports/bookings", requireAdmin, async (req, res) => {
  const { startDate, endDate, city, status, search } = req.query as Record<string, string | undefined>;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (startDate) { conditions.push(`b.pickup_datetime >= $${p++}`); params.push(startDate); }
  if (endDate) { conditions.push(`b.pickup_datetime <= $${p++}`); params.push(endDate + "T23:59:59"); }
  if (city && city !== "all") { conditions.push(`l.city = $${p++}`); params.push(city); }
  if (status && status !== "all") { conditions.push(`b.status = $${p++}`); params.push(status); }
  if (search) { conditions.push(`b.contact_full_name ILIKE $${p++}`); params.push(`%${search}%`); }

  const sql = `
    SELECT
      b.id,
      b.pickup_datetime::date AS pickup_date,
      b.dropoff_datetime::date AS dropoff_date,
      EXTRACT(DAY FROM b.dropoff_datetime - b.pickup_datetime)::int AS duration_days,
      COALESCE(br.name, '') || ' ' || COALESCE(vm.name, '') AS vehicle_label,
      COALESCE(v.license_plate, '—') AS plate,
      COALESCE(l.city, '—') AS region,
      b.status,
      b.contact_full_name AS customer_name,
      b.total_amount,
      b.currency
    FROM booking b
    LEFT JOIN vehicle v ON b.vehicle_id = v.id
    LEFT JOIN vehicle_model vm ON v.vehicle_model_id = vm.id
    LEFT JOIN brand br ON vm.brand_id = br.id
    LEFT JOIN location l ON b.pickup_location_id = l.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY b.pickup_datetime DESC
    LIMIT 500
  `;

  const { rows } = await pool.query(sql, params);
  res.json(rows);
});

// ─── Financial Report ──────────────────────────────────────────────────────────

router.get("/admin/reports/financial", requireAdmin, async (req, res) => {
  const { startDate, endDate, type, category, currency } = req.query as Record<string, string | undefined>;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (startDate) { conditions.push(`ae.entry_date >= $${p++}`); params.push(startDate); }
  if (endDate) { conditions.push(`ae.entry_date <= $${p++}`); params.push(endDate); }
  if (type && type !== "all") { conditions.push(`ae.type = $${p++}`); params.push(type); }
  if (category && category !== "all") { conditions.push(`ae.category = $${p++}`); params.push(category); }
  if (currency && currency !== "all") { conditions.push(`ae.currency = $${p++}`); params.push(currency); }

  const sql = `
    SELECT
      ae.id,
      ae.entry_date,
      ae.type,
      ae.category,
      ae.amount,
      ae.currency,
      ae.converted_gel,
      ae.notes
    FROM accounting_entries ae
    WHERE ${conditions.join(" AND ")}
    ORDER BY ae.entry_date DESC
    LIMIT 500
  `;

  const { rows } = await pool.query(sql, params);

  // Compute totals
  const totalIncome = rows
    .filter((r: any) => r.type === "INCOME")
    .reduce((s: number, r: any) => s + Number(r.converted_gel), 0);
  const totalExpenses = rows
    .filter((r: any) => r.type === "EXPENSE")
    .reduce((s: number, r: any) => s + Number(r.converted_gel), 0);

  res.json({
    rows,
    totals: {
      totalIncome: +totalIncome.toFixed(2),
      totalExpenses: +totalExpenses.toFixed(2),
      netProfit: +(totalIncome - totalExpenses).toFixed(2),
    },
  });
});

// ─── Fleet Utilization Report ─────────────────────────────────────────────────

router.get("/admin/reports/fleet-utilization", requireAdmin, async (req, res) => {
  const { startDate, endDate, city, search } = req.query as Record<string, string | undefined>;

  // Period days for utilization % calculation
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 86400000);
  const end = endDate ? new Date(endDate + "T23:59:59") : new Date();
  const periodDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));

  const vehicleConditions: string[] = ["1=1"];
  const vehicleParams: unknown[] = [];
  let p = 1;
  if (city && city !== "all") { vehicleConditions.push(`l.city = $${p++}`); vehicleParams.push(city); }
  if (search) {
    vehicleConditions.push(`(br.name ILIKE $${p++} OR vm.name ILIKE $${p++} OR v.license_plate ILIKE $${p++})`);
    vehicleParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const sql = `
    SELECT
      v.id,
      COALESCE(br.name, '') || ' ' || COALESCE(vm.name, '') AS vehicle_label,
      v.license_plate AS plate,
      COALESCE(l.city, '—') AS city,
      v.status,
      COUNT(DISTINCT CASE WHEN b.status NOT IN ('CANCELED', 'NO_SHOW') THEN b.id END)::int AS total_bookings,
      COALESCE(
        SUM(
          CASE WHEN b.status NOT IN ('CANCELED', 'NO_SHOW')
               THEN GREATEST(0,
                 EXTRACT(DAY FROM
                   LEAST(b.dropoff_datetime, $${p}::timestamp) - GREATEST(b.pickup_datetime, $${p+1}::timestamp)
                 )
               )
          END
        ), 0
      )::int AS total_days_booked
    FROM vehicle v
    LEFT JOIN vehicle_model vm ON v.vehicle_model_id = vm.id
    LEFT JOIN brand br ON vm.brand_id = br.id
    LEFT JOIN location l ON v.location_id = l.id
    LEFT JOIN booking b ON b.vehicle_id = v.id
      AND b.status NOT IN ('CANCELED', 'NO_SHOW')
      AND b.pickup_datetime <= $${p+2}::timestamp
      AND b.dropoff_datetime >= $${p+3}::timestamp
    WHERE ${vehicleConditions.join(" AND ")}
    GROUP BY v.id, br.name, vm.name, v.license_plate, l.city, v.status
    ORDER BY total_bookings DESC, vehicle_label
  `;

  vehicleParams.push(
    (endDate ?? new Date().toISOString().split("T")[0]) + "T23:59:59",
    startDate ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
    (endDate ?? new Date().toISOString().split("T")[0]) + "T23:59:59",
    startDate ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
  );

  const { rows } = await pool.query(sql, vehicleParams);

  const enriched = rows.map((r: any) => ({
    ...r,
    total_days_booked: Number(r.total_days_booked),
    period_days: periodDays,
    utilization_pct: periodDays > 0
      ? +(Math.min(100, (Number(r.total_days_booked) / periodDays) * 100)).toFixed(1)
      : 0,
  }));

  res.json({ rows: enriched, periodDays });
});

// ─── Service / Maintenance Report ─────────────────────────────────────────────

router.get("/admin/reports/service", requireAdmin, async (req, res) => {
  const { startDate, endDate, category, search } = req.query as Record<string, string | undefined>;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let p = 1;

  if (startDate) { conditions.push(`ms.service_date >= $${p++}`); params.push(startDate); }
  if (endDate) { conditions.push(`ms.service_date <= $${p++}`); params.push(endDate); }
  if (category && category !== "all") { conditions.push(`st.name = $${p++}`); params.push(category); }
  if (search) {
    conditions.push(`(br.name ILIKE $${p++} OR vm.name ILIKE $${p++} OR v.license_plate ILIKE $${p++})`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const sql = `
    SELECT
      ms.id,
      ms.service_date,
      COALESCE(br.name, '') || ' ' || COALESCE(vm.name, '') AS vehicle_label,
      COALESCE(v.license_plate, '—') AS plate,
      COALESCE(st.name, '—') AS service_category,
      ms.mileage,
      ms.cost,
      ms.status,
      COALESCE(ms.shop_name, ms.mechanic_name, '—') AS vendor
    FROM maintenance_services ms
    JOIN vehicle v ON ms.vehicle_id = v.id
    LEFT JOIN vehicle_model vm ON v.vehicle_model_id = vm.id
    LEFT JOIN brand br ON vm.brand_id = br.id
    JOIN maintenance_service_types st ON ms.service_type_id = st.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY ms.service_date DESC
    LIMIT 500
  `;

  const { rows } = await pool.query(sql, params);

  const totalCostGel = rows.reduce((s: number, r: any) => s + Number(r.cost ?? 0), 0);

  res.json({ rows, totalCostGel: +totalCostGel.toFixed(2) });
});

// ─── Region Activity Report ────────────────────────────────────────────────────

router.get("/admin/reports/region", requireAdmin, async (req, res) => {
  const { startDate, endDate } = req.query as Record<string, string | undefined>;

  const dateParams: unknown[] = [];
  let bookingDateFilter = "";
  let p = 1;
  if (startDate) { bookingDateFilter += ` AND b.pickup_datetime >= $${p++}`; dateParams.push(startDate); }
  if (endDate) { bookingDateFilter += ` AND b.pickup_datetime <= $${p++}`; dateParams.push(endDate + "T23:59:59"); }

  const sql = `
    SELECT
      l.city AS region,
      COUNT(DISTINCT b.id)::int AS bookings_count,
      COUNT(DISTINCT CASE WHEN b.status NOT IN ('CANCELED','NO_SHOW') THEN b.id END)::int AS active_bookings,
      COUNT(DISTINCT v.id)::int AS vehicles_count,
      COALESCE(SUM(CASE WHEN b.currency = 'GEL' THEN b.total_amount END), 0)::numeric(12,2) AS revenue_gel,
      COALESCE(SUM(ms.cost), 0)::numeric(12,2) AS service_cost_gel
    FROM location l
    LEFT JOIN booking b ON b.pickup_location_id = l.id ${bookingDateFilter}
    LEFT JOIN vehicle v ON v.location_id = l.id
    LEFT JOIN maintenance_services ms ON ms.vehicle_id = v.id
    WHERE l.city IS NOT NULL AND l.city IN ('Tbilisi', 'Kutaisi', 'Batumi')
    GROUP BY l.city
    ORDER BY bookings_count DESC
  `;

  const { rows } = await pool.query(sql, dateParams);
  res.json(rows);
});

// ─── Report Metadata (categories, statuses for filter dropdowns) ───────────────

router.get("/admin/reports/meta", requireAdmin, async (_req, res) => {
  const [catResult, serviceResult] = await Promise.all([
    pool.query("SELECT DISTINCT category FROM accounting_entries ORDER BY category"),
    pool.query("SELECT id, name FROM maintenance_service_types ORDER BY name"),
  ]);

  res.json({
    accountingCategories: catResult.rows.map((r: any) => r.category),
    serviceCategories: serviceResult.rows.map((r: any) => r.name),
    bookingStatuses: ["PENDING", "CONFIRMED", "DELIVERED", "RETURNED", "CANCELED", "NO_SHOW"],
    cities: ["Tbilisi", "Kutaisi", "Batumi"],
  });
});

export default router;
