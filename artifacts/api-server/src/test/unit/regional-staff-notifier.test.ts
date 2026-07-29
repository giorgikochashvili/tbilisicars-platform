/**
 * regional-staff-notifier.test.ts
 *
 * C2b-3b2: Notifier/provider unit tests — 7 tests.
 *
 *   N-1: valid key + accepted result — resolves with exact mail payload.
 *   N-2: missing/blank/whitespace key rejects during send; createClient never called.
 *   N-3: blank/CRLF from/to addresses reject; provider never called.
 *   N-4: synchronous throws at getApiKey/createClient/emails.send map to delivery error.
 *   N-5: emails.send async rejection maps to delivery error.
 *   N-6: provider resolves with non-null error field maps to delivery error.
 *   N-7: table of malformed results all reject; only non-empty data.id resolves.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2b3b2
 */

import { test }  from "node:test";
import assert    from "node:assert/strict";
import {
  createResendMailClient,
  createRegionalStaffNotifier,
} from "../../services/regional-staff-notifier.impl.js";
import type {
  RegionalMailMessage,
  RegionalMailClient,
} from "../../services/regional-staff-notifier.impl.js";
import type { RegionalStaffNotification }
  from "../../lib/regional-staff-notifier.js";

// ── Shared constants and fixtures ─────────────────────────────────────────────

const DELIVERY_ERROR = "Regional staff email delivery failed";

function makeNotification(
  overrides: Partial<RegionalStaffNotification> = {},
): RegionalStaffNotification {
  return {
    bookingId:           42,
    reference:           "RBG-NOTIFIER-001",
    brandCode:           "batumicars",
    customerName:        "Test Customer",
    customerEmail:       "customer@test.com",
    customerPhone:       "+1234567890",
    pickupDatetime:      "2026-09-01T10:00",
    dropoffDatetime:     "2026-09-08T14:00",
    pickupLocationName:  "Test Pickup",
    dropoffLocationName: "Test Dropoff",
    vehicleModelName:    "Test Vehicle",
    totalAmountCents:    15000,
    currency:            "EUR",
    ...overrides,
  };
}

type ResendFake = {
  emails: {
    send(msg: RegionalMailMessage): Promise<unknown>;
    callCount:    number;
    lastMessage:  RegionalMailMessage | undefined;
  };
};

function makeFakeResend(
  sendImpl: (msg: RegionalMailMessage) => Promise<unknown>,
): ResendFake {
  let callCount   = 0;
  let lastMessage: RegionalMailMessage | undefined;

  const fake: ResendFake = {
    emails: {
      get callCount()    { return callCount; },
      get lastMessage()  { return lastMessage; },
      async send(msg: RegionalMailMessage): Promise<unknown> {
        callCount++;
        lastMessage = msg;
        return sendImpl(msg);
      },
    } as ResendFake["emails"],
  };
  return fake;
}

// ── N-1: successful exact mail payload ───────────────────────────────────────

test("N-1: valid key and accepted result — resolves with correct mail payload", async () => {
  let createClientCallCount = 0;

  const fake = makeFakeResend(async () => ({
    data: { id: "msg_abc123" },
    error: undefined,
  }));

  const getApiKey    = () => "test-key";
  const createClient = (key: string) => {
    createClientCallCount++;
    assert.strictEqual(key, "test-key", "createClient receives trimmed key");
    return fake as any;
  };

  const mailClient = createResendMailClient({ getApiKey, createClient });
  const notifier   = createRegionalStaffNotifier({
    mailClient,
    fromAddress: "from@example.com",
    toAddress:   "to@example.com",
  });

  await assert.doesNotReject(
    async () => notifier.notify(makeNotification({ brandCode: "batumicars", reference: "RBG-001" })),
    "should resolve",
  );

  assert.strictEqual(fake.emails.callCount,    1, "emails.send called once");
  assert.strictEqual(createClientCallCount,    1, "createClient called once");

  const msg = fake.emails.lastMessage!;
  assert.strictEqual(msg.from,    "Tbilisicars Reservations <from@example.com>", "from header");
  assert.strictEqual(msg.to,      "to@example.com",                              "to unchanged");
  assert.ok(msg.subject.includes("BATUMICARS"), "subject contains brand label");
  assert.ok(msg.html.length > 0,                "html non-empty");
  assert.ok(msg.text.length > 0,                "text non-empty");
});

// ── N-2: missing/blank/whitespace key rejects ────────────────────────────────

