/**
 * seed-dev-extended.ts
 *
 * DEVELOPMENT-ONLY supplementary seed script.
 * Adds realistic test data on top of whatever already exists in the DB.
 * Every section is fully idempotent — safe to run multiple times.
 *
 * Run: pnpm --filter @workspace/scripts seed:dev:extended
 *
 * What this seeds:
 *  1. 6 new customers (international names, long Georgian names, varied phones)
 *  2. 5 new bookings (2 PENDING, 1 NO_SHOW, 1 DELIVERED/PAID, 1 RETURNED/PAID)
 *  3. PICKUP handovers for existing DELIVERED bookings 1 & 2 (had none)
 *  4. PICKUP + DROPOFF handovers for existing RETURNED bookings 3, 4, 5
 *  5. PICKUP + DROPOFF handovers for the new DELIVERED/RETURNED bookings above
 *  6. payment rows (payment table only) for all PAID bookings that have no row yet
 *  7. Monitoring notes for bookings that appear in the Monitoring page
 *
 * Deliberately NOT seeded:
 *  - booking_payment rows  (require accounting_entries + convertedGel chain)
 *  - accounting_entries rows
 *  - HALF / PREPAID / REFUNDED payment states
 *  - EUR/USD bookings
 */

// ─── Production guard ─────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  console.error(
    "[seed-dev-extended] ERROR: This script must never run in production.",
  );
  process.exit(1);
}

import {
  db,
  userTable,
  bookingTable,
  bookingHandoverTable,
  monitoringNoteTable,
  locationTable,
  paymentTable,
} from "@workspace/db";
import { eq, and, count, sql, isNull, inArray } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysFromNow(days: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

// ─── 1. Extended customers ────────────────────────────────────────────────────
// All inserted with ON CONFLICT DO NOTHING on the partial unique index
// uq_user_email_not_null (email WHERE email IS NOT NULL).

async function seedExtendedCustomers() {
  const rows = [
    {
      fullName: "Aleksandre Akhvlediani-Tsiklauri",
      phone: "+995591200010",
      email: "aleksandre.at@dev.ge",
      country: "Georgia",
    },
    {
      fullName: "Nino Chikvanaia-Maisuradze Tvalchrelidze",
      phone: "+995591200011",
      email: "nino.cmt@dev.ge",
      country: "Georgia",
    },
    {
      fullName: "Klaus-Heinrich Müller",
      phone: "+4915112345678",
      email: "k.mueller@dev.de",
      country: "Germany",
    },
    {
      fullName: "Sophie Dupont-Beauchamp",
      phone: "+33612345678",
      email: "sophie.db@dev.fr",
      country: "France",
    },
    {
      fullName: "James Harrison-Whitfield",
      phone: "+447911123456",
      email: "james.hw@dev.uk",
      country: "United Kingdom",
    },
    {
      fullName: "Michael Rodriguez",
      phone: "+12125550199",
      email: "michael.r@dev.us",
      country: "United States",
    },
  ];

  const result = await db
    .insert(userTable)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: userTable.id });
  console.log(
    `  customers: ${result.length} inserted, ${rows.length - result.length} skipped`,
  );
}

// ─── 2. New bookings ──────────────────────────────────────────────────────────
// Skipped entirely if any reservation_code starting with 'DEV-' already exists.
// New booking types:
//   DEV-P1  PENDING / UNPAID   — future, on-request (no vehicle)
//   DEV-P2  PENDING / UNPAID   — future, on-request, different city
//   DEV-NS1 NO_SHOW / UNPAID   — past, on-request
//   DEV-D1  DELIVERED / PAID   — picked up today, no vehicle assigned
//   DEV-R1  RETURNED / PAID    — pickup 8 days ago, dropoff 3 days ago

