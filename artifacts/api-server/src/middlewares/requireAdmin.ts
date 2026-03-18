import type { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.session.userId) {
    throw new UnauthorizedError();
  }
  if (!req.session.isAdmin) {
    throw new ForbiddenError();
  }
  next();
}
