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
