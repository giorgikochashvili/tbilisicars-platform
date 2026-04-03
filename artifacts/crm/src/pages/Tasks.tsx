import React, { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { format, isPast, isToday } from "date-fns";
import {
  ClipboardList, Plus, RefreshCw, ChevronUp, ChevronDown,
  CheckCircle2, Clock, AlertTriangle, Flame, XCircle, Calendar,
  User, MessageSquare, Activity, Send, Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TaskListItem {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  progressPercent: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  relatedType: string | null;
  relatedId: number | null;
  createdById: number;
  assignedToId: number | null;
  assigneeName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskComment {
  id: number;
  taskId: number;
  authorId: number;
  authorName: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskActivity {
  id: number;
  taskId: number;
  actorId: number;
  actorName: string | null;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
}

interface TaskDetail extends TaskListItem {
  creatorName: string | null;
  comments: TaskComment[];
  activity: TaskActivity[];
}

interface AdminOption {
  id: number;
  fullName: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ["To Do", "In Progress", "Waiting", "Done", "Canceled"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const RELATED_TYPES = ["Booking", "Vehicle", "Customer", "Service", "Parking"];

const STATUS_COLORS: Record<string, string> = {
  "To Do":       "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "In Progress": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Waiting":     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Done":        "bg-green-500/15 text-green-400 border-green-500/30",
  "Canceled":    "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  "Low":    "bg-slate-500/10 text-slate-400 border-slate-500/20",
  "Medium": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "High":   "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Urgent": "bg-red-500/20 text-red-400 border-red-500/40 font-bold",
};

const ACTION_LABELS: Record<string, string> = {
  created: "created this task",
  assigned: "assigned this task",
  status_changed: "changed status",
  progress_changed: "updated progress",
  priority_changed: "changed priority",
  title_changed: "renamed task",
  completed: "marked as Done",
  comment_added: "added a comment",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return "—";
  try { return format(new Date(d), "dd MMM yyyy"); } catch { return "—"; }
}

function isOverdue(task: TaskListItem): boolean {
  if (!task.dueDate) return false;
  if (task.status === "Done" || task.status === "Canceled") return false;
  return isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate));
}

function isDueToday(task: TaskListItem): boolean {
  if (!task.dueDate) return false;
  if (task.status === "Done" || task.status === "Canceled") return false;
  return isToday(new Date(task.dueDate));
}

const BASE = "/api";
const CREDS: RequestInit = { credentials: "include" };

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...CREDS, ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Task Progress Bar ─────────────────────────────────────────────────────────

function getProgressColor(pct: number): { fill: string; glow: string } {
  if (pct === 0)   return { fill: "bg-white/10",       glow: "" };
  if (pct < 40)    return { fill: "bg-amber-500/80",   glow: "shadow-[0_0_6px_0px_rgba(245,158,11,0.35)]" };
  if (pct < 80)    return { fill: "bg-blue-500/85",    glow: "shadow-[0_0_6px_0px_rgba(59,130,246,0.4)]" };
  if (pct < 100)   return { fill: "bg-emerald-500/85", glow: "shadow-[0_0_6px_0px_rgba(16,185,129,0.4)]" };
  return              { fill: "bg-green-500",           glow: "shadow-[0_0_8px_0px_rgba(34,197,94,0.45)]" };
}

function TaskProgressBar({ value, compact = false }: { value: number; compact?: boolean }) {
  const pct = Math.min(100, Math.max(0, value));
  const { fill, glow } = getProgressColor(pct);
  return (
    <div className={cn("flex items-center gap-2", compact ? "w-full" : "")}>
      <div className={cn("relative rounded-full overflow-hidden bg-white/[0.06] border border-white/[0.07]", compact ? "h-1.5 flex-1" : "h-2 flex-1")}>
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-500", fill, glow)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn("font-medium tabular-nums text-right shrink-0", compact ? "text-[10px] text-muted-foreground w-7" : "text-[11px] text-primary/90 w-8")}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  title, value, icon: Icon, colorClass, onClick, isLoading,
}: {
  title: string;
  value?: number;
  icon: React.ElementType;
  colorClass: string;
  onClick?: () => void;
  isLoading?: boolean;
}) {
  return (
    <Card
      className={cn(
        "border border-border/40 bg-card/60 transition-all duration-200",
        onClick && "cursor-pointer hover:border-primary/40 hover:bg-card/80",
      )}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold mb-1">{title}</p>
            {isLoading ? (
              <Skeleton className="h-7 w-10" />
            ) : (
              <p className="text-2xl font-black font-display">{value ?? "—"}</p>
            )}
          </div>
          <div className={cn("p-2 rounded-xl", colorClass)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Task Form Modal ────────────────────────────────────────────────────────────

interface TaskFormProps {
  open: boolean;
  onClose: () => void;
  editTask?: TaskDetail | null;
  admins: AdminOption[];
  onSaved: () => void;
}

function TaskFormModal({ open, onClose, editTask, admins, onSaved }: TaskFormProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: editTask?.title ?? "",
    description: editTask?.description ?? "",
    assignedToId: editTask?.assignedToId ? String(editTask.assignedToId) : "",
    priority: editTask?.priority ?? "Medium",
    status: editTask?.status ?? "To Do",
    progressPercent: editTask?.progressPercent ?? 0,
    startDate: editTask?.startDate ? editTask.startDate.slice(0, 10) : "",
    dueDate: editTask?.dueDate ? editTask.dueDate.slice(0, 10) : "",
    relatedType: editTask?.relatedType ?? "",
    relatedId: editTask?.relatedId ? String(editTask.relatedId) : "",
  });

  React.useEffect(() => {
    if (open) {
      setForm({
        title: editTask?.title ?? "",
        description: editTask?.description ?? "",
        assignedToId: editTask?.assignedToId ? String(editTask.assignedToId) : "",
        priority: editTask?.priority ?? "Medium",
        status: editTask?.status ?? "To Do",
        progressPercent: editTask?.progressPercent ?? 0,
        startDate: editTask?.startDate ? editTask.startDate.slice(0, 10) : "",
        dueDate: editTask?.dueDate ? editTask.dueDate.slice(0, 10) : "",
        relatedType: editTask?.relatedType ?? "",
        relatedId: editTask?.relatedId ? String(editTask.relatedId) : "",
      });
    }
  }, [open, editTask]);

  const isEdit = !!editTask;
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description || null,
        assignedToId: form.assignedToId ? parseInt(form.assignedToId, 10) : null,
        priority: form.priority,
        status: form.status,
        progressPercent: Math.min(100, Math.max(0, Number(form.progressPercent))),
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        relatedType: form.relatedType || null,
        relatedId: form.relatedId ? parseInt(form.relatedId, 10) : null,
      };

      if (isEdit) {
        await apiFetch(`${BASE}/admin/tasks/${editTask!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast({ title: "Task updated" });
      } else {
        await apiFetch(`${BASE}/admin/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        toast({ title: "Task created" });
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Task title…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional description…"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={form.assignedToId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, assignedToId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {admins.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v, progressPercent: v === "Done" ? 100 : f.progressPercent }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Progress %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.progressPercent}
                onChange={(e) => setForm((f) => ({ ...f, progressPercent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Related Type</Label>
              <Select value={form.relatedType || "none"} onValueChange={(v) => setForm((f) => ({ ...f, relatedType: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {RELATED_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Related ID</Label>
              <Input
                type="number"
                value={form.relatedId}
                onChange={(e) => setForm((f) => ({ ...f, relatedId: e.target.value }))}
                placeholder="e.g. 123"
                disabled={!form.relatedType}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Task Detail Drawer ────────────────────────────────────────────────────────

function TaskDetailDrawer({
  taskId,
  onClose,
  onChanged,
  admins,
  isFullAccess,
}: {
  taskId: number | null;
  onClose: () => void;
  onChanged: () => void;
  admins: AdminOption[];
  isFullAccess: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [commentText, setCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: task, isLoading, refetch } = useQuery<TaskDetail>({
    queryKey: ["task-detail", taskId],
    queryFn: () => apiFetch<TaskDetail>(`${BASE}/admin/tasks/${taskId}`),
    enabled: !!taskId,
  });

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;
    try {
      await apiFetch(`${BASE}/admin/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      refetch();
      onChanged();
      toast({ title: "Status updated" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleProgressChange = async (val: number) => {
    if (!task) return;
    try {
      await apiFetch(`${BASE}/admin/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressPercent: val }),
      });
      refetch();
      onChanged();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !task) return;
    setSendingComment(true);
    try {
      await apiFetch(`${BASE}/admin/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentText.trim() }),
      });
      setCommentText("");
      refetch();
      toast({ title: "Comment added" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSendingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !confirm("Delete this task?")) return;
    try {
      await apiFetch(`${BASE}/admin/tasks/${task.id}`, { method: "DELETE" });
      toast({ title: "Task deleted" });
      onChanged();
      onClose();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  };

  const taskOverdue = task ? isOverdue(task) : false;
  const taskDueToday = task ? isDueToday(task) : false;

  return (
    <>
      <Sheet open={!!taskId} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/40">
            <div className="flex items-start justify-between gap-3">
              <SheetTitle className="font-display text-base leading-tight flex-1">
                {isLoading ? <Skeleton className="h-5 w-48" /> : task?.title}
              </SheetTitle>
              {isFullAccess && task && (
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditOpen(true)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={handleDelete}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : task ? (
              <>
                {/* Meta */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Status</p>
                    <Select value={task.status} onValueChange={handleStatusChange}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Priority</p>
                    <Badge variant="outline" className={cn("text-xs px-2 py-0.5", PRIORITY_COLORS[task.priority])}>
                      {task.priority}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Assignee</p>
                    <p className="text-sm">{task.assigneeName ?? "Unassigned"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Created by</p>
                    <p className="text-sm">{task.creatorName ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Start Date</p>
                    <p className="text-sm">{formatDate(task.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Due Date</p>
                    <p className={cn("text-sm", taskOverdue && "text-red-400 font-semibold", taskDueToday && "text-amber-400 font-semibold")}>
                      {formatDate(task.dueDate)}
                      {taskOverdue && " (Overdue)"}
                      {taskDueToday && " (Today)"}
                    </p>
                  </div>
                  {task.completedAt && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Completed</p>
                      <p className="text-sm">{formatDate(task.completedAt)}</p>
                    </div>
                  )}
                  {task.relatedType && task.relatedId && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Related</p>
                      <p className="text-sm">{task.relatedType} #{task.relatedId}</p>
                    </div>
                  )}
                </div>

                {/* Progress */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Progress</p>
                  <div className="mb-3">
                    <TaskProgressBar value={task.progressPercent} />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {[0, 25, 50, 75, 100].map((v) => (
                      <Button
                        key={v}
                        size="sm"
                        variant={task.progressPercent === v ? "default" : "outline"}
                        className="h-6 px-2 text-[10px]"
                        onClick={() => handleProgressChange(v)}
                      >
                        {v}%
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                {task.description && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Description</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
                  </div>
                )}

                {/* Comments */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    Comments ({task.comments.length})
                  </p>
                  <div className="space-y-3 mb-4">
                    {task.comments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No comments yet.</p>
                    ) : (
                      task.comments.map((c) => (
                        <div key={c.id} className="bg-muted/40 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold">{c.authorName ?? "Unknown"}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDate(c.createdAt)}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write a comment…"
                      rows={2}
                      className="text-sm flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) handleSendComment(); }}
                    />
                    <Button
                      size="sm"
                      className="h-auto self-end"
                      onClick={handleSendComment}
                      disabled={sendingComment || !commentText.trim()}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Ctrl+Enter to send</p>
                </div>

                {/* Activity */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    Activity Log
                  </p>
                  <div className="space-y-2">
                    {task.activity.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No activity yet.</p>
                    ) : (
                      task.activity.map((a) => (
                        <div key={a.id} className="flex items-start gap-2 text-xs">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Activity className="w-2.5 h-2.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{a.actorName ?? "Someone"}</span>
                            {" "}
                            <span className="text-muted-foreground">{ACTION_LABELS[a.action] ?? a.action}</span>
                            {a.fromValue && a.toValue && (
                              <span className="text-muted-foreground">
                                {" "}— <span className="line-through opacity-60">{a.fromValue}</span> → <span className="font-medium text-foreground">{a.toValue}</span>
                              </span>
                            )}
                            <span className="text-muted-foreground ml-1 text-[10px]">· {formatDate(a.createdAt)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {task && editOpen && (
        <TaskFormModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          editTask={task}
          admins={admins}
          onSaved={() => { refetch(); onChanged(); setEditOpen(false); }}
        />
      )}
    </>
  );
}

// ─── Main Tasks Page ───────────────────────────────────────────────────────────

export default function TasksPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sortField, setSortField] = useState<string>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    priority: "all",
    assigneeId: "all",
    creatorId: "all",
    dueState: "all",
    dateFrom: "",
    dateTo: "",
  });

  // Derive effective assignee synchronously from URL — no async effect needed.
  // If ?assignee=me is present and user is loaded, the URL takes precedence.
  // Otherwise the user's manual filter selection (filters.assigneeId) is used.
  const assigneeFromUrl = user && new URLSearchParams(search).get("assignee") === "me"
    ? String(user.id)
    : null;
  const effectiveAssigneeId = assigneeFromUrl ?? filters.assigneeId;

  const isFullAccess = useMemo(() => {
    if (!user) return false;
    return user.adminRole === "admin" ||
      user.adminRole === "regional_manager" ||
      user.adminRole === "service_manager";
  }, [user]);

  const { data: adminsData } = useQuery<AdminOption[]>({
    queryKey: ["task-assignees"],
    queryFn: () => apiFetch<AdminOption[]>(`${BASE}/admin/tasks/assignees`),
  });
  const admins = adminsData ?? [];

  const buildQueryParams = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set("search", filters.search);
    if (filters.status && filters.status !== "all") p.set("status", filters.status);
    if (filters.priority && filters.priority !== "all") p.set("priority", filters.priority);
    if (effectiveAssigneeId !== "all") p.set("assigneeId", effectiveAssigneeId);
    if (filters.creatorId && filters.creatorId !== "all") p.set("creatorId", filters.creatorId);
    if (filters.dueState && filters.dueState !== "all") p.set("dueState", filters.dueState);
    if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) p.set("dateTo", filters.dateTo);
    p.set("limit", "200");
    return p.toString();
  }, [filters, effectiveAssigneeId, user, search]);

  const tasksQuery = useQuery<{ tasks: TaskListItem[]; total: number }>({
    queryKey: ["tasks", filters, effectiveAssigneeId],
    queryFn: () => apiFetch(`${BASE}/admin/tasks?${buildQueryParams()}`),
    staleTime: 15_000,
  });

  const tasks = tasksQuery.data?.tasks ?? [];
  const total = tasksQuery.data?.total ?? 0;

  const refetchAll = useCallback(() => {
    tasksQuery.refetch();
    qc.invalidateQueries({ queryKey: ["task-detail", selectedTaskId] });
    qc.invalidateQueries({ queryKey: ["my-tasks-summary"] });
  }, [tasksQuery, selectedTaskId, qc]);

  // Derived stat counts
  const allCount = total;
  const myCount = tasks.filter((t) => user && t.assignedToId === user.id).length;
  const overdueCount = tasks.filter(isOverdue).length;
  const dueTodayCount = tasks.filter(isDueToday).length;
  const completedCount = tasks.filter((t) => t.status === "Done").length;
  const urgentCount = tasks.filter((t) => t.priority === "Urgent").length;

  // Sort
  const sorted = useMemo(() => {
    const arr = [...tasks];
    arr.sort((a, b) => {
      const va = (a as Record<string, unknown>)[sortField];
      const vb = (b as Record<string, unknown>)[sortField];
      if (va == null) return 1;
      if (vb == null) return -1;
      const vaStr = typeof va === "string" ? va.toLowerCase() : va;
      const vbStr = typeof vb === "string" ? vb.toLowerCase() : vb;
      const cmp = vaStr < vbStr ? -1 : vaStr > vbStr ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [tasks, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-display tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Internal team task management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchAll()} className="h-8">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          {isFullAccess && (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> New Task
            </Button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="All Tasks"
          value={allCount}
          icon={ClipboardList}
          colorClass="bg-primary/10 text-primary"
          onClick={() => setFilters((f) => ({ ...f, status: "all", dueState: "all" }))}
          isLoading={tasksQuery.isLoading}
        />
        <StatCard
          title="My Tasks"
          value={myCount}
          icon={User}
          colorClass="bg-blue-500/10 text-blue-400"
          onClick={() => user && setFilters((f) => ({ ...f, assigneeId: String(user.id) }))}
          isLoading={tasksQuery.isLoading}
        />
        <StatCard
          title="Overdue"
          value={overdueCount}
          icon={AlertTriangle}
          colorClass="bg-red-500/10 text-red-400"
          onClick={() => setFilters((f) => ({ ...f, dueState: "overdue", status: "all" }))}
          isLoading={tasksQuery.isLoading}
        />
        <StatCard
          title="Due Today"
          value={dueTodayCount}
          icon={Clock}
          colorClass="bg-amber-500/10 text-amber-400"
          onClick={() => setFilters((f) => ({ ...f, dueState: "today", status: "all" }))}
          isLoading={tasksQuery.isLoading}
        />
        <StatCard
          title="Completed"
          value={completedCount}
          icon={CheckCircle2}
          colorClass="bg-green-500/10 text-green-400"
          onClick={() => setFilters((f) => ({ ...f, status: "Done", dueState: "all" }))}
          isLoading={tasksQuery.isLoading}
        />
        <StatCard
          title="Urgent"
          value={urgentCount}
          icon={Flame}
          colorClass="bg-orange-500/10 text-orange-400"
          onClick={() => setFilters((f) => ({ ...f, priority: "Urgent" }))}
          isLoading={tasksQuery.isLoading}
        />
      </div>

      {/* Filter bar */}
      <Card className="border border-border/40 bg-card/60">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search tasks…"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              className="h-8 text-sm w-48"
            />
            <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.priority} onValueChange={(v) => setFilters((f) => ({ ...f, priority: v }))}>
              <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            {isFullAccess && (
              <>
                <Select value={effectiveAssigneeId} onValueChange={(v) => setFilters((f) => ({ ...f, assigneeId: v }))}>
                  <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="Assignee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All assignees</SelectItem>
                    {admins.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filters.creatorId} onValueChange={(v) => setFilters((f) => ({ ...f, creatorId: v }))}>
                  <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="Creator" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All creators</SelectItem>
                    {admins.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
            <Select value={filters.dueState} onValueChange={(v) => setFilters((f) => ({ ...f, dueState: v }))}>
              <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Due state" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any due date</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="today">Due today</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              className="h-8 text-sm w-36"
              title="Date from"
            />
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              className="h-8 text-sm w-36"
              title="Date to"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setFilters({ search: "", status: "all", priority: "all", assigneeId: "all", creatorId: "all", dueState: "all", dateFrom: "", dateTo: "" })}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border border-border/40 bg-card/60">
        <CardContent className="p-0">
          {tasksQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No tasks found</p>
              {isFullAccess && (
                <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Create first task
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40 hover:bg-transparent">
                    <TableHead
                      className="text-[10px] uppercase tracking-widest font-bold cursor-pointer select-none w-[30%]"
                      onClick={() => toggleSort("title")}
                    >
                      Title <SortIcon field="title" />
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-bold cursor-pointer select-none" onClick={() => toggleSort("assigneeName")}>
                      Assignee <SortIcon field="assigneeName" />
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-bold cursor-pointer select-none" onClick={() => toggleSort("priority")}>
                      Priority <SortIcon field="priority" />
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-bold cursor-pointer select-none" onClick={() => toggleSort("status")}>
                      Status <SortIcon field="status" />
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-bold w-28">Progress</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-bold cursor-pointer select-none hidden md:table-cell" onClick={() => toggleSort("startDate")}>
                      Start <SortIcon field="startDate" />
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-bold cursor-pointer select-none hidden md:table-cell" onClick={() => toggleSort("dueDate")}>
                      Due <SortIcon field="dueDate" />
                    </TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-bold hidden lg:table-cell">Related</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-widest font-bold cursor-pointer select-none hidden lg:table-cell" onClick={() => toggleSort("updatedAt")}>
                      Updated <SortIcon field="updatedAt" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((task) => {
                    const overdue = isOverdue(task);
                    const dueToday = isDueToday(task);
                    const done = task.status === "Done";
                    return (
                      <TableRow
                        key={task.id}
                        className={cn(
                          "cursor-pointer border-border/20 hover:bg-muted/30 transition-colors",
                          overdue && "bg-red-500/5 hover:bg-red-500/10",
                          done && "opacity-60",
                        )}
                        onClick={() => setSelectedTaskId(task.id)}
                      >
                        <TableCell className="font-medium text-sm py-3">
                          <span className={cn(done && "line-through text-muted-foreground")}>{task.title}</span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {task.assigneeName ?? <span className="italic text-muted-foreground/50">Unassigned</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLORS[task.priority])}>
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", STATUS_COLORS[task.status])}>
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="w-28">
                          <TaskProgressBar value={task.progressPercent} compact />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                          {formatDate(task.startDate)}
                        </TableCell>
                        <TableCell className={cn("text-xs hidden md:table-cell", overdue && "text-red-400 font-semibold", dueToday && "text-amber-400 font-semibold")}>
                          {formatDate(task.dueDate)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                          {task.relatedType && task.relatedId ? `${task.relatedType} #${task.relatedId}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                          {formatDate(task.updatedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      <TaskDetailDrawer
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onChanged={refetchAll}
        admins={admins}
        isFullAccess={isFullAccess}
      />

      {/* Create Modal */}
      {createOpen && (
        <TaskFormModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          admins={admins}
          onSaved={refetchAll}
        />
      )}
    </div>
  );
}
