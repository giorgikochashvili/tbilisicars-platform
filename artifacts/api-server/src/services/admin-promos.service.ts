import { db, promoTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export async function listAllPromos() {
  return db.select().from(promoTable).orderBy(desc(promoTable.id));
}

export async function getAdminPromo(id: number) {
  const rows = await db
    .select()
    .from(promoTable)
    .where(eq(promoTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Promo ${id} not found`);
  return row;
}

export async function createAdminPromo(data: {
  code: string;
  description?: string | null;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minRentalDays?: number | null;
  maxUses?: number | null;
  timesUsed?: number;
  validFrom: string;
  validUntil: string;
  isActive?: boolean;
}) {
  const [row] = await db.insert(promoTable).values(data as any).returning();
  return row!;
}

export async function updateAdminPromo(
  id: number,
  data: Partial<{
    code: string;
    description: string | null;
    discountType: "percentage" | "fixed";
    discountValue: string;
    minRentalDays: number | null;
    maxUses: number | null;
    timesUsed: number;
    validFrom: string;
    validUntil: string;
    isActive: boolean;
  }>,
) {
  const [row] = await db
    .update(promoTable)
    .set({ ...(data as any), updatedAt: new Date() })
    .where(eq(promoTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Promo ${id} not found`);
  return row;
}

export async function deleteAdminPromo(id: number) {
  const [row] = await db
    .delete(promoTable)
    .where(eq(promoTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Promo ${id} not found`);
  return { message: "Promo deleted" };
}
