import type { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db, adminsTable } from "@workspace/db";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.session.adminId) {
    throw new UnauthorizedError();
  }

  const rows = await db
    .select({ id: adminsTable.id })
    .from(adminsTable)
    .where(
      and(
        eq(adminsTable.id, req.session.adminId),
        eq(adminsTable.isActive, true),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new ForbiddenError();
  }

  next();
}
