import { db, extraTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export async function listAllExtras() {
  return db.select().from(extraTable).orderBy(asc(extraTable.name));
}

export async function getAdminExtra(id: number) {
  const rows = await db
    .select()
    .from(extraTable)
    .where(eq(extraTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Extra ${id} not found`);
  return row;
}

export async function createAdminExtra(data: {
  name: string;
  description?: string | null;
  price: string;
  currency?: string;
  pricingType?: "per_day" | "per_trip";
  maxDays?: number | null;
  isActive?: boolean;
}) {
  const [row] = await db.insert(extraTable).values(data as any).returning();
  return row!;
}

export async function updateAdminExtra(
  id: number,
  data: Partial<{
    name: string;
    description: string | null;
    price: string;
    currency: string;
    pricingType: "per_day" | "per_trip";
    maxDays: number | null;
    isActive: boolean;
  }>,
) {
  const [row] = await db
    .update(extraTable)
    .set({ ...(data as any), updatedAt: new Date() })
    .where(eq(extraTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Extra ${id} not found`);
  return row;
}

export async function deleteAdminExtra(id: number) {
  const [row] = await db
    .delete(extraTable)
    .where(eq(extraTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Extra ${id} not found`);
  return { message: "Extra deleted" };
}
