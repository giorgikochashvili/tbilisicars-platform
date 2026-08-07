import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Settings,
  MapPin,
  Calendar,
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  ChartBar,
  Eye,
  TriangleAlert,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Types ───────────────────────────────────────────────────────────────────

type City = "Tbilisi" | "Kutaisi" | "Batumi" | "All";
type RangeSize = 30 | 60;

interface DayMetrics {
  available: number;
  availableEndOfDay: number;
  occupiedEndOfDay: number;
  bookings: number;
  bookingsOverlappingDay: number;
  pickups: number;
  returns: number;
  pending: number;
  shortage: number;
}

interface AvailGroup {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
  modelIds: number[];
  days: Record<string, DayMetrics>;
}

interface CalendarResponse {
  dateRange: { start: string; end: string };
  city: string;
  unclassifiedVehicleCount: number;
  groups: AvailGroup[];
  byCity: Record<string, AvailGroup[]> | null;
}

interface VehicleEntry {
  id: number;
  status: string | null;
  city: string | null;
}

interface BookingEntry {
  id: number;
  vehicleId: number | null;
  status: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupCity: string | null;
  dropoffCity: string | null;
}

interface DetailResponse {
  groupId: number;
  city: string;
  date: string;
  startOfDay: string;
  endOfDay: string;
  supply: number;
  availableVehicles: VehicleEntry[];
  assignedVehicles: VehicleEntry[];
  overdueVehicles: VehicleEntry[];
  excludedVehicles: VehicleEntry[];
  unassignedDemand: number;
  pendingBookings: BookingEntry[];
  pickups: BookingEntry[];
  returns: BookingEntry[];
}

interface GroupRecord {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  modelIds: number[];
}

interface VehicleModel {
  id: number;
  name: string;
  brandName: string;
}

interface FleetModelRaw {
  id: number;
  name: string;
  brand?: { name?: string } | string | null;
  brandName?: string;
}

// ─── Date helpers (Tbilisi = UTC+4, no DST) ──────────────────────────────────

const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000;

