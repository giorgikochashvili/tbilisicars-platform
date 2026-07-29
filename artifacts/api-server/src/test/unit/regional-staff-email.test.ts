/**
 * regional-staff-email.test.ts
 *
 * C2b-3b2: Renderer unit tests — 5 tests.
 *
 *   R-1: BATUMICARS subject/html/text; WEBSITE absent.
 *   R-2: KUTAISICARS subject/html/text; WEBSITE absent.
 *   R-3: HTML escaping of all dynamic fields; no mailto.
 *   R-4: Date-free wall-clock formatting + invalid calendar/range rejection.
 *   R-5: EUR formatter table + invalid inputs reject with rendering error.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2b3b2
 */

import { test }  from "node:test";
import assert    from "node:assert/strict";
import {
  renderRegionalStaffEmail,
} from "../../services/regional-staff-email.js";
import type { RegionalStaffNotification }
  from "../../lib/regional-staff-notifier.js";

// ── Shared fixture factory ────────────────────────────────────────────────────

function makeNotification(
  overrides: Partial<RegionalStaffNotification> = {},
): RegionalStaffNotification {
  return {
    bookingId:           1,
    reference:           "RBG-TEST-001",
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

const RENDERING_ERROR = "Regional staff email rendering failed";

// ── R-1: BATUMICARS rendering + WEBSITE absence ───────────────────────────────

test("R-1: batumicars — subject/html/text contain BATUMICARS; WEBSITE absent", () => {
  const ref    = "RBG-BATU-001";
  const result = renderRegionalStaffEmail(
    makeNotification({ brandCode: "batumicars", reference: ref }),
  );

  assert.ok(result.subject.includes("BATUMICARS"), "subject contains BATUMICARS");
  assert.ok(result.subject.includes(ref),          "subject contains reference");
  assert.ok(result.html.includes("BATUMICARS"),    "html contains BATUMICARS");
  assert.ok(result.text.includes("BATUMICARS"),    "text contains BATUMICARS");

  assert.ok(!result.subject.includes("WEBSITE"), "subject: WEBSITE absent");
  assert.ok(!result.html.includes("WEBSITE"),    "html: WEBSITE absent");
  assert.ok(!result.text.includes("WEBSITE"),    "text: WEBSITE absent");
});

// ── R-2: KUTAISICARS rendering + WEBSITE absence ──────────────────────────────

test("R-2: kutaisicars — subject/html/text contain KUTAISICARS; WEBSITE absent", () => {
  const ref    = "RBG-KUTI-001";
  const result = renderRegionalStaffEmail(
    makeNotification({ brandCode: "kutaisicars", reference: ref }),
  );

  assert.ok(result.subject.includes("KUTAISICARS"), "subject contains KUTAISICARS");
  assert.ok(result.subject.includes(ref),           "subject contains reference");
  assert.ok(result.html.includes("KUTAISICARS"),    "html contains KUTAISICARS");
  assert.ok(result.text.includes("KUTAISICARS"),    "text contains KUTAISICARS");

  assert.ok(!result.subject.includes("WEBSITE"), "subject: WEBSITE absent");
  assert.ok(!result.html.includes("WEBSITE"),    "html: WEBSITE absent");
  assert.ok(!result.text.includes("WEBSITE"),    "text: WEBSITE absent");
});

// ── R-3: HTML escaping of all dynamic fields; no mailto ───────────────────────

test("R-3: HTML escaping of all externally-sourced fields; no mailto attribute", () => {
  const dangerous = `<>&"'`;
  const result = renderRegionalStaffEmail(makeNotification({
    reference:           `ref${dangerous}ref`,
    customerName:        `name${dangerous}`,
    customerEmail:       `email${dangerous}@test.com`,
    customerPhone:       `+${dangerous}123`,
    pickupLocationName:  `pickup${dangerous}loc`,
    dropoffLocationName: `dropoff${dangerous}loc`,
    vehicleModelName:    `car${dangerous}model`,
  }));

  assert.ok(result.html.includes("&amp;"),  "& escaped to &amp;");
  assert.ok(result.html.includes("&lt;"),   "< escaped to &lt;");
  assert.ok(result.html.includes("&gt;"),   "> escaped to &gt;");
  assert.ok(result.html.includes("&quot;"), `" escaped to &quot;`);
  assert.ok(result.html.includes("&#39;"),  `' escaped to &#39;`);
  assert.ok(!result.html.includes("mailto:"), "no mailto: in HTML");
});

// ── R-4: Date-free wall-clock formatting + range validation ───────────────────

test("R-4: formatWallClock — date-free valid output and invalid calendar/range rejection", () => {
  // Part 1: valid datetime — Date replaced with a throwing test double
  const OriginalDate = (globalThis as { Date: unknown }).Date;
  try {
    (globalThis as { Date: unknown }).Date = function ThrowingDate() {
      throw new Error("Date constructor must not be called");
    };
    Object.assign((globalThis as { Date: unknown }).Date as object, {
      now:   () => { throw new Error("Date.now must not be called");   },
      parse: () => { throw new Error("Date.parse must not be called"); },
    });

    const result = renderRegionalStaffEmail(makeNotification({
      pickupDatetime:  "2026-09-01T10:00",
      dropoffDatetime: "2026-10-15T14:30",
    }));

    assert.ok(result.html.includes("01 Sep 2026, 10:00"), "valid pickup in html");
    assert.ok(result.text.includes("01 Sep 2026, 10:00"), "valid pickup in text");
    assert.ok(result.html.includes("15 Oct 2026, 14:30"), "valid dropoff in html");
  } finally {
    (globalThis as { Date: unknown }).Date = OriginalDate;
  }

  // Part 2: invalid ranges — all must reject with exact rendering error
  const invalidCases: Array<{ dt: string; label: string }> = [
    { dt: "2026-99-01T10:00", label: "invalid month 99" },
    { dt: "2026-01-99T10:00", label: "invalid day 99" },
    { dt: "2023-02-29T10:00", label: "non-leap Feb 29 (2023)" },
    { dt: "2026-01-01T25:00", label: "invalid hour 25" },
    { dt: "2026-01-01T10:99", label: "invalid minute 99" },
  ];

  for (const { dt, label } of invalidCases) {
    assert.throws(
      () => renderRegionalStaffEmail(
        makeNotification({ pickupDatetime: dt, dropoffDatetime: "2026-10-01T12:00" }),
      ),
      (err: unknown) => {
        assert.ok(err instanceof Error,                 `${label}: must be Error`);
        assert.strictEqual(err.message, RENDERING_ERROR, `${label}: exact error message`);
        return true;
      },
      `${label}: must throw rendering error`,
    );
  }
});

// ── R-5: EUR formatter table + invalid inputs ─────────────────────────────────

test("R-5: formatEurCents — valid table and invalid inputs reject with rendering error", () => {
  // Valid cases
  const validCases: Array<[number, string]> = [
    [0,     "0.00 EUR"],
    [999,   "9.99 EUR"],
    [15000, "150.00 EUR"],
  ];

  for (const [cents, expected] of validCases) {
    const result = renderRegionalStaffEmail(makeNotification({ totalAmountCents: cents }));
    assert.ok(
      result.html.includes(expected),
      `html contains "${expected}" for ${cents} cents`,
    );
    assert.ok(
      result.text.includes(expected),
      `text contains "${expected}" for ${cents} cents`,
    );
  }

  // Invalid cases
  const invalidCases: Array<{ cents: number; label: string }> = [
    { cents: 1.5,                         label: "non-integer 1.5" },
    { cents: -1,                          label: "negative -1" },
    { cents: Number.MAX_SAFE_INTEGER + 1, label: "MAX_SAFE_INTEGER + 1" },
  ];

  for (const { cents, label } of invalidCases) {
    assert.throws(
      () => renderRegionalStaffEmail(makeNotification({ totalAmountCents: cents })),
      (err: unknown) => {
        assert.ok(err instanceof Error,                 `${label}: must be Error`);
        assert.strictEqual(err.message, RENDERING_ERROR, `${label}: exact error message`);
        return true;
      },
      `${label}: must throw rendering error`,
    );
  }
});
