/**
 * Super Admin AI — Phase 1 Read-Only Data Layer
 *
 * Provides normalized, AI-readable data access to all operational data.
 * All functions are strictly read-only. No write operations are performed.
 * Error handling: raw DB errors are caught and re-thrown as safe messages
 * from the route layer — stack traces are never exposed in HTTP responses.
 */

import { pool } from "@workspace/db";
import {
  getDashboardSummary,
  getTodayActivity,
  getFleetSnapshot,
} from "./admin-dashboard.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type DiagnosticStatus = "SUCCESS" | "WARNING" | "FAILED" | "INFO";

interface DiagnosticEntry {
  time: string;
  module: string;
  action: string;
  status: DiagnosticStatus;
  entityType: string;
  entityId: number | null;
  shortMessage: string;
  reason: string;
  meta?: Record<string, unknown>;
}

// ─── Helper: format reference ─────────────────────────────────────────────────

function bookingRef(id: number): string {
  return `TC-${String(id).padStart(5, "0")}`;
}

function vehicleDisplay(brand: string | null, model: string | null, id: number): string {
  if (brand && model) return `${brand} ${model}`;
  if (model) return model;
  return `Vehicle #${id}`;
}

// ─── 1. Summary ───────────────────────────────────────────────────────────────

export async function getAISummary() {
  const [bookingSummary, todayActivity, fleetSnapshot, parkingQ, overdueQ, pendingPayQ] =
    await Promise.all([
      getDashboardSummary(),
      getTodayActivity(),
      getFleetSnapshot(),
      pool.query<{ zone: string; count: string }>(
        `SELECT zone, COUNT(*) AS count
         FROM parking_assignment
         WHERE removed_at IS NULL
         GROUP BY zone`,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM booking
         WHERE status = 'DELIVERED'
           AND dropoff_datetime < NOW()
           AND deleted_at IS NULL`,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM booking
         WHERE payment_status = 'UNPAID'
           AND status IN ('CONFIRMED', 'DELIVERED')
           AND deleted_at IS NULL`,
      ),
    ]);

  const parking: Record<string, number> = { TERMINAL: 0, OUT: 0, FREE: 0 };
  for (const r of parkingQ.rows) {
    parking[r.zone] = parseInt(r.count, 10);
  }

  return {
    generatedAt: new Date().toISOString(),
    bookings: {
      total: bookingSummary.total,
      byStatus: {
        pending: bookingSummary.pending,
        confirmed: bookingSummary.confirmed,
        delivered: bookingSummary.delivered,
        returned: bookingSummary.returned,
        canceled: bookingSummary.canceled,
        noShow: bookingSummary.noShow,
      },
      overdueReturns: parseInt(overdueQ.rows[0]?.count ?? "0", 10),
      pendingPayments: parseInt(pendingPayQ.rows[0]?.count ?? "0", 10),
    },
    fleet: {
      available: fleetSnapshot.available,
      rented: fleetSnapshot.rented,
      maintenance: fleetSnapshot.maintenance,
      reserved: fleetSnapshot.reserved,
      inactive: fleetSnapshot.inactive,
    },
    parking: {
      terminal: parking["TERMINAL"] ?? 0,
      out: parking["OUT"] ?? 0,
      free: parking["FREE"] ?? 0,
    },
    todayActivity: {
      pickupsCount: todayActivity.pickups.length,
      dropoffsCount: todayActivity.dropoffs.length,
      pickups: todayActivity.pickups.map((b) => ({
        bookingId: b.id,
        reference: bookingRef(b.id),
        customerName: b.contactFullName,
        vehicleDisplayName: b.vehicle?.modelName
          ? vehicleDisplay(null, b.vehicle.modelName, b.vehicle.id)
          : (b.vehicleModelName ?? "Unassigned"),
        plateNumber: b.vehicle?.licensePlate ?? null,
        pickupDatetime: b.pickupDatetime,
        pickupLocation: b.pickupLocation.name,
        status: b.status,
      })),
      dropoffs: todayActivity.dropoffs.map((b) => ({
        bookingId: b.id,
        reference: bookingRef(b.id),
        customerName: b.contactFullName,
        vehicleDisplayName: b.vehicle?.modelName
          ? vehicleDisplay(null, b.vehicle.modelName, b.vehicle.id)
          : (b.vehicleModelName ?? "Unassigned"),
        plateNumber: b.vehicle?.licensePlate ?? null,
        dropoffDatetime: b.dropoffDatetime,
        dropoffLocation: b.dropoffLocation.name,
        status: b.status,
      })),
    },
  };
}

