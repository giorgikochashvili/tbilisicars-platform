import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
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
import { Plus, MoreHorizontal, Edit, Trash2, Car, Settings2, ShieldCheck, Gauge, Info, Search, Filter, X, MapPin } from "lucide-react";
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

  type Region = "All" | "Tbilisi" | "Kutaisi" | "Batumi";
  const FLEET_REGIONS: Region[] = ["All", "Tbilisi", "Kutaisi", "Batumi"];
  const VALID_REGIONS = FLEET_REGIONS.slice(1) as string[];

  const parseUrlParams = (loc: string): { status: VehicleStatus | ""; region: Region } => {
    const search = loc.includes("?") ? loc.split("?")[1] : "";
    const params = new URLSearchParams(search);
    const s = params.get("status")?.toUpperCase() ?? "";
    const c = params.get("city") ?? "";
    return {
      status: (VALID_STATUSES as readonly string[]).includes(s) ? (s as VehicleStatus) : "",
      region: VALID_REGIONS.includes(c) ? (c as Region) : "All",
    };
  };

  const initial = parseUrlParams(location);

  // Filter state
  const [filterRegion, setFilterRegion] = useState<Region>(initial.region);
  const [plateSearch, setPlateSearch] = useState("");
  const [filterLocationId, setFilterLocationId] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterBrandId, setFilterBrandId] = useState("");
  const [filterModelId, setFilterModelId] = useState("");
  const [filterStatus, setFilterStatus] = useState<VehicleStatus | "">(initial.status);

  const [formData, setFormData] = useState<{
    vehicleModelId: string;
    licensePlate: string;
    vin: string;
    year: number;
    color: string;
    status: "AVAILABLE" | "RENTED" | "MAINTENANCE" | "RESERVED" | "INACTIVE";
    mileage: number;
    locationId: string;
  }>({ 
    vehicleModelId: "", licensePlate: "", vin: "", 
    year: new Date().getFullYear(), color: "White", 
    status: "AVAILABLE", mileage: 0, locationId: ""
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data, isLoading } = useListAdminVehicles(undefined, reqOpts);
  const { data: models } = useListAdminModels(reqOpts);
  const { data: locations } = useListLocations(reqOpts);
  const { data: brands } = useListAdminBrands(reqOpts);
  const vehicles = (data as any)?.data || [];
  const allModels: any[] = (models as any) || [];
  const allBrands: any[] = (brands as any) || [];
  const allLocations: any[] = (locations as any) || [];

  // Re-apply filters when location (URL) changes, e.g. navigating from Dashboard
  useEffect(() => {
    const { status, region } = parseUrlParams(location);
    setFilterStatus(status);
    setFilterRegion(region);
  }, [location]);

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
  const hasActiveFilters = !!(filterRegion !== "All" || plateSearch || filterLocationId || filterCategory || filterBrandId || filterModelId || filterStatus);
  const filteredVehicles = vehicles.filter((v: any) => {
    if (regionLocationIds && !regionLocationIds.has(v.locationId)) return false;
    if (plateSearch && !v.licensePlate?.toUpperCase().includes(plateSearch.toUpperCase())) return false;
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
    setPlateSearch("");
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
      setFormData({
        vehicleModelId: item.vehicleModelId?.toString() || "",
        licensePlate: item.licensePlate || "",
        vin: item.vin || "",
        year: item.year || new Date().getFullYear(),
        color: item.color || "White",
        status: item.status || "AVAILABLE",
        mileage: item.mileage || 0,
        locationId: item.locationId?.toString() || "",
      });
    } else {
      setEditingItem(null);
      setFormData({ 
        vehicleModelId: "", licensePlate: "", vin: "", 
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
            {/* Plate search — primary */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Plate number…"
                value={plateSearch}
                onChange={(e) => setPlateSearch(e.target.value.toUpperCase())}
                className="pl-9 bg-background h-9 text-sm font-mono uppercase"
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
                        {v.vehicleModel?.brand?.logoUrl && (
                          <img
                            src={`/api/storage${v.vehicleModel.brand.logoUrl}`}
                            alt=""
                            className="w-5 h-5 rounded object-contain flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
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
                      {m.brand?.name} {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>License Plate <span className="text-destructive">*</span></Label>
                <Input className="font-mono uppercase" value={formData.licensePlate} onChange={e => setFormData({...formData, licensePlate: e.target.value.toUpperCase()})} placeholder="AA-123-BB" />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(val: any) => setFormData({...formData, status: val})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AVAILABLE">Available</SelectItem>
                    <SelectItem value="RENTED">Rented</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                    <SelectItem value="RESERVED">Reserved</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Current Location</Label>
              <Select value={formData.locationId} onValueChange={(val) => setFormData({...formData, locationId: val})}>
                <SelectTrigger><SelectValue placeholder="Select location..." /></SelectTrigger>
                <SelectContent>
                  {(locations as any)?.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id.toString()}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>VIN</Label>
              <Input className="font-mono uppercase" value={formData.vin} onChange={e => setFormData({...formData, vin: e.target.value.toUpperCase()})} placeholder="Optional" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Year</Label>
                <Input type="number" value={formData.year} onChange={e => setFormData({...formData, year: parseInt(e.target.value)})} />
              </div>
              <div className="grid gap-2">
                <Label>Color</Label>
                <Input value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} />
              </div>
              <div className="grid gap-2">
                <Label>Mileage (km)</Label>
                <Input type="number" value={formData.mileage} onChange={e => setFormData({...formData, mileage: parseInt(e.target.value) || 0})} />
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

function ModelsTab({ reqOpts }: { reqOpts: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<{
    brandId: string;
    name: string;
    category: string;
    seats: number;
    doors: number;
    transmission: "MANUAL" | "AUTOMATIC" | "";
    fuelType: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | "";
    luggageCapacity: number;
    active: boolean;
  }>({ 
    brandId: "", name: "", category: "", 
    seats: 5, doors: 4, transmission: "AUTOMATIC", 
    fuelType: "PETROL", luggageCapacity: 2, active: true
  });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: models, isLoading } = useListAdminModels(reqOpts);
  const { data: brands } = useListAdminBrands(reqOpts);
  
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
        active: item.active ?? true,
      });
    } else {
      setEditingItem(null);
      setFormData({ 
        brandId: "", name: "", category: "", 
        seats: 5, doors: 4, transmission: "AUTOMATIC", 
        fuelType: "PETROL", luggageCapacity: 2, active: true 
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
      active: formData.active,
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
              (models as any)?.map((m: any) => (
                <TableRow key={m.id} className="border-border/20 hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {m.brand?.logoUrl && (
                        <img
                          src={`/api/storage${m.brand.logoUrl}`}
                          alt=""
                          className="w-5 h-5 rounded object-contain flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <div>
                        <div className="font-medium">{m.brand?.name}</div>
                        <div className="text-sm text-muted-foreground">{m.name}</div>
                      </div>
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
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenModal(m)}><Edit className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))
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
                  {(brands as any)?.map((b: any) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Model Name <span className="text-destructive">*</span></Label>
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Camry, RAV4, Prius" />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Input value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="e.g. Economy, SUV, Luxury" />
            </div>
            <div className="grid grid-cols-2 gap-4">
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
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Seats</Label>
                <Input type="number" min="1" value={formData.seats} onChange={e => setFormData({...formData, seats: parseInt(e.target.value) || 5})} />
              </div>
              <div className="grid gap-2">
                <Label>Doors</Label>
                <Input type="number" min="2" value={formData.doors} onChange={e => setFormData({...formData, doors: parseInt(e.target.value) || 4})} />
              </div>
              <div className="grid gap-2">
                <Label>Luggage</Label>
                <Input type="number" min="0" value={formData.luggageCapacity} onChange={e => setFormData({...formData, luggageCapacity: parseInt(e.target.value) || 0})} />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/30">
              <Label>Active</Label>
              <Switch checked={formData.active} onCheckedChange={val => setFormData({...formData, active: val})} />
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
  const [formData, setFormData] = useState({ name: "", countryOfOrigin: "", logoUrl: "" });
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
    setFormData(item ? {name: item.name, countryOfOrigin: item.countryOfOrigin||"", logoUrl: item.logoUrl||""} : {name: "", countryOfOrigin: "", logoUrl: ""});
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Brand name is required", variant: "destructive" });
      return;
    }
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: formData }, { 
        onSuccess: () => { toast({ title: "Success", description: "Brand updated" }); queryClient.invalidateQueries(); setIsModalOpen(false); },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
      });
    } else {
      createMutation.mutate({ data: formData }, { 
        onSuccess: () => { toast({ title: "Success", description: "Brand created" }); queryClient.invalidateQueries(); setIsModalOpen(false); },
        onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
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
              <TableHead>Country of Origin</TableHead>
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
                  <TableCell className="font-bold">{b.name}</TableCell>
                  <TableCell>{b.countryOfOrigin || "—"}</TableCell>
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
              <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Toyota" />
            </div>
            <div className="grid gap-2">
              <Label>Country of Origin</Label>
              <Input value={formData.countryOfOrigin} onChange={e => setFormData({...formData, countryOfOrigin: e.target.value})} placeholder="e.g. Japan" />
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
