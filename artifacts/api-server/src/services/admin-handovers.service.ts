import {
  db,
  bookingHandoverTable,
  bookingTable,
  bookingphotoTable,
  bookingHistoryTable,
  adminsTable,
} from "@workspace/db";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../lib/errors.js";
import { applyAdminBookingStatus } from "./admin-bookings.service.js";

export type PickupSatisfaction = "HAPPY" | "NEUTRAL" | "SAD";

export async function createHandover(data: {
  bookingId: number;
  handoverType: "PICKUP" | "DROPOFF";
  actionAt: string;
  mileage?: number | null;
  fuelLevel?: number | null;
  performedByAdminId?: number | null;
  notes?: string | null;
  photoUrls?: string[];
  pickupSatisfaction?: PickupSatisfaction | null;
}) {
  const {
    bookingId,
    handoverType,
    actionAt,
    mileage,
    fuelLevel,
    performedByAdminId,
    notes,
    photoUrls = [],
    pickupSatisfaction = null,
  } = data;

  // Satisfaction is required for PICKUP only.
  if (handoverType === "PICKUP" && !pickupSatisfaction) {
    throw new Error("pickupSatisfaction is required for PICKUP handovers");
  }

  // Verify booking exists before any inserts (avoids raw FK constraint violation → 500)
  const bookingRows = await db
    .select({ id: bookingTable.id })
    .from(bookingTable)
    .where(and(eq(bookingTable.id, bookingId), isNull(bookingTable.deletedAt)))
    .limit(1);
  if (bookingRows.length === 0) {
    throw new NotFoundError(`Booking ${bookingId} not found`);
  }

  // Hard lock: block pickup if the vehicle is currently rented on another booking
  if (handoverType === "PICKUP") {
    const [bk] = await db
      .select({ vehicleId: bookingTable.vehicleId })
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId))
      .limit(1);

    if (bk?.vehicleId) {
      const [activeRental] = await db
        .select({ id: bookingTable.id })
        .from(bookingTable)
        .where(
          and(
            eq(bookingTable.vehicleId, bk.vehicleId),
            eq(bookingTable.status, "DELIVERED"),
            isNull(bookingTable.deletedAt),
            ne(bookingTable.id, bookingId),
          ),
        )
        .limit(1);

      if (activeRental) {
        throw new ConflictError(
          `Vehicle is currently rented on booking #${activeRental.id}. Complete that dropoff first.`,
        );
      }
    }
  }

  // Atomic: all writes succeed or all roll back together.
  // Pre-write read guards above remain outside the transaction (reads only).
  const handover = await db.transaction(async (tx) => {
    // Insert the handover record
    const [handoverRow] = await tx
      .insert(bookingHandoverTable)
      .values({
        bookingId,
        handoverType,
        actionAt: new Date(actionAt),
        mileage: mileage ?? null,
        fuelLevel: fuelLevel ?? null,
        performedByAdminId: performedByAdminId ?? null,
        notes: notes ?? null,
        pickupSatisfaction:
          handoverType === "PICKUP" ? pickupSatisfaction ?? null : null,
      })
      .returning();

    if (!handoverRow) throw new Error("Failed to create handover record");

    // Bulk-insert photos if provided
    if (photoUrls.length > 0) {
      const photoType = handoverType === "PICKUP" ? "PICKUP" : "RETURN";
      await tx.insert(bookingphotoTable).values(
        photoUrls.map((url) => ({
          bookingId,
          photoUrl: url,
          photoType: photoType as "PICKUP" | "RETURN",
        })),
      );
    }

    // Advance booking status (booking + vehicle + parking side-effects all inside tx)
    const newStatus: "DELIVERED" | "RETURNED" =
      handoverType === "PICKUP" ? "DELIVERED" : "RETURNED";
    await applyAdminBookingStatus(bookingId, newStatus, tx);

    // Write booking history entry
    const parts: string[] = [];
    if (mileage != null) parts.push(`mileage: ${mileage} km`);
    if (fuelLevel != null) parts.push(`fuel: ${fuelLevel}%`);
    if (photoUrls.length > 0) parts.push(`${photoUrls.length} photo(s)`);
    const description =
      `${handoverType === "PICKUP" ? "Pick Up" : "Drop Off"} recorded` +
      (parts.length > 0 ? ` — ${parts.join(", ")}` : "");

    await tx.insert(bookingHistoryTable).values({
      bookingId,
      changedById: performedByAdminId ?? null,
      actionType: handoverType === "PICKUP" ? "PICKUP" : "DROPOFF",
      newValue: newStatus,
      description,
    });

    return handoverRow;
  });

  return handover;
}

/**
 * Extension point for post-dropoff photo lifecycle scheduling.
 * Currently a stub — logs a debug message for DROPOFF handovers.
 * Future work will trigger: compression queue → 30-day archive →
 * object storage migration. See PHOTO_LIFECYCLE.md for the full spec.
 */
export function schedulePhotoLifecycle(
  bookingId: number,
  handoverType: "PICKUP" | "DROPOFF",
): void {
  if (handoverType === "DROPOFF") {
    console.debug(`[photo-lifecycle] bookingId=${bookingId} scheduled`);
  }
}

export async function getHandoversForBooking(bookingId: number) {
  // Fetch handovers with performer name via JOIN on admins
  const handoverRows = await db
    .select({
      id: bookingHandoverTable.id,
      bookingId: bookingHandoverTable.bookingId,
      handoverType: bookingHandoverTable.handoverType,
      actionAt: bookingHandoverTable.actionAt,
      mileage: bookingHandoverTable.mileage,
      fuelLevel: bookingHandoverTable.fuelLevel,
      performedByAdminId: bookingHandoverTable.performedByAdminId,
      performedByAdminName: adminsTable.fullName,
      notes: bookingHandoverTable.notes,
      pickupSatisfaction: bookingHandoverTable.pickupSatisfaction,
      createdAt: bookingHandoverTable.createdAt,
    })
    .from(bookingHandoverTable)
    .leftJoin(
      adminsTable,
      eq(bookingHandoverTable.performedByAdminId, adminsTable.id),
    )
    .where(eq(bookingHandoverTable.bookingId, bookingId))
    .orderBy(asc(bookingHandoverTable.actionAt));

  // Fetch photos for each handover
  const photoRows = await db
    .select()
    .from(bookingphotoTable)
    .where(eq(bookingphotoTable.bookingId, bookingId))
    .orderBy(asc(bookingphotoTable.id));

  const pickupPhotos = photoRows
    .filter((p) => p.photoType === "PICKUP")
    .map((p) => p.photoUrl);
  const returnPhotos = photoRows
    .filter((p) => p.photoType === "RETURN")
    .map((p) => p.photoUrl);

  const pickup = handoverRows.find((h) => h.handoverType === "PICKUP") ?? null;
  const dropoff = handoverRows.find((h) => h.handoverType === "DROPOFF") ?? null;

  return {
    pickup: pickup ? { ...pickup, photos: pickupPhotos } : null,
    dropoff: dropoff ? { ...dropoff, photos: returnPhotos } : null,
  };
}
