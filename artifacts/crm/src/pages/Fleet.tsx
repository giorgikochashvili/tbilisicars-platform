import React, { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useListAdminVehicles,
  useCreateAdminVehicle,
  useUpdateAdminVehicle,
  useDeleteAdminVehicle,
  useListAdminModels,
  useCreateAdminModel,
  useUpdateAdminModel,
  useDeleteAdminModel,
  useListAdminBrands,
  useCreateAdminBrand,
  useUpdateAdminBrand,
  useDeleteAdminBrand,
  useListLocations,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, MoreHorizontal, Edit, Trash2, Car, Settings2, ShieldCheck, Gauge, Info, Search, Filter, X, MapPin, ChevronDown, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import VehicleDetail from "./VehicleDetail";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    AVAILABLE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    RENTED: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    MAINTENANCE: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    RESERVED: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    INACTIVE: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  };
  return (
    <Badge variant="outline" className={colors[status] || "bg-gray-500/10 text-gray-500"}>
      {status}
    </Badge>
  );
}

function toStorageSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("/api/storage/")) return path;
  return `/api/storage${path}`;
}

export default function FleetPage() {
  const reqOpts = { request: { credentials: "include" as const } };
  
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
          <Car className="w-6 h-6 text-primary" /> Fleet Management
        </h2>
        <p className="text-muted-foreground">Manage vehicles, models, and brands</p>
      </div>

      <Tabs defaultValue="vehicles" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="vehicles"><Car className="w-4 h-4 mr-2" /> Vehicles</TabsTrigger>
          <TabsTrigger value="models"><Settings2 className="w-4 h-4 mr-2" /> Models</TabsTrigger>
          <TabsTrigger value="brands"><ShieldCheck className="w-4 h-4 mr-2" /> Brands</TabsTrigger>
        </TabsList>
        
        <TabsContent value="vehicles" className="mt-6">
          <VehiclesTab reqOpts={reqOpts} />
        </TabsContent>
        <TabsContent value="models" className="mt-6">
          <ModelsTab reqOpts={reqOpts} />
        </TabsContent>
        <TabsContent value="brands" className="mt-6">
          <BrandsTab reqOpts={reqOpts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const VALID_STATUSES = ["AVAILABLE", "RENTED", "MAINTENANCE", "RESERVED", "INACTIVE"] as const;
type VehicleStatus = (typeof VALID_STATUSES)[number];


function VehiclesTab({ reqOpts }: { reqOpts: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [detailVehicleId, setDetailVehicleId] = useState<number | null>(null);

  // Read initial status + city filter from URL query params
  const [location] = useLocation();
  const search = useSearch();

  type Region = "All" | "Tbilisi" | "Kutaisi" | "Batumi";
  const FLEET_REGIONS: Region[] = ["All", "Tbilisi", "Kutaisi", "Batumi"];
  const VALID_REGIONS = FLEET_REGIONS.slice(1) as string[];

  const parseUrlParams = (searchStr: string): { status: VehicleStatus | ""; region: Region; vehicleId: number | null } => {
    const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
    const s = params.get("status")?.toUpperCase() ?? "";
    const c = params.get("city") ?? "";
    const vid = params.get("vehicleId");
    return {
      status: (VALID_STATUSES as readonly string[]).includes(s) ? (s as VehicleStatus) : "",
      region: VALID_REGIONS.includes(c) ? (c as Region) : "All",
      vehicleId: vid && !isNaN(parseInt(vid)) ? parseInt(vid) : null,
    };
  };

  const initial = parseUrlParams(search);

  // Filter state
  const [filterRegion, setFilterRegion] = useState<Region>(initial.region);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [filterLocationId, setFilterLocationId] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterBrandId, setFilterBrandId] = useState("");
  const [filterModelId, setFilterModelId] = useState("");
  const [filterStatus, setFilterStatus] = useState<VehicleStatus | "">(initial.status);

  const [formData, setFormData] = useState<{
    vehicleModelId: string;
    licensePlate: string;
    techpassportNumber: string;
    year: number;
    color: string;
    status: "AVAILABLE" | "RENTED" | "MAINTENANCE" | "RESERVED" | "INACTIVE";
    mileage: number;
    locationId: string;
  }>({ 
    vehicleModelId: "", licensePlate: "", techpassportNumber: "", 
    year: new Date().getFullYear(), color: "White", 
    status: "AVAILABLE", mileage: 0, locationId: ""
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data, isLoading } = useListAdminVehicles({ limit: 500 }, reqOpts);
  const { data: models } = useListAdminModels(reqOpts);
  const { data: locations } = useListLocations(reqOpts);
  const { data: brands } = useListAdminBrands(reqOpts);
  const vehicles = (data as any)?.data || [];
  const vehiclesMeta = (data as any)?.meta;
  const allModels: any[] = (models as any) || [];
  const allBrands: any[] = (brands as any) || [];
  const allLocations: any[] = (locations as any) || [];

  // Build exactly 3 region options for the location dropdown (one representative per city)
  const MAIN_REGION_CITIES = ["Tbilisi", "Kutaisi", "Batumi"];
  const regionLocations = MAIN_REGION_CITIES.map(city => {
    const match = allLocations.find((l: any) => l.city === city);
    return match ? { id: match.id, city } : null;
  }).filter(Boolean) as { id: number; city: string }[];

  // Re-apply filters when URL search params change, e.g. navigating from Dashboard or via plate link
  useEffect(() => {
    const { status, region, vehicleId } = parseUrlParams(search);
    setFilterStatus(status);
    setFilterRegion(region);
    if (vehicleId !== null) {
      setDetailVehicleId(vehicleId);
    }
  }, [search]);

  // Map modelId -> category for category filtering (vehicles may not carry category inline)
  const modelCategoryMap: Record<string, string> = {};
  allModels.forEach((m: any) => { if (m.id != null && m.category) modelCategoryMap[m.id.toString()] = m.category; });

  // Derived filter options — sourced from loaded vehicles to avoid dead-end options
  const categoryOptions: string[] = (Array.from(
    new Set(
      vehicles.map((v: any) =>
        (v.vehicleModel?.category ?? modelCategoryMap[v.vehicleModelId?.toString() ?? ""] ?? "") as string
      ).filter(Boolean)
    )
  ) as string[]).sort();
  const modelsForBrand = filterBrandId && filterBrandId !== "any"
    ? allModels.filter((m: any) => m.brandId?.toString() === filterBrandId)
    : allModels;

  // Build a set of location IDs for the selected region (for client-side region filter)
  const regionLocationIds = filterRegion !== "All"
    ? new Set(allLocations.filter((loc: any) => loc.city === filterRegion).map((loc: any) => loc.id))
    : null;

  // Filtered vehicles (client-side)
  const hasActiveFilters = !!(filterRegion !== "All" || vehicleSearch || filterLocationId || filterCategory || filterBrandId || filterModelId || filterStatus);
  const filteredVehicles = vehicles.filter((v: any) => {
    if (regionLocationIds && !regionLocationIds.has(v.locationId)) return false;
    if (vehicleSearch) {
      const q = vehicleSearch.trim().toUpperCase();
      const plate = v.licensePlate?.toUpperCase() ?? "";
      const brand = v.vehicleModel?.brand?.name?.toUpperCase() ?? "";
      const model = v.vehicleModel?.name?.toUpperCase() ?? "";
      const tech = v.techpassportNumber?.toUpperCase() ?? "";
      if (!plate.includes(q) && !brand.includes(q) && !model.includes(q) && !tech.includes(q)) return false;
    }
    if (filterLocationId && v.locationId?.toString() !== filterLocationId) return false;
    if (filterCategory) {
      const cat = v.vehicleModel?.category ?? modelCategoryMap[v.vehicleModelId?.toString() ?? ""] ?? "";
      if (cat !== filterCategory) return false;
    }
    if (filterBrandId && filterBrandId !== "any" && v.vehicleModel?.brand?.id?.toString() !== filterBrandId) return false;
    if (filterModelId && v.vehicleModelId?.toString() !== filterModelId) return false;
    if (filterStatus && v.status !== filterStatus) return false;
    return true;
  });

  const clearFilters = () => {
    setFilterRegion("All");
    setVehicleSearch("");
    setFilterLocationId("");
    setFilterCategory("");
    setFilterBrandId("");
    setFilterModelId("");
    setFilterStatus("");
  };

  const createMutation = useCreateAdminVehicle(reqOpts);
  const updateMutation = useUpdateAdminVehicle(reqOpts);
  const deleteMutation = useDeleteAdminVehicle(reqOpts);

  const handleOpenModal = (item: any = null) => {
    if (item) {
      setEditingItem(item);
      // Normalize locationId to a representative region ID (Tbilisi/Kutaisi/Batumi)
      // so that vehicles with sub-location IDs still show the correct city in the dropdown.
      let locationId = item.locationId?.toString() || "";
      if (locationId) {
        const loc = allLocations.find((l: any) => l.id?.toString() === locationId);
        if (loc?.city) {
          const rep = regionLocations.find((r) => r.city === loc.city);
          if (rep) locationId = rep.id.toString();
        }
      }
      setFormData({
        vehicleModelId: item.vehicleModelId?.toString() || "",
        licensePlate: item.licensePlate || "",
        techpassportNumber: item.techpassportNumber || "",
        year: item.year || new Date().getFullYear(),
        color: item.color || "White",
        status: item.status || "AVAILABLE",
        mileage: item.mileage || 0,
        locationId,
      });
    } else {
      setEditingItem(null);
      setFormData({ 
        vehicleModelId: "", licensePlate: "", techpassportNumber: "", 
        year: new Date().getFullYear(), color: "White", 
        status: "AVAILABLE", mileage: 0, locationId: ""
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.vehicleModelId) {
      toast({ title: "Validation Error", description: "Please select a vehicle model", variant: "destructive" });
      return;
    }
    if (!formData.licensePlate.trim()) {
      toast({ title: "Validation Error", description: "License plate is required", variant: "destructive" });
      return;
    }

    const payload = {
      ...formData,
      vehicleModelId: parseInt(formData.vehicleModelId),
      locationId: formData.locationId ? parseInt(formData.locationId) : undefined,
    };
    
    if (editingItem) {
      updateMutation.mutate(
        { id: editingItem.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Vehicle updated" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
          }
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Vehicle added to fleet" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to create", variant: "destructive" });
          }
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Remove this vehicle from the fleet?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Success", description: "Vehicle removed" });
          queryClient.invalidateQueries();
        }
      });
    }
  };

  return (
    <>
      {/* Header row */}
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleOpenModal()} className="shadow-sm hover-elevate">
          <Plus className="w-4 h-4 mr-2" /> Add Vehicle
        </Button>
      </div>

      {/* Filter bar */}
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm p-4 mb-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" /> Filters
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-6 px-2 ml-auto text-xs" onClick={clearFilters}>
                <X className="w-3 h-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          {/* Region selector */}
          <div className="flex items-center gap-1 bg-background/60 border border-border/40 rounded-lg px-2 h-9 w-fit">
            <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            {FLEET_REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setFilterRegion(r)}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                  filterRegion === r
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Vehicle search — plate, brand, model, techpassport */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                placeholder="Plate, brand or model"
                className="pl-9 bg-background h-9 text-sm"
              />
            </div>
            {/* Status */}
            <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v as VehicleStatus)}>
              <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="AVAILABLE">Available</SelectItem>
                <SelectItem value="RENTED">Rented</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="RESERVED">Reserved</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {/* Location */}
            <Select value={filterLocationId || "all"} onValueChange={(v) => setFilterLocationId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="All locations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {allLocations.map((loc: any) => (
                  <SelectItem key={loc.id} value={loc.id.toString()}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Category */}
            <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Brand */}
            <Select value={filterBrandId || "all"} onValueChange={(v) => {
              setFilterBrandId(v === "all" ? "" : v);
              setFilterModelId("");
            }}>
              <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="All brands" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {allBrands.map((b: any) => (
                  <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Model (filtered by brand) */}
            <Select value={filterModelId || "all"} onValueChange={(v) => setFilterModelId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm bg-background"><SelectValue placeholder="All models" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All models</SelectItem>
                {modelsForBrand.map((m: any) => (
                  <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead>Brand / Model</TableHead>
                <TableHead>Plate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Specs</TableHead>
                <TableHead>Mileage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : filteredVehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Car className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    {hasActiveFilters ? "No vehicles match the current filters." : "No vehicles found. Add a vehicle to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredVehicles?.map((v: any) => (
                  <TableRow
                    key={v.id}
                    className="border-border/20 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setDetailVehicleId(v.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium text-foreground">
                            {v.vehicleModel?.brand?.name} {v.vehicleModel?.name}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            {v.color && (
                              <>
                                <div className="w-2 h-2 rounded-full border border-border" style={{ backgroundColor: v.color.toLowerCase() }} />
                                {v.color}
                              </>
                            )}
                            {v.year && <span>{v.year}</span>}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono font-bold tracking-wider text-sm bg-muted px-2 py-1 rounded border border-border/50 inline-block">
                        {v.licensePlate || "—"}
                      </div>
                      {v.techpassportNumber && (
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">Techpassport Number: {v.techpassportNumber}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={v.status || "INACTIVE"} />
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        {v.vehicleModel?.transmission || v.transmission} • {v.vehicleModel?.fuelType || v.fuelType}
                        {v.vehicleModel?.seats && <span> • {v.vehicleModel.seats} seats</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Gauge className="w-3 h-3 text-muted-foreground" />
                        {v.mileage?.toLocaleString() || "—"} km
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDetailVehicleId(v.id)}>
                            <Info className="w-4 h-4 mr-2" /> View Detail
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenModal(v)}>
                            <Edit className="w-4 h-4 mr-2" /> Edit Vehicle
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(v.id)} className="text-destructive focus:text-destructive">
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
        {vehiclesMeta && (
          <div className="px-4 py-2 border-t border-border/40 text-xs text-muted-foreground">
            {filteredVehicles.length === vehicles.length
              ? `${vehicles.length} vehicle${vehicles.length !== 1 ? "s" : ""}`
              : `${filteredVehicles.length} of ${vehicles.length} vehicle${vehicles.length !== 1 ? "s" : ""} (filtered)`}
            {vehiclesMeta.total > 500 && ` · ${vehiclesMeta.total} total in fleet`}
          </div>
        )}
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
            <DialogDescription>Physical car unit linked to a model.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Vehicle Model <span className="text-destructive">*</span></Label>
              <Select value={formData.vehicleModelId} onValueChange={(val) => setFormData({...formData, vehicleModelId: val})}>
                <SelectTrigger><SelectValue placeholder="Select a model..." /></SelectTrigger>
                <SelectContent>
                  {(models as any)?.map((m: any) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      <span className="flex items-center gap-2">
                        {m.imageUrl ? (
                          <img
                            src={toStorageSrc(m.imageUrl)}
                            alt=""
                            className="w-7 h-7 rounded object-contain flex-shrink-0 bg-muted/30"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <span className="w-7 h-7 rounded bg-muted/30 flex items-center justify-center flex-shrink-0">
                            <Car className="w-3.5 h-3.5 text-muted-foreground/30" />
                          </span>
                        )}
                        {m.brand?.name} {m.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>License Plate <span className="text-destructive">*</span></Label>
                <Input className="font-mono uppercase" value={formData.licensePlate} onChange={e => setFormData({...formData, licensePlate: e.target.value.toUpperCase()})} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                {(() => {
                  const managed = formData.status === "RENTED" || formData.status === "MAINTENANCE" || formData.status === "RESERVED";
                  if (managed) {
                    const note = formData.status === "MAINTENANCE" ? "managed by service" : "managed by bookings";
                    return (
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={formData.status} />
                          <span className="text-xs text-muted-foreground">{note}</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setFormData({ ...formData, status: "AVAILABLE" })}
                          >
                            Set Available
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setFormData({ ...formData, status: "INACTIVE" })}
                          >
                            Set Inactive
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Select value={formData.status} onValueChange={(val) => {
                      if (val === "AVAILABLE" || val === "INACTIVE") {
                        setFormData({ ...formData, status: val });
                      }
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AVAILABLE">Available</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Current Location</Label>
              <Select value={formData.locationId} onValueChange={(val) => {
                setFormData({ ...formData, locationId: val });
              }}>
                <SelectTrigger>
                  <SelectValue placeholder={regionLocations.length === 0 ? "Loading regions…" : "Select region..."} />
                </SelectTrigger>
                <SelectContent>
                  {regionLocations.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading regions…</div>
                  ) : (
                    regionLocations.map((r) => (
                      <SelectItem key={r.id} value={r.id.toString()}>{r.city}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Techpassport Number</Label>
              <Input className="font-mono uppercase" value={formData.techpassportNumber} onChange={e => setFormData({...formData, techpassportNumber: e.target.value.toUpperCase()})} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Year</Label>
                <Input type="number" value={formData.year} onWheel={e => e.currentTarget.blur()} onChange={e => setFormData({...formData, year: parseInt(e.target.value)})} />
              </div>
              <div className="grid gap-2">
                <Label>Color</Label>
                <Input value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Mileage (km)</Label>
                <Input type="number" value={formData.mileage} onWheel={e => e.currentTarget.blur()} onChange={e => setFormData({...formData, mileage: parseInt(e.target.value) || 0})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VehicleDetail
        vehicleId={detailVehicleId}
        open={detailVehicleId !== null}
        onClose={() => setDetailVehicleId(null)}
      />
    </>
  );
}

const MODEL_CATEGORIES = [
  "Economy",
  "Standard / Intermediate Sedan",
  "Full-Size Sedan",
  "Crossover / Intermediate SUV",
  "Full-Size SUV",
  "7 Seater SUV",
  "Minivan / People Carrier",
  "Off-Road",
  "Business Class",
  "Coupe / Convertible",
  "Sports Car",
] as const;

function ModelsTab({ reqOpts }: { reqOpts: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [expandedModelId, setExpandedModelId] = useState<number | null>(null);
  const [formData, setFormData] = useState<{
    brandId: string;
    name: string;
    category: string;
    seats: number;
    doors: number;
    transmission: "MANUAL" | "AUTOMATIC" | "";
    fuelType: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | "";
    luggageCapacity: number;
    driveType: "FWD" | "RWD" | "AWD" | "4x4" | "";
    active: boolean;
    availableForExternalSystems: boolean;
    imageUrl: string | null;
  }>({ 
    brandId: "", name: "", category: "", 
    seats: 5, doors: 4, transmission: "AUTOMATIC", 
    fuelType: "PETROL", luggageCapacity: 2, driveType: "", active: true,
    availableForExternalSystems: true, imageUrl: null
  });
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleImageUpload = async (file: File) => {
    setImageUploading(true);
    try {
      if (editingItem) {
        const res = await fetch(`/api/admin/fleet/models/${editingItem.id}/image`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": file.type || "image/jpeg" },
          body: file,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Upload failed (${res.status})`);
        }
        const { imageUrl } = await res.json();
        setFormData(prev => ({ ...prev, imageUrl }));
      } else {
        const metaRes = await fetch("/api/storage/uploads/request-url", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "image/jpeg" }),
        });
        if (!metaRes.ok) {
          const errBody = await metaRes.json().catch(() => ({}));
          throw new Error(errBody.error || `Upload URL request failed (${metaRes.status})`);
        }
        const { uploadURL, objectPath } = await metaRes.json();
        const putRes = await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "image/jpeg" },
        });
        if (!putRes.ok) throw new Error(`File upload to storage failed (${putRes.status})`);
        setFormData(prev => ({ ...prev, imageUrl: objectPath }));
      }
      toast({ title: "Image uploaded", description: "Image ready — save the model to apply." });
    } catch (e: any) {
      console.error("[handleImageUpload]", e);
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  };
  
  const { data: models, isLoading } = useListAdminModels(reqOpts);
  const { data: brands } = useListAdminBrands(reqOpts);
  const { data: vehiclesData } = useListAdminVehicles({ limit: 500 }, reqOpts);
  const { data: locationsData } = useListLocations(reqOpts);
  const allVehicles: any[] = (vehiclesData as any)?.data || [];
  const locationMap: Record<string, string> = {};
  ((locationsData as any) || []).forEach((loc: any) => { if (loc.id != null) locationMap[loc.id.toString()] = loc.city || loc.name || ""; });
  
  const createMutation = useCreateAdminModel(reqOpts);
  const updateMutation = useUpdateAdminModel(reqOpts);
  const deleteMutation = useDeleteAdminModel(reqOpts);

  const handleOpenModal = (item: any = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        brandId: item.brandId?.toString() || "",
        name: item.name || "",
        category: item.category || "",
        seats: item.seats || 5,
        doors: item.doors || 4,
        transmission: item.transmission || "AUTOMATIC",
        fuelType: item.fuelType || "PETROL",
        luggageCapacity: item.luggageCapacity || 2,
        driveType: item.driveType || "",
        active: item.active ?? true,
        availableForExternalSystems: item.availableForExternalSystems ?? true,
        imageUrl: item.imageUrl || null,
      });
    } else {
      setEditingItem(null);
      setFormData({ 
        brandId: "", name: "", category: "", 
        seats: 5, doors: 4, transmission: "AUTOMATIC", 
        fuelType: "PETROL", luggageCapacity: 2, driveType: "", active: true,
        availableForExternalSystems: true, imageUrl: null
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.brandId) {
      toast({ title: "Validation Error", description: "Please select a brand", variant: "destructive" });
      return;
    }
    if (!formData.name.trim()) {
      toast({ title: "Validation Error", description: "Model name is required", variant: "destructive" });
      return;
    }

    const payload = {
      brandId: parseInt(formData.brandId),
      name: formData.name,
      category: formData.category || undefined,
      seats: formData.seats,
      doors: formData.doors,
      transmission: formData.transmission as any || null,
      fuelType: formData.fuelType as any || null,
      luggageCapacity: formData.luggageCapacity,
      driveType: formData.driveType || null,
      active: formData.active,
      availableForExternalSystems: formData.availableForExternalSystems,
      // In edit mode: send "" to explicitly clear an existing image when user removes it.
      // In create mode: omit if no image was uploaded (undefined = skip field).
      imageUrl: editingItem
        ? (formData.imageUrl ?? "")
        : (formData.imageUrl || undefined),
    };
    
    if (editingItem) {
      updateMutation.mutate(
        { id: editingItem.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Model updated" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Model created" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this model? All linked vehicles will become unlinked.")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries()
      });
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => handleOpenModal()} className="shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Add Model
        </Button>
      </div>
      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Brand / Model</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Transmission</TableHead>
              <TableHead>Fuel</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
            ) : (models as any)?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No models yet. Add a brand first, then add models.
                </TableCell>
              </TableRow>
            ) : (
              (models as any)?.map((m: any) => {
                const isExpanded = expandedModelId === m.id;
                const modelVehicles = allVehicles.filter((v: any) => v.vehicleModelId === m.id);
                return (
                  <React.Fragment key={m.id}>
                    <TableRow
                      className="border-border/20 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setExpandedModelId(isExpanded ? null : m.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                          {m.imageUrl ? (
                            <img
                              src={toStorageSrc(m.imageUrl)}
                              alt=""
                              className="w-7 h-7 rounded object-contain flex-shrink-0 bg-muted/30"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <span className="w-7 h-7 rounded bg-muted/30 flex items-center justify-center flex-shrink-0">
                              <Car className="w-3.5 h-3.5 text-muted-foreground/30" />
                            </span>
                          )}
                          <span className="font-medium">{m.brand?.name} {m.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize text-sm">{m.category || "—"}</TableCell>
                      <TableCell className="capitalize text-sm">{m.transmission || "—"}</TableCell>
                      <TableCell className="capitalize text-sm">{m.fuelType || "—"}</TableCell>
                      <TableCell className="text-sm">{m.seats || "—"}</TableCell>
                      <TableCell>
                        {m.active ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenModal(m)}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${m.id}-expanded`} className="border-border/10 bg-muted/10">
                        <TableCell colSpan={7} className="p-0">
                          <div className="px-8 py-3">
                            {modelVehicles.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2">No physical vehicles linked to this model yet.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground border-b border-border/20">
                                    <th className="text-left font-medium py-1 pr-4">Plate</th>
                                    <th className="text-left font-medium py-1 pr-4">Region</th>
                                    <th className="text-left font-medium py-1 pr-4">Status</th>
                                    <th className="text-left font-medium py-1">Mileage</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {modelVehicles.map((v: any) => (
                                    <tr key={v.id} className="border-b border-border/10 last:border-0">
                                      <td className="py-1 pr-4 font-mono font-bold tracking-wider">{v.licensePlate || "—"}</td>
                                      <td className="py-1 pr-4 text-muted-foreground">{locationMap[v.locationId?.toString()] || "—"}</td>
                                      <td className="py-1 pr-4"><StatusBadge status={v.status || "INACTIVE"} /></td>
                                      <td className="py-1 text-muted-foreground">{v.mileage != null ? `${v.mileage.toLocaleString()} km` : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
      
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Model" : "Add Model"}</DialogTitle>
            <DialogDescription>A bookable car model belonging to a brand.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Brand <span className="text-destructive">*</span></Label>
              <Select value={formData.brandId} onValueChange={(val) => setFormData({...formData, brandId: val})}>
                <SelectTrigger><SelectValue placeholder="Select Brand" /></SelectTrigger>
                <SelectContent>
                  {(brands as any)?.map((b: any) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Model Name <span className="text-destructive">*</span></Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label>Model Image (optional)</Label>
              <div className="flex items-center gap-3">
                {formData.imageUrl ? (
                  <img
                    src={toStorageSrc(formData.imageUrl)}
                    alt="Model preview"
                    className="w-16 h-12 rounded object-cover border border-border/50 bg-muted/30 flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-16 h-12 rounded bg-muted/30 border border-border/40 flex items-center justify-center flex-shrink-0">
                    <Car className="w-5 h-5 text-muted-foreground/30" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={imageInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageUpload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={imageUploading}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    {imageUploading ? "Uploading…" : formData.imageUrl ? "Replace Image" : "Upload Image"}
                  </Button>
                  {formData.imageUrl && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive mt-1 block"
                      onClick={() => setFormData(prev => ({ ...prev, imageUrl: null }))}
                    >
                      Remove image
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(val) => setFormData({...formData, category: val})}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent className="max-h-[240px] overflow-y-auto">
                  {MODEL_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Transmission</Label>
                <Select value={formData.transmission} onValueChange={(val: any) => setFormData({...formData, transmission: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTOMATIC">Automatic</SelectItem>
                    <SelectItem value="MANUAL">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Fuel Type</Label>
                <Select value={formData.fuelType} onValueChange={(val: any) => setFormData({...formData, fuelType: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PETROL">Petrol</SelectItem>
                    <SelectItem value="DIESEL">Diesel</SelectItem>
                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                    <SelectItem value="ELECTRIC">Electric</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Drive Type</Label>
                <Select value={formData.driveType} onValueChange={(val: "FWD" | "RWD" | "AWD" | "4x4") => setFormData({...formData, driveType: val})}>
                  <SelectTrigger><SelectValue placeholder="Select drive type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FWD">FWD (Front-wheel)</SelectItem>
                    <SelectItem value="RWD">RWD (Rear-wheel)</SelectItem>
                    <SelectItem value="AWD">AWD (All-wheel)</SelectItem>
                    <SelectItem value="4x4">4x4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Seats</Label>
                <Input type="number" min="1" value={formData.seats} onWheel={e => e.currentTarget.blur()} onChange={e => setFormData({...formData, seats: parseInt(e.target.value) || 5})} />
              </div>
              <div className="grid gap-2">
                <Label>Doors</Label>
                <Input type="number" min="2" value={formData.doors} onWheel={e => e.currentTarget.blur()} onChange={e => setFormData({...formData, doors: parseInt(e.target.value) || 4})} />
              </div>
              <div className="grid gap-2">
                <Label>Luggage</Label>
                <Input type="number" min="0" value={formData.luggageCapacity} onWheel={e => e.currentTarget.blur()} onChange={e => setFormData({...formData, luggageCapacity: parseInt(e.target.value) || 0})} />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/30">
              <Label>Active</Label>
              <Switch checked={formData.active} onCheckedChange={val => setFormData({...formData, active: val})} />
            </div>
            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/30">
              <div>
                <Label>Show on website</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Display this model in the public booking search</p>
              </div>
              <Switch checked={formData.availableForExternalSystems} onCheckedChange={val => setFormData({...formData, availableForExternalSystems: val})} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Model"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BrandsTab({ reqOpts }: { reqOpts: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState({ name: "", logoUrl: "" });
  const [nameError, setNameError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    try {
      const metaRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "image/png" }),
      });
      if (!metaRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await metaRes.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/png" },
      });
      if (!putRes.ok) throw new Error("Failed to upload file");
      setFormData(prev => ({ ...prev, logoUrl: objectPath }));
      toast({ title: "Logo uploaded", description: "Logo ready — save the brand to apply." });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setLogoUploading(false);
    }
  };
  const { data: brands, isLoading } = useListAdminBrands(reqOpts);
  
  const createMutation = useCreateAdminBrand(reqOpts);
  const updateMutation = useUpdateAdminBrand(reqOpts);
  const deleteMutation = useDeleteAdminBrand(reqOpts);

  const openModal = (item: any = null) => {
    setEditingItem(item);
    setFormData(item ? {name: item.name, logoUrl: item.logoUrl||""} : {name: "", logoUrl: ""});
    setNameError(null);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      setNameError("Brand name is required");
      return;
    }
    setNameError(null);
    const handleError = (err: any) => {
      if (err?.status === 409) {
        setNameError(`A brand named "${formData.name.trim()}" already exists.`);
      } else {
        toast({ title: "Error", description: err?.message || "Failed to save brand", variant: "destructive" });
      }
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData }, { 
        onSuccess: () => { toast({ title: "Success", description: "Brand updated" }); queryClient.invalidateQueries(); setIsModalOpen(false); },
        onError: handleError,
      });
    } else {
      createMutation.mutate({ data: formData }, { 
        onSuccess: () => { toast({ title: "Success", description: "Brand created" }); queryClient.invalidateQueries(); setIsModalOpen(false); },
        onError: handleError,
      });
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => openModal()}>
          <Plus className="w-4 h-4 mr-2" /> Add Brand
        </Button>
      </div>
      <Card className="border-border/40 bg-card/60">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead>Brand Name</TableHead>
              <TableHead>Vehicles</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={3}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
            ) : (brands as any)?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">No brands yet.</TableCell>
              </TableRow>
            ) : (
              (brands as any)?.map((b: any) => (
                <TableRow key={b.id} className="border-border/20 hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {b.logoUrl && (
                        <img
                          src={`/api/storage${b.logoUrl}`}
                          alt=""
                          className="w-6 h-6 rounded object-contain flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <span className="font-bold">{b.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.vehicleCount ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(b)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if(confirm("Delete brand?")) deleteMutation.mutate({id: b.id}, {onSuccess: () => queryClient.invalidateQueries()}) }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Brand" : "Add Brand"}</DialogTitle>
            <DialogDescription>A car manufacturer (e.g. Toyota, Hyundai).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Brand Name <span className="text-destructive">*</span></Label>
              <Input
                value={formData.name}
                onChange={e => { setFormData({...formData, name: e.target.value}); setNameError(null); }}
                className={nameError ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="grid gap-2">
              <Label>Brand Logo (optional)</Label>
              <div className="flex items-center gap-3">
                {formData.logoUrl && (
                  <img
                    src={`/api/storage${formData.logoUrl}`}
                    alt="Logo preview"
                    className="w-10 h-10 rounded object-contain border border-border/50 bg-muted/30 p-1 flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={logoInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleLogoUpload(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={logoUploading}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {logoUploading ? "Uploading…" : formData.logoUrl ? "Replace Logo" : "Upload Logo"}
                  </Button>
                  {formData.logoUrl && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive mt-1 block"
                      onClick={() => setFormData(prev => ({ ...prev, logoUrl: "" }))}
                    >
                      Remove logo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Brand"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
