/**
 * Canonical rental day-count calculation used by the website quote and booking endpoints.
 *
 * Rules (per spec):
 *   1. Count full 24-hour blocks elapsed between pickup and dropoff (floor).
 *   2. Compute the remaining time beyond those full blocks.
 *      - 0 – 120 minutes remaining → no extra day.
 *      - 121+ minutes remaining   → add 1 extra day.
 *   3. Enforce a minimum of 2 chargeable days.
 */
export function calculateChargeableDays(pickup: Date, dropoff: Date): number {
  const elapsedMs = dropoff.getTime() - pickup.getTime();
  const fullBlocks = Math.floor(elapsedMs / 86_400_000);
  const remainderMinutes = (elapsedMs - fullBlocks * 86_400_000) / 60_000;
  const extraDay = remainderMinutes > 120 ? 1 : 0;
  return Math.max(2, fullBlocks + extraDay);
}
