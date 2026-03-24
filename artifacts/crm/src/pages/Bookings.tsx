import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAdminBookings,
  useCreateAdminBooking,
  useUpdateAdminBookingStatus,
  useListAdminCustomers,
  useListAdminBrands,
  useListAdminModels,
  useListAdminVehicles,
  useListLocations,
} from "@workspace/api-client-react";
import { formatBookingAmount } from "@/lib/utils";
import BookingDetail from "./BookingDetail";
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
import { Plus, Search, CalendarDays, CalendarIcon, X } from "lucide-react";
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

function PaymentBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    UNPAID: "bg-red-500/10 text-red-500 border-red-500/20",
    HALF: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    PAID: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    REFUNDED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] uppercase ${colors[status] || "bg-gray-500/10 text-gray-500"}`}>
      {status}
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

const DELIVERY_TYPES = [
  { value: "airport", label: "Airport" },
  { value: "hotel", label: "Hotel" },
  { value: "address", label: "Address" },
  { value: "office", label: "Office" },
];

const EMPTY_BOOKING = {
  customerMode: "existing" as "existing" | "new",
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
  pickupType: "airport",
  pickupAddress: "",
  dropoffLocationId: "",
  dropoffDate: "",
  dropoffTime: "10:00",
  dropoffType: "airport",
  dropoffAddress: "",
  totalAmount: "",
  currency: "GEL",
  notes: "",
  status: "PENDING" as const,
};

export default function BookingsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [paymentFilter, setPaymentFilter] = useState<string>("ALL");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("ALL");
  const [bookingIdSearch, setBookingIdSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [detailBookingId, setDetailBookingId] = useState<number | null>(null);
  const [booking, setBooking] = useState(EMPTY_BOOKING);
  const [customerSearch, setCustomerSearch] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const reqOpts = { request: { credentials: "include" as const } };

  const queryParams: any = { page, limit: 15 };
  if (search) queryParams.search = search;
  if (statusFilter !== "ALL") queryParams.status = statusFilter;
  if (paymentFilter !== "ALL") queryParams.paymentStatus = paymentFilter;
  if (vehicleSearch) queryParams.vehicleSearch = vehicleSearch;
  if (dateFrom) queryParams.dateFrom = dateFrom;
  if (dateTo) queryParams.dateTo = dateTo;
  if (locationFilter !== "ALL") queryParams.locationId = parseInt(locationFilter);
  if (bookingIdSearch && !isNaN(parseInt(bookingIdSearch))) queryParams.bookingId = parseInt(bookingIdSearch);

  const hasActiveFilters = search || statusFilter !== "ALL" || paymentFilter !== "ALL" || vehicleSearch || dateFrom || dateTo || locationFilter !== "ALL" || bookingIdSearch;

  const clearAllFilters = () => {
    setSearch("");
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
  const { data: customers } = useListAdminCustomers({ page: 1, limit: 50, search: customerSearch }, reqOpts);
  const { data: brands } = useListAdminBrands(reqOpts);
  const { data: models } = useListAdminModels(reqOpts);
  const vehicleQueryParams = useMemo(() => {
    const id = parseInt(booking.vehicleModelId);
    return !isNaN(id) ? ({ modelId: id } as any) : undefined;
  }, [booking.vehicleModelId]);
  const { data: vehicleData } = useListAdminVehicles(vehicleQueryParams, reqOpts);
  const { data: locations } = useListLocations(reqOpts);

  const statusMutation = useUpdateAdminBookingStatus(reqOpts);
  const createMutation = useCreateAdminBooking(reqOpts);

  const bookings = (data as any)?.data || [];
  const meta = (data as any)?.meta;
  const allVehicles = (vehicleData as any)?.data || [];
  const allLocations = (locations as any) || [];
  const allModels = (models as any) || [];
  const allBrands = (brands as any) || [];
  const allCustomers = (customers as any)?.data || [];

  const filteredModels = booking.brandId && booking.brandId !== "any"
    ? allModels.filter((m: any) => (m.brandId?.toString() ?? m.brand?.id?.toString()) === booking.brandId)
    : allModels;

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
    setIsNewBookingOpen(true);
  };

  const handleCreateBooking = () => {
    if (booking.customerMode === "existing" && !booking.customerId) {
      toast({ title: "Validation Error", description: "Please select a customer", variant: "destructive" });
      return;
    }
    if (booking.customerMode === "new" && !booking.newCustomerName.trim()) {
      toast({ title: "Validation Error", description: "Customer name is required", variant: "destructive" });
      return;
    }
    const vehicleModelIdNum = parseInt(booking.vehicleModelId);
    if (!booking.vehicleModelId || booking.vehicleModelId === "any" || isNaN(vehicleModelIdNum)) {
      toast({ title: "Validation Error", description: "Please select a vehicle model", variant: "destructive" });
      return;
    }
    if (!booking.pickupLocationId) {
      toast({ title: "Validation Error", description: "Pickup location is required", variant: "destructive" });
      return;
    }
    if (!booking.dropoffLocationId) {
      toast({ title: "Validation Error", description: "Dropoff location is required", variant: "destructive" });
      return;
    }
    if (!booking.pickupDate) {
      toast({ title: "Validation Error", description: "Pickup date is required", variant: "destructive" });
      return;
    }
    if (!booking.dropoffDate) {
      toast({ title: "Validation Error", description: "Dropoff date is required", variant: "destructive" });
      return;
    }

    const pickupDatetime = new Date(`${booking.pickupDate}T${booking.pickupTime}:00`).toISOString();
    const dropoffDatetime = new Date(`${booking.dropoffDate}T${booking.dropoffTime}:00`).toISOString();

    const selectedCustomer = booking.customerMode === "existing"
      ? allCustomers.find((c: any) => c.id.toString() === booking.customerId)
      : null;

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
      pickupAddress: ["hotel", "address"].includes(booking.pickupType) ? booking.pickupAddress : null,
      dropoffType: booking.dropoffType,
      dropoffAddress: ["hotel", "address"].includes(booking.dropoffType) ? booking.dropoffAddress : null,
      notes: booking.notes || null,
      status: booking.status,
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

    createMutation.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Booking Created", description: `New booking for ${contactFullName} saved.` });
          queryClient.invalidateQueries();
          setIsNewBookingOpen(false);
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err.message || "Failed to create booking", variant: "destructive" });
        }
      }
    );
  };

  const needsAddress = (type: string) => ["hotel", "address"].includes(type);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary" /> Bookings
          </h2>
          <p className="text-muted-foreground">Manage reservations, deliveries, and returns</p>
        </div>
        <Button className="shadow-sm hover-elevate" onClick={openNewBooking}>
          <Plus className="w-4 h-4 mr-2" /> New Booking
        </Button>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="p-4 border-b border-border/40 bg-background/50 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Reservation ID */}
            <div className="relative w-28">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="#ID"
                value={bookingIdSearch}
                onChange={(e) => { setBookingIdSearch(e.target.value.replace(/\D/g, "")); setPage(1); }}
                className="pl-8 bg-background h-9 text-sm"
              />
            </div>
            {/* Customer search */}
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Customer name / phone / email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 bg-background h-9 text-sm"
              />
            </div>
            {/* Vehicle search */}
            <div className="relative w-44">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Plate or model…"
                value={vehicleSearch}
                onChange={(e) => { setVehicleSearch(e.target.value); setPage(1); }}
                className="pl-8 bg-background h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
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
                <SelectItem value="HALF">Partially Paid</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
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
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="bg-background h-9 text-sm w-[140px]"
              title="Pickup from"
            />
            {/* Date to */}
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="bg-background h-9 text-sm w-[140px]"
              title="Pickup to"
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
                <TableHead>Customer & Vehicle</TableHead>
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
                    <TableCell className="align-top pt-4">
                      <div className="font-semibold text-foreground mb-1">
                        {b.customer?.fullName || b.contactFullName || "Unknown"}
                      </div>
                      {b.vehicle ? (
                        <div className="text-xs text-muted-foreground">
                          {b.vehicle.modelName} &middot; <span className="font-mono">{b.vehicle.licensePlate}</span>
                        </div>
                      ) : b.vehicleModelName ? (
                        <div className="text-xs text-muted-foreground italic">{b.vehicleModelName} (unassigned)</div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No vehicle assigned</span>
                      )}
                      {b.source && b.source !== "admin" && (
                        <span className={`inline-flex items-center mt-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
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
                      <div className="font-mono font-bold text-sm mb-1">
                        {b.totalAmount ? formatBookingAmount(b.totalAmount, b.currency) : "—"}
                      </div>
                      <PaymentBadge status={b.paymentStatus} />
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
      />

      {/* ─── New Booking Modal ──────────────────────────────────────────── */}
      <Dialog open={isNewBookingOpen} onOpenChange={setIsNewBookingOpen}>
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">New Booking</DialogTitle>
            <DialogDescription>Create a new car rental reservation.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">

            {/* Customer Section */}
            <div className="space-y-3 rounded-lg border border-border/50 p-4 bg-muted/20">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Customer</h3>
              <Tabs value={booking.customerMode} onValueChange={(v: any) => setBooking({...booking, customerMode: v})}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="existing">Existing Customer</TabsTrigger>
                  <TabsTrigger value="new">New Customer</TabsTrigger>
                </TabsList>
                <TabsContent value="existing" className="mt-3 space-y-3">
                  <div className="grid gap-2">
                    <Label>Search Customer</Label>
                    <Input 
                      placeholder="Type name, email or phone..." 
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Select Customer</Label>
                    <Select value={booking.customerId} onValueChange={(v) => setBooking({...booking, customerId: v})}>
                      <SelectTrigger><SelectValue placeholder="Choose customer..." /></SelectTrigger>
                      <SelectContent>
                        {allCustomers.map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.fullName} {c.phone ? `· ${c.phone}` : ""} {c.email ? `· ${c.email}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
                <TabsContent value="new" className="mt-3 space-y-3">
                  <div className="grid gap-2">
                    <Label>Full Name <span className="text-destructive">*</span></Label>
                    <Input 
                      placeholder="Customer full name"
                      value={booking.newCustomerName}
                      onChange={e => setBooking({...booking, newCustomerName: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Phone</Label>
                      <Input 
                        placeholder="+995 555..."
                        value={booking.newCustomerPhone}
                        onChange={e => setBooking({...booking, newCustomerPhone: e.target.value})}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Email</Label>
                      <Input 
                        type="email"
                        placeholder="email@example.com"
                        value={booking.newCustomerEmail}
                        onChange={e => setBooking({...booking, newCustomerEmail: e.target.value})}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
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
                    {allBrands.map((b: any) => (
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
                    {filteredModels.map((m: any) => (
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
                <Select value={booking.pickupLocationId} onValueChange={(v) => setBooking({...booking, pickupLocationId: v})}>
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
              <div className="grid gap-2">
                <Label>Delivery Type</Label>
                <Select value={booking.pickupType} onValueChange={(v) => setBooking({...booking, pickupType: v, pickupAddress: ""})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DELIVERY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {needsAddress(booking.pickupType) && (
                <div className="grid gap-2">
                  <Label>Pickup Address</Label>
                  <Input 
                    placeholder="Hotel name or full address"
                    value={booking.pickupAddress}
                    onChange={e => setBooking({...booking, pickupAddress: e.target.value})}
                  />
                </div>
              )}
            </div>

            {/* Dropoff Section */}
            <div className="space-y-3 rounded-lg border border-border/50 p-4 bg-muted/20">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dropoff / Return</h3>
              <div className="grid gap-2">
                <Label>Location <span className="text-destructive">*</span></Label>
                <Select value={booking.dropoffLocationId} onValueChange={(v) => setBooking({...booking, dropoffLocationId: v})}>
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
              <div className="grid gap-2">
                <Label>Return Type</Label>
                <Select value={booking.dropoffType} onValueChange={(v) => setBooking({...booking, dropoffType: v, dropoffAddress: ""})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DELIVERY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {needsAddress(booking.dropoffType) && (
                <div className="grid gap-2">
                  <Label>Dropoff Address</Label>
                  <Input 
                    placeholder="Hotel name or full address"
                    value={booking.dropoffAddress}
                    onChange={e => setBooking({...booking, dropoffAddress: e.target.value})}
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
                      placeholder="0.00"
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
                  <Label>Status</Label>
                  <Select value={booking.status} onValueChange={(v: any) => setBooking({...booking, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Textarea 
                  placeholder="Flight number, special requests, internal notes..."
                  value={booking.notes}
                  onChange={e => setBooking({...booking, notes: e.target.value})}
                  rows={2}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setIsNewBookingOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateBooking} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
