import { useState, useMemo, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { formatMoney, formatBookingAmount, cn, formatTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CalendarClock, Car, ArrowRightLeft, CreditCard,
  PlayCircle, CheckCircle2, Flag, RotateCcw,
  XCircle, UserX, AlertCircle, MapPin, Calendar,
  Bell, AlertTriangle, GitFork, Wrench, ArrowUpFromLine, ArrowDownToLine,
  Settings2, Info, RotateCw, ParkingSquare, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  ClipboardList, Clock, Globe,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import BookingDetail from "./BookingDetail";
import { useAuth } from "@/hooks/use-auth";

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
  source?: string | null;
  extras?: { name: string; quantity: number | null }[];
  customer: { id: number; fullName: string | null; email: string | null; phone?: string | null };
  vehicle: { id: number; licensePlate: string | null; modelName: string | null; brandName?: string | null } | null;
  vehicleModelName?: string | null;
  vehicleModelBrandName?: string | null;
  pickupLocation: { id: number; name: string };
  dropoffLocation: { id: number; name: string };
  partner: { id: number; name: string } | null;
}

interface WebsiteBookingsSummary {
  pendingCount: number;
  confirmedCount: number;
  recent: BookingRow[];
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

// ─── Parking types ────────────────────────────────────────────────────────────

interface ParkingAssignment {
  id: number;
  vehicleId: number;
  zone: string;
}

interface ParkingZoneData {
  capacity: number | null;
  assignments: ParkingAssignment[];
}

interface ParkingOverviewData {
  AIRPORT?: ParkingZoneData;
  FREE?: ParkingZoneData;
  TASHKENT?: ParkingZoneData;
}

// ─── Widget config ─────────────────────────────────────────────────────────────

type SectionKey =
  | "myTasks"
  | "bookingOverview"
  | "onlineBookings"
  | "fleetLiveStatus"
  | "parkingOverview"
  | "todaysOperations"
  | "fleetTimeline"
  | "operationalAlerts";

const DEFAULT_SECTION_ORDER: SectionKey[] = [
  "myTasks",
  "bookingOverview",
  "onlineBookings",
  "fleetLiveStatus",
  "parkingOverview",
  "todaysOperations",
  "fleetTimeline",
  "operationalAlerts",
];

interface WidgetConfig {
  sections: Record<SectionKey, boolean>;
  sectionOrder: SectionKey[];
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
    myTasks: true,
    bookingOverview: true,
    onlineBookings: true,
    fleetLiveStatus: true,
    parkingOverview: true,
    todaysOperations: true,
    fleetTimeline: true,
    operationalAlerts: true,
  },
  sectionOrder: DEFAULT_SECTION_ORDER,
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
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const mergedSections: Record<SectionKey, boolean> = {
      ...DEFAULT_WIDGET_CONFIG.sections,
      ...((parsed.sections ?? {}) as Partial<Record<SectionKey, boolean>>),
    };
    // Restore stored order; append any newly added keys not yet in stored order
    const rawOrder = ((parsed.sectionOrder ?? []) as SectionKey[])
      .filter((k): k is SectionKey => DEFAULT_SECTION_ORDER.includes(k));
    const storedOrder = rawOrder.filter((k, i) => rawOrder.indexOf(k) === i);
    const sectionOrder: SectionKey[] = [
      ...storedOrder,
      ...DEFAULT_SECTION_ORDER.filter((k) => !storedOrder.includes(k)),
    ];
    return {
      sections: mergedSections,
      sectionOrder,
      cards: { ...DEFAULT_WIDGET_CONFIG.cards, ...((parsed.cards ?? {}) as Partial<WidgetConfig["cards"]>) },
    };
  } catch {
    return DEFAULT_WIDGET_CONFIG;
  }
}

function saveWidgetConfig(cfg: WidgetConfig) {
  localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(cfg));
}

const SECTION_LABELS: Record<SectionKey, string> = {
  myTasks: "My Tasks",
  bookingOverview: "Booking Overview",
  onlineBookings: "Online Bookings",
  fleetLiveStatus: "Fleet Live Status",
  parkingOverview: "TBS Air Parking",
  todaysOperations: "Today's Operations",
  fleetTimeline: "Fleet Timeline",
  operationalAlerts: "Operational Alerts",
};

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

// ─── Extras chips ─────────────────────────────────────────────────────────────

