import {
  db,
  parkingAssignmentTable,
  vehicleTable,
  vehicleModelTable,
  brandTable,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../lib/errors.js";

// ─── Zone capacity rules ────────────────────────────────────────────────────────

export const ZONE_CAPACITIES: Record<string, number | null> = {
  TERMINAL: 5,
  OUT: 10,
  FREE: null, // unlimited
};

export const VALID_ZONES = Object.keys(ZONE_CAPACITIES);

// ─── List all active assignments grouped by zone ───────────────────────────────

export async function listParkingByZone() {
  const rows = await db
    .select({
      id: parkingAssignmentTable.id,
      vehicleId: parkingAssignmentTable.vehicleId,
      zone: parkingAssignmentTable.zone,
      assignedAt: parkingAssignmentTable.assignedAt,
      assignedByAdminId: parkingAssignmentTable.assignedByAdminId,
      licensePlate: vehicleTable.licensePlate,
      brandName: brandTable.name,
      modelName: vehicleModelTable.name,
    })
    .from(parkingAssignmentTable)
    .innerJoin(vehicleTable, eq(vehicleTable.id, parkingAssignmentTable.vehicleId))
    .leftJoin(vehicleModelTable, eq(vehicleModelTable.id, vehicleTable.vehicleModelId))
    .leftJoin(brandTable, eq(brandTable.id, vehicleModelTable.brandId))
    .where(isNull(parkingAssignmentTable.removedAt))
    .orderBy(parkingAssignmentTable.assignedAt);

  // Group by zone and compute occupancy
  const grouped: Record<string, { capacity: number | null; assignments: typeof rows }> = {};

  for (const zone of VALID_ZONES) {
    grouped[zone] = {
      capacity: ZONE_CAPACITIES[zone],
      assignments: [],
    };
  }

  for (const row of rows) {
    const zone = row.zone;
    if (!grouped[zone]) {
      grouped[zone] = { capacity: null, assignments: [] };
    }
    grouped[zone].assignments.push(row);
  }

  return grouped;
}

// ─── Assign a vehicle to a zone ────────────────────────────────────────────────

export async function assignVehicleToZone(
  vehicleId: number,
  zone: string,
  assignedByAdminId: number | null,
) {
  if (!VALID_ZONES.includes(zone)) {
    throw new ConflictError(`Invalid zone "${zone}". Must be one of: ${VALID_ZONES.join(", ")}`);
  }

  // Check vehicle exists
  const [vehicle] = await db
    .select({ id: vehicleTable.id })
    .from(vehicleTable)
    .where(eq(vehicleTable.id, vehicleId))
    .limit(1);

  if (!vehicle) throw new NotFoundError(`Vehicle ${vehicleId} not found`);

  // Check: vehicle not already actively parked
  const [existing] = await db
    .select({ id: parkingAssignmentTable.id, zone: parkingAssignmentTable.zone })
    .from(parkingAssignmentTable)
    .where(
      and(
        eq(parkingAssignmentTable.vehicleId, vehicleId),
        isNull(parkingAssignmentTable.removedAt),
      ),
    )
    .limit(1);

  if (existing) {
    throw new ConflictError(
      `Vehicle ${vehicleId} is already parked in zone ${existing.zone}. Remove it first.`,
    );
  }

  // Check zone capacity
  const capacity = ZONE_CAPACITIES[zone];
  if (capacity !== null) {
    const currentCount = await db
      .select({ id: parkingAssignmentTable.id })
      .from(parkingAssignmentTable)
      .where(
        and(
          eq(parkingAssignmentTable.zone, zone),
          isNull(parkingAssignmentTable.removedAt),
        ),
      );

    if (currentCount.length >= capacity) {
      throw new ConflictError(`Zone ${zone} is full (capacity: ${capacity}).`);
    }
  }

  const [assignment] = await db
    .insert(parkingAssignmentTable)
    .values({
      vehicleId,
      zone,
      assignedByAdminId,
      assignedAt: new Date(),
    })
    .returning();

  return assignment;
}

// ─── Remove (soft-delete) a parking assignment ────────────────────────────────

export async function removeFromParking(assignmentId: number) {
  const [row] = await db
    .update(parkingAssignmentTable)
    .set({ removedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(parkingAssignmentTable.id, assignmentId),
        isNull(parkingAssignmentTable.removedAt),
      ),
    )
    .returning();

  if (!row) throw new NotFoundError(`Active parking assignment ${assignmentId} not found`);
  return { message: "Vehicle removed from parking" };
}

// ─── Auto-remove by vehicleId (called on DELIVERED booking status) ─────────────

export async function removeFromParkingByVehicle(vehicleId: number) {
  await db
    .update(parkingAssignmentTable)
    .set({ removedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(parkingAssignmentTable.vehicleId, vehicleId),
        isNull(parkingAssignmentTable.removedAt),
      ),
    );
}
