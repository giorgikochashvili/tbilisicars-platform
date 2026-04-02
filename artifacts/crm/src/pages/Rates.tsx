import React, { useState } from "react";
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

// Minimal model type for the tier grid
interface FleetModel {
  id: number;
  name: string;
  brand?: { name: string } | null;
}

// ─── RateTiers sub-component (unchanged from original) ────────────────────────

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

// ─── Types ─────────────────────────────────────────────────────────────────────

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

// ─── ChildTierGrid ─────────────────────────────────────────────────────────────

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

// ─── ParentRateForm ────────────────────────────────────────────────────────────

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
        <Input value={formData.name} onChange={(e) => onChange({ ...formData, name: e.target.value })} />
      </div>
      <div className="grid gap-2">
        <Label>Description</Label>
        <Input value={formData.description} onChange={(e) => onChange({ ...formData, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Valid From</Label>
          <Input type="date" value={formData.validFrom} onChange={(e) => onChange({ ...formData, validFrom: e.target.value })} />
        </div>
        <div className="grid gap-2">
          <Label>Valid Until</Label>
          <Input type="date" value={formData.validUntil} onChange={(e) => onChange({ ...formData, validUntil: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Minimum Days</Label>
          <Input type="number" min="1" value={formData.minDays} onChange={(e) => onChange({ ...formData, minDays: parseInt(e.target.value) || 1 })} />
        </div>
        <div className="grid gap-2">
          <Label>Maximum Days (0 = unlimited)</Label>
          <Input type="number" min="0" value={formData.maxDays} onChange={(e) => onChange({ ...formData, maxDays: parseInt(e.target.value) || 0 })} />
        </div>
      </div>
      <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/30">
        <div>
          <Label className="text-base">Active Status</Label>
          <p className="text-sm text-muted-foreground">Is this rate currently applicable?</p>
        </div>
        <Switch checked={formData.isActive} onCheckedChange={(val) => onChange({ ...formData, isActive: val })} />
      </div>
    </div>
  );
}

// ─── ChildRateLoader — fetches parent tiers inside child modal ─────────────────

function ChildRateLoader({
  parentId,
  onParentLoaded,
}: {
  parentId: number;
  onParentLoaded: (tiers: CopiedTierRow[], validFrom: string, validUntil: string, minDays: number, maxDays: number) => void;
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
    );
  }, [parentDetail]);

  return null;
}

// ─── RatesPage ─────────────────────────────────────────────────────────────────

type ActiveTab = "web" | "broker";
type CreationMode = "parent" | "child";

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

  // Chooser dialog (Parent or Child)
  const [isChooserOpen, setIsChooserOpen] = useState(false);

  // Parent / edit rate modal
  const [isParentModalOpen, setIsParentModalOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<RateItem | null>(null);
  const [parentFormData, setParentFormData] = useState<RateFormData>(BLANK_FORM);

  // Child rate modal
  const [isChildModalOpen, setIsChildModalOpen] = useState(false);
  const [childParentId, setChildParentId] = useState<string>("");
  const [childFormData, setChildFormData] = useState<RateFormData>(BLANK_FORM);
  const [childTiers, setChildTiers] = useState<CopiedTierRow[]>([]);
  const [isSavingChild, setIsSavingChild] = useState(false);

  // Expand rows
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

  // Derived lists
  const webRates = rates.filter((r) => r.rateType === "web" || r.rateType == null);
  const brokerRates = rates.filter((r) => r.rateType != null && r.rateType !== "web");
  const webParentRates = webRates.filter((r) => r.parentRateId == null);
  const rateMap = new Map(rates.map((r) => [r.id, r]));

  const parentIdNum = childParentId ? parseInt(childParentId, 10) : 0;

  // ── Edit modal ───────────────────────────────────────────────────────────────

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
    setIsParentModalOpen(true);
  };

  // ── Chooser → Parent form ────────────────────────────────────────────────────

  const handleChooseParent = () => {
    setIsChooserOpen(false);
    setEditingRate(null);
    setParentFormData(BLANK_FORM);
    setIsParentModalOpen(true);
  };

  // ── Chooser → Child form ─────────────────────────────────────────────────────

  const handleChooseChild = () => {
    setIsChooserOpen(false);
    setChildParentId("");
    setChildFormData(BLANK_FORM);
    setChildTiers([]);
    setIsChildModalOpen(true);
  };

  // ── Save parent rate ─────────────────────────────────────────────────────────

  const handleSaveParent = () => {
    const payload = {
      ...parentFormData,
      rateType: "web",
      validFrom: parentFormData.validFrom || undefined,
      validUntil: parentFormData.validUntil || undefined,
    };

    if (editingRate) {
      updateMutation.mutate(
        { id: editingRate.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Success", description: "Rate updated" });
            queryClient.invalidateQueries();
            setIsParentModalOpen(false);
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
            toast({ title: "Success", description: "Rate created" });
            queryClient.invalidateQueries();
            setIsParentModalOpen(false);
          },
          onError: (err: Error) => {
            toast({ title: "Error", description: err.message || "Failed to create", variant: "destructive" });
          },
        },
      );
    }
  };

  // ── Save child rate ──────────────────────────────────────────────────────────

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

  // ── Delete ───────────────────────────────────────────────────────────────────

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

  // ── Rate row renderer ────────────────────────────────────────────────────────

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
                  inherits from <span className="font-medium text-foreground/70">{parent.name}</span>
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
          <TableCell>
            <Switch
              checked={rate.isActive ?? false}
              disabled
              className="data-[state=checked]:bg-emerald-500"
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
              <RateTiers rateId={rate.id} tiers={rate.tiers ?? []} />
            </TableCell>
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const displayedRates = activeTab === "web" ? webRates : brokerRates;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header */}
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

      {/* Tabs */}
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

      {/* BROKER notice */}
      {activeTab === "broker" && (
        <div className="rounded-lg border border-amber-300/40 bg-amber-50/10 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Broker rate management is available here for viewing. Structured broker pricing is planned for a future release.
        </div>
      )}

      {/* Table */}
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
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-8 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16 rounded-full" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto rounded-md" /></TableCell>
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
              Choose whether to create a standalone parent rate or a child override that inherits from an existing parent.
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editingRate ? "Edit Rate Plan" : "Add Parent Rate Plan"}
            </DialogTitle>
            <DialogDescription>
              {editingRate
                ? "Update the rate plan details."
                : "Create a base WEB rate plan. Seasonal overrides can be added as child rates."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ParentRateForm formData={parentFormData} onChange={setParentFormData} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsParentModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveParent}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Child rate modal ─────────────────────────────────────────────────── */}
      <Dialog open={isChildModalOpen} onOpenChange={setIsChildModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-violet-500" /> Add Child Rate
            </DialogTitle>
            <DialogDescription>
              A child rate inherits from a parent and starts with a copy of its tiers. Adjust prices before saving.
            </DialogDescription>
          </DialogHeader>

          {/* Load parent tiers when selected — rendered as invisible side-effect component */}
          {parentIdNum > 0 && (
            <ChildRateLoader
              parentId={parentIdNum}
              onParentLoaded={(tiers, validFrom, validUntil, minDays, maxDays) => {
                setChildTiers(tiers);
                setChildFormData((prev) => ({ ...prev, validFrom, validUntil, minDays, maxDays }));
              }}
            />
          )}

          <div className="grid gap-4 py-4">
            {/* Parent selector */}
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

            {/* Child details */}
            <div className="grid gap-2">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. Summer 2026 Override"
                value={childFormData.name}
                onChange={(e) => setChildFormData({ ...childFormData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Input
                value={childFormData.description}
                onChange={(e) => setChildFormData({ ...childFormData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valid From</Label>
                <Input
                  type="date"
                  value={childFormData.validFrom}
                  onChange={(e) => setChildFormData({ ...childFormData, validFrom: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Valid Until</Label>
                <Input
                  type="date"
                  value={childFormData.validUntil}
                  onChange={(e) => setChildFormData({ ...childFormData, validUntil: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Minimum Days</Label>
                <Input
                  type="number"
                  min="1"
                  value={childFormData.minDays}
                  onChange={(e) =>
                    setChildFormData({ ...childFormData, minDays: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Maximum Days (0 = unlimited)</Label>
                <Input
                  type="number"
                  min="0"
                  value={childFormData.maxDays}
                  onChange={(e) =>
                    setChildFormData({ ...childFormData, maxDays: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg bg-muted/30">
              <div>
                <Label className="text-base">Active Status</Label>
                <p className="text-sm text-muted-foreground">Is this rate currently applicable?</p>
              </div>
              <Switch
                checked={childFormData.isActive}
                onCheckedChange={(val) => setChildFormData({ ...childFormData, isActive: val })}
              />
            </div>

            {/* Tier grid */}
            {childParentId && (
              <div className="grid gap-2">
                <Label className="text-sm font-medium">
                  Pricing Tiers{" "}
                  <span className="text-muted-foreground font-normal">
                    (copied from parent — adjust as needed)
                  </span>
                </Label>
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
              {isSavingChild ? "Creating…" : "Create Child Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
