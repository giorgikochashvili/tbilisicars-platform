import { db, rateTable, ratetierTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export async function listAllRates() {
  return db.select().from(rateTable).orderBy(asc(rateTable.name));
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
