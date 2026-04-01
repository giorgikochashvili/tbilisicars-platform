import { useState, useEffect, useCallback, type ReactElement } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  Plus,
  Trash2,
  CreditCard,
  Wallet,
  Landmark,
  HelpCircle,
  FileText,
  Ticket,
  Receipt,
  ChevronDown,
  ClipboardList,
  ClipboardCheck,
  Activity,
  Car,
  RotateCcw,
  Upload,
  X,
  Check,
  Fuel,
  Gauge,
  User,
  Calendar,
  ImageIcon,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { RecentActivity } from "@/components/RecentActivity";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const BASE = "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || body?.errors?.[0] || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Upload helper ────────────────────────────────────────────────────────────

async function uploadFile(file: File): Promise<string> {
  const metaRes = await fetch(`${BASE}/storage/uploads/request-url`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
  });
  if (!metaRes.ok) throw new Error("Failed to get upload URL");
  const { uploadURL, objectPath } = await metaRes.json();
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!putRes.ok) throw new Error("Failed to upload file");
  return objectPath as string;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  BOOKING_PAYMENT: "Booking Payment",
  DEPOSIT_RECEIVED: "Deposit Received",
  DEPOSIT_RETURNED: "Deposit Returned",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

const METHOD_ICONS: Record<string, ReactElement> = {
  CASH: <Wallet className="w-3 h-3" />,
  CARD: <CreditCard className="w-3 h-3" />,
  BANK_TRANSFER: <Landmark className="w-3 h-3" />,
  OTHER: <HelpCircle className="w-3 h-3" />,
};

function toStorageSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("/api/storage/")) return path;
  return `/api/storage${path}`;
}

