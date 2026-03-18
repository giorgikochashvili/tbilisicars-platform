import { db, locationTable, oneWayFeesTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export async function listAllLocations() {
  return db.select().from(locationTable).orderBy(asc(locationTable.name));
}

export async function getAdminLocation(id: number) {
  const rows = await db
    .select()
    .from(locationTable)
    .where(eq(locationTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Location ${id} not found`);
  return row;
}

export async function listOneWayFees() {
  return db
    .select()
    .from(oneWayFeesTable)
    .orderBy(
      asc(oneWayFeesTable.fromLocationId),
      asc(oneWayFeesTable.toLocationId),
    );
}
