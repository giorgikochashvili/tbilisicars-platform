/**
 * rbg-rate-limit.integration.test.ts
 *
 * C4a integration tests — 16 subprocess-isolated tests (IL1–IL16).
 *
 * Isolation contract (same as C3b-2):
 *   - Every subprocess env is built from makeChildEnv() which inherits the
 *     current process env, strips production/controlled vars, then applies
 *     per-test overrides.
 *   - DATABASE_URL is always set to RBG_TEST_DATABASE_URL; parent DATABASE_URL
 *     is never forwarded.
 *   - RESEND_API_KEY is always removed; no email can be sent.
 *   - RBG_CORE_INTAKE_ENABLED and RBG_CORE_INTAKE_SECRETS_JSON are always
 *     removed then re-applied only via explicit per-server overrides.
 *   - SESSION_SECRET is removed; servers use the insecure dev default.
 *
 * Independence rule:
 *   Every test that touches a rate-limit bucket uses its own unique test IP
 *   (RFC 5737 documentation range 192.0.2.x).  No test shares mutable bucket
 *   state with another test().  Tests are order-independent.
 *
 * DB contract:
 *   - One integration_client row (TEST_KEY_ID) is inserted in before() and
 *     deleted in after().
 *   - No booking row, transaction, notifier call, or Resend call is exercised.
 *
 * Rate-limit defaults on the enabled server (from INTERNAL_RBG_RATE_LIMIT_DEFAULTS):
 *   windowMs = 60 000 ms, max = 30.
 *   To exhaust a bucket: send exactly 30 requests, then the 31st gets 429.
 */

import { test, before, after } from "node:test";
import assert                  from "node:assert/strict";
import { spawn }               from "node:child_process";
import { createServer }        from "node:net";
import * as http               from "node:http";
import { randomUUID, createHash, createHmac } from "node:crypto";
import * as path               from "node:path";
import { fileURLToPath }       from "node:url";
import { drizzle }             from "drizzle-orm/node-postgres";
import { sql }                 from "drizzle-orm";
import * as schema             from "@workspace/db/schema";

// ── File locations ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Resolves to artifacts/api-server */
const API_ROOT = path.resolve(__dirname, "../../..");
const INDEX_TS = path.resolve(API_ROOT, "src/index.ts");

// ── Route constants ────────────────────────────────────────────────────────────

const RBG_PATH     = "/api/internal/regional-brands/bookings";
const CONTROL_PATH = "/api/internal/regional-brands/NO_SUCH_PATH_PROBE";

// ── HMAC canonical constants ───────────────────────────────────────────────────

const HMAC_MARKER = "RBG-HMAC-SHA256-V1";
const HMAC_METHOD = "POST";
const HMAC_PATH   = "/api/internal/regional-brands/bookings";

// ── Test DB guard ─────────────────────────────────────────────────────────────

const testDbUrl = (() => {
  const url = process.env["RBG_TEST_DATABASE_URL"];
  if (!url) {
    console.error(
      "STOP: RBG_TEST_DATABASE_URL is not set. " +
      "C4a integration tests require a dedicated disposable test database. " +
      "Never fall back to DATABASE_URL.",
    );
    process.exit(1);
  }
  return url;
})();

// ── Test credentials ──────────────────────────────────────────────────────────

const TEST_KEY_ID = `c4a-${randomUUID().slice(0, 8)}`;

const TEST_SECRET_BYTES = Buffer.from(
  Array.from({ length: 32 }, (_, i) => (i + 1) % 256),
);
const TEST_SECRET_B64   = TEST_SECRET_BYTES.toString("base64");
const TEST_BRAND_CODE   = "batumicars";
const TEST_SECRETS_JSON = JSON.stringify([
  { keyId: TEST_KEY_ID, secretBase64: TEST_SECRET_B64 },
]);

// ── Own DB pool (for lifecycle setup/teardown) ─────────────────────────────────

type PoolHandle = { end(): Promise<void> };

const _db   = drizzle(testDbUrl, { schema });
const _pool = (_db as unknown as { $client: PoolHandle }).$client;

async function dbExec(q: ReturnType<typeof sql>): Promise<void> {
  await (_db as unknown as { execute(q: unknown): Promise<unknown> }).execute(q);
}

// ── Server handle type ────────────────────────────────────────────────────────

interface TestServer {
  baseUrl: string;
  kill(): Promise<void>;
}

/** Populated in top-level before(); reused across all tests. */
let disabledSrv: TestServer;
let enabledSrv:  TestServer;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

