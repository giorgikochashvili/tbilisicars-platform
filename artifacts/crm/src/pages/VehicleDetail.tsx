import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Car, MapPin, Gauge, AlertTriangle, CalendarDays, Wrench,
  TrendingUp, ExternalLink, CheckCircle2, Clock, BarChart3, Activity,
  Image, Upload, Download, MessageCircle, Trash2, Check, Navigation
} from "lucide-react";
import { RecentActivity } from "@/components/RecentActivity";
import { formatBookingAmount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import BookingDetail from "./BookingDetail";

const REGIONS = ["Tbilisi", "Kutaisi", "Batumi"] as const;
type Region = typeof REGIONS[number];

const BASE = "/api";

function toStorageSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("/api/storage/")) return path;
  return `/api/storage${path}`;
}

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

function ModelImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const placeholder = (
    <div className="rounded-lg bg-muted/30 border border-border/30 flex items-center justify-center self-center" style={{ minHeight: "72px", minWidth: "112px" }}>
      <Car className="w-8 h-8 text-muted-foreground/30" />
    </div>
  );
  if (!src || failed) return placeholder;
  return (
    <img
      src={src}
      alt={alt}
      className="w-28 object-contain rounded-lg bg-muted/30 border border-border/30 self-center"
      style={{ maxHeight: "72px" }}
      onError={() => setFailed(true)}
    />
  );
}

