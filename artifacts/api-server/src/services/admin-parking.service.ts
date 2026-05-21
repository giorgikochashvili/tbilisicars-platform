import {
  db,
  parkingAssignmentTable,
  vehicleTable,
  vehicleModelTable,
  brandTable,
  maintenanceServicesTable,
} from "@workspace/db";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { ConflictError, NotFoundError } from "../lib/errors.js";

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ─── Zone capacity rules ────────────────────────────────────────────────────────

export const ZONE_CAPACITIES: Record<string, number | null> = {
  AIRPORT: 15,
  FREE: null, // unlimited
  TASHKENT: null, // unlimited
};

export const VALID_ZONES = Object.keys(ZONE_CAPACITIES);

// Legacy stored zone values → canonical display zone (backwards compat, read-only).
// Existing TERMINAL/OUT rows in the DB are folded into AIRPORT at read time.
// No data migration required.
const LEGACY_ZONE_MAP: Record<string, string> = {
  TERMINAL: "AIRPORT",
  OUT: "AIRPORT",
};

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

  // Build active-service map: vehicleId → strongest active status (IN_PROGRESS > SCHEDULED)
  const vehicleIds = [...new Set(rows.map((r) => r.vehicleId))];
  const serviceMap = new Map<number, string>();
  if (vehicleIds.length > 0) {
    const activeServices = await db
      .select({
        vehicleId: maintenanceServicesTable.vehicleId,
        status: maintenanceServicesTable.status,
      })
      .from(maintenanceServicesTable)
      .where(
        and(
          inArray(maintenanceServicesTable.vehicleId, vehicleIds),
          inArray(maintenanceServicesTable.status, ["SCHEDULED", "IN_PROGRESS"] as any),
        ),
      );
    for (const s of activeServices) {
      const existing = serviceMap.get(s.vehicleId);
      if (!existing || s.status === "IN_PROGRESS") {
        serviceMap.set(s.vehicleId, s.status);
      }
    }
  }

  // Group by zone and compute occupancy
  type AssignmentWithService = (typeof rows)[number] & { activeServiceStatus: string | null };
  const grouped: Record<string, { capacity: number | null; assignments: AssignmentWithService[] }> = {};

  for (const zone of VALID_ZONES) {
    grouped[zone] = {
      capacity: ZONE_CAPACITIES[zone],
      assignments: [],
    };
  }

  for (const row of rows) {
    const displayZone = LEGACY_ZONE_MAP[row.zone] ?? row.zone;
    if (!grouped[displayZone]) {
      grouped[displayZone] = { capacity: ZONE_CAPACITIES[displayZone] ?? null, assignments: [] };
    }
    grouped[displayZone].assignments.push({
      ...row,
      activeServiceStatus: serviceMap.get(row.vehicleId) ?? null,
    });
  }

  return grouped;
}

// ─── Assign a vehicle to a zone ────────────────────────────────────────────────
// Capacity and city checks are intentionally omitted:
// • TBS AIR PARKING is admin-only and Tbilisi-exclusive by design.
// • Overflow is allowed — staff must be able to assign even when a zone is "full".
// • During booking dropoff the vehicle's locationId may not yet reflect the airport.

export async function assignVehicleToZone(
  vehicleId: number,
  zone: string,
  assignedByAdminId: number | null,
) {
  if (!VALID_ZONES.includes(zone)) {
    throw new ConflictError(`Invalid zone "${zone}". Must be one of: ${VALID_ZONES.join(", ")}`);
  }

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

// ─── Move a vehicle from one zone to another (atomic) ─────────────────────────

export async function moveVehicleToZone(
  assignmentId: number,
  targetZone: string,
  assignedByAdminId: number | null,
) {
  if (!VALID_ZONES.includes(targetZone)) {
    throw new ConflictError(`Invalid zone "${targetZone}". Must be one of: ${VALID_ZONES.join(", ")}`);
  }

  return db.transaction(async (tx) => {
    const [old] = await tx
      .update(parkingAssignmentTable)
      .set({ removedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(parkingAssignmentTable.id, assignmentId),
          isNull(parkingAssignmentTable.removedAt),
        ),
      )
      .returning();

    if (!old) {
      throw new NotFoundError(`Active parking assignment ${assignmentId} not found`);
    }

    const [next] = await tx
      .insert(parkingAssignmentTable)
      .values({
        vehicleId: old.vehicleId,
        zone: targetZone,
        assignedByAdminId,
        assignedAt: new Date(),
      })
      .returning();

    return next;
  });
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

export async function removeFromParkingByVehicle(vehicleId: number, tx?: TxClient) {
  await (tx ?? db)
    .update(parkingAssignmentTable)
    .set({ removedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(parkingAssignmentTable.vehicleId, vehicleId),
        isNull(parkingAssignmentTable.removedAt),
      ),
    );
}
