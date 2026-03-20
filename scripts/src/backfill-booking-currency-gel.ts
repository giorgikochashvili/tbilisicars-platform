/**
 * Backfill: Set booking currency = 'GEL' for all rows where currency = 'USD'
 *
 * Context: Before Task #8 the booking.currency column defaulted to 'USD'.
 * The CRM create-booking form never had a currency picker, so every CRM-created
 * booking silently received the 'USD' default — even though all amounts are GEL.
 * This script converts those implicit-USD rows to GEL.
 *
 * Idempotent: safe to run more than once (WHERE currency = 'USD' only).
 *
 * Already executed on 2026-03-20 via psql:
 *   UPDATE booking SET currency = 'GEL' WHERE currency = 'USD';
 *   → 11 rows updated; all 23 bookings now have currency='GEL'.
 */

import { db, bookingTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const result = await db
    .update(bookingTable)
    .set({ currency: "GEL" })
    .where(eq(bookingTable.currency, "USD"))
    .returning({ id: bookingTable.id });

  console.log(`Updated ${result.length} booking(s) from USD → GEL`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
