import { db, pool } from "@workspace/db";
import { discountTable, discountVehicleModelTable, discountPickupLocationTable } from "@workspace/db";
import type { Discount } from "@workspace/db";
import { eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

// Shape returned by getAdminDiscount (raw pool query)
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
  pickupLocations: Array<{ locationId: number; locationName: string | null; locationCity: string | null }>;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DiscountCreateData {
  name: string;
  discountType: "PERCENT" | "FIXED";
  value: number;
  startDate: string;
  endDate: string;
  pickupLocationIds: number[];
  isActive?: boolean;
  vehicleModelIds: number[];
}

export interface DiscountUpdateData {
  name?: string;
  discountType?: "PERCENT" | "FIXED";
  value?: number;
  startDate?: string;
  endDate?: string;
  pickupLocationIds?: number[];
  isActive?: boolean;
  vehicleModelIds?: number[];
}

// ─── Overlap check ────────────────────────────────────────────────────────────
/**
 * Returns list of vehicle model IDs that already have an active discount
 * for ANY of the given pickup locations that overlaps the given date range.
 * Excludes the given discountId (for updates).
 */
async function findOverlappingModels(
  pickupLocationIds: number[],
  startDate: string,
  endDate: string,
  vehicleModelIds: number[],
  excludeDiscountId?: number,
): Promise<number[]> {
  if (vehicleModelIds.length === 0 || pickupLocationIds.length === 0) return [];

  const params: unknown[] = [pickupLocationIds, startDate, endDate, vehicleModelIds];
  const excludeClause =
    excludeDiscountId != null
      ? ` AND d.id != $${params.push(excludeDiscountId)}`
      : "";

  const { rows } = await pool.query<{ vehicle_model_id: number }>(
    `SELECT DISTINCT dvm.vehicle_model_id
     FROM website_discount d
     JOIN website_discount_pickup_location dpl ON dpl.discount_id = d.id
     JOIN website_discount_vehicle_model dvm ON dvm.discount_id = d.id
     WHERE dpl.location_id = ANY($1)
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
      d.start_date::text AS "startDate",
      d.end_date::text AS "endDate",
      d.pickup_location_id AS "pickupLocationId",
      l.name AS "pickupLocationName",
      l.city AS "pickupLocationCity",
      d.is_active AS "isActive",
      d.created_at::text AS "createdAt",
      d.updated_at::text AS "updatedAt",
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'vehicleModelId', dvm.vehicle_model_id,
              'modelName', COALESCE(vm.name, ''),
              'brandName', COALESCE(br.name, '')
            ) ORDER BY br.name, vm.name
          ) FILTER (WHERE dvm.vehicle_model_id IS NOT NULL),
          '[]'
        )
        FROM website_discount_vehicle_model dvm
        LEFT JOIN vehicle_model vm ON vm.id = dvm.vehicle_model_id
        LEFT JOIN brand br ON br.id = vm.brand_id
        WHERE dvm.discount_id = d.id
      ) AS "vehicleModels",
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'locationId', dpl.location_id,
              'locationName', loc.name,
              'locationCity', loc.city
            ) ORDER BY loc.name
          ) FILTER (WHERE dpl.location_id IS NOT NULL),
          '[]'
        )
        FROM website_discount_pickup_location dpl
        LEFT JOIN location loc ON loc.id = dpl.location_id
        WHERE dpl.discount_id = d.id
      ) AS "pickupLocations"
    FROM website_discount d
    LEFT JOIN location l ON l.id = d.pickup_location_id
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
      d.start_date::text AS "startDate",
      d.end_date::text AS "endDate",
      d.pickup_location_id AS "pickupLocationId",
      l.name AS "pickupLocationName",
      l.city AS "pickupLocationCity",
      d.is_active AS "isActive",
      d.created_at::text AS "createdAt",
      d.updated_at::text AS "updatedAt",
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'vehicleModelId', dvm.vehicle_model_id,
              'modelName', COALESCE(vm.name, ''),
              'brandName', COALESCE(br.name, '')
            ) ORDER BY br.name, vm.name
          ) FILTER (WHERE dvm.vehicle_model_id IS NOT NULL),
          '[]'
        )
        FROM website_discount_vehicle_model dvm
        LEFT JOIN vehicle_model vm ON vm.id = dvm.vehicle_model_id
        LEFT JOIN brand br ON br.id = vm.brand_id
        WHERE dvm.discount_id = d.id
      ) AS "vehicleModels",
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'locationId', dpl.location_id,
              'locationName', loc.name,
              'locationCity', loc.city
            ) ORDER BY loc.name
          ) FILTER (WHERE dpl.location_id IS NOT NULL),
          '[]'
        )
        FROM website_discount_pickup_location dpl
        LEFT JOIN location loc ON loc.id = dpl.location_id
        WHERE dpl.discount_id = d.id
      ) AS "pickupLocations"
    FROM website_discount d
    LEFT JOIN location l ON l.id = d.pickup_location_id
    WHERE d.id = $1
  `, [id]);

  if (!rows[0]) throw new NotFoundError(`Discount ${id} not found`);
  return rows[0];
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createAdminDiscount(data: DiscountCreateData) {
  const {
    name, discountType, value, startDate, endDate,
    pickupLocationIds, isActive = true, vehicleModelIds,
  } = data;

  if (!vehicleModelIds || vehicleModelIds.length === 0) {
    throw new Error("VALIDATION: At least one vehicle model must be selected.");
  }
  if (!pickupLocationIds || pickupLocationIds.length === 0) {
    throw new Error("VALIDATION: At least one pickup location must be selected.");
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
      pickupLocationIds, startDate, endDate, vehicleModelIds,
    );
    if (overlapping.length > 0) {
      throw new Error(
        `OVERLAP: An active discount already covers vehicle model(s) [${overlapping.join(", ")}] for overlapping pickup location(s) and date range.`,
      );
    }
  }

  // Use the first selected location as the "primary" location for the legacy column.
  const primaryLocationId = pickupLocationIds[0]!;

  const [discount] = await db
    .insert(discountTable)
    .values({
      name,
      discountType,
      value: String(value),
      startDate,
      endDate,
      pickupLocationId: primaryLocationId,
      isActive,
    })
    .returning();

  await db.insert(discountVehicleModelTable).values(
    vehicleModelIds.map((vmId) => ({
      discountId: discount!.id,
      vehicleModelId: vmId,
    })),
  );

  await db.insert(discountPickupLocationTable).values(
    pickupLocationIds.map((locId) => ({
      discountId: discount!.id,
      locationId: locId,
    })),
  );

  return getAdminDiscount(discount!.id);
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateAdminDiscount(id: number, data: DiscountUpdateData) {
  const existing = await getAdminDiscount(id) as ExistingDiscountRow;

  const discountType = data.discountType ?? existing.discountType;
  const value = data.value ?? Number(existing.value);
  const startDate = data.startDate ?? existing.startDate;
  const endDate = data.endDate ?? existing.endDate;
  const isActive = data.isActive !== undefined ? data.isActive : existing.isActive;

  const pickupLocationIds = data.pickupLocationIds ??
    existing.pickupLocations.map((p) => p.locationId);

  const vehicleModelIds = data.vehicleModelIds ??
    existing.vehicleModels.map((m) => m.vehicleModelId);

  if (vehicleModelIds.length === 0) {
    throw new Error("VALIDATION: At least one vehicle model must be selected.");
  }
  if (pickupLocationIds.length === 0) {
    throw new Error("VALIDATION: At least one pickup location must be selected.");
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
      pickupLocationIds, startDate, endDate, vehicleModelIds, id,
    );
    if (overlapping.length > 0) {
      throw new Error(
        `OVERLAP: An active discount already covers vehicle model(s) [${overlapping.join(", ")}] for overlapping pickup location(s) and date range.`,
      );
    }
  }

  const primaryLocationId = pickupLocationIds[0]!;

  const updatePayload: Partial<Discount> & { updatedAt: Date } = { updatedAt: new Date() };
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.discountType !== undefined) updatePayload.discountType = data.discountType;
  if (data.value !== undefined) updatePayload.value = String(data.value);
  if (data.startDate !== undefined) updatePayload.startDate = data.startDate;
  if (data.endDate !== undefined) updatePayload.endDate = data.endDate;
  if (data.pickupLocationIds !== undefined) updatePayload.pickupLocationId = primaryLocationId;
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

  if (data.pickupLocationIds !== undefined) {
    await db
      .delete(discountPickupLocationTable)
      .where(eq(discountPickupLocationTable.discountId, id));

    await db.insert(discountPickupLocationTable).values(
      pickupLocationIds.map((locId) => ({ discountId: id, locationId: locId })),
    );
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