before(
  async () => {
    await dbExec(sql`
      INSERT INTO integration_client (key_id, brand_code, disabled_at)
      VALUES (${TEST_KEY_ID}, ${TEST_BRAND_CODE}, NULL)
    `);
    [disabledSrv, enabledSrv] = await Promise.all([
      startServer({}),
      startServer({
        RBG_CORE_INTAKE_ENABLED:      "true",
        RBG_CORE_INTAKE_SECRETS_JSON: TEST_SECRETS_JSON,
      }),
    ]);
  },
  { timeout: 40_000 },
);

after(
  async () => {
    await Promise.all([
      disabledSrv?.kill(),
      enabledSrv?.kill(),
    ]);
    await dbExec(sql`DELETE FROM integration_client WHERE key_id = ${TEST_KEY_ID}`);
    await _pool.end();
  },
  { timeout: 20_000 },
);

// ── makeChildEnv ──────────────────────────────────────────────────────────────

function makeChildEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env["RESEND_API_KEY"];
  delete env["DATABASE_URL"];
  delete env["RBG_CORE_INTAKE_ENABLED"];
  delete env["RBG_CORE_INTAKE_SECRETS_JSON"];
  delete env["SESSION_SECRET"];
  env["DATABASE_URL"] = testDbUrl;
  env["NODE_ENV"]     = "test";
  return Object.assign(env, overrides);
}

// ── getFreePort ───────────────────────────────────────────────────────────────

function getFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as { port: number } | null;
      if (!addr) { srv.close(); reject(new Error("no address")); return; }
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

// ── waitForReady ──────────────────────────────────────────────────────────────

async function waitForReady(url: string, ms = 20_000): Promise<void> {
  const deadline = Date.now() + ms;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      if (res.status === 200) return;
    } catch (err) {
      last = err;
    }
    await new Promise<void>(r => setTimeout(r, 300));
  }
  throw new Error(`Server not ready at ${url} after ${ms}ms. Last error: ${last}`);
}

// ── startServer ───────────────────────────────────────────────────────────────

async function startServer(overrides: Record<string, string> = {}): Promise<TestServer> {
  const port = await getFreePort();
  const env  = makeChildEnv({ ...overrides, PORT: String(port) });

  const child = spawn(process.execPath, ["--import", "tsx", INDEX_TS], {
    env, cwd: API_ROOT, stdio: ["ignore", "pipe", "pipe"],
  });

  let startErr = "";
  child.stderr.on("data", (d: Buffer) => { startErr += d.toString(); });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForReady(`${baseUrl}/api/healthz`);
  } catch (cause) {
    child.kill("SIGKILL");
    throw new Error(`Server failed to start.\nstderr:\n${startErr}\nCause: ${cause}`);
  }

  return {
    baseUrl,
    kill(): Promise<void> {
      return new Promise<void>(resolve => {
        child.kill("SIGTERM");
        const t = setTimeout(() => child.kill("SIGKILL"), 3_000);
        child.on("exit", () => { clearTimeout(t); resolve(); });
      });
    },
  };
}

// ── signBody ──────────────────────────────────────────────────────────────────

interface HmacHeaders {
  "x-rbg-key-id":     string;
  "x-rbg-timestamp":  string;
  "x-rbg-request-id": string;
  "x-rbg-signature":  string;
}

function signBody(rawBody: Uint8Array): HmacHeaders {
  const ts    = String(Math.floor(Date.now() / 1000));
  const reqId = randomUUID();
  const hash  = createHash("sha256").update(rawBody).digest("hex");
  const canon = [HMAC_MARKER, HMAC_METHOD, HMAC_PATH, TEST_KEY_ID, ts, reqId, hash].join("\n");
  const sig   = createHmac("sha256", TEST_SECRET_BYTES).update(canon).digest("hex");
  return {
    "x-rbg-key-id":     TEST_KEY_ID,
    "x-rbg-timestamp":  ts,
    "x-rbg-request-id": reqId,
    "x-rbg-signature":  sig,
  };
}

// ── rawHttpPost ───────────────────────────────────────────────────────────────
// Used for the oversized-body test (IL16) to send a large Buffer.

interface RawResponse {
  status:  number;
  body:    Record<string, unknown>;
  headers: http.IncomingHttpHeaders;
}