export default function VehicleDetail({ vehicleId, open, onClose }: VehicleDetailProps) {
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [openBookingId, setOpenBookingId] = useState<number | null>(null);

  // ── Change location state ─────────────────────────────────────────────────
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationPending, setLocationPending] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // ── Vehicle Photos state ──────────────────────────────────────────────────
  const [photos, setPhotos] = useState<any[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(new Set());
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const fetchPhotos = useCallback(async () => {
    if (!vehicleId) return;
    try {
      const result = await apiFetch(`/admin/fleet/vehicles/${vehicleId}/photos`);
      setPhotos(result);
    } catch {
      // Non-critical
    }
  }, [vehicleId]);

  useEffect(() => {
    if (open && vehicleId) {
      fetchDetail();
      fetchPhotos();
      setSelectedPhotoIds(new Set());
      setLocationPickerOpen(false);
      setLocationError(null);
    } else {
      setData(null);
      setPhotos([]);
      setSelectedPhotoIds(new Set());
      setLocationPickerOpen(false);
      setLocationError(null);
    }
  }, [open, vehicleId]);

  const handleChangeRegion = async (city: Region) => {
    if (!vehicleId || locationPending) return;
    setLocationPending(true);
    setLocationError(null);
    try {
      const res = await fetch(`${BASE}/admin/fleet/vehicles/${vehicleId}/location`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ city }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.message || body?.error || `Error ${res.status}`;
        setLocationError(msg);
        return;
      }
      setLocationPickerOpen(false);
      toast({ title: `Vehicle region changed to ${city}` });
      fetchDetail();
      window.dispatchEvent(new CustomEvent("fleetListRefresh"));
    } catch (e: any) {
      setLocationError(e.message || "Unexpected error");
    } finally {
      setLocationPending(false);
    }
  };

  useEffect(() => {
    const handler = (e: CustomEvent<{ vehicleId: number }>) => {
      if (e.detail.vehicleId === vehicleId && open) fetchDetail();
    };
    window.addEventListener("vehicleDetailRefresh", handler as EventListener);
    return () => window.removeEventListener("vehicleDetailRefresh", handler as EventListener);
  }, [vehicleId, open, fetchDetail]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !vehicleId) return;
    setPhotoUploading(true);
    let uploadedCount = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) { toast({ title: `${file.name} is not an image`, variant: "destructive" }); continue; }
      if (file.size > 20 * 1024 * 1024) { toast({ title: `${file.name} is too large (max 20 MB)`, variant: "destructive" }); continue; }
      try {
        const metaRes = await fetch(`${BASE}/storage/uploads/request-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        });
        if (!metaRes.ok) throw new Error("Failed to get upload URL");
        const { uploadURL, objectPath } = await metaRes.json();
        const putRes = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!putRes.ok) throw new Error("Failed to upload file");
        const saveRes = await fetch(`${BASE}/admin/fleet/vehicles/${vehicleId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ photoUrl: objectPath }),
        });
        if (!saveRes.ok) throw new Error("Failed to save photo record");
        uploadedCount++;
      } catch (err: any) {
        toast({ title: `Upload failed for ${file.name}`, description: err.message, variant: "destructive" });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPhotoUploading(false);
    if (uploadedCount > 0) { await fetchPhotos(); toast({ title: `${uploadedCount} photo${uploadedCount > 1 ? "s" : ""} uploaded` }); }
  };

  const handleDeleteSelected = async () => {
    if (!vehicleId || selectedPhotoIds.size === 0) return;
    let deletedCount = 0;
    for (const photoId of Array.from(selectedPhotoIds)) {
      try {
        const res = await fetch(`${BASE}/admin/fleet/vehicles/${vehicleId}/photos/${photoId}`, { method: "DELETE", credentials: "include" });
        if (res.ok) deletedCount++;
        else toast({ title: `Failed to delete photo ${photoId}`, variant: "destructive" });
      } catch (err: any) {
        toast({ title: `Delete error`, description: err.message, variant: "destructive" });
      }
    }
    setSelectedPhotoIds(new Set());
    await fetchPhotos();
    if (deletedCount > 0) toast({ title: `${deletedCount} photo${deletedCount > 1 ? "s" : ""} deleted` });
  };

  const handleWhatsAppShare = () => {
    const selected = photos.filter((p) => selectedPhotoIds.has(p.id));
    const urls = selected.map((p) => {
      const src = toStorageSrc(p.photoUrl);
      if (!src) return "";
      return src.startsWith("http") ? src : `${window.location.origin}${src}`;
    }).filter(Boolean);
    const text = urls.join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleDownloadSelected = () => {
    const selected = photos.filter((p) => selectedPhotoIds.has(p.id));
    selected.forEach((p, i) => {
      setTimeout(() => {
        const src = toStorageSrc(p.photoUrl);
        if (!src) return;
        const a = document.createElement("a");
        a.href = src;
        a.download = `vehicle-photo-${p.id}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, i * 150);
    });
  };

  const togglePhoto = (id: number) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
                  {/* Key Stats + Model Image */}
                  <div className="flex flex-col gap-2 min-w-[160px] items-start">
                    {/* Model image */}
                    <ModelImage src={v.model?.imageUrl ? (toStorageSrc(v.model.imageUrl) ?? null) : null} alt={displayName ?? ""} />
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
                    {/* Change location action */}
                    <div className="mt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => { setLocationPickerOpen((o) => !o); setLocationError(null); }}
                        disabled={locationPending}
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        Change location
                      </Button>
                      {locationPickerOpen && (
                        <div className="mt-2 rounded-lg border border-border/50 bg-background p-3 space-y-2 shadow-sm">
                          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Select main region</div>
                          <div className="flex flex-col gap-1.5">
                            {REGIONS.map((city) => {
                              const isCurrent = v.location?.city === city;
                              return (
                                <button
                                  key={city}
                                  disabled={locationPending || isCurrent}
                                  onClick={() => handleChangeRegion(city)}
                                  className={`flex items-center gap-2 w-full text-left rounded-md px-3 py-2 text-sm font-medium transition-colors
                                    ${isCurrent
                                      ? "bg-primary/10 text-primary border border-primary/30 cursor-default"
                                      : "hover:bg-muted/50 border border-transparent hover:border-border/40 text-foreground"
                                    }
                                    disabled:opacity-60`}
                                >
                                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                                  {city}
                                  {isCurrent && <span className="ml-auto text-[10px] font-normal text-muted-foreground">current</span>}
                                </button>
                              );
                            })}
                          </div>
                          {locationError && (
                            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive mt-1">
                              {locationError}
                            </div>
                          )}
                          {locationPending && (
                            <div className="text-xs text-muted-foreground text-center py-1">Saving…</div>
                          )}
                        </div>
                      )}
                    </div>
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
                          <div className="font-mono font-bold">
                            {formatBookingAmount(data.currentBooking.total_amount, data.currentBooking.currency)}
                          </div>
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
                  <StatCard icon={TrendingUp} label="Total Revenue" value={fmtMoney(data.financial.totalRevenueGel)} sub="Total Revenue (GEL)" />
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

              {/* ─── Vehicle Photos ──────────────────────────────────────────── */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5" /> Vehicle Photos
                </h3>
                {/* Bulk action bar */}
                {selectedPhotoIds.size > 0 && (
                  <div className="flex items-center gap-2 mb-3 p-2 rounded-lg border border-border/40 bg-muted/20">
                    <span className="text-xs text-muted-foreground flex-1">{selectedPhotoIds.size} selected</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleWhatsAppShare}>
                      <MessageCircle className="w-3.5 h-3.5 text-green-500" /> WhatsApp
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleDownloadSelected}>
                      <Download className="w-3.5 h-3.5" /> Download
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={handleDeleteSelected}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                )}
                {/* Photo grid */}
                {photos.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mb-3">
                    {photos.map((photo: any) => {
                      const isSelected = selectedPhotoIds.has(photo.id);
                      return (
                        <div
                          key={photo.id}
                          className={`relative aspect-square rounded-lg overflow-hidden border cursor-pointer transition-all ${
                            isSelected ? "border-primary ring-2 ring-primary/40" : "border-border/40 hover:border-border/70"
                          }`}
                          onClick={() => togglePhoto(photo.id)}
                        >
                          <img
                            src={toStorageSrc(photo.photoUrl)}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "";
                              (e.target as HTMLImageElement).parentElement!.classList.add("bg-muted/40");
                            }}
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-3 h-3 text-primary-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/30 bg-muted/10 py-6 text-center text-sm text-muted-foreground mb-3">
                    <Image className="w-5 h-5 mx-auto mb-1.5 opacity-30" />
                    No photos yet. Upload vehicle images below.
                  </div>
                )}
                {/* Upload button */}
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={photoUploading}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    disabled={photoUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {photoUploading ? "Uploading…" : "Upload Photos"}
                  </Button>
                </div>
              </div>

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
                          <TableHead className="text-xs">Amount</TableHead>
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
                            <TableCell className="font-mono text-xs">
                              {b.total_amount != null ? formatBookingAmount(b.total_amount, b.currency) : "—"}
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