// ─── 2. Bookings list ─────────────────────────────────────────────────────────

export async function getAIBookings(filters: {
  status?: string;
  source?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  locationId?: number;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  const conditions: string[] = ["b.deleted_at IS NULL"];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.status) {
    conditions.push(`b.status = $${idx++}`);
    params.push(filters.status.toUpperCase());
  }
  if (filters.source) {
    conditions.push(`b.source = $${idx++}`);
    params.push(filters.source);
  }
  if (filters.paymentStatus) {
    conditions.push(`b.payment_status = $${idx++}`);
    params.push(filters.paymentStatus.toUpperCase());
  }
  if (filters.dateFrom) {
    conditions.push(`b.pickup_datetime >= $${idx++}`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`b.pickup_datetime < $${idx++}`);
    params.push(filters.dateTo);
  }
  if (filters.locationId) {
    conditions.push(`(b.pickup_location_id = $${idx} OR b.dropoff_location_id = $${idx})`);
    idx++;
    params.push(filters.locationId);
  }

  const where = conditions.join(" AND ");

  const countQ = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM booking b WHERE ${where}`,
    params,
  );
  const total = parseInt(countQ.rows[0]?.total ?? "0", 10);

  const dataParams = [...params, limit, offset];
  const dataQ = await pool.query(
    `SELECT
       b.id,
       b.status,
       b.payment_status,
       b.contact_full_name,
       b.contact_email,
       b.contact_phone,
       b.pickup_datetime,
       b.dropoff_datetime,
       b.total_amount,
       b.currency,
       b.source,
       b.notes,
       b.created_at,
       u.id        AS customer_id,
       u.full_name AS customer_name,
       u.phone     AS customer_phone,
       u.email     AS customer_email_user,
       v.id             AS vehicle_id,
       v.license_plate,
       vm.name          AS vehicle_model_name,
       br.name          AS vehicle_brand_name,
       bm.name          AS booking_model_name,
       bbr.name         AS booking_brand_name,
       pl.name          AS pickup_location_name,
       pl.city          AS pickup_city,
       dl.name          AS dropoff_location_name,
       dl.city          AS dropoff_city,
       COALESCE(
         SUM(bp.amount::numeric)
           FILTER (WHERE bp.payment_type IN ('BOOKING_PAYMENT','ADJUSTMENT')),
         0
       ) AS total_paid
     FROM booking b
     JOIN "user" u ON u.id = b.user_id
     LEFT JOIN vehicle v ON v.id = b.vehicle_id
     LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
     LEFT JOIN brand br ON br.id = vm.brand_id
     LEFT JOIN vehicle_model bm ON bm.id = b.vehicle_model_id
     LEFT JOIN brand bbr ON bbr.id = bm.brand_id
     JOIN location pl ON pl.id = b.pickup_location_id
     JOIN location dl ON dl.id = b.dropoff_location_id
     LEFT JOIN booking_payment bp ON bp.booking_id = b.id
     WHERE ${where}
     GROUP BY b.id, u.id, v.id, vm.name, br.name, bm.name, bbr.name,
              pl.name, pl.city, dl.name, dl.city
     ORDER BY b.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    dataParams,
  );

  const rows = dataQ.rows.map((r) => {
    const displayName =
      r.vehicle_model_name
        ? vehicleDisplay(r.vehicle_brand_name, r.vehicle_model_name, r.vehicle_id)
        : r.booking_model_name
          ? vehicleDisplay(r.booking_brand_name, r.booking_model_name, 0)
          : null;
    const totalAmount = r.total_amount != null ? parseFloat(r.total_amount) : null;
    const totalPaid = parseFloat(r.total_paid ?? "0");
    const remaining = totalAmount != null ? Math.max(0, totalAmount - totalPaid) : null;

    return {
      id: r.id,
      reference: bookingRef(r.id),
      status: r.status,
      paymentStatus: r.payment_status,
      source: r.source ?? null,
      customer: {
        id: r.customer_id,
        fullName: r.customer_name ?? r.contact_full_name,
        phone: r.customer_phone ?? r.contact_phone ?? null,
        email: r.customer_email_user ?? r.contact_email ?? null,
      },
      vehicleDisplayName: displayName,
      plateNumber: r.license_plate ?? null,
      pickupLocation: [r.pickup_location_name, r.pickup_city].filter(Boolean).join(", "),
      dropoffLocation: [r.dropoff_location_name, r.dropoff_city].filter(Boolean).join(", "),
      pickupDatetime: r.pickup_datetime,
      dropoffDatetime: r.dropoff_datetime,
      totalAmount: totalAmount != null ? totalAmount.toFixed(2) : null,
      totalPaid: totalPaid.toFixed(2),
      remainingAmount: remaining != null ? remaining.toFixed(2) : null,
      currency: r.currency ?? "GEL",
      notes: r.notes ?? null,
      createdAt: r.created_at,
    };
  });

  return { total, limit, offset, rows };
}