function rawHttpPost(
  baseUrl: string,
  reqPath: string,
  body:    Buffer | string,
  headers: Record<string, string>,
): Promise<RawResponse> {
  const u = new URL(baseUrl);
  return new Promise<RawResponse>((resolve, reject) => {
    const req = http.request(
      {
        hostname: u.hostname,
        port:     Number(u.port),
        path:     reqPath,
        method:   "POST",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end",  () => {
          try {
            resolve({
              status:  res.statusCode ?? 0,
              body:    JSON.parse(data) as Record<string, unknown>,
              headers: res.headers,
            });
          } catch (e) { reject(e); }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── exhaustBucket ─────────────────────────────────────────────────────────────
//
// Sends exactly max=30 unauthenticated POST requests from the given IP to fill
// the rate-limit bucket.  Each request gets 401 AUTHENTICATION_FAILED (or other
// non-429) which still counts (skipFailedRequests=false).
// After this call, the next request from the same IP will get 429.

async function exhaustBucket(server: TestServer, ip: string): Promise<void> {
  const requests = Array.from({ length: 30 }, () =>
    fetch(`${server.baseUrl}${RBG_PATH}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body:    "{}",
      signal:  AbortSignal.timeout(10_000),
    }).then(r => r.body?.cancel()),
  );
  await Promise.all(requests);
}

// ── get429 ────────────────────────────────────────────────────────────────────
//
// Exhausts the bucket for the given IP and returns the 429 Response.
// Every IL6-IL9 caller uses its own unique IP so they are fully independent.

async function get429(ip: string): Promise<Response> {
  await exhaustBucket(enabledSrv, ip);
  return fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body:    "{}",
    signal:  AbortSignal.timeout(5_000),
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ═══════════════════════════════════════════════════════════════════════════════
// IL1–IL2: Disabled-mode proofs
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "IL1: disabled — flood of 50 requests never returns 429",
  { timeout: 60_000 },
  async () => {
    const responses = await Promise.all(
      Array.from({ length: 50 }, () =>
        fetch(`${disabledSrv.baseUrl}${RBG_PATH}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.101" },
          body:    "{}",
          signal:  AbortSignal.timeout(10_000),
        }),
      ),
    );
    for (const res of responses) {
      assert.notEqual(res.status, 429, `disabled server must never return 429; got ${res.status}`);
      await res.body?.cancel();
    }
  },
);

test(
  "IL2: disabled — RBG path ≡ unmounted control (status + Content-Type)",
  { timeout: 15_000 },
  async () => {
    const [rbg, ctrl] = await Promise.all([
      fetch(`${disabledSrv.baseUrl}${RBG_PATH}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.102" },
        body:    "{}",
        signal:  AbortSignal.timeout(5_000),
      }),
      fetch(`${disabledSrv.baseUrl}${CONTROL_PATH}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.102" },
        body:    "{}",
        signal:  AbortSignal.timeout(5_000),
      }),
    ]);
    assert.equal(rbg.status, ctrl.status, "disabled: RBG and control must return same status");
    const rbgCt  = (rbg.headers.get("content-type")  ?? "").split(";")[0]!.trim();
    const ctrlCt = (ctrl.headers.get("content-type") ?? "").split(";")[0]!.trim();
    assert.equal(rbgCt, ctrlCt, "disabled: RBG and control must return same Content-Type base");
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// IL3–IL4: Enabled under-limit body-integrity proofs
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "IL3: enabled under-limit — correctly signed {} → 422 VALIDATION_ERROR",
  { timeout: 15_000 },
  async () => {
    const rawBody = Buffer.from("{}");
    const hmac    = signBody(new Uint8Array(rawBody));
    const res = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "X-Forwarded-For":   "192.0.2.103",
        ...hmac,
      },
      body:   rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json() as Record<string, unknown>;
    assert.equal(res.status,    422,               "correctly-signed {} must reach auth pipeline → 422");
    assert.equal(body["error"], "VALIDATION_ERROR", "error must be VALIDATION_ERROR");
  },
);

test(
  "IL4: enabled under-limit — altered-byte request → 401 AUTHENTICATION_FAILED",
  { timeout: 15_000 },
  async () => {
    const originalBody = Buffer.from("{}");
    const hmac         = signBody(new Uint8Array(originalBody)); // signed over "{}"
    const alteredBody  = Buffer.from("{ }");                     // different bytes
    const res = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-Forwarded-For": "192.0.2.104",
        ...hmac,
      },
      body:   alteredBody,
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json() as Record<string, unknown>;
    assert.equal(res.status,    401,                    "altered body must reach auth pipeline → 401");
    assert.equal(body["error"], "AUTHENTICATION_FAILED", "error must be AUTHENTICATION_FAILED");
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// IL5: Bucket exhaustion structural proof
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "IL5: enabled — max+1 same-IP requests: first max get non-429, max+1 gets 429",
  { timeout: 60_000 },
  async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.105" },
        body:    "{}",
        signal:  AbortSignal.timeout(5_000),
      });
      statuses.push(res.status);
      await res.body?.cancel();
    }
    for (let i = 0; i < 30; i++) {
      assert.notEqual(statuses[i], 429, `request ${i + 1} must not be 429; got ${statuses[i]}`);
    }
    assert.equal(statuses[30], 429, `request 31 must be 429; got ${statuses[30]}`);
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// IL6–IL9: 429 contract (each uses own bucket — fully independent)
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "IL6: enabled — 429 body is exactly {\"error\":\"RATE_LIMITED\"}",
  { timeout: 60_000 },
  async () => {
    const res  = await get429("192.0.2.106");
    const body = await res.json() as Record<string, unknown>;
    assert.equal(res.status, 429, "must be 429");
    assert.deepEqual(body, { error: "RATE_LIMITED" }, "body must be exactly {error:'RATE_LIMITED'}");
  },
);

