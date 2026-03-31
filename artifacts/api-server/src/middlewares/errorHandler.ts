import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
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

  if (err instanceof ZodError) {
    console.error("[zod validation error]", safeStringify(err), err.issues);
    res.status(400).json({ error: "Invalid request parameters" });
    return;
  }

  const cause = (err as any)?.cause;
  console.error(
    "[unhandled error]",
    safeStringify(err),
    err instanceof Error ? err.stack : "",
    cause ? `cause: ${safeStringify(cause)}` : "",
  );
  res.status(500).json({ error: "Internal server error" });
}
