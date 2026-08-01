/**
 * internal-rbg-rate-limit.test.ts
 *
 * C4a unit tests — 16 tests (U1–U16).
 *
 * ESM-safe strategy:
 *   U1–U2:  Call factory; check typeof.
 *   U3–U8:  Read INTERNAL_RBG_RATE_LIMIT_DEFAULTS directly — no module spying.
 *   U9–U11: Minimal in-process Express app with max=0 (every request rate-limited);
 *           assert 429 body, headers, and bounded log.
 *   U12–U13: Minimal in-process Express app with max=1 and trust proxy=1;
 *            assert IP-keyed bucket via X-Forwarded-For.
 *   U14–U15: Import ipKeyGenerator directly; assert IPv4/IPv4-in-IPv6 mapping.
 *   U16:    Inject MemoryStore; assert resetAll() restores window.
 *
 * No live DB, Resend, external network, or production environment.
 */

import { test }              from "node:test";
import assert                from "node:assert/strict";
import { createServer }      from "node:net";
import * as http             from "node:http";
import express               from "express";
import { MemoryStore, ipKeyGenerator } from "express-rate-limit";
import {
  INTERNAL_RBG_RATE_LIMIT_DEFAULTS,
  createInternalRbgRateLimiter,
} from "../../lib/internal-rbg-rate-limit.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

interface TestServer {
  baseUrl: string;
  close(): Promise<void>;
}

/**
 * Creates a minimal Express app with the rate limiter mounted on all routes.
 * A GET /test route returns 200 { ok: true }.
 *
 * trust proxy=1 is always set so X-Forwarded-For headers control req.ip.
 */
async function makeTestServer(
  limiterOpts: Parameters<typeof createInternalRbgRateLimiter>[0] = {},
): Promise<TestServer> {
  const port = await getFreePort();
  const app  = express();
  app.set("trust proxy", 1);
  app.use(createInternalRbgRateLimiter(limiterOpts));
  app.get("/test", (_req, res) => res.status(200).json({ ok: true }));

  return new Promise<TestServer>((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close(): Promise<void> {
          return new Promise<void>((res, rej) => {
            if (typeof (server as unknown as { closeAllConnections?: () => void }).closeAllConnections === "function") {
              (server as unknown as { closeAllConnections: () => void }).closeAllConnections();
            }
            server.close(err => (err ? rej(err) : res()));
          });
        },
      });
    });
    server.on("error", reject);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ═══════════════════════════════════════════════════════════════════════════════
// U1–U2: Factory callable
// ═══════════════════════════════════════════════════════════════════════════════

test("U1: factory with no opts returns a callable RequestHandler", () => {
  const handler = createInternalRbgRateLimiter();
  assert.equal(typeof handler, "function", "factory() must return a function");
});

test("U2: factory with custom windowMs / max / store returns a callable", () => {
  const store   = new MemoryStore();
  const handler = createInternalRbgRateLimiter({ windowMs: 5_000, max: 5, store });
  assert.equal(typeof handler, "function", "factory(opts) must return a function");
});

// ═══════════════════════════════════════════════════════════════════════════════
// U3–U8: Default configuration from INTERNAL_RBG_RATE_LIMIT_DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

test("U3: default windowMs is 60 000", () => {
  assert.equal(INTERNAL_RBG_RATE_LIMIT_DEFAULTS.windowMs, 60_000);
});

test("U4: default max is 30", () => {
  assert.equal(INTERNAL_RBG_RATE_LIMIT_DEFAULTS.max, 30);
});

test("U5: standardHeaders is true", () => {
  assert.equal(INTERNAL_RBG_RATE_LIMIT_DEFAULTS.standardHeaders, true);
});

test("U6: legacyHeaders is false", () => {
  assert.equal(INTERNAL_RBG_RATE_LIMIT_DEFAULTS.legacyHeaders, false);
});

test("U7: skipSuccessfulRequests is false", () => {
  assert.equal(INTERNAL_RBG_RATE_LIMIT_DEFAULTS.skipSuccessfulRequests, false);
});

