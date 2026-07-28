/**
 * regional-intake-handler.ts
 *
 * C2b-3b1: Authenticated handler and pure HTTP mapper for the Regional Brands
 * Gateway intake pipeline.
 *
 * ZERO runtime side effects at import time.
 * No route is mounted in production after this phase.
 * No email, PDF, voucher, database, pool, process.env, dynamic import, or
 * require usage.
 */

import type {
  RegionalIntakeServiceFn,
  RegionalIntakeSvcResult,
} from "../services/regional-intake.service.js";
import type { AuthenticatedRbgHandler } from "./internal-rbg-router.js";
import type {
  RegionalStaffNotifier,
  RegionalNotificationFailureReporter,
} from "../lib/regional-staff-notifier.js";

// ── Never guard — module-private, never exported ──────────────────────────────
// Enforces exhaustiveness at compile time: TypeScript errors here if a new
// RegionalIntakeSvcResult kind is added without a corresponding switch case.
// Fixed message — never stringifies or exposes the value.
function assertNever(value: never): never {
  throw new Error("Unreachable RegionalIntakeSvcResult");
}

// ── Pure HTTP mapper ──────────────────────────────────────────────────────────

export function mapSvcResultToHttp(
  result: RegionalIntakeSvcResult,
): { status: number; body: unknown } {
  switch (result.kind) {
    case "CREATED":
      return {
        status: 201,
        body: { bookingId: result.bookingId, reference: result.reference, created: true },
      };
    case "REPLAYED":
      return {
        status: 200,
        body: { bookingId: result.bookingId, reference: result.reference, created: false },
      };
    case "VALIDATION_ERROR":
      return {
        status: 422,
        body: { error: "VALIDATION_ERROR", issues: result.issues },
      };
    case "INVALID_DATETIME":
      return { status: 422, body: { error: "INVALID_DATETIME" } };
    case "VEHICLE_MODEL_UNAVAILABLE":
      return { status: 422, body: { error: "VEHICLE_MODEL_UNAVAILABLE" } };
    case "LOCATION_UNAVAILABLE":
      return { status: 422, body: { error: "LOCATION_UNAVAILABLE" } };
    case "CONFLICT":
      return { status: 409, body: { error: "CONFLICT" } };
    case "SERVICE_UNAVAILABLE":
      return { status: 503, body: { error: "SERVICE_UNAVAILABLE" } };
    case "INTERNAL_ERROR":
      return { status: 500, body: { error: "INTERNAL_ERROR" } };
    default:
      return assertNever(result);
  }
}

// ── Handler factory ───────────────────────────────────────────────────────────

/**
 * Returns a synchronous void AuthenticatedRbgHandler that owns an internal
 * Promise rejection bridge.
 *
 * The router calls the handler without await and its synchronous try/catch
 * cannot observe a later-rejected Promise.  The handler therefore:
 *   - returns void (never exposes the internal Promise);
 *   - invokes the service inside Promise.resolve().then(...) so both
 *     synchronous throws and async rejections enter the same rejection chain;
 *   - writes exactly one JSON response on success and never calls next();
 *   - forwards all service/mapper/response-write failures to next(err).
 *
 * For CREATED results only, after the response is written, a separate void
 * Promise chain calls the notifier once (best-effort, at-most-once).  Any
 * notifier failure is caught and forwarded to the bounded reporter — both
 * the reporter's synchronous throws and async rejections are swallowed inside
 * a contained inner Promise chain.  Notifier/reporter failure never reaches
 * next(err) and never triggers a second response write.
 */
export function createRegionalIntakeHandler(deps: {
  service:                    RegionalIntakeServiceFn;
  notifier:                   RegionalStaffNotifier;
  reportNotificationFailure:  RegionalNotificationFailureReporter;
}): AuthenticatedRbgHandler {
  return (ctx, _req, res, next): void => {
    void Promise.resolve()
      .then(() =>
        deps.service({
          // ctx.brandCode is the authenticated router-side opaque branded string.
          // The service parameter uses the canonical "batumicars" | "kutaisicars"
          // union.  The runtime value originates from enabled-client metadata
          // constrained to those canonical brand codes; the cast bridges the
          // duplicate semantic brand boundary without changing the runtime value.
          brandCode:  ctx.brandCode as unknown as Parameters<RegionalIntakeServiceFn>[0]["brandCode"],
          parsedJson: ctx.parsedJson,
        }),
      )
      .then((result) => {
        const { status, body } = mapSvcResultToHttp(result);
        res.status(status).json(body);

        if (result.kind === "CREATED") {
          void Promise.resolve()
            .then(() => deps.notifier.notify(result.notification))
            .catch(() => {
              void Promise.resolve()
                .then(() =>
                  deps.reportNotificationFailure({
                    correlationId: ctx.correlationId,
                    bookingId:     result.bookingId,
                  }),
                )
                .catch(() => {
                  // reporter failure intentionally swallowed
                });
            });
        }

        return;
      })
      .catch((err: unknown) => {
        next(err);
      });
  };
}
