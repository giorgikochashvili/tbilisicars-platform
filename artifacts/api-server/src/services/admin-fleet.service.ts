import {
  db,
  brandTable,
  vehicleModelTable,
  vehiclegroupTable,
  vehicleTable,
  type Vehicle,
} from "@workspace/db";
import { and, asc, count, eq } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export async function listAdminBrands() {
  return db.select().from(brandTable).orderBy(asc(brandTable.name));
}

export async function getAdminBrand(id: number) {
  const rows = await db
    .select()
    .from(brandTable)
    .where(eq(brandTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Brand ${id} not found`);
  return row;
}

export async function listAdminModels() {
  return db
    .select({
      id: vehicleModelTable.id,
      brandId: vehicleModelTable.brandId,
      name: vehicleModelTable.name,
      active: vehicleModelTable.active,
      seats: vehicleModelTable.seats,
      doors: vehicleModelTable.doors,
      transmission: vehicleModelTable.transmission,
      fuelType: vehicleModelTable.fuelType,
      imageUrl: vehicleModelTable.imageUrl,
      deposit: vehicleModelTable.deposit,
      createdAt: vehicleModelTable.createdAt,
      updatedAt: vehicleModelTable.updatedAt,
    })
    .from(vehicleModelTable)
    .orderBy(asc(vehicleModelTable.name));
}

export async function getAdminModel(id: number) {
  const rows = await db
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
      brand: {
        id: brandTable.id,
        name: brandTable.name,
        logoUrl: brandTable.logoUrl,
        countryOfOrigin: brandTable.countryOfOrigin,
      },
      createdAt: vehicleModelTable.createdAt,
      updatedAt: vehicleModelTable.updatedAt,
    })
    .from(vehicleModelTable)
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .where(eq(vehicleModelTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Vehicle model ${id} not found`);
  return row;
}

export async function listAdminGroups() {
  return db
    .select()
    .from(vehiclegroupTable)
    .orderBy(asc(vehiclegroupTable.displayOrder), asc(vehiclegroupTable.name));
}

export async function getAdminGroup(id: number) {
  const rows = await db
    .select()
    .from(vehiclegroupTable)
    .where(eq(vehiclegroupTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Vehicle group ${id} not found`);
  return row;
}

export interface AdminVehicleFilters {
  status?: NonNullable<Vehicle["status"]>;
  locationId?: number;
  modelId?: number;
  groupId?: number;
}

export async function listAdminVehicles(
  filters: AdminVehicleFilters = {},
  page: number = 1,
  limit: number = 20,
) {
  const conditions = [];

  if (filters.status != null) {
    conditions.push(eq(vehicleTable.status, filters.status));
  }
  if (filters.locationId != null) {
    conditions.push(eq(vehicleTable.locationId, filters.locationId));
  }
  if (filters.modelId != null) {
    conditions.push(eq(vehicleTable.vehicleModelId, filters.modelId));
  }
  if (filters.groupId != null) {
    conditions.push(eq(vehicleTable.vehicleGroupId, filters.groupId));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (page - 1) * limit;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(vehicleTable)
      .where(where)
      .orderBy(asc(vehicleTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(vehicleTable).where(where),
  ]);

  return {
    data: rows,
    meta: {
      page,
      limit,
      total: totalRows[0]?.total ?? 0,
    },
  };
}

export async function getAdminVehicle(id: number) {
  const rows = await db
    .select({
      id: vehicleTable.id,
      vehicleModelId: vehicleTable.vehicleModelId,
      vehicleGroupId: vehicleTable.vehicleGroupId,
      make: vehicleTable.make,
      model: vehicleTable.model,
      year: vehicleTable.year,
      color: vehicleTable.color,
      licensePlate: vehicleTable.licensePlate,
      vin: vehicleTable.vin,
      vehicleClass: vehicleTable.vehicleClass,
      fuelType: vehicleTable.fuelType,
      transmission: vehicleTable.transmission,
      status: vehicleTable.status,
      mileage: vehicleTable.mileage,
      locationId: vehicleTable.locationId,
      startingPrice: vehicleTable.startingPrice,
      createdAt: vehicleTable.createdAt,
      updatedAt: vehicleTable.updatedAt,
      modelId: vehicleModelTable.id,
      modelName: vehicleModelTable.name,
      modelBrandId: vehicleModelTable.brandId,
      brandName: brandTable.name,
      groupId: vehiclegroupTable.id,
      groupName: vehiclegroupTable.name,
    })
    .from(vehicleTable)
    .leftJoin(
      vehicleModelTable,
      eq(vehicleTable.vehicleModelId, vehicleModelTable.id),
    )
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .leftJoin(
      vehiclegroupTable,
      eq(vehicleTable.vehicleGroupId, vehiclegroupTable.id),
    )
    .where(eq(vehicleTable.id, id));

  const row = rows[0];
  if (!row) throw new NotFoundError(`Vehicle ${id} not found`);

  const {
    modelId,
    modelName,
    modelBrandId,
    brandName,
    groupId,
    groupName,
    ...vehicle
  } = row;

  return {
    ...vehicle,
    vehicleModel:
      modelId != null
        ? { id: modelId, name: modelName!, brandId: modelBrandId!, brandName }
        : null,
    vehicleGroup: groupId != null ? { id: groupId, name: groupName! } : null,
  };
}
