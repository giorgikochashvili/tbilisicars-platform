/**
 * rbg-app-mount.integration.test.ts
 *
 * C3b-2 integration tests — 24 subprocess-isolated tests:
 *   S1–S7:  Startup isolation (subprocess probe — no server required)
 *   D1–D5:  Disabled-mode HTTP (subprocess server, feature unset)
 *   E1–E12: Enabled-mode HTTP  (subprocess server, feature enabled, test DB)
 *
 * Isolation contract:
 *   - Every subprocess env is built from makeChildEnv() which inherits the
 *     current process env then removes all production/controlled vars before
 *     applying per-test overrides.
 *   - DATABASE_URL is always set to RBG_TEST_DATABASE_URL; the parent process
 *     DATABASE_URL is never forwarded.
 *   - RESEND_API_KEY is always removed; no email can be sent.
 *   - RBG_CORE_INTAKE_ENABLED and RBG_CORE_INTAKE_SECRETS_JSON are always
 *     removed then re-applied only via explicit per-test/per-server overrides.
 *   - SESSION_SECRET is removed; servers use the insecure dev default.
 *
 * DB contract:
 *   - One integration_client row (TEST_KEY_ID / batumicars) is inserted in
 *     the top-level before() and deleted in after().
 *   - No booking row, transaction, notifier call, or Resend call is exercised.
 *
 * HMAC contract (E8/E9):
 *   - Canonical: RBG-HMAC-SHA256-V1\nPOST\n/api/internal/regional-brands/bookings
 *                \n<keyId>\n<ts>\n<reqId>\n<bodyHashHex>
 *   - Signed with TEST_SECRET_BYTES (32-byte deterministic value).
 *   - E8: body "{}" — signature matches → 422 VALIDATION_ERROR (auth passes, Zod fails).
 *   - E9: body "{ }" sent with "{}" signature → HMAC mismatch → 401.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import * as http from "node:http";
import { randomUUID, createHash, createHmac } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "@workspace/db/schema";

// ── File locations ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Resolves to artifacts/api-server */
const API_ROOT   = path.resolve(__dirname, "../../..");
const INDEX_TS   = path.resolve(API_ROOT, "src/index.ts");
const ADAPTER_TS = path.resolve(API_ROOT, "src/lib/rbg-runtime-adapter.ts");
const BINDER_TS  = path.resolve(API_ROOT, "src/lib/rbg-runtime-binding.ts");

// ── Route constants ────────────────────────────────────────────────────────────

const RBG_PATH     = "/api/internal/regional-brands/bookings";
const CONTROL_PATH = "/api/internal/regional-brands/NO_SUCH_PATH_PROBE";

// ── HMAC canonical constants ──────────────────────────────────────────────────

const HMAC_MARKER = "RBG-HMAC-SHA256-V1";
const HMAC_METHOD = "POST";
const HMAC_PATH   = "/api/internal/regional-brands/bookings";

// ── Test DB guard ─────────────────────────────────────────────────────────────

const testDbUrl = (() => {
  const url = process.env["RBG_TEST_DATABASE_URL"];
  if (!url) {
    console.error(
      "STOP: RBG_TEST_DATABASE_URL is not set. " +
      "C3b-2 integration tests require a dedicated disposable test database. " +
      "Never fall back to DATABASE_URL.",
    );
    process.exit(1);
  }
  return url;
})();

// ── Test credentials (unique per run) ─────────────────────────────────────────

const TEST_KEY_ID = `c3b2-${randomUUID().slice(0, 8)}`;

const TEST_SECRET_BYTES = Buffer.from(
  Array.from({ length: 32 }, (_, i) => (i + 1) % 256),
);
const TEST_SECRET_B64   = TEST_SECRET_BYTES.toString("base64");
const TEST_BRAND_CODE   = "batumicars";
const TEST_SECRETS_JSON = JSON.stringify([
  { keyId: TEST_KEY_ID, secretBase64: TEST_SECRET_B64 },
]);

