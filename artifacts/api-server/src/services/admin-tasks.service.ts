import { db, tasksTable, taskAssigneesTable, taskCommentsTable, taskActivityLogTable, adminsTable } from "@workspace/db";
import { SQL, and, asc, count, desc, eq, gte, ilike, inArray, lt, lte, ne, sql } from "drizzle-orm";
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
  myId?: number; // if set, scope to this admin's own tasks only (dual-check)
  page?: number;
  limit?: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  assigneeIds?: number[];       // preferred multi-assignee format
  assignedToId?: number | null; // legacy single-assignee compat (fallback)
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
  assigneeIds?: number[];       // preferred multi-assignee format
  assignedToId?: number | null; // legacy single-assignee compat (fallback)
  priority?: string;
  status?: string;
  progressPercent?: number;
  startDate?: string | null;
  dueDate?: string | null;
  relatedType?: string | null;
  relatedId?: number | null;
}

// ─── Dual-check scoping helper ────────────────────────────────────────────────
// Returns a SQL condition that matches a task if:
//   (a) the admin appears in task_assignees for this task, OR
//   (b) task_assignees has no rows for this task AND tasks.assigned_to_id = adminId
// This ensures legacy tasks (assignedToId only) remain visible without a backfill.

function dualCheckAssigneeCondition(adminId: number): SQL {
  return sql`(
    EXISTS(SELECT 1 FROM task_assignees ta WHERE ta.task_id = ${tasksTable.id} AND ta.admin_id = ${adminId})
    OR (
      NOT EXISTS(SELECT 1 FROM task_assignees ta WHERE ta.task_id = ${tasksTable.id})
      AND ${tasksTable.assignedToId} = ${adminId}
    )
  )`;
}

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

// ─── Resolve effective assignee ids from input ────────────────────────────────

function resolveAssigneeIds(input: { assigneeIds?: number[]; assignedToId?: number | null }): number[] {
  if (input.assigneeIds !== undefined) {
    return input.assigneeIds.filter((id) => Number.isFinite(id) && id > 0);
  }
  if (input.assignedToId != null) {
    return [input.assignedToId];
  }
  return [];
}

// ─── List tasks ────────────────────────────────────────────────────────────────

export async function listAdminTasks(filter: ListTasksFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];

  // Scope non-fullAccess staff to own tasks — dual-check
  if (filter.myId !== undefined) {
    conditions.push(dualCheckAssigneeCondition(filter.myId));
  }

  if (filter.search) {
    conditions.push(ilike(tasksTable.title, `%${filter.search}%`));
  }
  if (filter.status) {
    conditions.push(eq(tasksTable.status, filter.status));
  }
  if (filter.priority) {
    conditions.push(eq(tasksTable.priority, filter.priority));
  }
  if (filter.assigneeId) {
    // Filter by specific assignee — also dual-check so legacy tasks appear
    conditions.push(dualCheckAssigneeCondition(filter.assigneeId));
  }
  if (filter.creatorId) {
    conditions.push(eq(tasksTable.createdById, filter.creatorId));
  }
  if (filter.dateFrom) {
    conditions.push(gte(tasksTable.createdAt, new Date(filter.dateFrom)));
  }
  if (filter.dateTo) {
    conditions.push(lte(tasksTable.createdAt, new Date(filter.dateTo + "T23:59:59Z")));
  }
  if (filter.dueState === "overdue") {
    conditions.push(lt(tasksTable.dueDate, new Date()));
    conditions.push(ne(tasksTable.status, "Done"));
    conditions.push(ne(tasksTable.status, "Canceled"));
  } else if (filter.dueState === "today") {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    conditions.push(gte(tasksTable.dueDate, todayStart));
    conditions.push(lte(tasksTable.dueDate, todayEnd));
  } else if (filter.dueState === "upcoming") {
    conditions.push(gte(tasksTable.dueDate, new Date()));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

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
        assigneeName: adminsTable.fullName, // kept for backward compat
      })
      .from(tasksTable)
      .leftJoin(adminsTable, eq(tasksTable.assignedToId, adminsTable.id))
      .where(where)
      .orderBy(desc(tasksTable.updatedAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(tasksTable).where(where),
  ]);

  // Batch-load multi-assignees from task_assignees for returned task IDs
  const taskIds = rows.map((r) => r.id);
  const assigneeRows = taskIds.length > 0
    ? await db
        .select({
          taskId: taskAssigneesTable.taskId,
          id: adminsTable.id,
          fullName: adminsTable.fullName,
        })
        .from(taskAssigneesTable)
        .innerJoin(adminsTable, eq(taskAssigneesTable.adminId, adminsTable.id))
        .where(inArray(taskAssigneesTable.taskId, taskIds))
    : [];

  // Build map taskId -> assignee list
  const assigneeMap = new Map<number, { id: number; fullName: string }[]>();
  for (const ar of assigneeRows) {
    if (!assigneeMap.has(ar.taskId)) assigneeMap.set(ar.taskId, []);
    assigneeMap.get(ar.taskId)!.push({ id: ar.id, fullName: ar.fullName });
  }

  // Merge: for tasks with no junction rows, fall back to assignedToId/assigneeName
  const tasksWithAssignees = rows.map((row) => {
    const junctionAssignees = assigneeMap.get(row.id);
    if (junctionAssignees && junctionAssignees.length > 0) {
      return { ...row, assignees: junctionAssignees };
    }
    // Legacy fallback: build assignees from single assignedToId
    const assignees = row.assignedToId && row.assigneeName
      ? [{ id: row.assignedToId, fullName: row.assigneeName }]
      : [];
    return { ...row, assignees };
  });

  return {
    tasks: tasksWithAssignees,
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

  // Load assignees from junction table
  const junctionRows = await db
    .select({ id: adminsTable.id, fullName: adminsTable.fullName })
    .from(taskAssigneesTable)
    .innerJoin(adminsTable, eq(taskAssigneesTable.adminId, adminsTable.id))
    .where(eq(taskAssigneesTable.taskId, id));

  // Determine effective assignees (junction if populated, else legacy fallback)
  let assignees: { id: number; fullName: string }[] = [];
  if (junctionRows.length > 0) {
    assignees = junctionRows;
  } else if (task.assignedToId != null) {
    // Legacy: load name for the single assignedToId
    const legacyRows = await db
      .select({ id: adminsTable.id, fullName: adminsTable.fullName })
      .from(adminsTable)
      .where(eq(adminsTable.id, task.assignedToId))
      .limit(1);
    if (legacyRows[0]) assignees = [legacyRows[0]];
  }

  // Staff scope: dual-check — must appear in junction OR be the legacy assignedToId
  if (scopeToAdminId !== undefined) {
    const inJunction = junctionRows.some((r) => r.id === scopeToAdminId);
    const inLegacy = junctionRows.length === 0 && task.assignedToId === scopeToAdminId;
    if (!inJunction && !inLegacy) {
      throw new ForbiddenError("Access denied to this task");
    }
  }

  // Load creator name
  const creatorRow = await db
    .select({ fullName: adminsTable.fullName })
    .from(adminsTable)
    .where(eq(adminsTable.id, task.createdById))
    .limit(1);

  return {
    ...task,
    creatorName: creatorRow[0]?.fullName ?? null,
    assigneeName: assignees[0]?.fullName ?? null, // backward compat
    assignees,
  };
}

