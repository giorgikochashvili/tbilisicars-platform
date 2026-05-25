import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, ChevronDown, GanttChart, AlertTriangle,
  Car, MapPin, Calendar, LayoutGrid,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import VehicleDetail from "./VehicleDetail";
import BookingDetail from "./BookingDetail";

// ── Types ─────────────────────────────────────────────────────────────────────

type BookingStatus = "PENDING" | "CONFIRMED" | "DELIVERED" | "RETURNED" | "CANCELED" | "NO_SHOW";
type VehicleStatus = "AVAILABLE" | "RENTED" | "MAINTENANCE" | "RESERVED" | "INACTIVE";
type GroupBy = "model" | "category";

interface Booking {
  id: number;
  status: BookingStatus;
  pickupDate: string;
  dropoffDate: string;
  pickupDateTime?: string;   // full ISO — for hour-aware overdue logic
  dropoffDateTime?: string;  // full ISO — for hour-aware overdue logic
  customerName: string;
}

interface Vehicle {
  id: number;
  label: string;
  plate: string;
  status: VehicleStatus | null;
  city: string | null;
  modelId?: number | null;
  modelName?: string | null;
  brandName?: string | null;    // for "Brand Model" group headers in model view
  categoryName?: string | null; // for category grouping
  bookings: Booking[];
}

interface CalendarData {
  vehicles: Vehicle[];
  dateRange: { start: string; end: string };
}

