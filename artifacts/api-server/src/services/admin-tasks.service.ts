import { db, tasksTable, taskCommentsTable, taskActivityLogTable, adminsTable } from "@workspace/db";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, lte, ne } from "drizzle-orm";
import { NotFoundError, ForbiddenError } from "../lib/errors.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ListTasksFilter {
  search?: string;
  status?: string;
  priority?: string;
  assigneeId?: number;
  creatorId?: number;
  dueState?: "overdue" | "today" | "upcoming";
  dateFrom?: string;
  dateTo?: string;
  myId?: number; // if set, scope to this admin's own tasks only
  page?: number;
  limit?: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  assignedToId?: number | null;
  priority?: string;
  status?: string;
  progressPercent?: number;
  startDate?: string | null;
  dueDate?: string | null;
  relatedType?: string | null;
  relatedId?: number | null;
  createdById: number;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assignedToId?: number | null;
  priority?: string;
  status?: string;
  progressPercent?: number;
  startDate?: string | null;
  dueDate?: string | null;
  relatedType?: string | null;
  relatedId?: number | null;
}

// ─── Shared assignee join helper ───────────────────────────────────────────────

const assigneeAdmin = db.$with("assignee_admin").as(
  db.select({ id: adminsTable.id, fullName: adminsTable.fullName, email: adminsTable.email })
    .from(adminsTable)
);

// ─── Activity log helper ───────────────────────────────────────────────────────

export async function logTaskActivity(
  taskId: number,
  actorId: number,
  action: string,
  fromValue?: string | null,
  toValue?: string | null,
) {
  await db.insert(taskActivityLogTable).values({
    taskId,
    actorId,
    action,
    fromValue: fromValue ?? null,
    toValue: toValue ?? null,
  });
}

// ─── List tasks ────────────────────────────────────────────────────────────────

export async function listAdminTasks(filter: ListTasksFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];

  // Scope staff to own tasks
  if (filter.myId !== undefined) {
    conditions.push(eq(tasksTable.assignedToId, filter.myId) as any);
  }

  if (filter.search) {
    conditions.push(ilike(tasksTable.title, `%${filter.search}%`) as any);
  }
  if (filter.status) {
    conditions.push(eq(tasksTable.status, filter.status) as any);
  }
  if (filter.priority) {
    conditions.push(eq(tasksTable.priority, filter.priority) as any);
  }
  if (filter.assigneeId) {
    conditions.push(eq(tasksTable.assignedToId, filter.assigneeId) as any);
  }
  if (filter.creatorId) {
    conditions.push(eq(tasksTable.createdById, filter.creatorId) as any);
  }
  if (filter.dateFrom) {
    conditions.push(gte(tasksTable.createdAt, new Date(filter.dateFrom)) as any);
  }
  if (filter.dateTo) {
    conditions.push(lte(tasksTable.createdAt, new Date(filter.dateTo + "T23:59:59Z")) as any);
  }
  if (filter.dueState === "overdue") {
    conditions.push(lt(tasksTable.dueDate, new Date()) as any);
    conditions.push(ne(tasksTable.status, "Done") as any);
    conditions.push(ne(tasksTable.status, "Canceled") as any);
  } else if (filter.dueState === "today") {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    conditions.push(gte(tasksTable.dueDate, todayStart) as any);
    conditions.push(lte(tasksTable.dueDate, todayEnd) as any);
  } else if (filter.dueState === "upcoming") {
    conditions.push(gte(tasksTable.dueDate, new Date()) as any);
  }

  const where = conditions.length > 0 ? and(...conditions as any) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        description: tasksTable.description,
        status: tasksTable.status,
        priority: tasksTable.priority,
        progressPercent: tasksTable.progressPercent,
        startDate: tasksTable.startDate,
        dueDate: tasksTable.dueDate,
        completedAt: tasksTable.completedAt,
        relatedType: tasksTable.relatedType,
        relatedId: tasksTable.relatedId,
        createdById: tasksTable.createdById,
        assignedToId: tasksTable.assignedToId,
        createdAt: tasksTable.createdAt,
        updatedAt: tasksTable.updatedAt,
        assigneeName: adminsTable.fullName,
      })
      .from(tasksTable)
      .leftJoin(adminsTable, eq(tasksTable.assignedToId, adminsTable.id))
      .where(where)
      .orderBy(desc(tasksTable.updatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(tasksTable).where(where),
  ]);

  return {
    tasks: rows,
    total: totalRows[0]?.n ?? 0,
    page,
    limit,
  };
}

// ─── Get task by id ────────────────────────────────────────────────────────────

