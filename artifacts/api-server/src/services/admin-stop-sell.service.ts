/**
 * admin-stop-sell.service.ts
 *
 * CRUD service for Stop Sell rules.
 *
 * Mutations (create / update / delete) are fully transactional via a raw
 * pool connection (BEGIN/COMMIT/ROLLBACK).  logAudit() is called only after
 * the transaction has committed successfully — never inside the transaction.
 *
 * The isStopSold() helper is the shared overlap predicate used by both the
 * booking-config filter (GET /api/public/booking-config) and the booking
 * submission safety check (POST /api/public/bookings).
 *
 * Date-overlap logic uses Asia/Tbilisi-anchored boundaries:
 *   window_start = start_date::timestamp AT TIME ZONE 'Asia/Tbilisi'
 *   window_end   = (end_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Tbilisi'
 * A rental overlaps when:
 *   pickup_datetime < window_end AND dropoff_datetime > window_start
 */

import { pool } from "@workspace/db";
import { logAudit } from "./audit.service.js";
import { NotFoundError } from "../lib/errors.js";

// ─── Allowed cities ───────────────────────────────────────────────────────────

export const ALLOWED_STOP_SELL_CITIES = ["Tbilisi", "Kutaisi", "Batumi"] as const;
export type StopSellCity = (typeof ALLOWED_STOP_SELL_CITIES)[number];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StopSellCreateData {
  name?: string | null;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  isActive?: boolean;
  vehicleModelIds: number[];
  cities: string[];
}

export interface StopSellUpdateData {
  name?: string | null;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  vehicleModelIds?: number[];
  cities?: string[];
}

export interface StopSellRow {
  id: number;
  name: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  vehicleModelIds: number[];
  cities: string[];
}

// ─── Shared Asia/Tbilisi overlap SQL fragment ─────────────────────────────────
// Parameters: $1 = vehicle_model_id, $2 = city, $3 = pickup_datetime, $4 = dropoff_datetime
// Returns one row with found = true|false.

const OVERLAP_EXISTS_SQL = `
  SELECT EXISTS (
    SELECT 1
    FROM stop_sell ss
    JOIN stop_sell_vehicle_model ssvm ON ssvm.stop_sell_id = ss.id
    JOIN stop_sell_region ssr ON ssr.stop_sell_id = ss.id
    WHERE ssvm.vehicle_model_id = $1
      AND ssr.city = $2
      AND ss.is_active = true
      AND ss.start_date::timestamp AT TIME ZONE 'Asia/Tbilisi' < $4::timestamptz
      AND (ss.end_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Tbilisi' > $3::timestamptz
  ) AS found
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Validate creation/update payload; throws on error with "VALIDATION: " prefix. */
function validatePayload(
  vehicleModelIds: number[],
  cities: string[],
  startDate: string,
  endDate: string,
): void {
  if (vehicleModelIds.length === 0) {
    throw new Error("VALIDATION: At least one vehicle model must be selected.");
  }
  if (cities.length === 0) {
    throw new Error("VALIDATION: At least one city must be selected.");
  }
  for (const city of cities) {
    if (!(ALLOWED_STOP_SELL_CITIES as readonly string[]).includes(city)) {
      throw new Error(
        `VALIDATION: Invalid city "${city}". Allowed values: ${ALLOWED_STOP_SELL_CITIES.join(", ")}.`,
      );
    }
  }
  if (startDate > endDate) {
    throw new Error("VALIDATION: start_date must be on or before end_date.");
  }
}

/** Verify all vehicleModelIds exist in vehicle_model table. */
async function assertModelsExist(modelIds: number[]): Promise<void> {
  if (modelIds.length === 0) return;
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM vehicle_model WHERE id = ANY($1)`,
    [modelIds],
  );
  const found = new Set(rows.map((r) => r.id));
  const missing = modelIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error(
      `VALIDATION: Vehicle model(s) not found: ${missing.join(", ")}.`,
    );
  }
}

