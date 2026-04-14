import { Router, Request } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { db, adminsTable, auditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
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

const VALID_STATUSES = ["To Do", "In Progress", "Waiting", "Done", "Canceled"] as const;
const VALID_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
type TaskStatus = (typeof VALID_STATUSES)[number];
type TaskPriority = (typeof VALID_PRIORITIES)[number];

function isValidStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (VALID_STATUSES as readonly string[]).includes(v);
}

function isValidPriority(v: unknown): v is TaskPriority {
  return typeof v === "string" && (VALID_PRIORITIES as readonly string[]).includes(v);
}

// ─── Helper: normalize assignee input ─────────────────────────────────────────
// Prefers assigneeIds[] (new format). Falls back to assignedToId (legacy).
// Returns undefined if neither is present (meaning "no change" on update).

function parseAssigneeIds(body: Record<string, unknown>): number[] | undefined {
  if (Array.isArray(body.assigneeIds)) {
    // Strict validation: every entry must be a positive integer
    for (const v of body.assigneeIds as unknown[]) {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isInteger(n) || n <= 0) {
        throw new ValidationError("assigneeIds must be an array of positive integers");
      }
    }
    const ids = (body.assigneeIds as unknown[]).map((v) =>
      typeof v === "number" ? v : Number(v)
    );
    return ids;
  }
  if ("assignedToId" in body) {
    // Legacy single-integer fallback
    const raw = body.assignedToId;
    if (raw === null) return [];
    if (typeof raw === "number" && raw > 0) return [raw];
    return [];
  }
  return undefined; // field not present — don't change assignees
}

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

  const assigneeId = q.assigneeId ? parseInt(q.assigneeId, 10) : undefined;
  const creatorId = q.creatorId ? parseInt(q.creatorId, 10) : undefined;
  const page = q.page ? parseInt(q.page, 10) : 1;
  const limit = q.limit ? parseInt(q.limit, 10) : 50;

  if (assigneeId !== undefined && isNaN(assigneeId)) {
    res.status(400).json({ error: "assigneeId must be a number" }); return;
  }
  if (creatorId !== undefined && isNaN(creatorId)) {
    res.status(400).json({ error: "creatorId must be a number" }); return;
  }
  if (isNaN(page) || isNaN(limit)) {
    res.status(400).json({ error: "page and limit must be numbers" }); return;
  }

  const result = await listAdminTasks({
    search: q.search,
    status: q.status,
    priority: q.priority,
    assigneeId,
    creatorId,
    dueState: q.dueState as "overdue" | "today" | "upcoming" | undefined,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    myId: isFullAccess ? undefined : adminId,
    page,
    limit,
  });

  res.json(result);
});

// ─── POST /api/admin/tasks ────────────────────────────────────────────────────

router.post("/admin/tasks", requireAdmin, async (req, res) => {
  const { isFullAccess, adminId } = await resolveScope(req);

  if (!isFullAccess) {
    throw new ForbiddenError("Only admins and managers can create tasks");
  }

  const body = req.body as Record<string, unknown>;

  if (!body.title || typeof body.title !== "string" || !(body.title as string).trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const priority = body.priority !== undefined ? body.priority : "Medium";
  if (!isValidPriority(priority)) {
    res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` });
    return;
  }

  const status = body.status !== undefined ? body.status : "To Do";
  if (!isValidStatus(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  // Normalize assignees: prefer assigneeIds[], fall back to legacy assignedToId
  const assigneeIds = parseAssigneeIds(body) ?? [];

  const task = await createAdminTask({
    title: (body.title as string).trim(),
    description: typeof body.description === "string" ? body.description : null,
    assigneeIds,
    priority,
    status,
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
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid task id" }); return; }
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
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid task id" }); return; }
  const { isFullAccess, adminId } = await resolveScope(req);

  const body = req.body as Record<string, unknown>;

  if (body.priority !== undefined && !isValidPriority(body.priority)) {
    res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(", ")}` });
    return;
  }

  if (body.status !== undefined && !isValidStatus(body.status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  const input: UpdateTaskInput = {};

  if (isFullAccess) {
    if (body.title !== undefined) input.title = String(body.title).trim();
    if (body.description !== undefined) {
      input.description = typeof body.description === "string" ? body.description : null;
    }
    if (body.priority !== undefined) input.priority = body.priority as TaskPriority;
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

    // Parse assignees — only include in input if present in body
    const assigneeIds = parseAssigneeIds(body);
    if (assigneeIds !== undefined) {
      input.assigneeIds = assigneeIds;
    }
  }

  if (body.status !== undefined) input.status = body.status as TaskStatus;
  if (body.progressPercent !== undefined) {
    const raw = Number(body.progressPercent);
    input.progressPercent = Math.min(100, Math.max(0, isNaN(raw) ? 0 : raw));
  }

  const updated = await updateAdminTask(id, input, adminId, isFullAccess ? undefined : adminId);
  res.json(updated);
});

// ─── DELETE /api/admin/tasks/:id ──────────────────────────────────────────────

router.delete("/admin/tasks/:id", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid task id" }); return; }
  const { isFullAccess, adminId } = await resolveScope(req);

  if (!isFullAccess) {
    throw new ForbiddenError("Only admins and managers can delete tasks");
  }

  const task = await getAdminTask(id);

  await db.insert(auditLogsTable).values({
    actorId: adminId,
    entityType: "task",
    entityId: id,
    entityRef: task.title,
    action: "delete",
    summary: `Task "${task.title}" deleted`,
    beforeData: { title: task.title, status: task.status, assignedToId: task.assignedToId },
    afterData: null,
  });

  await deleteAdminTask(id);
  res.json({ message: "Task deleted" });
});

// ─── GET /api/admin/tasks/:id/comments ────────────────────────────────────────

router.get("/admin/tasks/:id/comments", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid task id" }); return; }
  const { isFullAccess, adminId } = await resolveScope(req);
  await getAdminTask(id, isFullAccess ? undefined : adminId);
  const comments = await listTaskComments(id);
  res.json(comments);
});

// ─── POST /api/admin/tasks/:id/comments ───────────────────────────────────────

router.post("/admin/tasks/:id/comments", requireAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid task id" }); return; }
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
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid task id" }); return; }
  const { isFullAccess, adminId } = await resolveScope(req);
  await getAdminTask(id, isFullAccess ? undefined : adminId);
  const activity = await listTaskActivity(id);
  res.json(activity);
});

export default router;
