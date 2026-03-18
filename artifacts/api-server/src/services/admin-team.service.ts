import { db, adminsTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { NotFoundError } from "../lib/errors.js";

const MEMBER_COLUMNS = {
  id: adminsTable.id,
  username: adminsTable.username,
  email: adminsTable.email,
  fullName: adminsTable.fullName,
  phoneNumber: adminsTable.phoneNumber,
  isActive: adminsTable.isActive,
  adminRole: adminsTable.adminRole,
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
  createdAt: adminsTable.createdAt,
  updatedAt: adminsTable.updatedAt,
} as const;

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
  adminRole?: "admin" | "regional_manager" | "service_manager" | "rental_agent";
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
    phoneNumber: string | null;
    isActive: boolean;
    adminRole: "admin" | "regional_manager" | "service_manager" | "rental_agent";
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