/** Fetch a stop sell rule with its junction data. Throws NotFoundError if absent. */
async function getStopSell(id: number): Promise<StopSellRow> {
  const { rows } = await pool.query<{
    id: number;
    name: string | null;
    start_date: string;
    end_date: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    vehicle_model_ids: number[];
    cities: string[];
  }>(
    `SELECT
       ss.id,
       ss.name,
       ss.start_date::text AS start_date,
       ss.end_date::text   AS end_date,
       ss.is_active,
       ss.created_at,
       ss.updated_at,
       COALESCE(
         ARRAY(
           SELECT ssvm.vehicle_model_id
           FROM stop_sell_vehicle_model ssvm
           WHERE ssvm.stop_sell_id = ss.id
           ORDER BY ssvm.vehicle_model_id
         ),
         ARRAY[]::int[]
       ) AS vehicle_model_ids,
       COALESCE(
         ARRAY(
           SELECT ssr.city
           FROM stop_sell_region ssr
           WHERE ssr.stop_sell_id = ss.id
           ORDER BY ssr.city
         ),
         ARRAY[]::text[]
       ) AS cities
     FROM stop_sell ss
     WHERE ss.id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError(`Stop Sell rule ${id} not found`);
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    vehicleModelIds: r.vehicle_model_ids,
    cities: r.cities,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** List all stop sell rules ordered by created_at DESC. */
export async function listStopSells(): Promise<StopSellRow[]> {
  const { rows } = await pool.query<{
    id: number;
    name: string | null;
    start_date: string;
    end_date: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    vehicle_model_ids: number[];
    cities: string[];
  }>(
    `SELECT
       ss.id,
       ss.name,
       ss.start_date::text AS start_date,
       ss.end_date::text   AS end_date,
       ss.is_active,
       ss.created_at,
       ss.updated_at,
       COALESCE(
         ARRAY(
           SELECT ssvm.vehicle_model_id
           FROM stop_sell_vehicle_model ssvm
           WHERE ssvm.stop_sell_id = ss.id
           ORDER BY ssvm.vehicle_model_id
         ),
         ARRAY[]::int[]
       ) AS vehicle_model_ids,
       COALESCE(
         ARRAY(
           SELECT ssr.city
           FROM stop_sell_region ssr
           WHERE ssr.stop_sell_id = ss.id
           ORDER BY ssr.city
         ),
         ARRAY[]::text[]
       ) AS cities
     FROM stop_sell ss
     ORDER BY ss.created_at DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    vehicleModelIds: r.vehicle_model_ids,
    cities: r.cities,
  }));
}

