import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, MoreHorizontal, Edit, Trash2, Wrench, Filter, X, Info, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import VehicleDetail from "./VehicleDetail";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json().catch(() => null);
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:    "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  IN_PROGRESS:  "bg-blue-500/10 text-blue-500 border-blue-500/20",
  SCHEDULED:    "bg-amber-500/10 text-amber-500 border-amber-500/20",
  CANCELLED:    "bg-red-500/10 text-red-500 border-red-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  COMPLETED:   "Completed",
  IN_PROGRESS: "In Progress",
  SCHEDULED:   "Scheduled",
  CANCELLED:   "Cancelled",
};

const GEORGIAN_CATEGORIES = [
  "ხუნდები",
  "ზეთი & ფილტრი",
  "ჩისტიწელები",
  "ნათურა",
  "ვიზუალური დაზიანება",
  "კარობკის ზეთი",
  "ტექ დათვალიერება",
  "სავალი ნაწილები",
  "გასატესტი",
  "საბურავები",
];

function parseCategories(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const EMPTY_FORM = {
  vehicleId: "",
  serviceDate: new Date().toISOString().split("T")[0],
  mileage: "",
  cost: "",
  shopName: "",
  mechanicName: "",
  description: "",
  status: "SCHEDULED" as string,
};

export default function ServicePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [detailVehicleId, setDetailVehicleId] = useState<number | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [vehicleSearch, setVehicleSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Modal vehicle cascade state
  const [svcPlateSearch, setSvcPlateSearch] = useState("");
  const [svcBrandId, setSvcBrandId] = useState("");
  const [svcModelId, setSvcModelId] = useState("");
  const [svcAutoOpen, setSvcAutoOpen] = useState(false);

  // Mechanic dropdown state
  const [mechanicDropdownOpen, setMechanicDropdownOpen] = useState(false);

  const plateRef = useRef<HTMLDivElement>(null);
  const mechanicRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (plateRef.current && !plateRef.current.contains(e.target as Node)) {
        setSvcAutoOpen(false);
      }
      if (mechanicRef.current && !mechanicRef.current.contains(e.target as Node)) {
        setMechanicDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Data fetching ─────────────────────────────────────────────────

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ["service-types"],
    queryFn: () => apiFetch("/api/admin/service/types"),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ["fleet-vehicles-for-service"],
    queryFn: () => apiFetch("/api/admin/fleet/vehicles?limit=200"),
  });
  const vehicles = vehiclesData?.data ?? [];

  const { data: teamData } = useQuery({
    queryKey: ["admin-team-for-service"],
    queryFn: () => apiFetch("/api/admin/team"),
  });
  const staffList: any[] = Array.isArray(teamData) ? teamData : [];

  const params = new URLSearchParams();
  if (vehicleSearch) params.set("vehicleSearch", vehicleSearch);
  if (filterCategory) params.set("serviceTypeId", filterCategory);
  if (filterStatus) params.set("status", filterStatus);
  if (filterDateFrom) params.set("dateFrom", filterDateFrom);
  if (filterDateTo) params.set("dateTo", filterDateTo);

  const { data: serviceData, isLoading } = useQuery({
    queryKey: ["service-records", vehicleSearch, filterCategory, filterStatus, filterDateFrom, filterDateTo],
    queryFn: () => apiFetch(`/api/admin/service?${params.toString()}`),
  });
  const records = serviceData?.data ?? [];
  const meta = serviceData?.meta;

  // ── Mutations ─────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch("/api/admin/service", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Service record created" });
      queryClient.invalidateQueries({ queryKey: ["service-records"] });
      setIsModalOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      apiFetch(`/api/admin/service/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast({ title: "Service record updated" });
      queryClient.invalidateQueries({ queryKey: ["service-records"] });
      setIsModalOpen(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/admin/service/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Service record deleted" });
      queryClient.invalidateQueries({ queryKey: ["service-records"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/api/admin/service/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["service-records"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────

  const handleOpenModal = (record: any = null) => {
    setSvcAutoOpen(false);
    setMechanicDropdownOpen(false);
    setSvcPlateSearch("");
    setSvcBrandId("");
    setSvcModelId("");
    if (record) {
      setEditingRecord(record);
      setFormData({
        vehicleId: record.vehicleId?.toString() ?? "",
        serviceDate: record.serviceDate ?? new Date().toISOString().split("T")[0],
        mileage: record.mileage?.toString() ?? "",
        cost: record.cost?.toString() ?? "",
        shopName: record.shopName ?? "",
        mechanicName: record.mechanicName ?? "",
        description: record.description ?? "",
        status: record.status ?? "SCHEDULED",
      });
      // Pre-fill categories
      setSelectedCategories(parseCategories(record.serviceCategories));
      // Pre-fill cascade from saved vehicle
      const savedVehicle = vehicles.find((v: any) => v.id?.toString() === record.vehicleId?.toString());
      setSvcPlateSearch(savedVehicle?.licensePlate ?? "");
      setSvcBrandId(savedVehicle?.vehicleModel?.brand?.id?.toString() ?? "");
      setSvcModelId(savedVehicle?.vehicleModelId?.toString() ?? "");
    } else {
      setEditingRecord(null);
      setFormData(EMPTY_FORM);
      setSelectedCategories([]);
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.vehicleId) {
      toast({ title: "Validation Error", description: "Vehicle is required", variant: "destructive" });
      return;
    }
    if (!editingRecord && selectedCategories.length === 0) {
      toast({ title: "Validation Error", description: "At least one service category is required", variant: "destructive" });
      return;
    }
    const body = {
      vehicleId: parseInt(formData.vehicleId),
      serviceCategories: JSON.stringify(selectedCategories),
      serviceDate: formData.serviceDate || null,
      mileage: formData.mileage ? parseInt(formData.mileage) : null,
      cost: formData.cost || null,
      shopName: formData.shopName || null,
      mechanicName: formData.mechanicName || null,
      description: formData.description || null,
      status: formData.status,
    };
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, body });
    } else {
      createMutation.mutate(body);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this service record? This cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  const clearFilters = () => {
    setVehicleSearch("");
    setFilterCategory("");
    setFilterStatus("");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const hasFilters = vehicleSearch || filterCategory || filterStatus || filterDateFrom || filterDateTo;

  // ── Modal vehicle cascade ─────────────────────────────────────────
  const svcBrands: any[] = Array.from(
    new Map(
      vehicles
        .map((v: any) => v.vehicleModel?.brand)
        .filter(Boolean)
        .map((b: any) => [b.id, b])
    ).values()
  ).sort((a: any, b: any) => a.name.localeCompare(b.name));

  const svcModelsForBrand: any[] = Array.from(
    new Map(
      vehicles
        .filter((v: any) =>
          !svcBrandId || svcBrandId === "any" || v.vehicleModel?.brand?.id?.toString() === svcBrandId
        )
        .map((v: any) => v.vehicleModel)
        .filter(Boolean)
        .map((m: any) => [m.id, m])
    ).values()
  ).sort((a: any, b: any) => a.name.localeCompare(b.name));

  const svcFilteredVehicles: any[] = vehicles.filter((v: any) => {
    if (svcBrandId && svcBrandId !== "any" && v.vehicleModel?.brand?.id?.toString() !== svcBrandId) return false;
    if (svcModelId && svcModelId !== "any" && v.vehicleModelId?.toString() !== svcModelId) return false;
    return true;
  });

  // Plate autocomplete results (search by plate, brand, or model)
  const svcAutoResults: any[] = svcPlateSearch.trim().length >= 1
    ? vehicles.filter((v: any) => {
        const q = svcPlateSearch.toLowerCase();
        return (
          v.licensePlate?.toLowerCase().includes(q) ||
          v.vehicleModel?.brand?.name?.toLowerCase().includes(q) ||
          v.vehicleModel?.name?.toLowerCase().includes(q)
        );
      }).slice(0, 10)
    : [];

  // Mechanic staff filtered list
  const filteredStaff = staffList.filter((s: any) =>
    !formData.mechanicName ||
    s.fullName?.toLowerCase().includes(formData.mechanicName.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary" /> Service & Maintenance
          </h2>
          <p className="text-muted-foreground">Fleet maintenance history and service records</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="shadow-sm hover-elevate">
          <Plus className="w-4 h-4 mr-2" /> Add Service Record
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" /> Filters
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-6 px-2 ml-auto text-xs" onClick={clearFilters}>
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                placeholder="Plate, brand or model"
                className="pl-9 bg-background h-9 text-sm"
              />
            </div>
            <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm bg-background">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {(serviceTypes as any[]).map((t: any) => (
                  <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="h-9 text-sm bg-background"
            />
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="h-9 text-sm bg-background"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <CardHeader className="py-4 border-b border-border/40 bg-background/50 flex flex-row items-center">
          <CardTitle className="text-base font-display">
            Service Records
            {meta && (
              <span className="font-normal text-muted-foreground ml-2 text-sm">
                ({vehicleSearch ? `${records.length} found` : `${meta.total} total`})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Mileage</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Vendor / Shop</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Wrench className="w-8 h-8 opacity-20" />
                      <p>{hasFilters ? "No records match the current filters." : "No service records yet."}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r: any) => {
                  const cats = parseCategories(r.serviceCategories);
                  return (
                    <TableRow key={r.id} className="border-border/20 hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm font-mono">
                        {r.serviceDate ? new Date(r.serviceDate).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">
                          {r.brandName} {r.vehicleModelName}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {r.vehicleLicensePlate || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {cats.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {cats.map((c: string) => (
                              <Badge key={c} variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                                {c}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                            {r.serviceTypeName || "—"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.mileage ? r.mileage.toLocaleString() + " km" : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {r.cost ? `₾${parseFloat(r.cost).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.shopName || r.mechanicName || "—"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={r.status}
                          onValueChange={(val) => statusMutation.mutate({ id: r.id, status: val })}
                          disabled={statusMutation.isPending}
                        >
                          <SelectTrigger className={`h-7 text-xs w-36 border ${STATUS_COLORS[r.status] ?? ""}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.entries(STATUS_LABELS) as [string, string][]).map(([val, label]) => (
                              <SelectItem key={val} value={val} className="text-xs">
                                <Badge variant="outline" className={`text-xs ${STATUS_COLORS[val] ?? ""}`}>
                                  {label}
                                </Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {r.vehicleId && (
                              <DropdownMenuItem onClick={() => setDetailVehicleId(r.vehicleId)}>
                                <Info className="w-4 h-4 mr-2" /> View Vehicle Detail
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleOpenModal(r)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit Full Record
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(r.id)} className="text-destructive focus:text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add / Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingRecord ? "Edit Service Record" : "Add Service Record"}
            </DialogTitle>
            <DialogDescription>
              Record maintenance or service work performed on a vehicle.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* ── Vehicle — plate autocomplete + Brand → Model → Vehicle cascade ── */}
            <div className="grid gap-2">
              <Label>Vehicle <span className="text-destructive">*</span></Label>

              {/* Plate autocomplete */}
              <div ref={plateRef} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={svcPlateSearch}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setSvcPlateSearch(val);
                    setFormData((prev) => ({ ...prev, vehicleId: "" }));
                    setSvcAutoOpen(true);
                  }}
                  onFocus={() => svcPlateSearch.trim() && setSvcAutoOpen(true)}
                  placeholder="Search by plate, brand or model…"
                  className="pl-9 bg-background font-mono uppercase text-sm"
                />
                {svcAutoOpen && svcAutoResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg max-h-52 overflow-y-auto">
                    {svcAutoResults.map((v: any) => (
                      <button
                        key={v.id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center gap-2 border-b border-border/30 last:border-0"
                        onClick={() => {
                          setSvcPlateSearch(v.licensePlate ?? "");
                          setSvcBrandId(v.vehicleModel?.brand?.id?.toString() ?? "");
                          setSvcModelId(v.vehicleModelId?.toString() ?? "");
                          setFormData((prev) => ({ ...prev, vehicleId: v.id.toString() }));
                          setSvcAutoOpen(false);
                        }}
                      >
                        <span className="font-mono font-semibold text-foreground min-w-[80px]">
                          {v.licensePlate ?? "no plate"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {v.vehicleModel?.brand?.name ?? ""} {v.vehicleModel?.name ?? ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Brand */}
              <Select
                value={svcBrandId || "any"}
                onValueChange={(v) => {
                  setSvcBrandId(v === "any" ? "" : v);
                  setSvcModelId("");
                  setFormData((prev) => ({ ...prev, vehicleId: "" }));
                  setSvcPlateSearch("");
                }}
              >
                <SelectTrigger className="bg-background text-sm"><SelectValue placeholder="Any brand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any brand</SelectItem>
                  {svcBrands.map((b: any) => (
                    <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Model */}
              <Select
                value={svcModelId || "any"}
                onValueChange={(v) => {
                  setSvcModelId(v === "any" ? "" : v);
                  setFormData((prev) => ({ ...prev, vehicleId: "" }));
                  setSvcPlateSearch("");
                }}
              >
                <SelectTrigger className="bg-background text-sm"><SelectValue placeholder="Any model" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any model</SelectItem>
                  {svcModelsForBrand.map((m: any) => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Vehicle — reverse sync updates plate field */}
              <Select
                value={formData.vehicleId}
                onValueChange={(v) => {
                  const sel = svcFilteredVehicles.find((fv: any) => fv.id.toString() === v);
                  setFormData((prev) => ({ ...prev, vehicleId: v }));
                  if (sel) setSvcPlateSearch(sel.licensePlate ?? "");
                }}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select vehicle…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {svcFilteredVehicles.length === 0 ? (
                    <SelectItem value="__none__" disabled>No vehicles match</SelectItem>
                  ) : (
                    svcFilteredVehicles.map((v: any) => (
                      <SelectItem key={v.id} value={v.id.toString()}>
                        {v.vehicleModel?.brand?.name ?? ""} {v.vehicleModel?.name ?? ""} — {v.licensePlate ?? "no plate"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* ── Service Categories (multi-select) ── */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>
                  Service Categories <span className="text-destructive">*</span>
                </Label>
                {selectedCategories.length > 0 && (
                  <span className="text-xs text-muted-foreground">{selectedCategories.length} selected</span>
                )}
              </div>
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedCategories.map((c) => (
                    <Badge key={c} variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="border border-border rounded-md bg-background divide-y divide-border/40 max-h-52 overflow-y-auto">
                {GEORGIAN_CATEGORIES.map((cat) => (
                  <div key={cat} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors">
                    <Checkbox
                      id={`cat-${cat}`}
                      checked={selectedCategories.includes(cat)}
                      onCheckedChange={(checked) => {
                        setSelectedCategories((prev) =>
                          checked ? [...prev, cat] : prev.filter((c) => c !== cat)
                        );
                      }}
                    />
                    <label
                      htmlFor={`cat-${cat}`}
                      className="text-sm cursor-pointer select-none flex-1"
                    >
                      {cat}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Date + Status ── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Service Date</Label>
                <Input
                  type="date"
                  value={formData.serviceDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, serviceDate: e.target.value }))}
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData((prev) => ({ ...prev, status: v }))}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Mileage + Cost ── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Mileage at Service (km)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.mileage}
                  onChange={(e) => setFormData((prev) => ({ ...prev, mileage: e.target.value }))}
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label>Cost (₾ GEL)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost}
                  onChange={(e) => setFormData((prev) => ({ ...prev, cost: e.target.value }))}
                  className="bg-background"
                />
              </div>
            </div>

            {/* ── Shop + Mechanic ── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Service Shop / Vendor</Label>
                <Input
                  value={formData.shopName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, shopName: e.target.value }))}
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label>Mechanic Name</Label>
                <div ref={mechanicRef} className="relative">
                  <Input
                    value={formData.mechanicName}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, mechanicName: e.target.value }));
                      setMechanicDropdownOpen(true);
                    }}
                    onFocus={() => setMechanicDropdownOpen(true)}
                    placeholder={staffList.length > 0 ? "Search staff…" : "Mechanic name"}
                    className="bg-background text-sm"
                  />
                  {staffList.length > 0 && (
                    <ChevronDown
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                    />
                  )}
                  {mechanicDropdownOpen && filteredStaff.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg max-h-44 overflow-y-auto">
                      {filteredStaff.map((s: any) => (
                        <button
                          key={s.id}
                          type="button"
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/30 last:border-0"
                          onClick={() => {
                            setFormData((prev) => ({ ...prev, mechanicName: s.fullName }));
                            setMechanicDropdownOpen(false);
                          }}
                        >
                          {s.fullName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Notes ── */}
            <div className="grid gap-2">
              <Label>Work Description / Notes</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                rows={3}
                className="bg-background"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving…" : "Save Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VehicleDetail
        vehicleId={detailVehicleId}
        open={detailVehicleId !== null}
        onClose={() => setDetailVehicleId(null)}
      />
    </div>
  );
}
