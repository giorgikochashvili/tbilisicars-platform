/**
 * Unit tests for createInternalRbgErrorBoundary() middleware factory.
 *
 * Uses lightweight mock req/res/next objects — no HTTP server needed.
 * Verifies:
 *   - entity.too.large → 413 PAYLOAD_TOO_LARGE
 *   - encoding.unsupported → 415 UNSUPPORTED_MEDIA_TYPE
 *   - everything else → 500 INTERNAL_ERROR
 *   - x-rbg-request-id header set before invocation is preserved
 *   - next() is never called with an error
 *   - no stack traces / raw error details in response body
 *   - headers-already-sent guard: calls next() without args, does not json()
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";

import { createInternalRbgErrorBoundary } from "../../middlewares/internal-rbg-error-boundary.js";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type MockRes = {
  _status:       number;
  _body:         unknown;
  _ended:        boolean;
  _headers:      Record<string, string>;
  headersSent:   boolean;
  setHeader(name: string, value: string): MockRes;
  getHeader(name: string): string | undefined;
  status(code: number): MockRes;
  json(body: unknown): MockRes;
};

function makeMockRes(opts: {
  presetHeaders?: Record<string, string>;
  headersSent?:   boolean;
} = {}): MockRes {
  const headers: Record<string, string> = { ...(opts.presetHeaders ?? {}) };
  const mock: MockRes = {
    _status:     200,
    _body:       undefined,
    _ended:      false,
    _headers:    headers,
    headersSent: opts.headersSent ?? false,
    setHeader(name, value) { headers[name.toLowerCase()] = value; return mock; },
    getHeader(name)        { return headers[name.toLowerCase()]; },
    status(code)           { mock._status = code; return mock; },
    json(body)             { mock._body = body; mock._ended = true; return mock; },
  };
  return mock;
}

type NextArgs = { calledWith: unknown[] };

function makeNext(): { fn: NextFunction; calls: NextArgs } {
  const calls: NextArgs = { calledWith: [] };
  const fn: NextFunction = (...args: unknown[]) => {
    calls.calledWith.push(args[0]);
  };
  return { fn, calls };
}

function makeErr(type: string, extra?: Record<string, unknown>): Error {
  const err = Object.assign(new Error("test error"), { type, ...extra });
  return err;
}

function runBoundary(
  err: unknown,
  resOpts: Parameters<typeof makeMockRes>[0] = {},
): { res: MockRes; next: NextArgs } {
  const boundary = createInternalRbgErrorBoundary();
  const res      = makeMockRes(resOpts);
  const { fn: nextFn, calls } = makeNext();
  boundary(
    err,
    {} as Request,
    res as unknown as Response,
    nextFn,
  );
  return { res, next: calls };
}

// ─── Body-size overflow ───────────────────────────────────────────────────────

test("boundary: entity.too.large → 413 PAYLOAD_TOO_LARGE", () => {
  const { res, next } = runBoundary(makeErr("entity.too.large"));
  assert.strictEqual(res._status, 413);
  assert.deepStrictEqual(res._body, { error: "PAYLOAD_TOO_LARGE" });
  assert.strictEqual(next.calledWith.length, 0, "next() must not be called");
});

// ─── Encoding errors ──────────────────────────────────────────────────────────

test("boundary: encoding.unsupported → 415 UNSUPPORTED_MEDIA_TYPE", () => {
  const { res, next } = runBoundary(makeErr("encoding.unsupported"));
  assert.strictEqual(res._status, 415);
  assert.deepStrictEqual(res._body, { error: "UNSUPPORTED_MEDIA_TYPE" });
  assert.strictEqual(next.calledWith.length, 0);
});

// ─── All other errors → 500 ───────────────────────────────────────────────────

test("boundary: generic Error → 500 INTERNAL_ERROR", () => {
  const { res } = runBoundary(new Error("unexpected boom"));
  assert.strictEqual(res._status, 500);
  assert.deepStrictEqual(res._body, { error: "INTERNAL_ERROR" });
});

test("boundary: SyntaxError from handler → 500 (not 400)", () => {
  const err = new SyntaxError("JSON parse failed inside handler");
  const { res } = runBoundary(err);
  assert.strictEqual(res._status, 500);
  assert.deepStrictEqual(res._body, { error: "INTERNAL_ERROR" });
});

test("boundary: TypeError from handler → 500 (not 400)", () => {
  const err = new TypeError("Cannot read properties of null");
  const { res } = runBoundary(err);
  assert.strictEqual(res._status, 500);
  assert.deepStrictEqual(res._body, { error: "INTERNAL_ERROR" });
});

test("boundary: null error → 500 INTERNAL_ERROR", () => {
  const { res } = runBoundary(null);
  assert.strictEqual(res._status, 500);
  assert.deepStrictEqual(res._body, { error: "INTERNAL_ERROR" });
});

test("boundary: string error → 500 INTERNAL_ERROR", () => {
  const { res } = runBoundary("something went wrong");
  assert.strictEqual(res._status, 500);
  assert.deepStrictEqual(res._body, { error: "INTERNAL_ERROR" });
});

// ─── Stack traces never leaked ────────────────────────────────────────────────

test("boundary: response body contains no stack trace", () => {
  const err = new Error("boom");
  err.stack = "Error: boom\n    at doThing (/app/src/routes/router.ts:42:7)";
  const { res } = runBoundary(err);
  const bodyStr = JSON.stringify(res._body);
  assert.ok(!bodyStr.includes("stack"), "body must not include 'stack'");
  assert.ok(!bodyStr.includes("router.ts"), "body must not include file paths");
  assert.ok(!bodyStr.includes("boom"), "body must not include error message");
});

// ─── Correlation header preserved ────────────────────────────────────────────

test("boundary: x-rbg-request-id header set before is preserved on 413", () => {
  const correlationId = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";
  const { res } = runBoundary(makeErr("entity.too.large"), {
    presetHeaders: { "x-rbg-request-id": correlationId },
  });
  assert.strictEqual(res._headers["x-rbg-request-id"], correlationId);
});

test("boundary: x-rbg-request-id header set before is preserved on 500", () => {
  const correlationId = "11112222-3333-4444-5555-666677778888";
  const { res } = runBoundary(new Error("handler crashed"), {
    presetHeaders: { "x-rbg-request-id": correlationId },
  });
  assert.strictEqual(res._headers["x-rbg-request-id"], correlationId);
});

// ─── next() is never called with an error ────────────────────────────────────

test("boundary: next() is never called with an error argument", () => {
  const { next } = runBoundary(new Error("boom"));
  const withErrorArgs = next.calledWith.filter((a) => a instanceof Error);
  assert.strictEqual(withErrorArgs.length, 0, "next(err) must never be called");
});

// ─── headers-already-sent guard ──────────────────────────────────────────────

test("boundary: headersSent=true → calls next() without args, does not call json()", () => {
  const { res, next } = runBoundary(new Error("late error"), {
    headersSent: true,
  });
  assert.ok(!res._ended, "res.json() must not be called when headers already sent");
  assert.strictEqual(next.calledWith.length, 1, "next() must be called once");
  assert.strictEqual(next.calledWith[0], undefined, "next() must be called without args");
});
