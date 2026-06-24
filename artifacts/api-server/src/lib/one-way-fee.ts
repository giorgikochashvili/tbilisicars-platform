/**
 * Minimal structural interface for a pg Pool — avoids importing the pg package directly.
 * Any `pg.Pool` instance satisfies this shape.
 */
interface QueryablePool {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}

/**
 * Resolves the one-way transfer fee for a given pickup/dropoff location pair.
 *
 * Priority order:
 *   A. Resolve city values for both locations.
 *   B. Same location ID → null (no fee).
 *   C. Same city → null (no fee, blocks accidental intra-city rows).
 *   D. Exact direction lookup   (from=pickup, to=dropoff).
 *   E. Reverse direction lookup (from=dropoff, to=pickup).
 *   F. City-level fallback — only when exactly one distinct positive fee
 *      exists for that city pair in either direction.
 *      Returns null and logs a warning if multiple distinct amounts are found.
 */
export async function resolveOneWayFee(
  pool: QueryablePool,
  pickupLocId: number,
  dropoffLocId: number,
): Promise<number | null> {
  // Step A — resolve city values for both location IDs in one query.
  const { rows: locRows } = await pool.query<{ id: number; city: string | null }>(
    `SELECT id, city FROM location WHERE id = ANY($1::int[])`,
    [[pickupLocId, dropoffLocId]],
  );
  const cityMap = new Map<number, string | null>(locRows.map((r) => [r.id, r.city]));
  const pickupCity = cityMap.get(pickupLocId) ?? null;
  const dropoffCity = cityMap.get(dropoffLocId) ?? null;

  // Step B — same location ID.
  if (pickupLocId === dropoffLocId) return null;

  // Step C — same city (blocks intra-city sub-location pairs).
  if (pickupCity !== null && dropoffCity !== null && pickupCity === dropoffCity) return null;

  // Step D — exact direction.
  const { rows: exactRows } = await pool.query<{ fee: string }>(
    `SELECT fee FROM one_way_fees WHERE from_location_id = $1 AND to_location_id = $2 LIMIT 1`,
    [pickupLocId, dropoffLocId],
  );
  if (exactRows[0] && Number(exactRows[0].fee) > 0) {
    return Number(exactRows[0].fee);
  }

  // Step E — exact reverse direction.
  const { rows: reverseRows } = await pool.query<{ fee: string }>(
    `SELECT fee FROM one_way_fees WHERE from_location_id = $1 AND to_location_id = $2 LIMIT 1`,
    [dropoffLocId, pickupLocId],
  );
  if (reverseRows[0] && Number(reverseRows[0].fee) > 0) {
    return Number(reverseRows[0].fee);
  }

  // Step F — city-level fallback (only when both cities are known and different).
  if (pickupCity === null || dropoffCity === null) return null;

  const { rows: cityRows } = await pool.query<{ fee: string }>(
    `SELECT DISTINCT owf.fee
     FROM one_way_fees owf
     JOIN location fl ON owf.from_location_id = fl.id
     JOIN location tl ON owf.to_location_id = tl.id
     WHERE (
       (fl.city = $1 AND tl.city = $2)
       OR
       (fl.city = $2 AND tl.city = $1)
     )
     AND owf.fee > 0`,
    [pickupCity, dropoffCity],
  );

  if (cityRows.length === 0) return null;

  if (cityRows.length === 1) {
    return Number(cityRows[0].fee);
  }

  // Multiple distinct amounts — do not pick one arbitrarily.
  console.warn(
    `[one-way-fee] Inconsistent city-pair fee config for "${pickupCity}" ↔ "${dropoffCity}": ` +
      `found ${cityRows.length} distinct amounts (${cityRows.map((r) => r.fee).join(", ")}). Skipping fee.`,
  );
  return null;
}
