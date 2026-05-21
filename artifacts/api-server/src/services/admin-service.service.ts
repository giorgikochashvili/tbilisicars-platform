import {
  db,
  maintenanceServicesTable,
  maintenanceServiceTypesTable,
  maintenanceServiceCommentTable,
  vehicleTable,
  vehicleModelTable,
  brandTable,
  adminsTable,
} from "@workspace/db";
import { asc, desc, eq, and, gte, lte, count, sql } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

// ─── Service Categories ───────────────────────────────────────────────────────

export async function listServiceTypes() {
  return db
    .select()
    .from(maintenanceServiceTypesTable)
    .where(eq(maintenanceServiceTypesTable.active, true))
    .orderBy(asc(maintenanceServiceTypesTable.name));
}

export async function seedServiceTypes() {
  const categories = [
    "Oil",
    "Air Filter",
    "Saloon Filter",
    "Brake Pads Front",
    "Brake Pads Back",
    "Brake Disk",
    "Windshield",
    "Windshield Cleaner",
    "Brake Fluid",
    "Transmission Fluid",
    "Disk Repair",
    "Tyre Fix",
    "Tyre Change",
    "Light Bulbs",
    "Electric",
    "Wheel Diagnostic",
  ];

  for (const name of categories) {
    const existing = await db
      .select()
      .from(maintenanceServiceTypesTable)
      .where(eq(maintenanceServiceTypesTable.name, name))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(maintenanceServiceTypesTable).values({ name });
    }
  }
}

// ─── Service Records ──────────────────────────────────────────────────────────

interface ServiceRecordRow {
  id: number;
  vehicleId: number;
  serviceTypeId: number | null;
  serviceCategories: string | null;
  serviceDate: string | null;
  mileage: number | null;
  cost: string | null;
  description: string | null;
  mechanicName: string | null;
  shopName: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  vehicleLicensePlate: string | null;
  vehicleModelName: string | null;
  brandName: string | null;
  serviceTypeName: string | null;
}

export async function listServiceRecords(filters: {
  vehicleSearch?: string;
  serviceTypeId?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}) {
  const { vehicleSearch, serviceTypeId, status, dateFrom, dateTo, page = 1, limit = 50 } = filters;

  const conditions = [];

  if (serviceTypeId) {
    conditions.push(eq(maintenanceServicesTable.serviceTypeId, serviceTypeId));
  }
  if (status) {
    conditions.push(eq(maintenanceServicesTable.status, status as any));
  }
  if (dateFrom) {
    conditions.push(gte(maintenanceServicesTable.serviceDate, dateFrom));
  }
  if (dateTo) {
    conditions.push(lte(maintenanceServicesTable.serviceDate, dateTo));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: maintenanceServicesTable.id,
      vehicleId: maintenanceServicesTable.vehicleId,
      serviceTypeId: maintenanceServicesTable.serviceTypeId,
      serviceCategories: maintenanceServicesTable.serviceCategories,
      serviceDate: maintenanceServicesTable.serviceDate,
      mileage: maintenanceServicesTable.mileage,
      cost: maintenanceServicesTable.cost,
      description: maintenanceServicesTable.description,
      mechanicName: maintenanceServicesTable.mechanicName,
      shopName: maintenanceServicesTable.shopName,
      status: maintenanceServicesTable.status,
      createdAt: maintenanceServicesTable.createdAt,
      updatedAt: maintenanceServicesTable.updatedAt,
      vehicleLicensePlate: vehicleTable.licensePlate,
      vehicleModelName: vehicleModelTable.name,
      brandName: brandTable.name,
      serviceTypeName: maintenanceServiceTypesTable.name,
    })
    .from(maintenanceServicesTable)
    .innerJoin(vehicleTable, eq(maintenanceServicesTable.vehicleId, vehicleTable.id))
    .innerJoin(vehicleModelTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
    .innerJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .leftJoin(maintenanceServiceTypesTable, eq(maintenanceServicesTable.serviceTypeId, maintenanceServiceTypesTable.id))
    .where(where)
    .orderBy(
      sql`CASE ${maintenanceServicesTable.status}
            WHEN 'SCHEDULED'   THEN 1
            WHEN 'IN_PROGRESS' THEN 2
            WHEN 'COMPLETED'   THEN 3
            WHEN 'CANCELLED'   THEN 4
            ELSE 5
          END`,
      desc(maintenanceServicesTable.serviceDate),
      desc(maintenanceServicesTable.createdAt),
    )
    .limit(limit)
    .offset((page - 1) * limit);

  // Client-side vehicle search filter (plate, model or brand)
  const filtered = vehicleSearch
    ? rows.filter((r) => {
        const q = vehicleSearch.toLowerCase();
        return (
          r.vehicleLicensePlate?.toLowerCase().includes(q) ||
          r.vehicleModelName?.toLowerCase().includes(q) ||
          r.brandName?.toLowerCase().includes(q)
        );
      })
    : rows;

  const totalRows = await db
    .select({ total: count() })
    .from(maintenanceServicesTable)
    .innerJoin(vehicleTable, eq(maintenanceServicesTable.vehicleId, vehicleTable.id))
    .where(where);

  return {
    data: filtered,
    meta: {
      page,
      limit,
      total: totalRows[0]?.total ?? 0,
    },
  };
}

