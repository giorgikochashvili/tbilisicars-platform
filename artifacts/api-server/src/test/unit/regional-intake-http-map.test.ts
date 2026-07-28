/**
 * regional-intake-http-map.test.ts
 *
 * C2b-3a: Pure unit tests for mapSvcResultToHttp — 9 tests, one per
 * RegionalIntakeSvcResult kind.  No Express, no mocks, no async.
 *
 * Run via:
 *   pnpm --filter @workspace/api-server run test:unit:c2b3a
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSvcResultToHttp } from "../../routes/regional-intake-handler.js";
import type { RegionalStaffNotification } from "../../lib/regional-staff-notifier.js";

// ── Minimal valid notification fixture ───────────────────────────────────────

const FIXTURE_NOTIFICATION: RegionalStaffNotification = {
  bookingId:            1,
  reference:            "TC-00001",
  brandCode:            "batumicars",
  customerName:         "Test Customer",
  customerEmail:        "test@example.com",
  customerPhone:        "+995500000099",
  pickupDatetime:       "2026-09-01T10:00",
  dropoffDatetime:      "2026-09-05T10:00",
  pickupLocationName:   "Loc A",
  dropoffLocationName:  "Loc B",
  vehicleModelName:     "Model X",
  totalAmountCents:     15000,
  currency:             "EUR",
};

// M-1
test("M-1: CREATED → 201 with bookingId, reference, created:true; notification absent from body", () => {
  const result = mapSvcResultToHttp({
    kind:         "CREATED",
    bookingId:    1,
    reference:    "TC-AAA",
    created:      true,
    notification: FIXTURE_NOTIFICATION,
  });
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { bookingId: 1, reference: "TC-AAA", created: true });
  // notification must never leak into the HTTP body
  assert.ok(
    !Object.prototype.hasOwnProperty.call(result.body, "notification"),
    "notification must not appear in the HTTP response body",
  );
});

// M-2
test("M-2: REPLAYED → 200 with bookingId, reference, created:false", () => {
  const result = mapSvcResultToHttp({
    kind: "REPLAYED",
    bookingId: 2,
    reference: "TC-BBB",
    created: false,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { bookingId: 2, reference: "TC-BBB", created: false });
});

// M-3
test("M-3: VALIDATION_ERROR → 422 with error and issues", () => {
  const issues = [{ path: "vehicleModelId", code: "invalid_type" }] as const;
  const result = mapSvcResultToHttp({ kind: "VALIDATION_ERROR", issues });
  assert.equal(result.status, 422);
  assert.deepEqual(result.body, { error: "VALIDATION_ERROR", issues });
});

// M-4
test("M-4: INVALID_DATETIME → 422 with error key", () => {
  const result = mapSvcResultToHttp({ kind: "INVALID_DATETIME" });
  assert.equal(result.status, 422);
  assert.deepEqual(result.body, { error: "INVALID_DATETIME" });
});

// M-5
test("M-5: VEHICLE_MODEL_UNAVAILABLE → 422 with error key", () => {
  const result = mapSvcResultToHttp({ kind: "VEHICLE_MODEL_UNAVAILABLE" });
  assert.equal(result.status, 422);
  assert.deepEqual(result.body, { error: "VEHICLE_MODEL_UNAVAILABLE" });
});

// M-6
test("M-6: LOCATION_UNAVAILABLE → 422 with error key", () => {
  const result = mapSvcResultToHttp({ kind: "LOCATION_UNAVAILABLE" });
  assert.equal(result.status, 422);
  assert.deepEqual(result.body, { error: "LOCATION_UNAVAILABLE" });
});

// M-7
test("M-7: CONFLICT → 409 with error key", () => {
  const result = mapSvcResultToHttp({ kind: "CONFLICT" });
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: "CONFLICT" });
});

// M-8
test("M-8: SERVICE_UNAVAILABLE → 503 with error key", () => {
  const result = mapSvcResultToHttp({ kind: "SERVICE_UNAVAILABLE" });
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: "SERVICE_UNAVAILABLE" });
});

// M-9
test("M-9: INTERNAL_ERROR → 500 with error key", () => {
  const result = mapSvcResultToHttp({ kind: "INTERNAL_ERROR" });
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: "INTERNAL_ERROR" });
});