function tbilisiTodayStr(): string {
  const now = new Date();
  const tbMs = now.getTime() + TBILISI_OFFSET_MS;
  const d = new Date(tbMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysStr(dateStr: string, n: number): string {
  const d = parseDateStr(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDateHeader(dateStr: string): { weekday: string; day: string } {
  const d = parseDateStr(dateStr);
  const weekday = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getUTCDay()];
  return { weekday, day: String(d.getUTCDate()) };
}

function formatDateShort(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return isoStr;
  }
}

function generateDates(startStr: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDaysStr(startStr, i));
}

function isWeekend(dateStr: string): boolean {
  const d = parseDateStr(dateStr);
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Subcomponent: Detail Dialog ──────────────────────────────────────────────

const DETAIL_CITIES = ["Tbilisi", "Kutaisi", "Batumi"] as const;

function CellDetailDialog({
  groupId,
  groupName,
  date,
  mainCity,
  byCityMetrics,
  open,
  onClose,
}: {
  groupId: number;
  groupName: string;
  date: string;
  mainCity: City;
  byCityMetrics: Record<string, DayMetrics> | null;
  open: boolean;
  onClose: () => void;
}) {
  // For a canonical city: pre-select it so detail loads immediately.
  // For "All": start null — no region may be silently selected.
  const [detailCity, setDetailCity] = useState<string | null>(
    mainCity !== "All" ? mainCity : null,
  );

  const { data, isLoading, error } = useQuery<DetailResponse>({
    queryKey: ["availability-calendar-detail", groupId, detailCity, date],
    queryFn: () =>
      apiFetch<DetailResponse>(
        `/api/admin/availability-calendar/detail?groupId=${groupId}&city=${encodeURIComponent(detailCity!)}&date=${date}`,
      ),
    // Never fires until detailCity is explicitly set
    enabled: open && !!date && detailCity !== null,
    staleTime: 30_000,
  });

  const fmt = (dt: string) => formatDateShort(dt);

  const titleCity = mainCity === "All"
    ? detailCity ? `${detailCity} (within All)` : "All"
    : mainCity;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {groupName} — {titleCity} — {date}
          </DialogTitle>
        </DialogHeader>

        {/* ── Region selector — only when mainCity="All" ── */}
        {mainCity === "All" && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Select region for detail
              </p>
              <div className="flex gap-2 flex-wrap">
                {DETAIL_CITIES.map((c) => {
                  const m = byCityMetrics?.[c];
                  return (
                    <Button
                      key={c}
                      variant={detailCity === c ? "default" : "outline"}
                      size="sm"
                      className="h-8 px-4 text-xs gap-2"
                      onClick={() => setDetailCity(c)}
                    >
                      {c}
                      {m !== undefined && (
                        <span
                          className={`font-mono font-bold ${
                            (m.shortage ?? 0) > 0 ? "text-red-400" : "text-emerald-500"
                          }`}
                        >
                          {m.available}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* byCity summary table — uses backend byCity values directly */}
            {byCityMetrics && Object.keys(byCityMetrics).length > 0 && (
              <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/40">
                      <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Region</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Avail</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Bookings</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Pickups</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Returns</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Pending</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Shortage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DETAIL_CITIES.filter((c) => byCityMetrics[c] !== undefined).map((c) => {
                      const m = byCityMetrics[c];
                      return (
                        <tr
                          key={c}
                          className={`border-b border-border/20 cursor-pointer hover:bg-muted/40 transition-colors ${
                            detailCity === c ? "bg-primary/5" : ""
                          }`}
                          onClick={() => setDetailCity(c)}
                        >
                          <td className="px-3 py-1.5 font-medium">{c}</td>
                          <td
                            className={`text-center px-2 py-1.5 font-semibold ${
                              (m.shortage ?? 0) > 0 ? "text-red-600" : "text-emerald-700"
                            }`}
                          >
                            {m.available}
                          </td>
                          <td className="text-center px-2 py-1.5 text-muted-foreground">{m.bookings}</td>
                          <td className="text-center px-2 py-1.5 text-muted-foreground">{m.pickups}</td>
                          <td className="text-center px-2 py-1.5 text-muted-foreground">{m.returns}</td>
                          <td className="text-center px-2 py-1.5 text-amber-600">{m.pending}</td>
                          <td className="text-center px-2 py-1.5">
                            {(m.shortage ?? 0) > 0 ? (
                              <span className="inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-sm w-4 h-4">
                                {m.shortage}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!detailCity && (
              <p className="text-xs text-muted-foreground text-center py-1">
                Select a region above to load full vehicle and booking detail.
              </p>
            )}

            {detailCity && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Detail for: {detailCity}
              </p>
            )}
          </div>
        )}

        {/* ── Detail body — only rendered after detailCity is explicitly set ── */}
        {detailCity !== null && (
          <>
            {isLoading && (
              <div className="space-y-2 py-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            )}
            {error && (
              <p className="text-sm text-destructive py-4">
                Failed to load detail: {(error as Error).message}
              </p>
            )}

            {data && (
              <div className="space-y-4 text-sm">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/40 border border-border/50">
                  <div>
                    <span className="text-muted-foreground text-xs">Day start</span>
                    <p className="font-mono text-xs">{fmt(data.startOfDay)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Day end</span>
                    <p className="font-mono text-xs">{fmt(data.endOfDay)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Supply (projected)</span>
                    <p className="font-semibold">{data.supply}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Unassigned demand</span>
                    <p className="font-semibold">{data.unassignedDemand}</p>
                  </div>
                </div>

                {data.availableVehicles.length > 0 && (
                  <VehicleSection
                    title="Available Vehicles"
                    vehicles={data.availableVehicles}
                    badge="bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                  />
                )}
                {data.assignedVehicles.length > 0 && (
                  <VehicleSection
                    title="Assigned Vehicles"
                    vehicles={data.assignedVehicles}
                    badge="bg-blue-500/15 text-blue-700 border-blue-500/30"
                  />
                )}
                {data.overdueVehicles.length > 0 && (
                  <VehicleSection
                    title="Overdue Vehicles"
                    vehicles={data.overdueVehicles}
                    badge="bg-red-500/15 text-red-700 border-red-500/30"
                  />
                )}
                {data.excludedVehicles.length > 0 && (
                  <VehicleSection
                    title="Operationally Excluded"
                    vehicles={data.excludedVehicles}
                    badge="bg-slate-500/15 text-slate-600 border-slate-500/30"
                  />
                )}
                {data.pickups.length > 0 && (
                  <BookingSection title="Pickups" bookings={data.pickups} fmt={fmt} />
                )}
                {data.returns.length > 0 && (
                  <BookingSection title="Returns" bookings={data.returns} fmt={fmt} />
                )}
                {data.pendingBookings.length > 0 && (
                  <BookingSection
                    title="Pending Bookings"
                    bookings={data.pendingBookings}
                    fmt={fmt}
                  />
                )}
                {data.availableVehicles.length === 0 &&
                  data.assignedVehicles.length === 0 &&
                  data.overdueVehicles.length === 0 &&
                  data.excludedVehicles.length === 0 &&
                  data.pickups.length === 0 &&
                  data.returns.length === 0 &&
                  data.pendingBookings.length === 0 && (
                    <p className="text-muted-foreground text-center py-4">
                      No activity for this cell.
                    </p>
                  )}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VehicleSection({
  title,
  vehicles,
  badge,
}: {
  title: string;
  vehicles: VehicleEntry[];
  badge: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        {title} ({vehicles.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {vehicles.map((v) => (
          <span
            key={v.id}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${badge}`}
          >
            <span className="font-mono">#{v.id}</span>
            {v.status && (
              <span className="opacity-70">{v.status}</span>
            )}
            {v.city && <span className="opacity-60">{v.city}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function BookingSection({
  title,
  bookings,
  fmt,
}: {
  title: string;
  bookings: BookingEntry[];
  fmt: (s: string) => string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        {title} ({bookings.length})
      </p>
      <div className="space-y-1">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="flex flex-wrap items-center gap-2 text-xs bg-muted/30 border border-border/40 rounded px-2 py-1.5"
          >
            <span className="font-mono font-semibold">#{b.id}</span>
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4 font-medium"
            >
              {b.status}
            </Badge>
            {b.vehicleId && (
              <span className="text-muted-foreground">
                Veh #{b.vehicleId}
              </span>
            )}
            <span className="text-muted-foreground">
              {fmt(b.pickupDatetime)} → {fmt(b.dropoffDatetime)}
            </span>
            {b.dropoffCity && b.dropoffCity !== b.pickupCity && (
              <span className="text-muted-foreground">
                {b.pickupCity} → {b.dropoffCity}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Subcomponent: Manage Groups Dialog ───────────────────────────────────────

function ManageGroupsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  // Groups list
  const { data: groupsData, isLoading: groupsLoading } = useQuery<{
    groups: GroupRecord[];
  }>({
    queryKey: ["availability-groups"],
    queryFn: () => apiFetch<{ groups: GroupRecord[] }>("/api/admin/availability-groups"),
    enabled: open,
    staleTime: 10_000,
  });

  // All vehicle models (for model picker)
  const { data: allModels } = useQuery<VehicleModel[]>({
    queryKey: ["availability-fleet-models"],
    queryFn: async () => {
      const raw = await apiFetch<FleetModelRaw[]>("/api/admin/fleet/models");
      return raw.map((m) => ({
        id: m.id,
        name: m.name,
        brandName:
          m.brandName ??
          (typeof m.brand === "object" && m.brand !== null
            ? (m.brand as { name?: string }).name ?? ""
            : typeof m.brand === "string"
              ? m.brand
              : ""),
      }));
    },
    enabled: open,
    staleTime: 60_000,
  });

  const groups = useMemo(
    () => [...(groupsData?.groups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [groupsData],
  );

  // Build a map: modelId → group name (for conflict detection)
  const modelToGroup = useMemo(() => {
    const m = new Map<number, { groupId: number; groupName: string }>();
    for (const g of groups) {
      for (const mid of g.modelIds) {
        m.set(mid, { groupId: g.id, groupName: g.name });
      }
    }
    return m;
  }, [groups]);

  // Editing state
  const [editingGroup, setEditingGroup] = useState<GroupRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; sortOrder: number }) =>
      apiFetch("/api/admin/availability-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["availability-groups"] });
      qc.invalidateQueries({ queryKey: ["availability-calendar"] });
      setCreateOpen(false);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<GroupRecord> }) =>
      apiFetch(`/api/admin/availability-groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["availability-groups"] });
      qc.invalidateQueries({ queryKey: ["availability-calendar"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/availability-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["availability-groups"] });
      qc.invalidateQueries({ queryKey: ["availability-calendar"] });
      setDeleteConfirmId(null);
    },
  });

  // Move-model mutation
  const moveModelMutation = useMutation({
    mutationFn: (data: { vehicleModelId: number; targetGroupId: number }) =>
      apiFetch("/api/admin/availability-groups/move-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["availability-groups"] });
      qc.invalidateQueries({ queryKey: ["availability-calendar"] });
    },
  });

  // Sort order helpers
  const handleMoveUp = (group: GroupRecord) => {
    const idx = groups.findIndex((g) => g.id === group.id);
    if (idx <= 0) return;
    const swapWith = groups[idx - 1];
    updateMutation.mutate({ id: group.id, data: { sortOrder: swapWith.sortOrder } });
    updateMutation.mutate({ id: swapWith.id, data: { sortOrder: group.sortOrder } });
  };

  const handleMoveDown = (group: GroupRecord) => {
    const idx = groups.findIndex((g) => g.id === group.id);
    if (idx >= groups.length - 1) return;
    const swapWith = groups[idx + 1];
    updateMutation.mutate({ id: group.id, data: { sortOrder: swapWith.sortOrder } });
    updateMutation.mutate({ id: swapWith.id, data: { sortOrder: group.sortOrder } });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Manage Availability Groups
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Create button */}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                New Group
              </Button>
            </div>

            {groupsLoading && (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )}

            {!groupsLoading && groups.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No groups yet. Create one to get started.
              </p>
            )}

            {groups.map((group, idx) => (
              <div
                key={group.id}
                className="border border-border/50 rounded-lg p-3 space-y-2 bg-card/40"
              >
                <div className="flex items-center gap-2">
                  {/* Sort controls */}
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleMoveUp(group)}
                      disabled={idx === 0 || updateMutation.isPending}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleMoveDown(group)}
                      disabled={idx === groups.length - 1 || updateMutation.isPending}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Group info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{group.name}</span>
                      <Badge
                        variant={group.isActive ? "secondary" : "outline"}
                        className="text-[10px] h-4 px-1.5"
                      >
                        {group.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {group.modelIds.length} model{group.modelIds.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        updateMutation.mutate({
                          id: group.id,
                          data: { isActive: !group.isActive },
                        })
                      }
                      disabled={updateMutation.isPending}
                    >
                      {group.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setEditingGroup(group)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(group.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Model IDs summary */}
                {group.modelIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-9">
                    {group.modelIds.map((mid) => {
                      const model = allModels?.find((m) => m.id === mid);
                      return (
                        <span
                          key={mid}
                          className="text-[10px] bg-muted/60 border border-border/40 rounded px-1.5 py-0.5 text-muted-foreground font-mono"
                        >
                          {model
                            ? `${model.brandName ? model.brandName + " " : ""}${model.name}`
                            : `Model #${mid}`}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Group Dialog */}
      {createOpen && (
        <CreateGroupDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          defaultSortOrder={groups.length}
          onSubmit={(data) => createMutation.mutate(data)}
          isSubmitting={createMutation.isPending}
        />
      )}

      {/* Edit Group Dialog */}
      {editingGroup && (
        <EditGroupDialog
          open={!!editingGroup}
          group={editingGroup}
          allModels={allModels ?? []}
          modelToGroup={modelToGroup}
          onClose={() => setEditingGroup(null)}
          onUpdate={(data) =>
            updateMutation.mutate({ id: editingGroup.id, data }, {
              onSuccess: () => setEditingGroup(null),
            })
          }
          onMoveModel={(vehicleModelId) =>
            moveModelMutation.mutate({
              vehicleModelId,
              targetGroupId: editingGroup.id,
            })
          }
          isMutating={updateMutation.isPending || moveModelMutation.isPending}
        />
      )}

      {/* Delete Confirm Dialog */}
      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={(v) => !v && setDeleteConfirmId(null)}
      >
        <DialogContent className="max-w-sm bg-background">
          <DialogHeader>
            <DialogTitle>Delete group?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the group and its model assignments. Vehicle models and
            operational data are not affected.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() =>
                deleteConfirmId !== null && deleteMutation.mutate(deleteConfirmId)
              }
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateGroupDialog({
  open,
  onClose,
  defaultSortOrder,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  defaultSortOrder: number;
  onSubmit: (data: { name: string; sortOrder: number }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(defaultSortOrder);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm bg-background">
        <DialogHeader>
          <DialogTitle>New Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Group name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Economy"
              className="h-8 mt-1 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Sort order</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              className="h-8 mt-1 text-sm w-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || isSubmitting}
            onClick={() => onSubmit({ name: name.trim(), sortOrder })}
          >
            {isSubmitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditGroupDialog({
  open,
  group,
  allModels,
  modelToGroup,
  onClose,
  onUpdate,
  onMoveModel,
  isMutating,
}: {
  open: boolean;
  group: GroupRecord;
  allModels: VehicleModel[];
  modelToGroup: Map<number, { groupId: number; groupName: string }>;
  onClose: () => void;
  onUpdate: (data: Partial<GroupRecord>) => void;
  onMoveModel: (vehicleModelId: number) => void;
  isMutating: boolean;
}) {
  const [name, setName] = useState(group.name);
  const [sortOrder, setSortOrder] = useState(group.sortOrder);
  const [modelSearch, setModelSearch] = useState("");
  const [pendingMoveModel, setPendingMoveModel] = useState<VehicleModel | null>(null);

  // Models not yet in this group
  const assignedHere = new Set(group.modelIds);

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    return allModels.filter((m) => {
      if (assignedHere.has(m.id)) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.brandName.toLowerCase().includes(q) ||
        String(m.id).includes(q)
      );
    });
  }, [allModels, modelSearch, group.modelIds]);

  const handleAddModel = (model: VehicleModel) => {
    const existing = modelToGroup.get(model.id);
    if (existing && existing.groupId !== group.id) {
      // Show move confirmation
      setPendingMoveModel(model);
    } else {
      onMoveModel(model.id);
      setModelSearch("");
    }
  };

  const confirmMove = () => {
    if (!pendingMoveModel) return;
    onMoveModel(pendingMoveModel.id);
    setPendingMoveModel(null);
    setModelSearch("");
  };

  return (
    <>
      <Dialog open={open && !pendingMoveModel} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle>Edit Group: {group.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Name + sort order */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 mt-1 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Sort order</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="h-8 mt-1 text-sm"
                />
              </div>
            </div>

            <Button
              size="sm"
              variant="secondary"
              disabled={isMutating || (!name.trim() || (name.trim() === group.name && sortOrder === group.sortOrder))}
              onClick={() =>
                onUpdate({ name: name.trim(), sortOrder })
              }
            >
              Save changes
            </Button>

            {/* Model assignment */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Vehicle Models in this group ({group.modelIds.length})
              </p>

              {/* Currently assigned models */}
              {group.modelIds.length === 0 && (
                <p className="text-xs text-muted-foreground mb-2">No models assigned yet.</p>
              )}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {group.modelIds.map((mid) => {
                  const model = allModels.find((m) => m.id === mid);
                  const label = model
                    ? `${model.brandName ? model.brandName + " " : ""}${model.name}`
                    : `#${mid}`;
                  return (
                    <span
                      key={mid}
                      className="inline-flex items-center gap-1 text-xs bg-muted/60 border border-border/50 rounded px-2 py-0.5"
                    >
                      {label}
                    </span>
                  );
                })}
              </div>

              {/* Add model */}
              <p className="text-xs font-medium mb-1.5">Add model via move</p>
              <Input
                placeholder="Search models…"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                className="h-8 text-sm mb-2"
              />
              {modelSearch.trim() && (
                <div className="max-h-40 overflow-y-auto border border-border/50 rounded-lg divide-y divide-border/30 bg-card/40">
                  {filteredModels.slice(0, 12).map((m) => {
                    const existing = modelToGroup.get(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between gap-2"
                        onClick={() => handleAddModel(m)}
                        disabled={isMutating}
                      >
                        <span>
                          {m.brandName && (
                            <span className="text-muted-foreground">{m.brandName} </span>
                          )}
                          {m.name}
                        </span>
                        {existing && (
                          <span className="text-muted-foreground text-[10px] shrink-0">
                            Currently in {existing.groupName}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {filteredModels.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      No matching models
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move confirmation */}
      <Dialog
        open={!!pendingMoveModel}
        onOpenChange={(v) => !v && setPendingMoveModel(null)}
      >
        <DialogContent className="max-w-sm bg-background">
          <DialogHeader>
            <DialogTitle>Move model?</DialogTitle>
          </DialogHeader>
          {pendingMoveModel && (
            <p className="text-sm text-muted-foreground">
              {pendingMoveModel.brandName
                ? `${pendingMoveModel.brandName} ${pendingMoveModel.name}`
                : pendingMoveModel.name}{" "}
              is currently in{" "}
              <strong>{modelToGroup.get(pendingMoveModel.id)?.groupName}</strong>.
              Move it to <strong>{group.name}</strong>?
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPendingMoveModel(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={isMutating} onClick={confirmMove}>
              {isMutating ? "Moving…" : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Subcomponent: Grid Cell ──────────────────────────────────────────────────

function GridCell({
  metrics,
  isToday,
  clickable,
  onClick,
}: {
  metrics: DayMetrics;
  isToday: boolean;
  clickable: boolean;
  onClick: () => void;
}) {
  const hasShortage = metrics.shortage > 0;

  return (
    <td
      className={[
        "px-1.5 py-1 text-center align-top border-r border-border/20 min-w-[72px] w-[72px]",
        isToday ? "bg-primary/5" : "",
        clickable ? "cursor-pointer hover:bg-muted/40 transition-colors" : "cursor-default",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={clickable ? onClick : undefined}
    >
      <div className="space-y-0.5 text-[11px]">
        <div className="flex items-center justify-center gap-0.5">
          {hasShortage && (
            <span className="inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-sm w-4 h-4 shrink-0">
              {metrics.shortage}
            </span>
          )}
          <span className={`font-semibold ${hasShortage ? "text-red-600" : "text-emerald-700"}`}>
            {metrics.available}
          </span>
        </div>
        <div className="text-muted-foreground leading-tight">
          {metrics.bookings > 0 && <span className="block">B:{metrics.bookings}</span>}
          {metrics.pickups > 0 && <span className="block">↑{metrics.pickups}</span>}
          {metrics.returns > 0 && <span className="block">↓{metrics.returns}</span>}
          {metrics.pending > 0 && (
            <span className="block text-amber-600">P:{metrics.pending}</span>
          )}
        </div>
      </div>
    </td>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AvailabilityCalendar() {
  const todayStr = tbilisiTodayStr();
  const [city, setCity] = useState<City>("Tbilisi");
  const [rangeSize, setRangeSize] = useState<RangeSize>(30);
  const [rangeStart, setRangeStart] = useState(todayStr);

  const rangeEnd = addDaysStr(rangeStart, rangeSize - 1);
  const dates = useMemo(
    () => generateDates(rangeStart, rangeSize),
    [rangeStart, rangeSize],
  );

  // Detail cell selection — mainCity may be "All"; byCityMetrics holds per-city
  // metrics from the already-loaded calendar response for the All-region summary.
  const [selectedCell, setSelectedCell] = useState<{
    groupId: number;
    groupName: string;
    date: string;
    mainCity: City;
    byCityMetrics: Record<string, DayMetrics> | null;
  } | null>(null);
  const [manageGroupsOpen, setManageGroupsOpen] = useState(false);

  // Navigation
  const goBack = () => setRangeStart((s) => addDaysStr(s, -rangeSize));
  const goForward = () => setRangeStart((s) => addDaysStr(s, rangeSize));
  const goToday = () => setRangeStart(todayStr);

  // Calendar query
  const { data, isLoading, error } = useQuery<CalendarResponse>({
    queryKey: ["availability-calendar", city, rangeStart, rangeEnd],
    queryFn: () =>
      apiFetch<CalendarResponse>(
        `/api/admin/availability-calendar?city=${encodeURIComponent(city)}&startDate=${rangeStart}&endDate=${rangeEnd}`,
      ),
    staleTime: 30_000,
  });

  const handleCellClick = (group: AvailGroup, date: string) => {
    // Extract per-city metrics from the already-loaded byCity data when city="All".
    // No Tbilisi default — the detail dialog requires an explicit region selection.
    let byCityMetrics: Record<string, DayMetrics> | null = null;
    if (city === "All" && data?.byCity) {
      byCityMetrics = {};
      for (const [cityName, cityGroups] of Object.entries(data.byCity)) {
        const cityGroup = cityGroups.find((g) => g.id === group.id);
        if (cityGroup?.days[date]) {
          byCityMetrics[cityName] = cityGroup.days[date];
        }
      }
    }
    setSelectedCell({ groupId: group.id, groupName: group.name, date, mainCity: city, byCityMetrics });
  };

  const formatRangeLabel = () => {
    const s = parseDateStr(rangeStart);
    const e = parseDateStr(rangeEnd);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
      return `${months[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}, ${s.getUTCFullYear()}`;
    }
    return `${months[s.getUTCMonth()]} ${s.getUTCDate()} – ${months[e.getUTCMonth()]} ${e.getUTCDate()}, ${e.getUTCFullYear()}`;
  };

  return (
    <div className="flex flex-col gap-3 animate-in fade-in duration-500">
      {/* ── Header ── */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <ChartBar className="w-6 h-6 text-primary" /> Availability Calendar
          </h2>
          <p className="text-muted-foreground text-sm">
            Fleet capacity by group — read-only planning view
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* City */}
          <Select value={city} onValueChange={(v) => setCity(v as City)}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <MapPin className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Tbilisi">Tbilisi</SelectItem>
              <SelectItem value="Kutaisi">Kutaisi</SelectItem>
              <SelectItem value="Batumi">Batumi</SelectItem>
              <SelectItem value="All">All</SelectItem>
            </SelectContent>
          </Select>

          {/* Range */}
          <Select
            value={String(rangeSize)}
            onValueChange={(v) => setRangeSize(Number(v) as RangeSize)}
          >
            <SelectTrigger className="w-[100px] h-9 text-sm">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
            </SelectContent>
          </Select>

          {/* Navigation */}
          <div className="flex items-center gap-1 border border-border/50 rounded-lg p-0.5 bg-card/60">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs font-medium min-w-[140px]"
              onClick={goToday}
            >
              {formatRangeLabel()}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goForward}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm"
            onClick={goToday}
          >
            Today
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-9 text-sm gap-1.5"
            onClick={() => setManageGroupsOpen(true)}
          >
            <Settings className="w-3.5 h-3.5" />
            Manage Groups
          </Button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-2 items-center text-[11px]">
        <span className="text-muted-foreground font-medium">Cell:</span>
        <span className="text-emerald-700 font-semibold">N</span>
        <span className="text-muted-foreground">= Available</span>
        <span className="mx-1 text-muted-foreground">·</span>
        <span className="text-muted-foreground">B:N = Bookings active</span>
        <span className="mx-1 text-muted-foreground">·</span>
        <span className="text-muted-foreground">↑ = Pickups · ↓ = Returns</span>
        <span className="mx-1 text-muted-foreground">·</span>
        <span className="text-amber-600">P:N = Pending</span>
        <span className="mx-1 text-muted-foreground">·</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-sm w-4 h-4">N</span>
          <span className="text-muted-foreground">= Shortage</span>
        </span>
        {city === "All" && (
          <>
            <span className="mx-1 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Click cell → select region for detail</span>
          </>
        )}
      </div>

      {/* ── Unclassified warning ── */}
      {data && data.unclassifiedVehicleCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {data.unclassifiedVehicleCount} vehicle
            {data.unclassifiedVehicleCount !== 1 ? "s have" : " has"} unrecognised or missing
            location cities and{" "}
            {data.unclassifiedVehicleCount !== 1 ? "are" : "is"} excluded from capacity
            totals.
          </span>
        </div>
      )}

      {/* ── Grid ── */}
      <Card className="overflow-hidden">
        {isLoading && (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="flex items-center gap-2 text-sm text-destructive p-6">
            <TriangleAlert className="w-4 h-4 shrink-0" />
            <span>
              Failed to load calendar:{" "}
              {(error as Error).message ?? "Unknown error"}
            </span>
          </div>
        )}

        {!isLoading && !error && data && data.groups.length === 0 && (
          <div className="text-center text-muted-foreground py-16 text-sm">
            No active groups configured — open{" "}
            <button
              className="underline hover:text-foreground"
              onClick={() => setManageGroupsOpen(true)}
            >
              Manage Groups
            </button>{" "}
            to get started.
          </div>
        )}

        {!isLoading && !error && data && data.groups.length > 0 && (
          <div className="overflow-x-auto">
            <table className="border-collapse text-sm w-full">
              <thead>
                <tr className="bg-muted/40 border-b border-border/50">
                  {/* Sticky group column header */}
                  <th className="sticky left-0 z-10 bg-muted/60 border-r border-border/50 px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-[160px] min-w-[160px]">
                    Group
                  </th>
                  {dates.map((d) => {
                    const { weekday, day } = formatDateHeader(d);
                    const isToday = d === todayStr;
                    const weekend = isWeekend(d);
                    return (
                      <th
                        key={d}
                        className={[
                          "px-1.5 py-1.5 text-center min-w-[72px] w-[72px] border-r border-border/20",
                          isToday ? "bg-primary/10 text-primary" : "",
                          weekend && !isToday ? "text-muted-foreground/60" : "text-muted-foreground",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <div className="text-[10px] leading-none">{weekday}</div>
                        <div
                          className={`text-xs font-semibold mt-0.5 ${isToday ? "text-primary" : ""}`}
                        >
                          {day}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.groups.map((group, gi) => (
                  <tr
                    key={group.id}
                    className={`border-b border-border/20 ${gi % 2 === 0 ? "bg-background" : "bg-muted/10"}`}
                  >
                    {/* Sticky group name */}
                    <td
                      className={`sticky left-0 z-10 border-r border-border/50 px-3 py-2 min-w-[160px] w-[160px] ${gi % 2 === 0 ? "bg-background" : "bg-muted/10"}`}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="truncate">
                            <span className="text-xs font-medium text-foreground">
                              {group.name}
                            </span>
                            {!group.isActive && (
                              <Badge
                                variant="outline"
                                className="ml-1 text-[9px] h-3.5 px-1 py-0"
                              >
                                Inactive
                              </Badge>
                            )}
                            <div className="text-[10px] text-muted-foreground">
                              {group.modelIds.length} model
                              {group.modelIds.length !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-xs font-medium">{group.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.modelIds.length} vehicle model
                            {group.modelIds.length !== 1 ? "s" : ""}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    {/* Date cells */}
                    {dates.map((d) => {
                      const metrics = group.days[d] ?? {
                        available: 0,
                        availableEndOfDay: 0,
                        occupiedEndOfDay: 0,
                        bookings: 0,
                        bookingsOverlappingDay: 0,
                        pickups: 0,
                        returns: 0,
                        pending: 0,
                        shortage: 0,
                      };
                      return (
                        <GridCell
                          key={d}
                          metrics={metrics}
                          isToday={d === todayStr}
                          clickable
                          onClick={() => handleCellClick(group, d)}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Cell detail dialog ── */}
      {selectedCell && (
        <CellDetailDialog
          groupId={selectedCell.groupId}
          groupName={selectedCell.groupName}
          date={selectedCell.date}
          mainCity={selectedCell.mainCity}
          byCityMetrics={selectedCell.byCityMetrics}
          open={!!selectedCell}
          onClose={() => setSelectedCell(null)}
        />
      )}

      {/* ── Manage Groups dialog ── */}
      <ManageGroupsDialog
        open={manageGroupsOpen}
        onClose={() => setManageGroupsOpen(false)}
      />
    </div>
  );
}