// ─── 3. Single booking deep view ──────────────────────────────────────────────

export async function getAIBooking(id: number) {
  const { rows } = await pool.query(
    `SELECT
       b.id, b.status, b.payment_status,
       b.contact_full_name, b.contact_email, b.contact_phone,
       b.pickup_datetime, b.dropoff_datetime,
       b.total_amount, b.currency, b.price_per_day, b.base_rate, b.deposit,
       b.notes, b.source, b.document_type, b.document_number,
       b.created_at, b.updated_at,
       u.id               AS customer_id,
       u.full_name        AS customer_name,
       u.email            AS customer_email_user,
       u.phone            AS customer_phone_user,
       u.country          AS customer_country,
       u.passport_id      AS customer_passport,
       u.driving_license  AS customer_driving_license,
       v.id               AS vehicle_id,
       v.license_plate,
       v.color            AS vehicle_color,
       v.year             AS vehicle_year,
       v.mileage          AS vehicle_mileage,
       vm.name            AS vehicle_model_name,
       br.name            AS vehicle_brand_name,
       bm.name            AS booking_model_name,
       bbr.name           AS booking_brand_name,
       pl.name            AS pickup_location_name,
       pl.city            AS pickup_city,
       dl.name            AS dropoff_location_name,
       dl.city            AS dropoff_city
     FROM booking b
     JOIN "user" u ON u.id = b.user_id
     LEFT JOIN vehicle v ON v.id = b.vehicle_id
     LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
     LEFT JOIN brand br ON br.id = vm.brand_id
     LEFT JOIN vehicle_model bm ON bm.id = b.vehicle_model_id
     LEFT JOIN brand bbr ON bbr.id = bm.brand_id
     JOIN location pl ON pl.id = b.pickup_location_id
     JOIN location dl ON dl.id = b.dropoff_location_id
     WHERE b.id = $1 AND b.deleted_at IS NULL`,
    [id],
  );

  if (!rows[0]) return null;
  const r = rows[0];

  const [payQ, paySumQ, auditQ, extrasQ, handoverQ] = await Promise.all([
    pool.query(
      `SELECT id, payment_type, amount, currency, converted_gel, payment_date, method, notes, created_at
       FROM booking_payment
       WHERE booking_id = $1
       ORDER BY payment_date ASC, created_at ASC`,
      [id],
    ),
    pool.query<{
      total_paid: string;
      deposit_received: string;
      deposit_returned: string;
      refund_total: string;
    }>(
      `SELECT
         COALESCE(SUM(amount::numeric) FILTER (WHERE payment_type IN ('BOOKING_PAYMENT','ADJUSTMENT')), 0)::text AS total_paid,
         COALESCE(SUM(amount::numeric) FILTER (WHERE payment_type = 'DEPOSIT_RECEIVED'), 0)::text AS deposit_received,
         COALESCE(SUM(amount::numeric) FILTER (WHERE payment_type = 'DEPOSIT_RETURNED'), 0)::text AS deposit_returned,
         COALESCE(SUM(amount::numeric) FILTER (WHERE payment_type = 'REFUND'), 0)::text AS refund_total
       FROM booking_payment WHERE booking_id = $1`,
      [id],
    ),
    pool.query(
      `SELECT id, actor_name, entity_type, action, summary, created_at
       FROM audit_logs
       WHERE entity_type = 'booking' AND entity_id = $1
       ORDER BY created_at DESC
       LIMIT 15`,
      [id],
    ),
    pool.query(
      `SELECT be.quantity, be.price_at_booking, e.name AS extra_name
       FROM bookingextra be
       JOIN extra e ON e.id = be.extra_id
       WHERE be.booking_id = $1`,
      [id],
    ),
    pool.query(
      `SELECT handover_type, action_at, mileage, fuel_level, notes
       FROM booking_handover
       WHERE booking_id = $1
       ORDER BY action_at ASC`,
      [id],
    ),
  ]);

  const displayName =
    r.vehicle_model_name
      ? vehicleDisplay(r.vehicle_brand_name, r.vehicle_model_name, r.vehicle_id)
      : r.booking_model_name
        ? vehicleDisplay(r.booking_brand_name, r.booking_model_name, 0)
        : "Not assigned";

  const totalAmount = r.total_amount != null ? parseFloat(r.total_amount) : null;
  const pSum = paySumQ.rows[0];
  const totalPaid = parseFloat(pSum?.total_paid ?? "0");
  const remaining = totalAmount != null ? Math.max(0, totalAmount - totalPaid) : null;

  return {
    id: r.id,
    reference: bookingRef(r.id),
    status: r.status,
    paymentStatus: r.payment_status,
    source: r.source ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,

    customer: {
      id: r.customer_id,
      fullName: r.customer_name ?? r.contact_full_name,
      email: r.customer_email_user ?? r.contact_email ?? null,
      phone: r.customer_phone_user ?? r.contact_phone ?? null,
      country: r.customer_country ?? null,
      passportId: r.customer_passport ?? null,
      drivingLicense: r.customer_driving_license ?? null,
    },

    vehicle: r.vehicle_id
      ? {
          id: r.vehicle_id,
          displayName,
          plateNumber: r.license_plate ?? null,
          color: r.vehicle_color ?? null,
          year: r.vehicle_year ?? null,
          mileageAtHandover: r.vehicle_mileage ?? null,
        }
      : null,
    bookedModel: displayName,

    trip: {
      pickupLocation: [r.pickup_location_name, r.pickup_city].filter(Boolean).join(", "),
      dropoffLocation: [r.dropoff_location_name, r.dropoff_city].filter(Boolean).join(", "),
      pickupDatetime: r.pickup_datetime,
      dropoffDatetime: r.dropoff_datetime,
    },

    pricing: {
      totalAmount: totalAmount != null ? totalAmount.toFixed(2) : null,
      currency: r.currency ?? "GEL",
      pricePerDay: r.price_per_day ?? null,
      baseRate: r.base_rate ?? null,
      deposit: r.deposit ?? null,
    },

    paymentSummary: {
      totalPaid: parseFloat(pSum?.total_paid ?? "0").toFixed(2),
      depositReceived: parseFloat(pSum?.deposit_received ?? "0").toFixed(2),
      depositReturned: parseFloat(pSum?.deposit_returned ?? "0").toFixed(2),
      refundTotal: parseFloat(pSum?.refund_total ?? "0").toFixed(2),
      remainingBalance: remaining != null ? remaining.toFixed(2) : null,
      currency: r.currency ?? "GEL",
    },

    paymentHistory: payQ.rows.map((p) => ({
      id: p.id,
      paymentType: p.payment_type,
      amount: p.amount,
      currency: p.currency,
      convertedGel: p.converted_gel ?? null,
      paymentDate: p.payment_date,
      method: p.method,
      notes: p.notes ?? null,
      recordedAt: p.created_at,
    })),

    extras: extrasQ.rows.map((e) => ({
      name: e.extra_name,
      quantity: e.quantity,
      priceAtBooking: e.price_at_booking,
    })),

    handovers: handoverQ.rows.map((h) => ({
      type: h.handover_type,
      actionAt: h.action_at,
      mileage: h.mileage ?? null,
      fuelLevel: h.fuel_level ?? null,
      notes: h.notes ?? null,
    })),

    recentActivity: auditQ.rows.map((a) => ({
      action: a.action,
      performedBy: a.actor_name ?? "System",
      summary: a.summary ?? `${a.action} on booking`,
      at: a.created_at,
    })),
  };
}