// ── Own DB pool (for lifecycle setup/teardown) ────────────────────────────────

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

/** Populated in top-level before(); used by D and E test groups. */
let disabledSrv: TestServer;
let enabledSrv:  TestServer;

// ── Lifecycle ─────────────────────────────────────────────────────────────────

before(
  async () => {
    // 1. Insert test integration_client row (needed by E8/E9 HMAC auth path)
    await dbExec(sql`
      INSERT INTO integration_client (key_id, brand_code, disabled_at)
      VALUES (${TEST_KEY_ID}, ${TEST_BRAND_CODE}, NULL)
    `);
    // 2. Start both test servers concurrently
    [disabledSrv, enabledSrv] = await Promise.all([
      startServer({}),
      startServer({
        RBG_CORE_INTAKE_ENABLED:      "true",
        RBG_CORE_INTAKE_SECRETS_JSON: TEST_SECRETS_JSON,
      }),
    ]);
  },
  { timeout: 35_000 },
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
  { timeout: 15_000 },
);

// ── makeChildEnv ──────────────────────────────────────────────────────────────

function makeChildEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  // Strip all production/controlled vars
  delete env["RESEND_API_KEY"];
  delete env["DATABASE_URL"];
  delete env["RBG_CORE_INTAKE_ENABLED"];
  delete env["RBG_CORE_INTAKE_SECRETS_JSON"];
  delete env["SESSION_SECRET"];
  // Always use test DB; never inherit parent DATABASE_URL
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

async function waitForReady(url: string, ms = 15_000): Promise<void> {
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

// ── runProbe ──────────────────────────────────────────────────────────────────

interface ProbeResult { exitCode: number; stdout: string; stderr: string; }

async function runProbe(overrides: Record<string, string> = {}): Promise<ProbeResult> {
  const tmp = path.join(tmpdir(), `rbg-probe-${randomUUID()}.ts`);

  // Import via file:// absolute URLs so module resolution works from /tmp/.
  const code = [
    `import { buildDefaultRbgRuntimeSources } from ${JSON.stringify("file://" + ADAPTER_TS)};`,
    `import { bindRbgRuntime }                from ${JSON.stringify("file://" + BINDER_TS)};`,
    `try {`,
    `  const b = bindRbgRuntime(buildDefaultRbgRuntimeSources());`,
    `  process.stdout.write(JSON.stringify({ ok: true, routerNull: b.router === null }));`,
    `  process.exitCode = 0;`,
    `} catch (err) {`,
    `  const e = err as Record<string, unknown>;`,
    `  const kind = typeof e["kind"] === "string" ? e["kind"] : "UNKNOWN";`,
    `  const msg  = err instanceof Error ? err.message : String(err);`,
    `  process.stdout.write(JSON.stringify({ ok: false, kind, message: msg }));`,
    `  process.exitCode = 1;`,
    `}`,
  ].join("\n");

  writeFileSync(tmp, code, "utf8");

  const env = makeChildEnv(overrides);

  return new Promise<ProbeResult>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", tmp], {
      env, cwd: API_ROOT, stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    child.on("exit", code => {
      try { unlinkSync(tmp); } catch { /* ignore cleanup errors */ }
      resolve({ exitCode: code ?? 1, stdout: out, stderr: err });
    });
    child.on("error", e => {
      try { unlinkSync(tmp); } catch { /* ignore cleanup errors */ }
      reject(e);
    });
  });
}

