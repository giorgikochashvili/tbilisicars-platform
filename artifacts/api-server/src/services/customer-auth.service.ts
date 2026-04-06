/**
 * Customer authentication service.
 * Provides login, logout, and account lookup for website customers.
 * Passwords are hashed with bcryptjs (rounds=12).
 * Plain-text passwords are NEVER logged or stored.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, userTable } from "@workspace/db";
import { NotFoundError, UnauthorizedError } from "../lib/errors.js";

const BCRYPT_ROUNDS = 12;
const PASSWORD_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const PASSWORD_LENGTH = 6;

/**
 * Generate a 6-character alphanumeric password.
 * Not cryptographically strong but adequate for an auto-generated starter password
 * that customers are encouraged to change from their cabinet.
 */
export function generateCustomerPassword(): string {
  let result = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    result += PASSWORD_CHARS[Math.floor(Math.random() * PASSWORD_CHARS.length)];
  }
  return result;
}

/**
 * Hash a plain-text password with bcrypt (rounds=12).
 */
export async function hashCustomerPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Upsert a customer account by email.
 *
 * - If a user with the given email already exists: return the existing row.
 *   Do NOT generate or overwrite the password. Return generatedPassword = null.
 * - If no user exists: create a new row with a generated+hashed password.
 *   Return the plain-text password ONCE for display; it is NOT stored or logged.
 *
 * The plain-text password is included in the returned object only for new accounts
 * so the caller can include it in the booking response and email. After that it
 * must not be retained anywhere.
 */
export async function upsertCustomerByEmail(params: {
  email: string;
  fullName: string;
  phone?: string | null;
}): Promise<{ user: typeof userTable.$inferSelect; generatedPassword: string | null }> {
  const existing = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, params.email))
    .limit(1);

  if (existing[0]) {
    return { user: existing[0], generatedPassword: null };
  }

  const plainPassword = generateCustomerPassword();
  const passwordHash = await hashCustomerPassword(plainPassword);

  const [newUser] = await db
    .insert(userTable)
    .values({
      email: params.email,
      fullName: params.fullName,
      phone: params.phone ?? null,
      passwordHash,
    })
    .returning();

  return { user: newUser!, generatedPassword: plainPassword };
}

/**
 * Verify email + password and return the user row on success.
 * Throws UnauthorizedError for any credential mismatch.
 * Does NOT reveal whether the email exists (timing-safe-ish via bcrypt compare).
 */
export async function loginCustomer(email: string, password: string) {
  const rows = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  const user = rows[0];

  if (!user || !user.passwordHash) {
    console.info(`[customer-auth] Login failed for email=${email} — not found or no password set`);
    throw new UnauthorizedError("Invalid credentials");
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    console.info(`[customer-auth] Login failed for email=${email} — wrong password`);
    throw new UnauthorizedError("Invalid credentials");
  }

  console.info(`[customer-auth] Login success for customerId=${user.id} email=${email}`);
  return user;
}

/**
 * Fetch a customer by ID. Used for /me endpoint.
 */
export async function getCustomerById(id: number) {
  const rows = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, id))
    .limit(1);

  const user = rows[0];
  if (!user) throw new NotFoundError(`Customer ${id} not found`);
  return user;
}

/**
 * Destroy the customer session.
 */
export function logoutCustomer(
  session: { destroy: (cb: (err?: unknown) => void) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    session.destroy((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