test(
  "IL7: enabled — 429 has valid Retry-After header",
  { timeout: 60_000 },
  async () => {
    const res = await get429("192.0.2.107");
    await res.body?.cancel();
    const retryAfter = res.headers.get("retry-after") ?? "";
    assert.ok(retryAfter.length > 0, "Retry-After must be present");
    const val = parseInt(retryAfter, 10);
    assert.ok(!isNaN(val) && val > 0, `Retry-After must be a positive integer; got: ${retryAfter}`);
  },
);

test(
  "IL8: enabled — 429 has all three standard RateLimit headers",
  { timeout: 60_000 },
  async () => {
    const res = await get429("192.0.2.108");
    await res.body?.cancel();
    assert.ok(
      res.headers.get("ratelimit-limit") !== null,
      "RateLimit-Limit must be present",
    );
    assert.ok(
      res.headers.get("ratelimit-remaining") !== null,
      "RateLimit-Remaining must be present",
    );
    assert.ok(
      res.headers.get("ratelimit-reset") !== null,
      "RateLimit-Reset must be present",
    );
  },
);

test(
  "IL9: enabled — 429 x-rbg-request-id is a valid UUID v4",
  { timeout: 60_000 },
  async () => {
    const res = await get429("192.0.2.109");
    await res.body?.cancel();
    const id = res.headers.get("x-rbg-request-id") ?? "";
    assert.match(id, UUID_RE, `x-rbg-request-id must be a UUID v4; got: ${JSON.stringify(id)}`);
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// IL10–IL12: Bucket isolation and pipeline order proofs
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "IL10: enabled — second IP gets independent bucket",
  { timeout: 60_000 },
  async () => {
    // Exhaust bucket for 192.0.2.110
    await exhaustBucket(enabledSrv, "192.0.2.110");
    // 192.0.2.111 must have its own fresh bucket
    const res = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.111" },
      body:    "{}",
      signal:  AbortSignal.timeout(5_000),
    });
    await res.body?.cancel();
    assert.notEqual(res.status, 429, "192.0.2.111 must not be 429 — it has its own independent bucket");
  },
);

test(
  "IL11: enabled — changing x-rbg-key-id does not evade same-IP bucket",
  { timeout: 60_000 },
  async () => {
    // Exhaust bucket with key-id=A
    await exhaustBucket(enabledSrv, "192.0.2.112");
    // Same IP with key-id=B must still get 429 (bucket is IP-keyed, not key-id-keyed)
    const res = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-Forwarded-For": "192.0.2.112",
        "x-rbg-key-id":    "different-key-id",
      },
      body:   "{}",
      signal: AbortSignal.timeout(5_000),
    });
    await res.body?.cancel();
    assert.equal(res.status, 429, "same IP with different key-id must still get 429 (bucket keyed on IP)");
  },
);