function parseProbe(r: ProbeResult): Record<string, unknown> {
  try {
    return JSON.parse(r.stdout) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Probe stdout is not valid JSON.\n` +
      `exitCode=${r.exitCode}\nstdout=${JSON.stringify(r.stdout)}\n` +
      `stderr=${JSON.stringify(r.stderr.slice(0, 500))}`,
    );
  }
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
// Uses node:http directly so all headers (including Content-Encoding) are
// sent verbatim without any fetch-layer normalisation.

interface RawResponse { status: number; body: Record<string, unknown>; }

function rawHttpPost(
  baseUrl: string,
  reqPath: string,
  bodyStr: string,
  headers: Record<string, string>,
): Promise<RawResponse> {
  const u = new URL(baseUrl);
  return new Promise<RawResponse>((resolve, reject) => {
    const req = http.request(
      { hostname: u.hostname, port: Number(u.port), path: reqPath, method: "POST", headers },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end",  () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              body:   JSON.parse(data) as Record<string, unknown>,
            });
          } catch (e) { reject(e); }
        });
      },
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// S1–S7: Startup isolation tests
// ═══════════════════════════════════════════════════════════════════════════════

test("S1: feature unset → router null; no throw", { timeout: 15_000 }, async () => {
  const r = await runProbe({});
  const o = parseProbe(r);
  assert.strictEqual(o["ok"],        true, "must not throw when feature unset");
  assert.strictEqual(o["routerNull"], true, "router must be null when feature unset");
});

test("S2: feature blank string → router null; no throw", { timeout: 15_000 }, async () => {
  const r = await runProbe({ RBG_CORE_INTAKE_ENABLED: "" });
  const o = parseProbe(r);
  assert.strictEqual(o["ok"],        true, "must not throw for blank feature");
  assert.strictEqual(o["routerNull"], true, "router must be null for blank feature");
});

test("S3: feature 'false' → router null; no throw", { timeout: 15_000 }, async () => {
  const r = await runProbe({ RBG_CORE_INTAKE_ENABLED: "false" });
  const o = parseProbe(r);
  assert.strictEqual(o["ok"],        true, "must not throw for 'false'");
  assert.strictEqual(o["routerNull"], true, "router must be null for 'false'");
});

test("S4: invalid feature value → warning emitted to stderr; router null; no throw", { timeout: 15_000 }, async () => {
  const r = await runProbe({ RBG_CORE_INTAKE_ENABLED: "garbage" });
  const o = parseProbe(r);
  assert.strictEqual(o["ok"],        true, "must not throw for invalid value");
  assert.strictEqual(o["routerNull"], true, "router must be null for invalid value");
  // reportFeatureFlagWarning calls console.warn → stderr
  assert.ok(
    r.stderr.includes("[rbg] feature flag warning:"),
    `warning must appear in stderr for invalid feature value; stderr: ${JSON.stringify(r.stderr.slice(0, 300))}`,
  );
});

test("S5: feature 'true' + valid secrets → router non-null; no throw", { timeout: 15_000 }, async () => {
  const r = await runProbe({
    RBG_CORE_INTAKE_ENABLED:      "true",
    RBG_CORE_INTAKE_SECRETS_JSON: TEST_SECRETS_JSON,
  });
  const o = parseProbe(r);
  assert.strictEqual(o["ok"],        true,  "must not throw with valid secrets");
  assert.strictEqual(o["routerNull"], false, "router must be non-null when enabled + valid secrets");
});

test("S6: feature 'true' + secrets unset → throws MISSING_CONFIG; exit 1", { timeout: 15_000 }, async () => {
  const r = await runProbe({ RBG_CORE_INTAKE_ENABLED: "true" });
  const o = parseProbe(r);
  assert.strictEqual(o["ok"],    false,           "must throw when secrets absent");
  assert.strictEqual(o["kind"],  "MISSING_CONFIG", `expected MISSING_CONFIG; got: ${o["kind"]}`);
  assert.strictEqual(r.exitCode, 1,               "probe exit must be 1 on throw");
});

test("S7: feature 'true' + malformed JSON secrets → throws INVALID_JSON; exit 1", { timeout: 15_000 }, async () => {
  const r = await runProbe({
    RBG_CORE_INTAKE_ENABLED:      "true",
    RBG_CORE_INTAKE_SECRETS_JSON: "not-json!!!",
  });
  const o = parseProbe(r);
  assert.strictEqual(o["ok"],    false,        "must throw for malformed secrets");
  assert.strictEqual(o["kind"],  "INVALID_JSON", `expected INVALID_JSON; got: ${o["kind"]}`);
  assert.strictEqual(r.exitCode, 1,            "probe exit must be 1 on throw");
});

// ═══════════════════════════════════════════════════════════════════════════════
// D1–D5: Disabled-mode HTTP tests
// ═══════════════════════════════════════════════════════════════════════════════

test("D1: disabled POST RBG path ≡ POST control path (status + Content-Type)", { timeout: 10_000 }, async () => {
  const [rbg, ctrl] = await Promise.all([
    fetch(`${disabledSrv.baseUrl}${RBG_PATH}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(5_000),
    }),
    fetch(`${disabledSrv.baseUrl}${CONTROL_PATH}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(5_000),
    }),
  ]);
  assert.strictEqual(rbg.status, ctrl.status, "disabled POST: RBG and control must return same status");
  const rbgCt  = (rbg.headers.get("content-type")  ?? "").split(";")[0]!.trim();
  const ctrlCt = (ctrl.headers.get("content-type") ?? "").split(";")[0]!.trim();
  assert.strictEqual(rbgCt, ctrlCt, "disabled POST: RBG and control must return same Content-Type base");
});

test("D2: disabled GET RBG path ≡ GET control path (status + Content-Type)", { timeout: 10_000 }, async () => {
  const [rbg, ctrl] = await Promise.all([
    fetch(`${disabledSrv.baseUrl}${RBG_PATH}`,     { method: "GET", signal: AbortSignal.timeout(5_000) }),
    fetch(`${disabledSrv.baseUrl}${CONTROL_PATH}`, { method: "GET", signal: AbortSignal.timeout(5_000) }),
  ]);
  assert.strictEqual(rbg.status, ctrl.status, "disabled GET: RBG and control must return same status");
  const rbgCt  = (rbg.headers.get("content-type")  ?? "").split(";")[0]!.trim();
  const ctrlCt = (ctrl.headers.get("content-type") ?? "").split(";")[0]!.trim();
  assert.strictEqual(rbgCt, ctrlCt, "disabled GET: RBG and control must return same Content-Type base");
});

test("D3: disabled — no x-rbg-request-id header on RBG path", { timeout: 10_000 }, async () => {
  const res = await fetch(`${disabledSrv.baseUrl}${RBG_PATH}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(5_000),
  });
  assert.strictEqual(
    res.headers.get("x-rbg-request-id"),
    null,
    "disabled: x-rbg-request-id must be absent on the RBG path",
  );
});

