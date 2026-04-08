import { useState, useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAdminBookings,
  useCreateAdminBooking,
  useUpdateAdminBooking,
  useUpdateAdminBookingStatus,
  useListAdminCustomers,
  useListAdminBrands,
  useListAdminModels,
  useListAdminVehicles,
  useListLocations,
  useListAdminLocations,
} from "@workspace/api-client-react";
import { formatBookingAmount } from "@/lib/utils";
import BookingDetail from "./BookingDetail";
import VoucherImportDialog from "./VoucherImportDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, CalendarDays, CalendarIcon, X, MapPin, FileUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    CONFIRMED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    DELIVERED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    RETURNED: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    CANCELED: "bg-red-500/10 text-red-500 border-red-500/20",
    NO_SHOW: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  };
  return (
    <Badge variant="outline" className={`font-bold tracking-wider text-[10px] uppercase shadow-sm ${colors[status] || "bg-gray-500/10 text-gray-500"}`}>
      {status.replace("_", " ")}
    </Badge>
  );
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Unpaid",
  HALF: "Partial",
  PAID: "Paid",
  PREPAID: "PrePaid",
  REFUNDED: "Refunded",
};

function PaymentBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    UNPAID: "bg-red-500/10 text-red-500 border-red-500/20",
    HALF: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    PAID: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    PREPAID: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    REFUNDED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] uppercase ${colors[status] || "bg-gray-500/10 text-gray-500"}`}>
      {PAYMENT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4).toString().padStart(2, "0");
  const m = ((i % 4) * 15).toString().padStart(2, "0");
  return `${h}:${m}`;
});

function DateTimePicker({
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
    <div className="grid gap-2">
      <Label>
        {label}{required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="flex-1 justify-start text-left font-normal h-9"
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
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
          <SelectTrigger className="w-[110px] h-9">
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

function deriveLocationType(locationName: string): "airport" | "hotel" | "office" {
  if (locationName.includes("Airport")) return "airport";
  if (locationName.includes("Hotel")) return "hotel";
  return "office";
}

function DateFilterPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T12:00:00") : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-[140px] justify-start text-left font-normal bg-background"
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          {value
            ? format(new Date(value + "T12:00:00"), "MMM d, yyyy")
            : <span className="text-muted-foreground text-sm">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
          autoFocus
        />
        {value && (
          <div className="border-t border-border/40 p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground"
              onClick={() => { onChange(""); setOpen(false); }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const EMPTY_BOOKING = {
  customerMode: "new" as "existing" | "new",
  customerId: "",
  newCustomerName: "",
  newCustomerPhone: "",
  newCustomerEmail: "",
  brandId: "",
  vehicleModelId: "",
  vehicleId: "",
  pickupLocationId: "",
  pickupDate: "",
  pickupTime: "10:00",
  pickupType: "airport" as "airport" | "hotel" | "office",
  pickupAddress: "",
  dropoffLocationId: "",
  dropoffDate: "",
  dropoffTime: "10:00",
  dropoffType: "airport" as "airport" | "hotel" | "office",
  dropoffAddress: "",
  totalAmount: "",
  currency: "GEL",
  notes: "",
  status: "CONFIRMED" as const,
  paymentStatus: "UNPAID" as string,
};

type Region = "ALL" | "Tbilisi" | "Kutaisi" | "Batumi";
const REGIONS: Region[] = ["ALL", "Tbilisi", "Kutaisi", "Batumi"];

export default function BookingsPage() {
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<Region>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [paymentFilter, setPaymentFilter] = useState<string>("ALL");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("ALL");
  const [bookingIdSearch, setBookingIdSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [isVoucherImportOpen, setIsVoucherImportOpen] = useState(false);
  const [editBookingId, setEditBookingId] = useState<number | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);
  const [booking, setBooking] = useState(EMPTY_BOOKING);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSnapshot, setCustomerSnapshot] = useState<{id: string; fullName: string; phone?: string; email?: string} | null>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const reqOpts = { request: { credentials: "include" as const } };

  const queryParams: any = { page, limit: 15 };
  if (search) queryParams.search = search;
  if (regionFilter !== "ALL") queryParams.city = regionFilter;
  if (statusFilter !== "ALL") queryParams.status = statusFilter;
  if (paymentFilter !== "ALL") queryParams.paymentStatus = paymentFilter;
  if (vehicleSearch) queryParams.vehicleSearch = vehicleSearch;
  if (dateFrom) queryParams.dateFrom = dateFrom;
  if (dateTo) queryParams.dateTo = dateTo;
  if (locationFilter !== "ALL") queryParams.locationId = parseInt(locationFilter);
  if (bookingIdSearch && !isNaN(parseInt(bookingIdSearch))) queryParams.bookingId = parseInt(bookingIdSearch);

  const hasActiveFilters = search || regionFilter !== "ALL" || statusFilter !== "ALL" || paymentFilter !== "ALL" || vehicleSearch || dateFrom || dateTo || locationFilter !== "ALL" || bookingIdSearch;

  const clearAllFilters = () => {
    setSearch("");
    setRegionFilter("ALL");
    setStatusFilter("ALL");
    setPaymentFilter("ALL");
    setVehicleSearch("");
    setDateFrom("");
    setDateTo("");
    setLocationFilter("ALL");
    setBookingIdSearch("");
    setPage(1);
  };
  
  const { data, isLoading } = useListAdminBookings(queryParams, reqOpts);
  const customerQueryParams = useMemo(
    () => ({ page: 1, limit: 50, search: customerSearch }),
    [customerSearch]
  );
  const { data: customers } = useListAdminCustomers(customerQueryParams, reqOpts);
  const { data: brands } = useListAdminBrands(reqOpts);
  const { data: models } = useListAdminModels(reqOpts);
  const vehicleQueryParams = useMemo(() => {
    const id = parseInt(booking.vehicleModelId);
    return !isNaN(id) ? ({ modelId: id } as any) : undefined;
  }, [booking.vehicleModelId]);
  const { data: vehicleData } = useListAdminVehicles(vehicleQueryParams, reqOpts);
  const { data: locations } = useListLocations(reqOpts);
  const { data: adminLocations } = useListAdminLocations(reqOpts);

  const statusMutation = useUpdateAdminBookingStatus(reqOpts);
  const createMutation = useCreateAdminBooking(reqOpts);
  const updateMutation = useUpdateAdminBooking(reqOpts);

  const bookings = (data as any)?.data || [];
  const meta = (data as any)?.meta;
  const allVehicles = (vehicleData as any)?.data || [];
  const allLocations = (locations as any) || [];
  const allAdminLocations = (adminLocations as any) || [];
  const allModels = (models as any) || [];
  const allBrands = (brands as any) || [];
  const allCustomers = (customers as any)?.data || [];

  const filteredModels = booking.brandId && booking.brandId !== "any"
    ? allModels.filter((m: any) => (m.brandId?.toString() ?? m.brand?.id?.toString()) === booking.brandId)
    : allModels;

  const selectedCustomer = booking.customerMode === "existing" && booking.customerId
    ? allCustomers.find((c: any) => c.id.toString() === booking.customerId) ?? null
    : null;

  const handleStatusChange = (id: number, newStatus: any) => {
    statusMutation.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          toast({ title: "Status updated", description: `Booking #${id} → ${newStatus}` });
          queryClient.invalidateQueries();
        },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      }
    );
  };

  const openNewBooking = () => {
    setBooking(EMPTY_BOOKING);
    setCustomerSearch("");
    setCustomerSnapshot(null);
    setEditBookingId(null);
    setIsNewBookingOpen(true);
  };

  const openEditBooking = async (bookingRow: any) => {
    const pickupDt = bookingRow.pickupDatetime ? new Date(bookingRow.pickupDatetime) : null;
    const dropoffDt = bookingRow.dropoffDatetime ? new Date(bookingRow.dropoffDatetime) : null;
    // Customer ID may be at customer.id, userId, or customerId depending on response shape
    const customerIdRaw = bookingRow.customer?.id ?? bookingRow.userId ?? bookingRow.customerId ?? null;
    const hasExistingCustomer = customerIdRaw !== null && customerIdRaw !== undefined;
    const customerName = bookingRow.customer?.fullName || bookingRow.contactFullName || "";
    // Derive brand from the loaded models list using the booking's vehicleModelId
    const modelForBrand = allModels.find(
      (m: any) => m.id?.toString() === (bookingRow.vehicleModelId?.toString() ?? "")
    );
    const derivedBrandId = modelForBrand
      ? (modelForBrand.brandId?.toString() ?? modelForBrand.brand?.id?.toString() ?? "")
      : "";
    setBooking({
      customerMode: hasExistingCustomer ? "existing" : "new",
      customerId: hasExistingCustomer ? String(customerIdRaw) : "",
      newCustomerName: hasExistingCustomer ? "" : (bookingRow.contactFullName || ""),
      newCustomerPhone: hasExistingCustomer ? "" : (bookingRow.contactPhone || ""),
      newCustomerEmail: hasExistingCustomer ? "" : (bookingRow.contactEmail || ""),
      brandId: derivedBrandId,
      vehicleModelId: bookingRow.vehicleModelId ? bookingRow.vehicleModelId.toString() : "",
      vehicleId: bookingRow.vehicleId ? bookingRow.vehicleId.toString() : "",
      pickupLocationId: bookingRow.pickupLocationId ? bookingRow.pickupLocationId.toString() : "",
      pickupDate: pickupDt ? format(pickupDt, "yyyy-MM-dd") : "",
      pickupTime: pickupDt ? format(pickupDt, "HH:mm") : "10:00",
      pickupType: (() => {
        const pid = String(bookingRow.pickupLocationId ?? "");
        const loc = allLocations.find((l: any) => String(l.id) === pid);
        const name = loc?.name ?? bookingRow.pickupLocation?.name ?? "";
        return name ? deriveLocationType(name) : "airport";
      })(),
      pickupAddress: bookingRow.pickupAddress || "",
      dropoffLocationId: bookingRow.dropoffLocationId ? bookingRow.dropoffLocationId.toString() : "",
      dropoffDate: dropoffDt ? format(dropoffDt, "yyyy-MM-dd") : "",
      dropoffTime: dropoffDt ? format(dropoffDt, "HH:mm") : "10:00",
      dropoffType: (() => {
        const did = String(bookingRow.dropoffLocationId ?? "");
        const loc = allLocations.find((l: any) => String(l.id) === did);
        const name = loc?.name ?? bookingRow.dropoffLocation?.name ?? "";
        return name ? deriveLocationType(name) : "airport";
      })(),
      dropoffAddress: bookingRow.dropoffAddress || "",
      totalAmount: bookingRow.totalAmount ?? "",
      currency: bookingRow.currency || "GEL",
      notes: bookingRow.notes || "",
      status: bookingRow.status || "PENDING",
      paymentStatus: bookingRow.paymentStatus || "UNPAID",
    });
    setCustomerSearch(hasExistingCustomer ? customerName : "");
    setCustomerSnapshot(hasExistingCustomer ? {
      id: String(customerIdRaw),
      fullName: customerName,
      phone: bookingRow.customer?.phone || bookingRow.contactPhone || undefined,
      email: bookingRow.customer?.email || bookingRow.contactEmail || undefined,
    } : null);
    setEditBookingId(bookingRow.id);
    setIsNewBookingOpen(true);
  };

  const buildPayload = () => {
    const vehicleModelIdNum = parseInt(booking.vehicleModelId);
    const pickupDatetime = new Date(`${booking.pickupDate}T${booking.pickupTime}:00`).toISOString();
    const dropoffDatetime = new Date(`${booking.dropoffDate}T${booking.dropoffTime}:00`).toISOString();

    const contactFullName = booking.customerMode === "existing"
      ? (selectedCustomer?.fullName || "")
      : booking.newCustomerName;

    const payload: any = {
      contactFullName,
      contactPhone: booking.customerMode === "new" ? (booking.newCustomerPhone || null) : (selectedCustomer?.phone || null),
      contactEmail: booking.customerMode === "new" ? (booking.newCustomerEmail || null) : (selectedCustomer?.email || null),
      pickupLocationId: parseInt(booking.pickupLocationId),
      dropoffLocationId: parseInt(booking.dropoffLocationId),
      pickupDatetime,
      dropoffDatetime,
      pickupType: booking.pickupType,
      pickupAddress: booking.pickupType === "hotel" ? booking.pickupAddress : null,
      dropoffType: booking.dropoffType,
      dropoffAddress: booking.dropoffType === "hotel" ? booking.dropoffAddress : null,
      notes: booking.notes || null,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      source: "admin",
    };

    if (!isNaN(vehicleModelIdNum)) payload.vehicleModelId = vehicleModelIdNum;
    if (booking.vehicleId && booking.vehicleId !== "none") payload.vehicleId = parseInt(booking.vehicleId);
    if (booking.totalAmount) payload.totalAmount = booking.totalAmount;
    payload.currency = booking.currency;

    if (booking.customerMode === "existing" && booking.customerId) {
      payload.customerId = parseInt(booking.customerId);
    } else {
      payload.customerData = {
        fullName: booking.newCustomerName || undefined,
        phone: booking.newCustomerPhone || undefined,
        email: booking.newCustomerEmail || undefined,
      };
    }
    return payload;
  };

  const validateBooking = () => {
    if (booking.customerMode === "existing" && !booking.customerId) {
      toast({ title: "Validation Error", description: "Please select a customer", variant: "destructive" });
      return false;
    }
    if (booking.customerMode === "new" && !booking.newCustomerName.trim()) {
      toast({ title: "Validation Error", description: "Customer name is required", variant: "destructive" });
      return false;
    }
    const vehicleModelIdNum = parseInt(booking.vehicleModelId);
    if (!booking.vehicleModelId || booking.vehicleModelId === "any" || isNaN(vehicleModelIdNum)) {
      toast({ title: "Validation Error", description: "Please select a vehicle model", variant: "destructive" });
      return false;
    }
    if (!booking.pickupLocationId) {
      toast({ title: "Validation Error", description: "Pickup location is required", variant: "destructive" });
      return false;
    }
    if (!booking.dropoffLocationId) {
      toast({ title: "Validation Error", description: "Dropoff location is required", variant: "destructive" });
      return false;
    }
    if (!booking.pickupDate) {
      toast({ title: "Validation Error", description: "Pickup date is required", variant: "destructive" });
      return false;
    }
    if (!booking.dropoffDate) {
      toast({ title: "Validation Error", description: "Dropoff date is required", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleCreateBooking = () => {
    if (!validateBooking()) return;
    const payload = buildPayload();
    const contactName = payload.contactFullName;

    createMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Booking Created", description: `New booking for ${contactName} saved.` });
          queryClient.invalidateQueries();
          setIsNewBookingOpen(false);
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to create booking", variant: "destructive" });
        }
      }
    );
  };

  const handleUpdateBooking = () => {
    if (!validateBooking() || !editBookingId) return;
    const payload = buildPayload();
    const contactName = payload.contactFullName;

    updateMutation.mutate(
      { id: editBookingId, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Booking Updated", description: `Booking #${editBookingId} for ${contactName} updated.` });
          queryClient.invalidateQueries();
          setIsNewBookingOpen(false);
          setEditBookingId(null);
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to update booking", variant: "destructive" });
        }
      }
    );
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node) &&
        customerSearchRef.current &&
        !customerSearchRef.current.contains(e.target as Node)
      ) {
        setCustomerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isEditMode = editBookingId !== null;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" /> Bookings
          </h2>
          <p className="text-muted-foreground">Manage reservations, deliveries, and returns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="shadow-sm" onClick={() => setIsVoucherImportOpen(true)}>
            <FileUp className="w-4 h-4 mr-2" /> Import Voucher
          </Button>
          <Button className="shadow-sm hover-elevate" onClick={openNewBooking}>
            <Plus className="w-4 h-4 mr-2" /> New Booking
          </Button>
        </div>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="p-4 border-b border-border/40 bg-background/50 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Reservation ID */}
            <div className="relative w-28">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={bookingIdSearch}
                onChange={(e) => { setBookingIdSearch(e.target.value.replace(/\D/g, "")); setPage(1); }}
                placeholder="Ref #"
                className="pl-8 bg-background h-9 text-sm"
              />
            </div>
            {/* Customer search */}
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Customer name or email"
                className="pl-8 bg-background h-9 text-sm"
              />
            </div>
            {/* Vehicle search */}
            <div className="relative w-44">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={vehicleSearch}
                onChange={(e) => { setVehicleSearch(e.target.value); setPage(1); }}
                placeholder="Vehicle / plate"
                className="pl-8 bg-background h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {/* Region */}
            <div className="flex items-center gap-1 bg-background/60 border border-border/40 rounded-lg px-2 h-9">
              <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              {REGIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRegionFilter(r); setPage(1); }}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                    regionFilter === r
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "ALL" ? "All" : r}
                </button>
              ))}
            </div>
            {/* Status */}
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[148px] bg-background h-9 text-sm">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="RETURNED">Returned</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
                <SelectItem value="NO_SHOW">No Show</SelectItem>
              </SelectContent>
            </Select>
            {/* Payment status */}
            <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[148px] bg-background h-9 text-sm">
                <SelectValue placeholder="All Payments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Payments</SelectItem>
                <SelectItem value="UNPAID">Unpaid</SelectItem>
                <SelectItem value="HALF">Partial</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="PREPAID">PrePaid</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
              </SelectContent>
            </Select>
            {/* Location */}
            <Select value={locationFilter} onValueChange={(v) => { setLocationFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[180px] bg-background h-9 text-sm">
                <SelectValue placeholder="All Locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Locations</SelectItem>
                {allLocations.map((loc: any) => (
                  <SelectItem key={loc.id} value={loc.id.toString()}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Date from */}
            <DateFilterPicker
              value={dateFrom}
              onChange={(v) => { setDateFrom(v); setPage(1); }}
              placeholder="From date"
            />
            {/* Date to */}
            <DateFilterPicker
              value={dateTo}
              onChange={(v) => { setDateTo(v); setPage(1); }}
              placeholder="To date"
            />
            {/* Clear all */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground hover:text-foreground" onClick={clearAllFilters}>
                <X className="w-3.5 h-3.5" /> Clear all
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="w-[70px]">Ref</TableHead>
                <TableHead>Vehicle & Customer</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Dropoff</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : bookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center text-muted-foreground">
                    <CalendarDays className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    No bookings found.
                  </TableCell>
                </TableRow>
              ) : (
                bookings.map((b: any) => (
                  <TableRow
                    key={b.id}
                    className="border-border/20 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setDetailBookingId(b.id)}
                  >
                    <TableCell className="font-mono text-xs font-medium text-muted-foreground align-top pt-4">
                      #{b.id}
                    </TableCell>
                    <TableCell className="align-top pt-3">
                      {/* Vehicle — primary */}
                      <div className="font-semibold text-foreground mb-0.5">
                        {b.vehicle ? (
                          <>{(b.vehicle.brandName || "") && `${b.vehicle.brandName} `}{b.vehicle.modelName} <span className="font-mono text-xs text-muted-foreground">· {b.vehicle.licensePlate}</span></>
                        ) : b.vehicleModelName ? (
                          <>{(b.vehicleModelBrandName || "") && `${b.vehicleModelBrandName} `}{b.vehicleModelName}</>
                        ) : (
                          <span className="text-muted-foreground italic text-sm">No vehicle assigned</span>
                        )}
                      </div>
                      {/* Customer — secondary */}
                      <div className="text-xs text-muted-foreground">
                        {b.customer?.fullName || b.contactFullName || "Unknown"}
                      </div>
                      {b.source && b.source !== "admin" && (
                        <span className={`inline-flex items-center mt-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          b.source === "website" ? "bg-blue-500/15 text-blue-400 border border-blue-500/25" :
                          b.source === "api" ? "bg-violet-500/15 text-violet-400 border border-violet-500/25" :
                          "bg-muted text-muted-foreground border border-border"
                        }`}>
                          {b.source === "website" ? "🌐 web" : b.source}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      <div className="text-sm font-medium">{format(new Date(b.pickupDatetime), "MMM d, yyyy")}</div>
                      <div className="text-xs text-muted-foreground">{format(new Date(b.pickupDatetime), "HH:mm")}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[140px]">{b.pickupLocation?.name}</div>
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      <div className="text-sm font-medium">{format(new Date(b.dropoffDatetime), "MMM d, yyyy")}</div>
                      <div className="text-xs text-muted-foreground">{format(new Date(b.dropoffDatetime), "HH:mm")}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[140px]">{b.dropoffLocation?.name}</div>
                    </TableCell>
                    <TableCell className="align-top pt-4">
                      {b.status === "CANCELED" || b.status === "NO_SHOW" ? (
                        <span className="text-muted-foreground font-mono text-sm">—</span>
                      ) : (
                        <>
                          <div className="font-mono font-bold text-sm mb-1">
                            {b.totalAmount ? formatBookingAmount(b.totalAmount, b.currency) : "—"}
                          </div>
                          <PaymentBadge status={b.paymentStatus} />
                        </>
                      )}
                    </TableCell>
                    <TableCell className="align-top pt-3" onClick={(e) => e.stopPropagation()}>
                      <Select 
                        value={b.status} 
                        onValueChange={(val) => handleStatusChange(b.id, val)}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-xs font-bold uppercase">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PENDING" className="text-xs">PENDING</SelectItem>
                          <SelectItem value="CONFIRMED" className="text-xs">CONFIRMED</SelectItem>
                          <SelectItem value="DELIVERED" className="text-xs">DELIVERED</SelectItem>
                          <SelectItem value="RETURNED" className="text-xs">RETURNED</SelectItem>
                          <SelectItem value="CANCELED" className="text-xs">CANCELED</SelectItem>
                          <SelectItem value="NO_SHOW" className="text-xs">NO SHOW</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {meta && meta.total > meta.limit && (
          <div className="flex items-center justify-between p-4 border-t border-border/40 text-sm text-muted-foreground">
            <span>Page {meta.page} of {Math.ceil(meta.total / meta.limit)} &bull; {meta.total} bookings</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={meta.page <= 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={meta.page * meta.limit >= meta.total}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Booking Detail / Payments Dialog ──────────────────────────── */}
      <BookingDetail
        bookingId={detailBookingId}
        open={detailBookingId !== null}
        onClose={() => setDetailBookingId(null)}
        onPaymentChanged={() => queryClient.invalidateQueries()}
        onEditBooking={(b) => {
          setDetailBookingId(null);
          setTimeout(() => openEditBooking(b), 100);
        }}
      />

      {/* ─── New / Edit Booking Modal ────────────────────────────────────── */}
      <Dialog open={isNewBookingOpen} onOpenChange={(open) => {
        if (!open) { setIsNewBookingOpen(false); setEditBookingId(null); }
      }}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {isEditMode ? `Edit Booking #${editBookingId}` : "New Booking"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode ? "Update the reservation details below." : "Create a new car rental reservation."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">

            {/* Customer Section */}
            <div className="space-y-3 rounded-lg border border-border/50 p-4 bg-muted/20">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Customer</h3>
              <Tabs value={booking.customerMode} onValueChange={(v: any) => {
                setBooking({...booking, customerMode: v, customerId: "", newCustomerName: "", newCustomerPhone: "", newCustomerEmail: ""});
                setCustomerSearch("");
                setCustomerDropdownOpen(false);
              }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="new">New Customer</TabsTrigger>
                  <TabsTrigger value="existing">Existing Customer</TabsTrigger>
                </TabsList>

                {/* Existing Customer — single typeahead search */}
                <TabsContent value="existing" className="mt-3 space-y-2">
                  <div className="grid gap-2 relative">
                    <Label>Search Customer</Label>
                    {/* Selected customer chip — use live query result or snapshot fallback */}
                    {booking.customerId && (selectedCustomer || customerSnapshot) && (
                      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                        <span className="flex-1 font-medium">
                          {selectedCustomer?.fullName ?? customerSnapshot?.fullName}
                        </span>
                        {(selectedCustomer?.phone ?? customerSnapshot?.phone) && (
                          <span className="text-xs text-muted-foreground">
                            {selectedCustomer?.phone ?? customerSnapshot?.phone}
                          </span>
                        )}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setBooking({...booking, customerId: ""});
                            setCustomerSearch("");
                            setCustomerSnapshot(null);
                            customerSearchRef.current?.focus();
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {!booking.customerId && (
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          ref={customerSearchRef}
                          value={customerSearch}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setCustomerDropdownOpen(true);
                          }}
                          onFocus={() => setCustomerDropdownOpen(true)}
                          className="pl-8"
                        />
                        {customerDropdownOpen && allCustomers.length > 0 && (
                          <div
                            ref={customerDropdownRef}
                            className="absolute z-50 top-full mt-1 w-full rounded-md border border-border/50 bg-popover shadow-lg overflow-hidden"
                          >
                            {allCustomers.slice(0, 8).map((c: any) => (
                              <button
                                key={c.id}
                                type="button"
                                className="w-full flex flex-col items-start px-3 py-2 text-sm hover:bg-accent transition-colors text-left border-b border-border/20 last:border-0"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setBooking({...booking, customerId: c.id.toString()});
                                  setCustomerSearch(c.fullName || "");
                                  setCustomerDropdownOpen(false);
                                }}
                              >
                                <span className="font-medium">{c.fullName}</span>
                                {(c.phone || c.email) && (
                                  <span className="text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                                )}
                              </button>
                            ))}
                            {allCustomers.length === 0 && (
                              <div className="px-3 py-2 text-sm text-muted-foreground">No customers found</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="new" className="mt-3 space-y-3">
                  <div className="grid gap-2">
                    <Label>Full Name <span className="text-destructive">*</span></Label>
                    <Input 
                      value={booking.newCustomerName}
                      onChange={e => setBooking({...booking, newCustomerName: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Phone</Label>
                      <Input 
                        value={booking.newCustomerPhone}
                        onChange={e => setBooking({...booking, newCustomerPhone: e.target.value})}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Email</Label>
                      <Input 
                        type="email"
                        value={booking.newCustomerEmail}
                        onChange={e => setBooking({...booking, newCustomerEmail: e.target.value})}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Reservation Status — moved here, above Vehicle */}
            <div className="space-y-3 rounded-lg border border-border/50 p-4 bg-muted/20">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Reservation</h3>
              <div className="grid gap-2">
                <Label>Booking Status</Label>
                <Select value={booking.status} onValueChange={(v: any) => setBooking({...booking, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                    <SelectItem value="DELIVERED">Delivered</SelectItem>
                    <SelectItem value="RETURNED">Returned</SelectItem>
                    <SelectItem value="CANCELED">Canceled</SelectItem>
                    <SelectItem value="NO_SHOW">No Show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Vehicle Section */}
            <div className="space-y-3 rounded-lg border border-border/50 p-4 bg-muted/20">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Vehicle</h3>
              <div className="grid gap-2">
                <Label>Brand</Label>
                <Select
                  value={booking.brandId}
                  onValueChange={(v) => setBooking({ ...booking, brandId: v, vehicleModelId: "", vehicleId: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Any brand…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any brand</SelectItem>
                    {(() => {
                      const modelCountByBrand = new Map<number, number>();
                      for (const m of allModels) {
                        const bid: number = m.brandId ?? m.brand?.id;
                        if (bid != null) modelCountByBrand.set(bid, (modelCountByBrand.get(bid) ?? 0) + 1);
                      }
                      return [...allBrands].sort((a: any, b: any) => {
                        const diff = (modelCountByBrand.get(b.id) ?? 0) - (modelCountByBrand.get(a.id) ?? 0);
                        return diff !== 0 ? diff : a.name.localeCompare(b.name);
                      });
                    })().map((b: any) => (
                      <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Model <span className="text-destructive">*</span></Label>
                <Select
                  value={booking.vehicleModelId}
                  onValueChange={(v) => setBooking({ ...booking, vehicleModelId: v, vehicleId: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Choose model…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any model</SelectItem>
                    {[...filteredModels].sort((a: any, b: any) => a.name.localeCompare(b.name)).map((m: any) => (
                      <SelectItem key={m.id} value={m.id.toString()}>
                        {m.brand?.name} {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  Specific Vehicle
                  <span className="text-muted-foreground font-normal text-xs">(optional — can be assigned later)</span>
                </Label>
                <Select value={booking.vehicleId} onValueChange={(v) => setBooking({ ...booking, vehicleId: v })}>
                  <SelectTrigger><SelectValue placeholder="Any available vehicle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any available vehicle</SelectItem>
                    {allVehicles.filter((v: any) => v.status === "AVAILABLE" || v.status === "RESERVED").map((v: any) => (
                      <SelectItem key={v.id} value={v.id.toString()}>
                        {v.vehicleModel?.brand?.name} {v.vehicleModel?.name} — {v.licensePlate} ({v.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Pickup Section */}
            <div className="space-y-3 rounded-lg border border-border/50 p-4 bg-muted/20">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pickup</h3>
              <div className="grid gap-2">
                <Label>Location <span className="text-destructive">*</span></Label>
                <Select
                  value={booking.pickupLocationId}
                  onValueChange={(v) => {
                    const loc = allLocations.find((l: any) => l.id.toString() === v);
                    setBooking({
                      ...booking,
                      pickupLocationId: v,
                      pickupType: deriveLocationType(loc?.name ?? ""),
                      pickupAddress: "",
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select pickup location..." /></SelectTrigger>
                  <SelectContent>
                    {allLocations.map((loc: any) => (
                      <SelectItem key={loc.id} value={loc.id.toString()}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DateTimePicker
                label="Date & Time"
                dateValue={booking.pickupDate}
                timeValue={booking.pickupTime}
                onDateChange={(d) => setBooking({ ...booking, pickupDate: d })}
                onTimeChange={(t) => setBooking({ ...booking, pickupTime: t })}
                required
              />
              {booking.pickupType === "hotel" && (
                <div className="grid gap-2">
                  <Label>Hotel Name / Address</Label>
                  <Input
                    value={booking.pickupAddress}
                    onChange={e => setBooking({...booking, pickupAddress: e.target.value})}
                    placeholder="Enter hotel name or address"
                  />
                </div>
              )}
            </div>

            {/* Dropoff Section */}
            <div className="space-y-3 rounded-lg border border-border/50 p-4 bg-muted/20">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dropoff / Return</h3>
              <div className="grid gap-2">
                <Label>Location <span className="text-destructive">*</span></Label>
                <Select
                  value={booking.dropoffLocationId}
                  onValueChange={(v) => {
                    const loc = allLocations.find((l: any) => l.id.toString() === v);
                    setBooking({
                      ...booking,
                      dropoffLocationId: v,
                      dropoffType: deriveLocationType(loc?.name ?? ""),
                      dropoffAddress: "",
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select dropoff location..." /></SelectTrigger>
                  <SelectContent>
                    {allLocations.map((loc: any) => (
                      <SelectItem key={loc.id} value={loc.id.toString()}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DateTimePicker
                label="Date & Time"
                dateValue={booking.dropoffDate}
                timeValue={booking.dropoffTime}
                onDateChange={(d) => setBooking({ ...booking, dropoffDate: d })}
                onTimeChange={(t) => setBooking({ ...booking, dropoffTime: t })}
                required
              />
              {booking.dropoffType === "hotel" && (
                <div className="grid gap-2">
                  <Label>Hotel Name / Address</Label>
                  <Input
                    value={booking.dropoffAddress}
                    onChange={e => setBooking({...booking, dropoffAddress: e.target.value})}
                    placeholder="Enter hotel name or address"
                  />
                </div>
              )}
            </div>

            {/* Pricing & Notes */}
            <div className="space-y-3 rounded-lg border border-border/50 p-4 bg-muted/20">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pricing & Notes</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Total Amount (optional)</Label>
                  <div className="flex gap-2">
                    <Input 
                      type="number" step="0.01" 
                      value={booking.totalAmount}
                      onChange={e => setBooking({...booking, totalAmount: e.target.value})}
                      className="flex-1"
                    />
                    <Select value={booking.currency} onValueChange={(v) => setBooking({...booking, currency: v})}>
                      <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GEL">₾ GEL</SelectItem>
                        <SelectItem value="USD">$ USD</SelectItem>
                        <SelectItem value="EUR">€ EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Payment Status</Label>
                  <Select value={booking.paymentStatus} onValueChange={(v) => setBooking({...booking, paymentStatus: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNPAID">Unpaid</SelectItem>
                      <SelectItem value="HALF">Partial</SelectItem>
                      <SelectItem value="PAID">Paid</SelectItem>
                      <SelectItem value="PREPAID">PrePaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea 
                  value={booking.notes}
                  onChange={e => setBooking({...booking, notes: e.target.value})}
                  rows={2}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setIsNewBookingOpen(false); setEditBookingId(null); }}>Cancel</Button>
            {isEditMode ? (
              <Button onClick={handleUpdateBooking} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving…" : "Save Changes"}
              </Button>
            ) : (
              <Button onClick={handleCreateBooking} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Booking"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VoucherImportDialog
        open={isVoucherImportOpen}
        onOpenChange={setIsVoucherImportOpen}
        locations={allAdminLocations}
        models={allModels}
        brands={allBrands}
        onOpenBookingDetail={(bookingId) => {
          setIsVoucherImportOpen(false);
          setDetailBookingId(bookingId);
        }}
      />
    </div>
  );
}