async function seedExtendedBookings() {
  const [{ existing }] = await db
    .select({ existing: count() })
    .from(bookingTable)
    .where(sql`reservation_code LIKE 'DEV-%'`);
  if (Number(existing) > 0) {
    console.log(`  bookings: skipped (${existing} DEV- bookings already exist)`);
    return;
  }

  // Fetch user IDs by email
  const users = await db
    .select({ id: userTable.id, email: userTable.email })
    .from(userTable)
    .where(
      inArray(userTable.email, [
        "aleksandre.at@dev.ge",
        "nino.cmt@dev.ge",
        "k.mueller@dev.de",
        "sophie.db@dev.fr",
        "james.hw@dev.uk",
        "michael.r@dev.us",
      ]),
    );
  const uMap = new Map(users.map((u) => [u.email!, u.id]));

  const aleksId = uMap.get("aleksandre.at@dev.ge");
  const ninoId  = uMap.get("nino.cmt@dev.ge");
  const klausId = uMap.get("k.mueller@dev.de");
  const sophieId = uMap.get("sophie.db@dev.fr");
  const jamesId = uMap.get("james.hw@dev.uk");

  if (!aleksId || !ninoId || !klausId || !sophieId || !jamesId) {
    console.warn(
      "  bookings: skipped — extended customers not found, run seedExtendedCustomers first",
    );
    return;
  }

  // Fetch location IDs
  const locations = await db
    .select({ id: locationTable.id, name: locationTable.name })
    .from(locationTable);
  const lMap = new Map(locations.map((l) => [l.name, l.id]));

  const tbilisiAirport = lMap.get("Tbilisi International Airport");
  const tbilisiCity    = lMap.get("Tbilisi City Center");
  const kutaisi        = lMap.get("Kutaisi International Airport");
  const batumi         = lMap.get("Batumi Sea Port");

  if (!tbilisiAirport || !tbilisiCity || !kutaisi || !batumi) {
    console.warn("  bookings: skipped — expected locations not found");
    return;
  }

  const rows = [
    // DEV-P1: PENDING — Aleksandre, Tbilisi, future
    {
      reservationCode:  "DEV-P1",
      userId:           aleksId,
      pickupLocationId: tbilisiAirport,
      dropoffLocationId: tbilisiCity,
      pickupDatetime:   daysFromNow(7, 11),
      dropoffDatetime:  daysFromNow(10, 11),
      status:           "PENDING"  as const,
      paymentStatus:    "UNPAID"   as const,
      totalAmount:      "270.00",
      currency:         "GEL",
      contactFullName:  "Aleksandre Akhvlediani-Tsiklauri",
      contactPhone:     "+995591200010",
      contactEmail:     "aleksandre.at@dev.ge",
      source:           "admin",
    },
    // DEV-P2: PENDING — Nino, Kutaisi, far future
    {
      reservationCode:  "DEV-P2",
      userId:           ninoId,
      pickupLocationId: kutaisi,
      dropoffLocationId: kutaisi,
      pickupDatetime:   daysFromNow(21, 9),
      dropoffDatetime:  daysFromNow(25, 9),
      status:           "PENDING"  as const,
      paymentStatus:    "UNPAID"   as const,
      totalAmount:      "360.00",
      currency:         "GEL",
      contactFullName:  "Nino Chikvanaia-Maisuradze Tvalchrelidze",
      contactPhone:     "+995591200011",
      contactEmail:     "nino.cmt@dev.ge",
      source:           "admin",
    },
    // DEV-NS1: NO_SHOW — Klaus, Tbilisi, past
    {
      reservationCode:  "DEV-NS1",
      userId:           klausId,
      pickupLocationId: tbilisiAirport,
      dropoffLocationId: tbilisiAirport,
      pickupDatetime:   daysFromNow(-7, 8),
      dropoffDatetime:  daysFromNow(-4, 8),
      status:           "NO_SHOW"  as const,
      paymentStatus:    "UNPAID"   as const,
      totalAmount:      "210.00",
      currency:         "GEL",
      contactFullName:  "Klaus-Heinrich Müller",
      contactPhone:     "+4915112345678",
      contactEmail:     "k.mueller@dev.de",
      source:           "admin",
    },
    // DEV-D1: DELIVERED / PAID — Sophie, Tbilisi, pickup today
    {
      reservationCode:  "DEV-D1",
      userId:           sophieId,
      pickupLocationId: tbilisiAirport,
      dropoffLocationId: tbilisiCity,
      pickupDatetime:   daysFromNow(0, 10),
      dropoffDatetime:  daysFromNow(5, 10),
      status:           "DELIVERED" as const,
      paymentStatus:    "PAID"      as const,
      totalAmount:      "360.00",
      currency:         "GEL",
      contactFullName:  "Sophie Dupont-Beauchamp",
      contactPhone:     "+33612345678",
      contactEmail:     "sophie.db@dev.fr",
      source:           "admin",
    },
    // DEV-R1: RETURNED / PAID — James, Batumi, completed 3 days ago
    {
      reservationCode:  "DEV-R1",
      userId:           jamesId,
      pickupLocationId: batumi,
      dropoffLocationId: batumi,
      pickupDatetime:   daysFromNow(-8, 9),
      dropoffDatetime:  daysFromNow(-3, 9),
      status:           "RETURNED" as const,
      paymentStatus:    "PAID"     as const,
      totalAmount:      "420.00",
      currency:         "GEL",
      contactFullName:  "James Harrison-Whitfield",
      contactPhone:     "+447911123456",
      contactEmail:     "james.hw@dev.uk",
      source:           "admin",
    },
  ];

  await db.insert(bookingTable).values(rows);
  console.log(`  bookings: ${rows.length} inserted (DEV-P1, DEV-P2, DEV-NS1, DEV-D1, DEV-R1)`);
}

