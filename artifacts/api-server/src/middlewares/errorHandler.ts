import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";

function safeStringify(err: unknown): string {
  try {
    if (err instanceof Error) {
      return `${err.name}: ${err.message}`;
    }
    return String(err);
  } catch {
    return "[unable to stringify error]";
  }
}

function isZodError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "ZodError" || err.constructor?.name === "ZodError")
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (isZodError(err)) {
    console.error("[zod validation error]", safeStringify(err), (err as any).errors ?? "");
    res.status(400).json({ error: "Invalid request parameters" });
    return;
  }

  console.error("[unhandled error]", safeStringify(err));
  res.status(500).json({ error: "Internal server error" });
}