export async function getServiceRecord(id: number) {
  const rows = await db
    .select({
      id: maintenanceServicesTable.id,
      vehicleId: maintenanceServicesTable.vehicleId,
      serviceTypeId: maintenanceServicesTable.serviceTypeId,
      serviceCategories: maintenanceServicesTable.serviceCategories,
      serviceDate: maintenanceServicesTable.serviceDate,
      mileage: maintenanceServicesTable.mileage,
      cost: maintenanceServicesTable.cost,
      description: maintenanceServicesTable.description,
      mechanicName: maintenanceServicesTable.mechanicName,
      shopName: maintenanceServicesTable.shopName,
      status: maintenanceServicesTable.status,
      createdAt: maintenanceServicesTable.createdAt,
      updatedAt: maintenanceServicesTable.updatedAt,
      vehicleLicensePlate: vehicleTable.licensePlate,
      vehicleModelName: vehicleModelTable.name,
      brandName: brandTable.name,
      serviceTypeName: maintenanceServiceTypesTable.name,
    })
    .from(maintenanceServicesTable)
    .innerJoin(vehicleTable, eq(maintenanceServicesTable.vehicleId, vehicleTable.id))
    .innerJoin(vehicleModelTable, eq(vehicleTable.vehicleModelId, vehicleModelTable.id))
    .innerJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .leftJoin(maintenanceServiceTypesTable, eq(maintenanceServicesTable.serviceTypeId, maintenanceServiceTypesTable.id))
    .where(eq(maintenanceServicesTable.id, id));

  const row = rows[0];
  if (!row) throw new NotFoundError(`Service record ${id} not found`);
  return row;
}

export async function createServiceRecord(data: {
  vehicleId: number;
  serviceTypeId?: number | null;
  serviceCategories?: string | null;
  serviceDate?: string | null;
  mileage?: number | null;
  cost?: string | null;
  description?: string | null;
  mechanicName?: string | null;
  shopName?: string | null;
  status?: string;
}) {
  const [row] = await db
    .insert(maintenanceServicesTable)
    .values(data as any)
    .returning();
  if (!row) throw new Error("Failed to create service record");
  return getServiceRecord(row.id);
}

export async function updateServiceRecord(
  id: number,
  data: Partial<{
    vehicleId: number;
    serviceTypeId: number | null;
    serviceCategories: string | null;
    serviceDate: string | null;
    mileage: number | null;
    cost: string | null;
    description: string | null;
    mechanicName: string | null;
    shopName: string | null;
    status: string;
  }>,
) {
  const [row] = await db
    .update(maintenanceServicesTable)
    .set({ ...(data as any), updatedAt: new Date() })
    .where(eq(maintenanceServicesTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Service record ${id} not found`);
  return getServiceRecord(id);
}

export async function deleteServiceRecord(id: number) {
  const [row] = await db
    .delete(maintenanceServicesTable)
    .where(eq(maintenanceServicesTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Service record ${id} not found`);
  return { message: "Service record deleted" };
}

// ─── Service Comments ─────────────────────────────────────────────────────────

export async function listServiceComments(serviceId: number) {
  return db
    .select({
      id: maintenanceServiceCommentTable.id,
      serviceId: maintenanceServiceCommentTable.serviceId,
      authorAdminId: maintenanceServiceCommentTable.authorAdminId,
      authorName: adminsTable.fullName,
      body: maintenanceServiceCommentTable.body,
      createdAt: maintenanceServiceCommentTable.createdAt,
    })
    .from(maintenanceServiceCommentTable)
    .leftJoin(
      adminsTable,
      eq(adminsTable.id, maintenanceServiceCommentTable.authorAdminId),
    )
    .where(eq(maintenanceServiceCommentTable.serviceId, serviceId))
    .orderBy(asc(maintenanceServiceCommentTable.createdAt));
}

export async function createServiceComment(params: {
  serviceId: number;
  authorAdminId: number | null;
  body: string;
}) {
  const [row] = await db
    .insert(maintenanceServiceCommentTable)
    .values({
      serviceId: params.serviceId,
      authorAdminId: params.authorAdminId,
      body: params.body,
    })
    .returning();
  return row;
}
