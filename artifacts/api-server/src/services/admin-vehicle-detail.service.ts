import { pool } from "@workspace/db";

// ─── Vehicle Detail ────────────────────────────────────────────────────────────
// Aggregates all operational data for a specific vehicle:
// identity, current booking, booking history, service history, alerts, financials

export async function getVehicleDetail(vehicleId: number) {
  // ── Vehicle identity ─────────────────────────────────────────────────────────
  const { rows: vRows } = await pool.query(
    `SELECT
      v.id,
      v.license_plate,
      v.status,
      v.mileage,
      v.color,
      v.year,
      v.techpassport_number,
      vm.id AS model_id,
      vm.name AS model_name,
      vm.category,
      vm.seats,
      vm.transmission,
      vm.fuel_type,
      vm.image_url AS model_image_url,
      br.id AS brand_id,
      br.name AS brand_name,
      l.id AS location_id,
      l.name AS location_name,
      l.city AS location_city
    FROM vehicle v
    LEFT JOIN vehicle_model vm ON vm.id = v.vehicle_model_id
    LEFT JOIN brand br ON br.id = vm.brand_id
    LEFT JOIN location l ON l.id = v.location_id
    WHERE v.id = $1`,
    [vehicleId],
  );

  if (!vRows[0]) return null;
  const vehicle = vRows[0];

  // ── Current booking (most recent active) ─────────────────────────────────────
  const { rows: currentBookingRows } = await pool.query(
    `SELECT
      b.id,
      b.status,
      b.source,
      b.pickup_datetime,
      b.dropoff_datetime,
      b.contact_full_name,
      b.total_amount,
      b.currency,
      pl.name AS pickup_location,
      dl.name AS dropoff_location,
      u.full_name AS customer_name,
      u.phone AS customer_phone
    FROM booking b
    LEFT JOIN location pl ON pl.id = b.pickup_location_id
    LEFT JOIN location dl ON dl.id = b.dropoff_location_id
    LEFT JOIN "user" u ON u.id = b.user_id
    WHERE b.vehicle_id = $1
      AND b.status IN ('CONFIRMED', 'DELIVERED', 'PENDING')
      AND b.deleted_at IS NULL
    ORDER BY b.pickup_datetime DESC
    LIMIT 1`,
    [vehicleId],
  );

  const currentBooking = currentBookingRows[0] ?? null;

  // ── Booking history (last 20) ─────────────────────────────────────────────────
  const { rows: bookingHistory } = await pool.query(
    `SELECT
      b.id,
      b.status,
      b.source,
      b.pickup_datetime,
      b.dropoff_datetime,
      b.total_amount,
      b.currency,
      u.full_name AS customer_name,
      pl.name AS pickup_location
    FROM booking b
    LEFT JOIN "user" u ON u.id = b.user_id
    LEFT JOIN location pl ON pl.id = b.pickup_location_id
    WHERE b.vehicle_id = $1
      AND b.deleted_at IS NULL
    ORDER BY b.pickup_datetime DESC
    LIMIT 20`,
    [vehicleId],
  );

  // ── Service history ─────────────────────────────────────────────────────────
  const { rows: serviceHistory } = await pool.query(
    `SELECT
      ms.id,
      ms.service_date,
      ms.mileage,
      ms.cost,
      ms.status,
      ms.mechanic_name,
      ms.shop_name AS vendor,
      ms.description,
      ms.next_service_date,
      ms.next_service_mileage,
      mst.name AS service_type_name
    FROM maintenance_services ms
    JOIN maintenance_service_types mst ON mst.id = ms.service_type_id
    WHERE ms.vehicle_id = $1
    ORDER BY ms.service_date DESC NULLS LAST, ms.id DESC`,
    [vehicleId],
  );

  // ── Last service date / next service date ─────────────────────────────────────
  const lastService = serviceHistory[0] ?? null;
  const nextServiceEntry = serviceHistory.find((s) => s.next_service_date != null) ?? null;

  // ── Financial context ─────────────────────────────────────────────────────────
  const { rows: financialRows } = await pool.query(
    `SELECT
      COUNT(b.id)::int AS total_bookings,
      COALESCE(SUM(b.total_amount::numeric) FILTER (WHERE b.currency = 'GEL'), 0)::numeric AS total_revenue_gel
    FROM booking b
    WHERE b.vehicle_id = $1
      AND b.deleted_at IS NULL
      AND b.status NOT IN ('CANCELED', 'NO_SHOW')`,
    [vehicleId],
  );

  const { rows: serviceFinancialRows } = await pool.query(
    `SELECT COALESCE(SUM(ms.cost::numeric), 0)::numeric AS total_service_cost
    FROM maintenance_services ms
    WHERE ms.vehicle_id = $1`,
    [vehicleId],
  );

  const financial = {
    totalBookings: financialRows[0]?.total_bookings ?? 0,
    totalRevenueGel: parseFloat(financialRows[0]?.total_revenue_gel ?? "0"),
    totalServiceCost: parseFloat(serviceFinancialRows[0]?.total_service_cost ?? "0"),
  };

  // ── Active alerts for this vehicle ───────────────────────────────────────────
  const now = new Date().toISOString();
  const alerts: object[] = [];

  // Overdue return
  const { rows: overdueRows } = await pool.query(
    `SELECT b.id AS booking_id, b.dropoff_datetime
    FROM booking b
    WHERE b.vehicle_id = $1
      AND b.status = 'DELIVERED'
      AND b.dropoff_datetime < NOW()
      AND b.deleted_at IS NULL
    LIMIT 1`,
    [vehicleId],
  );
  if (overdueRows[0]) {
    alerts.push({
      alertType: "OVERDUE",
      bookingId: overdueRows[0].booking_id,
      message: `Vehicle is overdue for return — dropoff was ${overdueRows[0].dropoff_datetime}`,
    });
  }

  // Maintenance alert (three severity levels)
  const { rows: maintRows } = await pool.query(
    `SELECT
      ms.id AS service_id,
      ms.next_service_date,
      ms.next_service_mileage,
      CASE
        WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date < CURRENT_DATE THEN 'SERVICE_OVERDUE'
        WHEN ms.next_service_mileage IS NOT NULL AND $2::int IS NOT NULL AND $2::int > ms.next_service_mileage + 1000 THEN 'SERVICE_OVERDUE'
        WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date = CURRENT_DATE THEN 'SERVICE_DUE'
        WHEN ms.next_service_mileage IS NOT NULL AND $2::int IS NOT NULL AND $2::int >= ms.next_service_mileage THEN 'SERVICE_DUE'
        WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date > CURRENT_DATE
          AND ms.next_service_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'SERVICE_WARNING'
        WHEN ms.next_service_mileage IS NOT NULL AND $2::int IS NOT NULL
          AND $2::int >= ms.next_service_mileage - 1000 AND $2::int < ms.next_service_mileage THEN 'SERVICE_WARNING'
        ELSE NULL
      END AS severity
    FROM maintenance_services ms
    WHERE ms.vehicle_id = $1
      AND ms.status NOT IN ('IN_PROGRESS')
      AND (ms.next_service_date IS NOT NULL OR (ms.next_service_mileage IS NOT NULL AND $2::int IS NOT NULL))
    ORDER BY CASE
      WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date < CURRENT_DATE THEN 1
      WHEN ms.next_service_mileage IS NOT NULL AND $2::int IS NOT NULL AND $2::int > ms.next_service_mileage + 1000 THEN 1
      WHEN ms.next_service_date IS NOT NULL AND ms.next_service_date = CURRENT_DATE THEN 2
      WHEN ms.next_service_mileage IS NOT NULL AND $2::int IS NOT NULL AND $2::int >= ms.next_service_mileage THEN 2
      ELSE 3
    END ASC
    LIMIT 1`,
    [vehicleId, vehicle.mileage],
  );
  const maintRow = maintRows[0];
  if (maintRow?.severity) {
    let msg = "Vehicle requires scheduled maintenance";
    if (maintRow.severity === "SERVICE_OVERDUE") {
      if (maintRow.next_service_date && new Date(maintRow.next_service_date) < new Date()) {
        const days = Math.floor((Date.now() - new Date(maintRow.next_service_date).getTime()) / 86400000);
        msg = `Service overdue by ${days} day${days !== 1 ? "s" : ""}`;
      } else if (maintRow.next_service_mileage != null && vehicle.mileage != null) {
        msg = `Service overdue — ${(vehicle.mileage - maintRow.next_service_mileage).toLocaleString()} km past threshold`;
      }
    } else if (maintRow.severity === "SERVICE_DUE") {
      if (maintRow.next_service_date) msg = "Service due today";
      else msg = `Service due — mileage threshold reached`;
    } else {
      if (maintRow.next_service_date) {
        const days = Math.ceil((new Date(maintRow.next_service_date).getTime() - Date.now()) / 86400000);
        msg = `Service due in ${days} day${days !== 1 ? "s" : ""}`;
      } else if (maintRow.next_service_mileage != null && vehicle.mileage != null) {
        msg = `Service due in ${(maintRow.next_service_mileage - vehicle.mileage).toLocaleString()} km`;
      }
    }
    alerts.push({
      alertType: maintRow.severity,
      serviceId: maintRow.service_id,
      message: msg,
    });
  }

  // Booking conflict
  const { rows: conflictRows } = await pool.query(
    `SELECT COUNT(*) AS cnt
    FROM booking b1
    JOIN booking b2 ON b1.vehicle_id = b2.vehicle_id AND b1.id < b2.id
    WHERE b1.vehicle_id = $1
      AND b1.status NOT IN ('CANCELED','NO_SHOW')
      AND b2.status NOT IN ('CANCELED','NO_SHOW')
      AND b1.deleted_at IS NULL AND b2.deleted_at IS NULL
      AND b1.pickup_datetime < b2.dropoff_datetime
      AND b1.dropoff_datetime > b2.pickup_datetime`,
    [vehicleId],
  );
  if (parseInt(conflictRows[0]?.cnt ?? "0") > 0) {
    alerts.push({
      alertType: "CONFLICT",
      message: `Booking conflict detected for this vehicle`,
    });
  }

  return {
    vehicle: {
      id: vehicle.id,
      licensePlate: vehicle.license_plate,
      status: vehicle.status,
      mileage: vehicle.mileage,
      color: vehicle.color,
      year: vehicle.year,
      techpassportNumber: vehicle.techpassport_number,
      model: {
        id: vehicle.model_id,
        name: vehicle.model_name,
        category: vehicle.category,
        seats: vehicle.seats,
        transmission: vehicle.transmission,
        fuelType: vehicle.fuel_type,
        imageUrl: vehicle.model_image_url,
      },
      brand: { id: vehicle.brand_id, name: vehicle.brand_name },
      location: vehicle.location_id
        ? { id: vehicle.location_id, name: vehicle.location_name, city: vehicle.location_city }
        : null,
    },
    currentBooking,
    bookingHistory,
    serviceHistory,
    lastServiceDate: lastService?.service_date ?? null,
    lastServiceMileage: lastService?.mileage ?? null,
    nextServiceDate: nextServiceEntry?.next_service_date ?? null,
    nextServiceMileage: nextServiceEntry?.next_service_mileage ?? null,
    financial,
    alerts,
  };
}
