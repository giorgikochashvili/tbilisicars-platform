import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../lib/errors.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    isAdmin?: boolean;
  }
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.session.userId) {
    throw new UnauthorizedError();
  }
  next();
}
