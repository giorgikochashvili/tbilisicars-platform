import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  CalendarIcon,
  ChevronRight,
  TriangleAlert,
  X,
  ExternalLink,
} from "lucide-react";

interface Location {
  id: number;
  name: string;
  city?: string;
  reservationCodePrefix?: string | null;
}

interface Brand {
  id: number;
  name: string;
}

interface VehicleModel {
  id: number;
  name: string;
  brandId?: number;
  brand?: { id: number; name: string };
}

interface VoucherImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: Location[];
  models: VehicleModel[];
  brands: Brand[];
  onOpenBookingDetail: (bookingId: number) => void;
}

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4).toString().padStart(2, "0");
  const m = ((i % 4) * 15).toString().padStart(2, "0");
  return `${h}:${m}`;
});

interface ExtractedData {
  contactFullName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  pickupLocationHint?: string | null;
  dropoffLocationHint?: string | null;
  pickupDatetime?: string | null;
  dropoffDatetime?: string | null;
  vehicleModelHint?: string | null;
  totalAmount?: string | null;
  currency?: string | null;
  externalReservationCode?: string | null;
  notes?: string | null;
  broker?: string | null;
}

interface FormState {
  contactFullName: string;
  contactEmail: string;
  contactPhone: string;
  pickupLocationId: string;
  dropoffLocationId: string;
  pickupDate: string;
  pickupTime: string;
  dropoffDate: string;
  dropoffTime: string;
  brandId: string;
  vehicleModelId: string;
  totalAmount: string;
  currency: string;
  notes: string;
  broker: string;
  externalReservationCode: string;
  voucherImportRef: string;
  status: string;
  paymentStatus: string;
}

function parseIsoDate(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "10:00" };
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { date: "", time: "10:00" };
    return { date: format(d, "yyyy-MM-dd"), time: format(d, "HH:mm") };
  } catch {
    return { date: "", time: "10:00" };
  }
}

function guessLocation(hint: string | null | undefined, locations: Location[]): string {
  if (!hint) return "";
  const lower = hint.toLowerCase();
  const match = locations.find(
    (l) =>
      l.name.toLowerCase().includes(lower) ||
      lower.includes(l.name.toLowerCase()) ||
      (l.city && lower.includes(l.city.toLowerCase())),
  );
  return match ? String(match.id) : "";
}

function guessModel(hint: string | null | undefined, models: VehicleModel[]): { brandId: string; modelId: string } {
  if (!hint) return { brandId: "", modelId: "" };
  const lower = hint.toLowerCase();
  const match = models.find(
    (m) => m.name.toLowerCase().includes(lower) || lower.includes(m.name.toLowerCase()),
  );
  if (!match) return { brandId: "", modelId: "" };
  const brandId = match.brandId?.toString() ?? match.brand?.id?.toString() ?? "";
  return { brandId, modelId: String(match.id) };
}

function extractedToForm(
  extracted: ExtractedData,
  locations: Location[],
  models: VehicleModel[],
): Partial<FormState> {
  const pickup = parseIsoDate(extracted.pickupDatetime);
  const dropoff = parseIsoDate(extracted.dropoffDatetime);
  const { brandId, modelId } = guessModel(extracted.vehicleModelHint, models);

  return {
    contactFullName: extracted.contactFullName ?? "",
    contactEmail: extracted.contactEmail ?? "",
    contactPhone: extracted.contactPhone ?? "",
    pickupLocationId: guessLocation(extracted.pickupLocationHint, locations),
    dropoffLocationId: guessLocation(
      extracted.dropoffLocationHint ?? extracted.pickupLocationHint,
      locations,
    ),
    pickupDate: pickup.date,
    pickupTime: pickup.time,
    dropoffDate: dropoff.date,
    dropoffTime: dropoff.time,
    brandId,
    vehicleModelId: modelId,
    totalAmount: extracted.totalAmount ?? "",
    currency: extracted.currency ?? "GEL",
    notes: extracted.notes ?? "",
    broker: extracted.broker ?? "",
    externalReservationCode: extracted.externalReservationCode ?? "",
  };
}

const EMPTY_FORM: FormState = {
  contactFullName: "",
  contactEmail: "",
  contactPhone: "",
  pickupLocationId: "",
  dropoffLocationId: "",
  pickupDate: "",
  pickupTime: "10:00",
  dropoffDate: "",
  dropoffTime: "10:00",
  brandId: "",
  vehicleModelId: "",
  totalAmount: "",
  currency: "GEL",
  notes: "",
  broker: "",
  externalReservationCode: "",
  voucherImportRef: "",
  status: "CONFIRMED",
  paymentStatus: "PREPAID",
};

