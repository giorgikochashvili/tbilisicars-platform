import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminRates,
  useGetAdminRate,
  useCreateAdminRate,
  useUpdateAdminRate,
  useDeleteAdminRate,
  useCreateAdminRateTier,
  useUpdateAdminRateTier,
  useDeleteAdminRateTier,
  useListFleetModels,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  BadgeDollarSign,
  ChevronDown,
  ChevronRight,
  ListPlus,
  Network,
  GitBranch,
  Layers,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBookingAmount } from "@/lib/utils";

interface FleetModel {
  id: number;
  name: string;
  brand?: { name: string } | null;
}

interface RateDayRange {
  id: number;
  rateId: number;
  fromDays: number;
  toDays?: number | null;
  label?: string | null;
}

interface DraftDayRange {
  key: string;
  fromDays: number;
  toDays: number | null;
  label: string;
}

const DEFAULT_DAY_RANGES: DraftDayRange[] = [
  { key: "d0", fromDays: 1, toDays: 3, label: "1–3 days" },
  { key: "d1", fromDays: 4, toDays: 7, label: "4–7 days" },
  { key: "d2", fromDays: 8, toDays: 13, label: "8–13 days" },
  { key: "d3", fromDays: 14, toDays: null, label: "14+ days" },
];

interface RateTierItem {
  id: number;
  rateId: number;
  vehicleModelId: number;
  fromDays?: number | null;
  toDays?: number | null;
  pricePerDay: string;
  currency?: string | null;
}

interface RateItem {
  id: number;
  name: string;
  description?: string | null;
  parentRateId?: number | null;
  rateType?: string | null;
  validFrom: string;
  validUntil: string;
  minDays?: number | null;
  maxDays?: number | null;
  isActive?: boolean | null;
  tiers?: RateTierItem[];
  dayRanges?: RateDayRange[];
}

interface CopiedTierRow {
  vehicleModelId: number;
  fromDays: number;
  toDays: number;
  pricePerDay: string;
}

interface RateFormData {
  name: string;
  description: string;
  validFrom: string;
  validUntil: string;
  minDays: number;
  maxDays: number;
  isActive: boolean;
}


function formatRangeLabel(r: RateDayRange | DraftDayRange): string {
  if (r.label) return r.label;
  if (!r.toDays) return `${r.fromDays}+ d`;
  return `${r.fromDays}–${r.toDays} d`;
}

function getRangeKey(r: RateDayRange | DraftDayRange): string {
  return `${r.fromDays}-${r.toDays ?? "inf"}`;
}


