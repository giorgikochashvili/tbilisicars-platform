import { db, locationTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export async function listLocations() {
  return db
    .select()
    .from(locationTable)
    .where(eq(locationTable.isActive, true))
    .orderBy(locationTable.name);
}

export async function getLocation(id: number) {
  const rows = await db
    .select()
    .from(locationTable)
    .where(eq(locationTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Location ${id} not found`);
  return row;
}