test("N-2: missing, blank, whitespace-only key rejects during send; createClient never called", async () => {
  const keyCases: Array<{ getApiKey: () => string | undefined; label: string }> = [
    { getApiKey: () => undefined, label: "undefined key" },
    { getApiKey: () => "",        label: "empty string key" },
    { getApiKey: () => "   ",     label: "whitespace-only key" },
  ];

  for (const { getApiKey, label } of keyCases) {
    let createClientCalled = false;
    const createClient = (_k: string) => { createClientCalled = true; return {} as any; };

    const mailClient = createResendMailClient({ getApiKey, createClient });
    const notifier   = createRegionalStaffNotifier({
      mailClient,
      fromAddress: "from@example.com",
      toAddress:   "to@example.com",
    });

    await assert.rejects(
      async () => notifier.notify(makeNotification()),
      (err: unknown) => {
        assert.ok(err instanceof Error,                  `${label}: must be Error`);
        assert.strictEqual(err.message, DELIVERY_ERROR,  `${label}: exact delivery error`);
        assert.ok(!err.message.includes("undefined"),    `${label}: raw key value absent`);
        assert.ok(!err.message.includes("   "),          `${label}: whitespace absent`);
        return true;
      },
      `${label}: must reject`,
    );

    assert.strictEqual(createClientCalled, false, `${label}: createClient never called`);
  }
});

// ── N-3: blank/CRLF from/to addresses reject ─────────────────────────────────

test("N-3: blank or CRLF from/to rejects; provider never called", async () => {
  const cases: Array<{ from: string; to: string; label: string }> = [
    { from: "",                    to: "to@example.com",   label: "blank from" },
    { from: "from\r@example.com",  to: "to@example.com",   label: "CR in from" },
    { from: "from\n@example.com",  to: "to@example.com",   label: "LF in from" },
    { from: "from@example.com",    to: "",                  label: "blank to" },
    { from: "from@example.com",    to: "to\r@example.com",  label: "CR in to" },
    { from: "from@example.com",    to: "to\n@example.com",  label: "LF in to" },
  ];

  for (const { from, to, label } of cases) {
    let providerCalled = false;
    const mailClient: RegionalMailClient = {
      async send(_msg: RegionalMailMessage): Promise<void> {
        providerCalled = true;
      },
    };

    const notifier = createRegionalStaffNotifier({
      mailClient,
      fromAddress: from,
      toAddress:   to,
    });

    await assert.rejects(
      async () => notifier.notify(makeNotification()),
      (err: unknown) => {
        assert.ok(err instanceof Error,                 `${label}: must be Error`);
        assert.strictEqual(err.message, DELIVERY_ERROR,  `${label}: exact delivery error`);
        return true;
      },
      `${label}: must reject`,
    );

    assert.strictEqual(providerCalled, false, `${label}: provider never called`);
  }
});

// ── N-4: synchronous throws at each stage map to delivery error ───────────────

test("N-4: synchronous throws at getApiKey/createClient/emails.send map to delivery error", async () => {
  type Stage = {
    label:               string;
    getApiKey:           () => string | undefined;
    createClientImpl:    (k: string) => any;
    expectNoCreateClient?: boolean;
  };

  const stages: Stage[] = [
    {
      label:               "getApiKey throws",
      getApiKey:           () => { throw new Error("key-err"); },
      createClientImpl:    (_k: string) => ({}),
      expectNoCreateClient: true,
    },
    {
      label:            "createClient throws",
      getApiKey:        () => "valid-key",
      createClientImpl: (_k: string) => { throw new Error("client-err"); },
    },
    {
      label:     "emails.send throws synchronously",
      getApiKey: () => "valid-key",
      createClientImpl: (_k: string) => ({
        emails: {
          send(_msg: RegionalMailMessage): Promise<unknown> {
            throw new Error("send-err");
          },
        },
      }),
    },
  ];

  for (const stage of stages) {
    let createClientCalled = false;
    const createClient = (k: string) => {
      createClientCalled = true;
      return stage.createClientImpl(k);
    };

    const mailClient = createResendMailClient({
      getApiKey:    stage.getApiKey,
      createClient,
    });
    const notifier = createRegionalStaffNotifier({
      mailClient,
      fromAddress: "from@example.com",
      toAddress:   "to@example.com",
    });

    await assert.rejects(
      async () => notifier.notify(makeNotification()),
      (err: unknown) => {
        assert.ok(err instanceof Error,                  `${stage.label}: must be Error`);
        assert.strictEqual(err.message, DELIVERY_ERROR,   `${stage.label}: exact delivery error`);
        assert.ok(!err.message.includes("key-err"),    `${stage.label}: key-err absent`);
        assert.ok(!err.message.includes("client-err"), `${stage.label}: client-err absent`);
        assert.ok(!err.message.includes("send-err"),   `${stage.label}: send-err absent`);
        return true;
      },
      `${stage.label}: must reject`,
    );

    if (stage.expectNoCreateClient) {
      assert.strictEqual(createClientCalled, false, `${stage.label}: createClient never called`);
    }
  }
});

