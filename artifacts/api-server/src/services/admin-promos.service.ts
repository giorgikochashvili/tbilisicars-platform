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