test("D4: disabled — RBG path body is not an RBG JSON error object", { timeout: 10_000 }, async () => {
  const res  = await fetch(`${disabledSrv.baseUrl}${RBG_PATH}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(5_000),
  });
  const body = await res.text();
  // All RBG error responses start with {"error":"<UPPER_SNAKE>"}
  const isRbgJson = /^\{"error":"[A-Z_]+"/.test(body.trim());
  assert.strictEqual(isRbgJson, false, `disabled: body must not be RBG JSON; got: ${body.slice(0, 120)}`);
});

test("D5: disabled — GET /api/healthz → 200 { status: 'ok' }", { timeout: 10_000 }, async () => {
  const res  = await fetch(`${disabledSrv.baseUrl}/api/healthz`, { signal: AbortSignal.timeout(5_000) });
  const body = await res.json() as Record<string, unknown>;
  assert.strictEqual(res.status,     200,  "healthz must return 200 when RBG is disabled");
  assert.strictEqual(body["status"], "ok", "healthz must return { status: 'ok' }");
});

// ═══════════════════════════════════════════════════════════════════════════════
// E1–E12: Enabled-mode HTTP tests
// ═══════════════════════════════════════════════════════════════════════════════

test("E1: enabled GET exact RBG path → 405 METHOD_NOT_ALLOWED", { timeout: 10_000 }, async () => {
  const res  = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
    method: "GET", signal: AbortSignal.timeout(5_000),
  });
  const body = await res.json() as Record<string, unknown>;
  assert.strictEqual(res.status,    405,                  "GET → 405");
  assert.strictEqual(body["error"], "METHOD_NOT_ALLOWED", "error = METHOD_NOT_ALLOWED");
});

test("E2: enabled POST text/plain → 415 UNSUPPORTED_MEDIA_TYPE", { timeout: 10_000 }, async () => {
  const res  = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
    method: "POST", headers: { "Content-Type": "text/plain" },
    body: "hello", signal: AbortSignal.timeout(5_000),
  });
  const body = await res.json() as Record<string, unknown>;
  assert.strictEqual(res.status,    415,                      "text/plain → 415");
  assert.strictEqual(body["error"], "UNSUPPORTED_MEDIA_TYPE", "error = UNSUPPORTED_MEDIA_TYPE");
});

test("E3: enabled POST with query string → 400 INVALID_REQUEST", { timeout: 10_000 }, async () => {
  const res  = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}?x=1`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(5_000),
  });
  const body = await res.json() as Record<string, unknown>;
  assert.strictEqual(res.status,    400,              "query string → 400");
  assert.strictEqual(body["error"], "INVALID_REQUEST", "error = INVALID_REQUEST");
});