// ─── 3 & 4. Handovers ────────────────────────────────────────────────────────
// Inserts PICKUP and/or DROPOFF handovers for bookings that are missing them.
// Guard: checks existing rows per booking+type before inserting.

type HandoverSpec = {
  bookingId: number;
  handoverType: "PICKUP" | "DROPOFF";
  actionAt: Date;
  mileage: number;
  fuelLevel: number;
  pickupSatisfaction?: "HAPPY" | "NEUTRAL" | "SAD";
  notes?: string;
};

async function seedHandovers() {
  const ADMIN_ID = 1; // seeded by seed-dev.ts

  // Fetch IDs for the bookings we care about
  const devBookings = await db
    .select({ id: bookingTable.id, reservationCode: bookingTable.reservationCode,
               pickupDatetime: bookingTable.pickupDatetime,
               dropoffDatetime: bookingTable.dropoffDatetime })
    .from(bookingTable)
    .where(sql`reservation_code IN ('DEV-D1','DEV-R1')`);
  const devMap = new Map(devBookings.map((b) => [b.reservationCode!, b]));

  const devD1 = devMap.get("DEV-D1");
  const devR1 = devMap.get("DEV-R1");

  // Build the full list of handovers we want to ensure exist
  const desired: HandoverSpec[] = [
    // Existing booking 1 — DELIVERED, no PICKUP yet
    { bookingId: 1,  handoverType: "PICKUP",  actionAt: new Date("2026-04-01T10:00:00"), mileage: 35000, fuelLevel: 80, pickupSatisfaction: "HAPPY",   notes: "Clean vehicle, good condition." },
    // Existing booking 2 — DELIVERED, no PICKUP yet
    { bookingId: 2,  handoverType: "PICKUP",  actionAt: new Date("2026-03-29T09:00:00"), mileage: 19500, fuelLevel: 60, pickupSatisfaction: "SAD",     notes: "Minor scratch noted on rear bumper." },
    // Existing booking 3 — RETURNED, has PICKUP, no DROPOFF
    { bookingId: 3,  handoverType: "DROPOFF", actionAt: new Date("2026-04-06T12:00:00"), mileage: 28800, fuelLevel: 35 },
    // Existing booking 4 — RETURNED, no PICKUP, no DROPOFF
    { bookingId: 4,  handoverType: "PICKUP",  actionAt: new Date("2026-03-22T11:00:00"), mileage: 22500, fuelLevel: 70, pickupSatisfaction: "NEUTRAL", notes: "Customer asked about GPS availability." },
    { bookingId: 4,  handoverType: "DROPOFF", actionAt: new Date("2026-03-25T11:00:00"), mileage: 22950, fuelLevel: 30 },
    // Existing booking 5 — RETURNED, no PICKUP, no DROPOFF
    { bookingId: 5,  handoverType: "PICKUP",  actionAt: new Date("2026-03-27T14:00:00"), mileage: 61200, fuelLevel: 50, pickupSatisfaction: "SAD",     notes: "Customer complained about fuel level at pickup." },
    { bookingId: 5,  handoverType: "DROPOFF", actionAt: new Date("2026-03-30T14:00:00"), mileage: 61700, fuelLevel: 25 },
  ];

  // New DEV bookings (if they were inserted)
  if (devD1) {
    desired.push({
      bookingId: devD1.id,
      handoverType: "PICKUP",
      actionAt: devD1.pickupDatetime,
      mileage: 44200,
      fuelLevel: 90,
      pickupSatisfaction: "NEUTRAL",
      notes: "Dev test booking — pickup confirmed.",
    });
  }
  if (devR1) {
    desired.push(
      {
        bookingId: devR1.id,
        handoverType: "PICKUP",
        actionAt: devR1.pickupDatetime,
        mileage: 27300,
        fuelLevel: 80,
        pickupSatisfaction: "HAPPY",
        notes: "Great condition at pickup.",
      },
      {
        bookingId: devR1.id,
        handoverType: "DROPOFF",
        actionAt: devR1.dropoffDatetime,
        mileage: 27850,
        fuelLevel: 45,
      },
    );
  }

  // Check which (bookingId, handoverType) pairs already exist
  const existing = await db
    .select({ bookingId: bookingHandoverTable.bookingId, handoverType: bookingHandoverTable.handoverType })
    .from(bookingHandoverTable)
    .where(
      inArray(
        bookingHandoverTable.bookingId,
        [...new Set(desired.map((d) => d.bookingId))],
      ),
    );
  const existingSet = new Set(existing.map((r) => `${r.bookingId}:${r.handoverType}`));

  const toInsert = desired
    .filter((d) => !existingSet.has(`${d.bookingId}:${d.handoverType}`))
    .map((d) => ({
      bookingId:           d.bookingId,
      handoverType:        d.handoverType,
      actionAt:            d.actionAt,
      mileage:             d.mileage,
      fuelLevel:           d.fuelLevel,
      performedByAdminId:  ADMIN_ID,
      notes:               d.notes ?? null,
      pickupSatisfaction:  d.pickupSatisfaction ?? null,
    }));

  if (toInsert.length === 0) {
    console.log("  handovers: all skipped (already exist)");
    return;
  }

  await db.insert(bookingHandoverTable).values(toInsert);
  console.log(`  handovers: ${toInsert.length} inserted, ${desired.length - toInsert.length} skipped`);
}

