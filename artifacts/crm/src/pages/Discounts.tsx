import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminDiscounts,
  useCreateAdminDiscount,
  useUpdateAdminDiscount,
  useDeleteAdminDiscount,
  type AdminDiscountItem as AdminDiscount,
} from "../../../../lib/api-client-react/src/discounts";
import { useListAdminLocations } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, MoreHorizontal, Edit, Trash2, Percent } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const EMPTY_FORM = {
  name: "",
  discountType: "PERCENT" as "PERCENT" | "FIXED",
  value: 0,
  startDate: "",
  endDate: "",
  pickupLocationIds: [] as number[],
  isActive: true,
  vehicleModelIds: [] as number[],
};

interface VehicleModelItem {
  id: number;
  name: string;
  brandName: string;
}

interface FleetModelRaw {
  id: number;
  name: string;
  brandName?: string | null;
  brand?: { id: number; name: string | null; logoUrl?: string | null } | string | null;
}

interface LocationItem {
  id: number;
  name: string;
  city?: string | null;
}

export default function DiscountsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<AdminDiscount | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const reqOpts = { request: { credentials: "include" as const } };

  const { data: discounts, isLoading } = useListAdminDiscounts(reqOpts);
  const { data: locationsData } = useListAdminLocations(reqOpts);

  const { data: modelsData } = useQuery<VehicleModelItem[]>({
    queryKey: ["/api/admin/discounts/vehicle-models"],
    queryFn: async () => {
      const res = await fetch("/api/admin/fleet/models", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch vehicle models");
      const data = (await res.json()) as FleetModelRaw[];
      return data.map((m) => ({
        id: m.id,
        name: m.name,
        brandName: m.brandName ?? (typeof m.brand === "object" && m.brand !== null ? m.brand.name ?? "" : m.brand ?? ""),
      }));
    },
  });

  const createMutation = useCreateAdminDiscount(reqOpts);
  const updateMutation = useUpdateAdminDiscount(reqOpts);
  const deleteMutation = useDeleteAdminDiscount(reqOpts);

  const handleOpenModal = (discount: AdminDiscount | null = null) => {
    if (discount) {
      setEditingDiscount(discount);
      setFormData({
        name: discount.name,
        discountType: discount.discountType,
        value: Number(discount.value),
        startDate: discount.startDate ? String(discount.startDate).slice(0, 10) : "",
        endDate: discount.endDate ? String(discount.endDate).slice(0, 10) : "",
        pickupLocationIds: discount.pickupLocations.map((pl) => pl.locationId),
        isActive: discount.isActive,
        vehicleModelIds: discount.vehicleModels.map((vm) => vm.vehicleModelId),
      });
    } else {
      setEditingDiscount(null);
      setFormData(EMPTY_FORM);
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({ title: "Validation Error", description: "Discount name is required", variant: "destructive" });
      return;
    }
    if (formData.pickupLocationIds.length === 0) {
      toast({ title: "Validation Error", description: "At least one pickup location is required", variant: "destructive" });
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      toast({ title: "Validation Error", description: "Start and end dates are required", variant: "destructive" });
      return;
    }
    if (formData.startDate > formData.endDate) {
      toast({ title: "Validation Error", description: "Start date must be on or before end date", variant: "destructive" });
      return;
    }
    if (!formData.value || formData.value <= 0) {
      toast({ title: "Validation Error", description: "Discount value must be greater than 0", variant: "destructive" });
      return;
    }
    if (formData.discountType === "PERCENT" && formData.value > 100) {
      toast({ title: "Validation Error", description: "Percentage discount cannot exceed 100", variant: "destructive" });
      return;
    }
    if (formData.vehicleModelIds.length === 0) {
      toast({ title: "Validation Error", description: "At least one vehicle model must be selected", variant: "destructive" });
      return;
    }

    const payload = {
      name: formData.name.trim(),
      discountType: formData.discountType,
      value: formData.value,
      startDate: formData.startDate,
      endDate: formData.endDate,
      pickupLocationIds: formData.pickupLocationIds,
      isActive: formData.isActive,
      vehicleModelIds: formData.vehicleModelIds,
    };

    if (editingDiscount) {
      updateMutation.mutate(
        { id: editingDiscount.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Discount updated" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: Error) => {
            toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
          },
        },
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Discount created" });
            queryClient.invalidateQueries();
            setIsModalOpen(false);
          },
          onError: (err: Error) => {
            toast({ title: "Error", description: err.message || "Failed to create", variant: "destructive" });
          },
        },
      );
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this discount? This action cannot be undone.")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Discount deleted" });
            queryClient.invalidateQueries();
          },
          onError: (err: Error) => {
            toast({ title: "Error", description: err.message || "Failed to delete", variant: "destructive" });
          },
        },
      );
    }
  };

  const toggleModelSelection = (modelId: number) => {
    setFormData((prev) => ({
      ...prev,
      vehicleModelIds: prev.vehicleModelIds.includes(modelId)
        ? prev.vehicleModelIds.filter((id) => id !== modelId)
        : [...prev.vehicleModelIds, modelId],
    }));
  };

  const toggleLocationSelection = (locationId: number) => {
    setFormData((prev) => ({
      ...prev,
      pickupLocationIds: prev.pickupLocationIds.includes(locationId)
        ? prev.pickupLocationIds.filter((id) => id !== locationId)
        : [...prev.pickupLocationIds, locationId],
    }));
  };

  const formatValue = (discount: AdminDiscount) => {
    const v = Number(discount.value);
    return discount.discountType === "PERCENT" ? `${v}%` : `${v} GEL`;
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `${fmt(startDate)} – ${fmt(endDate)}`;
  };

  const isActive = (discount: AdminDiscount) => {
    const today = new Date().toISOString().slice(0, 10);
    return discount.isActive && discount.startDate <= today && discount.endDate >= today;
  };

  const formatLocations = (discount: AdminDiscount) => {
    const locs = discount.pickupLocations;
    if (!locs || locs.length === 0) {
      return discount.pickupLocationName
        ? `${discount.pickupLocationName}${discount.pickupLocationCity ? `, ${discount.pickupLocationCity}` : ""}`
        : "–";
    }
    const first = locs[0]!;
    const label = `${first.locationName ?? ""}${first.locationCity ? `, ${first.locationCity}` : ""}`.trim() || "–";
    return locs.length > 1 ? `${label} +${locs.length - 1}` : label;
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const locations = (locationsData as LocationItem[] ?? []);

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <Percent className="w-6 h-6 text-primary" /> Discounts
          </h2>
          <p className="text-muted-foreground">
            Website-only discounts applied automatically by pickup location, date range, and vehicle model.
          </p>
        </div>
        <Button onClick={() => handleOpenModal()} className="shadow-sm hover-elevate">
          <Plus className="w-4 h-4 mr-2" /> Create Discount
        </Button>
      </div>

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Location(s)</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead>Models</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : !discounts || discounts.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No discounts yet. Create one to get started.
                      </TableCell>
                    </TableRow>
                  )
                : discounts.map((discount) => (
                    <TableRow key={discount.id} className="border-border/40">
                      <TableCell className="font-medium">{discount.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {formatValue(discount)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatLocations(discount)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateRange(discount.startDate, discount.endDate)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {discount.vehicleModels.length > 0
                          ? discount.vehicleModels.slice(0, 2).map((vm) =>
                              `${vm.brandName ?? ""} ${vm.modelName ?? ""}`.trim()
                            ).join(", ") +
                            (discount.vehicleModels.length > 2 ? ` +${discount.vehicleModels.length - 2}` : "")
                          : "–"}
                      </TableCell>
                      <TableCell>
                        {isActive(discount)
                          ? <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">Active</Badge>
                          : discount.isActive
                          ? <Badge variant="outline" className="text-muted-foreground">Scheduled</Badge>
                          : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-8 h-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenModal(discount)}>
                              <Edit className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(discount.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDiscount ? "Edit Discount" : "Create Discount"}</DialogTitle>
            <DialogDescription>
              Discounts apply automatically on the website. They take priority over promo codes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Summer Flash Sale"
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Discount Type *</Label>
                <Select
                  value={formData.discountType}
                  onValueChange={(v) => setFormData((p) => ({ ...p, discountType: v as "PERCENT" | "FIXED" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">Percentage (%)</SelectItem>
                    <SelectItem value="FIXED">Fixed Amount (GEL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Value * {formData.discountType === "PERCENT" ? "(%)" : "(GEL)"}</Label>
                <Input
                  type="number"
                  min={1}
                  max={formData.discountType === "PERCENT" ? 100 : undefined}
                  step={formData.discountType === "PERCENT" ? 1 : 0.01}
                  value={formData.value || ""}
                  onChange={(e) => setFormData((p) => ({ ...p, value: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData((p) => ({ ...p, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData((p) => ({ ...p, endDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pickup Locations * ({formData.pickupLocationIds.length} selected)</Label>
              <div className="border border-border/40 rounded-md p-3 max-h-40 overflow-y-auto space-y-1">
                {locations.length === 0
                  ? <p className="text-sm text-muted-foreground">Loading locations...</p>
                  : locations.map((loc) => (
                      <div
                        key={loc.id}
                        className="flex items-center gap-2 py-0.5 cursor-pointer"
                        onClick={() => toggleLocationSelection(loc.id)}
                      >
                        <Checkbox
                          checked={formData.pickupLocationIds.includes(loc.id)}
                          onCheckedChange={() => undefined}
                          onClick={(e) => { e.stopPropagation(); toggleLocationSelection(loc.id); }}
                        />
                        <span className="text-sm">{loc.name}{loc.city ? `, ${loc.city}` : ""}</span>
                      </div>
                    ))}
              </div>
              {formData.pickupLocationIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {formData.pickupLocationIds.map((id) => {
                    const loc = locations.find((x) => x.id === id);
                    if (!loc) return null;
                    return (
                      <Badge key={id} variant="secondary" className="text-xs gap-1">
                        {loc.name}{loc.city ? `, ${loc.city}` : ""}
                        <button
                          className="ml-0.5 opacity-60 hover:opacity-100"
                          onClick={() => toggleLocationSelection(id)}
                        >×</button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Vehicle Models * ({formData.vehicleModelIds.length} selected)</Label>
              <div className="border border-border/40 rounded-md p-3 max-h-52 overflow-y-auto space-y-1">
                {!modelsData || modelsData.length === 0
                  ? <p className="text-sm text-muted-foreground">Loading models...</p>
                  : modelsData.map((model) => (
                      <div key={model.id} className="flex items-center gap-2 py-0.5 cursor-pointer" onClick={() => toggleModelSelection(model.id)}>
                        <Checkbox
                          checked={formData.vehicleModelIds.includes(model.id)}
                          onCheckedChange={() => undefined}
                          onClick={(e) => { e.stopPropagation(); toggleModelSelection(model.id); }}
                        />
                        <span className="text-sm">{model.brandName} {model.name}</span>
                      </div>
                    ))}
              </div>
              {formData.vehicleModelIds.length > 0 && modelsData && (
                <div className="flex flex-wrap gap-1">
                  {formData.vehicleModelIds.map((id) => {
                    const m = modelsData.find((x) => x.id === id);
                    if (!m) return null;
                    return (
                      <Badge key={id} variant="secondary" className="text-xs gap-1">
                        {m.brandName} {m.name}
                        <button
                          className="ml-0.5 opacity-60 hover:opacity-100"
                          onClick={() => toggleModelSelection(id)}
                        >×</button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Enable this discount on the website</p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, isActive: v }))}
              />
            </div>

            {formData.isActive && formData.pickupLocationIds.length > 0 && formData.vehicleModelIds.length > 0 && (
              <div className="text-xs text-amber-500/80 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
                If another active discount already covers any of the same pickup locations, overlapping dates, and any of the same vehicle models, saving will fail with a conflict error.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : editingDiscount ? "Save Changes" : "Create Discount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