export async function getAdminTask(id: number, scopeToAdminId?: number) {
  const rows = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      priority: tasksTable.priority,
      progressPercent: tasksTable.progressPercent,
      startDate: tasksTable.startDate,
      dueDate: tasksTable.dueDate,
      completedAt: tasksTable.completedAt,
      relatedType: tasksTable.relatedType,
      relatedId: tasksTable.relatedId,
      createdById: tasksTable.createdById,
      assignedToId: tasksTable.assignedToId,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);

  if (!rows[0]) throw new NotFoundError(`Task ${id} not found`);

  const task = rows[0];

  // Staff scope: only allow access to assigned tasks
  if (scopeToAdminId !== undefined && task.assignedToId !== scopeToAdminId) {
    throw new ForbiddenError("Access denied to this task");
  }

  // Load creator and assignee names
  const adminIds = [...new Set([task.createdById, task.assignedToId].filter(Boolean) as number[])];
  const adminRows = adminIds.length > 0
    ? await db.select({ id: adminsTable.id, fullName: adminsTable.fullName })
        .from(adminsTable)
        .where(inArray(adminsTable.id, adminIds))
    : [];
  const adminMap = Object.fromEntries(adminRows.map((a) => [a.id, a.fullName]));

  return {
    ...task,
    creatorName: adminMap[task.createdById] ?? null,
    assigneeName: task.assignedToId ? (adminMap[task.assignedToId] ?? null) : null,
  };
}

// ─── Create task ───────────────────────────────────────────────────────────────

export async function createAdminTask(input: CreateTaskInput) {
  const status = input.status ?? "To Do";
  const progressPercent = status === "Done" ? 100 : (input.progressPercent ?? 0);
  const completedAt = status === "Done" ? new Date() : null;

  const rows = await db
    .insert(tasksTable)
    .values({
      title: input.title,
      description: input.description ?? null,
      assignedToId: input.assignedToId ?? null,
      priority: input.priority ?? "Medium",
      status,
      progressPercent,
      startDate: input.startDate ? new Date(input.startDate) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
      completedAt,
      createdById: input.createdById,
    })
    .returning();

  const task = rows[0]!;

  await logTaskActivity(task.id, input.createdById, "created", null, input.title);

  if (input.assignedToId) {
    await logTaskActivity(task.id, input.createdById, "assigned", null, String(input.assignedToId));
  }

  return task;
}

// ─── Update task ───────────────────────────────────────────────────────────────

export async function updateAdminTask(id: number, input: UpdateTaskInput, actorId: number, scopeToAdminId?: number) {
  const existing = await getAdminTask(id, scopeToAdminId);

  const updates: Record<string, any> = { updatedAt: new Date() };
  const activities: Array<{ action: string; from: string | null; to: string | null }> = [];

  if (input.title !== undefined && input.title !== existing.title) {
    updates.title = input.title;
    activities.push({ action: "title_changed", from: existing.title, to: input.title });
  }
  if (input.description !== undefined) {
    updates.description = input.description;
  }
  if (input.priority !== undefined && input.priority !== existing.priority) {
    activities.push({ action: "priority_changed", from: existing.priority, to: input.priority });
    updates.priority = input.priority;
  }
  if (input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId) {
    activities.push({ action: "assigned", from: String(existing.assignedToId ?? ""), to: String(input.assignedToId ?? "") });
    updates.assignedToId = input.assignedToId ?? null;
  }

  let newStatus = existing.status;
  if (input.status !== undefined && input.status !== existing.status) {
    activities.push({ action: "status_changed", from: existing.status, to: input.status });
    updates.status = input.status;
    newStatus = input.status;
  }

  // progressPercent logic: Done → force 100
  let newProgress = existing.progressPercent;
  if (newStatus === "Done") {
    newProgress = 100;
    updates.progressPercent = 100;
    if (!existing.completedAt) {
      updates.completedAt = new Date();
      activities.push({ action: "completed", from: null, to: new Date().toISOString() });
    }
  } else if (input.progressPercent !== undefined && input.progressPercent !== existing.progressPercent) {
    newProgress = input.progressPercent;
    activities.push({ action: "progress_changed", from: String(existing.progressPercent), to: String(input.progressPercent) });
    updates.progressPercent = input.progressPercent;
    // Clear completedAt if un-completing
    if (existing.completedAt && newStatus !== "Done") {
      updates.completedAt = null;
    }
  }

  if (input.startDate !== undefined) {
    updates.startDate = input.startDate ? new Date(input.startDate) : null;
  }
  if (input.dueDate !== undefined) {
    updates.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }
  if (input.relatedType !== undefined) {
    updates.relatedType = input.relatedType ?? null;
  }
  if (input.relatedId !== undefined) {
    updates.relatedId = input.relatedId ?? null;
  }

  if (Object.keys(updates).length > 1) {
    await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id));
  }

  for (const act of activities) {
    await logTaskActivity(id, actorId, act.action, act.from, act.to);
  }

  return getAdminTask(id);
}

