/**
 * Ephemeral HTTP tests for createInternalRbgRouter().
 *
 * Each test uses a real Express app listening on a random port (0) so the
 * full Express middleware chain runs. No Supertest — only node:http `fetch`.
 *
 * A /control route with app-level express.json() proves the isolated router
 * does not affect the global JSON parser.
 *
 * Tests:
 *  1.  Feature disabled → 404 NOT_FOUND
 *  2.  Feature disabled → no clock/resolver/store/handler called
 *  3.  Feature disabled, GET method → still 404 (preflight runs before gate)
 *  4.  Valid signed request → 200 ok:true
 *  5.  No parse/re-serialize before HMAC (whitespace-changed body → 401)
 *  6.  HMAC body hash covers exact raw bytes (spaced body, correct sig → 200)
 *  7.  Wrong Content-Type → 415
 *  8.  Content-Encoding gzip → 415
 *  9.  Body at exactly 64 kb → 200
 *  10. Body 1 byte over 64 kb → 413
 *  11. Feature disabled, body 65537 bytes → 404 (body never read)
 *  12. Missing x-rbg-key-id header → 401
 *  13. Stale timestamp → 401
 *  14. Unknown key → 401
 *  15. resolveEnabledClient throws → 503
 *  16. Runtime secret missing → 401
 *  17. Invalid secret length → 503
 *  18. Invalid signature → 401
 *  19. Invalid UTF-8 body (after valid HMAC) → 400
 *  20. Invalid JSON body (after valid HMAC) → 400
 *  21. x-rbg-request-id always on 401 response
 *  22. x-rbg-request-id always on 503 response
 *  23. x-rbg-request-id always on 413 response
 *  24. Validated request ID promoted on success (echoed as correlation ID)
 *  25. Fallback UUID used before validation (malformed incoming ID not echoed)
 *  26. Authenticated handler error → 500 INTERNAL_ERROR
 *  27. Handler SyntaxError → 500 (not 400)
 *  28. Logger throw swallowed silently (no HTTP effect)
 *  29. GET → 405 (preflight, not router gate)
 *  30. /control route unaffected by internal router (express.json() still works)
 *  31. OPTIONS → 405 METHOD_NOT_ALLOWED (isolated evidence)
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";

import {
  createInternalRbgRouter,
  type CreateInternalRbgRouterDeps,
  type RegionalBrandCode,
} from "../../routes/internal-rbg-router.js";
import {
  createIntegrationSecretStore,
} from "../../lib/integration-secret-store.js";
import {
  hashRawBody,
  buildInternalHmacCanonicalString,
  computeInternalHmacSignature,
} from "../../lib/internal-hmac.js";

// ─── Test secret ──────────────────────────────────────────────────────────────

const TEST_KEY_ID      = "kc-test-v1";
const TEST_SECRET_BYTES = new Uint8Array(32).fill(0x01);
const TEST_SECRET_BASE64 = Buffer.from(TEST_SECRET_BYTES).toString("base64");
const TEST_BRAND: RegionalBrandCode = "kutaisicars" as RegionalBrandCode;

const testSecretStore = createIntegrationSecretStore([{
  keyId:         TEST_KEY_ID,
  secretBase64:  TEST_SECRET_BASE64,
}]);

// ─── Default deps factory ────────────────────────────────────────────────────

function makeTestDeps(
  overrides: Partial<CreateInternalRbgRouterDeps> = {},
): CreateInternalRbgRouterDeps {
  return {
    featureEnabled:       true,
    resolveEnabledClient: async (keyId) =>
      keyId === TEST_KEY_ID
        ? { found: true, brandCode: TEST_BRAND }
        : { found: false },
    secretStore:     testSecretStore,
    getNowSeconds:   () => Math.floor(Date.now() / 1000),
    authenticatedHandler: (_ctx, _req, res) => {
      res.status(200).json({ ok: true });
    },
    logger: { log: () => {} },
    ...overrides,
  };
}

// ─── Signing helper ───────────────────────────────────────────────────────────

function signBody(
  body:         Buffer,
  secretBytes:  Uint8Array = TEST_SECRET_BYTES,
  nowOverride?: number,
): { headers: Record<string, string>; requestId: string } {
  const ts        = String(nowOverride ?? Math.floor(Date.now() / 1000));
  const requestId = randomUUID();
  const bodyHash  = hashRawBody(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  const canonical = buildInternalHmacCanonicalString(
    TEST_KEY_ID, ts, requestId, bodyHash,
  );
  const signature = computeInternalHmacSignature(canonical, secretBytes);
  return {
    requestId,
    headers: {
      "content-type":    "application/json",
      "x-rbg-key-id":    TEST_KEY_ID,
      "x-rbg-timestamp": ts,
      "x-rbg-request-id": requestId,
      "x-rbg-signature": signature,
    },
  };
}

// ─── Server lifecycle helper ─────────────────────────────────────────────────

const ROUTE_PATH = "/api/internal/regional-brands/bookings";

async function withServer(
  deps: CreateInternalRbgRouterDeps,
  callback: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();

  // Mount the isolated router
  app.use(ROUTE_PATH, createInternalRbgRouter(deps));

  // Control route: proves global express.json() is unaffected
  app.use(express.json());
  app.post("/control", (req: express.Request, res: express.Response) => {
    res.json({ received: req.body });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr    = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await callback(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

// Convenience: POST to the intake route
async function postIntake(
  baseUrl: string,
  body:    Buffer | string | Uint8Array,
  headers: Record<string, string>,
): Promise<Response> {
  return fetch(`${baseUrl}${ROUTE_PATH}`, {
    method:  "POST",
    body,
    headers,
  });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

const VALID_BODY = Buffer.from(JSON.stringify({ event: "booking_requested" }));

describe("createInternalRbgRouter — HTTP integration", () => {

  // ── Test 1: feature disabled ────────────────────────────────────────────────
  test("1. Feature disabled → 404 NOT_FOUND", async () => {
    await withServer(makeTestDeps({ featureEnabled: false }), async (base) => {
      const { headers } = signBody(VALID_BODY);
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 404);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["error"], "NOT_FOUND");
    });
  });

  // ── Test 2: feature disabled — deps not called ───────────────────────────────
  test("2. Feature disabled → no clock/resolver/store/handler called", async () => {
    let clockCalled   = false;
    let resolverCalled = false;
    let handlerCalled  = false;
    const deps = makeTestDeps({
      featureEnabled:       false,
      getNowSeconds:        () => { clockCalled = true; return 0; },
      resolveEnabledClient: async () => { resolverCalled = true; return { found: false }; },
      authenticatedHandler: () => { handlerCalled = true; },
    });
    await withServer(deps, async (base) => {
      const { headers } = signBody(VALID_BODY);
      await postIntake(base, VALID_BODY, headers);
      assert.ok(!clockCalled,   "clock must not be called when disabled");
      assert.ok(!resolverCalled, "resolver must not be called when disabled");
      assert.ok(!handlerCalled, "handler must not be called when disabled");
    });
  });

  // ── Test 3: feature disabled, wrong method ──────────────────────────────────
  test("3. Feature disabled + GET method → 405 (preflight runs before gate)", async () => {
    await withServer(makeTestDeps({ featureEnabled: false }), async (base) => {
      const res = await fetch(`${base}${ROUTE_PATH}`, { method: "GET" });
      assert.strictEqual(res.status, 405);
    });
  });

  // ── Test 4: valid signed request ─────────────────────────────────────────────
  test("4. Valid signed request → 200 { ok: true }", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(VALID_BODY);
      const res  = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 200);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["ok"], true);
    });
  });

  // ── Test 5: HMAC covers raw bytes — re-serialized body fails ─────────────────
  test("5. Whitespace-changed body with original signature → 401", async () => {
    const spacedBody  = Buffer.from('{ "event" :  "booking_requested" }');
    const reSerialized = Buffer.from(
      JSON.stringify(JSON.parse(spacedBody.toString())),
    );
    // Confirm they're different raw bytes
    assert.notStrictEqual(spacedBody.toString(), reSerialized.toString());

    const { headers } = signBody(spacedBody); // sign the spaced body
    await withServer(makeTestDeps(), async (base) => {
      // Send re-serialized body but with signature computed over spaced body → 401
      const res = await postIntake(base, reSerialized, headers);
      assert.strictEqual(res.status, 401);
    });
  });

  // ── Test 6: exact raw bytes used — spaced body + correct sig → 200 ───────────
  test("6. Spaced body signed correctly → 200 (raw bytes used, no re-serialization)", async () => {
    const spacedBody = Buffer.from('{ "event" :  "booking_requested" }');
    const { headers } = signBody(spacedBody);
    await withServer(makeTestDeps(), async (base) => {
      const res = await postIntake(base, spacedBody, headers);
      assert.strictEqual(res.status, 200);
    });
  });

  // ── Test 7: wrong content-type ───────────────────────────────────────────────
  test("7. Content-Type: text/plain → 415", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const res = await fetch(`${base}${ROUTE_PATH}`, {
        method:  "POST",
        headers: { "content-type": "text/plain" },
        body:    "hello",
      });
      assert.strictEqual(res.status, 415);
    });
  });

  // ── Test 8: gzip content-encoding ────────────────────────────────────────────
  test("8. Content-Encoding: gzip → 415 (rejected by preflight before body is read)", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(VALID_BODY);
      const res = await postIntake(base, VALID_BODY, {
        ...headers,
        "content-encoding": "gzip",
      });
      assert.strictEqual(res.status, 415);
    });
  });

  // ── Test 9: body exactly at 64 kb ────────────────────────────────────────────
  test("9. Body exactly at 64 kb (65536 bytes) → 200 (within limit)", async () => {
    // JSON body padded to exactly 65536 bytes: {"a":"xxx...xxx"}
    const padding = "x".repeat(65536 - 8); // 65528 x's → total 65536
    const atLimit = Buffer.from(`{"a":"${padding}"}`);
    assert.strictEqual(atLimit.byteLength, 65536);

    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(atLimit);
      const res = await postIntake(base, atLimit, headers);
      assert.strictEqual(res.status, 200);
    });
  });

  // ── Test 10: body 1 byte over 64 kb ──────────────────────────────────────────
  test("10. Body 65537 bytes (1 over limit) → 413", async () => {
    const padding   = "x".repeat(65537 - 8);
    const overLimit = Buffer.from(`{"a":"${padding}"}`);
    assert.strictEqual(overLimit.byteLength, 65537);

    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(overLimit);
      const res = await postIntake(base, overLimit, headers);
      assert.strictEqual(res.status, 413);
    });
  });

  // ── Test 11: feature disabled, over-size body → 404 (body never parsed) ──────
  test("11. Feature disabled + 65537-byte body → 404 (body never read)", async () => {
    const padding   = "x".repeat(65537 - 8);
    const overLimit = Buffer.from(`{"a":"${padding}"}`);

    await withServer(makeTestDeps({ featureEnabled: false }), async (base) => {
      const { headers } = signBody(overLimit);
      const res = await postIntake(base, overLimit, headers);
      // The feature gate fires before express.raw(); body is never buffered.
      assert.strictEqual(res.status, 404);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["error"], "NOT_FOUND");
    });
  });

  // ── Test 12: missing auth header ─────────────────────────────────────────────
  test("12. Missing x-rbg-key-id → 401 AUTHENTICATION_FAILED", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(VALID_BODY);
      const { ["x-rbg-key-id"]: _omit, ...rest } = headers;
      const res = await postIntake(base, VALID_BODY, rest);
      assert.strictEqual(res.status, 401);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["error"], "AUTHENTICATION_FAILED");
    });
  });

  // ── Test 13: stale timestamp ──────────────────────────────────────────────────
  test("13. Stale timestamp (301 s ago) → 401 AUTHENTICATION_FAILED", async () => {
    const staleNow = Math.floor(Date.now() / 1000) - 301;
    const { headers } = signBody(VALID_BODY, TEST_SECRET_BYTES, staleNow);
    await withServer(makeTestDeps(), async (base) => {
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 401);
    });
  });

  // ── Test 14: unknown key id ───────────────────────────────────────────────────
  test("14. Unknown key ID (not in resolveEnabledClient) → 401", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const unknownBody    = VALID_BODY;
      const ts             = String(Math.floor(Date.now() / 1000));
      const rid            = randomUUID();
      const bodyHash       = hashRawBody(new Uint8Array(unknownBody.buffer, unknownBody.byteOffset, unknownBody.byteLength));
      const canonical      = buildInternalHmacCanonicalString("kc-other-v1", ts, rid, bodyHash);
      const sig            = computeInternalHmacSignature(canonical, TEST_SECRET_BYTES);
      const res = await postIntake(base, unknownBody, {
        "content-type":     "application/json",
        "x-rbg-key-id":     "kc-other-v1",
        "x-rbg-timestamp":  ts,
        "x-rbg-request-id": rid,
        "x-rbg-signature":  sig,
      });
      // resolveEnabledClient returns { found: false } for unknown key → 401
      assert.strictEqual(res.status, 401);
    });
  });

  // ── Test 15: resolveEnabledClient throws ────────────────────────────────────
  test("15. resolveEnabledClient throws → 503 SERVICE_UNAVAILABLE", async () => {
    const deps = makeTestDeps({
      resolveEnabledClient: async () => { throw new Error("db timeout"); },
    });
    await withServer(deps, async (base) => {
      const { headers } = signBody(VALID_BODY);
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 503);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["error"], "SERVICE_UNAVAILABLE");
    });
  });

  // ── Test 16: runtime secret missing ──────────────────────────────────────────
  test("16. Secret store returns not-found → 401 AUTHENTICATION_FAILED", async () => {
    const deps = makeTestDeps({
      secretStore: {
        lookup: () => ({ found: false, reason: "unknown_key" as const }),
        getConfiguredKeyIds: () => [],
        size: 0,
      },
    });
    await withServer(deps, async (base) => {
      const { headers } = signBody(VALID_BODY);
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 401);
    });
  });

  // ── Test 17: invalid secret length → 503 ─────────────────────────────────────
  test("17. Secret store returns 31-byte secret → 503 SERVICE_UNAVAILABLE", async () => {
    const deps = makeTestDeps({
      secretStore: {
        lookup: () => ({ found: true as const, secretBytes: new Uint8Array(31) }),
        getConfiguredKeyIds: () => [],
        size: 0,
      },
    });
    await withServer(deps, async (base) => {
      const { headers } = signBody(VALID_BODY);
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 503);
    });
  });

  // ── Test 18: invalid signature ────────────────────────────────────────────────
  test("18. Wrong signature → 401 AUTHENTICATION_FAILED", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(VALID_BODY);
      const wrongSig = "a".repeat(64); // 64 hex chars, all 'a'
      const res = await postIntake(base, VALID_BODY, {
        ...headers,
        "x-rbg-signature": wrongSig,
      });
      assert.strictEqual(res.status, 401);
    });
  });

  // ── Test 19: invalid UTF-8 body ──────────────────────────────────────────────
  test("19. Invalid UTF-8 body (after valid HMAC) → 400 INVALID_REQUEST", async () => {
    // Body contains invalid UTF-8 byte sequence (0xff 0xfe not a valid start)
    const badUtf8 = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]); // {··}
    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(badUtf8);
      const res = await postIntake(base, badUtf8, headers);
      assert.strictEqual(res.status, 400);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["error"], "INVALID_REQUEST");
    });
  });

  // ── Test 20: invalid JSON ─────────────────────────────────────────────────────
  test("20. Valid UTF-8 but invalid JSON (after valid HMAC) → 400 INVALID_REQUEST", async () => {
    const notJson = Buffer.from("not-json-at-all");
    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(notJson);
      const res = await postIntake(base, notJson, headers);
      assert.strictEqual(res.status, 400);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["error"], "INVALID_REQUEST");
    });
  });

  // ── Test 21: correlation header on 401 ───────────────────────────────────────
  test("21. x-rbg-request-id header always present on 401 response", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(VALID_BODY);
      // Force 401 by removing timestamp → prevalidation fails
      const { ["x-rbg-timestamp"]: _omit, ...rest } = headers;
      const res = await postIntake(base, VALID_BODY, rest);
      assert.strictEqual(res.status, 401);
      assert.ok(
        res.headers.get("x-rbg-request-id"),
        "x-rbg-request-id must be present on 401",
      );
    });
  });

  // ── Test 22: correlation header on 503 ───────────────────────────────────────
  test("22. x-rbg-request-id header always present on 503 response", async () => {
    const deps = makeTestDeps({
      resolveEnabledClient: async () => { throw new Error("infra failure"); },
    });
    await withServer(deps, async (base) => {
      const { headers } = signBody(VALID_BODY);
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 503);
      assert.ok(
        res.headers.get("x-rbg-request-id"),
        "x-rbg-request-id must be present on 503",
      );
    });
  });

  // ── Test 23: correlation header on 413 ───────────────────────────────────────
  test("23. x-rbg-request-id header always present on 413 response", async () => {
    const padding   = "x".repeat(65537 - 8);
    const overLimit = Buffer.from(`{"a":"${padding}"}`);
    await withServer(makeTestDeps(), async (base) => {
      const { headers } = signBody(overLimit);
      const res = await postIntake(base, overLimit, headers);
      assert.strictEqual(res.status, 413);
      assert.ok(
        res.headers.get("x-rbg-request-id"),
        "x-rbg-request-id must be present on 413",
      );
    });
  });

  // ── Test 24: validated request ID promoted ────────────────────────────────────
  test("24. On success, x-rbg-request-id response header equals the signed request ID", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const { headers, requestId } = signBody(VALID_BODY);
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(
        res.headers.get("x-rbg-request-id"),
        requestId,
        "validated request ID must be echoed on success",
      );
    });
  });

  // ── Test 25: fallback UUID not the malformed incoming request ID ──────────────
  test("25. Fallback UUID is used before validation — malformed incoming request ID is never echoed", async () => {
    await withServer(makeTestDeps(), async (base) => {
      // Missing timestamp → prevalidation fails at step 5 (MISSING_HEADERS)
      const { headers } = signBody(VALID_BODY);
      const { ["x-rbg-timestamp"]: _omit, ...rest } = headers;
      // Set a recognisable (not a real UUID) incoming request ID
      const spoofId = "NOT-A-UUID-DO-NOT-ECHO";
      const res = await postIntake(base, VALID_BODY, {
        ...rest,
        "x-rbg-request-id": spoofId,
      });
      assert.strictEqual(res.status, 401);
      const correlationHeader = res.headers.get("x-rbg-request-id") ?? "";
      assert.ok(
        correlationHeader !== spoofId,
        "malformed incoming request ID must never be echoed",
      );
      assert.ok(correlationHeader.length > 0, "fallback UUID must be set");
    });
  });

  // ── Test 26: authenticated handler error → 500 ────────────────────────────────
  test("26. Authenticated handler throws → 500 INTERNAL_ERROR", async () => {
    const deps = makeTestDeps({
      authenticatedHandler: () => { throw new Error("handler boom"); },
    });
    await withServer(deps, async (base) => {
      const { headers } = signBody(VALID_BODY);
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 500);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["error"], "INTERNAL_ERROR");
    });
  });

  // ── Test 27: handler SyntaxError → 500, not 400 ──────────────────────────────
  test("27. Authenticated handler throws SyntaxError → 500 (boundary, not 400)", async () => {
    const deps = makeTestDeps({
      authenticatedHandler: () => {
        throw new SyntaxError("pretend parse error from handler");
      },
    });
    await withServer(deps, async (base) => {
      const { headers } = signBody(VALID_BODY);
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 500);
      assert.deepStrictEqual(
        await res.json(),
        { error: "INTERNAL_ERROR" },
      );
    });
  });

  // ── Test 28: logger throw swallowed ──────────────────────────────────────────
  test("28. Logger throws → error swallowed, HTTP response unaffected", async () => {
    const deps = makeTestDeps({
      logger: {
        log: () => { throw new Error("logger on fire"); },
      },
      // Force a logger call by causing an auth failure
      resolveEnabledClient: async () => { throw new Error("infra"); },
    });
    await withServer(deps, async (base) => {
      const { headers } = signBody(VALID_BODY);
      // Should still get 503 (not 500 from logger throw)
      const res = await postIntake(base, VALID_BODY, headers);
      assert.strictEqual(res.status, 503);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["error"], "SERVICE_UNAVAILABLE");
    });
  });

  // ── Test 29: GET → 405 ────────────────────────────────────────────────────────
  test("29. GET → 405 METHOD_NOT_ALLOWED (preflight)", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const res = await fetch(`${base}${ROUTE_PATH}`, { method: "GET" });
      assert.strictEqual(res.status, 405);
      const body = await res.json() as Record<string, unknown>;
      assert.strictEqual(body["error"], "METHOD_NOT_ALLOWED");
    });
  });

  // ── Test 30: /control route unaffected ────────────────────────────────────────
  test("30. /control route (global express.json()) still works after internal router", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const payload = { hello: "world" };
      const res = await fetch(`${base}/control`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(payload),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json() as Record<string, unknown>;
      assert.deepStrictEqual(
        (body["received"] as Record<string, unknown>)?.["hello"],
        "world",
        "/control must parse JSON normally",
      );
    });
  });

  // ── Test 31: OPTIONS → 405 (isolated evidence) ───────────────────────────────
  test("31. OPTIONS → 405 METHOD_NOT_ALLOWED (isolated router behaviour, not a spec claim)", async () => {
    await withServer(makeTestDeps(), async (base) => {
      const res = await fetch(`${base}${ROUTE_PATH}`, { method: "OPTIONS" });
      assert.strictEqual(res.status, 405);
    });
  });
});