// ── N-5: async rejection from emails.send ────────────────────────────────────

test("N-5: emails.send async rejection maps to delivery error; raw message absent", async () => {
  const fake = makeFakeResend(async () => {
    return Promise.reject(new Error("async-send-failure"));
  });

  const mailClient = createResendMailClient({
    getApiKey:    () => "valid-key",
    createClient: () => fake as any,
  });
  const notifier = createRegionalStaffNotifier({
    mailClient,
    fromAddress: "from@example.com",
    toAddress:   "to@example.com",
  });

  await assert.rejects(
    async () => notifier.notify(makeNotification()),
    (err: unknown) => {
      assert.ok(err instanceof Error,                      "must be Error");
      assert.strictEqual(err.message, DELIVERY_ERROR,      "exact delivery error");
      assert.ok(!err.message.includes("async-send-failure"), "raw rejection absent");
      return true;
    },
    "must reject with delivery error",
  );
});

// ── N-6: provider resolves with non-null error field ─────────────────────────

test("N-6: provider error field maps to delivery error; raw provider detail absent", async () => {
  const fake = makeFakeResend(async () => ({
    data:  undefined,
    error: { message: "quota exceeded" },
  }));

  const mailClient = createResendMailClient({
    getApiKey:    () => "valid-key",
    createClient: () => fake as any,
  });
  const notifier = createRegionalStaffNotifier({
    mailClient,
    fromAddress: "from@example.com",
    toAddress:   "to@example.com",
  });

  await assert.rejects(
    async () => notifier.notify(makeNotification()),
    (err: unknown) => {
      assert.ok(err instanceof Error,                    "must be Error");
      assert.strictEqual(err.message, DELIVERY_ERROR,    "exact delivery error");
      assert.ok(!err.message.includes("quota exceeded"), "raw provider error absent");
      return true;
    },
    "must reject with delivery error",
  );
});

// ── N-7: table of malformed results; only non-empty data.id resolves ──────────

test("N-7: malformed provider results all reject; only non-empty data.id resolves", async () => {
  const rejectCases: Array<{ result: unknown; label: string }> = [
    { result: null,                           label: "null" },
    { result: undefined,                      label: "undefined" },
    { result: 42,                             label: "42 (primitive non-object)" },
    { result: {},                             label: "{}" },
    { result: { data: null },                 label: "{ data: null }" },
    { result: { data: {} },                   label: "{ data: {} }" },
    { result: { data: { id: null } },         label: "{ data: { id: null } }" },
    { result: { data: { id: "" } },           label: `{ data: { id: "" } }` },
    { result: { data: { id: "   " } },        label: `{ data: { id: "   " } }` },
  ];

  for (const { result, label } of rejectCases) {
    const fake = makeFakeResend(async () => result);
    const mailClient = createResendMailClient({
      getApiKey:    () => "valid-key",
      createClient: () => fake as any,
    });
    const notifier = createRegionalStaffNotifier({
      mailClient,
      fromAddress: "from@example.com",
      toAddress:   "to@example.com",
    });

    await assert.rejects(
      async () => notifier.notify(makeNotification()),
      (err: unknown) => {
        assert.ok(err instanceof Error,                 `${label}: must be Error`);
        assert.strictEqual(err.message, DELIVERY_ERROR,  `${label}: exact delivery error`);
        return true;
      },
      `${label}: must reject`,
    );
  }

  // Only accepted case: non-empty trimmed data.id
  const acceptedFake = makeFakeResend(async () => ({
    data:  { id: "valid-id" },
    error: undefined,
  }));
  const acceptedMailClient = createResendMailClient({
    getApiKey:    () => "valid-key",
    createClient: () => acceptedFake as any,
  });
  const acceptedNotifier = createRegionalStaffNotifier({
    mailClient:  acceptedMailClient,
    fromAddress: "from@example.com",
    toAddress:   "to@example.com",
  });

  await assert.doesNotReject(
    async () => acceptedNotifier.notify(makeNotification()),
    `{ data: { id: "valid-id" } } must resolve`,
  );
});
