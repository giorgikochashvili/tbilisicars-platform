import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import {
  listAdminRoles,
  getAdminRole,
  createAdminRole,
  updateAdminRole,
  deactivateAdminRole,
} from "../services/admin-roles.service.js";

const router: IRouter = Router();

router.get("/admin/roles", requireAdmin, async (req, res) => {
  const includeRoleId = req.query.includeRoleId
    ? Number(req.query.includeRoleId)
    : undefined;
  const roles = await listAdminRoles(
    includeRoleId && !Number.isNaN(includeRoleId) ? includeRoleId : undefined,
  );
  res.json(roles);
});

router.post("/admin/roles", requireAdmin, requirePermission("canManageUsers"), async (req, res) => {
  const { name, description, color, permissions } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const role = await createAdminRole({
    name: name.trim(),
    description: typeof description === "string" ? description : undefined,
    color: typeof color === "string" ? color : undefined,
    permissions: permissions && typeof permissions === "object" ? permissions : {},
  });
  res.status(201).json(role);
});

router.get("/admin/roles/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const role = await getAdminRole(id);
  res.json(role);
});

router.patch("/admin/roles/:id", requireAdmin, requirePermission("canManageUsers"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, description, color, isActive, permissions } = req.body ?? {};
  const role = await updateAdminRole(id, {
    name: typeof name === "string" && name.trim() ? name.trim() : undefined,
    description: description !== undefined ? (typeof description === "string" ? description : undefined) : undefined,
    color: color !== undefined ? (typeof color === "string" ? color : undefined) : undefined,
    isActive: typeof isActive === "boolean" ? isActive : undefined,
    permissions: permissions && typeof permissions === "object" ? permissions : undefined,
  });
  res.json(role);
});

router.delete("/admin/roles/:id", requireAdmin, requirePermission("canManageUsers"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await deactivateAdminRole(id);
  res.json(result);
});

export default router;
