import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, MoreHorizontal, Edit, Trash2, Wrench, Filter, X, Info } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

const EMPTY_FORM = {
  vehicleId: "",
  serviceTypeId: "",
  serviceDate: new Date().toISOString().split("T")[0],
  mileage: "",
  cost: "",
  shopName: "",
  mechanicName: "",
  description: "",
  status: "COMPLETED" as string,
};

export default function ServicePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [detailVehicleId, setDetailVehicleId] = useState<number | null>(null);

  const [vehicleSearch, setVehicleSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Modal vehicle cascade state
  const [svcPlateSearch, setSvcPlateSearch] = useState("");
  const [svcBrandId, setSvcBrandId] = useState("");
  const [svcModelId, setSvcModelId] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  // ── Handlers ──────────────────────────────────────────────────────

  const handleOpenModal = (record: any = null) => {
    setSvcPlateSearch("");
    setSvcModelId("");
    if (record) {
      setEditingRecord(record);
      setFormData({
        vehicleId: record.vehicleId?.toString() ?? "",
        serviceTypeId: record.serviceTypeId?.toString() ?? "",
        serviceDate: record.serviceDate ?? new Date().toISOString().split("T")[0],
        mileage: record.mileage?.toString() ?? "",
        cost: record.cost?.toString() ?? "",
        shopName: record.shopName ?? "",
        mechanicName: record.mechanicName ?? "",
        description: record.description ?? "",
        status: record.status ?? "COMPLETED",
      });
      // Pre-fill cascade from saved vehicle
      const savedVehicle = vehicles.find((v: any) => v.id?.toString() === record.vehicleId?.toString());
      setSvcBrandId(savedVehicle?.vehicleModel?.brand?.id?.toString() ?? "");
      setSvcModelId(savedVehicle?.vehicleModelId?.toString() ?? "");
    } else {
      setEditingRecord(null);
      setFormData(EMPTY_FORM);
      setSvcBrandId("");
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.vehicleId) {
      toast({ title: "Validation Error", description: "Vehicle is required", variant: "destructive" });
      return;
    }
    if (!formData.serviceTypeId) {
      toast({ title: "Validation Error", description: "Service category is required", variant: "destructive" });
      return;
    }
    const body = {
      vehicleId: parseInt(formData.vehicleId),
      serviceTypeId: parseInt(formData.serviceTypeId),
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

  const vehicleLabel = (v: any) =>
    `${v.vehicleModel?.brand?.name ?? ""} ${v.vehicleModel?.name ?? ""} — ${v.licensePlate ?? "no plate"}`.trim();

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
    if (svcPlateSearch && !v.licensePlate?.toUpperCase().includes(svcPlateSearch.toUpperCase())) return false;
    return true;
  });

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
                ({meta.total} total)
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
                records.map((r: any) => (
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
                      <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                        {r.serviceTypeName}
                      </Badge>
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
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[r.status] ?? ""}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {r.vehicleId && (
                            <DropdownMenuItem onClick={() => setDetailVehicleId(r.vehicleId)}>
                              <Info className="w-4 h-4 mr-2" /> View Vehicle Detail
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleOpenModal(r)}>
                            <Edit className="w-4 h-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(r.id)} className="text-destructive focus:text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add / Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingRecord ? "Edit Service Record" : "Add Service Record"}
            </DialogTitle>
            <DialogDescription>
              Record maintenance or service work performed on a vehicle.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Vehicle — plate search + Brand → Model → Vehicle cascade */}
            <div className="grid gap-2">
              <Label>Vehicle <span className="text-destructive">*</span></Label>
              {/* Plate search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={svcPlateSearch}
                  onChange={(e) => {
                    setSvcPlateSearch(e.target.value.toUpperCase());
                    setFormData({ ...formData, vehicleId: "" });
                  }}
                  className="pl-9 bg-background font-mono uppercase text-sm"
                />
              </div>
              {/* Brand */}
              <Select value={svcBrandId || "any"} onValueChange={(v) => {
                setSvcBrandId(v === "any" ? "" : v);
                setSvcModelId("");
                setFormData({ ...formData, vehicleId: "" });
              }}>
                <SelectTrigger className="bg-background text-sm"><SelectValue placeholder="Any brand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any brand</SelectItem>
                  {svcBrands.map((b: any) => (
                    <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Model */}
              <Select value={svcModelId || "any"} onValueChange={(v) => {
                setSvcModelId(v === "any" ? "" : v);
                setFormData({ ...formData, vehicleId: "" });
              }}>
                <SelectTrigger className="bg-background text-sm"><SelectValue placeholder="Any model" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any model</SelectItem>
                  {svcModelsForBrand.map((m: any) => (
                    <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Vehicle */}
              <Select value={formData.vehicleId} onValueChange={(v) => setFormData({ ...formData, vehicleId: v })}>
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

            {/* Category */}
            <div className="grid gap-2">
              <Label>Service Category <span className="text-destructive">*</span></Label>
              <Select value={formData.serviceTypeId} onValueChange={(v) => setFormData({ ...formData, serviceTypeId: v })}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select category…" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {(serviceTypes as any[]).map((t: any) => (
                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date + Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Service Date</Label>
                <Input
                  type="date"
                  value={formData.serviceDate}
                  onChange={(e) => setFormData({ ...formData, serviceDate: e.target.value })}
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Mileage + Cost */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Mileage at Service (km)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.mileage}
                  onChange={(e) => setFormData({ ...formData, mileage: e.target.value })}
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
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  className="bg-background"
                />
              </div>
            </div>

            {/* Shop + Mechanic */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Service Shop / Vendor</Label>
                <Input
                  value={formData.shopName}
                  onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                  className="bg-background"
                />
              </div>
              <div className="grid gap-2">
                <Label>Mechanic Name</Label>
                <Input
                  value={formData.mechanicName}
                  onChange={(e) => setFormData({ ...formData, mechanicName: e.target.value })}
                  className="bg-background"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="grid gap-2">
              <Label>Work Description / Notes</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
