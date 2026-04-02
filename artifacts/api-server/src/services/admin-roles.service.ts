import { db, adminRolesTable, adminRolePermissionsTable, adminsTable } from "@workspace/db";
import { eq, or, and, sql } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

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

  const permissions = await db
    .select()
    .from(adminRolePermissionsTable);

  return filtered.map((role) => ({
    ...role,
    permissions: permissions
      .filter((p) => p.roleId === role.id)
      .reduce<Record<string, boolean>>((acc, p) => {
        acc[p.permissionKey] = p.granted;
        return acc;
      }, {}),
  }));
}

export async function getAdminRole(id: number) {
  const [role] = await db
    .select()
    .from(adminRolesTable)
    .where(eq(adminRolesTable.id, id))
    .limit(1);

  if (!role) throw new NotFoundError(`Role ${id} not found`);

  const permissions = await db
    .select()
    .from(adminRolePermissionsTable)
    .where(eq(adminRolePermissionsTable.roleId, id));

  const memberCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminsTable)
    .where(eq(adminsTable.roleId, id));

  return {
    ...role,
    permissions: permissions.reduce<Record<string, boolean>>((acc, p) => {
      acc[p.permissionKey] = p.granted;
      return acc;
    }, {}),
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

  if (Object.keys(data.permissions).length > 0) {
    await db.insert(adminRolePermissionsTable).values(
      Object.entries(data.permissions).map(([key, granted]) => ({
        roleId,
        permissionKey: key,
        granted,
      })),
    ).onConflictDoNothing();
  }

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
    .select({ id: adminRolesTable.id })
    .from(adminRolesTable)
    .where(eq(adminRolesTable.id, id))
    .limit(1);

  if (!existing) throw new NotFoundError(`Role ${id} not found`);

  const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.color !== undefined) updatePayload.color = data.color;
  if (data.isActive !== undefined) updatePayload.isActive = data.isActive;

  if (Object.keys(updatePayload).length > 1) {
    await db
      .update(adminRolesTable)
      .set(updatePayload as any)
      .where(eq(adminRolesTable.id, id));
  }

  if (data.permissions) {
    for (const [key, granted] of Object.entries(data.permissions)) {
      await db
        .insert(adminRolePermissionsTable)
        .values({ roleId: id, permissionKey: key, granted })
        .onConflictDoUpdate({
          target: [adminRolePermissionsTable.roleId, adminRolePermissionsTable.permissionKey],
          set: { granted },
        });
    }
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

  const members = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminsTable)
    .where(eq(adminsTable.roleId, id));

  const count = members[0]?.count ?? 0;
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
