import { db, adminRolesTable, adminRolePermissionsTable, adminsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

export const ALL_PERMISSION_KEYS = [
  "canManageVehicles",
  "canManageBookings",
  "canManageUsers",
  "canViewReports",
  "canManageSettings",
  "canManageRates",
  "canManageExtras",
  "canManagePromotions",
  "canManageLocations",
  "canViewReviews",
  "canManageDamages",
  "canManageTasks",
  "canViewCalendar",
  "canManageCases",
  "canManageService",
  "canViewAccounting",
  "canManageAccounting",
  "canViewAlerts",
  "canViewAuditLog",
  "canManageParking",
  "canUseAdminAI",
] as const;

type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

function normalizePermissions(partial: Record<string, boolean>): Record<PermissionKey, boolean> {
  const full = {} as Record<PermissionKey, boolean>;
  for (const key of ALL_PERMISSION_KEYS) {
    full[key] = partial[key] ?? false;
  }
  return full;
}

async function upsertPermissions(roleId: number, permissions: Record<string, boolean>) {
  const normalized = normalizePermissions(permissions);
  for (const [key, granted] of Object.entries(normalized)) {
    await db
      .insert(adminRolePermissionsTable)
      .values({ roleId, permissionKey: key, granted })
      .onConflictDoUpdate({
        target: [adminRolePermissionsTable.roleId, adminRolePermissionsTable.permissionKey],
        set: { granted },
      });
  }
}

export async function listAdminRoles(includeRoleId?: number) {
  const rows = await db
    .select({
      id: adminRolesTable.id,
      name: adminRolesTable.name,
      description: adminRolesTable.description,
      color: adminRolesTable.color,
      isSystem: adminRolesTable.isSystem,
      isActive: adminRolesTable.isActive,
      createdAt: adminRolesTable.createdAt,
      updatedAt: adminRolesTable.updatedAt,
    })
    .from(adminRolesTable)
    .orderBy(adminRolesTable.name);

  const filtered = rows.filter(
    (r) => r.isActive || (includeRoleId !== undefined && r.id === includeRoleId),
  );

  const allPerms = await db.select().from(adminRolePermissionsTable);

  return filtered.map((role) => {
    const rolePerms = allPerms
      .filter((p) => p.roleId === role.id)
      .reduce<Record<string, boolean>>((acc, p) => {
        acc[p.permissionKey] = p.granted;
        return acc;
      }, {});
    return { ...role, permissions: normalizePermissions(rolePerms) };
  });
}

export async function getAdminRole(id: number) {
  const [role] = await db
    .select()
    .from(adminRolesTable)
    .where(eq(adminRolesTable.id, id))
    .limit(1);

  if (!role) throw new NotFoundError(`Role ${id} not found`);

  const perms = await db
    .select()
    .from(adminRolePermissionsTable)
    .where(eq(adminRolePermissionsTable.roleId, id));

  const permMap = perms.reduce<Record<string, boolean>>((acc, p) => {
    acc[p.permissionKey] = p.granted;
    return acc;
  }, {});

  const memberCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminsTable)
    .where(eq(adminsTable.roleId, id));

  return {
    ...role,
    permissions: normalizePermissions(permMap),
    memberCount: memberCount[0]?.count ?? 0,
  };
}

export async function createAdminRole(data: {
  name: string;
  description?: string;
  color?: string;
  permissions: Record<string, boolean>;
}) {
  const [inserted] = await db
    .insert(adminRolesTable)
    .values({
      name: data.name,
      description: data.description,
      color: data.color,
      isSystem: false,
      isActive: true,
    })
    .returning({ id: adminRolesTable.id });

  const roleId = inserted!.id;
  await upsertPermissions(roleId, data.permissions);
  return getAdminRole(roleId);
}

export async function updateAdminRole(
  id: number,
  data: {
    name?: string;
    description?: string;
    color?: string;
    isActive?: boolean;
    permissions?: Record<string, boolean>;
  },
) {
  const [existing] = await db
    .select({ id: adminRolesTable.id, isSystem: adminRolesTable.isSystem })
    .from(adminRolesTable)
    .where(eq(adminRolesTable.id, id))
    .limit(1);

  if (!existing) throw new NotFoundError(`Role ${id} not found`);

  if (existing.isSystem && data.name !== undefined) {
    throw Object.assign(new Error("System role names cannot be changed"), { statusCode: 400 });
  }

  const updates: {
    updatedAt: Date;
    name?: string;
    description?: string;
    color?: string;
    isActive?: boolean;
  } = { updatedAt: new Date() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.color !== undefined) updates.color = data.color;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  await db.update(adminRolesTable).set(updates).where(eq(adminRolesTable.id, id));

  if (data.permissions !== undefined) {
    await upsertPermissions(id, data.permissions);
  }

  return getAdminRole(id);
}

export async function deactivateAdminRole(id: number) {
  const [role] = await db
    .select()
    .from(adminRolesTable)
    .where(eq(adminRolesTable.id, id))
    .limit(1);

  if (!role) throw new NotFoundError(`Role ${id} not found`);

  if (role.isSystem) {
    throw Object.assign(new Error("System roles cannot be deleted"), { statusCode: 400 });
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminsTable)
    .where(and(eq(adminsTable.roleId, id), eq(adminsTable.isActive, true)));

  if (count > 0) {
    throw Object.assign(
      new Error(`Cannot deactivate role with ${count} active member(s). Reassign them first.`),
      { statusCode: 400 },
    );
  }

  await db
    .update(adminRolesTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(adminRolesTable.id, id));

  return { message: "Role deactivated" };
}
