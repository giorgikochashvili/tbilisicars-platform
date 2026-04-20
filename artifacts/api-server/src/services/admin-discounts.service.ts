import { db, pool } from "@workspace/db";
import { discountTable, discountVehicleModelTable } from "@workspace/db";
import type { Discount } from "@workspace/db";
import { eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

// Shape returned by getAdminDiscount (raw pool query with camelCase aliases + vehicleModels array)
interface ExistingDiscountRow {
  id: number;
  name: string;
  discountType: "PERCENT" | "FIXED";
  value: string;
  startDate: string;
  endDate: string;
  pickupLocationId: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  vehicleModels: Array<{ vehicleModelId: number; modelName: string; brandName: string }>;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DiscountCreateData {
  name: string;
  discountType: "PERCENT" | "FIXED";
  value: number;
  startDate: string;
  endDate: string;
  pickupLocationId: number;
  isActive?: boolean;
  vehicleModelIds: number[];
}

export interface DiscountUpdateData {
  name?: string;
  discountType?: "PERCENT" | "FIXED";
  value?: number;
  startDate?: string;
  endDate?: string;
  pickupLocationId?: number;
  isActive?: boolean;
  vehicleModelIds?: number[];
}

// ─── Overlap check ────────────────────────────────────────────────────────────
/**
 * Returns list of vehicle model IDs that already have an active discount
 * for the given pickup location that overlaps the given date range.
 * Excludes the given discountId (for updates).
 */
async function findOverlappingModels(
  pickupLocationId: number,
  startDate: string,
  endDate: string,
  vehicleModelIds: number[],
  excludeDiscountId?: number,
): Promise<number[]> {
  if (vehicleModelIds.length === 0) return [];

  const params: unknown[] = [pickupLocationId, startDate, endDate, vehicleModelIds];
  const excludeClause =
    excludeDiscountId != null
      ? ` AND d.id != $${params.push(excludeDiscountId)}`
      : "";

  const { rows } = await pool.query<{ vehicle_model_id: number }>(
    `SELECT DISTINCT dvm.vehicle_model_id
     FROM website_discount d
     JOIN website_discount_vehicle_model dvm ON dvm.discount_id = d.id
     WHERE d.pickup_location_id = $1
       AND d.is_active = true
       AND d.start_date <= $3::date
       AND d.end_date >= $2::date
       AND dvm.vehicle_model_id = ANY($4)${excludeClause}`,
    params,
  );
  return rows.map((r) => r.vehicle_model_id);
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listAllDiscounts() {
  const { rows } = await pool.query(`
    SELECT
      d.id,
      d.name,
      d.discount_type AS "discountType",
      d.value,
      d.start_date AS "startDate",
      d.end_date AS "endDate",
      d.pickup_location_id AS "pickupLocationId",
      l.name AS "pickupLocationName",
      l.city AS "pickupLocationCity",
      d.is_active AS "isActive",
      d.created_at AS "createdAt",
      d.updated_at AS "updatedAt",
      COALESCE(
        json_agg(
          json_build_object(
            'vehicleModelId', dvm.vehicle_model_id,
            'modelName', vm.name,
            'brandName', br.name
          ) ORDER BY br.name, vm.name
        ) FILTER (WHERE dvm.vehicle_model_id IS NOT NULL),
        '[]'
      ) AS "vehicleModels"
    FROM website_discount d
    LEFT JOIN location l ON l.id = d.pickup_location_id
    LEFT JOIN website_discount_vehicle_model dvm ON dvm.discount_id = d.id
    LEFT JOIN vehicle_model vm ON vm.id = dvm.vehicle_model_id
    LEFT JOIN brand br ON br.id = vm.brand_id
    GROUP BY d.id, l.name, l.city
    ORDER BY d.id DESC
  `);
  return rows;
}

// ─── Get single ───────────────────────────────────────────────────────────────

export async function getAdminDiscount(id: number) {
  const { rows } = await pool.query(`
    SELECT
      d.id,
      d.name,
      d.discount_type AS "discountType",
      d.value,
      d.start_date AS "startDate",
      d.end_date AS "endDate",
      d.pickup_location_id AS "pickupLocationId",
      l.name AS "pickupLocationName",
      l.city AS "pickupLocationCity",
      d.is_active AS "isActive",
      d.created_at AS "createdAt",
      d.updated_at AS "updatedAt",
      COALESCE(
        json_agg(
          json_build_object(
            'vehicleModelId', dvm.vehicle_model_id,
            'modelName', vm.name,
            'brandName', br.name
          ) ORDER BY br.name, vm.name
        ) FILTER (WHERE dvm.vehicle_model_id IS NOT NULL),
        '[]'
      ) AS "vehicleModels"
    FROM website_discount d
    LEFT JOIN location l ON l.id = d.pickup_location_id
    LEFT JOIN website_discount_vehicle_model dvm ON dvm.discount_id = d.id
    LEFT JOIN vehicle_model vm ON vm.id = dvm.vehicle_model_id
    LEFT JOIN brand br ON br.id = vm.brand_id
    WHERE d.id = $1
    GROUP BY d.id, l.name, l.city
  `, [id]);

  if (!rows[0]) throw new NotFoundError(`Discount ${id} not found`);
  return rows[0];
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createAdminDiscount(data: DiscountCreateData) {
  const {
    name, discountType, value, startDate, endDate,
    pickupLocationId, isActive = true, vehicleModelIds,
  } = data;

  if (!vehicleModelIds || vehicleModelIds.length === 0) {
    throw new Error("VALIDATION: At least one vehicle model must be selected.");
  }
  if (startDate > endDate) {
    throw new Error("VALIDATION: startDate must be on or before endDate.");
  }
  if (value <= 0) {
    throw new Error("VALIDATION: Discount value must be greater than 0.");
  }
  if (discountType === "PERCENT" && value > 100) {
    throw new Error("VALIDATION: Percentage discount cannot exceed 100.");
  }

  if (isActive) {
    const overlapping = await findOverlappingModels(
      pickupLocationId, startDate, endDate, vehicleModelIds,
    );
    if (overlapping.length > 0) {
      throw new Error(
        `OVERLAP: An active discount already covers vehicle model(s) [${overlapping.join(", ")}] for the same pickup location and overlapping date range.`,
      );
    }
  }

  const [discount] = await db
    .insert(discountTable)
    .values({
      name,
      discountType,
      value: String(value),
      startDate,
      endDate,
      pickupLocationId,
      isActive,
    })
    .returning();

  if (vehicleModelIds.length > 0) {
    await db.insert(discountVehicleModelTable).values(
      vehicleModelIds.map((vmId) => ({
        discountId: discount!.id,
        vehicleModelId: vmId,
      })),
    );
  }

  return getAdminDiscount(discount!.id);
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateAdminDiscount(id: number, data: DiscountUpdateData) {
  const existing = await getAdminDiscount(id) as ExistingDiscountRow;

  const discountType = data.discountType ?? existing.discountType;
  const value = data.value ?? Number(existing.value);
  const startDate = data.startDate ?? existing.startDate;
  const endDate = data.endDate ?? existing.endDate;
  const pickupLocationId = data.pickupLocationId ?? existing.pickupLocationId;
  const isActive = data.isActive !== undefined ? data.isActive : existing.isActive;
  const vehicleModelIds = data.vehicleModelIds ??
    existing.vehicleModels.map((m) => m.vehicleModelId);

  if (vehicleModelIds.length === 0) {
    throw new Error("VALIDATION: At least one vehicle model must be selected.");
  }
  if (startDate > endDate) {
    throw new Error("VALIDATION: startDate must be on or before endDate.");
  }
  if (value <= 0) {
    throw new Error("VALIDATION: Discount value must be greater than 0.");
  }
  if (discountType === "PERCENT" && value > 100) {
    throw new Error("VALIDATION: Percentage discount cannot exceed 100.");
  }

  if (isActive) {
    const overlapping = await findOverlappingModels(
      pickupLocationId, startDate, endDate, vehicleModelIds, id,
    );
    if (overlapping.length > 0) {
      throw new Error(
        `OVERLAP: An active discount already covers vehicle model(s) [${overlapping.join(", ")}] for the same pickup location and overlapping date range.`,
      );
    }
  }

  const updatePayload: Partial<Discount> & { updatedAt: Date } = { updatedAt: new Date() };
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.discountType !== undefined) updatePayload.discountType = data.discountType;
  if (data.value !== undefined) updatePayload.value = String(data.value);
  if (data.startDate !== undefined) updatePayload.startDate = data.startDate;
  if (data.endDate !== undefined) updatePayload.endDate = data.endDate;
  if (data.pickupLocationId !== undefined) updatePayload.pickupLocationId = data.pickupLocationId;
  if (data.isActive !== undefined) updatePayload.isActive = data.isActive;

  await db
    .update(discountTable)
    .set(updatePayload)
    .where(eq(discountTable.id, id));

  if (data.vehicleModelIds !== undefined) {
    await db
      .delete(discountVehicleModelTable)
      .where(eq(discountVehicleModelTable.discountId, id));

    if (vehicleModelIds.length > 0) {
      await db.insert(discountVehicleModelTable).values(
        vehicleModelIds.map((vmId) => ({ discountId: id, vehicleModelId: vmId })),
      );
    }
  }

  return getAdminDiscount(id);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteAdminDiscount(id: number) {
  const [row] = await db
    .delete(discountTable)
    .where(eq(discountTable.id, id))
    .returning({ id: discountTable.id });

  if (!row) throw new NotFoundError(`Discount ${id} not found`);
  return { message: "Discount deleted" };
}

