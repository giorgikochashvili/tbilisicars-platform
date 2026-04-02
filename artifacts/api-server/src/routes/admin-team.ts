import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import {
  listAdminTeam,
  getAdminTeamMember,
  createAdminTeamMember,
  updateAdminTeamMember,
  deleteAdminTeamMember,
} from "../services/admin-team.service.js";
import { logAudit } from "../services/audit.service.js";

const router: IRouter = Router();

const VALID_ROLES = ["admin", "regional_manager", "service_manager", "rental_agent"] as const;
type AdminRole = (typeof VALID_ROLES)[number];

function isValidRole(v: unknown): v is AdminRole {
  return typeof v === "string" && (VALID_ROLES as readonly string[]).includes(v);
}

router.get("/admin/team", requireAdmin, async (_req, res) => {
  const data = await listAdminTeam();
  res.json(data);
});

router.post("/admin/team", requireAdmin, requirePermission("canManageUsers"), async (req, res) => {
  const { username, email, fullName, password, phoneNumber, isActive, adminRole, roleId } = req.body ?? {};
  if (
    typeof username !== "string" || !username ||
    typeof email !== "string" || !email ||
    typeof fullName !== "string" || !fullName ||
    typeof password !== "string" || !password
  ) {
    res.status(400).json({ error: "username, email, fullName and password are required" });
    return;
  }
  const member = await createAdminTeamMember({
    username,
    email,
    fullName,
    password,
    phoneNumber: typeof phoneNumber === "string" ? phoneNumber || null : null,
    isActive: typeof isActive === "boolean" ? isActive : true,
    adminRole: isValidRole(adminRole) ? adminRole : "rental_agent",
    roleId: typeof roleId === "number" ? roleId : null,
  });
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "team_member",
    entityId: member.id,
    entityRef: email,
    action: "created",
    summary: `Admin created team member ${fullName} (${email})`,
    afterData: { email, fullName, adminRole: isValidRole(adminRole) ? adminRole : "rental_agent", roleId },
  });
  res.status(201).json(member);
});

router.get("/admin/team/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const member = await getAdminTeamMember(id);
  res.json(member);
});

router.patch("/admin/team/:id", requireAdmin, requirePermission("canManageUsers"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { username, email, fullName, password, phoneNumber, isActive, adminRole, roleId } = req.body ?? {};
  const data: Parameters<typeof updateAdminTeamMember>[1] = {};
  if (typeof username === "string" && username) data.username = username;
  if (typeof email === "string" && email) data.email = email;
  if (typeof fullName === "string" && fullName) data.fullName = fullName;
  if (typeof password === "string" && password) data.password = password;
  if (phoneNumber !== undefined) data.phoneNumber = typeof phoneNumber === "string" ? phoneNumber || null : null;
  if (typeof isActive === "boolean") data.isActive = isActive;
  if (isValidRole(adminRole)) data.adminRole = adminRole;
  if (typeof roleId === "number") data.roleId = roleId;
  const member = await updateAdminTeamMember(id, data);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "team_member",
    entityId: id,
    entityRef: (member as any).email ?? String(id),
    action: "updated",
    summary: `Admin updated team member ${(member as any).fullName ?? id}`,
    afterData: { isActive: (member as any).isActive, adminRole: (member as any).adminRole },
  });
  res.json(member);
});

router.delete("/admin/team/:id", requireAdmin, requirePermission("canManageUsers"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await deleteAdminTeamMember(id);
  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "team_member",
    entityId: id,
    entityRef: String(id),
    action: "deleted",
    summary: `Admin deleted/deactivated team member ID ${id}`,
  });
  res.json(result);
});

export default router;
