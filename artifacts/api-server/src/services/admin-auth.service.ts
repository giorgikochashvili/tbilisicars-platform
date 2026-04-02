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
    console.info(`[auth] Login failed for email=${email} — not found or inactive`);
    throw new UnauthorizedError("Invalid credentials");
  }

  const passwordMatch = await bcrypt.compare(password, admin.hashedPassword);
  if (!passwordMatch) {
    console.info(`[auth] Login failed for email=${email} — wrong password`);
    throw new UnauthorizedError("Invalid credentials");
  }

  console.info(`[auth] Login success for adminId=${admin.id} email=${email}`);
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

export function logoutAdmin(
  session: { destroy: (cb: (err?: unknown) => void) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    session.destroy((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