// ─── Create task ───────────────────────────────────────────────────────────────

export async function createAdminTask(input: CreateTaskInput) {
  const status = input.status ?? "To Do";
  const progressPercent = status === "Done" ? 100 : (input.progressPercent ?? 0);
  const completedAt = status === "Done" ? new Date() : null;

  const assigneeIds = resolveAssigneeIds(input);
  const primaryAssigneeId = assigneeIds[0] ?? null;

  const rows = await db
    .insert(tasksTable)
    .values({
      title: input.title,
      description: input.description ?? null,
      assignedToId: primaryAssigneeId, // synced to first assignee
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

  // Write all assignees to junction table
  if (assigneeIds.length > 0) {
    await db.insert(taskAssigneesTable).values(
      assigneeIds.map((adminId) => ({ taskId: task.id, adminId }))
    );
  }

  await logTaskActivity(task.id, input.createdById, "created", null, input.title);

  if (assigneeIds.length > 0) {
    await logTaskActivity(task.id, input.createdById, "assigned", null, assigneeIds.join(", "));
  }

  return task;
}

// ─── Update task ───────────────────────────────────────────────────────────────

type TaskUpdateFields = {
  updatedAt?: Date;
  title?: string;
  description?: string | null;
  priority?: string;
  assignedToId?: number | null;
  status?: string;
  progressPercent?: number;
  completedAt?: Date | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  relatedType?: string | null;
  relatedId?: number | null;
};

export async function updateAdminTask(id: number, input: UpdateTaskInput, actorId: number, scopeToAdminId?: number) {
  const existing = await getAdminTask(id, scopeToAdminId);

  const updates: TaskUpdateFields = { updatedAt: new Date() };
  const activities: Array<{ action: string; from: string | null; to: string | null }> = [];

  if (input.title !== undefined && input.title !== existing.title) {
    updates.title = input.title;
    activities.push({ action: "title_changed", from: existing.title, to: input.title });
  }
  if (input.description !== undefined && input.description !== existing.description) {
    updates.description = input.description;
    activities.push({ action: "description_changed", from: null, to: null });
  }
  if (input.priority !== undefined && input.priority !== existing.priority) {
    activities.push({ action: "priority_changed", from: existing.priority, to: input.priority });
    updates.priority = input.priority;
  }

  // Handle assignee update — only when assigneeIds or assignedToId is explicitly provided
  const hasAssigneeChange = input.assigneeIds !== undefined || input.assignedToId !== undefined;
  if (hasAssigneeChange) {
    const newAssigneeIds = resolveAssigneeIds(input);
    const existingAssigneeIds = existing.assignees.map((a) => a.id).sort();
    const newSorted = [...newAssigneeIds].sort();
    const changed = JSON.stringify(existingAssigneeIds) !== JSON.stringify(newSorted);

    if (changed) {
      const primaryAssigneeId = newAssigneeIds[0] ?? null;
      updates.assignedToId = primaryAssigneeId;

      // Sync junction table: delete old, insert new
      await db.delete(taskAssigneesTable).where(eq(taskAssigneesTable.taskId, id));
      if (newAssigneeIds.length > 0) {
        await db.insert(taskAssigneesTable).values(
          newAssigneeIds.map((adminId) => ({ taskId: id, adminId }))
        );
      }

      const oldStr = existingAssigneeIds.join(", ") || "";
      const newStr = newAssigneeIds.join(", ") || "";
      activities.push({ action: "assigned", from: oldStr, to: newStr });
    }
  }

  let newStatus = existing.status;
  if (input.status !== undefined && input.status !== existing.status) {
    activities.push({ action: "status_changed", from: existing.status, to: input.status });
    updates.status = input.status;
    newStatus = input.status;
  }

  // completedAt: set when transitioning TO Done, clear when transitioning AWAY from Done
  if (newStatus === "Done") {
    updates.progressPercent = 100;
    if (!existing.completedAt) {
      updates.completedAt = new Date();
      activities.push({ action: "completed", from: null, to: updates.completedAt.toISOString() });
    }
  } else {
    if (existing.status === "Done" && existing.completedAt) {
      updates.completedAt = null;
    }
    if (input.progressPercent !== undefined && input.progressPercent !== existing.progressPercent) {
      activities.push({ action: "progress_changed", from: String(existing.progressPercent), to: String(input.progressPercent) });
      updates.progressPercent = input.progressPercent;
    }
  }

  if (input.startDate !== undefined) {
    const newVal = input.startDate ?? null;
    const rawStart = existing.startDate;
    const oldVal = rawStart
      ? (rawStart instanceof Date ? rawStart : new Date(rawStart)).toISOString().slice(0, 10)
      : null;
    if (newVal !== oldVal) {
      updates.startDate = newVal ? new Date(newVal) : null;
      activities.push({ action: "start_date_changed", from: oldVal, to: newVal });
    }
  }
  if (input.dueDate !== undefined) {
    const newVal = input.dueDate ?? null;
    const rawDue = existing.dueDate;
    const oldVal = rawDue
      ? (rawDue instanceof Date ? rawDue : new Date(rawDue)).toISOString().slice(0, 10)
      : null;
    if (newVal !== oldVal) {
      updates.dueDate = newVal ? new Date(newVal) : null;
      activities.push({ action: "due_date_changed", from: oldVal, to: newVal });
    }
  }
  if (input.relatedType !== undefined && input.relatedType !== existing.relatedType) {
    updates.relatedType = input.relatedType ?? null;
    activities.push({ action: "related_changed", from: existing.relatedType, to: input.relatedType ?? null });
  }
  if (input.relatedId !== undefined && input.relatedId !== existing.relatedId) {
    updates.relatedId = input.relatedId ?? null;
    activities.push({ action: "related_changed", from: String(existing.relatedId ?? ""), to: String(input.relatedId ?? "") });
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
  // task_assignees rows cascade-delete via FK
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

  // Dual-check: include tasks where this admin is in task_assignees OR (no junction rows AND assignedToId = me)
  const assigneeScope = dualCheckAssigneeCondition(adminId);

  const [totalRows, overdueRows, dueTodayRows] = await Promise.all([
    db
      .select({ n: count() })
      .from(tasksTable)
      .where(and(assigneeScope, ne(tasksTable.status, "Done"), ne(tasksTable.status, "Canceled"))),
    db
      .select({ n: count() })
      .from(tasksTable)
      .where(and(assigneeScope, lt(tasksTable.dueDate, now), ne(tasksTable.status, "Done"), ne(tasksTable.status, "Canceled"))),
    db
      .select({ n: count() })
      .from(tasksTable)
      .where(and(assigneeScope, gte(tasksTable.dueDate, todayStart), lte(tasksTable.dueDate, todayEnd), ne(tasksTable.status, "Done"), ne(tasksTable.status, "Canceled"))),
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
    .select({ id: adminsTable.id, fullName: adminsTable.fullName })
    .from(adminsTable)
    .where(eq(adminsTable.isActive, true))
    .orderBy(asc(adminsTable.fullName));
}