// ─── 5. Payment rows (payment table only) ─────────────────────────────────────
// Inserts exactly one PAID payment row per booking where:
//   - booking.payment_status = 'PAID'
//   - booking.user_id is set (NOT NULL)
//   - no payment row already exists for that booking
// amount = booking.total_amount (exact match)
// Does NOT touch booking_payment or accounting_entries.

async function seedPayments() {
  // All PAID bookings with a user, including new DEV ones
  const paidBookings = await db
    .select({
      id:          bookingTable.id,
      userId:      bookingTable.userId,
      totalAmount: bookingTable.totalAmount,
      currency:    bookingTable.currency,
      pickupDatetime: bookingTable.pickupDatetime,
    })
    .from(bookingTable)
    .where(
      and(
        eq(bookingTable.paymentStatus, "PAID"),
        isNull(bookingTable.deletedAt),
      ),
    );

  if (paidBookings.length === 0) {
    console.log("  payments: no PAID bookings found, skipping");
    return;
  }

  // Check which already have payment rows
  const bookingIds = paidBookings.map((b) => b.id);
  const existingPayments = await db
    .select({ bookingId: paymentTable.bookingId })
    .from(paymentTable)
    .where(inArray(paymentTable.bookingId, bookingIds));
  const coveredIds = new Set(existingPayments.map((p) => p.bookingId));

  const toInsert = paidBookings
    .filter((b) => !coveredIds.has(b.id))
    .map((b, i) => ({
      bookingId:   b.id,
      userId:      b.userId,
      method:      (i % 2 === 0 ? "CASH" : "CARD") as "CASH" | "CARD",
      status:      "PAID" as const,
      amount:      b.totalAmount ?? "0",
      currency:    b.currency ?? "GEL",
      paidAt:      b.pickupDatetime,
    }));

  if (toInsert.length === 0) {
    console.log("  payments: all skipped (already exist)");
    return;
  }

  await db.insert(paymentTable).values(toInsert);
  console.log(
    `  payments: ${toInsert.length} inserted, ${paidBookings.length - toInsert.length} skipped`,
  );
}