test("U8: skipFailedRequests is false", () => {
  assert.equal(INTERNAL_RBG_RATE_LIMIT_DEFAULTS.skipFailedRequests, false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// U9–U11: 429 handler behavior (max=0 → every request is rate-limited)
// ═══════════════════════════════════════════════════════════════════════════════

test("U9: 429 handler body is {error:'RATE_LIMITED'} with application/json", async () => {
  const srv = await makeTestServer({ max: 0, windowMs: 100 });
  try {
    const res  = await fetch(`${srv.baseUrl}/test`, { signal: AbortSignal.timeout(5_000) });
    const body = await res.json() as Record<string, unknown>;
    assert.equal(res.status, 429, "status must be 429");
    const ct = res.headers.get("content-type") ?? "";
    assert.ok(ct.startsWith("application/json"), `content-type must be application/json; got: ${ct}`);
    assert.deepEqual(body, { error: "RATE_LIMITED" }, "body must be exactly {error:'RATE_LIMITED'}");
  } finally {
    await srv.close();
  }
});

test("U10: 429 handler sets x-rbg-request-id to a valid UUID v4", async () => {
  const srv = await makeTestServer({ max: 0, windowMs: 100 });
  try {
    const res = await fetch(`${srv.baseUrl}/test`, { signal: AbortSignal.timeout(5_000) });
    assert.equal(res.status, 429, "status must be 429");
    const id = res.headers.get("x-rbg-request-id") ?? "";
    assert.match(id, UUID_RE, `x-rbg-request-id must be a valid UUID v4; got: ${JSON.stringify(id)}`);
  } finally {
    await srv.close();
  }
});

test("U11: 429 handler emits bounded log event and no PII", async () => {
  const srv = await makeTestServer({ max: 0, windowMs: 100 });
  try {
    const messages: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { messages.push(args); };
    try {
      const res = await fetch(`${srv.baseUrl}/test`, { signal: AbortSignal.timeout(5_000) });
      assert.equal(res.status, 429, "status must be 429");
      await res.body?.cancel();
    } finally {
      console.warn = originalWarn;
    }

    const allText = messages.map(a => a.join(" ")).join("\n");
    assert.ok(
      messages.some(a => a[0] === "[rbg-rl] RATE_LIMITED"),
      `console.warn must be called with exactly "[rbg-rl] RATE_LIMITED"; got: ${JSON.stringify(messages)}`,
    );
    // No PII must appear in any warn message
    const piiPatterns = [/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, /keyId/i, /signature/i, /secret/i];
    for (const pat of piiPatterns) {
      assert.ok(!pat.test(allText), `warn message must not contain PII matching ${pat}; text: ${allText}`);
    }
  } finally {
    await srv.close();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// U12–U13: IP-keyed bucket (not keyed on x-rbg-key-id)
// ═══════════════════════════════════════════════════════════════════════════════

test(
  "U12: keyGenerator uses req.ip only — changing x-rbg-key-id does not evade same-IP bucket",
  async () => {
    // max=1: first request passes, second from same IP is rate-limited
    // regardless of different x-rbg-key-id header values.
    const srv = await makeTestServer({ max: 1, windowMs: 60_000 });
    try {
      const ip = "10.0.0.1";
      const res1 = await fetch(`${srv.baseUrl}/test`, {
        headers: { "X-Forwarded-For": ip, "x-rbg-key-id": "key-A" },
        signal: AbortSignal.timeout(5_000),
      });
      await res1.body?.cancel();
      assert.notEqual(res1.status, 429, "first request from 10.0.0.1 must not be 429");

      const res2 = await fetch(`${srv.baseUrl}/test`, {
        headers: { "X-Forwarded-For": ip, "x-rbg-key-id": "key-B" },
        signal: AbortSignal.timeout(5_000),
      });
      await res2.body?.cancel();
      assert.equal(
        res2.status, 429,
        "second request from same IP with different key-id must be 429 (bucket keyed on IP, not key-id)",
      );
    } finally {
      await srv.close();
    }
  },
);

test("U13: different req.ip values produce independent buckets", async () => {
  // max=1: exhaust bucket for IP1, IP2 still gets a fresh bucket.
  const srv = await makeTestServer({ max: 1, windowMs: 60_000 });
  try {
    const ip1 = "10.0.1.1";
    const ip2 = "10.0.1.2";

    // Exhaust bucket for ip1
    const r1a = await fetch(`${srv.baseUrl}/test`, {
      headers: { "X-Forwarded-For": ip1 },
      signal: AbortSignal.timeout(5_000),
    });
    await r1a.body?.cancel();
    assert.notEqual(r1a.status, 429, "ip1 request 1 must not be 429");

    const r1b = await fetch(`${srv.baseUrl}/test`, {
      headers: { "X-Forwarded-For": ip1 },
      signal: AbortSignal.timeout(5_000),
    });
    await r1b.body?.cancel();
    assert.equal(r1b.status, 429, "ip1 request 2 must be 429 (bucket exhausted)");

    // ip2 must have its own independent bucket
    const r2 = await fetch(`${srv.baseUrl}/test`, {
      headers: { "X-Forwarded-For": ip2 },
      signal: AbortSignal.timeout(5_000),
    });
    await r2.body?.cancel();
    assert.notEqual(r2.status, 429, "ip2 must not be 429 — it has an independent bucket");
  } finally {
    await srv.close();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// U14–U15: ipKeyGenerator IPv4 and IPv4-in-IPv6 mapping
// ═══════════════════════════════════════════════════════════════════════════════

test("U14: IPv4 address passes through ipKeyGenerator unchanged", () => {
  const key = ipKeyGenerator("1.2.3.4");
  assert.equal(key, "1.2.3.4", `ipKeyGenerator("1.2.3.4") must return "1.2.3.4"; got: ${key}`);
});

test("U15: IPv4-in-IPv6 maps to plain IPv4 by ipKeyGenerator", () => {
  const key = ipKeyGenerator("::ffff:1.2.3.4");
  assert.equal(
    key, "1.2.3.4",
    `ipKeyGenerator("::ffff:1.2.3.4") must return "1.2.3.4"; got: ${key}`,
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// U16: Deterministic window reset via injected MemoryStore
// ═══════════════════════════════════════════════════════════════════════════════

test("U16: deterministic window reset via injected MemoryStore", async () => {
  const store = new MemoryStore();
  const srv   = await makeTestServer({ max: 1, windowMs: 60_000, store });
  try {
    // Request 1: hits=1, 1 > 1? No → passes
    const r1 = await fetch(`${srv.baseUrl}/test`, { signal: AbortSignal.timeout(5_000) });
    await r1.body?.cancel();
    assert.notEqual(r1.status, 429, "first request must not be 429 (hits=1, max=1)");

    // Request 2: hits=2, 2 > 1? Yes → rate-limited
    const r2 = await fetch(`${srv.baseUrl}/test`, { signal: AbortSignal.timeout(5_000) });
    await r2.body?.cancel();
    assert.equal(r2.status, 429, "second request must be 429 (hits=2, max=1)");

    // Reset all counters
    await store.resetAll();

    // Request 3: hits reset to 1, 1 > 1? No → passes again
    const r3 = await fetch(`${srv.baseUrl}/test`, { signal: AbortSignal.timeout(5_000) });
    await r3.body?.cancel();
    assert.notEqual(r3.status, 429, "third request must not be 429 after resetAll()");
  } finally {
    await srv.close();
  }
});
