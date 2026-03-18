import type { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db, adminsTable } from "@workspace/db";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.session.userId) {
    throw new UnauthorizedError();
  }

  const rows = await db
    .select({ id: adminsTable.id })
    .from(adminsTable)
    .where(
      and(
        eq(adminsTable.email, req.session.userId),
        eq(adminsTable.isActive, true),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new ForbiddenError();
  }

  next();
}
