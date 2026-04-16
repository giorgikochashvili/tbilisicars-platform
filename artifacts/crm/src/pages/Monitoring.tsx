import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Mail,
  Smile,
  Search,
  RotateCcw,
  Send,
  Phone,
  Car as CarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/utils";

// ─── API helper ────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    const reason =
      (body as { error?: string; reason?: string }).error ??
      (body as { error?: string; reason?: string }).reason ??
      res.statusText;
    throw new Error(reason);
  }
  return res.json();
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type Satisfaction = "HAPPY" | "NEUTRAL" | "SAD";

interface MonitoringRow {
  bookingId: number;
  reservationCode: string | null;
  status: string;
  paymentStatus: string;
  currency: string;
  totalAmount: string | number | null;
  contactFullName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  nationality: string | null;
  pickupDatetime: string;
  dropoffDatetime: string;
  vehiclePlate: string | null;
  vehicleModel: string | null;
  vehicleBrand: string | null;
  pickupActionAt: string;
  pickupNotes: string | null;
  pickupMileage: number | null;
  pickupFuel: number | null;
  pickupSatisfaction: Satisfaction | null;
  pickupPerformerId: number | null;
  pickupPerformerName: string | null;
  dropoffActionAt: string | null;
  dropoffNotes: string | null;
  dropoffMileage: number | null;
  dropoffFuel: number | null;
  dropoffPerformerId: number | null;
  dropoffPerformerName: string | null;
  parkingZone: string | null;
  paidByCurrency: Record<string, number>;
}

interface MonitoringNote {
  id: number;
  bookingId: number;
  authorAdminId: number | null;
  authorName: string | null;
  body: string;
  createdAt: string;
}

interface Performer {
  id: number;
  fullName: string;
}

// ─── Visual helpers ────────────────────────────────────────────────────────────

