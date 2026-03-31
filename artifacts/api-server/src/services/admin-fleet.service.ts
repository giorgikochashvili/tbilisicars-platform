import {
  db,
  brandTable,
  vehicleModelTable,
  vehiclegroupTable,
  vehicleTable,
  type Vehicle,
} from "@workspace/db";
import { and, asc, count, eq, ilike, sql } from "drizzle-orm";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";

/** Detects PostgreSQL foreign-key violation (code 23503) from Drizzle-wrapped or raw pg errors. */
function isForeignKeyViolation(err: unknown): boolean {
  const pgErr = (err as any)?.cause ?? err;
  return (pgErr as any)?.code === "23503";
}

export async function listAdminBrands() {
  const rows = await db
    .select({
      id: brandTable.id,
      name: brandTable.name,
      logoUrl: brandTable.logoUrl,
      createdAt: brandTable.createdAt,
      updatedAt: brandTable.updatedAt,
      vehicleCount: sql<number>`CAST(COUNT(DISTINCT ${vehicleTable.id}) AS INTEGER)`,
    })
    .from(brandTable)
    .leftJoin(vehicleModelTable, eq(vehicleModelTable.brandId, brandTable.id))
    .leftJoin(vehicleTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
    .groupBy(brandTable.id)
    .orderBy(asc(brandTable.name));
  return rows;
}

export async function getAdminBrand(id: number) {
  const rows = await db
    .select({
      id: brandTable.id,
      name: brandTable.name,
      logoUrl: brandTable.logoUrl,
      createdAt: brandTable.createdAt,
      updatedAt: brandTable.updatedAt,
    })
    .from(brandTable)
    .where(eq(brandTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Brand ${id} not found`);
  return row;
}

export async function createAdminBrand(data: {
  name: string;
  logoUrl?: string | null;
}) {
  // Case-insensitive duplicate check
  const normalizedName = data.name.trim();
  const existing = await db
    .select({ id: brandTable.id })
    .from(brandTable)
    .where(ilike(brandTable.name, normalizedName));
  if (existing.length > 0) {
    throw new ConflictError(`A brand named "${normalizedName}" already exists.`);
  }
  const [row] = await db
    .insert(brandTable)
    .values({ name: normalizedName, logoUrl: data.logoUrl || null })
    .returning({
      id: brandTable.id,
      name: brandTable.name,
      logoUrl: brandTable.logoUrl,
      createdAt: brandTable.createdAt,
      updatedAt: brandTable.updatedAt,
    });
  return row!;
}

export async function updateAdminBrand(
  id: number,
  data: Partial<{ name: string; logoUrl: string | null }>,
) {
  const updates: Partial<{ name: string; logoUrl: string | null; updatedAt: Date }> = {
    updatedAt: new Date(),
  };

  if (data.name != null) {
    const normalizedName = data.name.trim();
    const existing = await db
      .select({ id: brandTable.id })
      .from(brandTable)
      .where(and(ilike(brandTable.name, normalizedName), sql`${brandTable.id} != ${id}`));
    if (existing.length > 0) {
      throw new ConflictError(`A brand named "${normalizedName}" already exists.`);
    }
    updates.name = normalizedName;
  }

  if (data.logoUrl !== undefined) {
    updates.logoUrl = data.logoUrl || null;
  }

  const [row] = await db
    .update(brandTable)
    .set(updates)
    .where(eq(brandTable.id, id))
    .returning({
      id: brandTable.id,
      name: brandTable.name,
      logoUrl: brandTable.logoUrl,
      createdAt: brandTable.createdAt,
      updatedAt: brandTable.updatedAt,
    });
  if (!row) throw new NotFoundError(`Brand ${id} not found`);
  return row;
}

export async function deleteAdminBrand(id: number) {
  const [row] = await db
    .delete(brandTable)
    .where(eq(brandTable.id, id))
    .returning({ id: brandTable.id });
  if (!row) throw new NotFoundError(`Brand ${id} not found`);
  return { message: "Brand deleted" };
}

export async function listAdminModels() {
  const rows = await db
    .select({
      id: vehicleModelTable.id,
      brandId: vehicleModelTable.brandId,
      name: vehicleModelTable.name,
      category: vehicleModelTable.category,
      active: vehicleModelTable.active,
      seats: vehicleModelTable.seats,
      doors: vehicleModelTable.doors,
      transmission: vehicleModelTable.transmission,
      fuelType: vehicleModelTable.fuelType,
      luggageCapacity: vehicleModelTable.luggageCapacity,
      imageUrl: vehicleModelTable.imageUrl,
      deposit: vehicleModelTable.deposit,
      createdAt: vehicleModelTable.createdAt,
      updatedAt: vehicleModelTable.updatedAt,
      brandName: brandTable.name,
      brandLogoUrl: brandTable.logoUrl,
    })
    .from(vehicleModelTable)
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .orderBy(asc(vehicleModelTable.name));

  return rows.map(({ brandName, brandLogoUrl, ...m }) => ({
    ...m,
    brand: m.brandId != null ? { id: m.brandId, name: brandName ?? null, logoUrl: brandLogoUrl ?? null } : null,
  }));
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

export async function createAdminModel(data: {
  brandId: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  active?: boolean;
  availableForExternalSystems?: boolean;
  category?: string | null;
  seats?: number | null;
  doors?: number | null;
  transmission?: "MANUAL" | "AUTOMATIC" | null;
  fuelType?: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | null;
  luggageCapacity?: number | null;
  mileageLimitPerDay?: number | null;
  deposit?: string | null;
}) {
  const [row] = await db.insert(vehicleModelTable).values(data).returning();
  return getAdminModel(row!.id);
}

export async function updateAdminModel(
  id: number,
  data: Partial<{
    brandId: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    active: boolean;
    availableForExternalSystems: boolean;
    category: string | null;
    seats: number | null;
    doors: number | null;
    transmission: "MANUAL" | "AUTOMATIC" | null;
    fuelType: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | null;
    luggageCapacity: number | null;
    mileageLimitPerDay: number | null;
    deposit: string | null;
  }>,
) {
  const [row] = await db
    .update(vehicleModelTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(vehicleModelTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Vehicle model ${id} not found`);
  return getAdminModel(id);
}

export async function deleteAdminModel(id: number) {
  const [row] = await db
    .delete(vehicleModelTable)
    .where(eq(vehicleModelTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Vehicle model ${id} not found`);
  return { message: "Vehicle model deleted" };
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
      .select({
        id: vehicleTable.id,
        vehicleModelId: vehicleTable.vehicleModelId,
        vehicleGroupId: vehicleTable.vehicleGroupId,
        licensePlate: vehicleTable.licensePlate,
        techpassportNumber: vehicleTable.techpassportNumber,
        year: vehicleTable.year,
        color: vehicleTable.color,
        vehicleClass: vehicleTable.vehicleClass,
        fuelType: vehicleTable.fuelType,
        transmission: vehicleTable.transmission,
        status: vehicleTable.status,
        mileage: vehicleTable.mileage,
        locationId: vehicleTable.locationId,
        startingPrice: vehicleTable.startingPrice,
        createdAt: vehicleTable.createdAt,
        updatedAt: vehicleTable.updatedAt,
        modelName: vehicleModelTable.name,
        modelTransmission: vehicleModelTable.transmission,
        modelFuelType: vehicleModelTable.fuelType,
        modelSeats: vehicleModelTable.seats,
        brandId: brandTable.id,
        brandName: brandTable.name,
        brandLogoUrl: brandTable.logoUrl,
      })
      .from(vehicleTable)
      .leftJoin(vehicleModelTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
      .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
      .where(where)
      .orderBy(asc(vehicleTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(vehicleTable).where(where),
  ]);

  const data = rows.map(({ modelName, modelTransmission, modelFuelType, modelSeats, brandId, brandName, brandLogoUrl, ...v }) => ({
    ...v,
    vehicleModel: v.vehicleModelId != null ? {
      id: v.vehicleModelId,
      name: modelName ?? null,
      transmission: modelTransmission ?? null,
      fuelType: modelFuelType ?? null,
      seats: modelSeats ?? null,
      brand: brandId != null ? { id: brandId, name: brandName ?? null, logoUrl: brandLogoUrl ?? null } : null,
    } : null,
  }));

  return {
    data,
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
      techpassportNumber: vehicleTable.techpassportNumber,
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

export async function createAdminVehicle(data: {
  vehicleModelId?: number | null;
  vehicleGroupId?: number | null;
  licensePlate?: string | null;
  techpassportNumber?: string | null;
  year?: number | null;
  color?: string | null;
  vehicleClass?: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  status?: string | null;
  mileage?: number | null;
  locationId?: number | null;
  startingPrice?: string | null;
}) {
  let row: { id: number } | undefined;
  try {
    [row] = await db.insert(vehicleTable).values(data as any).returning();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new ValidationError(
        "Invalid vehicle model or location — the selected ID does not exist.",
      );
    }
    throw err;
  }
  return getAdminVehicle(row!.id);
}

export async function updateAdminVehicle(
  id: number,
  data: Partial<{
    vehicleModelId: number | null;
    vehicleGroupId: number | null;
    licensePlate: string | null;
    techpassportNumber: string | null;
    year: number | null;
    color: string | null;
    vehicleClass: string | null;
    fuelType: string | null;
    transmission: string | null;
    status: string | null;
    mileage: number | null;
    locationId: number | null;
    startingPrice: string | null;
  }>,
) {
  let row: { id: number } | undefined;
  try {
    [row] = await db
      .update(vehicleTable)
      .set({ ...(data as any), updatedAt: new Date() })
      .where(eq(vehicleTable.id, id))
      .returning();
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new ValidationError(
        "Invalid vehicle model or location — the selected ID does not exist.",
      );
    }
    throw err;
  }
  if (!row) throw new NotFoundError(`Vehicle ${id} not found`);
  return getAdminVehicle(id);
}

export async function updateAdminVehicleStatus(
  id: number,
  status: NonNullable<Vehicle["status"]>,
) {
  const [row] = await db
    .update(vehicleTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(vehicleTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Vehicle ${id} not found`);
  return getAdminVehicle(id);
}

export async function deleteAdminVehicle(id: number) {
  const [row] = await db
    .delete(vehicleTable)
    .where(eq(vehicleTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Vehicle ${id} not found`);
  return { message: "Vehicle deleted" };
}
