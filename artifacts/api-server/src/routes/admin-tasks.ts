import { Router, Request } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { db, adminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ForbiddenError } from "../lib/errors.js";
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
  type UpdateTaskInput,
} from "../services/admin-tasks.service.js";

const router = Router();

// ─── Helper: resolve staff scope ──────────────────────────────────────────────
// Admins and managers have full access. Rental agents are scoped to own tasks.

async function resolveScope(req: Request): Promise<{ isFullAccess: boolean; adminId: number }> {
  const adminId = req.session.adminId as number;
  const rows = await db
    .select({ adminRole: adminsTable.adminRole, canManageTasks: adminsTable.canManageTasks })
    .from(adminsTable)
    .where(eq(adminsTable.id, adminId))
    .limit(1);
  const admin = rows[0];
  if (!admin) throw new ForbiddenError();
  if (!admin.canManageTasks) throw new ForbiddenError("Tasks access is not enabled for your account");
  const isFullAccess =
    admin.adminRole === "admin" ||
    admin.adminRole === "regional_manager" ||
    admin.adminRole === "service_manager";
  return { isFullAccess, adminId };
}

// ─── GET /api/admin/tasks/my-summary ──────────────────────────────────────────

router.get("/admin/tasks/my-summary", requireAdmin, async (req, res) => {
  const { adminId } = await resolveScope(req);
  const summary = await getMyTasksSummary(adminId);
  res.json(summary);
});

// ─── GET /api/admin/tasks/assignees ───────────────────────────────────────────

router.get("/admin/tasks/assignees", requireAdmin, async (req, res) => {
  await resolveScope(req);
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
    assigneeId: q.assigneeId ? parseInt(q.assigneeId, 10) : undefined,
    creatorId: q.creatorId ? parseInt(q.creatorId, 10) : undefined,
    dueState: q.dueState as "overdue" | "today" | "upcoming" | undefined,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    myId: isFullAccess ? undefined : adminId,
    page: q.page ? parseInt(q.page, 10) : 1,
    limit: q.limit ? parseInt(q.limit, 10) : 50,
  });

  res.json(result);
});

// ─── POST /api/admin/tasks ────────────────────────────────────────────────────

router.post("/admin/tasks", requireAdmin, async (req, res) => {
  const { isFullAccess, adminId } = await resolveScope(req);

  if (!isFullAccess) {
    throw new ForbiddenError("Only admins and managers can create tasks");
  }

  const body = req.body as {
    title?: unknown;
    description?: unknown;
    assignedToId?: unknown;
    priority?: unknown;
    status?: unknown;
    progressPercent?: unknown;
    startDate?: unknown;
    dueDate?: unknown;
    relatedType?: unknown;
    relatedId?: unknown;
  };

  if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const task = await createAdminTask({
    title: body.title.trim(),
    description: typeof body.description === "string" ? body.description : null,
    assignedToId: typeof body.assignedToId === "number" ? body.assignedToId : null,
    priority: typeof body.priority === "string" ? body.priority : "Medium",
    status: typeof body.status === "string" ? body.status : "To Do",
    progressPercent: typeof body.progressPercent === "number"
      ? Math.min(100, Math.max(0, body.progressPercent))
      : 0,
    startDate: typeof body.startDate === "string" ? body.startDate : null,
    dueDate: typeof body.dueDate === "string" ? body.dueDate : null,
    relatedType: typeof body.relatedType === "string" ? body.relatedType : null,
    relatedId: typeof body.relatedId === "number" ? body.relatedId : null,
    createdById: adminId,
  });

  res.status(201).json(task);
});

// ─── GET /api/admin/tasks/:id ─────────────────────────────────────────────────

router.get("/admin/tasks/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
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
  const id = parseInt(req.params.id, 10);
  const { isFullAccess, adminId } = await resolveScope(req);

  const body = req.body as {
    title?: unknown;
    description?: unknown;
    assignedToId?: unknown;
    priority?: unknown;
    status?: unknown;
    progressPercent?: unknown;
    startDate?: unknown;
    dueDate?: unknown;
    relatedType?: unknown;
    relatedId?: unknown;
  };

  const input: UpdateTaskInput = {};

  if (isFullAccess) {
    if (body.title !== undefined) input.title = String(body.title).trim();
    if (body.description !== undefined) {
      input.description = typeof body.description === "string" ? body.description : null;
    }
    if (body.assignedToId !== undefined) {
      input.assignedToId = typeof body.assignedToId === "number" ? body.assignedToId : null;
    }
    if (body.priority !== undefined) input.priority = String(body.priority);
    if (body.startDate !== undefined) {
      input.startDate = typeof body.startDate === "string" ? body.startDate : null;
    }
    if (body.dueDate !== undefined) {
      input.dueDate = typeof body.dueDate === "string" ? body.dueDate : null;
    }
    if (body.relatedType !== undefined) {
      input.relatedType = typeof body.relatedType === "string" ? body.relatedType : null;
    }
    if (body.relatedId !== undefined) {
      input.relatedId = typeof body.relatedId === "number" ? body.relatedId : null;
    }
  }
  if (body.status !== undefined) input.status = String(body.status);
  if (body.progressPercent !== undefined) {
    const raw = Number(body.progressPercent);
    input.progressPercent = Math.min(100, Math.max(0, isNaN(raw) ? 0 : raw));
  }

  const updated = await updateAdminTask(id, input, adminId, isFullAccess ? undefined : adminId);
  res.json(updated);
});

// ─── DELETE /api/admin/tasks/:id ──────────────────────────────────────────────

router.delete("/admin/tasks/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { isFullAccess } = await resolveScope(req);

  if (!isFullAccess) {
    throw new ForbiddenError("Only admins and managers can delete tasks");
  }

  await deleteAdminTask(id);
  res.json({ message: "Task deleted" });
});

// ─── GET /api/admin/tasks/:id/comments ────────────────────────────────────────

router.get("/admin/tasks/:id/comments", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { isFullAccess, adminId } = await resolveScope(req);
  await getAdminTask(id, isFullAccess ? undefined : adminId);
  const comments = await listTaskComments(id);
  res.json(comments);
});

// ─── POST /api/admin/tasks/:id/comments ───────────────────────────────────────

router.post("/admin/tasks/:id/comments", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { isFullAccess, adminId } = await resolveScope(req);
  await getAdminTask(id, isFullAccess ? undefined : adminId);

  const body = req.body as { body?: unknown };
  if (!body.body || typeof body.body !== "string" || !body.body.trim()) {
    res.status(400).json({ error: "comment body is required" });
    return;
  }

  const comment = await createTaskComment(id, adminId, body.body.trim());
  res.status(201).json(comment);
});

// ─── GET /api/admin/tasks/:id/activity ────────────────────────────────────────

router.get("/admin/tasks/:id/activity", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { isFullAccess, adminId } = await resolveScope(req);
  await getAdminTask(id, isFullAccess ? undefined : adminId);
  const activity = await listTaskActivity(id);
  res.json(activity);
});

export default router;