test("E4: enabled POST Content-Encoding gzip → 415 UNSUPPORTED_MEDIA_TYPE", { timeout: 10_000 }, async () => {
  // Use node:http directly so Content-Encoding is sent verbatim (no fetch normalisation).
  const r = await rawHttpPost(enabledSrv.baseUrl, RBG_PATH, "{}", {
    "Content-Type":     "application/json",
    "Content-Encoding": "gzip",
  });
  assert.strictEqual(r.status,      415,                      "gzip encoding → 415");
  assert.strictEqual(r.body["error"], "UNSUPPORTED_MEDIA_TYPE", "error = UNSUPPORTED_MEDIA_TYPE");
});

test("E5: enabled POST wrong subpath → 404 NOT_FOUND", { timeout: 10_000 }, async () => {
  const res  = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}/extra`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(5_000),
  });
  const body = await res.json() as Record<string, unknown>;
  assert.strictEqual(res.status,    404,        "wrong subpath → 404");
  assert.strictEqual(body["error"], "NOT_FOUND", "error = NOT_FOUND");
});

test("E6: enabled POST trailing slash → reaches pipeline; 401 (not 404)", { timeout: 10_000 }, async () => {
  // Trailing slash: req.path = "/" inside the router → preflight passes →
  // auth pipeline fires → no HMAC headers → 401, NOT 404 (wrong-subpath rejection).
  const res  = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}/`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(5_000),
  });
  const body = await res.json() as Record<string, unknown>;
  assert.strictEqual(res.status,    401,                    "trailing slash → 401 (not 404)");
  assert.strictEqual(body["error"], "AUTHENTICATION_FAILED", "error = AUTHENTICATION_FAILED");
});

test("E7: enabled POST missing x-rbg-key-id → 401 AUTHENTICATION_FAILED", { timeout: 10_000 }, async () => {
  const res  = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(5_000),
  });
  const body = await res.json() as Record<string, unknown>;
  assert.strictEqual(res.status,    401,                    "missing key-id → 401");
  assert.strictEqual(body["error"], "AUTHENTICATION_FAILED", "error = AUTHENTICATION_FAILED");
});