// ─── 4. Vehicles ──────────────────────────────────────────────────────────────

export async function getAIVehicles(filters?: {
  status?: string;
  locationId?: number;
}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.status) {
    conditions.push(`v.status = $${idx++}`);
    params.push(filters.status.toUpperCase());
  }
  if (filters?.locationId) {
    conditions.push(`v.location_id = $${idx++}`);
    params.push(filters.locationId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT
       v.id,
       v.license_plate,
       v.status,
       v.color,
       v.year,
       v.mileage,
       v.fuel_type,
       v.transmission,
       vm.name     AS model_name,
       vm.category AS category,
       br.name     AS brand_name,
       l.name      AS location_name,
       l.city      AS location_city,
       pa.zone     AS parking_zone,
       b.id                AS current_booking_id,
       b.contact_full_name AS current_customer_name,
       b.pickup_datetime   AS current_pickup,
       b.dropoff_datetime  AS current_dropoff
     FROM vehicle v
     LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
     LEFT JOIN brand br ON br.id = vm.brand_id
     LEFT JOIN location l ON l.id = v.location_id
     LEFT JOIN parking_assignment pa
            ON pa.vehicle_id = v.id AND pa.removed_at IS NULL
     LEFT JOIN booking b
            ON b.vehicle_id = v.id
           AND b.status = 'DELIVERED'
           AND b.deleted_at IS NULL
     ${where}
     ORDER BY v.status, br.name, vm.name, v.id`,
    params,
  );

  return rows.map((r) => ({
    id: r.id,
    displayName: vehicleDisplay(r.brand_name, r.model_name, r.id),
    plateNumber: r.license_plate ?? null,
    status: r.status,
    category: r.category ?? null,
    color: r.color ?? null,
    year: r.year ?? null,
    mileage: r.mileage ?? null,
    fuelType: r.fuel_type ?? null,
    transmission: r.transmission ?? null,
    location: r.location_name
      ? [r.location_name, r.location_city].filter(Boolean).join(", ")
      : null,
    parkingZone: r.parking_zone ?? null,
    currentBooking: r.current_booking_id
      ? {
          bookingId: r.current_booking_id,
          reference: bookingRef(r.current_booking_id),
          customerName: r.current_customer_name,
          pickupDatetime: r.current_pickup,
          expectedReturn: r.current_dropoff,
        }
      : null,
  }));
}

// ─── 5. Customers ─────────────────────────────────────────────────────────────

export async function getAICustomers(filters?: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(filters?.limit ?? 100, 500);
  const offset = filters?.offset ?? 0;

  const conditions: string[] = [];
  const filterParams: unknown[] = [];
  let idx = 1;

  if (filters?.search?.trim()) {
    conditions.push(
      `(u.full_name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.phone ILIKE $${idx})`,
    );
    idx++;
    filterParams.push(`%${filters.search.trim()}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countQ = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM "user" u ${where}`,
    filterParams,
  );
  const total = parseInt(countQ.rows[0]?.total ?? "0", 10);

  const dataParams = [...filterParams, limit, offset];
  const { rows } = await pool.query(
    `SELECT
       u.id, u.full_name, u.email, u.phone, u.country,
       u.passport_id, u.driving_license, u.notes, u.created_at,
       COUNT(b.id)           AS total_bookings,
       MAX(b.created_at)     AS last_booking_date
     FROM "user" u
     LEFT JOIN booking b ON b.user_id = u.id AND b.deleted_at IS NULL
     ${where}
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    dataParams,
  );

  return {
    total,
    limit,
    offset,
    rows: rows.map((r) => ({
      id: r.id,
      fullName: r.full_name ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      country: r.country ?? null,
      passportId: r.passport_id ?? null,
      drivingLicense: r.driving_license ?? null,
      notes: r.notes ?? null,
      totalBookings: parseInt(r.total_bookings ?? "0", 10),
      lastBookingDate: r.last_booking_date ?? null,
      customerSince: r.created_at,
    })),
  };
}

