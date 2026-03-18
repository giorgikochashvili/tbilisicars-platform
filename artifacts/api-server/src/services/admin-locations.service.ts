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

export async function createAdminLocation(data: {
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  locationType?: "meet_and_greet" | "rental_office";
  isActive?: boolean;
}) {
  const [row] = await db.insert(locationTable).values(data as any).returning();
  return row!;
}

export async function updateAdminLocation(
  id: number,
  data: Partial<{
    name: string;
    address: string | null;
    city: string | null;
    country: string | null;
    latitude: string | null;
    longitude: string | null;
    locationType: "meet_and_greet" | "rental_office";
    isActive: boolean;
  }>,
) {
  const [row] = await db
    .update(locationTable)
    .set({ ...(data as any), updatedAt: new Date() })
    .where(eq(locationTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Location ${id} not found`);
  return row;
}

export async function deleteAdminLocation(id: number) {
  const [row] = await db
    .delete(locationTable)
    .where(eq(locationTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Location ${id} not found`);
  return { message: "Location deleted" };
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
