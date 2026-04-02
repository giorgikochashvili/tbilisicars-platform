import { db, adminsTable, adminRolesTable, adminRolePermissionsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const PERMISSION_KEYS = [
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

type PermissionKey = (typeof PERMISSION_KEYS)[number];

type RolePermissions = Record<PermissionKey, boolean>;

const SYSTEM_ROLES: Array<{
  name: string;
  description: string;
  color: string;
  enumValue: "admin" | "regional_manager" | "service_manager" | "rental_agent";
  permissions: RolePermissions;
}> = [
  {
    name: "Admin",
    description: "Full system access with all permissions",
    color: "#8b5cf6",
    enumValue: "admin",
    permissions: {
      canManageVehicles: true,
      canManageBookings: true,
      canManageUsers: true,
      canViewReports: true,
      canManageSettings: true,
      canManageRates: true,
      canManageExtras: true,
      canManagePromotions: true,
      canManageLocations: true,
      canViewReviews: true,
      canManageDamages: true,
      canManageTasks: true,
      canViewCalendar: true,
      canManageCases: true,
      canManageService: true,
      canViewAccounting: true,
      canManageAccounting: true,
      canViewAlerts: true,
      canViewAuditLog: true,
      canManageParking: true,
      canUseAdminAI: true,
    },
  },
  {
    name: "Regional Manager",
    description: "Manages a region — bookings, fleet, rates, reports",
    color: "#3b82f6",
    enumValue: "regional_manager",
    permissions: {
      canManageVehicles: true,
      canManageBookings: true,
      canManageUsers: false,
      canViewReports: true,
      canManageSettings: false,
      canManageRates: true,
      canManageExtras: true,
      canManagePromotions: true,
      canManageLocations: false,
      canViewReviews: true,
      canManageDamages: true,
      canManageTasks: true,
      canViewCalendar: true,
      canManageCases: true,
      canManageService: true,
      canViewAccounting: true,
      canManageAccounting: false,
      canViewAlerts: true,
      canViewAuditLog: true,
      canManageParking: true,
      canUseAdminAI: false,
    },
  },
  {
    name: "Service Manager",
    description: "Handles vehicle service and maintenance operations",
    color: "#f97316",
    enumValue: "service_manager",
    permissions: {
      canManageVehicles: false,
      canManageBookings: true,
      canManageUsers: false,
      canViewReports: false,
      canManageSettings: false,
      canManageRates: false,
      canManageExtras: false,
      canManagePromotions: false,
      canManageLocations: false,
      canViewReviews: false,
      canManageDamages: true,
      canManageTasks: true,
      canViewCalendar: true,
      canManageCases: true,
      canManageService: true,
      canViewAccounting: false,
      canManageAccounting: false,
      canViewAlerts: true,
      canViewAuditLog: false,
      canManageParking: false,
      canUseAdminAI: false,
    },
  },
  {
    name: "Rental Agent",
    description: "Handles bookings and customer interactions",
    color: "#64748b",
    enumValue: "rental_agent",
    permissions: {
      canManageVehicles: false,
      canManageBookings: true,
      canManageUsers: false,
      canViewReports: false,
      canManageSettings: false,
      canManageRates: false,
      canManageExtras: true,
      canManagePromotions: false,
      canManageLocations: false,
      canViewReviews: false,
      canManageDamages: false,
      canManageTasks: true,
      canViewCalendar: true,
      canManageCases: false,
      canManageService: false,
      canViewAccounting: false,
      canManageAccounting: false,
      canViewAlerts: true,
      canViewAuditLog: false,
      canManageParking: false,
      canUseAdminAI: false,
    },
  },
];

function buildPermissionUpdate(permissions: RolePermissions): Record<string, boolean> {
  const update: Record<string, boolean> = {};
  for (const key of PERMISSION_KEYS) {
    update[key] = permissions[key];
  }
  return update;
}

export async function seedSystemRoles(): Promise<void> {
  console.log("[seed-roles] Starting system roles seeding...");

  const enumToRoleId: Record<string, number> = {};

  for (const roleSpec of SYSTEM_ROLES) {
    const [existing] = await db
      .select({ id: adminRolesTable.id })
      .from(adminRolesTable)
      .where(eq(adminRolesTable.name, roleSpec.name))
      .limit(1);

    let roleId: number;

    if (existing) {
      roleId = existing.id;
    } else {
      const [inserted] = await db
        .insert(adminRolesTable)
        .values({
          name: roleSpec.name,
          description: roleSpec.description,
          color: roleSpec.color,
          isSystem: true,
          isActive: true,
        })
        .returning({ id: adminRolesTable.id });
      roleId = inserted!.id;
      console.log(`[seed-roles] Created system role: ${roleSpec.name} (id=${roleId})`);
    }

    enumToRoleId[roleSpec.enumValue] = roleId;

    for (const key of PERMISSION_KEYS) {
      await db
        .insert(adminRolePermissionsTable)
        .values({
          roleId,
          permissionKey: key,
          granted: roleSpec.permissions[key],
        })
        .onConflictDoNothing();
    }
  }

  const allAdmins = await db
    .select({
      id: adminsTable.id,
      adminRole: adminsTable.adminRole,
      roleId: adminsTable.roleId,
    })
    .from(adminsTable);

  for (const admin of allAdmins) {
    if (admin.roleId !== null) continue;

    const assignedRoleId = enumToRoleId[admin.adminRole];
    if (!assignedRoleId) continue;

    const roleSpec = SYSTEM_ROLES.find((r) => r.enumValue === admin.adminRole);
    if (!roleSpec) continue;

    await db
      .update(adminsTable)
      .set({
        roleId: assignedRoleId,
        ...buildPermissionUpdate(roleSpec.permissions),
        updatedAt: new Date(),
      })
      .where(eq(adminsTable.id, admin.id));

    console.log(
      `[seed-roles] Backfilled admin id=${admin.id} → role "${roleSpec.name}" (roleId=${assignedRoleId})`,
    );
  }

  console.log("[seed-roles] Done.");
}
