import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Car, MapPin, Gauge, AlertTriangle, CalendarDays, Wrench,
  TrendingUp, ExternalLink, CheckCircle2, Clock, BarChart3, Activity
} from "lucide-react";
import { RecentActivity } from "@/components/RecentActivity";
import { Button } from "@/components/ui/button";
import BookingDetail from "./BookingDetail";

const BASE = "/api";

async function apiFetch(path: string) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    AVAILABLE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    RENTED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    MAINTENANCE: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    RESERVED: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    INACTIVE: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  };
  return (
    <Badge variant="outline" className={`text-[11px] font-bold uppercase tracking-wider ${colors[status] ?? "bg-gray-500/10 text-gray-400"}`}>
      {status}
    </Badge>
  );
}

function BookingStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-500/10 text-amber-500",
    CONFIRMED: "bg-blue-500/10 text-blue-500",
    DELIVERED: "bg-emerald-500/10 text-emerald-500",
    RETURNED: "bg-slate-500/10 text-slate-400",
    CANCELED: "bg-red-500/10 text-red-500",
    NO_SHOW: "bg-orange-500/10 text-orange-400",
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold uppercase ${colors[status] ?? "bg-gray-500/10 text-gray-400"}`}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function ServiceStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETED: "bg-emerald-500/10 text-emerald-500",
    IN_PROGRESS: "bg-blue-500/10 text-blue-500",
    SCHEDULED: "bg-amber-500/10 text-amber-400",
    CANCELED: "bg-red-500/10 text-red-500",
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold uppercase ${colors[status] ?? "bg-gray-500/10 text-gray-400"}`}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function AlertBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    OVERDUE: "bg-red-500/10 text-red-400 border-red-500/20",
    SERVICE_OVERDUE: "bg-red-500/10 text-red-400 border-red-500/20",
    SERVICE_DUE: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    SERVICE_WARNING: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    CONFLICT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] font-bold uppercase ${colors[type] ?? "bg-yellow-500/10 text-yellow-400"}`}>
      {type.replace(/_/g, " ")}
    </Badge>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-sm font-bold font-mono mt-0.5">{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface VehicleDetailProps {
  vehicleId: number | null;
  open: boolean;
  onClose: () => void;
}

export default function VehicleDetail({ vehicleId, open, onClose }: VehicleDetailProps) {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [openBookingId, setOpenBookingId] = useState<number | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    try {
      const result = await apiFetch(`/admin/fleet/vehicles/${vehicleId}/detail`);
      setData(result);
    } catch (e: any) {
      toast({ title: "Error loading vehicle", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    if (open && vehicleId) {
      fetchDetail();
    } else {
      setData(null);
    }
  }, [open, vehicleId]);

  const v = data?.vehicle;
  const displayName = v ? `${v.brand?.name ?? ""} ${v.model?.name ?? ""}`.trim() : "";

  const fmtDate = (d: string | null) => (d ? format(new Date(d), "MMM d, yyyy") : "—");
  const fmtMoney = (n: number) => `₾${n.toFixed(2)}`;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-[820px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <Car className="w-5 h-5 text-primary" />
              {loading ? "Loading vehicle…" : displayName || "Vehicle Detail"}
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="py-16 text-center text-muted-foreground text-sm">Loading vehicle data…</div>
          )}

          {!loading && data && (
            <div className="space-y-5 mt-1">

              {/* ─── Vehicle Header ──────────────────────────────────────────── */}
              <div className="rounded-xl border border-border/40 bg-gradient-to-br from-muted/30 to-muted/10 p-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Identity */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-black text-2xl tracking-widest text-foreground bg-muted border border-border/60 px-3 py-1.5 rounded-lg">
                        {v.licensePlate || "—"}
                      </span>
                      <StatusBadge status={v.status} />
                      {data.alerts?.length > 0 && (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                          <AlertTriangle className="w-3 h-3" /> {data.alerts.length} alert{data.alerts.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-foreground">{displayName}</div>
                    <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                      {v.color && (
                        <span className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: v.color.toLowerCase() }} />
                          {v.color}
                        </span>
                      )}
                      {v.year && <span>{v.year}</span>}
                      {v.model?.transmission && <span>{v.model.transmission}</span>}
                      {v.model?.fuelType && <span>{v.model.fuelType}</span>}
                      {v.model?.seats && <span>{v.model.seats} seats</span>}
                      {v.model?.category && <span className="uppercase">{v.model.category}</span>}
                    </div>
                    {v.techpassportNumber && <div className="mt-1 text-xs text-muted-foreground font-mono">Techpassport Number: {v.techpassportNumber}</div>}
                  </div>
                  {/* Key Stats */}
                  <div className="flex flex-col gap-2 min-w-[160px]">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Gauge className="w-4 h-4 text-muted-foreground" />
                      <span className="font-mono font-bold">{v.mileage != null ? `${v.mileage.toLocaleString()} km` : "—"}</span>
                    </div>
                    {v.location && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span>{v.location.name}{v.location.city ? `, ${v.location.city}` : ""}</span>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">Vehicle ID: {v.id}</div>
                  </div>
                </div>
              </div>

              {/* ─── Alerts ──────────────────────────────────────────────────── */}
              {data.alerts?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Active Alerts
                  </h3>
                  <div className="space-y-2">
                    {data.alerts.map((alert: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-border/40 bg-amber-500/5 p-3">
                        <AlertBadge type={alert.alertType} />
                        <span className="text-sm text-foreground/80 flex-1">{alert.message}</span>
                        {alert.bookingId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs gap-1 shrink-0"
                            onClick={() => setOpenBookingId(alert.bookingId)}
                          >
                            <ExternalLink className="w-3 h-3" /> Booking
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Current Booking ──────────────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Current Booking
                </h3>
                {data.currentBooking ? (
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Booking</div>
                        <div className="font-mono font-bold">#{data.currentBooking.id}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Customer</div>
                        <div className="font-medium">{data.currentBooking.customer_name || data.currentBooking.contact_full_name || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Status</div>
                        <BookingStatusBadge status={data.currentBooking.status} />
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Pickup</div>
                        <div>{fmtDate(data.currentBooking.pickup_datetime)}</div>
                        <div className="text-xs text-muted-foreground">{data.currentBooking.pickup_location}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Dropoff</div>
                        <div>{fmtDate(data.currentBooking.dropoff_datetime)}</div>
                        <div className="text-xs text-muted-foreground">{data.currentBooking.dropoff_location}</div>
                      </div>
                      {data.currentBooking.total_amount && (
                        <div>
                          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Amount</div>
                          <div className="font-mono font-bold">₾{parseFloat(data.currentBooking.total_amount).toFixed(2)}</div>
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5 text-xs"
                      onClick={() => setOpenBookingId(data.currentBooking.id)}
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open Booking
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/30 bg-muted/10 py-5 text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 mx-auto mb-1.5 opacity-30" />
                    No active booking
                  </div>
                )}
              </div>

              {/* ─── Financial Context ────────────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" /> Financial Overview
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard icon={CalendarDays} label="Total Bookings" value={String(data.financial.totalBookings)} />
                  <StatCard icon={TrendingUp} label="Total Revenue" value={fmtMoney(data.financial.totalRevenueGel)} sub="GEL bookings only" />
                  <StatCard icon={Wrench} label="Service Cost" value={fmtMoney(data.financial.totalServiceCost)} />
                  <StatCard icon={Gauge} label="Current Mileage" value={v.mileage != null ? `${v.mileage.toLocaleString()} km` : "—"} />
                </div>
              </div>

              {/* ─── Maintenance Status ───────────────────────────────────────── */}
              {(() => {
                const maintAlert = data.alerts?.find((a: any) =>
                  a.alertType === "SERVICE_OVERDUE" || a.alertType === "SERVICE_DUE" || a.alertType === "SERVICE_WARNING"
                );
                const hasMaintInfo = data.lastServiceDate || data.nextServiceDate || data.nextServiceMileage || v.mileage != null;
                if (!hasMaintInfo) return null;

                const severityStyle: Record<string, { border: string; bg: string; text: string; badge: string }> = {
                  SERVICE_OVERDUE: {
                    border: "border-red-500/30",
                    bg: "bg-red-500/5",
                    text: "text-red-400",
                    badge: "bg-red-500/15 text-red-400 border-red-500/30",
                  },
                  SERVICE_DUE: {
                    border: "border-orange-500/30",
                    bg: "bg-orange-500/5",
                    text: "text-orange-400",
                    badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
                  },
                  SERVICE_WARNING: {
                    border: "border-yellow-500/30",
                    bg: "bg-yellow-500/5",
                    text: "text-yellow-400",
                    badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
                  },
                };
                const sty = maintAlert ? severityStyle[maintAlert.alertType] : null;

                return (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5" /> Maintenance Status
                      {maintAlert && (
                        <Badge variant="outline" className={`ml-1 text-[10px] font-bold uppercase ${sty?.badge}`}>
                          {maintAlert.alertType.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </h3>
                    {maintAlert && (
                      <div className={`mb-3 rounded-lg border px-3 py-2 flex items-center gap-2 ${sty?.border} ${sty?.bg}`}>
                        <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${sty?.text}`} />
                        <span className={`text-sm font-medium ${sty?.text}`}>{maintAlert.message}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      <StatCard icon={Clock} label="Last Service Date" value={data.lastServiceDate ? fmtDate(data.lastServiceDate) : "—"} />
                      <StatCard icon={Gauge} label="Last Service Mileage" value={data.lastServiceMileage != null ? `${Number(data.lastServiceMileage).toLocaleString()} km` : "—"} />
                      <StatCard icon={CalendarDays} label="Next Service Date" value={data.nextServiceDate ? fmtDate(data.nextServiceDate) : "—"} />
                      <StatCard icon={Wrench} label="Next Service Mileage" value={data.nextServiceMileage != null ? `${Number(data.nextServiceMileage).toLocaleString()} km` : "—"} />
                      <StatCard icon={Gauge} label="Current Mileage" value={v.mileage != null ? `${v.mileage.toLocaleString()} km` : "—"} />
                    </div>
                  </div>
                );
              })()}

              {/* ─── Booking History ──────────────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Booking History
                  <span className="text-muted-foreground/50 font-normal normal-case">(last 20)</span>
                </h3>
                {data.bookingHistory?.length === 0 ? (
                  <div className="rounded-lg border border-border/30 bg-muted/10 py-6 text-center text-sm text-muted-foreground">
                    No booking history yet.
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="border-border/40 hover:bg-transparent">
                          <TableHead className="text-xs w-16">Ref</TableHead>
                          <TableHead className="text-xs">Customer</TableHead>
                          <TableHead className="text-xs">Pickup</TableHead>
                          <TableHead className="text-xs">Dropoff</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Source</TableHead>
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.bookingHistory.map((b: any) => (
                          <TableRow key={b.id} className="border-border/20 hover:bg-muted/20 text-sm">
                            <TableCell className="font-mono text-xs text-muted-foreground">#{b.id}</TableCell>
                            <TableCell className="text-sm">{b.customer_name || "—"}</TableCell>
                            <TableCell className="text-xs">
                              {b.pickup_datetime ? format(new Date(b.pickup_datetime), "MMM d, yy") : "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {b.dropoff_datetime ? format(new Date(b.dropoff_datetime), "MMM d, yy") : "—"}
                            </TableCell>
                            <TableCell><BookingStatusBadge status={b.status} /></TableCell>
                            <TableCell>
                              {b.source && b.source !== "admin" ? (
                                <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-1.5 py-0.5">
                                  {b.source}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground">CRM</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-primary"
                                onClick={() => setOpenBookingId(b.id)}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* ─── Service History ──────────────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" /> Service History
                </h3>
                {data.serviceHistory?.length === 0 ? (
                  <div className="rounded-lg border border-border/30 bg-muted/10 py-6 text-center text-sm text-muted-foreground">
                    No service records yet.
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/40 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="border-border/40 hover:bg-transparent">
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Type / Category</TableHead>
                          <TableHead className="text-xs">Mileage</TableHead>
                          <TableHead className="text-xs">Cost</TableHead>
                          <TableHead className="text-xs">Vendor</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.serviceHistory.map((s: any) => (
                          <TableRow key={s.id} className="border-border/20 hover:bg-muted/20 text-sm">
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {s.service_date ? format(new Date(s.service_date), "MMM d, yyyy") : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{s.service_type_name || "—"}</div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {s.mileage != null ? `${s.mileage.toLocaleString()} km` : "—"}
                            </TableCell>
                            <TableCell className="font-mono text-sm font-bold">
                              {s.cost != null ? `₾${parseFloat(s.cost).toFixed(2)}` : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.vendor || s.mechanic_name || "—"}
                            </TableCell>
                            <TableCell>
                              <ServiceStatusBadge status={s.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="border-t border-border/40 pt-5">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</h3>
                </div>
                <RecentActivity entityType="vehicle" entityId={vehicleId} limit={8} />
              </div>

            </div>
          )}

          {!loading && !data && vehicleId && (
            <div className="py-12 text-center text-muted-foreground text-sm">Vehicle not found.</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Nested booking detail dialog */}
      <BookingDetail
        bookingId={openBookingId}
        open={openBookingId !== null}
        onClose={() => setOpenBookingId(null)}
      />
    </>
  );
}