const SAT_META: Record<Satisfaction, { emoji: string; label: string; cls: string }> = {
  HAPPY: { emoji: "🙂", label: "Happy", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  NEUTRAL: { emoji: "😐", label: "Neutral", cls: "bg-amber-500/15 text-amber-400 border-amber-500/40" },
  SAD: { emoji: "☹️", label: "Sad", cls: "bg-red-500/15 text-red-400 border-red-500/40" },
};

function SatisfactionPill({ value }: { value: Satisfaction | null }) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  const m = SAT_META[value];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-md border ${m.cls}`}
      title={m.label}
    >
      <span className="text-sm leading-none">{m.emoji}</span>
      <span className="hidden sm:inline">{m.label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DELIVERED: "bg-blue-500/15 text-blue-300 border-blue-500/40",
    RETURNED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    CONFIRMED: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    PENDING: "bg-slate-500/15 text-slate-300 border-slate-500/40",
    CANCELED: "bg-red-500/15 text-red-300 border-red-500/40",
    NO_SHOW: "bg-red-500/15 text-red-300 border-red-500/40",
  };
  return (
    <span
      className={`text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded border ${map[status] ?? "bg-muted/30 text-muted-foreground border-border/40"}`}
    >
      {status}
    </span>
  );
}

function fmtMoney(amount: number, currency: string): string {
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function PaidCell({ map, currency }: { map: Record<string, number>; currency: string }) {
  const entries = Object.entries(map).filter(([, v]) => v > 0);
  if (entries.length === 0)
    return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([cur, amt]) => (
        <span
          key={cur}
          className={`text-xs font-mono ${cur === currency ? "text-emerald-400 font-semibold" : "text-muted-foreground"}`}
        >
          {fmtMoney(amt, cur)}
        </span>
      ))}
    </div>
  );
}

// ─── Filter bar ────────────────────────────────────────────────────────────────

interface Filters {
  pickupFrom: string;
  pickupTo: string;
  satisfaction: Satisfaction | "";
  status: string;
  performerId: string;
  search: string;
}

const EMPTY_FILTERS: Filters = {
  pickupFrom: "",
  pickupTo: "",
  satisfaction: "",
  status: "",
  performerId: "",
  search: "",
};

// ─── Notes panel ──────────────────────────────────────────────────────────────

function NotesPanel({ bookingId }: { bookingId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data, isLoading } = useQuery<{ notes: MonitoringNote[] }>({
    queryKey: ["monitoring-notes", bookingId],
    queryFn: () => apiFetch(`/admin/monitoring/${bookingId}/notes`),
  });

  const addNote = useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/admin/monitoring/${bookingId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["monitoring-notes", bookingId] });
    },
    onError: (e: Error) =>
      toast({ title: "Could not add note", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const body = draft.trim();
    if (!body) return;
    addNote.mutate(body);
  };

  return (
    <div className="space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
        Internal Notes
      </div>
      <div className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (data?.notes ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground italic">No internal notes yet.</div>
        ) : (
          (data?.notes ?? []).map((n) => (
            <div
              key={n.id}
              className="rounded-md border border-border/40 bg-muted/10 p-2.5 text-xs"
              data-testid={`monitoring-note-${n.id}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-semibold text-foreground">
                  {n.authorName ?? "Unknown"}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatDateTime(n.createdAt)}
                </span>
              </div>
              <div className="whitespace-pre-wrap text-muted-foreground">{n.body}</div>
            </div>
          ))
        )}
      </div>
      <div className="space-y-1.5">
        <Textarea
          rows={2}
          placeholder="Add an internal note (visible to staff only)…"
          className="text-xs resize-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="textarea-monitoring-note"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleSubmit}
            disabled={!draft.trim() || addNote.isPending}
            data-testid="button-add-monitoring-note"
          >
            {addNote.isPending ? "Posting…" : "Add note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Send-mail dialog ─────────────────────────────────────────────────────────

function SendMailDialog({
  row,
  open,
  onOpenChange,
}: {
  row: MonitoringRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  if (!row) return null;
  const firstName = (row.contactFullName ?? "").trim().split(/\s+/)[0] || "there";
  const vehicle = [row.vehicleBrand, row.vehicleModel].filter(Boolean).join(" ") || "your vehicle";
  const reference = row.reservationCode ?? `#${row.bookingId}`;

  const send = useMutation({
    mutationFn: () =>
      apiFetch(`/admin/monitoring/${row.bookingId}/send-thank-you`, {
        method: "POST",
        body: JSON.stringify({ vehicle }),
      }),
    onSuccess: () => {
      toast({ title: "Thank-you email sent", description: `Sent to ${row.contactEmail}.` });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ title: "Could not send", description: e.message, variant: "destructive" }),
  });

  const noEmail = !row.contactEmail;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" /> Send thank-you email
          </DialogTitle>
          <DialogDescription>
            Sends a personalised thank-you with Google Review and Trustpilot links.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border/40 bg-muted/10 p-3 space-y-1">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground text-xs">To</span>
              <span className="font-medium text-xs">{row.contactEmail ?? "— (no email on file)"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground text-xs">Customer</span>
              <span className="font-medium text-xs">{row.contactFullName}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground text-xs">Booking</span>
              <span className="font-medium text-xs">{reference}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground text-xs">Vehicle</span>
              <span className="font-medium text-xs">{vehicle}</span>
            </div>
          </div>
          <div className="rounded-md border border-border/40 bg-background/50 p-3 text-xs leading-relaxed">
            <p className="mb-2">
              <strong>Subject:</strong> Thanks for choosing Tbilisicars, {firstName}!
            </p>
            <p>Hi {firstName},</p>
            <p className="mt-2">
              Thank you for choosing Tbilisicars and picking up your <strong>{vehicle}</strong>{" "}
              today (booking <strong>{reference}</strong>). We hope everything is going smoothly.
            </p>
            <p className="mt-2">
              If you have a moment, a short public review really helps — Google and Trustpilot links
              are included.
            </p>
            <p className="mt-2 text-muted-foreground">
              Closes with the Tbilisicars contact line and signature.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={send.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => send.mutate()}
            disabled={send.isPending || noEmail}
            data-testid="button-send-thank-you-confirm"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {send.isPending ? "Sending…" : "Send email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Expanded row details ─────────────────────────────────────────────────────

function ExpandedRow({ row }: { row: MonitoringRow }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/5 border-t border-border/30">
      <div className="space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Pickup
          </div>
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between"><span className="text-muted-foreground">When</span><span className="font-mono">{formatDateTime(row.pickupActionAt)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Mileage</span><span className="font-mono">{row.pickupMileage != null ? `${row.pickupMileage.toLocaleString()} km` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fuel</span><span className="font-mono">{row.pickupFuel != null ? `${row.pickupFuel}%` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Performed by</span><span>{row.pickupPerformerName ?? "—"}</span></div>
            {row.pickupNotes && (
              <div className="pt-1 mt-1 border-t border-border/30">
                <div className="text-muted-foreground mb-0.5">Notes</div>
                <div className="whitespace-pre-wrap">{row.pickupNotes}</div>
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Drop Off
          </div>
          <div className="text-xs space-y-0.5">
            <div className="flex justify-between"><span className="text-muted-foreground">When</span><span className="font-mono">{row.dropoffActionAt ? formatDateTime(row.dropoffActionAt) : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Mileage</span><span className="font-mono">{row.dropoffMileage != null ? `${row.dropoffMileage.toLocaleString()} km` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fuel</span><span className="font-mono">{row.dropoffFuel != null ? `${row.dropoffFuel}%` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Performed by</span><span>{row.dropoffPerformerName ?? "—"}</span></div>
            {row.dropoffNotes && (
              <div className="pt-1 mt-1 border-t border-border/30">
                <div className="text-muted-foreground mb-0.5">Notes</div>
                <div className="whitespace-pre-wrap">{row.dropoffNotes}</div>
              </div>
            )}
          </div>
        </div>
        {row.parkingZone && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
              Parking Zone
            </div>
            <Badge variant="outline" className="text-[10px]">{row.parkingZone}</Badge>
          </div>
        )}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
            Payments
          </div>
          {Object.keys(row.paidByCurrency).length === 0 ? (
            <div className="text-xs text-muted-foreground">No paid records.</div>
          ) : (
            <div className="text-xs space-y-0.5">
              {Object.entries(row.paidByCurrency).map(([cur, amt]) => (
                <div key={cur} className="flex justify-between">
                  <span className="text-muted-foreground">Paid ({cur})</span>
                  <span className="font-mono">{fmtMoney(amt, cur)}</span>
                </div>
              ))}
              {row.totalAmount != null && (
                <div className="flex justify-between pt-1 mt-1 border-t border-border/30">
                  <span className="text-muted-foreground">Booking total</span>
                  <span className="font-mono">{fmtMoney(parseFloat(String(row.totalAmount)), row.currency)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <NotesPanel bookingId={row.bookingId} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Monitoring() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [mailRow, setMailRow] = useState<MonitoringRow | null>(null);

  const { data: performersData } = useQuery<Performer[]>({
    queryKey: ["monitoring-performers"],
    queryFn: () => apiFetch(`/admin/monitoring/performers`),
  });
  const performers = performersData ?? [];

  const { data: configData } = useQuery<{ emailEnabled: boolean }>({
    queryKey: ["monitoring-config"],
    queryFn: () => apiFetch(`/admin/monitoring/config`),
  });
  const emailEnabled = configData?.emailEnabled ?? false;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (appliedFilters.pickupFrom) p.set("pickupFrom", `${appliedFilters.pickupFrom}T00:00:00`);
    if (appliedFilters.pickupTo) p.set("pickupTo", `${appliedFilters.pickupTo}T23:59:59`);
    if (appliedFilters.satisfaction) p.set("satisfaction", appliedFilters.satisfaction);
    if (appliedFilters.status) p.set("status", appliedFilters.status);
    if (appliedFilters.performerId) p.set("performerId", appliedFilters.performerId);
    return p.toString();
  }, [appliedFilters]);

  const { data, isLoading, refetch } = useQuery<{ rows: MonitoringRow[] }>({
    queryKey: ["monitoring-rows", queryString],
    queryFn: () => apiFetch(`/admin/monitoring${queryString ? `?${queryString}` : ""}`),
  });

  const visibleRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const term = appliedFilters.search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const hay = [
        r.reservationCode ?? "",
        r.contactFullName,
        r.contactPhone ?? "",
        r.contactEmail ?? "",
        r.vehiclePlate ?? "",
        r.vehicleModel ?? "",
        r.vehicleBrand ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [data, appliedFilters.search]);

  const toggleRow = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyFilters = () => setAppliedFilters(filters);
  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  return (
    <div className="space-y-4 p-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Monitoring</h1>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => refetch()}
          data-testid="button-monitoring-refresh"
        >
          <RotateCcw className="w-3 h-3 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border/40 bg-card/50 p-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pickup From</Label>
            <Input
              type="date"
              value={filters.pickupFrom}
              onChange={(e) => setFilters((f) => ({ ...f, pickupFrom: e.target.value }))}
              className="h-7 text-xs"
              data-testid="input-monitoring-pickup-from"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Pickup To</Label>
            <Input
              type="date"
              value={filters.pickupTo}
              onChange={(e) => setFilters((f) => ({ ...f, pickupTo: e.target.value }))}
              className="h-7 text-xs"
              data-testid="input-monitoring-pickup-to"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Satisfaction</Label>
            <Select
              value={filters.satisfaction || "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, satisfaction: v === "all" ? "" : (v as Satisfaction) }))}
            >
              <SelectTrigger className="h-7 text-xs" data-testid="select-monitoring-satisfaction">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="HAPPY">🙂 Happy</SelectItem>
                <SelectItem value="NEUTRAL">😐 Neutral</SelectItem>
                <SelectItem value="SAD">☹️ Sad</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
            <Select
              value={filters.status || "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="h-7 text-xs" data-testid="select-monitoring-status">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="RETURNED">Returned</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
                <SelectItem value="NO_SHOW">No-show</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Performer</Label>
            <Select
              value={filters.performerId || "all"}
              onValueChange={(v) => setFilters((f) => ({ ...f, performerId: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="h-7 text-xs" data-testid="select-monitoring-performer">
                <SelectValue placeholder="Anyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {performers.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Ref, plate, name…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
                className="h-7 text-xs pl-6"
                data-testid="input-monitoring-search"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2.5">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetFilters} data-testid="button-monitoring-reset">
            Reset
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={applyFilters} data-testid="button-monitoring-apply">
            Apply
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="rounded-lg border border-border/40 bg-card/50 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No bookings match the current filters.
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {visibleRows.map((row) => {
              const isOpen = expanded.has(row.bookingId);
              return (
                <li key={row.bookingId} data-testid={`monitoring-row-${row.bookingId}`}>
                  <button
                    type="button"
                    onClick={() => toggleRow(row.bookingId)}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="font-mono text-xs font-semibold text-primary">{row.reservationCode ?? `#${row.bookingId}`}</span>
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <div className="text-xs font-medium truncate flex items-center gap-1.5">
                          <span>{row.contactFullName}</span>
                          {row.nationality && (
                            <span className="text-[10px] text-muted-foreground font-normal" title="Nationality">
                              ({row.nationality})
                            </span>
                          )}
                        </div>
                        {row.contactPhone && (
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5" />
                            {row.contactPhone}
                          </div>
                        )}
                      </div>
                      <div className="hidden md:flex flex-col min-w-[140px]">
                        <div className="text-xs flex items-center gap-1">
                          <CarIcon className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono">{row.vehiclePlate ?? "—"}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {[row.vehicleBrand, row.vehicleModel].filter(Boolean).join(" ") || "—"}
                        </div>
                      </div>
                      <div className="hidden lg:flex flex-col min-w-[150px]">
                        <div className="text-[11px] text-muted-foreground">Pickup</div>
                        <div className="text-xs font-mono">{formatDateTime(row.pickupActionAt)}</div>
                        {row.pickupPerformerName && (
                          <div className="text-[10px] text-muted-foreground">by {row.pickupPerformerName}</div>
                        )}
                      </div>
                      <div className="hidden lg:flex flex-col min-w-[150px]">
                        <div className="text-[11px] text-muted-foreground">Drop Off</div>
                        <div className="text-xs font-mono">{row.dropoffActionAt ? formatDateTime(row.dropoffActionAt) : "—"}</div>
                        {row.dropoffPerformerName && (
                          <div className="text-[10px] text-muted-foreground">by {row.dropoffPerformerName}</div>
                        )}
                      </div>
                      <div className="hidden sm:block min-w-[100px]">
                        <PaidCell map={row.paidByCurrency} currency={row.currency} />
                      </div>
                      <div className="flex items-center gap-2">
                        <SatisfactionPill value={row.pickupSatisfaction} />
                        <StatusBadge status={row.status} />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1.5"
                        onClick={(e) => { e.stopPropagation(); setMailRow(row); }}
                        disabled={!emailEnabled || !row.contactEmail}
                        title={
                          !emailEnabled
                            ? "Email sending is not configured (RESEND_API_KEY missing)"
                            : !row.contactEmail
                              ? "No customer email on file"
                              : "Send thank-you email"
                        }
                        data-testid={`button-send-mail-${row.bookingId}`}
                      >
                        <Mail className="w-3 h-3" />
                        <span className="hidden sm:inline">Send mail</span>
                      </Button>
                    </div>
                  </button>
                  {isOpen && <ExpandedRow row={row} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <SendMailDialog
        row={mailRow}
        open={mailRow !== null}
        onOpenChange={(o) => { if (!o) setMailRow(null); }}
      />
    </div>
  );
}
