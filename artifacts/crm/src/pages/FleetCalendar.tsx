import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft, ChevronRight, GanttChart, AlertTriangle,
  Car, MapPin, Calendar, Info,
} from "lucide-react";
import VehicleDetail from "./VehicleDetail";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ── Types ─────────────────────────────────────────────────────────────────────

type BookingStatus = "PENDING" | "CONFIRMED" | "DELIVERED" | "RETURNED" | "CANCELED" | "NO_SHOW";
type VehicleStatus = "AVAILABLE" | "RENTED" | "MAINTENANCE" | "RESERVED" | "INACTIVE";

interface Booking {
  id: number;
  status: BookingStatus;
  pickupDate: string;
  dropoffDate: string;
  customerName: string;
}

interface Vehicle {
  id: number;
  label: string;
  plate: string;
  status: VehicleStatus | null;
  city: string | null;
  bookings: Booking[];
}

interface CalendarData {
  vehicles: Vehicle[];
  dateRange: { start: string; end: string };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_PX = 44; // width of each day column in pixels
const LABEL_WIDTH_DESKTOP = 220; // vehicle label column width on desktop
const LABEL_WIDTH_MOBILE = 120; // vehicle label column width on mobile

const STATUS_COLORS: Record<BookingStatus, { bar: string; text: string }> = {
  PENDING: { bar: "bg-yellow-500/80 hover:bg-yellow-500 border-yellow-600/50", text: "text-yellow-950" },
  CONFIRMED: { bar: "bg-emerald-500/80 hover:bg-emerald-500 border-emerald-600/50", text: "text-emerald-950" },
  DELIVERED: { bar: "bg-blue-500/80 hover:bg-blue-500 border-blue-600/50", text: "text-blue-950" },
  RETURNED: { bar: "bg-slate-400/60 hover:bg-slate-400 border-slate-500/50", text: "text-slate-900" },
  CANCELED: { bar: "bg-red-500/70 hover:bg-red-500 border-red-600/50 line-through", text: "text-red-950" },
  NO_SHOW: { bar: "bg-orange-500/70 hover:bg-orange-500 border-orange-600/50", text: "text-orange-950" },
};

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

// ── API fetch ─────────────────────────────────────────────────────────────────

async function fetchCalendar(startDate: string, endDate: string, city: string): Promise<CalendarData> {
  const params = new URLSearchParams({ startDate, endDate });
  if (city !== "all") params.set("city", city);
  const res = await fetch(`/api/admin/fleet-calendar?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load calendar data");
  return res.json();
}

// ── Conflict detection ────────────────────────────────────────────────────────

function hasConflict(bookings: Booking[]): boolean {
  if (bookings.length < 2) return false;
  const sorted = [...bookings].sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));
  for (let i = 0; i < sorted.length - 1; i++) {
    // If current booking dropoff >= next booking pickup → overlap
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
  const [, navigate] = useLocation();
  const [detailVehicleId, setDetailVehicleId] = useState<number | null>(null);

  // Responsive label width
  const [labelWidth, setLabelWidth] = useState(
    typeof window !== "undefined" && window.innerWidth < 768 ? LABEL_WIDTH_MOBILE : LABEL_WIDTH_DESKTOP
  );
  useEffect(() => {
    const update = () => setLabelWidth(window.innerWidth < 768 ? LABEL_WIDTH_MOBILE : LABEL_WIDTH_DESKTOP);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Default: today to today + 13 (14 days)
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateStr(today), [today]);

  const [rangeSize, setRangeSize] = useState<7 | 14 | 30>(14);
  const [rangeStart, setRangeStart] = useState<Date>(() => addDays(today, -3));
  const [city, setCity] = useState("all");

  const rangeEnd = useMemo(() => addDays(rangeStart, rangeSize - 1), [rangeStart, rangeSize]);
  const startStr = toDateStr(rangeStart);
  const endStr = toDateStr(rangeEnd);

  // Build array of dates in visible range
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

  // Navigation
  const goBack = () => setRangeStart((d) => addDays(d, -rangeSize));
  const goForward = () => setRangeStart((d) => addDays(d, rangeSize));
  const goToday = () => setRangeStart(today);

  // Compute today column index
  const todayIdx = useMemo(() => {
    const diff = diffDays(rangeStart, today);
    return diff >= 0 && diff < rangeSize ? diff : -1;
  }, [rangeStart, today, rangeSize]);

  // Booking bar positioning within range
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

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500 h-full">
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

          {/* Range picker */}
          <Select value={String(rangeSize)} onValueChange={(v) => setRangeSize(Number(v) as any)}>
            <SelectTrigger className="w-[108px] h-9 text-sm">
              <Calendar className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="14">14 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
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
        <span className="text-xs text-muted-foreground font-medium">Status:</span>
        {(Object.keys(STATUS_COLORS) as BookingStatus[]).map((s) => (
          <span
            key={s}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${STATUS_COLORS[s].bar} ${STATUS_COLORS[s].text}`}
          >
            {s}
          </span>
        ))}
        <span className="ml-2 flex items-center gap-1 text-[10px] text-muted-foreground border border-orange-500/40 bg-orange-500/10 text-orange-400 px-2 py-0.5 rounded">
          <AlertTriangle className="w-3 h-3" /> Conflict
        </span>
      </div>

      {/* ── Timeline grid ── */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm overflow-hidden flex-1">
        {isLoading ? (
          <div className="p-6 space-y-3">
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
          <div className="overflow-auto" ref={scrollRef}>
            {/* Sticky outer wrapper */}
            <div style={{ minWidth: LABEL_WIDTH + totalGridWidth + 24 }}>
              {/* ── Date header row ── */}
              <div className="flex sticky top-0 z-20 bg-card border-b border-border/40 shadow-sm">
                {/* Empty vehicle label area — sticky left so corner stays fixed during horizontal scroll */}
                <div
                  className="flex-shrink-0 border-r border-border/40 bg-card sticky left-0 z-30"
                  style={{ width: LABEL_WIDTH }}
                />
                {/* Date columns header */}
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

              {/* ── Vehicle rows ── */}
              {data.vehicles.map((vehicle) => {
                const rowHasConflict = hasConflict(vehicle.bookings);
                return (
                  <div
                    key={vehicle.id}
                    className={`flex border-b border-border/20 hover:bg-muted/10 transition-colors group
                      ${rowHasConflict ? "bg-orange-500/5" : ""}`}
                  >
                    {/* Vehicle label — sticky left so names stay visible during horizontal scroll */}
                    <div
                      className="flex-shrink-0 flex flex-col justify-center px-3 py-2 border-r border-border/30 gap-1 bg-card sticky left-0 z-10 cursor-pointer hover:bg-muted/10 transition-colors group/label"
                      style={{ width: LABEL_WIDTH }}
                      onClick={() => setDetailVehicleId(vehicle.id)}
                      title="Open vehicle detail"
                    >
                      <div className="flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-semibold text-foreground truncate flex-1">
                          {vehicle.label}
                        </span>
                        <Info className="w-3 h-3 text-muted-foreground/40 group-hover/label:text-primary/60 flex-shrink-0 transition-colors" />
                        {rowHasConflict && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <p className="text-xs">Booking conflict detected</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                          {vehicle.plate}
                        </span>
                        {vehicle.status && (
                          <Badge
                            variant="outline"
                            className={`text-[9px] h-4 px-1 py-0 ${VEHICLE_STATUS_COLORS[vehicle.status]}`}
                          >
                            {vehicle.status}
                          </Badge>
                        )}
                        {vehicle.city && (
                          <span className="text-[9px] text-muted-foreground/70">{vehicle.city}</span>
                        )}
                      </div>
                    </div>

                    {/* Timeline area */}
                    <div
                      className="relative flex-shrink-0"
                      style={{ width: totalGridWidth, height: 60 }}
                    >
                      {/* Day grid lines + today highlight */}
                      {dates.map((d, i) => {
                        const isToday = toDateStr(d) === todayStr;
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return (
                          <div
                            key={i}
                            className={`absolute top-0 bottom-0 border-r border-border/15
                              ${isToday ? "bg-primary/8" : isWeekend ? "bg-muted/15" : ""}`}
                            style={{ left: i * DAY_PX, width: DAY_PX }}
                          />
                        );
                      })}

                      {/* Today vertical line */}
                      {todayIdx >= 0 && (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-primary/40 z-10 pointer-events-none"
                          style={{ left: todayIdx * DAY_PX + DAY_PX / 2 - 1 }}
                        />
                      )}

                      {/* Booking bars */}
                      {vehicle.bookings.map((booking) => {
                        const { left, width } = bookingBar(booking);
                        if (width <= 0) return null;
                        const colors = STATUS_COLORS[booking.status] ?? STATUS_COLORS.PENDING;
                        const inConflict = isBookingInConflict(booking, vehicle.bookings);

                        return (
                          <Tooltip key={booking.id}>
                            <TooltipTrigger asChild>
                              <button
                                className={`absolute top-1/2 -translate-y-1/2 rounded border text-[10px] font-semibold
                                  truncate px-1.5 flex items-center gap-1 cursor-pointer transition-all
                                  ${colors.bar} ${colors.text}
                                  ${inConflict ? "ring-2 ring-orange-400/70 ring-offset-0" : ""}
                                  hover:z-20 hover:shadow-md`}
                                style={{
                                  left: left + 2,
                                  width: Math.max(width - 4, 8),
                                  height: 28,
                                }}
                                onClick={() => navigate("/bookings")}
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
                                  <span
                                    className={`inline-block w-2 h-2 rounded-full ${colors.bar.split(" ")[0]}`}
                                  />
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

                      {/* Empty state for vehicle with no bookings */}
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
          </div>
        )}
      </Card>

      {/* ── Footer summary ── */}
      {data && !isLoading && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
          <span>{data.vehicles.length} vehicle{data.vehicles.length !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>
            {data.vehicles.reduce((acc, v) => acc + v.bookings.length, 0)} booking{data.vehicles.reduce((acc, v) => acc + v.bookings.length, 0) !== 1 ? "s" : ""} in range
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

      <VehicleDetail
        vehicleId={detailVehicleId}
        open={detailVehicleId !== null}
        onClose={() => setDetailVehicleId(null)}
      />
    </div>
  );
}
