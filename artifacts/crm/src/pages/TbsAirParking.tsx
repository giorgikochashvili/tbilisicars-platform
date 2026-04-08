import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlaneTakeoff, ParkingCircle, Trash2, Plus, ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error ?? res.statusText);
  }
  return res.json();
}

// ─── Zone configuration ────────────────────────────────────────────────────────

const ZONES = [
  { name: "TERMINAL", capacity: 5, color: "text-blue-400", borderColor: "border-blue-500/30", bgColor: "bg-blue-500/10" },
  { name: "OUT", capacity: 10, color: "text-amber-400", borderColor: "border-amber-500/30", bgColor: "bg-amber-500/10" },
  { name: "FREE", capacity: null, color: "text-emerald-400", borderColor: "border-emerald-500/30", bgColor: "bg-emerald-500/10" },
] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ParkingEntry {
  id: number;
  vehicleId: number;
  zone: string;
  assignedAt: string;
  licensePlate: string | null;
  brandName: string | null;
  modelName: string | null;
}

interface ZoneData {
  capacity: number | null;
  assignments: ParkingEntry[];
}

interface ZoneMap {
  [zone: string]: ZoneData;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function TbsAirParking() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  // Modal state — sequential steps
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const { data: zones, isLoading } = useQuery<ZoneMap>({
    queryKey: ["parking-zones"],
    queryFn: () => apiFetch("/admin/parking"),
    refetchInterval: 30_000,
  });

  const { data: brands } = useQuery<any[]>({
    queryKey: ["fleet-brands"],
    queryFn: () => apiFetch("/admin/fleet/brands"),
    enabled: showModal,
  });

  const { data: allModels } = useQuery<any[]>({
    queryKey: ["fleet-models"],
    queryFn: () => apiFetch("/admin/fleet/models"),
    enabled: showModal,
  });

  const modelsForBrand = (allModels ?? []).filter(
    (m: any) => !selectedBrandId || String(m.brandId) === selectedBrandId,
  );

  const { data: vehicleResult, isLoading: vehiclesLoading } = useQuery<any>({
    queryKey: ["fleet-vehicles-tbilisi", selectedModelId],
    queryFn: () => apiFetch(`/admin/fleet/vehicles?modelId=${selectedModelId}&city=Tbilisi&limit=200`),
    enabled: showModal && !!selectedModelId,
  });

  const parkedVehicleIds = new Set<number>(
    Object.values(zones ?? {}).flatMap((z: any) =>
      (z.assignments ?? []).map((a: any) => a.vehicleId)
    )
  );

  const vehicleList: any[] = Array.isArray(vehicleResult)
    ? vehicleResult
    : (vehicleResult?.data ?? []);

