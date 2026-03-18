import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, adminsTable } from "@workspace/db";
import { NotFoundError, UnauthorizedError } from "../lib/errors.js";

export async function loginAdmin(email: string, password: string) {
  const rows = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.email, email))
    .limit(1);

  const admin = rows[0];

  if (!admin || !admin.isActive) {
    throw new UnauthorizedError("Invalid credentials");
  }

  const passwordMatch = await bcrypt.compare(password, admin.hashedPassword);
  if (!passwordMatch) {
    throw new UnauthorizedError("Invalid credentials");
  }

  return admin;
}

export async function getAdminById(id: number) {
  const rows = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.id, id))
    .limit(1);

  const admin = rows[0];
  if (!admin) throw new NotFoundError(`Admin ${id} not found`);
  return admin;
}
