import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatMoney, formatBookingAmount, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CalendarClock, Car, ArrowRightLeft, CreditCard,
  PlayCircle, CheckCircle2, Flag, RotateCcw,
  XCircle, UserX, AlertCircle, MapPin, Calendar,
  Bell, AlertTriangle, GitFork, Wrench, ArrowUpFromLine, ArrowDownToLine,
  Settings2, Info, RotateCw,
} from "lucide-react";
import { Link } from "wouter";
import BookingDetail from "./BookingDetail";

// ─── Types ────────────────────────────────────────────────────────────────────

type Region = "All" | "Tbilisi" | "Kutaisi" | "Batumi";

interface DashboardSummary {
  total: number;
  pending: number;
  confirmed: number;
  delivered: number;
  returned: number;
  canceled: number;
  noShow: number;
  totalRevenue: string;
}

interface BookingRow {
  id: number;
  status: string;
  paymentStatus: string;
  contactFullName: string;
  contactPhone: string | null;
  pickupDatetime: string;
  dropoffDatetime: string;
  totalAmount: string | null;
  currency: string | null;
  customer: { id: number; fullName: string | null; email: string | null; phone?: string | null };
  vehicle: { id: number; licensePlate: string | null; modelName: string | null } | null;
  pickupLocation: { id: number; name: string };
  dropoffLocation: { id: number; name: string };
  partner: { id: number; name: string } | null;
}

interface FleetSnapshot {
  available: number;
  rented: number;
  maintenance: number;
  reserved: number;
  inactive: number;
}

interface CalendarBooking {
  id: number;
  status: string;
  customerName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
}

interface CalendarVehicle {
  vehicleId: number;
  licensePlate: string | null;
  modelName: string | null;
  brandName: string | null;
  status: string | null;
  bookings: CalendarBooking[];
}

interface FleetCalendar {
  dateFrom: string;
  dateTo: string;
  vehicles: CalendarVehicle[];
}

// ─── Widget config ─────────────────────────────────────────────────────────────

interface WidgetConfig {
  sections: {
    bookingOverview: boolean;
    fleetLiveStatus: boolean;
    todaysOperations: boolean;
    fleetTimeline: boolean;
    operationalAlerts: boolean;
  };
  cards: {
    total: boolean;
    revenue: boolean;
    pending: boolean;
    confirmed: boolean;
    delivered: boolean;
    returned: boolean;
    canceled: boolean;
    noShow: boolean;
  };
}

const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  sections: {
    bookingOverview: true,
    fleetLiveStatus: true,
    todaysOperations: true,
    fleetTimeline: true,
    operationalAlerts: true,
  },
  cards: {
    total: true,
    revenue: true,
    pending: true,
    confirmed: true,
    delivered: true,
    returned: true,
    canceled: true,
    noShow: true,
  },
};

const WIDGET_STORAGE_KEY = "crm_dashboard_widgets";

function loadWidgetConfig(): WidgetConfig {
  try {
    const stored = localStorage.getItem(WIDGET_STORAGE_KEY);
    if (!stored) return DEFAULT_WIDGET_CONFIG;
    const parsed = JSON.parse(stored) as Partial<WidgetConfig>;
    return {
      sections: { ...DEFAULT_WIDGET_CONFIG.sections, ...(parsed.sections ?? {}) },
      cards: { ...DEFAULT_WIDGET_CONFIG.cards, ...(parsed.cards ?? {}) },
    };
  } catch {
    return DEFAULT_WIDGET_CONFIG;
  }
}

function saveWidgetConfig(cfg: WidgetConfig) {
  localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(cfg));
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

const BASE = "/api";
const CREDS: RequestInit = { credentials: "include" };

