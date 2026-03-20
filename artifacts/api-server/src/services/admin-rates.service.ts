import { db, rateTable, ratetierTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

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
  // Verify rate exists
  await getAdminRate(rateId);
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