// ─── Delete task ───────────────────────────────────────────────────────────────

export async function deleteAdminTask(id: number) {
  const rows = await db.select({ id: tasksTable.id }).from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
  if (!rows[0]) throw new NotFoundError(`Task ${id} not found`);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
}

// ─── Comments ──────────────────────────────────────────────────────────────────

export async function listTaskComments(taskId: number) {
  const rows = await db
    .select({
      id: taskCommentsTable.id,
      taskId: taskCommentsTable.taskId,
      authorId: taskCommentsTable.authorId,
      body: taskCommentsTable.body,
      createdAt: taskCommentsTable.createdAt,
      updatedAt: taskCommentsTable.updatedAt,
      authorName: adminsTable.fullName,
    })
    .from(taskCommentsTable)
    .leftJoin(adminsTable, eq(taskCommentsTable.authorId, adminsTable.id))
    .where(eq(taskCommentsTable.taskId, taskId))
    .orderBy(asc(taskCommentsTable.createdAt));
  return rows;
}

export async function createTaskComment(taskId: number, authorId: number, body: string) {
  const taskRows = await db.select({ id: tasksTable.id }).from(tasksTable).where(eq(tasksTable.id, taskId)).limit(1);
  if (!taskRows[0]) throw new NotFoundError(`Task ${taskId} not found`);

  await db.insert(taskCommentsTable).values({ taskId, authorId, body });

  await logTaskActivity(taskId, authorId, "comment_added", null, body.substring(0, 100));

  const inserted = await db
    .select({
      id: taskCommentsTable.id,
      taskId: taskCommentsTable.taskId,
      authorId: taskCommentsTable.authorId,
      body: taskCommentsTable.body,
      createdAt: taskCommentsTable.createdAt,
      updatedAt: taskCommentsTable.updatedAt,
      authorName: adminsTable.fullName,
    })
    .from(taskCommentsTable)
    .leftJoin(adminsTable, eq(taskCommentsTable.authorId, adminsTable.id))
    .where(eq(taskCommentsTable.taskId, taskId))
    .orderBy(desc(taskCommentsTable.id))
    .limit(1);
  return inserted[0]!;
}

// ─── Activity log ──────────────────────────────────────────────────────────────

export async function listTaskActivity(taskId: number) {
  const rows = await db
    .select({
      id: taskActivityLogTable.id,
      taskId: taskActivityLogTable.taskId,
      actorId: taskActivityLogTable.actorId,
      action: taskActivityLogTable.action,
      fromValue: taskActivityLogTable.fromValue,
      toValue: taskActivityLogTable.toValue,
      createdAt: taskActivityLogTable.createdAt,
      actorName: adminsTable.fullName,
    })
    .from(taskActivityLogTable)
    .leftJoin(adminsTable, eq(taskActivityLogTable.actorId, adminsTable.id))
    .where(eq(taskActivityLogTable.taskId, taskId))
    .orderBy(asc(taskActivityLogTable.createdAt));
  return rows;
}

// ─── My Tasks summary (for Dashboard widget) ───────────────────────────────────

export async function getMyTasksSummary(adminId: number) {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  const [totalRows, overdueRows, dueTodayRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.assignedToId, adminId),
          ne(tasksTable.status, "Done"),
          ne(tasksTable.status, "Canceled"),
        )
      ),
    db
      .select({ n: count() })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.assignedToId, adminId),
          lt(tasksTable.dueDate, now),
          ne(tasksTable.status, "Done"),
          ne(tasksTable.status, "Canceled"),
        )
      ),
    db
      .select({ n: count() })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.assignedToId, adminId),
          gte(tasksTable.dueDate, todayStart),
          lte(tasksTable.dueDate, todayEnd),
          ne(tasksTable.status, "Done"),
          ne(tasksTable.status, "Canceled"),
        )
      ),
  ]);

  return {
    total: Number(totalRows[0]?.n ?? 0),
    overdue: Number(overdueRows[0]?.n ?? 0),
    dueToday: Number(dueTodayRows[0]?.n ?? 0),
  };
}

// ─── Get all admins (for assignee picker) ──────────────────────────────────────

export async function listAdminsForTasks() {
  return db
    .select({ id: adminsTable.id, fullName: adminsTable.fullName, email: adminsTable.email })
    .from(adminsTable)
    .where(eq(adminsTable.isActive, true))
    .orderBy(asc(adminsTable.fullName));
}