function DateField({
  label,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
}: {
  label: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (d: string) => void;
  onTimeChange: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = dateValue ? new Date(dateValue + "T12:00:00") : undefined;
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="flex-1 justify-start text-left font-normal h-9 text-sm">
              <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
              {dateValue
                ? format(new Date(dateValue + "T12:00:00"), "MMM d, yyyy")
                : <span className="text-muted-foreground">Pick date…</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (d) { onDateChange(format(d, "yyyy-MM-dd")); setOpen(false); }
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        <Select value={timeValue} onValueChange={onTimeChange}>
          <SelectTrigger className="w-[100px] h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {TIME_SLOTS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export default function VoucherImportDialog({
  open,
  onOpenChange,
  locations,
  models,
  brands,
  onOpenBookingDetail,
}: VoucherImportDialogProps) {
  const [step, setStep] = useState<"upload" | "review" | "success">("upload");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [unresolvedFields, setUnresolvedFields] = useState<string[]>([]);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const [extractedDraft, setExtractedDraft] = useState<ExtractedData | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [successData, setSuccessData] = useState<{
    bookingId: number;
    reservationCode: string;
    contactFullName: string;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reset = () => {
    setStep("upload");
    setIsExtracting(false);
    setIsConfirming(false);
    setWarnings([]);
    setUnresolvedFields([]);
    setDuplicateWarnings([]);
    setExtractedDraft(null);
    setForm(EMPTY_FORM);
    setSuccessData(null);
    setSelectedFileName(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const runDuplicateCheck = useCallback(
    async (params: {
      externalReservationCode?: string;
      voucherImportRef?: string;
      contactPhone?: string;
      contactEmail?: string;
      pickupDatetime?: string;
      pickupLocationId?: number;
    }) => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/voucher-import/duplicate-check`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (res.ok) {
          const dup = await res.json();
          if (dup.isDuplicate && dup.warnings?.length) {
            setDuplicateWarnings(dup.warnings);
          }
        }
      } catch {
        // duplicate check failure is non-blocking
      }
    },
    [],
  );

  const processFile = useCallback(
    async (file: File) => {
      setSelectedFileName(file.name);
      setIsExtracting(true);

      const formData = new FormData();
      formData.append("file", file);

      let extracted: ExtractedData = {};
      let extractWarnings: string[] = [];
      let extractionFailed = false;
      let unresolved: string[] = [];
      let resolvedPickupLocationId: number | null = null;
      let resolvedDropoffLocationId: number | null = null;
      let objectPath: string | null = null;

      try {
        const response = await fetch(`${API_BASE}/api/admin/voucher-import/extract`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (response.ok) {
          const json = await response.json();
          extracted = json.extracted ?? {};
          extractWarnings = json.warnings ?? [];
          extractionFailed = json.extractionFailed ?? false;
          unresolved = json.unresolvedFields ?? [];
          resolvedPickupLocationId = json.resolvedPickupLocationId ?? null;
          resolvedDropoffLocationId = json.resolvedDropoffLocationId ?? null;
          objectPath = json.objectPath ?? null;
          setExtractedDraft(extracted);
        } else {
          extractWarnings = ["Failed to extract data from file. Please fill in details manually."];
          extractionFailed = true;
          unresolved = ["contactFullName", "pickupLocation", "dropoffLocation", "pickupDatetime", "dropoffDatetime"];
        }
      } catch {
        extractWarnings = ["Network error during extraction. Please fill in details manually."];
        extractionFailed = true;
        unresolved = ["contactFullName", "pickupLocation", "dropoffLocation", "pickupDatetime", "dropoffDatetime"];
      }

      const mapped = extractedToForm(extracted, locations, models);
      // Server-resolved location IDs take precedence over client-side guessing
      if (resolvedPickupLocationId) mapped.pickupLocationId = String(resolvedPickupLocationId);
      if (resolvedDropoffLocationId) mapped.dropoffLocationId = String(resolvedDropoffLocationId);

      const newForm: FormState = {
        ...EMPTY_FORM,
        ...mapped,
        voucherImportRef: objectPath ?? "",
      };

      setForm(newForm);
      setWarnings(extractWarnings);
      setUnresolvedFields(unresolved);
      setIsExtracting(false);
      setStep("review");

      // Async duplicate check
      const pickupLocId = mapped.pickupLocationId ? parseInt(mapped.pickupLocationId) : undefined;
      const pickupDt =
        mapped.pickupDate && mapped.pickupTime
          ? new Date(`${mapped.pickupDate}T${mapped.pickupTime}:00`).toISOString()
          : undefined;

      runDuplicateCheck({
        externalReservationCode: mapped.externalReservationCode || undefined,
        voucherImportRef: objectPath || undefined,
        contactPhone: mapped.contactPhone || undefined,
        contactEmail: mapped.contactEmail || undefined,
        pickupDatetime: pickupDt,
        pickupLocationId: pickupLocId,
      });
    },
    [locations, models, runDuplicateCheck],
  );

  const handleFileSelect = (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|pdf)$/i)) {
      toast({
        title: "Unsupported file",
        description: "Please upload a JPEG, PNG, WebP, or PDF file.",
        variant: "destructive",
      });
      return;
    }
    processFile(file);
  };

  const onDropZoneClick = () => fileInputRef.current?.click();

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectedPickupLocation = locations.find((l) => String(l.id) === form.pickupLocationId);
  const pickupHasPrefix = !!selectedPickupLocation?.reservationCodePrefix;

  const filteredModels =
    form.brandId && form.brandId !== "any"
      ? models.filter(
          (m) =>
            m.brandId?.toString() === form.brandId ||
            m.brand?.id?.toString() === form.brandId,
        )
      : models;

  const requiredFieldsMissing =
    !form.contactFullName.trim() ||
    !form.pickupLocationId ||
    !form.dropoffLocationId ||
    !form.pickupDate ||
    !form.dropoffDate ||
    !form.vehicleModelId;

  const confirmDisabled = requiredFieldsMissing || !pickupHasPrefix || isConfirming;

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const payload = {
        contactFullName: form.contactFullName.trim(),
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
        pickupLocationId: parseInt(form.pickupLocationId),
        dropoffLocationId: parseInt(form.dropoffLocationId),
        pickupDatetime: new Date(`${form.pickupDate}T${form.pickupTime}:00`).toISOString(),
        dropoffDatetime: new Date(`${form.dropoffDate}T${form.dropoffTime}:00`).toISOString(),
        vehicleModelId: parseInt(form.vehicleModelId),
        totalAmount: form.totalAmount || null,
        currency: form.currency || "GEL",
        notes: form.notes || null,
        broker: form.broker || null,
        externalReservationCode: form.externalReservationCode || null,
        voucherImportRef: form.voucherImportRef || null,
        status: form.status,
        paymentStatus: form.paymentStatus,
        extractedDraft: extractedDraft ?? null,
      };

      const res = await fetch(`${API_BASE}/api/admin/voucher-import/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast({
          title: "Import failed",
          description: err.error || "Failed to create booking",
          variant: "destructive",
        });
        setIsConfirming(false);
        return;
      }

      const data = await res.json();
      setSuccessData({
        bookingId: data.booking.id,
        reservationCode: data.reservationCode,
        contactFullName: form.contactFullName,
      });
      setStep("success");
      queryClient.invalidateQueries();
    } catch {
      toast({
        title: "Network error",
        description: "Could not reach server. Please try again.",
        variant: "destructive",
      });
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Import Voucher
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a voucher image or PDF to automatically extract booking details."}
            {step === "review" && "Review and edit the extracted details before saving."}
            {step === "success" && "Booking created successfully."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className={step === "upload" ? "text-primary font-semibold" : ""}>1. Upload</span>
          <ChevronRight className="w-3 h-3" />
          <span className={step === "review" ? "text-primary font-semibold" : ""}>2. Review</span>
          <ChevronRight className="w-3 h-3" />
          <span className={step === "success" ? "text-primary font-semibold" : ""}>3. Done</span>
        </div>

        {/* ── Step 1: Upload ─────────────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border/60 hover:border-primary/60 hover:bg-muted/30"
              }`}
              onClick={onDropZoneClick}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-sm font-medium">Extracting data from {selectedFileName}…</p>
                  <p className="text-xs text-muted-foreground">This may take a few seconds</p>
                </>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-muted-foreground" />
                  <p className="text-sm font-medium text-center">
                    Drop voucher here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">Supports JPEG, PNG, WebP, PDF · Max 20 MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                  e.target.value = "";
                }}
                disabled={isExtracting}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Review ────────────────────────────────────────────────── */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Duplicate warnings */}
            {duplicateWarnings.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2.5 text-sm text-orange-500">
                {duplicateWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Extraction warnings */}
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-sm text-amber-600">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}

            {/* Unresolved fields notice */}
            {unresolvedFields.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2.5 text-sm text-blue-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Could not extract: {unresolvedFields.join(", ")}. Please fill these in before confirming.
                </span>
              </div>
            )}

            {/* No-prefix warning */}
            {form.pickupLocationId && !pickupHasPrefix && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-sm text-red-500">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  The selected pickup location has no reservation code prefix. Configure a prefix in Locations settings before importing.
                </span>
              </div>
            )}

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">
                  Customer Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.contactFullName}
                  onChange={(e) => setField("contactFullName", e.target.value)}
                  placeholder="Full name"
                  className="h-9 text-sm"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  value={form.contactEmail}
                  onChange={(e) => setField("contactEmail", e.target.value)}
                  placeholder="email@example.com"
                  className="h-9 text-sm"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={form.contactPhone}
                  onChange={(e) => setField("contactPhone", e.target.value)}
                  placeholder="+995 555 000000"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Locations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">
                  Pickup Location <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.pickupLocationId}
                  onValueChange={(v) => setField("pickupLocationId", v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select location…" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.name}
                        {!l.reservationCodePrefix && (
                          <span className="ml-1 text-xs text-muted-foreground">(no prefix)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">
                  Dropoff Location <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.dropoffLocationId}
                  onValueChange={(v) => setField("dropoffLocationId", v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select location…" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateField
                label="Pickup Date & Time *"
                dateValue={form.pickupDate}
                timeValue={form.pickupTime}
                onDateChange={(d) => setField("pickupDate", d)}
                onTimeChange={(t) => setField("pickupTime", t)}
              />
              <DateField
                label="Dropoff Date & Time *"
                dateValue={form.dropoffDate}
                timeValue={form.dropoffTime}
                onDateChange={(d) => setField("dropoffDate", d)}
                onTimeChange={(t) => setField("dropoffTime", t)}
              />
            </div>

            {/* Brand + Model (brand-filtered) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Brand</Label>
                <Select
                  value={form.brandId || "any"}
                  onValueChange={(v) => {
                    setField("brandId", v === "any" ? "" : v);
                    setField("vehicleModelId", "");
                  }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Any brand…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any brand</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Vehicle Model</Label>
                <Select
                  value={form.vehicleModelId || "none"}
                  onValueChange={(v) => setField("vehicleModelId", v === "none" ? "" : v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Not specified…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {filteredModels.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Amount + Currency */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 grid gap-1.5">
                <Label className="text-xs">Total Amount</Label>
                <Input
                  value={form.totalAmount}
                  onChange={(e) => setField("totalAmount", e.target.value)}
                  placeholder="0.00"
                  className="h-9 text-sm"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setField("currency", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GEL">GEL</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Payment + Broker */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Payment Status</Label>
                <Select value={form.paymentStatus} onValueChange={(v) => setField("paymentStatus", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNPAID">Unpaid</SelectItem>
                    <SelectItem value="HALF">Partial</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="PREPAID">PrePaid</SelectItem>
                    <SelectItem value="REFUNDED">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Broker / Agent</Label>
                <Input
                  value={form.broker}
                  onChange={(e) => setField("broker", e.target.value)}
                  placeholder="Travel agency name"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* External Ref */}
            <div className="grid gap-1.5">
              <Label className="text-xs">External Reservation Code</Label>
              <Input
                value={form.externalReservationCode}
                onChange={(e) => setField("externalReservationCode", e.target.value)}
                placeholder="Voucher reference number from document"
                className="h-9 text-sm"
              />
            </div>

            {/* Notes */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Additional notes from the voucher"
                rows={2}
                className="text-sm resize-none"
              />
            </div>
          </div>
        )}

        {/* ── Step 3: Success ───────────────────────────────────────────────── */}
        {step === "success" && successData && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">Booking Created</p>
              <p className="text-muted-foreground text-sm mt-1">{successData.contactFullName}</p>
            </div>
            <div className="flex items-center gap-3 bg-card border border-border/40 rounded-xl px-5 py-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reservation Code</p>
                <Badge variant="outline" className="text-base font-mono px-4 py-1.5 border-primary/40 text-primary">
                  {successData.reservationCode}
                </Badge>
              </div>
              <div className="w-px h-10 bg-border/60" />
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Booking ID</p>
                <p className="font-bold text-base">#{successData.bookingId}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                handleClose(false);
                onOpenBookingDetail(successData.bookingId);
              }}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Booking Detail
            </Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === "upload" && (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
          )}

          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => reset()} disabled={isConfirming}>
                <X className="w-4 h-4 mr-1.5" /> Start Over
              </Button>
              <Button onClick={handleConfirm} disabled={confirmDisabled}>
                {isConfirming ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing…</>
                ) : (
                  <>Confirm Import</>
                )}
              </Button>
            </>
          )}

          {step === "success" && (
            <>
              <Button variant="outline" onClick={() => reset()}>Import Another</Button>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