  const availableVehicles = vehicleList.filter(
    (v: any) => v.status !== "INACTIVE" && !parkedVehicleIds.has(v.id)
  );

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const assignMutation = useMutation({
    mutationFn: () =>
      apiFetch("/admin/parking", {
        method: "POST",
        body: JSON.stringify({ vehicleId: Number(selectedVehicleId), zone: selectedZone }),
      }),
    onSuccess: () => {
      toast({ title: "Vehicle assigned to parking", description: `Zone: ${selectedZone}` });
      queryClient.invalidateQueries({ queryKey: ["parking-zones"] });
      handleCloseModal();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to assign", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/admin/parking/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Vehicle removed from parking" });
      queryClient.invalidateQueries({ queryKey: ["parking-zones"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove", description: err.message, variant: "destructive" });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, zone }: { id: number; zone: string }) =>
      apiFetch(`/admin/parking/${id}/zone`, {
        method: "PATCH",
        body: JSON.stringify({ zone }),
      }),
    onSuccess: (_data, { zone }) => {
      toast({ title: "Vehicle moved", description: `Moved to zone: ${zone}` });
      queryClient.invalidateQueries({ queryKey: ["parking-zones"] });
    },
    onError: (err: Error) => {
      toast({ title: "Move failed", description: err.message, variant: "destructive" });
    },
  });

  // ─── Modal helpers ──────────────────────────────────────────────────────────

  function handleOpenModal() {
    setSelectedZone("");
    setSelectedBrandId("");
    setSelectedModelId("");
    setSelectedVehicleId("");
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setSelectedZone("");
    setSelectedBrandId("");
    setSelectedModelId("");
    setSelectedVehicleId("");
  }

  const canSubmit = selectedZone && selectedVehicleId && !assignMutation.isPending;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20">
            <PlaneTakeoff className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">TBS AIR PARKING</h1>
            <p className="text-sm text-muted-foreground">Tbilisi Airport vehicle parking management</p>
          </div>
        </div>
        <Button onClick={handleOpenModal} className="gap-2">
          <Plus className="w-4 h-4" />
          Enter Car in Parking
        </Button>
      </div>

      {/* Zone cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {ZONES.map((zoneDef) => {
          const zoneData: ZoneData = zones?.[zoneDef.name] ?? { capacity: zoneDef.capacity, assignments: [] };
          const count = zoneData.assignments.length;
          const cap = zoneDef.capacity;
          const isFull = cap !== null && count === cap;
          const isOverflow = cap !== null && count > cap;

          return (
            <Card
              key={zoneDef.name}
              className={`border ${zoneDef.borderColor} bg-card/80 hover-elevate`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ParkingCircle className={`w-5 h-5 ${zoneDef.color}`} />
                    <CardTitle className={`text-base font-bold tracking-widest ${zoneDef.color}`}>
                      {zoneDef.name}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">
                      {cap !== null ? `${count} / ${cap}` : `${count} vehicles`}
                    </span>
                    {isOverflow && (
                      <Badge className="text-[10px] font-bold py-0.5 px-2 uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30">
                        OVER CAP
                      </Badge>
                    )}
                    {isFull && !isOverflow && (
                      <Badge variant="destructive" className="text-[10px] font-bold py-0.5 px-2 uppercase tracking-wider">
                        FULL
                      </Badge>
                    )}
                  </div>
                </div>
                {/* Capacity bar for capped zones */}
                {cap !== null && (
                  <div className="mt-2 h-1.5 rounded-full bg-border/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverflow
                          ? "bg-orange-500"
                          : isFull
                          ? "bg-red-500"
                          : zoneDef.color.replace("text-", "bg-")
                      }`}
                      style={{ width: `${Math.min((count / cap) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-0 space-y-1.5">
                {isLoading ? (
                  <>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </>
                ) : zoneData.assignments.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No vehicles parked
                  </div>
                ) : (
                  zoneData.assignments.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-background/50 border border-border/40 hover:border-border/70 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${zoneDef.color.replace("text-", "bg-")}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {entry.licensePlate ?? `#${entry.vehicleId}`}
                          </p>
                          {(entry.brandName || entry.modelName) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {[entry.brandName, entry.modelName].filter(Boolean).join(" ")}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Move to zone */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              disabled={moveMutation.isPending || removeMutation.isPending}
                              title="Move to another zone"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2" align="end">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                              Move to zone
                            </p>
                            <div className="flex flex-col gap-1">
                              {ZONES.filter((z) => z.name !== entry.zone).map((z) => (
                                <Button
                                  key={z.name}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs justify-start gap-2 px-2"
                                  onClick={() => moveMutation.mutate({ id: entry.id, zone: z.name })}
                                  disabled={moveMutation.isPending}
                                >
                                  <span className={`font-bold ${z.color}`}>{z.name}</span>
                                </Button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        {/* Remove */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => removeMutation.mutate(entry.id)}
                          disabled={removeMutation.isPending || moveMutation.isPending}
                          title="Remove from parking"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add vehicle modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ParkingCircle className="w-5 h-5 text-primary" />
              Enter Car in Parking
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Step 1: Zone */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Parking Zone
              </Label>
              <Select
                value={selectedZone}
                onValueChange={(v) => {
                  setSelectedZone(v);
                  setSelectedBrandId("");
                  setSelectedModelId("");
                  setSelectedVehicleId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select zone…" />
                </SelectTrigger>
                <SelectContent>
                  {ZONES.map((z) => {
                    const zoneData = zones?.[z.name];
                    const count = zoneData?.assignments.length ?? 0;
                    const cap = z.capacity;
                    const isFull = cap !== null && count === cap;
                    const isOverflow = cap !== null && count > cap;
                    return (
                      <SelectItem key={z.name} value={z.name}>
                        <span className="flex items-center gap-2">
                          {z.name}
                          <span className="text-muted-foreground text-xs">
                            {cap !== null ? `(${count}/${cap})` : `(${count})`}
                          </span>
                          {isOverflow && (
                            <Badge className="text-[10px] py-0 px-1 bg-orange-500/20 text-orange-400 border border-orange-500/30">OVER</Badge>
                          )}
                          {isFull && !isOverflow && (
                            <Badge variant="destructive" className="text-[10px] py-0 px-1">FULL</Badge>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Brand */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Brand
              </Label>
              <Select
                value={selectedBrandId}
                disabled={!selectedZone}
                onValueChange={(v) => {
                  setSelectedBrandId(v);
                  setSelectedModelId("");
                  setSelectedVehicleId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!selectedZone ? "Select a zone first" : "Select brand…"} />
                </SelectTrigger>
                <SelectContent>
                  {(brands ?? []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 3: Model */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                3. Model
              </Label>
              <Select
                value={selectedModelId}
                disabled={!selectedBrandId}
                onValueChange={(v) => {
                  setSelectedModelId(v);
                  setSelectedVehicleId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!selectedBrandId ? "Select a brand first" : "Select model…"} />
                </SelectTrigger>
                <SelectContent>
                  {modelsForBrand.length === 0 ? (
                    <SelectItem value="none" disabled>No models for this brand</SelectItem>
                  ) : (
                    modelsForBrand.map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Step 4: Vehicle */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                4. Vehicle
                <span className="ml-1.5 normal-case font-normal text-muted-foreground/70">(Tbilisi only)</span>
              </Label>
              <Select
                value={selectedVehicleId}
                disabled={!selectedModelId || vehiclesLoading}
                onValueChange={setSelectedVehicleId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !selectedModelId
                        ? "Select a model first"
                        : vehiclesLoading
                        ? "Loading vehicles…"
                        : "Select vehicle…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {!selectedModelId ? null : vehiclesLoading ? (
                    <SelectItem value="loading" disabled>Loading…</SelectItem>
                  ) : availableVehicles.length === 0 ? (
                    <SelectItem value="none" disabled>No available vehicles in Tbilisi</SelectItem>
                  ) : (
                    availableVehicles.map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.licensePlate ?? `#${v.id}`}
                        {v.color ? ` · ${v.color}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 flex-row justify-end">
            <Button variant="ghost" onClick={handleCloseModal} disabled={assignMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => assignMutation.mutate()}
              disabled={!canSubmit}
              className="gap-1.5"
            >
              {assignMutation.isPending ? "Assigning…" : "Assign to Parking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