// ─── 6. Monitoring notes ──────────────────────────────────────────────────────
// Inserts 1 note per booking that:
//   - has at least one PICKUP handover (therefore appears on the Monitoring page)
//   - has no monitoring notes yet
// Skips bookings that already have notes.

async function seedMonitoringNotes() {
  const ADMIN_ID = 1;

  // All bookings with a PICKUP handover
  const withPickup = await db
    .selectDistinct({ bookingId: bookingHandoverTable.bookingId })
    .from(bookingHandoverTable)
    .where(eq(bookingHandoverTable.handoverType, "PICKUP"));

  if (withPickup.length === 0) {
    console.log("  monitoring notes: no bookings with PICKUP handover found");
    return;
  }

  const pickupBookingIds = withPickup.map((r) => r.bookingId);

  // Check which already have notes
  const existingNotes = await db
    .selectDistinct({ bookingId: monitoringNoteTable.bookingId })
    .from(monitoringNoteTable)
    .where(inArray(monitoringNoteTable.bookingId, pickupBookingIds));
  const coveredIds = new Set(existingNotes.map((n) => n.bookingId));

  const NOTE_BODIES: Record<number, string> = {
    1:  "Vehicle returned with full tank. Customer satisfied.",
    2:  "Rear bumper scratch documented at pickup, photos uploaded.",
    3:  "Customer requested early return — notified operations.",
    4:  "GPS was requested but unavailable; offered phone holder instead.",
    5:  "Customer reported fuel discrepancy at pickup. Issue escalated.",
    16: "Vehicle delivered on time. Customer confirmed receipt via WhatsApp.",
    17: "Pickup delayed 30 min — customer was in customs. No issues after.",
  };
  const DEFAULT_NOTE = "Pickup completed. No issues reported.";

  const toInsert = pickupBookingIds
    .filter((id) => !coveredIds.has(id))
    .map((bookingId) => ({
      bookingId,
      authorAdminId: ADMIN_ID,
      body: NOTE_BODIES[bookingId] ?? DEFAULT_NOTE,
    }));

  if (toInsert.length === 0) {
    console.log("  monitoring notes: all skipped (already exist)");
    return;
  }

  await db.insert(monitoringNoteTable).values(toInsert);
  console.log(
    `  monitoring notes: ${toInsert.length} inserted, ${pickupBookingIds.length - toInsert.length} skipped`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Running dev seed extension…\n");

  console.log("1. Extended customers");
  await seedExtendedCustomers();

  console.log("2. Extended bookings");
  await seedExtendedBookings();

  console.log("3+4. Handovers");
  await seedHandovers();

  console.log("5. Payment rows");
  await seedPayments();

  console.log("6. Monitoring notes");
  await seedMonitoringNotes();

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("seed-dev-extended failed:", err);
  process.exit(1);
});
