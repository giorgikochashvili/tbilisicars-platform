/**
 * regional-notification-reporter.test.ts
 *
 * C2b-3b2: Reporter unit tests — 3 tests.
 *
 *   RP-1: exact event shape with key-set equality; resolves.
 *   RP-2: logger synchronous throw propagates unchanged.
 *   RP-3: logger Promise rejection propagates unchanged.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2b3b2
 */

import { test }  from "node:test";
import assert    from "node:assert/strict";
import {
  createRegionalNotificationFailureReporter,
} from "../../services/regional-notification-reporter.js";
import type {
  RegionalNotifyLogger,
  RegionalNotifyFailedEvent,
} from "../../services/regional-notification-reporter.js";

// ── RP-1: exact event shape and key-set equality ──────────────────────────────

test("RP-1: reporter emits exactly { code, correlationId, bookingId }; resolves", () => {
  let received: RegionalNotifyFailedEvent | undefined;

  const logger: RegionalNotifyLogger = {
    log(event: RegionalNotifyFailedEvent): void {
      received = event;
    },
  };

  const reporter = createRegionalNotificationFailureReporter(logger);
  const result   = reporter({ correlationId: "c-1", bookingId: 42 });

  assert.strictEqual(result, undefined, "sync logger: returns void");
  assert.ok(received !== undefined,     "logger was called");

  const keys = Object.keys(received!).sort();
  assert.deepStrictEqual(
    keys,
    ["bookingId", "code", "correlationId"],
    "exactly three keys — no extra fields",
  );

  assert.strictEqual(received!.code,          "RBG_NOTIFY_FAILED", "code");
  assert.strictEqual(received!.correlationId, "c-1",               "correlationId");
  assert.strictEqual(received!.bookingId,     42,                  "bookingId");
});

// ── RP-2: logger synchronous throw propagates unchanged ───────────────────────

test("RP-2: logger synchronous throw propagates unchanged from reporter", () => {
  const expected = new Error("logger-sync-throw");

  const logger: RegionalNotifyLogger = {
    log(_event: RegionalNotifyFailedEvent): void {
      throw expected;
    },
  };

  const reporter = createRegionalNotificationFailureReporter(logger);

  assert.throws(
    () => reporter({ correlationId: "c-2", bookingId: 99 }),
    (err: unknown) => {
      assert.strictEqual(err, expected, "exact same Error instance propagated");
      return true;
    },
    "sync throw must propagate",
  );
});

// ── RP-3: logger Promise rejection propagates unchanged ───────────────────────

test("RP-3: logger Promise rejection propagates unchanged from reporter", async () => {
  const expected = new Error("logger-async-reject");

  const logger: RegionalNotifyLogger = {
    log(_event: RegionalNotifyFailedEvent): Promise<void> {
      return Promise.reject(expected);
    },
  };

  const reporter     = createRegionalNotificationFailureReporter(logger);
  const resultPromise = reporter({ correlationId: "c-3", bookingId: 7 }) as Promise<void>;

  await assert.rejects(
    async () => resultPromise,
    (err: unknown) => {
      assert.strictEqual(err, expected, "exact same rejection instance propagated");
      return true;
    },
    "async rejection must propagate",
  );
});