interface Group {
  key: string;
  label: string;   // displayed in group header
  vehicles: Vehicle[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_PX = 44;
const LABEL_WIDTH_DESKTOP = 220;
const LABEL_WIDTH_MOBILE = 120;

const VEHICLE_STATUS_COLORS: Record<VehicleStatus, string> = {
  AVAILABLE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  RENTED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  MAINTENANCE: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  RESERVED: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  INACTIVE: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00");
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatDayOfWeek(date: Date): string {
  return date.toLocaleDateString("en-GB", { weekday: "short" });
}

// ── Pure display helpers ──────────────────────────────────────────────────────

/** Natural sort for license plates — TT-002 sorts before TT-010 */
function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** True if booking's date range intersects [rangeStart, rangeEnd] */
function isBookingVisible(booking: Booking, rangeStart: Date, rangeEnd: Date): boolean {
  const pickup = parseDate(booking.pickupDate);
  const dropoff = parseDate(booking.dropoffDate);
  return pickup <= rangeEnd && dropoff >= rangeStart;
}

/** Earliest visible pickup date across a vehicle's bookings (for within-group sorting) */
function earliestVisibleStart(bookings: Booking[], rangeStart: Date, rangeEnd: Date): Date {
  const visible = bookings.filter((b) => isBookingVisible(b, rangeStart, rangeEnd));
  if (visible.length === 0) return new Date(8640000000000000);
  return visible.reduce((min, b) => {
    const d = parseDate(b.pickupDate);
    return d < min ? d : min;
  }, parseDate(visible[0]!.pickupDate));
}

/**
 * Sort vehicles within a group:
 * 1. Vehicles with bookings visible in the current range come first, by earliest pickup.
 * 2. Vehicles without visible bookings sorted by natural plate order.
 *
 * Structured as a standalone function so future custom model/category ordering
 * can be injected via an optional `customOrder` map without changing group logic.
 */
function sortVehiclesInGroup(
  vehicles: Vehicle[],
  rangeStart: Date,
  rangeEnd: Date,
  // Reserved for Phase 2: customOrder?: Map<number, number>
): Vehicle[] {
  return [...vehicles].sort((a, b) => {
    const aVis = a.bookings.some((bk) => isBookingVisible(bk, rangeStart, rangeEnd));
    const bVis = b.bookings.some((bk) => isBookingVisible(bk, rangeStart, rangeEnd));
    if (aVis && !bVis) return -1;
    if (!aVis && bVis) return 1;
    if (aVis && bVis) {
      return (
        earliestVisibleStart(a.bookings, rangeStart, rangeEnd).getTime() -
        earliestVisibleStart(b.bookings, rangeStart, rangeEnd).getTime()
      );
    }
    return naturalSort(a.plate || String(a.id), b.plate || String(b.id));
  });
}

/**
 * Display-only: true if PENDING/CONFIRMED booking is 4+ hours past its pickup datetime.
 * Does NOT modify any data — read-only computation for bar color only.
 */
function isPickupOverdue(booking: Booking, now: Date): boolean {
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") return false;
  const ref = booking.pickupDateTime
    ? new Date(booking.pickupDateTime)
    : parseDate(booking.pickupDate);
  return now.getTime() - ref.getTime() > 4 * 3_600_000;
}

/**
 * Display-only: true if DELIVERED booking is 4+ hours past its dropoff datetime.
 * Does NOT modify any data — read-only computation for bar color only.
 */
function isDropoffOverdue(booking: Booking, now: Date): boolean {
  if (booking.status !== "DELIVERED") return false;
  const ref = booking.dropoffDateTime
    ? new Date(booking.dropoffDateTime)
    : parseDate(booking.dropoffDate);
  return now.getTime() - ref.getTime() > 4 * 3_600_000;
}

/** Returns Tailwind classes for a booking bar based on status + overdue state. Pure/display-only. */
function getBookingColors(
  booking: Booking,
  now: Date,
): { bar: string; text: string; dashed: boolean } {
  const s = booking.status;

  if (s === "RETURNED") {
    return {
      bar: "bg-slate-400/50 hover:bg-slate-400/70 border-slate-500/40",
      text: "text-slate-200",
      dashed: false,
    };
  }

  if (s === "CANCELED" || s === "NO_SHOW") {
    // Muted + dashed — NOT red
    return {
      bar: "bg-slate-600/25 hover:bg-slate-600/35 border-slate-500/40 opacity-50",
      text: "text-slate-400",
      dashed: true,
    };
  }

  if (s === "DELIVERED") {
    if (isDropoffOverdue(booking, now)) {
      return {
        bar: "bg-red-600/80 hover:bg-red-600 border-red-700/50",
        text: "text-red-100",
        dashed: false,
      };
    }
    return {
      bar: "bg-emerald-500/80 hover:bg-emerald-500 border-emerald-600/50",
      text: "text-emerald-950",
      dashed: false,
    };
  }

  // PENDING or CONFIRMED
  if (isPickupOverdue(booking, now)) {
    return {
      bar: "bg-red-600/80 hover:bg-red-600 border-red-700/50",
      text: "text-red-100",
      dashed: false,
    };
  }
  return {
    bar: "bg-blue-500/80 hover:bg-blue-500 border-blue-600/50",
    text: "text-blue-950",
    dashed: false,
  };
}

/**
 * Group vehicles by model (brandName + modelName).
 * Group header label = "Toyota Corolla", "Jeep Compass", etc.
 */
function buildModelGroups(vehicles: Vehicle[], rangeStart: Date, rangeEnd: Date): Group[] {
  const map = new Map<string, Group>();

  for (const v of vehicles) {
    const key = v.modelId != null ? `m_${v.modelId}` : `u_${v.id}`;
    // Group header: "Brand Model" e.g. "Jeep Compass"
    const label =
      [v.brandName, v.modelName].filter(Boolean).join(" ") || v.label || "Unknown";
    if (!map.has(key)) map.set(key, { key, label, vehicles: [] });
    map.get(key)!.vehicles.push(v);
  }

  for (const g of map.values()) {
    g.vehicles = sortVehiclesInGroup(g.vehicles, rangeStart, rangeEnd);
  }

  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Group vehicles by category (from vehicleModelTable.category).
 * Group header label = real category name e.g. "Crossover", "Economy".
 * Vehicles with null categoryName fall into "Uncategorized".
 */
function buildCategoryGroups(vehicles: Vehicle[], rangeStart: Date, rangeEnd: Date): Group[] {
  const map = new Map<string, Group>();

  for (const v of vehicles) {
    const cat = v.categoryName?.trim() || "Uncategorized";
    const key = `cat_${cat}`;
    if (!map.has(key)) map.set(key, { key, label: cat, vehicles: [] });
    map.get(key)!.vehicles.push(v);
  }

  for (const g of map.values()) {
    g.vehicles = sortVehiclesInGroup(g.vehicles, rangeStart, rangeEnd);
  }

  return [...map.values()].sort((a, b) => {
    // Pin "Uncategorized" to the end
    if (a.label === "Uncategorized") return 1;
    if (b.label === "Uncategorized") return -1;
    return a.label.localeCompare(b.label);
  });
}

// ── API fetch ─────────────────────────────────────────────────────────────────

async function fetchCalendar(startDate: string, endDate: string, city: string): Promise<CalendarData> {
  const params = new URLSearchParams({ startDate, endDate });
  if (city !== "all") params.set("city", city);
  const res = await fetch(`/api/admin/fleet-calendar?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load calendar data");
  return res.json();
}

// ── Conflict detection (unchanged) ───────────────────────────────────────────

function hasConflict(bookings: Booking[]): boolean {
  if (bookings.length < 2) return false;
  const sorted = [...bookings].sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]!.dropoffDate >= sorted[i + 1]!.pickupDate) return true;
  }
  return false;
}

function isBookingInConflict(target: Booking, bookings: Booking[]): boolean {
  return bookings.some(
    (b) =>
      b.id !== target.id &&
      b.pickupDate <= target.dropoffDate &&
      b.dropoffDate >= target.pickupDate,
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FleetCalendarPage() {
  // Dialog state
  const [detailVehicleId, setDetailVehicleId] = useState<number | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);

  // Group by: model (default) or category
  const [groupBy, setGroupBy] = useState<GroupBy>("model");

  // Collapsed group keys (local UI state, cleared when groupBy changes)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    setCollapsedGroups(new Set());
  }, [groupBy]);

  // Responsive label width
  const [labelWidth, setLabelWidth] = useState(
    typeof window !== "undefined" && window.innerWidth < 768 ? LABEL_WIDTH_MOBILE : LABEL_WIDTH_DESKTOP,
  );
  useEffect(() => {
    const update = () =>
      setLabelWidth(window.innerWidth < 768 ? LABEL_WIDTH_MOBILE : LABEL_WIDTH_DESKTOP);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateStr(today), [today]);

  // Default: 60-day window centred on today (today −30 … today +29)
  const [rangeSize, setRangeSize] = useState<7 | 14 | 30 | 60>(60);
  const [rangeStart, setRangeStart] = useState<Date>(() => addDays(today, -30));
  const [city, setCity] = useState("all");

  const rangeEnd = useMemo(() => addDays(rangeStart, rangeSize - 1), [rangeStart, rangeSize]);
  const startStr = toDateStr(rangeStart);
  const endStr = toDateStr(rangeEnd);

  const dates = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < rangeSize; i++) arr.push(addDays(rangeStart, i));
    return arr;
  }, [rangeStart, rangeSize]);

  const { data, isLoading, error } = useQuery<CalendarData>({
    queryKey: ["fleet-calendar", startStr, endStr, city],
    queryFn: () => fetchCalendar(startStr, endStr, city),
    staleTime: 30_000,
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll so today is visible (~1/3 from the left of the grid) on data load
  useEffect(() => {
    if (!scrollRef.current || !data) return;
    const todayOffsetPx = diffDays(rangeStart, today) * DAY_PX;
    const LABEL_W = typeof window !== "undefined" && window.innerWidth < 768
      ? LABEL_WIDTH_MOBILE
      : LABEL_WIDTH_DESKTOP;
    const gridViewport = scrollRef.current.clientWidth - LABEL_W;
    // Position today at ~1/3 from left, so staff can see past history to the left
    const target = todayOffsetPx - Math.floor(gridViewport / 3);
    scrollRef.current.scrollLeft = Math.max(0, target);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation
  const goBack = () => setRangeStart((d) => addDays(d, -rangeSize));
  const goForward = () => setRangeStart((d) => addDays(d, rangeSize));
  const goToday = () => setRangeStart(addDays(today, -30));

  const todayIdx = useMemo(() => {
    const diff = diffDays(rangeStart, today);
    return diff >= 0 && diff < rangeSize ? diff : -1;
  }, [rangeStart, today, rangeSize]);

  // Build groups whenever data, groupBy, or range changes
  const groups = useMemo(() => {
    if (!data) return [];
    return groupBy === "model"
      ? buildModelGroups(data.vehicles, rangeStart, rangeEnd)
      : buildCategoryGroups(data.vehicles, rangeStart, rangeEnd);
  }, [data, groupBy, rangeStart, rangeEnd]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Booking bar geometry — clipped to visible range (unchanged math)
  function bookingBar(booking: Booking) {
    const pickupDate = parseDate(booking.pickupDate);
    const dropoffDate = parseDate(booking.dropoffDate);
    const startClipped = pickupDate < rangeStart ? rangeStart : pickupDate;
    const endClipped = dropoffDate > rangeEnd ? rangeEnd : dropoffDate;
    const leftDays = diffDays(rangeStart, startClipped);
    const spanDays = diffDays(startClipped, endClipped) + 1;
    return { left: leftDays * DAY_PX, width: spanDays * DAY_PX };
  }

  const totalGridWidth = rangeSize * DAY_PX;
  const LABEL_WIDTH = labelWidth;

  // Computed once per render for overdue checks (display-only, no mutations)
  const now = new Date();

  return (
    <div className="flex flex-col gap-3 animate-in fade-in duration-500">
      {/* ── Page header ── */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <GanttChart className="w-6 h-6 text-primary" /> Fleet Calendar
          </h2>
          <p className="text-muted-foreground text-sm">
            Operational timeline — vehicle availability &amp; booking schedule
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* City filter */}
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="w-[148px] h-9 text-sm">
              <MapPin className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              <SelectItem value="Tbilisi">Tbilisi</SelectItem>
              <SelectItem value="Kutaisi">Kutaisi</SelectItem>
              <SelectItem value="Batumi">Batumi</SelectItem>
            </SelectContent>
          </Select>

          {/* Group by */}
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <LayoutGrid className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="model">Group: Model</SelectItem>
              <SelectItem value="category">Group: Category</SelectItem>
            </SelectContent>
          </Select>

          {/* Range picker — 7 / 14 / 30 / 60 */}
          <Select value={String(rangeSize)} onValueChange={(v) => setRangeSize(Number(v) as 7 | 14 | 30 | 60)}>
            <SelectTrigger className="w-[108px] h-9 text-sm">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
            </SelectContent>
          </Select>

          {/* Date navigation */}
          <div className="flex items-center gap-1 border border-border/50 rounded-lg p-0.5 bg-card/60">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs font-medium min-w-[120px]"
              onClick={goToday}
            >
              {formatDay(rangeStart)} – {formatDay(rangeEnd)}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goForward}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button variant="outline" size="sm" className="h-9 text-sm" onClick={goToday}>
            Today
          </Button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground font-medium">Colors:</span>
        {[
          { label: "Scheduled", cls: "bg-blue-500/80 border-blue-600/50 text-blue-950" },
          { label: "Active", cls: "bg-emerald-500/80 border-emerald-600/50 text-emerald-950" },
          { label: "Overdue (4h+)", cls: "bg-red-600/80 border-red-700/50 text-red-100" },
          { label: "Returned", cls: "bg-slate-400/50 border-slate-500/40 text-slate-200" },
          { label: "Canceled / No-show", cls: "bg-slate-600/25 border-dashed border-slate-500/40 text-slate-400 opacity-60" },
        ].map(({ label, cls }) => (
          <span key={label} className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${cls}`}>
            {label}
          </span>
        ))}
        <span className="ml-2 flex items-center gap-1 text-[10px] border border-orange-500/40 bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded">
          <AlertTriangle className="w-3 h-3" /> Conflict
        </span>
      </div>

      {/* ── Timeline board ──
          Board uses a bounded max-height so it scrolls internally instead of
          making the CRM page grow. The 240px offset covers the app header,
          main padding, page title, legend, footer, and gaps.
          Adjust this value if the layout above the board changes significantly.
      ── */}
      <Card
        className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden flex flex-col"
        style={{ maxHeight: "calc(100svh - 240px)", minHeight: "300px" }}
      >
        {isLoading ? (
          <div className="p-6 space-y-3 flex-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 items-center">
                <Skeleton className="h-12 w-52 rounded-md" />
                <Skeleton className="h-10 flex-1 rounded-md" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-destructive gap-2">
            <AlertTriangle className="w-5 h-5" />
            Failed to load calendar data
          </div>
        ) : !data || data.vehicles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <Car className="w-10 h-10 opacity-20" />
            <p>No vehicles found{city !== "all" ? ` in ${city}` : ""}</p>
          </div>
        ) : (
          /* Internal scroll container: both axes scroll here, not the page */
          <div className="flex-1 min-h-0 overflow-auto" ref={scrollRef}>
            <div style={{ minWidth: LABEL_WIDTH + totalGridWidth + 24 }}>

              {/* ── Sticky date header ── */}
              <div className="flex sticky top-0 z-20 bg-card border-b border-border/40 shadow-sm">
                <div
                  className="flex-shrink-0 border-r border-border/40 bg-card sticky left-0 z-30"
                  style={{ width: LABEL_WIDTH }}
                />
                <div className="flex" style={{ width: totalGridWidth }}>
                  {dates.map((d, i) => {
                    const isToday = toDateStr(d) === todayStr;
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div
                        key={i}
                        className={`flex-shrink-0 border-r border-border/20 flex flex-col items-center justify-center py-2 gap-0.5 select-none
                          ${isToday ? "bg-primary/15 border-r-primary/40" : isWeekend ? "bg-muted/20" : ""}`}
                        style={{ width: DAY_PX }}
                      >
                        <span className={`text-[10px] font-medium uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                          {formatDayOfWeek(d)}
                        </span>
                        <span className={`text-xs font-bold ${isToday ? "text-primary bg-primary/20 px-1.5 py-0.5 rounded-md" : "text-foreground"}`}>
                          {d.getDate()}
                        </span>
                        <span className={`text-[9px] ${isToday ? "text-primary/70" : "text-muted-foreground/70"}`}>
                          {d.toLocaleDateString("en-GB", { month: "short" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Groups (model or category) ── */}
              {groups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.key);
                const visibleBookedCount = group.vehicles.filter((v) =>
                  v.bookings.some((b) => isBookingVisible(b, rangeStart, rangeEnd)),
                ).length;

                return (
                  <div key={group.key}>
                    {/* Group header row — click to collapse/expand */}
                    <div
                      className="flex border-b border-border/30 bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer select-none"
                      onClick={() => toggleGroup(group.key)}
                    >
                      <div
                        className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-r border-border/30 bg-muted/25 sticky left-0 z-10"
                        style={{ width: LABEL_WIDTH }}
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`}
                        />
                        <span className="text-xs font-semibold text-foreground truncate flex-1">
                          {group.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 tabular-nums whitespace-nowrap">
                          {group.vehicles.length}
                          {visibleBookedCount > 0 && (
                            <span className="text-primary/70"> · {visibleBookedCount}↑</span>
                          )}
                        </span>
                      </div>
                      {/* Grid lines in group header */}
                      <div className="flex-shrink-0 relative" style={{ width: totalGridWidth, height: 32 }}>
                        {dates.map((d, i) => {
                          const isToday = toDateStr(d) === todayStr;
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return (
                            <div
                              key={i}
                              className={`absolute top-0 bottom-0 border-r border-border/10 ${isToday ? "bg-primary/5" : isWeekend ? "bg-muted/10" : ""}`}
                              style={{ left: i * DAY_PX, width: DAY_PX }}
                            />
                          );
                        })}
                        {todayIdx >= 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-primary/25 pointer-events-none"
                            style={{ left: todayIdx * DAY_PX + DAY_PX / 2 - 1 }}
                          />
                        )}
                      </div>
                    </div>

                    {/* Vehicle rows — hidden when group is collapsed */}
                    {!isCollapsed &&
                      group.vehicles.map((vehicle) => {
                        const rowHasConflict = hasConflict(vehicle.bookings);
                        // Compact label: "ModelName Plate" — brand not repeated since it's in the group header
                        const compactLabel = `${vehicle.modelName || vehicle.label} ${vehicle.plate || vehicle.id}`.trim();

                        return (
                          <div
                            key={vehicle.id}
                            className={`flex border-b border-border/20 hover:bg-muted/10 transition-colors group ${rowHasConflict ? "bg-orange-500/5" : ""}`}
                          >
                            {/* Vehicle label — sticky left, click opens VehicleDetail */}
                            <div
                              className="flex-shrink-0 flex flex-col justify-center px-2 py-2 border-r border-border/30 gap-0.5 bg-card sticky left-0 z-10 cursor-pointer hover:bg-muted/10 transition-colors"
                              style={{ width: LABEL_WIDTH }}
                              onClick={() => setDetailVehicleId(vehicle.id)}
                              title="Open vehicle detail"
                            >
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-[11px] font-mono font-semibold text-foreground truncate flex-1">
                                  {compactLabel}
                                </span>
                                {rowHasConflict && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertTriangle className="w-3 h-3 text-orange-400 flex-shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      <p className="text-xs">Booking conflict detected</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                              {LABEL_WIDTH > 160 && vehicle.status && (
                                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] h-4 px-1 py-0 ${VEHICLE_STATUS_COLORS[vehicle.status]}`}
                                  >
                                    {vehicle.status}
                                  </Badge>
                                  {vehicle.city && (
                                    <span className="text-[9px] text-muted-foreground/70">{vehicle.city}</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Timeline area */}
                            <div
                              className="relative flex-shrink-0"
                              style={{ width: totalGridWidth, height: 60 }}
                            >
                              {/* Day grid lines + today/weekend highlight (unchanged) */}
                              {dates.map((d, i) => {
                                const isToday = toDateStr(d) === todayStr;
                                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                                return (
                                  <div
                                    key={i}
                                    className={`absolute top-0 bottom-0 border-r border-border/15 ${isToday ? "bg-primary/8" : isWeekend ? "bg-muted/15" : ""}`}
                                    style={{ left: i * DAY_PX, width: DAY_PX }}
                                  />
                                );
                              })}

                              {/* Today vertical line (unchanged) */}
                              {todayIdx >= 0 && (
                                <div
                                  className="absolute top-0 bottom-0 w-0.5 bg-primary/40 z-10 pointer-events-none"
                                  style={{ left: todayIdx * DAY_PX + DAY_PX / 2 - 1 }}
                                />
                              )}

                              {/* Booking bars — click opens BookingDetail inline */}
                              {vehicle.bookings.map((booking) => {
                                const { left, width } = bookingBar(booking);
                                if (width <= 0) return null;
                                const { bar, text, dashed } = getBookingColors(booking, now);
                                const inConflict = isBookingInConflict(booking, vehicle.bookings);

                                return (
                                  <Tooltip key={booking.id}>
                                    <TooltipTrigger asChild>
                                      <button
                                        className={`absolute top-1/2 -translate-y-1/2 rounded border text-[10px] font-semibold
                                          truncate px-1.5 flex items-center gap-1 cursor-pointer transition-all
                                          ${bar} ${text}
                                          ${dashed ? "border-dashed" : ""}
                                          ${inConflict ? "ring-2 ring-orange-400/70 ring-offset-0" : ""}
                                          hover:z-20 hover:shadow-md`}
                                        style={{
                                          left: left + 2,
                                          width: Math.max(width - 4, 8),
                                          height: 28,
                                        }}
                                        onClick={() => setDetailBookingId(booking.id)}
                                      >
                                        {inConflict && <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />}
                                        <span className="truncate">
                                          #{booking.id} {booking.customerName}
                                        </span>
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[220px]">
                                      <div className="text-xs space-y-0.5">
                                        <div className="font-bold">Booking #{booking.id}</div>
                                        <div>{booking.customerName}</div>
                                        <div className="text-muted-foreground">
                                          {booking.pickupDate} → {booking.dropoffDate}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className={`inline-block w-2 h-2 rounded-full ${bar.split(" ")[0]}`} />
                                          {booking.status}
                                          {inConflict && (
                                            <span className="text-orange-400 font-bold ml-1">⚠ CONFLICT</span>
                                          )}
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}

                              {vehicle.bookings.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <span className="text-[10px] text-muted-foreground/30 italic">no bookings</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* ── Footer summary ── */}
      {data && !isLoading && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground px-1">
          <span>{data.vehicles.length} vehicle{data.vehicles.length !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{groups.length} {groupBy === "model" ? "model" : "categor"}{groups.length !== 1 ? (groupBy === "model" ? "s" : "ies") : (groupBy === "model" ? "" : "y")}</span>
          <span>·</span>
          <span>
            {data.vehicles.reduce((acc, v) => acc + v.bookings.length, 0)} booking
            {data.vehicles.reduce((acc, v) => acc + v.bookings.length, 0) !== 1 ? "s" : ""} in range
          </span>
          <span>·</span>
          <span>{startStr} → {endStr}</span>
          {data.vehicles.some((v) => hasConflict(v.bookings)) && (
            <>
              <span>·</span>
              <span className="text-orange-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Conflicts detected
              </span>
            </>
          )}
        </div>
      )}

      {/* Vehicle detail — label click */}
      <VehicleDetail
        vehicleId={detailVehicleId}
        open={detailVehicleId !== null}
        onClose={() => setDetailVehicleId(null)}
      />

      {/* Booking detail — bar click, stays on this page */}
      <BookingDetail
        bookingId={detailBookingId}
        open={detailBookingId !== null}
        onClose={() => setDetailBookingId(null)}
      />
    </div>
  );
}