function ModelPricingGrid({
  rateId,
  tiers,
  dayRanges,
}: {
  rateId: number;
  tiers: RateTierItem[];
  dayRanges: RateDayRange[];
}) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [newModelPrices, setNewModelPrices] = useState<Record<string, string>>({});
  // Track in-progress edits separately from stored values
  const [dirtyValues, setDirtyValues] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reqOpts = { request: { credentials: "include" as const } };

  const { data: rawModels } = useListFleetModels(reqOpts);
  const models = (rawModels ?? []) as FleetModel[];

  const createTierMutation = useCreateAdminRateTier(reqOpts);
  const updateTierMutation = useUpdateAdminRateTier(reqOpts);
  const deleteTierMutation = useDeleteAdminRateTier(reqOpts);

  const modelIds = [...new Set(tiers.map((t) => t.vehicleModelId))];

  const getTierForModelAndRange = (modelId: number, range: RateDayRange) =>
    tiers.find(
      (t) =>
        t.vehicleModelId === modelId &&
        (t.fromDays ?? 1) === range.fromDays &&
        (t.toDays ?? null) === (range.toDays ?? null),
    );

  // Derive display value: dirty (in-progress) override, else stored tier value
  const getCellValue = (modelId: number, range: RateDayRange): string => {
    const key = `${modelId}-${getRangeKey(range)}`;
    if (key in dirtyValues) return dirtyValues[key];
    const tier = getTierForModelAndRange(modelId, range);
    return tier?.pricePerDay?.toString() ?? "";
  };

  const handleCellChange = (modelId: number, range: RateDayRange, value: string) => {
    const key = `${modelId}-${getRangeKey(range)}`;
    setDirtyValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleCellBlur = async (modelId: number, range: RateDayRange, value: string) => {
    const key = `${modelId}-${getRangeKey(range)}`;
    const existingTier = getTierForModelAndRange(modelId, range);
    const storedValue = existingTier?.pricePerDay?.toString() ?? "";

    // Remove from dirty state regardless
    setDirtyValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    if (value === storedValue || value === "") return;

    const pricePerDay = String(parseFloat(value) || 0);
    try {
      if (existingTier) {
        await new Promise<void>((resolve, reject) => {
          updateTierMutation.mutate(
            { id: rateId, tierId: existingTier.id, data: { pricePerDay } },
            { onSuccess: () => resolve(), onError: reject },
          );
        });
      } else {
        await new Promise<void>((resolve, reject) => {
          createTierMutation.mutate(
            {
              id: rateId,
              data: {
                vehicleModelId: modelId,
                fromDays: range.fromDays,
                toDays: range.toDays ?? undefined,
                pricePerDay,
                currency: "EUR",
              },
            },
            { onSuccess: () => resolve(), onError: reject },
          );
        });
      }
      queryClient.invalidateQueries();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save price";
      toast({ title: "Error", description: msg, variant: "destructive" });
      // Revert to stored value on error
      setDirtyValues((prev) => ({ ...prev, [key]: storedValue }));
    }
  };

  const handleRemoveModel = (modelId: number) => {
    const modelTiers = tiers.filter((t) => t.vehicleModelId === modelId);
    if (!confirm(`Remove all ${modelTiers.length} pricing tier(s) for this model?`)) return;

    let failCount = 0;
    const promises = modelTiers.map((tier) =>
      new Promise<void>((resolve, reject) => {
        deleteTierMutation.mutate(
          { id: rateId, tierId: tier.id },
          { onSuccess: () => resolve(), onError: reject },
        );
      }).catch(() => {
        failCount++;
      }),
    );

    Promise.all(promises).then(() => {
      queryClient.invalidateQueries();
      if (failCount > 0) {
        toast({
          title: "Partial success",
          description: `${failCount} tier(s) failed to delete`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Success", description: "Model removed" });
      }
    });
  };

  const handleAddModel = async () => {
    if (!selectedModelId) {
      toast({ title: "Error", description: "Select a vehicle model", variant: "destructive" });
      return;
    }
    const modelId = parseInt(selectedModelId);
    let failCount = 0;

    for (const range of dayRanges) {
      const key = getRangeKey(range);
      const priceRaw = newModelPrices[key];
      // Default blank prices to 0 so all ranges receive a tier
      const pricePerDay = priceRaw !== undefined && priceRaw !== ""
        ? String(parseFloat(priceRaw) || 0)
        : "0";
      try {
        await new Promise<void>((resolve, reject) => {
          createTierMutation.mutate(
            {
              id: rateId,
              data: {
                vehicleModelId: modelId,
                fromDays: range.fromDays,
                toDays: range.toDays ?? undefined,
                pricePerDay,
                currency: "EUR",
              },
            },
            { onSuccess: () => resolve(), onError: reject },
          );
        });
      } catch {
        failCount++;
      }
    }

    queryClient.invalidateQueries();
    if (failCount > 0) {
      toast({
        title: "Partial success",
        description: `${failCount} day range(s) failed to save`,
        variant: "destructive",
      });
    } else {
      toast({ title: "Success", description: "Model added" });
    }
    setIsAddModalOpen(false);
    setSelectedModelId("");
    setNewModelPrices({});
  };

  const usedModelIds = new Set(modelIds);
  const availableModels = models.filter((m) => !usedModelIds.has(m.id));

  return (
    <div className="p-4 bg-muted/10 border-t border-border/40">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-semibold font-display">Model Pricing Grid</h4>
        <Button size="sm" variant="outline" onClick={() => { setSelectedModelId(""); setNewModelPrices({}); setIsAddModalOpen(true); }} className="h-8">
          <ListPlus className="w-3 h-3 mr-2" /> Add Model
        </Button>
      </div>

      {dayRanges.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md border-border/50">
          No day ranges configured. Edit this rate to add day ranges first.
        </div>
      ) : modelIds.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md border-border/50">
          No models added. Click "Add Model" to set pricing.
        </div>
      ) : (
        <div className="rounded-md border border-border/50 overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent text-xs">
                <TableHead>Model</TableHead>
                {dayRanges.map((r) => (
                  <TableHead key={r.id} className="text-center min-w-[96px]">
                    {formatRangeLabel(r)}
                  </TableHead>
                ))}
                <TableHead className="text-right w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelIds.map((modelId) => {
                const model = models.find((m) => m.id === modelId);
                return (
                  <TableRow key={modelId} className="border-border/20 hover:bg-muted/20 text-sm">
                    <TableCell className="font-medium text-xs">
                      {model
                        ? `${model.brand?.name ?? ""} ${model.name}`.trim()
                        : `Model #${modelId}`}
                    </TableCell>
                    {dayRanges.map((range) => (
                      <TableCell key={range.id} className="py-1 px-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-7 w-24 text-xs font-mono text-center"
                          placeholder="—"
                          value={getCellValue(modelId, range)}
                          onChange={(e) => handleCellChange(modelId, range, e.target.value)}
                          onBlur={(e) => handleCellBlur(modelId, range, e.target.value)}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right py-1 px-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveModel(modelId)}
                        className="h-6 w-6"
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Model modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[440px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Model</DialogTitle>
            <DialogDescription>
              Pick a model and enter initial prices for each day range. You can edit prices inline in the grid afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Vehicle Model</Label>
              <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model…" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.brand?.name} {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dayRanges.map((range) => {
              const key = getRangeKey(range);
              return (
                <div key={range.id} className="grid gap-2">
                  <Label>{formatRangeLabel(range)} — Price / Day (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newModelPrices[key] ?? ""}
                    onChange={(e) =>
                      setNewModelPrices((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddModel}>Add Model</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function RateTiers({ rateId, tiers }: { rateId: number; tiers: RateTierItem[] }) {
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<RateTierItem | null>(null);
  const [tierData, setTierData] = useState({
    vehicleModelId: "",
    fromDays: 1,
    toDays: 0,
    pricePerDay: 0,
    currency: "EUR",
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const reqOpts = { request: { credentials: "include" as const } };

  const { data: rawModels } = useListFleetModels(reqOpts);
  const models = (rawModels ?? []) as FleetModel[];

  const createTierMutation = useCreateAdminRateTier(reqOpts);
  const updateTierMutation = useUpdateAdminRateTier(reqOpts);
  const deleteTierMutation = useDeleteAdminRateTier(reqOpts);

  const handleOpenTierModal = (tier: RateTierItem | null = null) => {
    if (tier) {
      setEditingTier(tier);
      setTierData({
        vehicleModelId: tier.vehicleModelId?.toString() ?? "",
        fromDays: tier.fromDays ?? 1,
        toDays: tier.toDays ?? 0,
        pricePerDay: Number(tier.pricePerDay) || 0,
        currency: tier.currency ?? "EUR",
      });
    } else {
      setEditingTier(null);
      setTierData({ vehicleModelId: "", fromDays: 1, toDays: 0, pricePerDay: 0, currency: "EUR" });
    }
    setIsTierModalOpen(true);
  };

  const handleSaveTier = () => {
    if (!tierData.vehicleModelId) {
      toast({ title: "Error", description: "Vehicle model is required", variant: "destructive" });
      return;
    }

    const payload = {
      vehicleModelId: parseInt(tierData.vehicleModelId),
      fromDays: tierData.fromDays,
      toDays: tierData.toDays,
      pricePerDay: String(tierData.pricePerDay),
      currency: "EUR",
    };

    if (editingTier) {
      updateTierMutation.mutate(
        { id: rateId, tierId: editingTier.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Tier updated" });
            queryClient.invalidateQueries();
            setIsTierModalOpen(false);
          },
          onError: (err: Error) => {
            toast({
              title: "Error",
              description: err.message || "Failed to update tier",
              variant: "destructive",
            });
          },
        },
      );
    } else {
      createTierMutation.mutate(
        { id: rateId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Tier created" });
            queryClient.invalidateQueries();
            setIsTierModalOpen(false);
          },
          onError: (err: Error) => {
            toast({
              title: "Error",
              description: err.message || "Failed to create tier",
              variant: "destructive",
            });
          },
        },
      );
    }
  };

  const handleDeleteTier = (tierId: number) => {
    if (confirm("Are you sure you want to delete this tier?")) {
      deleteTierMutation.mutate(
        { id: rateId, tierId },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Tier deleted" });
            queryClient.invalidateQueries();
          },
          onError: (err: Error) => {
            toast({
              title: "Error",
              description: err.message || "Failed to delete tier",
              variant: "destructive",
            });
          },
        },
      );
    }
  };

  return (
    <div className="p-4 bg-muted/10 border-t border-border/40">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-semibold font-display">Pricing Tiers</h4>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleOpenTierModal()}
          className="h-8"
        >
          <ListPlus className="w-3 h-3 mr-2" /> Add Tier
        </Button>
      </div>

      {tiers && tiers.length > 0 ? (
        <div className="rounded-md border border-border/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent text-xs">
                <TableHead>Vehicle Model</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Price / Day</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((tier) => (
                <TableRow
                  key={tier.id}
                  className="border-border/20 hover:bg-muted/30 transition-colors text-sm"
                >
                  <TableCell className="font-medium">
                    {models.find((m) => m.id === tier.vehicleModelId)?.name ||
                      `Model #${tier.vehicleModelId}`}
                  </TableCell>
                  <TableCell>
                    {tier.toDays
                      ? `${tier.fromDays} - ${tier.toDays} days`
                      : `${tier.fromDays}+ days`}
                  </TableCell>
                  <TableCell className="font-mono">
                    {formatBookingAmount(tier.pricePerDay, "EUR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenTierModal(tier)}
                      className="h-6 w-6"
                    >
                      <Edit className="w-3 h-3 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteTier(tier.id)}
                      className="h-6 w-6"
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md border-border/50">
          No tiers configured for this rate.
        </div>
      )}

      <Dialog open={isTierModalOpen} onOpenChange={setIsTierModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingTier ? "Edit Tier" : "Add Tier"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Vehicle Model</Label>
              <Select
                value={tierData.vehicleModelId}
                onValueChange={(val) => setTierData({ ...tierData, vehicleModelId: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.brand?.name} {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>From Days</Label>
                <Input
                  type="number"
                  min="1"
                  value={tierData.fromDays}
                  onChange={(e) =>
                    setTierData({ ...tierData, fromDays: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>To Days (0 = unlimited)</Label>
                <Input
                  type="number"
                  min="0"
                  value={tierData.toDays}
                  onChange={(e) =>
                    setTierData({ ...tierData, toDays: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Price per day (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={tierData.pricePerDay}
                  onChange={(e) =>
                    setTierData({ ...tierData, pricePerDay: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                  EUR (€) — fixed
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTierModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveTier}
              disabled={createTierMutation.isPending || updateTierMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


function ChildTierGrid({
  tiers,
  models,
  onChange,
}: {
  tiers: CopiedTierRow[];
  models: FleetModel[];
  onChange: (tiers: CopiedTierRow[]) => void;
}) {
  const update = (idx: number, patch: Partial<CopiedTierRow>) => {
    onChange(tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  if (tiers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md border-border/50">
        Parent has no tiers — you can add them after saving.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-border/50 overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/30">
          <TableRow className="border-border/40 hover:bg-transparent text-xs">
            <TableHead>Vehicle Model</TableHead>
            <TableHead>From Days</TableHead>
            <TableHead>To Days</TableHead>
            <TableHead>Price / Day (€)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tiers.map((tier, idx) => (
            <TableRow key={idx} className="border-border/20 text-sm">
              <TableCell className="font-medium text-xs">
                {models.find((m) => m.id === tier.vehicleModelId)?.name ||
                  `Model #${tier.vehicleModelId}`}
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  className="h-7 w-20 text-xs"
                  value={tier.fromDays}
                  onChange={(e) => update(idx, { fromDays: parseInt(e.target.value) || 1 })}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  className="h-7 w-20 text-xs"
                  value={tier.toDays}
                  onChange={(e) => update(idx, { toDays: parseInt(e.target.value) || 0 })}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="0.01"
                  className="h-7 w-24 text-xs"
                  value={tier.pricePerDay}
                  onChange={(e) => update(idx, { pricePerDay: e.target.value })}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}


function ParentRateForm({
  formData,
  onChange,
}: {
  formData: RateFormData;
  onChange: (data: RateFormData) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Name</Label>
        <Input
          value={formData.name}
          onChange={(e) => onChange({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Description</Label>
        <Input
          value={formData.description}
          onChange={(e) => onChange({ ...formData, description: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Valid From</Label>
          <Input
            type="date"
            value={formData.validFrom}
            onChange={(e) => onChange({ ...formData, validFrom: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Valid Until</Label>
          <Input
            type="date"
            value={formData.validUntil}
            onChange={(e) => onChange({ ...formData, validUntil: e.target.value })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Minimum Days</Label>
          <Input
            type="number"
            min="1"
            value={formData.minDays}
            onChange={(e) => onChange({ ...formData, minDays: parseInt(e.target.value) || 1 })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Maximum Days (0 = unlimited)</Label>
          <Input
            type="number"
            min="0"
            value={formData.maxDays}
            onChange={(e) => onChange({ ...formData, maxDays: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>
      <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/30">
        <div>
          <Label className="text-base">Active Status</Label>
          <p className="text-sm text-muted-foreground">Is this rate currently applicable?</p>
        </div>
        <Switch
          checked={formData.isActive}
          onCheckedChange={(val) => onChange({ ...formData, isActive: val })}
        />
      </div>
    </div>
  );
}


function ChildRateLoader({
  parentId,
  onParentLoaded,
}: {
  parentId: number;
  onParentLoaded: (
    tiers: CopiedTierRow[],
    validFrom: string,
    validUntil: string,
    minDays: number,
    maxDays: number,
    dayRanges: RateDayRange[],
  ) => void;
}) {
  const reqOpts = { request: { credentials: "include" as const } };
  const { data: parentDetail } = useGetAdminRate(parentId, reqOpts);

  React.useEffect(() => {
    if (!parentDetail) return;
    const pd = parentDetail as RateItem & { tiers: RateTierItem[] };
    const copied: CopiedTierRow[] = (pd.tiers ?? []).map((t) => ({
      vehicleModelId: t.vehicleModelId,
      fromDays: t.fromDays ?? 1,
      toDays: t.toDays ?? 0,
      pricePerDay: t.pricePerDay?.toString() ?? "0",
    }));
    onParentLoaded(
      copied,
      pd.validFrom ? new Date(pd.validFrom).toISOString().split("T")[0] : "",
      pd.validUntil ? new Date(pd.validUntil).toISOString().split("T")[0] : "",
      pd.minDays ?? 1,
      pd.maxDays ?? 0,
      pd.dayRanges ?? [],
    );
  }, [parentDetail]);

  return null;
}


type ActiveTab = "web" | "broker";

const BLANK_FORM: RateFormData = {
  name: "",
  description: "",
  validFrom: "",
  validUntil: "",
  minDays: 1,
  maxDays: 0,
  isActive: true,
};

export default function RatesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("web");

  const [isChooserOpen, setIsChooserOpen] = useState(false);

  const [isParentModalOpen, setIsParentModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<RateItem | null>(null);
  const [parentFormData, setParentFormData] = useState<RateFormData>(BLANK_FORM);
  const [parentDayRanges, setParentDayRanges] = useState<DraftDayRange[]>(DEFAULT_DAY_RANGES);
  const [isSavingParent, setIsSavingParent] = useState(false);

  const [isChildModalOpen, setIsChildModalOpen] = useState(false);
  const [childParentId, setChildParentId] = useState<string>("");
  const [childFormData, setChildFormData] = useState<RateFormData>(BLANK_FORM);
  const [childTiers, setChildTiers] = useState<CopiedTierRow[]>([]);
  const [childDayRanges, setChildDayRanges] = useState<RateDayRange[]>([]);
  const [isSavingChild, setIsSavingChild] = useState(false);

  const [expandedRateId, setExpandedRateId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const reqOpts = { request: { credentials: "include" as const } };
  const { data: rawRates, isLoading } = useListAdminRates(reqOpts);
  const rates = (rawRates ?? []) as RateItem[];

  const { data: rawModels } = useListFleetModels(reqOpts);
  const models = (rawModels ?? []) as FleetModel[];

  const createMutation = useCreateAdminRate(reqOpts);
  const updateMutation = useUpdateAdminRate(reqOpts);
  const deleteMutation = useDeleteAdminRate(reqOpts);
  const createTierMutation = useCreateAdminRateTier(reqOpts);

  const webRates = rates.filter((r) => r.rateType === "web" || r.rateType == null);
  const brokerRates = rates.filter((r) => r.rateType != null && r.rateType !== "web");
  const webParentRates = webRates.filter((r) => r.parentRateId == null);
  const rateMap = new Map(rates.map((r) => [r.id, r]));

  const parentIdNum = childParentId ? parseInt(childParentId, 10) : 0;


  const handleEditRate = (rate: RateItem) => {
    setEditingRate(rate);
    setParentFormData({
      name: rate.name || "",
      description: rate.description || "",
      validFrom: rate.validFrom ? new Date(rate.validFrom).toISOString().split("T")[0] : "",
      validUntil: rate.validUntil ? new Date(rate.validUntil).toISOString().split("T")[0] : "",
      minDays: rate.minDays ?? 1,
      maxDays: rate.maxDays ?? 0,
      isActive: rate.isActive ?? true,
    });

    const isWebParent =
      (rate.rateType === "web" || rate.rateType == null) && rate.parentRateId == null;
    if (isWebParent) {
      const existing = rate.dayRanges ?? [];
      if (existing.length > 0) {
        setParentDayRanges(
          existing.map((r, i) => ({
            key: String(r.id ?? i),
            fromDays: r.fromDays,
            toDays: r.toDays ?? null,
            label: r.label ?? "",
          })),
        );
      } else {
        setParentDayRanges(DEFAULT_DAY_RANGES.map((r) => ({ ...r })));
      }
    } else {
      setParentDayRanges([]);
    }

    setIsParentModalOpen(true);
  };


  const handleChooseParent = () => {
    setIsChooserOpen(false);
    setEditingRate(null);
    setParentFormData(BLANK_FORM);
    setParentDayRanges(DEFAULT_DAY_RANGES.map((r) => ({ ...r })));
    setIsParentModalOpen(true);
  };


  const handleChooseChild = () => {
    setIsChooserOpen(false);
    setChildParentId("");
    setChildFormData(BLANK_FORM);
    setChildTiers([]);
    setChildDayRanges([]);
    setIsChildModalOpen(true);
  };


  const handleSaveParent = async () => {
    if (!parentFormData.name) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    const payload = {
      ...parentFormData,
      rateType: editingRate ? (editingRate.rateType ?? "web") : "web",
      validFrom: parentFormData.validFrom || undefined,
      validUntil: parentFormData.validUntil || undefined,
    };

    setIsSavingParent(true);
    try {
      let savedId: number;

      if (editingRate) {
        const updated: RateItem = await new Promise((resolve, reject) => {
          updateMutation.mutate(
            { id: editingRate.id, data: payload },
            {
              onSuccess: (data: unknown) => resolve(data as RateItem),
              onError: reject,
            },
          );
        });
        savedId = updated.id;
      } else {
        const created: RateItem = await new Promise((resolve, reject) => {
          createMutation.mutate(
            { data: payload },
            {
              onSuccess: (data: unknown) => resolve(data as RateItem),
              onError: reject,
            },
          );
        });
        savedId = created.id;
      }

      const isWebParent =
        (payload.rateType === "web" || payload.rateType == null) &&
        !(editingRate?.parentRateId);
      if (isWebParent) {
        const resp = await fetch(`/api/admin/rates/${savedId}/day-ranges`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ranges: parentDayRanges.map((r) => ({
              fromDays: r.fromDays,
              toDays: r.toDays,
              label: r.label || null,
            })),
          }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Failed to save day ranges");
        }
      }

      queryClient.invalidateQueries();
      toast({
        title: "Success",
        description: editingRate ? "Rate updated" : "Rate created",
      });
      setIsParentModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save rate";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsSavingParent(false);
    }
  };


  const handleSaveChild = async () => {
    if (!childParentId) {
      toast({ title: "Error", description: "Please select a parent rate", variant: "destructive" });
      return;
    }
    if (!childFormData.name) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    setIsSavingChild(true);
    try {
      const childPayload = {
        ...childFormData,
        rateType: "web",
        parentRateId: parseInt(childParentId, 10),
        validFrom: childFormData.validFrom || undefined,
        validUntil: childFormData.validUntil || undefined,
      };

      const newRate: RateItem = await new Promise((resolve, reject) => {
        createMutation.mutate(
          { data: childPayload },
          { onSuccess: (data: unknown) => resolve(data as RateItem), onError: reject },
        );
      });

      let tierFailCount = 0;
      if (newRate?.id && childTiers.length > 0) {
        for (const tier of childTiers) {
          try {
            await new Promise<void>((resolve, reject) => {
              createTierMutation.mutate(
                {
                  id: newRate.id,
                  data: {
                    vehicleModelId: tier.vehicleModelId,
                    fromDays: tier.fromDays,
                    toDays: tier.toDays,
                    pricePerDay: tier.pricePerDay,
                    currency: "EUR",
                  },
                },
                { onSuccess: () => resolve(), onError: reject },
              );
            });
          } catch {
            tierFailCount += 1;
          }
        }
      }

      if (newRate?.id && childDayRanges.length > 0) {
        const drResp = await fetch(`/api/admin/rates/${newRate.id}/day-ranges`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ranges: childDayRanges.map((r) => ({
              fromDays: r.fromDays,
              toDays: r.toDays ?? null,
              label: r.label ?? null,
            })),
          }),
        });
        if (!drResp.ok) {
          const err = await drResp.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Failed to clone day ranges");
        }
      }

      queryClient.invalidateQueries();
      if (tierFailCount > 0) {
        toast({
          title: "Partial success",
          description: `Child rate created, but ${tierFailCount} of ${childTiers.length} tier(s) failed to copy. Open the rate to review and add missing tiers manually.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Success", description: "Child rate created with tiers" });
      }
      setIsChildModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create child rate";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setIsSavingChild(false);
    }
  };


  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this rate plan?")) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Rate deleted" });
            queryClient.invalidateQueries();
          },
          onError: (err: Error) => {
            toast({ title: "Error", description: err.message || "Failed to delete", variant: "destructive" });
          },
        },
      );
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedRateId(expandedRateId === id ? null : id);
  };


  const renderExpandedContent = (rate: RateItem) => {
    const hasDayRanges = (rate.dayRanges?.length ?? 0) > 0;

    if (hasDayRanges) {
      return (
        <ModelPricingGrid
          rateId={rate.id}
          tiers={rate.tiers ?? []}
          dayRanges={rate.dayRanges ?? []}
        />
      );
    }

    return <RateTiers rateId={rate.id} tiers={rate.tiers ?? []} />;
  };


  const renderRateRow = (rate: RateItem) => {
    const isChild = rate.parentRateId != null;
    const parent = isChild ? rateMap.get(rate.parentRateId!) : undefined;

    return (
      <React.Fragment key={rate.id}>
        <TableRow
          className="border-border/20 hover:bg-muted/30 transition-colors cursor-pointer"
          onClick={() => toggleExpand(rate.id)}
        >
          <TableCell>
            {expandedRateId === rate.id ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </TableCell>
          <TableCell>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">{rate.name}</span>
                {isChild ? (
                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-violet-500/15 text-violet-600 border-violet-300/30 dark:text-violet-400">
                    Child
                  </Badge>
                ) : (
                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-500/15 text-blue-600 border-blue-300/30 dark:text-blue-400">
                    Parent
                  </Badge>
                )}
              </div>
              {isChild && parent && (
                <span className="text-[11px] text-muted-foreground">
                  seasonal override of{" "}
                  <span className="font-medium text-foreground/70">{parent.name}</span>
                </span>
              )}
              {rate.description && (
                <div className="text-xs text-muted-foreground truncate max-w-xs">
                  {rate.description}
                </div>
              )}
            </div>
          </TableCell>
          <TableCell className="text-sm">
            {rate.minDays} - {rate.maxDays ? rate.maxDays : "Unlimited"} days
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">
            {rate.validFrom ? new Date(rate.validFrom).toLocaleDateString() : "Always"}
            {" → "}
            {rate.validUntil ? new Date(rate.validUntil).toLocaleDateString() : "Always"}
          </TableCell>
          <TableCell>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {rate.tiers?.length ?? 0}
            </Badge>
          </TableCell>
          <TableCell onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={rate.isActive ?? false}
              className="data-[state=checked]:bg-emerald-500"
              onCheckedChange={(val) => {
                updateMutation.mutate(
                  { id: rate.id, data: { isActive: val } },
                  {
                    onSuccess: () =>
                      toast({ title: val ? "Rate activated" : "Rate deactivated" }),
                    onError: () =>
                      toast({ title: "Error", description: "Failed to update rate status", variant: "destructive" }),
                  },
                );
              }}
            />
          </TableCell>
          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEditRate(rate)}>
                  <Edit className="w-4 h-4 mr-2" /> Edit Plan
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDelete(rate.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete Plan
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
        {expandedRateId === rate.id && (
          <TableRow className="bg-muted/5 hover:bg-muted/5 border-border/20">
            <TableCell colSpan={7} className="p-0">
              {renderExpandedContent(rate)}
            </TableCell>
          </TableRow>
        )}
      </React.Fragment>
    );
  };


  const isWebParentModal =
    !editingRate ||
    ((editingRate.rateType === "web" || editingRate.rateType == null) &&
      editingRate.parentRateId == null);

  const displayedRates = activeTab === "web" ? webRates : brokerRates;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold font-display tracking-tight flex items-center gap-2">
            <BadgeDollarSign className="w-6 h-6 text-primary" /> Rate Plans
          </h2>
          <p className="text-muted-foreground">Manage dynamic pricing and seasonal rates</p>
        </div>
        {activeTab === "web" && (
          <Button onClick={() => setIsChooserOpen(true)} className="shadow-sm hover-elevate">
            <Plus className="w-4 h-4 mr-2" /> Add Rate Plan
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border/50">
        <button
          onClick={() => setActiveTab("web")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "web"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5" />
            WEB
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-1">
              {webRates.length}
            </Badge>
          </span>
        </button>
        <button
          onClick={() => setActiveTab("broker")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === "broker"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <BadgeDollarSign className="w-3.5 h-3.5" />
            BROKER
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-1">
              {brokerRates.length}
            </Badge>
          </span>
        </button>
      </div>

      {activeTab === "broker" && (
        <div className="rounded-lg border border-amber-300/40 bg-amber-50/10 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Broker rate management is available here for viewing. Structured broker pricing is planned for a future release.
        </div>
      )}

      <Card className="border-border/40 bg-card/60 backdrop-blur-md shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="w-10"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Duration Constraints</TableHead>
                <TableHead>Validity Period</TableHead>
                <TableHead>Tiers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-8 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="h-8 w-8 ml-auto rounded-md" />
                    </TableCell>
                  </TableRow>
                ))
              ) : displayedRates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <BadgeDollarSign className="w-8 h-8 opacity-20 mx-auto mb-2" />
                    {activeTab === "web" ? "No WEB rates found" : "No broker rates found"}
                  </TableCell>
                </TableRow>
              ) : (
                displayedRates.map((rate) => renderRateRow(rate))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Chooser modal ────────────────────────────────────────────────────── */}
      <Dialog open={isChooserOpen} onOpenChange={setIsChooserOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Add Rate Plan</DialogTitle>
            <DialogDescription>
              Choose whether to create a standalone parent rate or a seasonal override. Prices are copied from the parent at creation — future changes to the parent do not automatically update the override.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <button
              onClick={handleChooseParent}
              className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-border/50 hover:border-primary/60 hover:bg-primary/5 transition-all text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <Layers className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground">Parent Rate</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Base pricing for a date range. Used directly unless a child overrides it.
                </div>
              </div>
            </button>
            <button
              onClick={handleChooseChild}
              className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-border/50 hover:border-primary/60 hover:bg-primary/5 transition-all text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground">Child Rate</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Seasonal override with adjusted prices copied from a parent.
                </div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Parent rate modal ────────────────────────────────────────────────── */}
      <Dialog open={isParentModalOpen} onOpenChange={setIsParentModalOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingRate
                ? editingRate.parentRateId != null
                  ? "Edit Child Rate"
                  : "Edit Rate Plan"
                : "Add Parent Rate Plan"}
            </DialogTitle>
            <DialogDescription>
              {editingRate
                ? "Update the rate plan details."
                : "Create a base WEB rate plan. Seasonal overrides can be added as child rates."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <ParentRateForm formData={parentFormData} onChange={setParentFormData} />

            {isWebParentModal && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">Day Ranges</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Define pricing columns for the model grid. Leave "To" empty for unlimited.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setParentDayRanges((prev) => [
                        ...prev,
                        { key: String(Date.now()), fromDays: 1, toDays: null, label: "" },
                      ])
                    }
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Range
                  </Button>
                </div>

                {parentDayRanges.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3 border border-dashed rounded-md border-border/50">
                    No day ranges. Click "Add Range" to create pricing columns.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {parentDayRanges.map((range, idx) => (
                      <div key={range.key} className="flex items-center gap-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Label (e.g. 1–3 days)"
                          value={range.label}
                          onChange={(e) =>
                            setParentDayRanges((prev) =>
                              prev.map((r, i) =>
                                i === idx ? { ...r, label: e.target.value } : r,
                              ),
                            )
                          }
                        />
                        <Input
                          type="number"
                          className="h-8 text-xs w-20 flex-shrink-0"
                          placeholder="From"
                          min={1}
                          value={range.fromDays}
                          onChange={(e) =>
                            setParentDayRanges((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, fromDays: parseInt(e.target.value) || 1 }
                                  : r,
                              ),
                            )
                          }
                        />
                        <span className="text-muted-foreground text-xs flex-shrink-0">–</span>
                        <Input
                          type="number"
                          className="h-8 text-xs w-20 flex-shrink-0"
                          placeholder="To (∞)"
                          min={0}
                          value={range.toDays ?? ""}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setParentDayRanges((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, toDays: isNaN(val) || val === 0 ? null : val }
                                  : r,
                              ),
                            );
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={() =>
                            setParentDayRanges((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsParentModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveParent} disabled={isSavingParent}>
              {isSavingParent ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Child rate modal ─────────────────────────────────────────────────── */}
      <Dialog
        open={isChildModalOpen}
        onOpenChange={(open) => {
          setIsChildModalOpen(open);
          if (!open) {
            setChildParentId("");
            setChildFormData(BLANK_FORM);
            setChildTiers([]);
            setChildDayRanges([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-violet-500" /> Add Child Rate
            </DialogTitle>
            <DialogDescription>
              A seasonal override. Prices are copied from the selected parent at creation time — future changes to the parent do not automatically update this rate. Adjust prices before saving.
            </DialogDescription>
          </DialogHeader>

          {parentIdNum > 0 && (
            <ChildRateLoader
              parentId={parentIdNum}
              onParentLoaded={(tiers, validFrom, validUntil, minDays, maxDays, dayRanges) => {
                setChildTiers(tiers);
                setChildDayRanges(dayRanges);
                setChildFormData((prev) => ({ ...prev, validFrom, validUntil, minDays, maxDays }));
              }}
            />
          )}

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>
                Parent Rate <span className="text-destructive">*</span>
              </Label>
              <Select value={childParentId} onValueChange={setChildParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a parent rate…" />
                </SelectTrigger>
                <SelectContent>
                  {webParentRates.map((r) => (
                    <SelectItem key={r.id} value={r.id.toString()}>
                      {r.name}{" "}
                      <span className="text-muted-foreground text-xs">
                        ({r.validFrom ? new Date(r.validFrom).toLocaleDateString() : "∞"} –{" "}
                        {r.validUntil ? new Date(r.validUntil).toLocaleDateString() : "∞"})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ParentRateForm formData={childFormData} onChange={setChildFormData} />

            {childTiers.length > 0 && (
              <div className="grid gap-2">
                <Label>Copied Tiers (adjust before saving)</Label>
                <ChildTierGrid
                  tiers={childTiers}
                  models={models}
                  onChange={setChildTiers}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsChildModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveChild} disabled={isSavingChild}>
              {isSavingChild ? "Saving…" : "Save Child Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
