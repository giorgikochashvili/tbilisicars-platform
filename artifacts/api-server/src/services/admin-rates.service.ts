import { db, pool, rateTable, ratetierTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "../lib/errors.js";

export async function listAllRates() {
  const rates = await db.select().from(rateTable).orderBy(asc(rateTable.name));
  const tiers = await db.select().from(ratetierTable).orderBy(asc(ratetierTable.fromDays));
  return rates.map((rate) => ({
    ...rate,
    tiers: tiers.filter((t) => t.rateId === rate.id),
  }));
}

export async function getAdminRate(id: number) {
  const rows = await db
    .select()
    .from(rateTable)
    .where(eq(rateTable.id, id));
  const rate = rows[0];
  if (!rate) throw new NotFoundError(`Rate ${id} not found`);

  const tiers = await db
    .select()
    .from(ratetierTable)
    .where(eq(ratetierTable.rateId, id))
    .orderBy(asc(ratetierTable.fromDays));

  return { ...rate, tiers };
}

export async function createAdminRate(data: {
  name: string;
  description?: string | null;
  parentRateId?: number | null;
  rateType?: string | null;
  incrementType?: string | null;
  incrementValue?: string | null;
  validFrom: string;
  validUntil: string;
  minDays?: number | null;
  maxDays?: number | null;
  unlimitedKm?: boolean | null;
  editableBy?: string | null;
  isActive?: boolean | null;
}) {
  const [row] = await db.insert(rateTable).values(data as any).returning();
  return getAdminRate(row!.id);
}

export async function updateAdminRate(
  id: number,
  data: Partial<{
    name: string;
    description: string | null;
    parentRateId: number | null;
    rateType: string | null;
    incrementType: string | null;
    incrementValue: string | null;
    validFrom: string;
    validUntil: string;
    minDays: number | null;
    maxDays: number | null;
    unlimitedKm: boolean | null;
    editableBy: string | null;
    isActive: boolean | null;
  }>,
) {
  const [row] = await db
    .update(rateTable)
    .set({ ...(data as any), updatedAt: new Date() })
    .where(eq(rateTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Rate ${id} not found`);
  return getAdminRate(id);
}

export async function deleteAdminRate(id: number) {
  const [row] = await db
    .delete(rateTable)
    .where(eq(rateTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Rate ${id} not found`);
  return { message: "Rate deleted" };
}

export async function createAdminRateTier(
  rateId: number,
  data: {
    vehicleModelId: number;
    fromDays?: number | null;
    toDays?: number | null;
    pricePerDay: string;
    currency?: string | null;
  },
) {
  // Verify rate exists and get its metadata for overlap validation
  const currentRate = await getAdminRate(rateId);

  // Tier-level WEB overlap validation:
  // Reject if another WEB rate already has a tier for the same vehicle model
  // with overlapping date coverage — unless the conflict is with our own parent
  // or a sibling child (same parentRateId).
  const isWebRate =
    currentRate.rateType === "web" || currentRate.rateType == null;
  if (isWebRate) {
    const { rows: conflicts } = await pool.query(
      `SELECT r2.id AS conflicting_rate_id, r2.name AS conflicting_rate_name,
              r2.parent_rate_id AS conflicting_parent_rate_id
       FROM ratetier rt2
       JOIN rate r2 ON r2.id = rt2.rate_id
       WHERE rt2.vehicle_model_id = $1
         AND rt2.rate_id != $2
         AND (r2.rate_type = 'web' OR r2.rate_type IS NULL)
         AND r2.is_active = true
         AND r2.valid_from::date <= $3::date
         AND r2.valid_until::date >= $4::date`,
      [
        data.vehicleModelId,
        rateId,
        currentRate.validUntil,
        currentRate.validFrom,
      ],
    );

    for (const conflict of conflicts as Array<{
      conflicting_rate_id: number;
      conflicting_rate_name: string;
      conflicting_parent_rate_id: number | null;
    }>) {
      const conflictId = conflict.conflicting_rate_id;
      const conflictParentId = conflict.conflicting_parent_rate_id;

      // Allow: conflicting rate is the direct parent of the current rate
      if (currentRate.parentRateId != null && conflictId === currentRate.parentRateId) {
        continue;
      }
      // Allow: current rate is the direct parent of the conflicting rate
      if (conflictParentId === rateId) {
        continue;
      }
      // Allow: same-hierarchy siblings — both children of the same parent may share model coverage
      if (
        currentRate.parentRateId != null &&
        conflictParentId != null &&
        conflictParentId === currentRate.parentRateId
      ) {
        continue;
      }

      throw new ValidationError(
        `A WEB rate "${conflict.conflicting_rate_name}" already has pricing for this vehicle model covering the same date period (${currentRate.validFrom} – ${currentRate.validUntil}). Remove that tier or adjust the date range to avoid overlap.`,
      );
    }
  }

  const [row] = await db
    .insert(ratetierTable)
    .values({ ...data, rateId, currency: "EUR" } as any)
    .returning();
  return row!;
}

export async function updateAdminRateTier(
  rateId: number,
  tierId: number,
  data: Partial<{
    vehicleModelId: number;
    fromDays: number | null;
    toDays: number | null;
    pricePerDay: string;
    currency: string | null;
  }>,
) {
  const [row] = await db
    .update(ratetierTable)
    .set({ ...(data as any), currency: "EUR", updatedAt: new Date() })
    .where(eq(ratetierTable.id, tierId))
    .returning();
  if (!row) throw new NotFoundError(`Rate tier ${tierId} not found`);
  return row;
}

export async function deleteAdminRateTier(rateId: number, tierId: number) {
  const [row] = await db
    .delete(ratetierTable)
    .where(eq(ratetierTable.id, tierId))
    .returning();
  if (!row) throw new NotFoundError(`Rate tier ${tierId} not found`);
  return { message: "Rate tier deleted" };
}
