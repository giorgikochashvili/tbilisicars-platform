import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../lib/errors.js";

export async function requireCustomer(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.session.customerId) {
    throw new UnauthorizedError();
  }
  next();
}
