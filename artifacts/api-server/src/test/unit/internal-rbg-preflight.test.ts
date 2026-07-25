/**
 * Unit tests for createInternalRbgPreflight() middleware factory.
 *
 * Uses lightweight mock req/res/next objects — no HTTP server needed.
 * Asserts status code, response body, and that next() is called XOR
 * res.json() is called (never both, never neither).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";

import { createInternalRbgPreflight } from "../../middlewares/internal-rbg-preflight.js";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type MockReqOptions = {
  path?:    string;
  method?:  string;
  query?:   Record<string, string>;
  headers?: Record<string, string>;
};

function makeMockReq(opts: MockReqOptions = {}): Request {
  return {
    path:    opts.path    ?? "/",
    method:  opts.method  ?? "POST",
    query:   opts.query   ?? {},
    headers: opts.headers ?? { "content-type": "application/json" },
  } as unknown as Request;
}

type MockRes = {
  _status:  number;
  _body:    unknown;
  _ended:   boolean;
  status(code: number): MockRes;
  json(body: unknown): MockRes;
};

function makeMockRes(): MockRes {
  const mock: MockRes = {
    _status: 200,
    _body:   undefined,
    _ended:  false,
    status(code) { mock._status = code; return mock; },
    json(body)   { mock._body = body; mock._ended = true; return mock; },
  };
  return mock;
}

type Call = { nextCalled: boolean; res: MockRes };

function runPreflight(reqOpts: MockReqOptions): Call {
  const middleware = createInternalRbgPreflight();
  const req = makeMockReq(reqOpts);
  const res = makeMockRes();
  let nextCalled = false;
  const next: NextFunction = () => { nextCalled = true; };
  middleware(req, res as unknown as Response, next);
  return { nextCalled, res };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

test("preflight: valid POST / application/json → calls next()", () => {
  const { nextCalled, res } = runPreflight({});
  assert.ok(nextCalled, "expected next() to be called");
  assert.ok(!res._ended, "expected res.json() NOT to be called");
});

test("preflight: application/json; charset=utf-8 → calls next()", () => {
  const { nextCalled } = runPreflight({
    headers: { "content-type": "application/json; charset=utf-8" },
  });
  assert.ok(nextCalled);
});

test("preflight: application/json; charset=UTF-8 (uppercase) → calls next()", () => {
  const { nextCalled } = runPreflight({
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
  assert.ok(nextCalled);
});

test("preflight: Content-Encoding absent → calls next()", () => {
  const { nextCalled } = runPreflight({
    headers: { "content-type": "application/json" },
    // no content-encoding
  });
  assert.ok(nextCalled);
});

test("preflight: Content-Encoding: identity → calls next()", () => {
  const { nextCalled } = runPreflight({
    headers: {
      "content-type":     "application/json",
      "content-encoding": "identity",
    },
  });
  assert.ok(nextCalled);
});

// ─── Path check (step 1) ──────────────────────────────────────────────────────

test("preflight: path /extra → 404 NOT_FOUND", () => {
  const { res, nextCalled } = runPreflight({ path: "/extra" });
  assert.strictEqual(res._status, 404);
  assert.deepStrictEqual(res._body, { error: "NOT_FOUND" });
  assert.ok(!nextCalled);
});

test("preflight: path / (root) → not 404", () => {
  const { res } = runPreflight({ path: "/" });
  assert.notStrictEqual(res._status, 404);
});

// ─── Method check (step 2) ───────────────────────────────────────────────────

test("preflight: GET → 405 METHOD_NOT_ALLOWED", () => {
  const { res, nextCalled } = runPreflight({ method: "GET" });
  assert.strictEqual(res._status, 405);
  assert.deepStrictEqual(res._body, { error: "METHOD_NOT_ALLOWED" });
  assert.ok(!nextCalled);
});

test("preflight: PUT → 405 METHOD_NOT_ALLOWED", () => {
  const { res } = runPreflight({ method: "PUT" });
  assert.strictEqual(res._status, 405);
});

test("preflight: DELETE → 405 METHOD_NOT_ALLOWED", () => {
  const { res } = runPreflight({ method: "DELETE" });
  assert.strictEqual(res._status, 405);
});

// ─── Query string check (step 3) ─────────────────────────────────────────────

test("preflight: query string present → 400 INVALID_REQUEST", () => {
  const { res, nextCalled } = runPreflight({ query: { foo: "bar" } });
  assert.strictEqual(res._status, 400);
  assert.deepStrictEqual(res._body, { error: "INVALID_REQUEST" });
  assert.ok(!nextCalled);
});

// ─── Content-Type check (step 4) ─────────────────────────────────────────────

test("preflight: Content-Type absent → 415 UNSUPPORTED_MEDIA_TYPE", () => {
  const { res, nextCalled } = runPreflight({ headers: {} });
  assert.strictEqual(res._status, 415);
  assert.deepStrictEqual(res._body, { error: "UNSUPPORTED_MEDIA_TYPE" });
  assert.ok(!nextCalled);
});

test("preflight: Content-Type text/plain → 415 UNSUPPORTED_MEDIA_TYPE", () => {
  const { res } = runPreflight({
    headers: { "content-type": "text/plain" },
  });
  assert.strictEqual(res._status, 415);
});

test("preflight: Content-Type application/json; charset=utf-16 → 415", () => {
  const { res } = runPreflight({
    headers: { "content-type": "application/json; charset=utf-16" },
  });
  assert.strictEqual(res._status, 415);
});

test("preflight: Content-Type application/x-www-form-urlencoded → 415", () => {
  const { res } = runPreflight({
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  assert.strictEqual(res._status, 415);
});

// ─── Content-Encoding check (step 5) ─────────────────────────────────────────

test("preflight: Content-Encoding gzip → 415 UNSUPPORTED_MEDIA_TYPE", () => {
  const { res, nextCalled } = runPreflight({
    headers: {
      "content-type":     "application/json",
      "content-encoding": "gzip",
    },
  });
  assert.strictEqual(res._status, 415);
  assert.deepStrictEqual(res._body, { error: "UNSUPPORTED_MEDIA_TYPE" });
  assert.ok(!nextCalled);
});

test("preflight: Content-Encoding br → 415 UNSUPPORTED_MEDIA_TYPE", () => {
  const { res } = runPreflight({
    headers: {
      "content-type":     "application/json",
      "content-encoding": "br",
    },
  });
  assert.strictEqual(res._status, 415);
});

test("preflight: Content-Encoding deflate → 415 UNSUPPORTED_MEDIA_TYPE", () => {
  const { res } = runPreflight({
    headers: {
      "content-type":     "application/json",
      "content-encoding": "deflate",
    },
  });
  assert.strictEqual(res._status, 415);
});

// ─── Ordering: path precedes method ───────────────────────────────────────────

test("preflight: wrong path + wrong method → 404 (path checked first)", () => {
  const { res } = runPreflight({ path: "/foo", method: "GET" });
  assert.strictEqual(res._status, 404);
});