/** Create a stop sell rule and its junctions in a single transaction. */
export async function createStopSell(
  data: StopSellCreateData,
  actorId?: number | null,
): Promise<StopSellRow> {
  const {
    name = null,
    startDate,
    endDate,
    isActive = true,
    vehicleModelIds,
    cities,
  } = data;

  validatePayload(vehicleModelIds, cities, startDate, endDate);
  await assertModelsExist(vehicleModelIds);

  const client = await pool.connect();
  let newId: number;
  try {
    await client.query("BEGIN");

    const { rows: [inserted] } = await client.query<{ id: number }>(
      `INSERT INTO stop_sell (name, start_date, end_date, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name, startDate, endDate, isActive],
    );
    newId = inserted!.id;

    if (vehicleModelIds.length > 0) {
      const vmPlaceholders = vehicleModelIds
        .map((_, i) => `($1, $${i + 2})`)
        .join(", ");
      await client.query(
        `INSERT INTO stop_sell_vehicle_model (stop_sell_id, vehicle_model_id)
         VALUES ${vmPlaceholders}`,
        [newId, ...vehicleModelIds],
      );
    }

    if (cities.length > 0) {
      const cityPlaceholders = cities
        .map((_, i) => `($1, $${i + 2})`)
        .join(", ");
      await client.query(
        `INSERT INTO stop_sell_region (stop_sell_id, city)
         VALUES ${cityPlaceholders}`,
        [newId, ...cities],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Audit only after successful commit
  logAudit({
    actorId: actorId ?? null,
    entityType: "stop_sell",
    entityId: newId,
    action: "create",
    summary: `Created Stop Sell rule id=${newId}`,
  });

  return getStopSell(newId);
}

/** Update a stop sell rule and replace its junctions in a single transaction. */
export async function updateStopSell(
  id: number,
  data: StopSellUpdateData,
  actorId?: number | null,
): Promise<StopSellRow> {
  // Fetch existing to merge defaults
  const existing = await getStopSell(id);

  const vehicleModelIds = data.vehicleModelIds ?? existing.vehicleModelIds;
  const cities = data.cities ?? existing.cities;
  const startDate = data.startDate ?? existing.startDate;
  const endDate = data.endDate ?? existing.endDate;

  validatePayload(vehicleModelIds, cities, startDate, endDate);
  if (data.vehicleModelIds !== undefined) {
    await assertModelsExist(vehicleModelIds);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Build SET clauses for only provided fields; always refresh updated_at.
    const setClauses: string[] = ["updated_at = NOW()"];
    const setParams: unknown[] = [];
    let paramIdx = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      setParams.push(data.name);
    }
    if (data.startDate !== undefined) {
      setClauses.push(`start_date = $${paramIdx++}`);
      setParams.push(data.startDate);
    }
    if (data.endDate !== undefined) {
      setClauses.push(`end_date = $${paramIdx++}`);
      setParams.push(data.endDate);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`is_active = $${paramIdx++}`);
      setParams.push(data.isActive);
    }

    await client.query(
      `UPDATE stop_sell SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`,
      [...setParams, id],
    );

    if (data.vehicleModelIds !== undefined) {
      await client.query(
        `DELETE FROM stop_sell_vehicle_model WHERE stop_sell_id = $1`,
        [id],
      );
      if (vehicleModelIds.length > 0) {
        const vmPlaceholders = vehicleModelIds
          .map((_, i) => `($1, $${i + 2})`)
          .join(", ");
        await client.query(
          `INSERT INTO stop_sell_vehicle_model (stop_sell_id, vehicle_model_id)
           VALUES ${vmPlaceholders}`,
          [id, ...vehicleModelIds],
        );
      }
    }

    if (data.cities !== undefined) {
      await client.query(
        `DELETE FROM stop_sell_region WHERE stop_sell_id = $1`,
        [id],
      );
      if (cities.length > 0) {
        const cityPlaceholders = cities
          .map((_, i) => `($1, $${i + 2})`)
          .join(", ");
        await client.query(
          `INSERT INTO stop_sell_region (stop_sell_id, city)
           VALUES ${cityPlaceholders}`,
          [id, ...cities],
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Audit only after successful commit
  logAudit({
    actorId: actorId ?? null,
    entityType: "stop_sell",
    entityId: id,
    action: "update",
    summary: `Updated Stop Sell rule id=${id}`,
  });

  return getStopSell(id);
}

/** Delete a stop sell rule (junctions cascade). */
export async function deleteStopSell(
  id: number,
  actorId?: number | null,
): Promise<void> {
  // Verify existence first
  await getStopSell(id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM stop_sell WHERE id = $1`, [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Audit only after successful commit
  logAudit({
    actorId: actorId ?? null,
    entityType: "stop_sell",
    entityId: id,
    action: "delete",
    summary: `Deleted Stop Sell rule id=${id}`,
  });
}

/**
 * Returns true if the given vehicle model is stop-sold for the given city
 * and rental interval.  Returns false when city is null (no false positives).
 *
 * Uses Asia/Tbilisi date boundaries — NOT UTC calendar-day truncation.
 *
 * Parameters:
 *   vehicleModelId  — vehicle_model.id
 *   city            — location.city (nullable; null → always false)
 *   pickupDatetime  — ISO 8601 string from the booking request
 *   dropoffDatetime — ISO 8601 string from the booking request
 */
export async function isStopSold(
  vehicleModelId: number,
  city: string | null,
  pickupDatetime: string,
  dropoffDatetime: string,
): Promise<boolean> {
  if (city === null) return false;
  const { rows } = await pool.query<{ found: boolean }>(
    OVERLAP_EXISTS_SQL,
    [vehicleModelId, city, pickupDatetime, dropoffDatetime],
  );
  return rows[0]?.found === true;
}

/**
 * Returns the set of vehicle model IDs that are stop-sold for the given city
 * and rental interval.  Used by GET /api/public/booking-config to filter
 * models in bulk.  Returns an empty Set when city is null.
 */
export async function getStopSoldModelIds(
  modelIds: number[],
  city: string | null,
  pickupDatetime: string,
  dropoffDatetime: string,
): Promise<Set<number>> {
  if (city === null || modelIds.length === 0) return new Set();
  const { rows } = await pool.query<{ vehicle_model_id: number }>(
    `SELECT DISTINCT ssvm.vehicle_model_id
     FROM stop_sell ss
     JOIN stop_sell_vehicle_model ssvm ON ssvm.stop_sell_id = ss.id
     JOIN stop_sell_region ssr ON ssr.stop_sell_id = ss.id
     WHERE ssvm.vehicle_model_id = ANY($1)
       AND ssr.city = $2
       AND ss.is_active = true
       AND ss.start_date::timestamp AT TIME ZONE 'Asia/Tbilisi' < $4::timestamptz
       AND (ss.end_date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Tbilisi' > $3::timestamptz`,
    [modelIds, city, pickupDatetime, dropoffDatetime],
  );
  return new Set(rows.map((r) => r.vehicle_model_id));
}
