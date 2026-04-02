import { db, adminsTable, adminRolePermissionsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { NotFoundError } from "../lib/errors.js";
import { ALL_PERMISSION_KEYS } from "./admin-roles.service.js";

type LegacyRole = "admin" | "regional_manager" | "service_manager" | "rental_agent";

type AdminPermissionUpdate = {
  canManageVehicles?: boolean;
  canManageBookings?: boolean;
  canManageUsers?: boolean;
  canViewReports?: boolean;
  canManageSettings?: boolean;
  canManageRates?: boolean;
  canManageExtras?: boolean;
  canManagePromotions?: boolean;
  canManageLocations?: boolean;
  canViewReviews?: boolean;
  canManageDamages?: boolean;
  canManageTasks?: boolean;
  canViewCalendar?: boolean;
  canManageCases?: boolean;
  canManageService?: boolean;
  canViewAccounting?: boolean;
  canManageAccounting?: boolean;
  canViewAlerts?: boolean;
  canViewAuditLog?: boolean;
  canManageParking?: boolean;
  canUseAdminAI?: boolean;
};

const MEMBER_COLUMNS = {
  id: adminsTable.id,
  username: adminsTable.username,
  email: adminsTable.email,
  fullName: adminsTable.fullName,
  phoneNumber: adminsTable.phoneNumber,
  isActive: adminsTable.isActive,
  adminRole: adminsTable.adminRole,
  roleId: adminsTable.roleId,
  isSuperAdmin: adminsTable.isSuperAdmin,
  lastLogin: adminsTable.lastLogin,
  canManageVehicles: adminsTable.canManageVehicles,
  canManageBookings: adminsTable.canManageBookings,
  canManageUsers: adminsTable.canManageUsers,
  canViewReports: adminsTable.canViewReports,
  canManageSettings: adminsTable.canManageSettings,
  canManageRates: adminsTable.canManageRates,
  canManageExtras: adminsTable.canManageExtras,
  canManagePromotions: adminsTable.canManagePromotions,
  canManageLocations: adminsTable.canManageLocations,
  canViewReviews: adminsTable.canViewReviews,
  canManageDamages: adminsTable.canManageDamages,
  canManageTasks: adminsTable.canManageTasks,
  canViewCalendar: adminsTable.canViewCalendar,
  canManageCases: adminsTable.canManageCases,
  canManageService: adminsTable.canManageService,
  canViewAccounting: adminsTable.canViewAccounting,
  canManageAccounting: adminsTable.canManageAccounting,
  canViewAlerts: adminsTable.canViewAlerts,
  canViewAuditLog: adminsTable.canViewAuditLog,
  canManageParking: adminsTable.canManageParking,
  canUseAdminAI: adminsTable.canUseAdminAI,
  createdAt: adminsTable.createdAt,
  updatedAt: adminsTable.updatedAt,
} as const;

async function resolveRolePermissions(roleId: number): Promise<AdminPermissionUpdate> {
  const rows = await db
    .select()
    .from(adminRolePermissionsTable)
    .where(eq(adminRolePermissionsTable.roleId, roleId));

  const roleMap: Record<string, boolean> = {};
  for (const row of rows) {
    roleMap[row.permissionKey] = row.granted;
  }

  const result: AdminPermissionUpdate = {};
  for (const key of ALL_PERMISSION_KEYS) {
    (result as Record<string, boolean>)[key] = roleMap[key] ?? false;
  }
  return result;
}

export async function listAdminTeam() {
  return db
    .select(MEMBER_COLUMNS)
    .from(adminsTable)
    .orderBy(asc(adminsTable.fullName));
}

export async function getAdminTeamMember(id: number) {
  const [row] = await db
    .select(MEMBER_COLUMNS)
    .from(adminsTable)
    .where(eq(adminsTable.id, id));
  if (!row) throw new NotFoundError(`Team member ${id} not found`);
  return row;
}

export async function createAdminTeamMember(data: {
  username: string;
  email: string;
  fullName: string;
  password: string;
  phoneNumber?: string | null;
  isActive?: boolean;
  adminRole?: LegacyRole;
  roleId?: number | null;
}) {
  const hashedPassword = await bcrypt.hash(data.password, 12);

  const permValues: AdminPermissionUpdate = data.roleId
    ? await resolveRolePermissions(data.roleId)
    : {};

  const [row] = await db
    .insert(adminsTable)
    .values({
      username: data.username,
      email: data.email,
      fullName: data.fullName,
      hashedPassword,
      phoneNumber: data.phoneNumber ?? null,
      isActive: data.isActive ?? true,
      adminRole: data.adminRole ?? "rental_agent",
      roleId: data.roleId ?? null,
      ...permValues,
    })
    .returning({ id: adminsTable.id });

  return getAdminTeamMember(row!.id);
}

export async function updateAdminTeamMember(
  id: number,
  data: Partial<{
    username: string;
    email: string;
    fullName: string;
    password: string;
    phoneNumber: string | null;
    isActive: boolean;
    adminRole: LegacyRole;
    roleId: number | null;
  }>,
) {
  type DrizzleAdminUpdate = {
    updatedAt: Date;
    username?: string;
    email?: string;
    fullName?: string;
    hashedPassword?: string;
    phoneNumber?: string | null;
    isActive?: boolean;
    adminRole?: LegacyRole;
    roleId?: number | null;
  } & AdminPermissionUpdate;

  const update: DrizzleAdminUpdate = { updatedAt: new Date() };

  if (data.username !== undefined) update.username = data.username;
  if (data.email !== undefined) update.email = data.email;
  if (data.fullName !== undefined) update.fullName = data.fullName;
  if (data.phoneNumber !== undefined) update.phoneNumber = data.phoneNumber;
  if (data.isActive !== undefined) update.isActive = data.isActive;
  if (data.adminRole !== undefined) update.adminRole = data.adminRole;
  if (data.password) update.hashedPassword = await bcrypt.hash(data.password, 12);

  if (data.roleId !== undefined) {
    update.roleId = data.roleId;
    if (data.roleId !== null) {
      const perms = await resolveRolePermissions(data.roleId);
      Object.assign(update, perms);
    }
  }

  const [row] = await db
    .update(adminsTable)
    .set(update)
    .where(eq(adminsTable.id, id))
    .returning({ id: adminsTable.id });

  if (!row) throw new NotFoundError(`Team member ${id} not found`);
  return getAdminTeamMember(id);
}

export async function deleteAdminTeamMember(id: number) {
  const [row] = await db
    .delete(adminsTable)
    .where(eq(adminsTable.id, id))
    .returning({ id: adminsTable.id });
  if (!row) throw new NotFoundError(`Team member ${id} not found`);
  return { message: "Team member deleted" };
}
