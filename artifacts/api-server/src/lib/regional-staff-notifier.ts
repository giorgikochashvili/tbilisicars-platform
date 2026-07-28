/**
 * regional-staff-notifier.ts
 *
 * C2b-3b1: Internal notification payload type, required notifier seam, and
 * bounded failure-reporter seam for the Regional Brands Gateway intake pipeline.
 *
 * No HTTP, no email, no Resend, no database, no process.env.
 * Production notifier implementation is deferred to C2b-3b2.
 */

import type { RegionalBrandCode }
  from "../repositories/regional-intake-write.repository.js";

// ── RegionalStaffNotification ─────────────────────────────────────────────────

/**
 * Internal payload carried by a CREATED service result and forwarded to the
 * staff notifier after the HTTP response has been written.
 *
 * Contains only committed data (from the transaction SUCCESS) and
 * validated/normalized service-level input.  Never contains raw DTO bytes,
 * parsedJson, HMAC credentials, or provider details.
 */
export interface RegionalStaffNotification {
  readonly bookingId:            number;
  readonly reference:            string;
  readonly brandCode:            RegionalBrandCode;
  readonly customerName:         string;
  readonly customerEmail:        string;
  readonly customerPhone:        string;
  readonly pickupDatetime:       string;   // ParsedWallClock.canonical
  readonly dropoffDatetime:      string;   // ParsedWallClock.canonical
  readonly pickupLocationName:   string;
  readonly dropoffLocationName:  string;
  readonly vehicleModelName:     string;
  readonly totalAmountCents:     number;
  readonly currency:             "EUR";
}

// ── RegionalStaffNotifier ─────────────────────────────────────────────────────

/**
 * Required notifier seam.  The production implementation (C2b-3b2) sends a
 * brand-aware staff email.  Tests inject a fake.
 *
 * The handler catches all rejections; the notifier must not silently swallow
 * failures — it should reject on provider failure so the handler's bounded
 * reporter can record the incident.
 */
export interface RegionalStaffNotifier {
  notify(input: RegionalStaffNotification): Promise<void>;
}

// ── RegionalNotificationFailureInput ─────────────────────────────────────────

/**
 * Bounded failure context passed to the reporter.
 *
 * Must never include: Error, message, stack, SQLSTATE, constraint, provider
 * response, customer PII, locations, vehicle model, amount, raw body, or
 * parsedJson.  Only correlationId and bookingId are permitted.
 */
export interface RegionalNotificationFailureInput {
  readonly correlationId: string;
  readonly bookingId:     number;
}

// ── RegionalNotificationFailureReporter ──────────────────────────────────────

/**
 * Required failure-reporter seam.
 *
 * The return type is `void | Promise<void>` so that async reporters are
 * expressible; the handler wraps the invocation in a contained Promise chain
 * that catches both synchronous throws and asynchronous rejections.
 */
export type RegionalNotificationFailureReporter =
  (input: RegionalNotificationFailureInput) => void | Promise<void>;
