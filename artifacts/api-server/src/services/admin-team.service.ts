import { db, adminsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { NotFoundError } from "../lib/errors.js";

export async function listAdminTeam() {
  const rows = await db
    .select({
      id: adminsTable.id,
      username: adminsTable.username,
      email: adminsTable.email,
      fullName: adminsTable.fullName,
      isActive: adminsTable.isActive,
      adminRole: adminsTable.adminRole,
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
      createdAt: adminsTable.createdAt,
      updatedAt: adminsTable.updatedAt,
    })
    .from(adminsTable)
    .orderBy(asc(adminsTable.fullName));
  return rows;
}

export async function getAdminTeamMember(id: number) {
  const rows = await db
    .select({
      id: adminsTable.id,
      username: adminsTable.username,
      email: adminsTable.email,
      fullName: adminsTable.fullName,
      isActive: adminsTable.isActive,
      adminRole: adminsTable.adminRole,
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
      createdAt: adminsTable.createdAt,
      updatedAt: adminsTable.updatedAt,
    })
    .from(adminsTable)
    .where(eq(adminsTable.id, id));
  const row = rows[0];
  if (!row) throw new NotFoundError(`Team member ${id} not found`);
  return row;
}

export async function createAdminTeamMember(data: {
  username: string;
  email: string;
  fullName: string;
  password: string;
  isActive?: boolean;
  adminRole?: "admin" | "regional_manager" | "service_manager" | "rental_agent";
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
}) {
  const { password, ...rest } = data;
  const hashedPassword = await bcrypt.hash(password, 12);
  const [row] = await db
    .insert(adminsTable)
    .values({ ...rest, hashedPassword } as any)
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
    isActive: boolean;
    adminRole: "admin" | "regional_manager" | "service_manager" | "rental_agent";
    canManageVehicles: boolean;
    canManageBookings: boolean;
    canManageUsers: boolean;
    canViewReports: boolean;
    canManageSettings: boolean;
    canManageRates: boolean;
    canManageExtras: boolean;
    canManagePromotions: boolean;
    canManageLocations: boolean;
    canViewReviews: boolean;
    canManageDamages: boolean;
    canManageTasks: boolean;
    canViewCalendar: boolean;
    canManageCases: boolean;
  }>,
) {
  const { password, ...rest } = data;
  const updatePayload: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (password) {
    updatePayload.hashedPassword = await bcrypt.hash(password, 12);
  }
  const [row] = await db
    .update(adminsTable)
    .set(updatePayload as any)
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