function typeColor(type: string) {
  const map: Record<string, string> = {
    BOOKING_PAYMENT: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    DEPOSIT_RECEIVED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    DEPOSIT_RETURNED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    REFUND: "bg-red-500/10 text-red-400 border-red-500/20",
    ADJUSTMENT: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return map[type] ?? "bg-muted text-muted-foreground";
}

function currencySymbol(c: string) {
  return c === "GEL" ? "₾" : c === "USD" ? "$" : "€";
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = true,
  badge,
  action,
}: {
  title: string;
  icon?: ReactElement;
  children: ReactElement;
  defaultOpen?: boolean;
  badge?: ReactElement;
  action?: ReactElement;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
          {badge}
        </div>
        <div className="flex items-center gap-2">
          {action && <span onClick={(e) => e.stopPropagation()}>{action}</span>}
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      <div
        className={`transition-all duration-200 ease-in-out overflow-hidden ${open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ─── Payment Summary Card ────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3 flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      <span className="text-lg font-bold font-mono">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ─── Empty Payment Form ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  paymentType: "",
  amount: "",
  currency: "GEL",
  paymentDate: new Date().toISOString().slice(0, 10),
  method: "",
  notes: "",
};

// ─── Handover Form ────────────────────────────────────────────────────────────

type FileItem = {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "uploading" | "done" | "error";
  path?: string;
  error?: string;
};

const EMPTY_HANDOVER = {
  actionDate: new Date().toISOString().slice(0, 10),
  actionTime: `${new Date().getHours().toString().padStart(2, "0")}:${(Math.floor(new Date().getMinutes() / 15) * 15).toString().padStart(2, "0")}`,
  mileage: "",
  fuelLevel: "",
  notes: "",
};

// ─── 15-minute time slots for HandoverDateTimePicker ─────────────────────────

const HAND_TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4).toString().padStart(2, "0");
  const m = ((i % 4) * 15).toString().padStart(2, "0");
  return `${h}:${m}`;
});

// ─── Handover Date/Time Picker ────────────────────────────────────────────────

function HandoverDateTimePicker({
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  required,
}: {
  label: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (d: string) => void;
  onTimeChange: (t: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = dateValue ? new Date(dateValue + "T12:00:00") : undefined;
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex-1 justify-start text-left font-normal h-8 text-xs">
              <Calendar className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
              {dateValue
                ? format(new Date(dateValue + "T12:00:00"), "MMM d, yyyy")
                : <span className="text-muted-foreground">Pick date…</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (d) {
                  onDateChange(format(d, "yyyy-MM-dd"));
                  setOpen(false);
                }
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        <Select value={timeValue} onValueChange={onTimeChange}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {HAND_TIME_SLOTS.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Fuel level display ───────────────────────────────────────────────────────

function FuelBar({ level }: { level: number }) {
  const pct = Math.max(0, Math.min(100, level));
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
    </div>
  );
}

// ─── Handover display ────────────────────────────────────────────────────────

function HandoverDisplay({ handover, type }: { handover: any; type: "pickup" | "dropoff" }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Action Time
          </div>
          <div className="text-sm font-medium">
            {handover.actionAt ? format(new Date(handover.actionAt), "MMM d, yyyy HH:mm") : "—"}
          </div>
        </div>
        {handover.mileage != null && (
          <div>
            <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-1 flex items-center gap-1">
              <Gauge className="w-3 h-3" /> Mileage
            </div>
            <div className="text-sm font-mono font-medium">{handover.mileage.toLocaleString()} km</div>
          </div>
        )}
        {handover.fuelLevel != null && (
          <div>
            <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-1 flex items-center gap-1">
              <Fuel className="w-3 h-3" /> Fuel Level
            </div>
            <FuelBar level={handover.fuelLevel} />
          </div>
        )}
        {handover.performedByAdminName && (
          <div>
            <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-1 flex items-center gap-1">
              <User className="w-3 h-3" /> Performed By
            </div>
            <div className="text-sm font-medium">{handover.performedByAdminName}</div>
          </div>
        )}
        {handover.notes && (
          <div className="col-span-2 sm:col-span-3">
            <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-1">Notes</div>
            <div className="text-sm text-muted-foreground">{handover.notes}</div>
          </div>
        )}
      </div>

      {handover.photos && handover.photos.length > 0 && (
        <div>
          <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-2 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> Photos ({handover.photos.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {handover.photos.map((url: string, i: number) => (
              <a
                key={i}
                href={toStorageSrc(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-20 h-20 rounded-lg overflow-hidden border border-border/40 hover:border-primary/50 transition-colors bg-muted/20"
              >
                <img
                  src={toStorageSrc(url)}
                  alt={`${type} photo ${i + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Handover Modal (top-level — must NOT be defined inside BookingDetail) ────
// Defining it inside BookingDetail would create a new component reference on
// every render, causing React to unmount/remount the Dialog on every keystroke.

interface HandoverModalProps {
  type: "pickup" | "dropoff";
  open: boolean;
  onClose: () => void;
  handoverForm: { actionDate: string; actionTime: string; mileage: string; fuelLevel: string; notes: string };
  setHandoverForm: React.Dispatch<React.SetStateAction<{ actionDate: string; actionTime: string; mileage: string; fuelLevel: string; notes: string }>>;
  savingHandover: boolean;
  onSubmit: (type: "pickup" | "dropoff", photoUrls: string[]) => Promise<void>;
}

function HandoverModal({
  type, open, onClose,
  handoverForm, setHandoverForm,
  savingHandover, onSubmit,
}: HandoverModalProps) {
  const { toast } = useToast();
  const [fileItems, setFileItems] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);

  const title = type === "pickup" ? "Record Pick Up" : "Record Drop Off";
  const Icon = type === "pickup" ? Car : RotateCcw;
  const accentClass = type === "pickup" ? "text-emerald-400" : "text-blue-400";
  const MAX_MB = 20;

  const handleModalClose = () => {
    fileItems.forEach((fi) => URL.revokeObjectURL(fi.preview));
    setFileItems([]);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const accepted: FileItem[] = [];
    const skipped: string[] = [];
    for (const f of Array.from(e.target.files ?? [])) {
      const isDupe = fileItems.some((fi) => fi.file.name === f.name && fi.file.size === f.size);
      if (isDupe) {
        skipped.push(`${f.name} (duplicate)`);
      } else if (f.size > MAX_MB * 1024 * 1024) {
        skipped.push(`${f.name} (too large)`);
      } else if (!f.type.startsWith("image/")) {
        skipped.push(`${f.name} (not an image)`);
      } else {
        accepted.push({ id: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f), status: "pending" });
      }
    }
    if (skipped.length) {
      toast({ title: "Files skipped", description: skipped.join(", "), variant: "destructive" });
    }
    setFileItems((prev) => [...prev, ...accepted]);
    e.target.value = "";
  };

  const handleRemove = (id: string) => {
    setFileItems((prev) => {
      const fi = prev.find((f) => f.id === id);
      if (fi) URL.revokeObjectURL(fi.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleRecord = async () => {
    const toUpload = fileItems.filter((fi) => fi.status === "pending" || fi.status === "error");

    if (toUpload.length > 0) {
      setUploading(true);
      setFileItems((prev) =>
        prev.map((fi) =>
          fi.status === "pending" || fi.status === "error"
            ? { ...fi, status: "uploading", error: undefined }
            : fi
        )
      );

      const results = await Promise.allSettled(
        toUpload.map((fi) => uploadFile(fi.file).then((path) => ({ id: fi.id, path })))
      );

      // Collect resolved paths directly from results — avoids stale fileItems closure
      const newPaths = new Map<string, string>();
      // Derive hasError from results before any state update (deterministic)
      const hasError = results.some((r) => r.status === "rejected");

      setFileItems((prev) => {
        const updated = [...prev];
        results.forEach((r, i) => {
          const idx = updated.findIndex((fi) => fi.id === toUpload[i].id);
          if (r.status === "fulfilled") {
            updated[idx] = { ...updated[idx], status: "done", path: r.value.path };
            newPaths.set(toUpload[i].id, r.value.path);
          } else {
            updated[idx] = { ...updated[idx], status: "error", error: (r.reason as Error)?.message ?? "Upload failed" };
          }
        });
        return updated;
      });
      setUploading(false);

      if (hasError) {
        toast({
          title: "Some uploads failed",
          description: "Retry failed files or remove them before recording.",
          variant: "destructive",
        });
        return;
      }

      // Already-done files (not in this upload batch) + newly uploaded
      const uploadedIds = new Set(toUpload.map((fi) => fi.id));
      const prevDone = fileItems
        .filter((fi) => fi.status === "done" && !uploadedIds.has(fi.id))
        .map((fi) => fi.path!);
      const photoUrls = [...prevDone, ...Array.from(newPaths.values())];
      await onSubmit(type, photoUrls);
      // Clear file state after successful submit
      setFileItems((prev) => { prev.forEach((fi) => URL.revokeObjectURL(fi.preview)); return []; });
    } else {
      // No pending files — submit with already-done file paths
      const photoUrls = fileItems.filter((fi) => fi.status === "done").map((fi) => fi.path!);
      await onSubmit(type, photoUrls);
      // Clear file state after successful submit
      setFileItems((prev) => { prev.forEach((fi) => URL.revokeObjectURL(fi.preview)); return []; });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleModalClose(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${accentClass}`} />
            {title}
          </DialogTitle>
          <DialogDescription>
            Record the vehicle {type === "pickup" ? "pick up" : "drop off"} details. This will update the booking status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <HandoverDateTimePicker
                label="Action Date & Time"
                dateValue={handoverForm.actionDate}
                timeValue={handoverForm.actionTime}
                onDateChange={(d) => setHandoverForm((prev) => ({ ...prev, actionDate: d }))}
                onTimeChange={(t) => setHandoverForm((prev) => ({ ...prev, actionTime: t }))}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Mileage (km)</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 45200"
                value={handoverForm.mileage}
                onChange={(e) => setHandoverForm((prev) => ({ ...prev, mileage: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Fuel Level (0–100%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="e.g. 75"
                value={handoverForm.fuelLevel}
                onChange={(e) => setHandoverForm((prev) => ({ ...prev, fuelLevel: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                placeholder="Optional notes about the vehicle condition…"
                value={handoverForm.notes}
                onChange={(e) => setHandoverForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="text-xs resize-none"
                rows={2}
              />
            </div>
          </div>

          {/* Photo upload */}
          <div className="grid gap-1.5">
            <Label className="text-xs">Photos</Label>
            <div className="rounded-lg border border-dashed border-border/60 p-3 bg-muted/10">
              <label className="flex flex-col items-center gap-1.5 cursor-pointer">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Click to add photos</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>
            {fileItems.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {fileItems.map((fi) => (
                  <div
                    key={fi.id}
                    className={`relative w-16 h-16 rounded-lg overflow-hidden border bg-muted/20 ${
                      fi.status === "error"
                        ? "border-red-500/60"
                        : fi.status === "done"
                        ? "border-emerald-500/40"
                        : "border-border/40"
                    }`}
                  >
                    <img src={fi.preview} alt={fi.file.name} className="w-full h-full object-cover" />
                    {fi.status === "uploading" && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {fi.status === "done" && (
                      <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    {fi.status === "error" && (
                      <button
                        type="button"
                        title={fi.error ?? "Upload failed — click to retry"}
                        className="absolute bottom-0.5 left-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400 transition-colors"
                        onClick={() =>
                          setFileItems((prev) =>
                            prev.map((f) =>
                              f.id === fi.id ? { ...f, status: "pending", error: undefined } : f
                            )
                          )
                        }
                      >
                        <RotateCcw className="w-2.5 h-2.5 text-white" />
                      </button>
                    )}
                    {fi.status !== "uploading" && (
                      <button
                        type="button"
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                        onClick={() => handleRemove(fi.id)}
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleModalClose} disabled={savingHandover || uploading}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleRecord}
              disabled={savingHandover || uploading || fileItems.some((fi) => fi.status === "uploading")}
            >
              {savingHandover || uploading ? "Saving…" : `Record ${type === "pickup" ? "Pick Up" : "Drop Off"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface BookingDetailProps {
  bookingId: number | null;
  open: boolean;
  onClose: () => void;
  onPaymentChanged?: () => void;
  onEditBooking?: (bookingData: any) => void;
}

export default function BookingDetail({ bookingId, open, onClose, onPaymentChanged, onEditBooking }: BookingDetailProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [booking, setBooking] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [handovers, setHandovers] = useState<{ pickup: any | null; dropoff: any | null }>({ pickup: null, dropoff: null });
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Handover modal state
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showDropoffModal, setShowDropoffModal] = useState(false);
  const [handoverForm, setHandoverForm] = useState(EMPTY_HANDOVER);
  const [savingHandover, setSavingHandover] = useState(false);

  // Overview quick-edit state
  const [isOverviewEditing, setIsOverviewEditing] = useState(false);
  const [overviewDraft, setOverviewDraft] = useState({ totalAmount: "", currency: "GEL", notes: "", pickupLocationId: "", dropoffLocationId: "" });
  const [overviewLocations, setOverviewLocations] = useState<any[]>([]);
  const [savingOverview, setSavingOverview] = useState(false);

  const fetchBooking = useCallback(async () => {
    if (!bookingId) return;
    setLoadingBooking(true);
    try {
      const data = await apiFetch(`/admin/bookings/${bookingId}`);
      setBooking(data);
      setForm((prev) => ({ ...prev, currency: data.currency ?? "GEL" }));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingBooking(false);
    }
  }, [bookingId]);

  const fetchPayments = useCallback(async () => {
    if (!bookingId) return;
    setLoadingPayments(true);
    try {
      const data = await apiFetch(`/admin/bookings/${bookingId}/payments`);
      setPayments(data.payments ?? []);
      setSummary(data.summary ?? null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoadingPayments(false);
    }
  }, [bookingId]);

  const fetchHandovers = useCallback(async () => {
    if (!bookingId) return;
    try {
      const data = await apiFetch(`/admin/bookings/${bookingId}/handovers`);
      setHandovers(data);
    } catch {
      // Non-critical
    }
  }, [bookingId]);

  useEffect(() => {
    if (open && bookingId) {
      fetchBooking();
      fetchPayments();
      fetchHandovers();
      setShowAddForm(false);
      setForm(EMPTY_FORM);
    }
  }, [open, bookingId]);

  const handleAddPayment = async () => {
    if (!bookingId) return;
    const errors: string[] = [];
    if (!form.paymentType) errors.push("Payment type is required");
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) errors.push("Amount must be positive");
    if (!form.method) errors.push("Payment method is required");
    if (!form.paymentDate) errors.push("Payment date is required");

    if (errors.length > 0) {
      toast({ title: "Validation", description: errors.join(" · "), variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/admin/bookings/${bookingId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          paymentType: form.paymentType,
          amount: Number(form.amount),
          currency: form.currency,
          paymentDate: form.paymentDate,
          method: form.method,
          notes: form.notes || null,
        }),
      });
      toast({ title: "Payment Added", description: `${PAYMENT_TYPE_LABELS[form.paymentType] ?? form.paymentType} of ${currencySymbol(form.currency)}${form.amount} recorded.` });
      setForm({ ...EMPTY_FORM, currency: booking?.currency ?? "GEL" });
      setShowAddForm(false);
      fetchPayments();
      fetchBooking();
      onPaymentChanged?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!bookingId) return;
    if (!window.confirm("Delete this payment record? The linked accounting entry will also be removed.")) return;
    try {
      await apiFetch(`/admin/bookings/${bookingId}/payments/${paymentId}`, { method: "DELETE" });
      toast({ title: "Payment Deleted" });
      fetchPayments();
      fetchBooking();
      onPaymentChanged?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleHandoverSubmit = async (type: "pickup" | "dropoff", photoUrls: string[]) => {
    if (!bookingId) return;
    if (!handoverForm.actionDate) {
      toast({ title: "Validation", description: "Action date is required.", variant: "destructive" });
      return;
    }

    setSavingHandover(true);
    try {
      const actionAt = new Date(`${handoverForm.actionDate}T${handoverForm.actionTime}:00`).toISOString();
      const endpoint = type === "pickup" ? "pickup" : "dropoff";
      await apiFetch(`/admin/bookings/${bookingId}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({
          actionAt,
          mileage: handoverForm.mileage ? parseInt(handoverForm.mileage, 10) : null,
          fuelLevel: handoverForm.fuelLevel ? parseInt(handoverForm.fuelLevel, 10) : null,
          notes: handoverForm.notes || null,
          photoUrls,
        }),
      });

      toast({
        title: type === "pickup" ? "Pick Up Recorded" : "Drop Off Recorded",
        description: `${type === "pickup" ? "Pick up" : "Drop off"} has been successfully recorded and booking status updated.`,
      });

      if (type === "pickup") setShowPickupModal(false);
      else setShowDropoffModal(false);

      setHandoverForm(EMPTY_HANDOVER);
      fetchBooking();
      fetchHandovers();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      throw e; // rethrow so HandoverModal does not clear files on API failure
    } finally {
      setSavingHandover(false);
    }
  };

  const openHandoverModal = (type: "pickup" | "dropoff") => {
    const now = new Date();
    setHandoverForm({
      ...EMPTY_HANDOVER,
      actionDate: now.toISOString().slice(0, 10),
      actionTime: `${now.getHours().toString().padStart(2, "0")}:${(Math.floor(now.getMinutes() / 15) * 15).toString().padStart(2, "0")}`,
    });
    if (type === "pickup") setShowPickupModal(true);
    else setShowDropoffModal(true);
  };

  const enterOverviewEdit = () => {
    setOverviewDraft({
      totalAmount: booking?.totalAmount ?? "",
      currency: booking?.currency ?? "GEL",
      notes: booking?.notes ?? "",
      pickupLocationId: booking?.pickupLocationId?.toString() ?? "",
      dropoffLocationId: booking?.dropoffLocationId?.toString() ?? "",
    });
    if (overviewLocations.length === 0) {
      apiFetch("/locations").then((data: any) => setOverviewLocations(data || [])).catch(() => {});
    }
    setIsOverviewEditing(true);
  };

  const saveOverview = async () => {
    setSavingOverview(true);
    try {
      await apiFetch(`/admin/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(overviewDraft.totalAmount !== "" ? { totalAmount: overviewDraft.totalAmount } : {}),
          currency: overviewDraft.currency,
          notes: overviewDraft.notes || null,
          ...(overviewDraft.pickupLocationId ? { pickupLocationId: parseInt(overviewDraft.pickupLocationId) } : {}),
          ...(overviewDraft.dropoffLocationId ? { dropoffLocationId: parseInt(overviewDraft.dropoffLocationId) } : {}),
        }),
      });
      setIsOverviewEditing(false);
      fetchBooking();
      toast({ title: "Booking updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingOverview(false);
    }
  };

  const fmt = (v: number) => `${currencySymbol(booking?.currency ?? "GEL")}${v.toFixed(2)}`;
  const totalPrice = booking?.totalAmount ? parseFloat(booking.totalAmount) : null;
  const remaining = totalPrice != null
    ? (summary ? totalPrice - summary.totalPaid : totalPrice)
    : null;

  const canPickUp = booking?.status === "CONFIRMED" && !handovers.pickup;
  const canDropOff = booking?.status === "DELIVERED" && !handovers.dropoff;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              Booking #{bookingId}
              {booking?.status && (
                <Badge variant="outline" className="text-[10px] font-bold uppercase">
                  {booking.status.replace("_", " ")}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {loadingBooking ? "Loading…" : booking ? (
                <>
                  {booking.customer?.fullName || booking.contactFullName || "—"} ·{" "}
                  {booking.pickupDatetime ? format(new Date(booking.pickupDatetime), "MMM d") : "—"} →{" "}
                  {booking.dropoffDatetime ? format(new Date(booking.dropoffDatetime), "MMM d, yyyy") : "—"}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          {/* Document generation + action buttons */}
          {!loadingBooking && booking && (
            <div className="flex flex-wrap gap-2 mt-1 pb-1 border-b border-border/30">
              {onEditBooking && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => onEditBooking(booking)}
                >
                  <Pencil className="w-3 h-3" />
                  Edit Booking
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => window.open(`${import.meta.env.BASE_URL}document/${bookingId}/agreement`, "_blank")}
              >
                <FileText className="w-3 h-3" />
                Rental Agreement
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => window.open(`${import.meta.env.BASE_URL}document/${bookingId}/voucher`, "_blank")}
              >
                <Ticket className="w-3 h-3" />
                Booking Voucher
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => window.open(`${import.meta.env.BASE_URL}handover/${bookingId}/pickup`, "_blank")}
              >
                <ClipboardList className="w-3 h-3" />
                Handover Sheet
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => window.open(`${import.meta.env.BASE_URL}handover/${bookingId}/return`, "_blank")}
              >
                <ClipboardCheck className="w-3 h-3" />
                Return Sheet
              </Button>
              {canPickUp && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => openHandoverModal("pickup")}
                >
                  <Car className="w-3 h-3" />
                  Pick Up
                </Button>
              )}
              {canDropOff && (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => openHandoverModal("dropoff")}
                >
                  <RotateCcw className="w-3 h-3" />
                  Drop Off
                </Button>
              )}
            </div>
          )}

          {!loadingBooking && booking && (
            <div className="space-y-3 mt-1">
              {/* Booking Info Strip */}
              <div className="rounded-lg border border-border/40 bg-muted/10 overflow-hidden">
                {/* Header row with pencil toggle */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-muted/20">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Overview</span>
                  {!isOverviewEditing ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Quick edit"
                      onClick={enterOverviewEdit}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="text-[11px] text-primary font-medium">Editing</span>
                  )}
                </div>

                {!isOverviewEditing ? (
                  /* Read-only view */
                  <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Customer</div>
                      <div className="font-medium">{booking.customer?.fullName || booking.contactFullName || "—"}</div>
                      {booking.customer?.phone && <div className="text-xs text-muted-foreground">{booking.customer.phone}</div>}
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Vehicle</div>
                      {booking.vehicle ? (
                        <button
                          className="font-medium text-left flex items-center gap-1 hover:text-primary transition-colors group"
                          onClick={() => {
                            onClose();
                            setLocation(`/fleet?vehicleId=${booking.vehicle.id}`);
                          }}
                        >
                          {booking.vehicle.modelName} · {booking.vehicle.licensePlate}
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </button>
                      ) : (
                        <div className="font-medium">
                          {booking.vehicleModelName ? `${booking.vehicleModelName} (unassigned)` : "—"}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Booking Price</div>
                      <div className="font-mono font-bold text-base">
                        {booking.totalAmount
                          ? `${currencySymbol(booking.currency ?? "GEL")}${parseFloat(booking.totalAmount).toFixed(2)}`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Pickup</div>
                      <div>{booking.pickupDatetime ? format(new Date(booking.pickupDatetime), "MMM d, yyyy HH:mm") : "—"}</div>
                      <div className="text-xs text-muted-foreground">{booking.pickupLocation?.name}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Dropoff</div>
                      <div>{booking.dropoffDatetime ? format(new Date(booking.dropoffDatetime), "MMM d, yyyy HH:mm") : "—"}</div>
                      <div className="text-xs text-muted-foreground">{booking.dropoffLocation?.name}</div>
                    </div>
                    {booking.notes && (
                      <div className="col-span-2 sm:col-span-3">
                        <div className="text-[11px] uppercase text-muted-foreground tracking-wide mb-0.5">Notes</div>
                        <div className="text-xs">{booking.notes}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Edit form */
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {/* Price + Currency */}
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Booking Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="e.g. 350.00"
                          value={overviewDraft.totalAmount}
                          onChange={(e) => setOverviewDraft((p) => ({ ...p, totalAmount: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Currency</Label>
                        <Select value={overviewDraft.currency} onValueChange={(v) => setOverviewDraft((p) => ({ ...p, currency: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GEL" className="text-xs">GEL (₾)</SelectItem>
                            <SelectItem value="USD" className="text-xs">USD ($)</SelectItem>
                            <SelectItem value="EUR" className="text-xs">EUR (€)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Pickup Location */}
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Pickup Location</Label>
                        <Select value={overviewDraft.pickupLocationId} onValueChange={(v) => setOverviewDraft((p) => ({ ...p, pickupLocationId: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Keep current" /></SelectTrigger>
                          <SelectContent>
                            {overviewLocations.map((loc: any) => (
                              <SelectItem key={loc.id} value={loc.id.toString()} className="text-xs">{loc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Dropoff Location */}
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Dropoff Location</Label>
                        <Select value={overviewDraft.dropoffLocationId} onValueChange={(v) => setOverviewDraft((p) => ({ ...p, dropoffLocationId: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Keep current" /></SelectTrigger>
                          <SelectContent>
                            {overviewLocations.map((loc: any) => (
                              <SelectItem key={loc.id} value={loc.id.toString()} className="text-xs">{loc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Pickup datetime (read-only) */}
                      <div className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">Pickup Date & Time</Label>
                        <div className="h-8 px-2 flex items-center rounded-md border border-input bg-muted/40 text-xs text-muted-foreground">
                          {booking?.pickupDatetime ? format(new Date(booking.pickupDatetime), "dd MMM yyyy HH:mm") : "—"}
                        </div>
                      </div>
                      {/* Dropoff datetime (read-only) */}
                      <div className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">Dropoff Date & Time</Label>
                        <div className="h-8 px-2 flex items-center rounded-md border border-input bg-muted/40 text-xs text-muted-foreground">
                          {booking?.dropoffDatetime ? format(new Date(booking.dropoffDatetime), "dd MMM yyyy HH:mm") : "—"}
                        </div>
                      </div>
                      {/* Notes */}
                      <div className="col-span-2 sm:col-span-3 grid gap-1.5">
                        <Label className="text-xs">Notes</Label>
                        <Textarea
                          rows={2}
                          placeholder="Optional notes…"
                          value={overviewDraft.notes}
                          onChange={(e) => setOverviewDraft((p) => ({ ...p, notes: e.target.value }))}
                          className="text-xs resize-none"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={savingOverview}
                        onClick={() => setIsOverviewEditing(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={savingOverview}
                        onClick={saveOverview}
                      >
                        {savingOverview ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* ─── Payment Summary ──────────────────────────────────────────── */}
              <CollapsibleSection
                title="Payment Summary"
                icon={<CreditCard className="w-3.5 h-3.5" />}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <SummaryCard
                    label="Total Paid"
                    value={summary ? fmt(summary.totalPaid) : fmt(0)}
                  />
                  <SummaryCard
                    label="Remaining Balance"
                    value={remaining != null ? fmt(Math.max(0, remaining)) : "—"}
                    sub={totalPrice == null ? "Set booking price to track balance" : undefined}
                  />
                  <SummaryCard
                    label="Deposit Received"
                    value={summary ? fmt(summary.depositReceived) : fmt(0)}
                  />
                  <SummaryCard
                    label="Deposit Returned"
                    value={summary ? fmt(summary.depositReturned) : fmt(0)}
                  />
                  <SummaryCard
                    label="Total Refunded"
                    value={summary ? fmt(summary.totalRefunded) : fmt(0)}
                  />
                  <SummaryCard
                    label="Net Deposit"
                    value={summary ? fmt(summary.netDeposit) : fmt(0)}
                    sub="Received minus returned"
                  />
                </div>
              </CollapsibleSection>

              {/* ─── Payment History ──────────────────────────────────────────── */}
              <CollapsibleSection
                title="Payment History"
                icon={<Receipt className="w-3.5 h-3.5" />}
                action={
                  <Button size="sm" onClick={() => setShowAddForm((v) => !v)} className="h-6 text-xs gap-1">
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                }
              >
                <div>
                  {/* Add Payment Form */}
                  {showAddForm && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 mb-3 space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">New Payment Entry</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Payment Type <span className="text-destructive">*</span></Label>
                          <Select value={form.paymentType} onValueChange={(v) => setForm({ ...form, paymentType: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type…" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BOOKING_PAYMENT">Booking Payment</SelectItem>
                              <SelectItem value="DEPOSIT_RECEIVED">Deposit Received</SelectItem>
                              <SelectItem value="DEPOSIT_RETURNED">Deposit Returned</SelectItem>
                              <SelectItem value="REFUND">Refund</SelectItem>
                              <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Method <span className="text-destructive">*</span></Label>
                          <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select method…" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CASH">Cash</SelectItem>
                              <SelectItem value="CARD">Card</SelectItem>
                              <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                              <SelectItem value="OTHER">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Amount <span className="text-destructive">*</span></Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            value={form.amount}
                            onChange={(e) => setForm({ ...form, amount: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Currency</Label>
                          <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GEL">GEL (₾)</SelectItem>
                              <SelectItem value="USD">USD ($)</SelectItem>
                              <SelectItem value="EUR">EUR (€)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Payment Date <span className="text-destructive">*</span></Label>
                          <Input
                            type="date"
                            value={form.paymentDate}
                            onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Notes</Label>
                          <Input
                            placeholder="Optional note…"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); }}>
                          Cancel
                        </Button>
                        <Button size="sm" className="h-7 text-xs" onClick={handleAddPayment} disabled={saving}>
                          {saving ? "Saving…" : "Save Payment"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* History Table */}
                  {loadingPayments ? (
                    <div className="text-sm text-muted-foreground py-4 text-center">Loading payments…</div>
                  ) : payments.length === 0 ? (
                    <div className="rounded-lg border border-border/30 bg-muted/10 py-8 text-center text-sm text-muted-foreground">
                      No payments recorded yet.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/40 overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted/30">
                          <TableRow className="border-border/40 hover:bg-transparent">
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs">Type</TableHead>
                            <TableHead className="text-xs">Amount</TableHead>
                            <TableHead className="text-xs">Method</TableHead>
                            <TableHead className="text-xs">GEL Equiv</TableHead>
                            <TableHead className="text-xs">Notes</TableHead>
                            <TableHead className="w-8" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.map((p: any) => (
                            <TableRow key={p.id} className="border-border/20 hover:bg-muted/20 text-sm">
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {p.paymentDate ? format(new Date(p.paymentDate), "MMM d, yyyy") : "—"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] font-semibold uppercase ${typeColor(p.paymentType)}`}>
                                  {PAYMENT_TYPE_LABELS[p.paymentType] ?? p.paymentType}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono font-bold text-sm">
                                {currencySymbol(p.currency)}{parseFloat(p.amount).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  {METHOD_ICONS[p.method]}{METHOD_LABELS[p.method] ?? p.method}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {p.currency !== "GEL" ? `₾${parseFloat(p.convertedGel).toFixed(2)}` : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                                {p.notes || "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-primary"
                                        aria-label={`Generate document for payment ${p.id}`}
                                        title="Generate document"
                                      >
                                        <Receipt className="w-3 h-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="text-xs">
                                      <DropdownMenuItem
                                        className="text-xs gap-1.5"
                                        onClick={() => window.open(`${import.meta.env.BASE_URL}payment-doc/${bookingId}/${p.id}/receipt`, "_blank")}
                                      >
                                        <Receipt className="w-3 h-3" /> Payment Receipt
                                      </DropdownMenuItem>
                                      {p.paymentType === "DEPOSIT_RECEIVED" && (
                                        <DropdownMenuItem
                                          className="text-xs gap-1.5"
                                          onClick={() => window.open(`${import.meta.env.BASE_URL}payment-doc/${bookingId}/${p.id}/deposit-receipt`, "_blank")}
                                        >
                                          <FileText className="w-3 h-3" /> Deposit Receipt
                                        </DropdownMenuItem>
                                      )}
                                      {p.paymentType === "DEPOSIT_RETURNED" && (
                                        <DropdownMenuItem
                                          className="text-xs gap-1.5"
                                          onClick={() => window.open(`${import.meta.env.BASE_URL}payment-doc/${bookingId}/${p.id}/deposit-return`, "_blank")}
                                        >
                                          <Ticket className="w-3 h-3" /> Deposit Return
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDeletePayment(p.id)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* ─── Pick Up Section ───────────────────────────────────────────── */}
              <CollapsibleSection
                title="Pick Up"
                icon={<Car className="w-3.5 h-3.5" />}
                badge={
                  handovers.pickup ? (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20 ml-1">Completed</Badge>
                  ) : undefined
                }
              >
                <div>
                  {handovers.pickup ? (
                    <HandoverDisplay handover={handovers.pickup} type="pickup" />
                  ) : (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      {canPickUp ? (
                        <div className="space-y-2">
                          <p>No pick up recorded yet.</p>
                          <Button size="sm" className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openHandoverModal("pickup")}>
                            <Car className="w-3 h-3" /> Record Pick Up
                          </Button>
                        </div>
                      ) : (
                        <p>No pick up recorded yet. Available once booking is Confirmed.</p>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* ─── Drop Off Section ──────────────────────────────────────────── */}
              <CollapsibleSection
                title="Drop Off"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                badge={
                  handovers.dropoff ? (
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20 ml-1">Completed</Badge>
                  ) : undefined
                }
              >
                <div>
                  {handovers.dropoff ? (
                    <HandoverDisplay handover={handovers.dropoff} type="dropoff" />
                  ) : (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      {canDropOff ? (
                        <div className="space-y-2">
                          <p>No drop off recorded yet.</p>
                          <Button size="sm" className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => openHandoverModal("dropoff")}>
                            <RotateCcw className="w-3 h-3" /> Record Drop Off
                          </Button>
                        </div>
                      ) : (
                        <p>No drop off recorded yet. Available once vehicle is Delivered.</p>
                      )}
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {/* ─── Recent Activity ──────────────────────────────────────────── */}
              <CollapsibleSection
                title="Recent Activity"
                icon={<Activity className="w-3.5 h-3.5" />}
              >
                <RecentActivity entityType="booking" entityId={bookingId} limit={8} />
              </CollapsibleSection>
            </div>
          )}

          {loadingBooking && (
            <div className="py-12 text-center text-muted-foreground text-sm">Loading booking details…</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pick Up Modal */}
      <HandoverModal
        type="pickup"
        open={showPickupModal}
        onClose={() => setShowPickupModal(false)}
        handoverForm={handoverForm}
        setHandoverForm={setHandoverForm}
        savingHandover={savingHandover}
        onSubmit={handleHandoverSubmit}
      />

      {/* Drop Off Modal */}
      <HandoverModal
        type="dropoff"
        open={showDropoffModal}
        onClose={() => setShowDropoffModal(false)}
        handoverForm={handoverForm}
        setHandoverForm={setHandoverForm}
        savingHandover={savingHandover}
        onSubmit={handleHandoverSubmit}
      />
    </>
  );
}
