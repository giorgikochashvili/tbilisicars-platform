import type { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db, adminsTable } from "@workspace/db";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

export function requirePermission(permissionKey: keyof typeof adminsTable.$inferSelect) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.adminId) {
      throw new UnauthorizedError();
    }

    const rows = await db
      .select()
      .from(adminsTable)
      .where(
        and(
          eq(adminsTable.id, req.session.adminId),
          eq(adminsTable.isActive, true),
        ),
      )
      .limit(1);

    const admin = rows[0];
    if (!admin) {
      throw new ForbiddenError();
    }

    const value = admin[permissionKey as keyof typeof admin];
    if (value !== true) {
      throw new ForbiddenError(`Permission denied: ${permissionKey} is required`);
    }

    next();
  };
}