test(
  "E8: enabled POST correctly-signed {} → 422 VALIDATION_ERROR; proves raw-body integrity + auth pipeline",
  { timeout: 15_000 },
  async () => {
    const rawBody = Buffer.from("{}");
    const hmac    = signBody(new Uint8Array(rawBody));

    const res = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-rbg-key-id":      hmac["x-rbg-key-id"],
        "x-rbg-timestamp":   hmac["x-rbg-timestamp"],
        "x-rbg-request-id":  hmac["x-rbg-request-id"],
        "x-rbg-signature":   hmac["x-rbg-signature"],
      },
      body:   rawBody,
      signal: AbortSignal.timeout(10_000),
    });

    const body = await res.json() as Record<string, unknown>;

    // HMAC auth passes → service call → Zod rejects {} → 422 VALIDATION_ERROR
    assert.strictEqual(res.status,    422,               "correctly-signed {} → 422");
    assert.strictEqual(body["error"], "VALIDATION_ERROR", "error = VALIDATION_ERROR");

    // Response header echoes the sent request ID (pipeline set it before auth)
    assert.strictEqual(
      res.headers.get("x-rbg-request-id"),
      hmac["x-rbg-request-id"],
      "x-rbg-request-id response header must echo the sent request ID",
    );
  },
);

test(
  "E9: enabled POST altered body (original {} signature) → 401 AUTHENTICATION_FAILED",
  { timeout: 15_000 },
  async () => {
    const originalBody = Buffer.from("{}");
    const hmac         = signBody(new Uint8Array(originalBody)); // signed over "{}"

    // Body actually sent: "{ }" — different raw bytes → different hash → signature mismatch
    const alteredBody = Buffer.from("{ }");

    const res  = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type":     "application/json",
        "x-rbg-key-id":     hmac["x-rbg-key-id"],
        "x-rbg-timestamp":  hmac["x-rbg-timestamp"],
        "x-rbg-request-id": hmac["x-rbg-request-id"],
        "x-rbg-signature":  hmac["x-rbg-signature"],
      },
      body:   alteredBody,
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json() as Record<string, unknown>;
    assert.strictEqual(res.status,    401,                    "altered body → 401");
    assert.strictEqual(body["error"], "AUTHENTICATION_FAILED", "error = AUTHENTICATION_FAILED");
  },
);

test("E10: enabled POST body > 64 KiB → 413 PAYLOAD_TOO_LARGE", { timeout: 10_000 }, async () => {
  const largeBody = Buffer.alloc(66_000, 0x7b); // 66000 bytes of '{'
  const res  = await fetch(`${enabledSrv.baseUrl}${RBG_PATH}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: largeBody, signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json() as Record<string, unknown>;
  assert.strictEqual(res.status,    413,                "body > 64 KiB → 413");
  assert.strictEqual(body["error"], "PAYLOAD_TOO_LARGE", "error = PAYLOAD_TOO_LARGE");
});

test("E11: enabled GET /api/healthz → 200 { status: 'ok' }", { timeout: 10_000 }, async () => {
  const res  = await fetch(`${enabledSrv.baseUrl}/api/healthz`, { signal: AbortSignal.timeout(5_000) });
  const body = await res.json() as Record<string, unknown>;
  assert.strictEqual(res.status,     200,  "healthz must return 200 when RBG is enabled");
  assert.strictEqual(body["status"], "ok", "healthz must return { status: 'ok' }");
});

test(
  "E12: enabled POST /api/public/validate-promo with probe code → 200; proves express.json() intact",
  { timeout: 10_000 },
  async () => {
    // This route reads req.body.code (string). If express.json() were broken
    // by the RBG mount, req.body would be undefined and the route would fail.
    const res  = await fetch(`${enabledSrv.baseUrl}/api/public/validate-promo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ code: "PROBE_DEFINITELY_NOT_REAL_C3B2TEST" }),
      signal: AbortSignal.timeout(5_000),
    });
    const body = await res.json() as Record<string, unknown>;
    assert.strictEqual(res.status,    200,                            "validate-promo → 200");
    assert.strictEqual(body["valid"],  false,                         "valid must be false");
    assert.strictEqual(body["error"], "Invalid or expired promo code", "error message must match");
  },
);