function buildUrl(path: string, city?: string): string {
  return city ? `${BASE}${path}?city=${encodeURIComponent(city)}` : `${BASE}${path}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, CREDS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// ─── Location short-code helper ───────────────────────────────────────────────

const LOCATION_SHORT_CODES: Record<string, string> = {
  "Tbilisi International Airport": "TBS AIR",
  "Kutaisi International Airport": "KUT AIR",
  "Batumi International Airport": "BAT AIR",
  "Tbilisi Downtown": "TBS DT",
  "Kutaisi Downtown": "KUT DT",
  "Batumi Downtown": "BAT DT",
};

function locationShortCode(name: string): string {
  if (LOCATION_SHORT_CODES[name]) return LOCATION_SHORT_CODES[name];
  // Fuzzy fallbacks — check for key words
  const n = name.toLowerCase();
  if (n.includes("tbilisi") && (n.includes("airport") || n.includes("air"))) return "TBS AIR";
  if (n.includes("kutaisi") && (n.includes("airport") || n.includes("air"))) return "KUT AIR";
  if (n.includes("batumi") && (n.includes("airport") || n.includes("air"))) return "BAT AIR";
  if (n.includes("tbilisi")) return "TBS";
  if (n.includes("kutaisi")) return "KUT";
  if (n.includes("batumi") && n.includes("hotel")) return "BAT H";
  if (n.includes("batumi")) return "BAT";
  // Generic fallback: up to 8 chars truncated
  return name.length > 8 ? name.slice(0, 8).trim() + "…" : name;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const BOOKING_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CONFIRMED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  DELIVERED: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  RETURNED: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  CANCELED: "bg-red-500/10 text-red-500 border-red-500/20",
  NO_SHOW: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-bold tracking-wider text-[10px] uppercase shadow-sm", BOOKING_STATUS_COLORS[status] || "bg-gray-500/10 text-gray-500")}
    >
      {status.replace("_", " ")}
    </Badge>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ title, value, icon: Icon, testId, isLoading, tooltip }: {
  title: string; value: string | number | undefined; icon: React.ComponentType<{ className?: string }>; testId: string; isLoading?: boolean; tooltip?: string;
}) {
  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm hover-elevate transition-all overflow-hidden relative group" data-testid={testId}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-primary/10 transition-colors" />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
        <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          {title}
          {tooltip && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
        <div className="w-8 h-8 rounded-lg bg-background/80 flex items-center justify-center border border-border/50 shadow-inner">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="relative z-10 pt-2">
        {isLoading ? (
          <Skeleton className="h-8 w-20 mt-1 rounded-md" />
        ) : (
          <div className="text-2xl font-bold font-display tracking-tight text-foreground">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Fleet Tile ───────────────────────────────────────────────────────────────

function FleetTile({ label, count, colorClass, testId, isLoading }: {
  label: string; count: number | undefined; colorClass: string; testId: string; isLoading: boolean;
}) {
  return (
    <Card className={cn("overflow-hidden border shadow-sm hover-elevate transition-all", colorClass)} data-testid={testId}>
      <div className="p-5 flex flex-col items-center justify-center gap-2 relative">
        {isLoading ? (
          <Skeleton className="h-10 w-16 bg-current opacity-20 rounded-lg" />
        ) : (
          <div className="text-4xl font-black font-display tracking-tighter drop-shadow-sm">{count ?? 0}</div>
        )}
        <div className="text-[11px] font-bold uppercase tracking-widest opacity-90">{label}</div>
      </div>
    </Card>
  );
}

// ─── Activity Table ───────────────────────────────────────────────────────────

function ActivityTable({ title, bookings, isLoading, emptyMessage, timeKey, onRowClick }: {
  title: string;
  bookings?: BookingRow[];
  isLoading: boolean;
  emptyMessage: string;
  timeKey: "pickup" | "dropoff";
  onRowClick?: (id: number) => void;
}) {
  return (
    <Card className="flex flex-col h-full border-border/40 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border/40 py-4 bg-background/50">
        <CardTitle className="text-base font-bold flex items-center gap-3 font-display">
          {title}
          <Badge variant="secondary" className="bg-primary text-primary-foreground font-bold rounded-md px-2">
            {bookings?.length ?? 0}
          </Badge>
        </CardTitle>
      </CardHeader>
      <div className="flex-1 overflow-auto bg-card/30">
        <Table>
          <TableHeader className="bg-background/80 sticky top-0 backdrop-blur-xl z-10">
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="w-[56px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ref</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Phone</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vehicle</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden xl:table-cell">Amount</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Route</TableHead>
              <TableHead className="w-[60px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="border-border/20 hover:bg-transparent">
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-14" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                  </TableRow>
                ))
              : !bookings || bookings.length === 0
              ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="text-center h-36">
                      <div className="flex flex-col items-center justify-center text-muted-foreground gap-3">
                        <CalendarClock className="w-8 h-8 opacity-20" />
                        <span className="text-sm font-medium">{emptyMessage}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              : bookings.map((b) => {
                  const dt = timeKey === "pickup" ? b.pickupDatetime : b.dropoffDatetime;
                  const phone = b.customer?.phone ?? b.contactPhone ?? null;
                  return (
                    <TableRow
                      key={b.id}
                      className={cn(
                        "border-border/20 hover:bg-muted/40 transition-colors",
                        onRowClick ? "cursor-pointer" : "cursor-default",
                      )}
                      onClick={() => onRowClick?.(b.id)}
                    >
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">#{b.id}</TableCell>
                      <TableCell className="font-semibold text-sm text-foreground">
                        {b.customer?.fullName || b.customer?.email || b.contactFullName}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">
                        {phone ?? <span className="italic opacity-50">—</span>}
                      </TableCell>
                      <TableCell>
                        {b.vehicle ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-medium text-foreground">{b.vehicle.modelName}</span>
                            <span className="text-[10px] font-mono text-muted-foreground px-1 py-0.5 bg-background border border-border/50 rounded inline-flex w-fit mt-0.5">
                              {b.vehicle.licensePlate}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-semibold text-foreground hidden xl:table-cell">
                        {b.totalAmount ? formatBookingAmount(b.totalAmount, b.currency) : <span className="opacity-40">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs font-medium">
                          <span className="text-foreground/80 font-mono font-bold">{locationShortCode(b.pickupLocation.name)}</span>
                          <ArrowRightLeft className="w-2.5 h-2.5 flex-shrink-0 text-primary/50" />
                          <span className="text-foreground/80 font-mono font-bold">{locationShortCode(b.dropoffLocation.name)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-bold text-foreground">
                        {new Date(dt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ─── Fleet Timeline ───────────────────────────────────────────────────────────

const BOOKING_BLOCK_COLORS: Record<string, string> = {
  PENDING:   "bg-amber-500/30 border-amber-500/60 text-amber-200",
  CONFIRMED: "bg-blue-500/30 border-blue-500/60 text-blue-200",
  DELIVERED: "bg-emerald-500/30 border-emerald-500/60 text-emerald-200",
  RETURNED:  "bg-slate-500/20 border-slate-500/40 text-slate-400",
  CANCELED:  "bg-red-500/20 border-red-500/40 text-red-300",
  NO_SHOW:   "bg-orange-500/20 border-orange-500/40 text-orange-300",
};

function FleetTimeline({ calendar, isLoading }: { calendar?: FleetCalendar; isLoading: boolean }) {
  const days = useMemo(() => {
    if (!calendar) return [];
    const result: Date[] = [];
    const from = new Date(calendar.dateFrom + "T00:00:00Z");
    const to = new Date(calendar.dateTo + "T00:00:00Z");
    for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
      result.push(new Date(d));
    }
    return result;
  }, [calendar]);

  const todayStr = new Date().toISOString().split("T")[0];

  if (isLoading) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border/40">
        <div className="min-w-[700px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center border-b border-border/20 last:border-b-0">
              <div className="w-44 flex-shrink-0 px-3 py-3">
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="flex-1 grid gap-1 px-2 py-2" style={{ gridTemplateColumns: `repeat(7, 1fr)` }}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!calendar || calendar.vehicles.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 p-12 flex flex-col items-center gap-3 text-muted-foreground bg-card/30">
        <Calendar className="w-8 h-8 opacity-20" />
        <span className="text-sm font-medium">No vehicles to display for this region.</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/40 bg-card/30">
      <div className="min-w-[700px]">
        {/* Header row — dates */}
        <div className="flex items-center border-b border-border/40 bg-background/80 sticky top-0 z-10">
          <div className="w-44 flex-shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Vehicle
          </div>
          {days.map((day) => {
            const dayStr = day.toISOString().split("T")[0];
            const isToday = dayStr === todayStr;
            return (
              <div
                key={dayStr}
                className={cn(
                  "flex-1 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wider",
                  isToday ? "text-primary" : "text-muted-foreground",
                )}
              >
                <div>{day.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</div>
                <div className={cn("text-xs font-black", isToday && "text-primary")}>
                  {day.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                </div>
                {isToday && <div className="w-1.5 h-1.5 bg-primary rounded-full mx-auto mt-0.5" />}
              </div>
            );
          })}
        </div>

        {/* Vehicle rows */}
        {calendar.vehicles.map((vehicle) => {
          const vehicleStatusColor: Record<string, string> = {
            AVAILABLE: "text-emerald-400",
            RENTED: "text-blue-400",
            MAINTENANCE: "text-orange-400",
            RESERVED: "text-purple-400",
            INACTIVE: "text-slate-500",
          };

          return (
            <div key={vehicle.vehicleId} className="flex items-stretch border-b border-border/20 last:border-b-0 hover:bg-muted/10 transition-colors">
              {/* Vehicle info */}
              <div className="w-44 flex-shrink-0 px-3 py-3 border-r border-border/20">
                <div className="font-mono text-xs font-semibold text-foreground">
                  {vehicle.licensePlate ?? `#${vehicle.vehicleId}`}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {[vehicle.brandName, vehicle.modelName].filter(Boolean).join(" ") || "Unknown model"}
                </div>
                {vehicle.status && (
                  <div className={cn("text-[9px] font-bold uppercase tracking-wider mt-1", vehicleStatusColor[vehicle.status] ?? "text-muted-foreground")}>
                    {vehicle.status}
                  </div>
                )}
              </div>

              {/* Day cells */}
              {days.map((day) => {
                const dayStr = day.toISOString().split("T")[0];
                const isToday = dayStr === todayStr;

                const dayBookings = vehicle.bookings.filter((b) => {
                  const pickup = b.pickupDatetime.split("T")[0];
                  const dropoff = b.dropoffDatetime.split("T")[0];
                  return pickup <= dayStr && dropoff >= dayStr;
                });

                return (
                  <div
                    key={dayStr}
                    className={cn(
                      "flex-1 px-1 py-1.5 border-r border-border/10 last:border-r-0 min-h-[52px] flex flex-col gap-0.5",
                      isToday && "bg-primary/5",
                    )}
                  >
                    {dayBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className={cn(
                          "rounded text-[9px] font-semibold px-1.5 py-1 border leading-tight truncate",
                          BOOKING_BLOCK_COLORS[booking.status] ?? "bg-gray-500/20 border-gray-500/40 text-gray-300",
                        )}
                        title={`#${booking.id} — ${booking.customerName} — ${booking.status}`}
                      >
                        <div className="truncate">#{booking.id} {booking.customerName}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Region selector ──────────────────────────────────────────────────────────

const REGIONS: Region[] = ["All", "Tbilisi", "Kutaisi", "Batumi"];

function RegionSelector({ value, onChange }: { value: Region; onChange: (r: Region) => void }) {
  return (
    <div className="flex items-center gap-1 bg-background/60 border border-border/40 rounded-lg p-1">
      <MapPin className="w-4 h-4 text-primary ml-2 flex-shrink-0" />
      {REGIONS.map((r) => (
        <Button
          key={r}
          variant={value === r ? "default" : "ghost"}
          size="sm"
          className={cn(
            "h-7 px-3 text-xs font-bold",
            value === r ? "shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(r)}
          data-testid={`region-${r.toLowerCase()}`}
        >
          {r}
        </Button>
      ))}
    </div>
  );
}

// ─── Dashboard customization popover ─────────────────────────────────────────

function CustomizePopover({ config, onChange }: {
  config: WidgetConfig;
  onChange: (cfg: WidgetConfig) => void;
}) {
  const setSection = (key: keyof WidgetConfig["sections"], val: boolean) =>
    onChange({ ...config, sections: { ...config.sections, [key]: val } });
  const setCard = (key: keyof WidgetConfig["cards"], val: boolean) =>
    onChange({ ...config, cards: { ...config.cards, [key]: val } });
  const reset = () => onChange(DEFAULT_WIDGET_CONFIG);

  const SectionRow = ({ label, k }: { label: string; k: keyof WidgetConfig["sections"] }) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={config.sections[k]} onCheckedChange={(v) => setSection(k, v)} />
    </div>
  );

  const CardRow = ({ label, k }: { label: string; k: keyof WidgetConfig["cards"] }) => (
    <div className="flex items-center justify-between py-1 pl-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch
        checked={config.sections.bookingOverview && config.cards[k]}
        onCheckedChange={(v) => setCard(k, v)}
        disabled={!config.sections.bookingOverview}
      />
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs border-border/50 bg-background/50">
          <Settings2 className="w-3.5 h-3.5" />
          Customize
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4" sideOffset={8}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold font-display">Dashboard Layout</h3>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground gap-1" onClick={reset}>
            <RotateCw className="w-3 h-3" /> Reset
          </Button>
        </div>
        <div className="space-y-0.5 divide-y divide-border/30">
          <div className="pb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Sections</p>
            <SectionRow label="Booking Overview" k="bookingOverview" />
            <SectionRow label="Fleet Live Status" k="fleetLiveStatus" />
            <SectionRow label="Today's Operations" k="todaysOperations" />
            <SectionRow label="Fleet Timeline" k="fleetTimeline" />
            <SectionRow label="Operational Alerts" k="operationalAlerts" />
          </div>
          <div className="pt-2">
            <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-1", config.sections.bookingOverview ? "text-muted-foreground" : "text-muted-foreground/40")}>
              Booking Overview Cards
            </p>
            <CardRow label="Total" k="total" />
            <CardRow label="Revenue" k="revenue" />
            <CardRow label="Pending" k="pending" />
            <CardRow label="Confirmed" k="confirmed" />
            <CardRow label="Delivered" k="delivered" />
            <CardRow label="Returned" k="returned" />
            <CardRow label="Canceled" k="canceled" />
            <CardRow label="No Show" k="noShow" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [region, setRegion] = useState<Region>("All");
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>(loadWidgetConfig);
  const city = region === "All" ? undefined : region;

  const handleWidgetChange = (cfg: WidgetConfig) => {
    setWidgetConfig(cfg);
    saveWidgetConfig(cfg);
  };

  // Fleet calendar range: today through today+6
  const calendarDateFrom = useMemo(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  }, []);
  const calendarDateTo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return d.toISOString().split("T")[0];
  }, []);

  const summaryQuery = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary", city],
    queryFn: () => fetchJson<DashboardSummary>(buildUrl("/admin/dashboard/summary", city)),
    staleTime: 30_000,
  });

  const todayQuery = useQuery<{ pickups: BookingRow[]; dropoffs: BookingRow[] }>({
    queryKey: ["dashboard-today", city],
    queryFn: () => fetchJson(buildUrl("/admin/dashboard/today", city)),
    staleTime: 30_000,
  });

  const fleetQuery = useQuery<FleetSnapshot>({
    queryKey: ["dashboard-fleet-snapshot", city],
    queryFn: () => fetchJson<FleetSnapshot>(buildUrl("/admin/dashboard/fleet-snapshot", city)),
    staleTime: 30_000,
  });

  const calendarQuery = useQuery<FleetCalendar>({
    queryKey: ["dashboard-fleet-calendar", city, calendarDateFrom, calendarDateTo],
    queryFn: () => {
      const params = new URLSearchParams({ dateFrom: calendarDateFrom, dateTo: calendarDateTo });
      if (city) params.set("city", city);
      return fetchJson<FleetCalendar>(`${BASE}/admin/dashboard/fleet-calendar?${params.toString()}`);
    },
    staleTime: 60_000,
  });

  const alertSummaryQuery = useQuery<{ total: number; pickup: number; dropoff: number; overdue: number; conflict: number; service: number; serviceWarning: number; serviceDue: number; serviceOverdue: number }>({
    queryKey: ["dashboard-alerts-summary"],
    queryFn: () => fetchJson("/api/admin/alerts/summary"),
    staleTime: 60_000,
  });

  const hasError = summaryQuery.isError || todayQuery.isError || fleetQuery.isError;
  const sc = widgetConfig.sections;
  const cc = widgetConfig.cards;

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">

      {/* Header with Region Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black font-display tracking-tight text-foreground">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {region === "All" ? "All regions" : `${region} region`} · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <CustomizePopover config={widgetConfig} onChange={handleWidgetChange} />
          <RegionSelector value={region} onChange={setRegion} />
        </div>
      </div>

      {hasError && (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="pt-6 flex items-center gap-4 text-destructive">
            <AlertCircle className="w-8 h-8" />
            <div>
              <h3 className="font-bold text-lg font-display">Data Fetch Error</h3>
              <p className="text-sm opacity-80">Unable to load dashboard data. Please check your connection.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      {sc.bookingOverview && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-primary" /> Booking Overview
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {cc.total && <StatCard title="Total" value={summaryQuery.data?.total} icon={CalendarClock} testId="stat-total" isLoading={summaryQuery.isLoading} />}
            {cc.revenue && (
              <StatCard
                title="Revenue"
                value={formatMoney(summaryQuery.data?.totalRevenue)}
                icon={CreditCard}
                testId="stat-revenue"
                isLoading={summaryQuery.isLoading}
                tooltip="GEL-equivalent total from RETURNED bookings (USD×2.7, EUR×2.9)"
              />
            )}
            {cc.pending && <StatCard title="Pending" value={summaryQuery.data?.pending} icon={PlayCircle} testId="stat-pending" isLoading={summaryQuery.isLoading} />}
            {cc.confirmed && <StatCard title="Confirmed" value={summaryQuery.data?.confirmed} icon={CheckCircle2} testId="stat-confirmed" isLoading={summaryQuery.isLoading} />}
            {cc.delivered && <StatCard title="Delivered" value={summaryQuery.data?.delivered} icon={Flag} testId="stat-delivered" isLoading={summaryQuery.isLoading} />}
            {cc.returned && <StatCard title="Returned" value={summaryQuery.data?.returned} icon={RotateCcw} testId="stat-returned" isLoading={summaryQuery.isLoading} />}
            {cc.canceled && <StatCard title="Canceled" value={summaryQuery.data?.canceled} icon={XCircle} testId="stat-canceled" isLoading={summaryQuery.isLoading} />}
            {cc.noShow && <StatCard title="No Show" value={summaryQuery.data?.noShow} icon={UserX} testId="stat-noshow" isLoading={summaryQuery.isLoading} />}
          </div>
        </div>
      )}

      {/* Fleet Live Status */}
      {sc.fleetLiveStatus && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Car className="w-4 h-4 text-primary" /> Fleet Live Status
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <FleetTile label="Available" count={fleetQuery.data?.available} colorClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20" testId="tile-available" isLoading={fleetQuery.isLoading} />
            <FleetTile label="Rented" count={fleetQuery.data?.rented} colorClass="bg-blue-500/10 text-blue-400 border-blue-500/20" testId="tile-rented" isLoading={fleetQuery.isLoading} />
            <FleetTile label="Maintenance" count={fleetQuery.data?.maintenance} colorClass="bg-orange-500/10 text-orange-400 border-orange-500/20" testId="tile-maintenance" isLoading={fleetQuery.isLoading} />
            <FleetTile label="Reserved" count={fleetQuery.data?.reserved} colorClass="bg-purple-500/10 text-purple-400 border-purple-500/20" testId="tile-reserved" isLoading={fleetQuery.isLoading} />
            <FleetTile label="Inactive" count={fleetQuery.data?.inactive} colorClass="bg-slate-500/10 text-slate-400 border-slate-500/20" testId="tile-inactive" isLoading={fleetQuery.isLoading} />
          </div>
        </div>
      )}

      {/* Today's Operations */}
      {sc.todaysOperations && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-primary" /> Today's Operations
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-[400px]">
            <ActivityTable
              title="Today's Pickups"
              bookings={todayQuery.data?.pickups}
              isLoading={todayQuery.isLoading}
              emptyMessage="No pickups scheduled for today."
              timeKey="pickup"
              onRowClick={(id) => setDetailBookingId(id)}
            />
            <ActivityTable
              title="Today's Dropoffs"
              bookings={todayQuery.data?.dropoffs}
              isLoading={todayQuery.isLoading}
              emptyMessage="No dropoffs expected today."
              timeKey="dropoff"
              onRowClick={(id) => setDetailBookingId(id)}
            />
          </div>
        </div>
      )}

      {/* Fleet Timeline */}
      {sc.fleetTimeline && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Fleet Timeline — Next 7 Days
          </h2>
          <FleetTimeline calendar={calendarQuery.data} isLoading={calendarQuery.isLoading} />
        </div>
      )}

      {/* Alert Summary Panel */}
      {sc.operationalAlerts && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Operational Alerts
            {alertSummaryQuery.data && alertSummaryQuery.data.total > 0 && (
              <span className="ml-1 text-[10px] font-bold bg-red-500 text-white rounded-full px-2 py-0.5">{alertSummaryQuery.data.total}</span>
            )}
          </h2>
          {alertSummaryQuery.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : alertSummaryQuery.data ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
              {[
                { label: "Overdue Return", count: alertSummaryQuery.data.overdue, cls: "border-red-500/30 bg-red-500/5 text-red-400", icon: <AlertTriangle className="w-4 h-4" />, type: "OVERDUE" },
                { label: "Conflicts", count: alertSummaryQuery.data.conflict, cls: "border-orange-500/30 bg-orange-500/5 text-orange-400", icon: <GitFork className="w-4 h-4" />, type: "CONFLICT" },
                { label: "Svc Overdue", count: alertSummaryQuery.data.serviceOverdue ?? 0, cls: "border-red-500/20 bg-red-500/5 text-red-400", icon: <Wrench className="w-4 h-4" />, type: "SERVICE_OVERDUE" },
                { label: "Service Due", count: alertSummaryQuery.data.serviceDue ?? 0, cls: "border-orange-500/20 bg-orange-500/5 text-orange-400", icon: <Wrench className="w-4 h-4" />, type: "SERVICE_DUE" },
                { label: "Svc Warning", count: alertSummaryQuery.data.serviceWarning ?? 0, cls: "border-yellow-500/30 bg-yellow-500/5 text-yellow-400", icon: <Wrench className="w-4 h-4" />, type: "SERVICE_WARNING" },
                { label: "Dropoffs Today", count: alertSummaryQuery.data.dropoff, cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400", icon: <ArrowDownToLine className="w-4 h-4" />, type: "DROPOFF_TODAY" },
                { label: "Pickups Today", count: alertSummaryQuery.data.pickup, cls: "border-blue-500/30 bg-blue-500/5 text-blue-400", icon: <ArrowUpFromLine className="w-4 h-4" />, type: "PICKUP_TODAY" },
              ].map((tile) => (
                <Link key={tile.type} href={`/alerts?type=${tile.type}`}>
                  <Card className={cn("overflow-hidden border cursor-pointer hover:opacity-80 transition-all", tile.cls)}>
                    <div className="p-4 flex items-center gap-3">
                      {tile.icon}
                      <div>
                        <div className="text-2xl font-black font-display leading-none">{tile.count}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mt-0.5">{tile.label}</div>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : null}
          {alertSummaryQuery.data && alertSummaryQuery.data.total === 0 && (
            <Card className="border-border/40 bg-card/60 p-4 flex items-center gap-3 text-muted-foreground">
              <Bell className="w-5 h-5 opacity-30" />
              <span className="text-sm">No active operational alerts</span>
            </Card>
          )}
        </div>
      )}

      {/* Booking Detail Dialog */}
      <BookingDetail
        bookingId={detailBookingId}
        open={detailBookingId !== null}
        onClose={() => setDetailBookingId(null)}
      />

    </div>
  );
}
