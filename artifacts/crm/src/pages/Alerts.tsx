import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bell, AlertTriangle, Clock, CalendarClock, RefreshCw,
  ArrowDownToLine, ArrowUpFromLine, Wrench, GitFork,
  ExternalLink, Filter, Car, ParkingCircle, CreditCard
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertType = "all" | "PICKUP_TODAY" | "DROPOFF_TODAY" | "OVERDUE" | "DELIVERED_NO_PAYMENT" | "CONFLICT" | "PARKING_OVERFLOW" | "SERVICE_OVERDUE" | "SERVICE_DUE" | "SERVICE_WARNING";

interface Alert {
  id: string;
  alertType: string;
  vehicleId: number | null;
  bookingId: number | null;
  serviceId?: number;
  vehicleLabel: string;
  region: string;
  customer: string | null;
  daysOverdue?: number;
  message: string;
  eventDatetime: string;
  generatedAt: string;
}

interface AlertMeta {
  alertTypes: string[];
  regions: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Alert type config ─────────────────────────────────────────────────────────

const ALERT_CONFIG: Record<string, {
  label: string;
  icon: React.ReactNode;
  badge: string;
  row: string;
  priority: number;
}> = {
  PICKUP_TODAY: {
    label: "Pickup Today",
    icon: <ArrowUpFromLine className="w-3.5 h-3.5" />,
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    row: "border-l-2 border-l-blue-500/50",
    priority: 4,
  },
  DROPOFF_TODAY: {
    label: "Dropoff Today",
    icon: <ArrowDownToLine className="w-3.5 h-3.5" />,
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    row: "border-l-2 border-l-emerald-500/50",
    priority: 3,
  },
  OVERDUE: {
    label: "Overdue Return",
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    row: "border-l-2 border-l-red-500/60",
    priority: 0,
  },
  DELIVERED_NO_PAYMENT: {
    label: "Delivered bookings without payment record",
    icon: <CreditCard className="w-3.5 h-3.5" />,
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    row: "border-l-2 border-l-red-500/60",
    priority: 1,
  },
  CONFLICT: {
    label: "Booking Conflict",
    icon: <GitFork className="w-3.5 h-3.5" />,
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    row: "border-l-2 border-l-orange-500/60",
    priority: 1,
  },
  PARKING_OVERFLOW: {
    label: "Parking Overflow",
    icon: <ParkingCircle className="w-3.5 h-3.5" />,
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    row: "border-l-2 border-l-orange-400/60",
    priority: 1,
  },
  SERVICE_OVERDUE: {
    label: "Svc Overdue",
    icon: <Wrench className="w-3.5 h-3.5" />,
    badge: "bg-red-500/15 text-red-400 border-red-500/30",
    row: "border-l-2 border-l-red-500/60",
    priority: 2,
  },
  SERVICE_DUE: {
    label: "Service Due",
    icon: <Wrench className="w-3.5 h-3.5" />,
    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    row: "border-l-2 border-l-orange-500/60",
    priority: 3,
  },
  SERVICE_WARNING: {
    label: "Svc Warning",
    icon: <Wrench className="w-3.5 h-3.5" />,
    badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    row: "border-l-2 border-l-yellow-500/50",
    priority: 4,
  },
};

function AlertTypeBadge({ type }: { type: string }) {
  const cfg = ALERT_CONFIG[type];
  if (!cfg) return <Badge variant="outline">{type}</Badge>;
  return (
    <Badge variant="outline" className={`text-[10px] flex items-center gap-1 ${cfg.badge}`}>
      {cfg.icon} {cfg.label}
    </Badge>
  );
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ── Summary cards ─────────────────────────────────────────────────────────────

interface Summary {
  total: number;
  pickup: number;
  dropoff: number;
  overdue: number;
  deliveredNoPayment: number;
  conflict: number;
  service: number;
  serviceWarning: number;
  serviceDue: number;
  serviceOverdue: number;
  parkingOverflow: number;
}

function SummaryCards({ summary, onFilter }: { summary: Summary; onFilter: (t: AlertType) => void }) {
  const tiles = [
    { key: "OVERDUE" as AlertType, label: "Overdue Return", count: summary.overdue, cls: "border-red-500/30 bg-red-500/5 text-red-400", icon: <AlertTriangle className="w-5 h-5" /> },
    { key: "DELIVERED_NO_PAYMENT" as AlertType, label: "Delivered bookings without payment record", count: summary.deliveredNoPayment ?? 0, cls: "border-red-500/30 bg-red-500/5 text-red-400", icon: <CreditCard className="w-5 h-5" /> },
    { key: "CONFLICT" as AlertType, label: "Conflicts", count: summary.conflict, cls: "border-orange-500/30 bg-orange-500/5 text-orange-400", icon: <GitFork className="w-5 h-5" /> },
    { key: "PARKING_OVERFLOW" as AlertType, label: "Parking Over", count: summary.parkingOverflow ?? 0, cls: "border-orange-500/30 bg-orange-500/5 text-orange-400", icon: <ParkingCircle className="w-5 h-5" /> },
    { key: "SERVICE_OVERDUE" as AlertType, label: "Svc Overdue", count: summary.serviceOverdue ?? 0, cls: "border-red-500/20 bg-red-500/5 text-red-400", icon: <Wrench className="w-5 h-5" /> },
    { key: "SERVICE_DUE" as AlertType, label: "Service Due", count: summary.serviceDue ?? 0, cls: "border-orange-500/20 bg-orange-500/5 text-orange-400", icon: <Wrench className="w-5 h-5" /> },
    { key: "SERVICE_WARNING" as AlertType, label: "Svc Warning", count: summary.serviceWarning ?? 0, cls: "border-yellow-500/30 bg-yellow-500/5 text-yellow-400", icon: <Wrench className="w-5 h-5" /> },
    { key: "DROPOFF_TODAY" as AlertType, label: "Dropoffs Today", count: summary.dropoff, cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400", icon: <ArrowDownToLine className="w-5 h-5" /> },
    { key: "PICKUP_TODAY" as AlertType, label: "Pickups Today", count: summary.pickup, cls: "border-blue-500/30 bg-blue-500/5 text-blue-400", icon: <ArrowUpFromLine className="w-5 h-5" /> },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-9 gap-3">
      {tiles.map((t) => (
        <button
          key={t.key}
          onClick={() => onFilter(t.key)}
          className={`rounded-xl border p-4 flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-all ${t.cls}`}
        >
          {t.icon}
          <div className="text-3xl font-black font-display">{t.count}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{t.label}</div>
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [, navigate] = useLocation();
  const [typeFilter, setTypeFilter] = useState<AlertType>("all");
  const [regionFilter, setRegionFilter] = useState("all");

  // Build query URL
  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (typeFilter !== "all") p.set("type", typeFilter);
    if (regionFilter !== "all") p.set("region", regionFilter);
    return p.toString();
  }, [typeFilter, regionFilter]);

  const { data: alerts = [], isLoading, error, refetch, dataUpdatedAt } = useQuery<Alert[]>({
    queryKey: ["alerts", queryParams],
    queryFn: () => apiFetch(`/api/admin/alerts${queryParams ? "?" + queryParams : ""}`),
    refetchInterval: 60_000, // auto-refresh every 60s
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["alerts-summary"],
    queryFn: () => apiFetch("/api/admin/alerts/summary"),
    refetchInterval: 60_000,
  });

  const { data: meta } = useQuery<AlertMeta>({
    queryKey: ["alerts-meta"],
    queryFn: () => apiFetch("/api/admin/alerts/meta"),
  });

  const lastRefresh = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

  function handleAlertClick(alert: Alert) {
    const isServiceAlert = alert.alertType === "SERVICE_DUE" || alert.alertType === "SERVICE_WARNING" || alert.alertType === "SERVICE_OVERDUE";
    if (isServiceAlert && alert.vehicleId) {
      navigate("/fleet");
    } else if (alert.bookingId) {
      navigate(`/bookings?open=${alert.bookingId}`);
    }
  }

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" /> Operational Alerts
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Live operational warnings · Last updated {lastRefresh}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 h-8" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Summary tiles */}
      {summary && (
        <SummaryCards
          summary={summary}
          onFilter={(t) => setTypeFilter(t === typeFilter ? "all" : t)}
        />
      )}

      {/* Filter bar */}
      <Card className="border-border/40 bg-card/60">
        <CardContent className="px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Filter className="w-4 h-4 text-primary" /> Filters
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Alert Type</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AlertType)}>
                <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {meta?.alertTypes.map((t) => (
                    <SelectItem key={t} value={t}>{ALERT_CONFIG[t]?.label ?? t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Region</Label>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  {meta?.regions.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(typeFilter !== "all" || regionFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => { setTypeFilter("all"); setRegionFilter("all"); }}
              >
                Clear filters
              </Button>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts table */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-destructive gap-2">
            <AlertTriangle className="w-5 h-5" /> Failed to load alerts
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
            <Bell className="w-12 h-12 opacity-15" />
            <div className="text-center">
              <p className="text-sm font-medium">No alerts</p>
              <p className="text-xs opacity-70 mt-1">All operations are running normally</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="text-xs w-40">Type</TableHead>
                  <TableHead className="text-xs">Vehicle</TableHead>
                  <TableHead className="text-xs">Message</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Region</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => {
                  const cfg = ALERT_CONFIG[alert.alertType];
                  const isClickable = !!(alert.bookingId || alert.vehicleId);
                  return (
                    <TableRow
                      key={alert.id}
                      className={`border-border/20 hover:bg-muted/20 transition-colors ${cfg?.row ?? ""} ${isClickable ? "cursor-pointer" : ""}`}
                      onClick={() => isClickable && handleAlertClick(alert)}
                    >
                      <TableCell className="py-3">
                        <AlertTypeBadge type={alert.alertType} />
                      </TableCell>
                      <TableCell className="text-sm font-medium py-3">
                        <div className="flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span>{alert.vehicleLabel}</span>
                        </div>
                        {alert.alertType === "OVERDUE" && alert.daysOverdue != null && alert.daysOverdue > 0 && (
                          <div className="text-[10px] text-red-400 font-bold mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {alert.daysOverdue} day{alert.daysOverdue !== 1 ? "s" : ""} overdue
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground py-3 max-w-xs">
                        {alert.message}
                      </TableCell>
                      <TableCell className="text-xs py-3">
                        {alert.customer || <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="text-xs py-3 text-muted-foreground">
                        {alert.region}
                      </TableCell>
                      <TableCell className="text-xs py-3 text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <CalendarClock className="w-3 h-3 opacity-50" />
                          {formatTime(alert.eventDatetime)}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        {isClickable && (
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 hover:text-primary transition-colors" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
