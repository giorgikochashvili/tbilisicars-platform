import { Router } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { db, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";
import {
  listAdminTasks,
  getAdminTask,
  createAdminTask,
  updateAdminTask,
  deleteAdminTask,
  listTaskComments,
  createTaskComment,
  listTaskActivity,
  getMyTasksSummary,
  listAdminsForTasks,
} from "../services/admin-tasks.service.js";

const router = Router();

// ─── Helper: resolve staff scope ──────────────────────────────────────────────
// Admins and managers have full access. Rental agents / service_managers
// are scoped to their own tasks only.

async function resolveScope(req: any): Promise<{ isFullAccess: boolean; adminId: number }> {
  const adminId = req.session.adminId as number;
  const rows = await db
    .select({ adminRole: adminsTable.adminRole, canManageTasks: adminsTable.canManageTasks })
    .from(adminsTable)
    .where(eq(adminsTable.id, adminId))
    .limit(1);
  const admin = rows[0];
  if (!admin) throw new ForbiddenError();
  const isFullAccess =
    admin.adminRole === "admin" ||
    admin.adminRole === "regional_manager" ||
    admin.adminRole === "service_manager";
  return { isFullAccess, adminId };
}

// ─── GET /api/admin/tasks/my-summary ──────────────────────────────────────────

router.get("/admin/tasks/my-summary", requireAdmin, async (req, res) => {
  const adminId = req.session.adminId as number;
  const summary = await getMyTasksSummary(adminId);
  res.json(summary);
});

// ─── GET /api/admin/tasks/assignees ───────────────────────────────────────────

router.get("/admin/tasks/assignees", requireAdmin, async (_req, res) => {
  const admins = await listAdminsForTasks();
  res.json(admins);
});

// ─── GET /api/admin/tasks ─────────────────────────────────────────────────────

router.get("/admin/tasks", requireAdmin, async (req, res) => {
  const { isFullAccess, adminId } = await resolveScope(req);
  const q = req.query as Record<string, string | undefined>;

  const result = await listAdminTasks({
    search: q.search,
    status: q.status,
    priority: q.priority,
    assigneeId: q.assigneeId ? parseInt(q.assigneeId) : undefined,
    creatorId: q.creatorId ? parseInt(q.creatorId) : undefined,
    dueState: q.dueState as any,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    myId: isFullAccess ? undefined : adminId,
    page: q.page ? parseInt(q.page) : 1,
    limit: q.limit ? parseInt(q.limit) : 50,
  });

  res.json(result);
});

// ─── POST /api/admin/tasks ────────────────────────────────────────────────────

router.post("/admin/tasks", requireAdmin, async (req, res) => {
  const { isFullAccess, adminId } = await resolveScope(req);

  if (!isFullAccess) {
    throw new ForbiddenError("Only admins and managers can create tasks");
  }

  const body = req.body as any;
  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const task = await createAdminTask({
    title: body.title.trim(),
    description: body.description ?? null,
    assignedToId: body.assignedToId ?? null,
    priority: body.priority ?? "Medium",
    status: body.status ?? "To Do",
    progressPercent: typeof body.progressPercent === "number" ? Math.min(100, Math.max(0, body.progressPercent)) : 0,
    startDate: body.startDate ?? null,
    dueDate: body.dueDate ?? null,
    relatedType: body.relatedType ?? null,
    relatedId: body.relatedId ?? null,
    createdById: adminId,
  });

  res.status(201).json(task);
});

// ─── GET /api/admin/tasks/:id ─────────────────────────────────────────────────

router.get("/admin/tasks/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { isFullAccess, adminId } = await resolveScope(req);

  const task = await getAdminTask(id, isFullAccess ? undefined : adminId);

  const [comments, activity] = await Promise.all([
    listTaskComments(id),
    listTaskActivity(id),
  ]);

  res.json({ ...task, comments, activity });
});

// ─── PATCH /api/admin/tasks/:id ───────────────────────────────────────────────

router.patch("/admin/tasks/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { isFullAccess, adminId } = await resolveScope(req);
  const body = req.body as any;

  // Staff can only update status, progress; not reassign or retitle
  const input: any = {};
  if (isFullAccess) {
    if (body.title !== undefined) input.title = String(body.title).trim();
    if (body.description !== undefined) input.description = body.description ?? null;
    if (body.assignedToId !== undefined) input.assignedToId = body.assignedToId ?? null;
    if (body.priority !== undefined) input.priority = body.priority;
    if (body.startDate !== undefined) input.startDate = body.startDate ?? null;
    if (body.dueDate !== undefined) input.dueDate = body.dueDate ?? null;
    if (body.relatedType !== undefined) input.relatedType = body.relatedType ?? null;
    if (body.relatedId !== undefined) input.relatedId = body.relatedId ?? null;
  }
  // Both staff and full-access can change status and progress
  if (body.status !== undefined) input.status = body.status;
  if (body.progressPercent !== undefined) {
    input.progressPercent = Math.min(100, Math.max(0, parseInt(body.progressPercent)));
  }

  const updated = await updateAdminTask(id, input, adminId, isFullAccess ? undefined : adminId);
  res.json(updated);
});

// ─── DELETE /api/admin/tasks/:id ──────────────────────────────────────────────

router.delete("/admin/tasks/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { isFullAccess } = await resolveScope(req);

  if (!isFullAccess) {
    throw new ForbiddenError("Only admins and managers can delete tasks");
  }

  await deleteAdminTask(id);
  res.json({ message: "Task deleted" });
});

// ─── GET /api/admin/tasks/:id/comments ────────────────────────────────────────

router.get("/admin/tasks/:id/comments", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { isFullAccess, adminId } = await resolveScope(req);
  await getAdminTask(id, isFullAccess ? undefined : adminId); // auth check
  const comments = await listTaskComments(id);
  res.json(comments);
});

// ─── POST /api/admin/tasks/:id/comments ───────────────────────────────────────

router.post("/admin/tasks/:id/comments", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { isFullAccess, adminId } = await resolveScope(req);
  await getAdminTask(id, isFullAccess ? undefined : adminId); // auth check

  const body = req.body as any;
  if (!body.body || typeof body.body !== "string" || !body.body.trim()) {
    res.status(400).json({ error: "comment body is required" });
    return;
  }

  const comment = await createTaskComment(id, adminId, body.body.trim());
  res.status(201).json(comment);
});

// ─── GET /api/admin/tasks/:id/activity ────────────────────────────────────────

router.get("/admin/tasks/:id/activity", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { isFullAccess, adminId } = await resolveScope(req);
  await getAdminTask(id, isFullAccess ? undefined : adminId); // auth check
  const activity = await listTaskActivity(id);
  res.json(activity);
});

export default router;