const EXTRA_LABEL: Record<string, string> = {
  "SIM Card": "SIM",
  "Child Seat": "Seat",
  "Baby Seat": "Baby",
  "Booster Seat": "Booster",
  "Additional Driver": "Driver",
  "WiFi Router": "WiFi",
  "Wi-Fi": "WiFi",
  "GPS Navigation": "GPS",
  "Snow Chains": "Chains",
  "Cross Border Permit": "Border",
};

function extraShortLabel(name: string): string {
  return EXTRA_LABEL[name] ?? name;
}

function ExtraChips({ extras, limit }: { extras?: { name: string; quantity: number | null }[]; limit: number }) {
  if (!extras || extras.length === 0) return null;
  const chips = extras.slice(0, limit);
  const overflow = extras.length - limit;
  return (
    <>
      {chips.map((e, i) => {
        const label = extraShortLabel(e.name);
        const qty = e.quantity ?? 1;
        const display = `${label} +${qty}`;
        return (
          <span
            key={i}
            className="text-[11px] font-medium px-1.5 py-px rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex-shrink-0 whitespace-nowrap"
          >
            {display}
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="text-[11px] font-medium px-1.5 py-px rounded bg-muted border border-border text-muted-foreground flex-shrink-0">
          +{overflow}
        </span>
      )}
    </>
  );
}

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

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PAID:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  HALF:     "bg-amber-500/10 text-amber-400 border-amber-500/20",
  UNPAID:   "bg-red-500/10 text-red-400 border-red-500/20",
  REFUNDED: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PAID:     "Paid",
  HALF:     "Partial",
  UNPAID:   "Unpaid",
  REFUNDED: "Refunded",
};

function PaymentStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-semibold tracking-wide text-[9px] uppercase shadow-none leading-none px-1 py-0",
        PAYMENT_STATUS_COLORS[status] || "bg-gray-500/10 text-gray-400 border-gray-500/20",
      )}
    >
      {PAYMENT_STATUS_LABELS[status] ?? status}
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

function FleetTile({ label, count, colorClass, testId, isLoading, onClick }: {
  label: string; count: number | undefined; colorClass: string; testId: string; isLoading: boolean; onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border shadow-sm hover-elevate transition-all",
        colorClass,
        onClick && "cursor-pointer hover:brightness-110",
      )}
      data-testid={testId}
      onClick={onClick}
    >
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

// ─── TBS Air Parking Widget (compact) ────────────────────────────────────────

