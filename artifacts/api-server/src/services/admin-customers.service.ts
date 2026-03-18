import { db, userTable } from "@workspace/db";
import { asc, count, eq, ilike, or } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export async function listAdminCustomers(
  search?: string,
  page: number = 1,
  limit: number = 20,
) {
  const where = search
    ? or(
        ilike(userTable.fullName, `%${search}%`),
        ilike(userTable.email, `%${search}%`),
        ilike(userTable.phone, `%${search}%`),
      )
    : undefined;

  const offset = (page - 1) * limit;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(userTable)
      .where(where)
      .orderBy(asc(userTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(userTable).where(where),
  ]);

  return {
    data: rows,
    meta: {
      page,
      limit,
      total: totalRows[0]?.total ?? 0,
    },
  };
}

export async function getAdminCustomer(id: number) {
  const rows = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  return row;
}

export async function createAdminCustomer(data: {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  documentExpiry?: string | null;
  notes?: string | null;
}) {
  const [row] = await db
    .insert(userTable)
    .values(data as any)
    .returning();
  return row!;
}

export async function updateAdminCustomer(
  id: number,
  data: Partial<{
    email: string | null;
    phone: string | null;
    fullName: string | null;
    dateOfBirth: string | null;
    nationality: string | null;
    documentType: string | null;
    documentNumber: string | null;
    documentExpiry: string | null;
    notes: string | null;
  }>,
) {
  const [row] = await db
    .update(userTable)
    .set({ ...(data as any), updatedAt: new Date() })
    .where(eq(userTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  return row;
}

export async function deleteAdminCustomer(id: number) {
  const [row] = await db
    .delete(userTable)
    .where(eq(userTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Customer ${id} not found`);
  return { message: "Customer deleted" };
}

export async function findOrCreateCustomer(data: {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
}) {
  if (data.email) {
    const existing = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, data.email))
      .limit(1);
    if (existing[0]) return existing[0];
  }
  const [row] = await db
    .insert(userTable)
    .values(data as any)
    .returning();
  return row!;
}
