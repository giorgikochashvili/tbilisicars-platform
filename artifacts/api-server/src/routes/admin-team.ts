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

router.get("/admin/team", requireAdmin, async (_req, res) => {
  const data = await listAdminTeam();
  res.json(data);
});

router.post("/admin/team", requireAdmin, requirePermission("canManageUsers"), async (req, res) => {
  const { username, email, fullName, password, phoneNumber, isActive, roleId } = req.body ?? {};

  if (
    typeof username !== "string" || !username ||
    typeof email !== "string" || !email ||
    typeof fullName !== "string" || !fullName ||
    typeof password !== "string" || !password
  ) {
    res.status(400).json({ error: "username, email, fullName and password are required" });
    return;
  }

  if (typeof roleId !== "number" || !Number.isInteger(roleId) || roleId < 1) {
    res.status(400).json({ error: "roleId is required and must be a valid role ID" });
    return;
  }

  const member = await createAdminTeamMember({
    username,
    email,
    fullName,
    password,
    phoneNumber: typeof phoneNumber === "string" ? phoneNumber || null : null,
    isActive: typeof isActive === "boolean" ? isActive : true,
    roleId,
  });

  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "team_member",
    entityId: member.id,
    entityRef: email,
    action: "created",
    summary: `Admin created team member ${fullName} (${email}) with role ${roleId}`,
    afterData: { email, fullName, roleId, adminRole: member.adminRole },
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

  const { username, email, fullName, password, phoneNumber, isActive, roleId } = req.body ?? {};
  const data: Parameters<typeof updateAdminTeamMember>[1] = {};

  if (typeof username === "string" && username) data.username = username;
  if (typeof email === "string" && email) data.email = email;
  if (typeof fullName === "string" && fullName) data.fullName = fullName;
  if (typeof password === "string" && password) data.password = password;
  if (phoneNumber !== undefined) data.phoneNumber = typeof phoneNumber === "string" ? phoneNumber || null : null;
  if (typeof isActive === "boolean") data.isActive = isActive;
  if (typeof roleId === "number" && Number.isInteger(roleId) && roleId > 0) data.roleId = roleId;

  const member = await updateAdminTeamMember(id, data);

  logAudit({
    actorId: req.session.adminId ?? null,
    entityType: "team_member",
    entityId: id,
    entityRef: member.email,
    action: "updated",
    summary: `Admin updated team member ${member.fullName}`,
    afterData: { isActive: member.isActive, adminRole: member.adminRole, roleId: member.roleId },
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
    summary: `Admin deleted team member ID ${id}`,
  });
  res.json(result);
});

export default router;