// ─── 6. Logs + diagnostics ────────────────────────────────────────────────────

// Map entity type names to human-readable module labels
const MODULE_LABELS: Record<string, string> = {
  booking: "Bookings",
  vehicle: "Fleet",
  payment: "Payments",
  user: "Customers",
  admin: "Team",
  parking: "Parking",
  maintenance: "Maintenance",
  document: "Documents",
};

function inferAuditStatus(action: string): DiagnosticStatus {
  if (action === "deleted" || action === "payment_deleted") return "WARNING";
  if (action.includes("refund") || action.includes("cancel")) return "WARNING";
  return "SUCCESS";
}

export async function getAILogs(filters?: {
  module?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(filters?.limit ?? 50, 200);
  const offset = filters?.offset ?? 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.dateFrom) {
    conditions.push(`al.created_at >= $${idx++}`);
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    const dt = new Date(filters.dateTo);
    dt.setDate(dt.getDate() + 1);
    conditions.push(`al.created_at < $${idx++}`);
    params.push(dt.toISOString().split("T")[0]);
  }
  if (filters?.module) {
    // Accept either the module label (e.g. "Bookings") or the entity type key (e.g. "booking")
    const entityType = Object.entries(MODULE_LABELS).find(
      ([, label]) => label.toLowerCase() === filters.module!.toLowerCase(),
    )?.[0] ?? filters.module.toLowerCase();
    conditions.push(`al.entity_type = $${idx++}`);
    params.push(entityType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countQ = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM audit_logs al ${where}`,
    params,
  );
  const total = parseInt(countQ.rows[0]?.total ?? "0", 10);

  const dataParams = [...params, limit, offset];
  const dataQ = await pool.query(
    `SELECT al.id, al.actor_name, al.entity_type, al.entity_id, al.entity_ref,
            al.action, al.summary, al.created_at
     FROM audit_logs al
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    dataParams,
  );

  const auditLog = dataQ.rows.map((r) => ({
    time: r.created_at,
    module: MODULE_LABELS[r.entity_type] ?? r.entity_type,
    action: r.action,
    status: inferAuditStatus(r.action),
    entityType: r.entity_type,
    entityId: r.entity_id ?? null,
    shortMessage: r.summary ?? `${r.action} on ${r.entity_type}`,
    reason: "",
    meta: {
      entityRef: r.entity_ref ?? null,
      performedBy: r.actor_name ?? "System",
    },
  }));

  // Always include synthesized anomaly diagnostics regardless of filters
  const diagnostics = await buildAnomalyDiagnostics();

  return {
    total,
    limit,
    offset,
    auditLog,
    diagnostics,
    diagnosticsNote:
      "The 'diagnostics' array contains synthesized anomalies derived from current system state (overdue returns, missing vehicle assignments, unpaid active bookings). These are not stored events — they reflect the current operational situation.",
  };
}

// ─── Anomaly diagnostics builder ─────────────────────────────────────────────

async function buildAnomalyDiagnostics(): Promise<DiagnosticEntry[]> {
  const now = new Date();
  const items: DiagnosticEntry[] = [];

  const [overdueQ, noVehicleQ, unpaidOldQ, noPlateVehicleQ] = await Promise.all([
    // 1. Overdue returns — DELIVERED bookings past their scheduled return datetime
    pool.query(
      `SELECT b.id, b.contact_full_name, b.dropoff_datetime,
              v.license_plate, vm.name AS model_name, br.name AS brand_name
       FROM booking b
       LEFT JOIN vehicle v ON v.id = b.vehicle_id
       LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
       LEFT JOIN brand br ON br.id = vm.brand_id
       WHERE b.status = 'DELIVERED'
         AND b.dropoff_datetime < NOW()
         AND b.deleted_at IS NULL
       ORDER BY b.dropoff_datetime ASC
       LIMIT 20`,
    ),

    // 2. Active (CONFIRMED/DELIVERED) bookings with no vehicle assigned
    pool.query(
      `SELECT b.id, b.contact_full_name, b.status, b.pickup_datetime,
              bm.name AS booking_model_name, bbr.name AS booking_brand_name
       FROM booking b
       LEFT JOIN vehicle_model bm ON bm.id = b.vehicle_model_id
       LEFT JOIN brand bbr ON bbr.id = bm.brand_id
       WHERE b.vehicle_id IS NULL
         AND b.status IN ('CONFIRMED', 'DELIVERED')
         AND b.deleted_at IS NULL
       ORDER BY b.pickup_datetime ASC
       LIMIT 10`,
    ),

    // 3. Unpaid active bookings older than 24 hours
    pool.query(
      `SELECT b.id, b.contact_full_name, b.total_amount, b.currency,
              b.status, b.pickup_datetime, b.created_at
       FROM booking b
       WHERE b.payment_status = 'UNPAID'
         AND b.status IN ('CONFIRMED', 'DELIVERED')
         AND b.created_at < NOW() - INTERVAL '24 hours'
         AND b.deleted_at IS NULL
       ORDER BY b.created_at ASC
       LIMIT 10`,
    ),

    // 4. Active vehicles (AVAILABLE/RESERVED) with no license plate recorded
    pool.query(
      `SELECT v.id, v.status,
              vm.name AS model_name, br.name AS brand_name,
              l.name AS location_name, l.city AS location_city
       FROM vehicle v
       LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
       LEFT JOIN brand br ON br.id = vm.brand_id
       LEFT JOIN location l ON l.id = v.location_id
       WHERE (v.license_plate IS NULL OR v.license_plate = '')
         AND v.status NOT IN ('INACTIVE')
       ORDER BY v.id ASC
       LIMIT 10`,
    ),
  ]);

  // 1. Overdue returns
  for (const r of overdueQ.rows) {
    const expectedReturn = new Date(r.dropoff_datetime);
    const hoursOverdue = Math.floor(
      (now.getTime() - expectedReturn.getTime()) / 3_600_000,
    );
    const vehicleDesc = r.license_plate
      ? `${r.brand_name ?? ""} ${r.model_name ?? ""} (${r.license_plate})`.trim()
      : "unassigned vehicle";

    items.push({
      time: now.toISOString(),
      module: "Bookings",
      action: "overdue_return",
      status: "WARNING",
      entityType: "booking",
      entityId: r.id,
      shortMessage: `Booking ${bookingRef(r.id)} overdue by ${hoursOverdue}h`,
      reason: `Customer "${r.contact_full_name}" has not returned the ${vehicleDesc}. Expected return: ${expectedReturn.toISOString()}. The booking is still in DELIVERED status.`,
      meta: {
        expectedReturn: r.dropoff_datetime,
        hoursOverdue,
        licensePlate: r.license_plate ?? null,
      },
    });
  }

  // 2. Active bookings with no vehicle assigned
  for (const r of noVehicleQ.rows) {
    const bookedModel = r.booking_brand_name
      ? `${r.booking_brand_name} ${r.booking_model_name}`
      : r.booking_model_name ?? "unspecified model";

    items.push({
      time: now.toISOString(),
      module: "Fleet",
      action: "no_vehicle_assigned",
      status: "WARNING",
      entityType: "booking",
      entityId: r.id,
      shortMessage: `Booking ${bookingRef(r.id)} is ${r.status} with no vehicle assigned`,
      reason: `Booking for "${r.contact_full_name}" (status: ${r.status}) has no specific vehicle assigned. Booked model: ${bookedModel}. Pickup scheduled: ${new Date(r.pickup_datetime).toISOString()}. A vehicle must be assigned before pickup.`,
      meta: { status: r.status, pickupDatetime: r.pickup_datetime, bookedModel },
    });
  }

  // 3. Unpaid active bookings older than 24h
  for (const r of unpaidOldQ.rows) {
    const ageHours = Math.floor(
      (now.getTime() - new Date(r.created_at).getTime()) / 3_600_000,
    );

    items.push({
      time: now.toISOString(),
      module: "Payments",
      action: "unpaid_active_booking",
      status: "WARNING",
      entityType: "booking",
      entityId: r.id,
      shortMessage: `Booking ${bookingRef(r.id)} is ${r.status} with no payment recorded (${ageHours}h old)`,
      reason: `Booking for "${r.contact_full_name}" (status: ${r.status}) has been UNPAID for ${ageHours} hours. Total amount: ${r.total_amount != null ? `${r.total_amount} ${r.currency ?? "GEL"}` : "not set"}. Payment must be collected or recorded.`,
      meta: {
        totalAmount: r.total_amount ?? null,
        currency: r.currency ?? "GEL",
        status: r.status,
        ageHours,
      },
    });
  }

  // 4. Active vehicles with no license plate
  for (const r of noPlateVehicleQ.rows) {
    const displayName = vehicleDisplay(r.brand_name, r.model_name, r.id);
    const locationDesc = r.location_name
      ? [r.location_name, r.location_city].filter(Boolean).join(", ")
      : "unknown location";

    items.push({
      time: now.toISOString(),
      module: "Fleet",
      action: "vehicle_missing_plate",
      status: "WARNING",
      entityType: "vehicle",
      entityId: r.id,
      shortMessage: `Vehicle #${r.id} (${displayName}) has no license plate recorded`,
      reason: `Vehicle "${displayName}" (status: ${r.status}, location: ${locationDesc}) has no license plate number on record. A plate is required for vehicle assignment and handover documentation.`,
      meta: { status: r.status, location: locationDesc },
    });
  }

  return items;
}
