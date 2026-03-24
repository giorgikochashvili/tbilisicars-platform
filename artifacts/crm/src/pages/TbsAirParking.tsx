import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListLocations } from "@workspace/api-client-react";
import { PlaneTakeoff, ParkingCircle, Trash2, Plus, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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

  // Modal state
  const [selectedZone, setSelectedZone] = useState("");
  const [filterBrandId, setFilterBrandId] = useState("");
  const [filterModelId, setFilterModelId] = useState("");
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

  const { data: allVehicles, isLoading: vehiclesLoading } = useQuery<any>({
    queryKey: ["fleet-vehicles"],
    queryFn: () => apiFetch("/admin/fleet/vehicles"),
    enabled: showModal,
  });

  const { data: locations } = useListLocations({
    query: { enabled: showModal, queryKey: ["/api/locations", showModal] },
  });

  // ─── Lookup maps ────────────────────────────────────────────────────────────

  const locationMap = new Map<number, string>(
    (locations ?? []).map((l: any) => [l.id, l.name as string])
  );

  const modelMap = new Map<number, { name: string; brandId: number }>(
    (allModels ?? []).map((m: any) => [m.id, { name: m.name, brandId: m.brandId }])
  );

  const brandMap = new Map<number, string>(
    (brands ?? []).map((b: any) => [b.id, b.name as string])
  );

  // ─── Derived data for modal selectors ──────────────────────────────────────

  const modelsForBrandFilter = (allModels ?? []).filter(
    (m: any) => !filterBrandId || filterBrandId === "any" || String(m.brandId) === filterBrandId,
  );

  const vehicleList: any[] = Array.isArray(allVehicles)
    ? allVehicles
    : (allVehicles?.data ?? []);

  const parkedVehicleIds = new Set<number>(
    Object.values(zones ?? {}).flatMap((z: any) =>
      (z.assignments ?? []).map((a: any) => a.vehicleId)
    )
  );

  const vehiclesFiltered = vehicleList.filter((v: any) => {
    if (v.status === "INACTIVE") return false;
    if (parkedVehicleIds.has(v.id)) return false;
    if (!v.vehicleModelId) {
      return (!filterBrandId || filterBrandId === "any") && (!filterModelId || filterModelId === "any");
    }
    const brandMatch =
      !filterBrandId || filterBrandId === "any" ||
      modelsForBrandFilter.some((m: any) => m.id === v.vehicleModelId);
    const modelMatch =
      !filterModelId || filterModelId === "any" ||
      String(v.vehicleModelId) === filterModelId;
    return brandMatch && modelMatch;
  });

  function getVehicleLabel(v: any): string {
    const modelEntry = v.vehicleModelId != null ? modelMap.get(Number(v.vehicleModelId)) : undefined;
    const brandName = modelEntry ? (brandMap.get(modelEntry.brandId) ?? "") : "";
    const modelName = modelEntry?.name ?? "";
    const plate = v.licensePlate ?? `#${v.id}`;
    const locationName = v.locationId != null ? (locationMap.get(Number(v.locationId)) ?? "") : "";

    const parts: string[] = [];
    const prefix = [brandName, modelName].filter(Boolean).join(" ");
    if (prefix) parts.push(prefix);
    parts.push(plate);
    if (locationName) parts.push(locationName);

    return parts.join(" — ");
  }

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

  // ─── Modal helpers ──────────────────────────────────────────────────────────

  function handleOpenModal() {
    setSelectedZone("");
    setFilterBrandId("");
    setFilterModelId("");
    setSelectedVehicleId("");
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setSelectedZone("");
    setFilterBrandId("");
    setFilterModelId("");
    setSelectedVehicleId("");
  }

  const canSubmit =
    selectedZone && selectedVehicleId && !assignMutation.isPending;

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
          const isFull = cap !== null && count >= cap;

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
                    {isFull && (
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
                      className={`h-full rounded-full transition-all duration-500 ${isFull ? "bg-red-500" : zoneDef.color.replace("text-", "bg-")}`}
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0 transition-colors"
                        onClick={() => removeMutation.mutate(entry.id)}
                        disabled={removeMutation.isPending}
                        title="Remove from parking"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
                  setFilterBrandId("");
                  setFilterModelId("");
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
                    const isFull = cap !== null && count >= cap;
                    return (
                      <SelectItem key={z.name} value={z.name} disabled={!!isFull}>
                        <span className="flex items-center gap-2">
                          {z.name}
                          <span className="text-muted-foreground text-xs">
                            {cap !== null ? `(${count}/${cap})` : `(${count})`}
                          </span>
                          {isFull && (
                            <Badge variant="destructive" className="text-[10px] py-0 px-1">FULL</Badge>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Vehicle (primary) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Vehicle
              </Label>
              <Select
                value={selectedVehicleId}
                disabled={!selectedZone || vehiclesLoading}
                onValueChange={setSelectedVehicleId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !selectedZone
                        ? "Select a zone first"
                        : vehiclesLoading
                        ? "Loading vehicles…"
                        : "Select vehicle…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {vehiclesFiltered.length === 0 ? (
                    <SelectItem value="none" disabled>
                      {vehiclesLoading ? "Loading…" : "No available vehicles"}
                    </SelectItem>
                  ) : (
                    vehiclesFiltered.map((v: any) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {getVehicleLabel(v)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Optional filters */}
            <div className="border border-border/40 rounded-lg p-3 space-y-3 bg-muted/20">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="w-3 h-3" />
                Optional filters
              </p>

              {/* Brand filter */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Brand</Label>
                <Select
                  value={filterBrandId}
                  disabled={!selectedZone}
                  onValueChange={(v) => {
                    setFilterBrandId(v);
                    setFilterModelId("");
                    setSelectedVehicleId("");
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Any brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any brand</SelectItem>
                    {(brands ?? []).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model filter */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Model</Label>
                <Select
                  value={filterModelId}
                  disabled={!selectedZone}
                  onValueChange={(v) => {
                    setFilterModelId(v);
                    setSelectedVehicleId("");
                  }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Any model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any model</SelectItem>
                    {modelsForBrandFilter.map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