test(
  "IL12: enabled — correctly signed {} from exhausted IP gets 429 not 422",
  { timeout: 60_000 },
  async () => {
    // Exhaust the bucket for this IP
    await exhaustBucket(enabledSrv, "192.0.2.113");

    // Now send a correctly-signed {} from the same IP.
    // Limiter runs BEFORE the router, so rate-limit 429 is returned — not 422.
    const rawBody = Buffer.from("{}");
    const hmac    = signBody(new Uint8Array(rawBody));
    const res = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-Forwarded-For": "192.0.2.113",
        ...hmac,
      },
      body:   rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json() as Record<string, unknown>;
    assert.equal(res.status, 429, "rate-limited IP must get 429 even with a correctly-signed body");
    assert.equal(body["error"], "RATE_LIMITED", "error must be RATE_LIMITED (limiter before auth pipeline)");
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// IL13–IL14: Unrelated routes remain unaffected
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "IL13: enabled — GET /api/healthz → 200 {status:'ok'} unaffected",
  { timeout: 10_000 },
  async () => {
    const res  = await fetch(`${enabledSrv.baseUrl}/api/healthz`, { signal: AbortSignal.timeout(5_000) });
    const body = await res.json() as Record<string, unknown>;
    assert.equal(res.status,     200,  "healthz must return 200 with rate-limiter active");
    assert.equal(body["status"], "ok", "healthz must return {status:'ok'}");
  },
);

test(
  "IL14: enabled — POST /api/public/validate-promo → unaffected (express.json() intact)",
  { timeout: 10_000 },
  async () => {
    const res = await fetch(`${enabledSrv.baseUrl}/api/public/validate-promo`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ code: "PROBE_DEFINITELY_NOT_REAL_C4ATEST" }),
      signal:  AbortSignal.timeout(5_000),
    });
    const body = await res.json() as Record<string, unknown>;
    assert.equal(res.status,   200,   "validate-promo must return 200 (express.json() intact)");
    assert.equal(body["valid"], false, "valid must be false (promo code does not exist)");
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// IL15: Raw-body HMAC integrity through limiter
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "IL15: enabled under-limit — raw-body HMAC intact through limiter (non-trivial body)",
  { timeout: 15_000 },
  async () => {
    // Sign a non-trivial body {"a":1}.  If the limiter had consumed or altered
    // any bytes, the HMAC would mismatch and return 401, not 422.
    const rawBody = Buffer.from('{"a":1}');
    const hmac    = signBody(new Uint8Array(rawBody));
    const res = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "X-Forwarded-For": "192.0.2.115",
        ...hmac,
      },
      body:   rawBody,
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json() as Record<string, unknown>;
    // 422 = HMAC passed (bytes unchanged), Zod rejected the body shape
    assert.equal(
      res.status, 422,
      `{"a":1} signed correctly must return 422 (not 401=HMAC mismatch, not 400); got: ${res.status} ${JSON.stringify(body)}`,
    );
    assert.equal(body["error"], "VALIDATION_ERROR", "error must be VALIDATION_ERROR");
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// IL16: Oversized body from exhausted IP → 429 not 413
// Proves the limiter rejects before the router's 64 KiB body parser
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "IL16: enabled — oversized body (>64 KiB) from exhausted IP → 429 RATE_LIMITED, not 413 PAYLOAD_TOO_LARGE",
  { timeout: 60_000 },
  async () => {
    // Exhaust bucket for 192.0.2.116
    await exhaustBucket(enabledSrv, "192.0.2.116");

    // Send a body larger than the router's 64 KiB express.raw() limit.
    // The rate limiter intercepts BEFORE the router; the body is never parsed.
    // Expected: 429 RATE_LIMITED, not 413 PAYLOAD_TOO_LARGE.
    const largeBody = Buffer.alloc(66_000, 0x20); // 66 000 bytes of space chars
    const result = await rawHttpPost(
      enabledSrv.baseUrl,
      RBG_PATH,
      largeBody,
      {
        "Content-Type":    "application/json",
        "X-Forwarded-For": "192.0.2.116",
        "Content-Length":  String(largeBody.length),
      },
    );

    assert.equal(
      result.status, 429,
      `oversized body from exhausted IP must return 429 (not 413); got ${result.status}`,
    );
    assert.deepEqual(
      result.body, { error: "RATE_LIMITED" },
      "429 body must be {error:'RATE_LIMITED'}",
    );
    const retryAfter = result.headers["retry-after"] ?? "";
    assert.ok(retryAfter.length > 0, "Retry-After must be present on 429");
    const requestId = result.headers["x-rbg-request-id"] ?? "";
    assert.match(
      String(requestId), UUID_RE,
      `x-rbg-request-id must be a UUID v4; got: ${JSON.stringify(requestId)}`,
    );
  },
);
