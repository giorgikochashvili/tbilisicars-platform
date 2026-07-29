/**
 * regional-notification-reporter.ts
 *
 * C2b-3b2: Bounded failure reporter factory for Regional Brands Gateway
 * staff notification failures.
 *
 * No Resend. No process.env. No DB. No routing. No logging.
 */

import type { RegionalNotificationFailureReporter }
  from "../lib/regional-staff-notifier.js";

// ── Public exported types ─────────────────────────────────────────────────────

export interface RegionalNotifyFailedEvent {
  readonly code:          "RBG_NOTIFY_FAILED";
  readonly correlationId: string;
  readonly bookingId:     number;
}

export interface RegionalNotifyLogger {
  log(event: RegionalNotifyFailedEvent): void | Promise<void>;
}

// ── Public factory ────────────────────────────────────────────────────────────

export function createRegionalNotificationFailureReporter(
  logger: RegionalNotifyLogger,
): RegionalNotificationFailureReporter {
  return function reportNotificationFailure({ correlationId, bookingId }) {
    const event: RegionalNotifyFailedEvent = {
      code:          "RBG_NOTIFY_FAILED",
      correlationId,
      bookingId,
    };
    return logger.log(event);
  };
}
