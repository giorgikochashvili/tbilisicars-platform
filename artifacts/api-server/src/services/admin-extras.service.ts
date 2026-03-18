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