function TbsAirParkingWidget({ data, isLoading }: { data?: ParkingOverviewData; isLoading: boolean }) {
  const [, navigate] = useLocation();

  const zones: Array<{ key: keyof ParkingOverviewData; label: string; capacity: number | null; colorClass: string }> = [
    { key: "AIRPORT",  label: "Airport",  capacity: 15,   colorClass: "text-sky-400" },
    { key: "FREE",     label: "Free",     capacity: null, colorClass: "text-emerald-400" },
    { key: "TASHKENT", label: "Tashkent", capacity: null, colorClass: "text-violet-400" },
  ];

  return (
    <Card
      className="border border-border/40 bg-card/60 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-all duration-200 max-w-sm"
      onClick={() => navigate("/tbs-parking")}
    >
      <CardContent className="pt-4 pb-3 px-5">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
        ) : (
          <div className="flex items-center gap-6">
            {zones.map(({ key, label, capacity, colorClass }) => {
              const count = data?.[key]?.assignments?.length ?? 0;
              const isOverCap = capacity != null && count > capacity;
              const isFull = capacity != null && count === capacity;
              return (
                <div key={key} className="flex flex-col">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">
                    {label}
                  </p>
                  <p className={cn(
                    "text-3xl font-black font-display leading-none",
                    isOverCap ? "text-red-400" : colorClass,
                  )}>
                    {capacity != null ? `${count}/${capacity}` : count}
                  </p>
                  {isOverCap && (
                    <span className="text-[9px] font-black text-red-400 uppercase tracking-wide mt-0.5">Over Cap</span>
                  )}
                  {isFull && (
                    <span className="text-[9px] font-bold text-red-400 uppercase mt-0.5">Full</span>
                  )}
                  {!isFull && !isOverCap && capacity != null && (
                    <span className="text-[9px] text-muted-foreground mt-0.5">{capacity - count} left</span>
                  )}
                  {capacity == null && (
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      {count === 1 ? "vehicle" : "vehicles"}
                    </span>
                  )}
                </div>
              );
            })}
            <div className="ml-auto text-[10px] text-muted-foreground/60 font-medium self-start">
              Open →
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Activity Table ───────────────────────────────────────────────────────────

const OPS_GRID = "grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_36px_minmax(0,0.85fr)_52px]";
const OPS_HEADERS = ["Ref", "Vehicle", "Client", "Phone", "Amount", "Days", "Route", "Time"] as const;

function ActivityTable({ title, bookings, isLoading, emptyMessage, timeKey, onRowClick, dateStr, onPrevDate, onNextDate, isToday, onTodayDate }: {
  title: string;
  bookings?: BookingRow[];
  isLoading: boolean;
  emptyMessage: string;
  timeKey: "pickup" | "dropoff";
  onRowClick?: (id: number) => void;
  dateStr?: string;
  onPrevDate?: () => void;
  onNextDate?: () => void;
  isToday?: boolean;
  onTodayDate?: () => void;
}) {
  return (
    <Card className="flex flex-col border-border/40 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden" style={{ maxHeight: "380px" }}>
      <CardHeader className="border-b border-border/40 py-3 bg-background/50">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-bold flex items-center gap-3 font-display">
            {title}
            <Badge variant="secondary" className="bg-primary text-primary-foreground font-bold rounded-md px-2">
              {bookings?.length ?? 0}
            </Badge>
          </CardTitle>
          {dateStr && (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={onPrevDate}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs font-semibold text-foreground min-w-[108px] text-center">
                {new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-GB", {
                  weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
                })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={onNextDate}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              {!isToday && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] text-primary hover:text-primary px-1.5"
                  onClick={onTodayDate}
                >
                  Today
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-card/30">
        {/* ── Desktop column headers (md+) ── */}
        <div className={cn(
          "hidden md:grid items-center px-3 py-1.5 gap-x-2",
          "sticky top-0 bg-background/80 backdrop-blur-xl z-10",
          "border-b border-border/30",
          OPS_GRID,
        )}>
          {OPS_HEADERS.map((h) => (
            <span key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {h}
            </span>
          ))}
        </div>

        {/* ── Loading skeletons ── */}
        {isLoading && (
          <>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                {/* Desktop skeleton */}
                <div className={cn(
                  "hidden md:grid items-center px-3 py-2 gap-x-2 border-b border-border/20",
                  OPS_GRID,
                )}>
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-14" />
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-10" />
                </div>
                {/* Mobile skeleton — 3-line compact */}
                <div className="md:hidden flex flex-col gap-0.5 px-3 py-1.5 border-b border-border/20">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Skeleton className="h-2.5 w-20" />
                    <Skeleton className="h-2.5 w-14 ml-auto" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-2.5 w-8" />
                    <Skeleton className="h-2.5 w-12" />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── Empty state ── */}
        {!isLoading && (!bookings || bookings.length === 0) && (
          <div className="h-36 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <CalendarClock className="w-8 h-8 opacity-20" />
            <span className="text-sm font-medium">{emptyMessage}</span>
          </div>
        )}

        {/* ── Data rows ── */}
        {!isLoading && bookings && bookings.length > 0 && bookings.map((b) => {
          const dt = timeKey === "pickup" ? b.pickupDatetime : b.dropoffDatetime;
          const phone = b.customer?.phone ?? b.contactPhone ?? null;
          const timeStr = formatTime(dt);
          const clientName = b.customer?.fullName || b.customer?.email || b.contactFullName;
          const vehicleName = b.vehicle
            ? `${b.vehicle.brandName ? b.vehicle.brandName + " " : ""}${b.vehicle.modelName}`
            : b.vehicleModelName
            ? `${b.vehicleModelBrandName ? b.vehicleModelBrandName + " " : ""}${b.vehicleModelName}`
            : null;
          const amountEl = b.totalAmount
            ? <span>{formatBookingAmount(b.totalAmount, b.currency)}</span>
            : <span className="opacity-40">—</span>;
          const routeFrom = locationShortCode(b.pickupLocation.name);
          const routeTo = locationShortCode(b.dropoffLocation.name);
          const rentalDays = Math.ceil(
            (new Date(b.dropoffDatetime).getTime() - new Date(b.pickupDatetime).getTime())
            / (1000 * 60 * 60 * 24),
          );

          return (
            <div
              key={b.id}
              className={cn(
                "border-b border-border/20 transition-colors",
                onRowClick ? "cursor-pointer" : "cursor-default",
              )}
              onClick={() => onRowClick?.(b.id)}
            >
              {/* Desktop row (md+) */}
              <div className={cn(
                "hidden md:grid items-center px-3 py-1.5 gap-x-2 hover:bg-muted/40 transition-colors",
                OPS_GRID,
              )}>
                {/* Col 1: Ref */}
                <span className="font-mono text-xs font-medium text-muted-foreground">#{b.id}</span>
                {/* Col 2: Vehicle + plate + booking status */}
                <div className="flex flex-col min-w-0">
                  {b.vehicle ? (
                    <>
                      <span className="text-xs font-medium text-foreground truncate">{vehicleName}</span>
                      <span className="text-[10px] font-mono font-bold tracking-wider text-slate-700 dark:text-slate-200 px-1.5 py-0 border border-slate-400 dark:border-slate-400/50 bg-slate-200 dark:bg-slate-500/15 rounded inline-flex w-fit mt-0.5 flex-shrink-0">
                        {b.vehicle.licensePlate}
                      </span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <StatusBadge status={b.status} />
                        <ExtraChips extras={b.extras} limit={3} />
                      </div>
                    </>
                  ) : vehicleName ? (
                    <>
                      <span className="text-xs font-medium text-foreground truncate">{vehicleName}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <StatusBadge status={b.status} />
                        <ExtraChips extras={b.extras} limit={3} />
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground italic">Unassigned</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <StatusBadge status={b.status} />
                        <ExtraChips extras={b.extras} limit={3} />
                      </div>
                    </>
                  )}
                </div>
                {/* Col 3: Client */}
                <span className="font-semibold text-sm text-foreground truncate min-w-0">{clientName}</span>
                {/* Col 4: Phone */}
                <span className="text-xs text-muted-foreground truncate min-w-0">
                  {phone
                    ? <a href={`tel:${phone}`} className="hover:text-primary transition-colors" onClick={(e) => e.stopPropagation()}>{phone}</a>
                    : <span className="italic opacity-50">—</span>
                  }
                </span>
                {/* Col 5: Amount + payment status */}
                <div className="flex flex-col gap-0.5 min-w-0 items-start">
                  <span className="text-xs font-mono font-semibold text-foreground">{amountEl}</span>
                  <PaymentStatusBadge status={b.paymentStatus} />
                </div>
                {/* Col 6: Days */}
                <span className="text-xs font-mono font-semibold text-foreground">{rentalDays}d</span>
                {/* Col 7: Route */}
                <div className="flex items-center gap-1 min-w-0 overflow-hidden text-xs font-medium">
                  <span className="font-mono font-bold text-foreground/80 truncate">{routeFrom}</span>
                  <ArrowRightLeft className="w-2.5 h-2.5 flex-shrink-0 text-primary/50" />
                  <span className="font-mono font-bold text-foreground/80 truncate">{routeTo}</span>
                </div>
                {/* Col 8: Time */}
                <span className="text-sm font-bold text-foreground">{timeStr}</span>
              </div>

              {/* Mobile card (below md) — compact 3-line layout */}
              <div className="md:hidden flex flex-col gap-0.5 px-3 py-1.5 hover:bg-muted/40 transition-colors overflow-hidden">
                {/* Row 1: client (+ phone) + time */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex flex-col min-w-0 overflow-hidden">
                    <span className="font-semibold text-xs text-foreground truncate">{clientName}</span>
                    {phone && (
                      <a href={`tel:${phone}`} className="text-[10px] text-muted-foreground hover:text-primary transition-colors truncate" onClick={(e) => e.stopPropagation()}>{phone}</a>
                    )}
                  </div>
                  <span className="text-xs font-bold text-primary flex-shrink-0">{timeStr}</span>
                </div>
                {/* Row 2: vehicle/plate + route */}
                <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                  {b.vehicle ? (
                    <>
                      <span className="text-[10px] text-foreground/70 truncate min-w-0">{vehicleName}</span>
                      <span className="text-[9px] font-mono font-bold tracking-wider text-slate-700 dark:text-slate-200 px-1.5 py-0 border border-slate-400 dark:border-slate-400/50 bg-slate-200 dark:bg-slate-500/15 rounded flex-shrink-0">
                        {b.vehicle.licensePlate}
                      </span>
                    </>
                  ) : vehicleName ? (
                    <span className="text-[10px] text-foreground/70 truncate min-w-0">{vehicleName}</span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">Unassigned</span>
                  )}
                  <span className="ml-auto flex items-center gap-0.5 flex-shrink-0 text-[10px] font-medium text-muted-foreground">
                    <span className="font-mono font-bold text-foreground/70">{routeFrom}</span>
                    <ArrowRightLeft className="w-2 h-2 text-primary/50" />
                    <span className="font-mono font-bold text-foreground/70">{routeTo}</span>
                  </span>
                </div>
                {/* Row 3: ref/days + status + extras + amount + payment */}
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className="font-mono text-[9px] text-muted-foreground flex-shrink-0">
                    #{b.id} · {rentalDays}d
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                    <StatusBadge status={b.status} />
                    <ExtraChips extras={b.extras} limit={2} />
                    <span className="text-[10px] font-mono font-semibold text-foreground">{amountEl}</span>
                    <PaymentStatusBadge status={b.paymentStatus} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Fleet Timeline ───────────────────────────────────────────────────────────

const BOOKING_BLOCK_COLORS: Record<string, string> = {
  PENDING:   "bg-amber-500/30 border-amber-500/60 dark:text-amber-200 text-amber-900",
  CONFIRMED: "bg-blue-500/30 border-blue-500/60 dark:text-blue-200 text-blue-900",
  DELIVERED: "bg-emerald-500/30 border-emerald-500/60 dark:text-emerald-200 text-emerald-900",
  RETURNED:  "bg-slate-500/20 border-slate-500/40 dark:text-slate-400 text-slate-700",
  CANCELED:  "bg-red-500/20 border-red-500/40 dark:text-red-300 text-red-800",
  NO_SHOW:   "bg-orange-500/20 border-orange-500/40 dark:text-orange-300 text-orange-800",
};

function FleetTimeline({
  calendar,
  isLoading,
  onSelectBooking,
}: {
  calendar?: FleetCalendar;
  isLoading: boolean;
  onSelectBooking: (id: number) => void;
}) {
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

          const dayStrs = days.map((d) => d.toISOString().split("T")[0]);
          const windowStart = dayStrs[0];
          const windowEnd = dayStrs[dayStrs.length - 1];

          const visibleBookings = vehicle.bookings
            .map((b) => {
              const bookingStart = b.pickupDatetime.split("T")[0];
              const bookingEnd = b.dropoffDatetime.split("T")[0];
              if (bookingStart > windowEnd || bookingEnd < windowStart) return null;
              const clampedStart = bookingStart < windowStart ? windowStart : bookingStart;
              const clampedEnd = bookingEnd > windowEnd ? windowEnd : bookingEnd;
              const startCol = dayStrs.indexOf(clampedStart) + 1;
              const endCol = dayStrs.indexOf(clampedEnd) + 2;
              return { ...b, startCol, endCol };
            })
            .filter((b): b is NonNullable<typeof b> => b !== null);

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

              {/* Span-based booking grid */}
              <div
                className="flex-1 relative min-h-[52px]"
                style={{ display: "grid", gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
              >
                {/* Day background cells (today highlight + borders) */}
                {dayStrs.map((dayStr, i) => (
                  <div
                    key={dayStr}
                    className={cn(
                      "border-r border-border/10 last:border-r-0 min-h-[52px]",
                      dayStr === todayStr && "bg-primary/5",
                    )}
                    style={{ gridColumn: `${i + 1} / ${i + 2}`, gridRow: 1 }}
                  />
                ))}

                {/* Continuous booking bars */}
                {visibleBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className={cn(
                      "rounded text-[9px] font-semibold px-1.5 py-1 border leading-tight truncate cursor-pointer hover:opacity-80 transition-opacity",
                      BOOKING_BLOCK_COLORS[booking.status] ?? "bg-gray-500/20 border-gray-500/40 dark:text-gray-300 text-gray-800",
                    )}
                    style={{
                      gridColumn: `${booking.startCol} / ${booking.endCol}`,
                      gridRow: 1,
                      alignSelf: "center",
                      margin: "4px 2px",
                    }}
                    title={`#${booking.id} — ${booking.customerName} — ${booking.status}`}
                    onClick={() => onSelectBooking(booking.id)}
                  >
                    <div className="truncate">#{booking.id} {booking.customerName}</div>
                  </div>
                ))}
              </div>
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
    <div className="overflow-x-auto">
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
    </div>
  );
}

// ─── Dashboard customization popover ─────────────────────────────────────────

function CustomizePopover({ config, onChange, region }: {
  config: WidgetConfig;
  onChange: (cfg: WidgetConfig) => void;
  region: Region;
}) {
  const setSection = (key: SectionKey, val: boolean) =>
    onChange({ ...config, sections: { ...config.sections, [key]: val } });
  const setCard = (key: keyof WidgetConfig["cards"], val: boolean) =>
    onChange({ ...config, cards: { ...config.cards, [key]: val } });
  const reset = () => onChange(DEFAULT_WIDGET_CONFIG);

  const moveSection = (idx: number, dir: -1 | 1) => {
    const visibleOrder = config.sectionOrder.filter(
      (k) => k !== "parkingOverview" || region === "Tbilisi",
    );
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= visibleOrder.length) return;
    // Swap in the full sectionOrder (which may include parkingOverview even in non-Tbilisi)
    const fullOrder = [...config.sectionOrder];
    const aKey = visibleOrder[idx];
    const bKey = visibleOrder[swapIdx];
    const aFullIdx = fullOrder.indexOf(aKey);
    const bFullIdx = fullOrder.indexOf(bKey);
    fullOrder[aFullIdx] = bKey;
    fullOrder[bFullIdx] = aKey;
    onChange({ ...config, sectionOrder: fullOrder });
  };

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

  const visibleSections = config.sectionOrder.filter(
    (k) => k !== "parkingOverview" || region === "Tbilisi",
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
            <RotateCw className="w-3 h-3" /> Reset to defaults
          </Button>
        </div>
        <div className="space-y-0.5 divide-y divide-border/30">
          <div className="pb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Sections</p>
            {visibleSections.map((k, idx) => (
              <div key={k} className="flex items-center gap-1 py-1">
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-5 text-muted-foreground/50 hover:text-foreground p-0"
                    disabled={idx === 0}
                    onClick={() => moveSection(idx, -1)}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-5 text-muted-foreground/50 hover:text-foreground p-0"
                    disabled={idx === visibleSections.length - 1}
                    onClick={() => moveSection(idx, 1)}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </div>
                <span className="text-sm font-medium flex-1">{SECTION_LABELS[k]}</span>
                <Switch checked={config.sections[k]} onCheckedChange={(v) => setSection(k, v)} />
              </div>
            ))}
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

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function loadRegion(): Region {
  try {
    const v = localStorage.getItem("dashboard-region");
    if (v === "Tbilisi" || v === "Kutaisi" || v === "Batumi") return v;
  } catch {}
  return "All";
}

export default function Dashboard() {
  const [region, setRegion] = useState<Region>(loadRegion);
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig>(loadWidgetConfig);
  const [selectedPickupDate, setSelectedPickupDate] = useState<string>(todayDateStr);
  const [selectedDropoffDate, setSelectedDropoffDate] = useState<string>(todayDateStr);
  const city = region === "All" ? undefined : region;
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [timelineUserToggled, setTimelineUserToggled] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(
    () => typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );
  useEffect(() => {
    if (!timelineUserToggled) setTimelineExpanded(!isMobile);
  }, [isMobile, timelineUserToggled]);

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

  const pickupQuery = useQuery<{ pickups: BookingRow[]; dropoffs: BookingRow[] }>({
    queryKey: ["dashboard-today-pickups", city, selectedPickupDate],
    queryFn: () => {
      const params = new URLSearchParams({ date: selectedPickupDate });
      if (city) params.set("city", city);
      return fetchJson(`${BASE}/admin/dashboard/today?${params.toString()}`);
    },
    staleTime: 30_000,
  });

  const dropoffQuery = useQuery<{ pickups: BookingRow[]; dropoffs: BookingRow[] }>({
    queryKey: ["dashboard-today-dropoffs", city, selectedDropoffDate],
    queryFn: () => {
      const params = new URLSearchParams({ date: selectedDropoffDate });
      if (city) params.set("city", city);
      return fetchJson(`${BASE}/admin/dashboard/today?${params.toString()}`);
    },
    staleTime: 30_000,
  });

  const filteredPickups = useMemo(
    () =>
      (pickupQuery.data?.pickups ?? [])
        .filter((b) => b.status !== "CANCELED" && b.status !== "NO_SHOW")
        .sort((a, b) => new Date(a.pickupDatetime).getTime() - new Date(b.pickupDatetime).getTime()),
    [pickupQuery.data],
  );

  const filteredDropoffs = useMemo(
    () =>
      (dropoffQuery.data?.dropoffs ?? [])
        .filter((b) => b.status !== "RETURNED" && b.status !== "CANCELED" && b.status !== "NO_SHOW")
        .sort((a, b) => new Date(a.dropoffDatetime).getTime() - new Date(b.dropoffDatetime).getTime()),
    [dropoffQuery.data],
  );

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
    queryKey: ["dashboard-alerts-summary", city],
    queryFn: () => {
      const url = city
        ? `/api/admin/alerts/summary?city=${encodeURIComponent(city)}`
        : "/api/admin/alerts/summary";
      return fetchJson(url);
    },
    staleTime: 60_000,
  });

  const parkingQuery = useQuery<ParkingOverviewData>({
    queryKey: ["dashboard-parking-overview"],
    queryFn: () => fetchJson<ParkingOverviewData>(`${BASE}/admin/parking`),
    staleTime: 30_000,
  });

  const myTasksSummaryQuery = useQuery<{ total: number; overdue: number; dueToday: number }>({
    queryKey: ["my-tasks-summary"],
    queryFn: () => fetchJson(`${BASE}/admin/tasks/my-summary`),
    staleTime: 60_000,
  });

  const websiteBookingsQuery = useQuery<WebsiteBookingsSummary>({
    queryKey: ["dashboard-website-bookings", city],
    queryFn: () => fetchJson<WebsiteBookingsSummary>(buildUrl("/admin/dashboard/website-bookings", city)),
    staleTime: 30_000,
  });

  const hasError = summaryQuery.isError || pickupQuery.isError || dropoffQuery.isError || fleetQuery.isError || websiteBookingsQuery.isError;
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
        <div className="flex flex-wrap items-center gap-3">
          <CustomizePopover config={widgetConfig} onChange={handleWidgetChange} region={region} />
          <RegionSelector value={region} onChange={(r) => {
            setRegion(r);
            try { localStorage.setItem("dashboard-region", r); } catch {}
          }} />
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

      {/* Sections — rendered in customizable order */}
      {widgetConfig.sectionOrder.map((key) => {
        if (!sc[key]) return null;

        if (key === "myTasks") return (
          <div key="myTasks">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" /> My Tasks
            </h2>
            <Card
              className="border border-border/40 bg-card/60 cursor-pointer hover:border-primary/40 hover:bg-card/80 transition-all duration-200 max-w-sm"
              onClick={() => navigate("/tasks?assignee=me")}
            >
              <CardContent className="pt-4 pb-3 px-5">
                {myTasksSummaryQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-7 w-12" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ) : (
                  <div className="flex items-center gap-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">Open Tasks</p>
                      <p className="text-3xl font-black font-display text-foreground">{myTasksSummaryQuery.data?.total ?? 0}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {(myTasksSummaryQuery.data?.overdue ?? 0) > 0 && (
                        <div className="flex items-center gap-1.5 text-red-400">
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-xs font-semibold">{myTasksSummaryQuery.data?.overdue} overdue</span>
                        </div>
                      )}
                      {(myTasksSummaryQuery.data?.dueToday ?? 0) > 0 && (
                        <div className="flex items-center gap-1.5 text-amber-400">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="text-xs font-semibold">{myTasksSummaryQuery.data?.dueToday} due today</span>
                        </div>
                      )}
                      {(myTasksSummaryQuery.data?.overdue ?? 0) === 0 && (myTasksSummaryQuery.data?.dueToday ?? 0) === 0 && (
                        <span className="text-xs text-muted-foreground">All on track</span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

        if (key === "bookingOverview") return (
          <div key="bookingOverview">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-primary" /> Booking Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
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
        );

        if (key === "onlineBookings") return (
          <div key="onlineBookings">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Online Bookings
            </h2>
            <Card className="border border-border/40 bg-card/60 backdrop-blur-md shadow-sm max-w-sm">
              <CardContent className="pt-4 pb-3 px-5">
                {websiteBookingsQuery.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-7 w-20" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-6 mb-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">Pending</p>
                        <p className="text-3xl font-black font-display text-amber-400 leading-none">
                          {websiteBookingsQuery.data?.pendingCount ?? 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">Confirmed</p>
                        <p className="text-3xl font-black font-display text-blue-400 leading-none">
                          {websiteBookingsQuery.data?.confirmedCount ?? 0}
                        </p>
                      </div>
                    </div>
                    {(websiteBookingsQuery.data?.recent?.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">No active online bookings.</p>
                    ) : (
                      <div className="space-y-1">
                        {websiteBookingsQuery.data!.recent.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className="w-full flex items-center justify-between gap-2 text-left py-1 px-1.5 rounded hover:bg-muted/30 transition-colors group cursor-pointer"
                            onClick={() => setDetailBookingId(b.id)}
                          >
                            <span className="text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
                              #{b.id}
                            </span>
                            <span className="text-xs font-medium text-foreground truncate flex-1">
                              {b.contactFullName}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {new Date(b.pickupDatetime).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                            </span>
                            <StatusBadge status={b.status} />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 pt-2 border-t border-border/30 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[11px] text-primary hover:text-primary px-1.5"
                        onClick={() => navigate("/bookings")}
                      >
                        View all →
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        );

        if (key === "fleetLiveStatus") return (
          <div key="fleetLiveStatus">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <Car className="w-4 h-4 text-primary" /> Fleet Live Status
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
              {(() => {
                const fleetUrl = (status: string) => city ? `/fleet?status=${status}&city=${city}` : `/fleet?status=${status}`;
                return (
                  <>
                    <FleetTile label="Available" count={fleetQuery.data?.available} colorClass="bg-emerald-500/10 text-emerald-400 border-emerald-500/20" testId="tile-available" isLoading={fleetQuery.isLoading} onClick={() => navigate(fleetUrl("AVAILABLE"))} />
                    <FleetTile label="Rented" count={fleetQuery.data?.rented} colorClass="bg-blue-500/10 text-blue-400 border-blue-500/20" testId="tile-rented" isLoading={fleetQuery.isLoading} onClick={() => navigate(fleetUrl("RENTED"))} />
                    <FleetTile label="Maintenance" count={fleetQuery.data?.maintenance} colorClass="bg-orange-500/10 text-orange-400 border-orange-500/20" testId="tile-maintenance" isLoading={fleetQuery.isLoading} onClick={() => navigate("/service")} />
                    <FleetTile label="Reserved" count={fleetQuery.data?.reserved} colorClass="bg-purple-500/10 text-purple-400 border-purple-500/20" testId="tile-reserved" isLoading={fleetQuery.isLoading} onClick={() => navigate(fleetUrl("RESERVED"))} />
                    <FleetTile label="Inactive" count={fleetQuery.data?.inactive} colorClass="bg-slate-500/10 text-slate-400 border-slate-500/20" testId="tile-inactive" isLoading={fleetQuery.isLoading} onClick={() => navigate(fleetUrl("INACTIVE"))} />
                  </>
                );
              })()}
            </div>
          </div>
        );

        if (key === "parkingOverview") return region === "Tbilisi" ? (
          <div key="parkingOverview">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <ParkingSquare className="w-4 h-4 text-primary" /> TBS Air Parking
            </h2>
            <TbsAirParkingWidget data={parkingQuery.data} isLoading={parkingQuery.isLoading} />
          </div>
        ) : null;

        if (key === "todaysOperations") return (
          <div key="todaysOperations">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-primary" /> Operations
            </h2>
            <div className="grid grid-cols-1 gap-5">
              <ActivityTable
                title="Pickups"
                bookings={filteredPickups}
                isLoading={pickupQuery.isLoading}
                emptyMessage="No pending pickups for this date."
                timeKey="pickup"
                onRowClick={(id) => setDetailBookingId(id)}
                dateStr={selectedPickupDate}
                onPrevDate={() => setSelectedPickupDate((d) => shiftDate(d, -1))}
                onNextDate={() => setSelectedPickupDate((d) => shiftDate(d, 1))}
                isToday={selectedPickupDate === todayDateStr()}
                onTodayDate={() => setSelectedPickupDate(todayDateStr())}
              />
              <ActivityTable
                title="Dropoffs"
                bookings={filteredDropoffs}
                isLoading={dropoffQuery.isLoading}
                emptyMessage="No pending dropoffs for this date."
                timeKey="dropoff"
                onRowClick={(id) => setDetailBookingId(id)}
                dateStr={selectedDropoffDate}
                onPrevDate={() => setSelectedDropoffDate((d) => shiftDate(d, -1))}
                onNextDate={() => setSelectedDropoffDate((d) => shiftDate(d, 1))}
                isToday={selectedDropoffDate === todayDateStr()}
                onTodayDate={() => setSelectedDropoffDate(todayDateStr())}
              />
            </div>
          </div>
        );

        if (key === "fleetTimeline") return (
          <div key="fleetTimeline">
            <button
              type="button"
              className="w-full flex items-center gap-2 mb-3 text-left group"
              onClick={() => { setTimelineUserToggled(true); setTimelineExpanded((v) => !v); }}
            >
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 flex-1">
                <Calendar className="w-4 h-4 text-primary" /> Fleet Timeline — Next 7 Days
              </h2>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0", timelineExpanded ? "rotate-180" : "")} />
            </button>
            <div className={timelineExpanded ? undefined : "hidden"}>
              <FleetTimeline
                calendar={calendarQuery.data}
                isLoading={calendarQuery.isLoading}
                onSelectBooking={(id) => setDetailBookingId(id)}
              />
            </div>
          </div>
        );

        if (key === "operationalAlerts") return (
          <div key="operationalAlerts">
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
        );

        return null;
      })}

      {/* Booking Detail Dialog */}
      <BookingDetail
        bookingId={detailBookingId}
        open={detailBookingId !== null}
        onClose={() => setDetailBookingId(null)}
      />

    </div>
  );
}
