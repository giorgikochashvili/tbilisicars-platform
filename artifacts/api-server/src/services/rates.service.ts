import { db, rateTable, ratetierTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export async function listRates() {
  const rates = await db
    .select()
    .from(rateTable)
    .where(eq(rateTable.isActive, true))
    .orderBy(rateTable.name);

  const tiers = await db.select().from(ratetierTable);

  return rates.map((rate) => ({
    ...rate,
    tiers: tiers.filter((tier) => tier.rateId === rate.id),
  }));
}

export async function getRate(id: number) {
  const rows = await db
    .select()
    .from(rateTable)
    .where(eq(rateTable.id, id));
  const rate = rows[0];
  if (!rate) throw new NotFoundError(`Rate ${id} not found`);

  const tiers = await db
    .select()
    .from(ratetierTable)
    .where(eq(ratetierTable.rateId, id));

  return { ...rate, tiers };
}
