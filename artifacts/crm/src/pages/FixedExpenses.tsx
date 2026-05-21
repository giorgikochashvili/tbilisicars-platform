import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Edit, Trash2, MoreHorizontal, CalendarClock, Power, PowerOff, AlertCircle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ── API fetch ─────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const e = new Error(err.error ?? "Request failed") as any;
    e.code = err.code;
    e.status = res.status;
    throw e;
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json().catch(() => null);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  "Service / Maintenance",
  "Fuel",
  "Refund",
  "Office Expense",
  "Salary",
  "Marketing",
  "Airport Office Fee",
  "Parking Fee",
  "Other Expense",
];

const CURRENCY_SYMBOLS: Record<string, string> = { GEL: "₾", USD: "$", EUR: "€" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatAmount(amount: string | number, currency: string) {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${sym}${parseFloat(String(amount)).toFixed(2)}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Currency = "GEL" | "USD" | "EUR";

interface TemplateForm {
  name: string;
  category: string;
  amount: string;
  currency: Currency;
  dueDay: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_FORM: TemplateForm = {
  name: "",
  category: "",
  amount: "",
  currency: "GEL",
  dueDay: "1",
  notes: "",
  isActive: true,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function FixedExpenses() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [formData, setFormData] = useState<TemplateForm>(EMPTY_FORM);

  const [isPostOpen, setIsPostOpen] = useState(false);
  const [postTarget, setPostTarget] = useState<any>(null);
  const [postMonth, setPostMonth] = useState(currentMonth());
  const [postError, setPostError] = useState<string | null>(null);
  const [postedMonthsCache, setPostedMonthsCache] = useState<Record<number, string[]>>({});

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data: templates, isLoading } = useQuery<any[]>({
    queryKey: ["fixed-expense-templates"],
    queryFn: () => apiFetch("/api/admin/accounting/fixed-expenses"),
    select: (d: any) => (Array.isArray(d) ? d : []),
  });

  // ── Invalidation helpers ───────────────────────────────────────────────────

  const invalidateTemplates = () =>
    queryClient.invalidateQueries({ queryKey: ["fixed-expense-templates"] });

  const invalidateAccounting = () => {
    queryClient.invalidateQueries({ queryKey: ["accounting-entries"] });
    queryClient.invalidateQueries({ queryKey: ["accounting-summary"] });
  };

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (body: any) =>
      apiFetch("/api/admin/accounting/fixed-expenses", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Template created" });
      invalidateTemplates();
      setIsFormOpen(false);
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      apiFetch(`/api/admin/accounting/fixed-expenses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast({ title: "Template updated" });
      invalidateTemplates();
      setIsFormOpen(false);
    },
    onError: (e: any) =>
      toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/accounting/fixed-expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Template deleted" });
      invalidateTemplates();
    },
    onError: (e: any) => {
      const msg =
        e.message?.toLowerCase().includes("posted") ||
        e.message?.toLowerCase().includes("entries")
          ? "This template has existing posted entries and cannot be deleted. Deactivate it instead."
          : e.message;
      toast({ title: "Cannot delete", description: msg, variant: "destructive" });
    },
  });

  const postMutation = useMutation({
    mutationFn: ({ id, month }: { id: number; month: string }) =>
      apiFetch(`/api/admin/accounting/fixed-expenses/${id}/post`, {
        method: "POST",
        body: JSON.stringify({ month }),
      }),
    onSuccess: (_data, vars) => {
      toast({ title: "Expense posted", description: "Entry added to accounting ledger." });
      setPostedMonthsCache((prev) => ({
        ...prev,
        [vars.id]: [...(prev[vars.id] ?? []), vars.month],
      }));
      invalidateTemplates();
      invalidateAccounting();
      setIsPostOpen(false);
    },
    onError: (e: any) => {
      if (e.code === "DUPLICATE_POST" || e.message?.toLowerCase().includes("already")) {
        setPostError(
          `Already posted for ${postMonth}. Choose a different month or check the accounting ledger.`,
        );
      } else if (e.message?.toLowerCase().includes("inactive")) {
        setPostError("This template is inactive and cannot be posted. Reactivate it first.");
      } else {
        setPostError(e.message ?? "Failed to post expense.");
      }
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditingTemplate(null);
    setFormData(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingTemplate(t);
    setFormData({
      name: t.name ?? "",
      category: t.category ?? "",
      amount: t.amount?.toString() ?? "",
      currency: (t.currency as Currency) ?? "GEL",
      dueDay: t.dueDay?.toString() ?? "1",
      notes: t.notes ?? "",
      isActive: t.isActive ?? true,
    });
    setIsFormOpen(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({ title: "Validation", description: "Name is required.", variant: "destructive" });
      return;
    }
    if (!formData.category) {
      toast({ title: "Validation", description: "Category is required.", variant: "destructive" });
      return;
    }
    const amt = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amt) || amt <= 0) {
      toast({
        title: "Validation",
        description: "A positive amount is required.",
        variant: "destructive",
      });
      return;
    }
    const day = parseInt(formData.dueDay, 10);
    if (isNaN(day) || day < 1 || day > 28) {
      toast({
        title: "Validation",
        description: "Due day must be between 1 and 28.",
        variant: "destructive",
      });
      return;
    }
    const body: Record<string, any> = {
      name: formData.name.trim(),
      category: formData.category,
      amount: formData.amount,
      currency: formData.currency,
      dueDay: day,
      notes: formData.notes || null,
    };
    if (editingTemplate) {
      body.isActive = formData.isActive;
      updateMutation.mutate({ id: editingTemplate.id, body });
    } else {
      createMutation.mutate(body);
    }
  };

  const handleToggleActive = (t: any) => {
    const msg = t.isActive
      ? "Deactivate this template? Existing posted accounting entries will not be affected."
      : "Reactivate this template?";
    if (!confirm(msg)) return;
    updateMutation.mutate({ id: t.id, body: { isActive: !t.isActive } });
  };

  const handleDelete = (t: any) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(t.id);
  };

  const openPostModal = async (t: any) => {
    setPostTarget(t);
    setPostMonth(currentMonth());
    setPostError(null);
    setIsPostOpen(true);
    if (!postedMonthsCache[t.id]) {
      try {
        const data = await apiFetch(
          `/api/admin/accounting/fixed-expenses/${t.id}/posted-months`,
        );
        setPostedMonthsCache((prev) => ({
          ...prev,
          [t.id]: data?.postedMonths ?? [],
        }));
      } catch {
        // non-fatal — backend is the authoritative guard
      }
    }
  };

  const alreadyPostedCached =
    postTarget != null &&
    (postedMonthsCache[postTarget.id] ?? []).includes(postMonth);

  const handlePost = () => {
    if (!postTarget) return;
    setPostError(null);
    postMutation.mutate({ id: postTarget.id, month: postMonth });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const rows: any[] = templates ?? [];

  return (
    <>
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="py-4 border-b border-border/40 bg-background/50">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base font-display flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" /> Fixed Monthly Expenses
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Define recurring expenses once. Post them manually each month to record them in
                the accounting ledger.
              </p>
            </div>
            <Button size="sm" onClick={openCreate} className="shadow-sm shrink-0">
              <Plus className="w-4 h-4 mr-2" /> Add Template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Due Day</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-sm text-muted-foreground"
                    >
                      No fixed expense templates yet. Click &ldquo;Add Template&rdquo; to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((t: any) => (
                    <TableRow
                      key={t.id}
                      className="border-border/20 hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="text-sm font-medium">{t.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.category}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-500">
                        &minus;{formatAmount(t.amount, t.currency)}
                        {t.currency !== "GEL" && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({t.currency})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {t.dueDay ?? 1}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
                        {t.notes || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {t.isActive ? (
                          <Badge
                            variant="outline"
                            className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => openPostModal(t)}
                              disabled={!t.isActive}
                            >
                              <CalendarClock className="w-4 h-4 mr-2" /> Post for month
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEdit(t)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(t)}>
                              {t.isActive ? (
                                <>
                                  <PowerOff className="w-4 h-4 mr-2" /> Deactivate
                                </>
                              ) : (
                                <>
                                  <Power className="w-4 h-4 mr-2" /> Reactivate
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(t)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingTemplate ? "Edit Template" : "Add Fixed Expense Template"}
            </DialogTitle>
            <DialogDescription>
              This is a template only — no expense is recorded until you post it for a specific
              month.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-2">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Office Rent"
                className="bg-background"
              />
            </div>

            {/* Category */}
            <div className="grid gap-2">
              <Label>
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.category || ""}
                onValueChange={(v) => setFormData({ ...formData, category: v })}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount + Currency */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>
                  Amount <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="e.g. 1500.00"
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label>
                  Currency <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) =>
                    setFormData({ ...formData, currency: v as Currency })
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GEL">&#8382; GEL</SelectItem>
                    <SelectItem value="USD">$ USD</SelectItem>
                    <SelectItem value="EUR">&#8364; EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Due Day */}
            <div className="grid gap-2">
              <Label>
                Due Day{" "}
                <span className="text-xs text-muted-foreground font-normal">(1–28)</span>
              </Label>
              <Input
                type="number"
                min="1"
                max="28"
                value={formData.dueDay}
                onChange={(e) => setFormData({ ...formData, dueDay: e.target.value })}
                className="bg-background w-28"
              />
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional description…"
                rows={2}
                className="bg-background"
              />
            </div>

            {/* isActive — edit mode only */}
            {editingTemplate && (
              <div className="flex items-center gap-3">
                <input
                  id="fe-isactive"
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.checked })
                  }
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
                <Label htmlFor="fe-isactive" className="cursor-pointer font-normal">
                  Active (uncheck to deactivate)
                </Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving…"
                : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Post for Month Dialog ────────────────────────────────────────────── */}
      <Dialog
        open={isPostOpen}
        onOpenChange={(open) => {
          if (!open) setIsPostOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Post for Month</DialogTitle>
            <DialogDescription>
              Posting creates one accounting expense entry in the ledger. This cannot be undone
              from this screen.
            </DialogDescription>
          </DialogHeader>

          {postTarget && (
            <div className="grid gap-4 py-4">
              {/* Template summary */}
              <div className="rounded-md border border-border/40 bg-muted/30 px-4 py-3 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Template:</span>{" "}
                  <strong>{postTarget.name}</strong>
                </p>
                <p>
                  <span className="text-muted-foreground">Amount:</span>{" "}
                  <strong className="text-red-500 font-mono">
                    &minus;{formatAmount(postTarget.amount, postTarget.currency)}
                  </strong>
                </p>
                <p>
                  <span className="text-muted-foreground">Category:</span>{" "}
                  {postTarget.category}
                </p>
              </div>

              {/* Month picker */}
              <div className="grid gap-2">
                <Label>
                  Month <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="month"
                  value={postMonth}
                  onChange={(e) => {
                    setPostMonth(e.target.value);
                    setPostError(null);
                  }}
                  className="bg-background"
                />
              </div>

              {/* Already-posted UX hint (from cache) */}
              {alreadyPostedCached && !postError && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Already posted for {postMonth}. Choose a different month or check the
                    accounting ledger.
                  </span>
                </div>
              )}

              {/* API error from post attempt */}
              {postError && (
                <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{postError}</span>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Post <strong>{postTarget.name}</strong> for <strong>{postMonth}</strong>? This
                will create one accounting expense entry.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPostOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePost}
              disabled={postMutation.isPending || alreadyPostedCached}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {postMutation.isPending ? "Posting…" : "Post Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
