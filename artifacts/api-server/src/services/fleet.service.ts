import {
  db,
  brandTable,
  vehicleModelTable,
  vehiclegroupTable,
  vehicleTable,
  type Vehicle,
} from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export async function listBrands() {
  return db.select().from(brandTable).orderBy(asc(brandTable.name));
}

export async function listVehicleModels() {
  return db
    .select({
      id: vehicleModelTable.id,
      brandId: vehicleModelTable.brandId,
      name: vehicleModelTable.name,
      description: vehicleModelTable.description,
      imageUrl: vehicleModelTable.imageUrl,
      active: vehicleModelTable.active,
      availableForExternalSystems: vehicleModelTable.availableForExternalSystems,
      category: vehicleModelTable.category,
      seats: vehicleModelTable.seats,
      doors: vehicleModelTable.doors,
      transmission: vehicleModelTable.transmission,
      fuelType: vehicleModelTable.fuelType,
      luggageCapacity: vehicleModelTable.luggageCapacity,
      mileageLimitPerDay: vehicleModelTable.mileageLimitPerDay,
      deposit: vehicleModelTable.deposit,
      createdAt: vehicleModelTable.createdAt,
      updatedAt: vehicleModelTable.updatedAt,
      brand: {
        id: brandTable.id,
        name: brandTable.name,
        logoUrl: brandTable.logoUrl,
      },
    })
    .from(vehicleModelTable)
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .where(eq(vehicleModelTable.active, true))
    .orderBy(asc(vehicleModelTable.name));
}

export async function listVehicleGroups() {
  return db
    .select()
    .from(vehiclegroupTable)
    .where(eq(vehiclegroupTable.active, true))
    .orderBy(asc(vehiclegroupTable.displayOrder), asc(vehiclegroupTable.name));
}

export interface VehicleFilters {
  status?: NonNullable<Vehicle["status"]>;
  locationId?: number;
  vehicleGroupId?: number;
  vehicleModelId?: number;
}

export async function listVehicles(filters?: VehicleFilters) {
  const conditions = [];

  if (filters?.status != null) {
    conditions.push(eq(vehicleTable.status, filters.status));
  }
  if (filters?.locationId != null) {
    conditions.push(eq(vehicleTable.locationId, filters.locationId));
  }
  if (filters?.vehicleGroupId != null) {
    conditions.push(eq(vehicleTable.vehicleGroupId, filters.vehicleGroupId));
  }
  if (filters?.vehicleModelId != null) {
    conditions.push(eq(vehicleTable.vehicleModelId, filters.vehicleModelId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select().from(vehicleTable).where(where).orderBy(asc(vehicleTable.id));
}

export async function getVehicle(id: number) {
  const rows = await db
    .select()
    .from(vehicleTable)
    .where(eq(vehicleTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Vehicle ${id} not found`);
  return row;
}
