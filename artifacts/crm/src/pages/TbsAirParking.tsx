import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlaneTakeoff, ParkingCircle, Trash2, Plus, ArrowRightLeft, ChevronDown, ChevronUp, Wrench, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { PlateSearchInput, type PlateSearchVehicle } from "@/components/PlateSearchInput";

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
  { name: "AIRPORT",  capacity: 15,   color: "text-blue-400",   borderColor: "border-blue-500/30",   bgColor: "bg-blue-500/10" },
  { name: "FREE",     capacity: null, color: "text-emerald-400", borderColor: "border-emerald-500/30", bgColor: "bg-emerald-500/10" },
  { name: "TASHKENT", capacity: null, color: "text-violet-400", borderColor: "border-violet-500/30", bgColor: "bg-violet-500/10" },
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
  activeServiceStatus?: string | null;
}

interface ZoneData {
  capacity: number | null;
  assignments: ParkingEntry[];
}

interface ZoneMap {
  [zone: string]: ZoneData;
}

interface FleetVehicle extends PlateSearchVehicle {
  vehicleModelId: number | null;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function TbsAirParking() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  // Modal state
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [pickedVehicle, setPickedVehicle] = useState<FleetVehicle | null>(null);

  // Fallback browse state
  const [browseMode, setBrowseMode] = useState(false);

  // Remove confirmation dialog state
  const [confirmRemove, setConfirmRemove] = useState<{
    id: number;
    licensePlate: string | null;
    brandName: string | null;
    modelName: string | null;
    zone: string;
  } | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const { data: zones, isLoading } = useQuery<ZoneMap>({
    queryKey: ["parking-zones"],
    queryFn: () => apiFetch("/admin/parking"),
    refetchInterval: 30_000,
  });

  // Single Tbilisi-scoped vehicle fetch — used by both quick-add (autocomplete)
  // and browse fallback. Mirrors the Service.tsx client-side filter pattern
  // because /admin/fleet/vehicles has no `search` query param.
  const { data: tbilisiVehiclesResp, isLoading: vehiclesLoading } = useQuery<{ data: FleetVehicle[] }>({
    queryKey: ["fleet-vehicles-tbilisi-all"],
    queryFn: () => apiFetch(`/admin/fleet/vehicles?city=Tbilisi&limit=500`),
    enabled: showModal,
    staleTime: 30_000,
  });
  const tbilisiVehicles: FleetVehicle[] = Array.isArray(tbilisiVehiclesResp)
    ? (tbilisiVehiclesResp as FleetVehicle[])
    : (tbilisiVehiclesResp?.data ?? []);

  const { data: brands } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["fleet-brands"],
    queryFn: () => apiFetch("/admin/fleet/brands"),
    enabled: showModal && browseMode,
  });

  const parkedVehicleIds = useMemo(() => {
    return new Set<number>(
      Object.values(zones ?? {}).flatMap((z) =>
        (z.assignments ?? []).map((a) => a.vehicleId),
      ),
    );
  }, [zones]);

  const eligibleVehicles = useMemo(
    () => tbilisiVehicles.filter((v) => v.status !== "INACTIVE" && !parkedVehicleIds.has(v.id)),
    [tbilisiVehicles, parkedVehicleIds],
  );

  // Browse mode: derived brand/model lists from the same Tbilisi pool.
  const modelsForBrand = useMemo(() => {
    if (!selectedBrandId) return [] as { id: number; name: string }[];
    const map = new Map<number, { id: number; name: string }>();
    for (const v of tbilisiVehicles) {
      const m = v.vehicleModel;
      if (m?.id != null && m.brand?.id?.toString() === selectedBrandId) {
        map.set(m.id, { id: m.id, name: m.name ?? `#${m.id}` });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [tbilisiVehicles, selectedBrandId]);

  const browseVehicles = useMemo(() => {
    if (!selectedModelId) return [];
    return eligibleVehicles.filter((v) => v.vehicleModelId?.toString() === selectedModelId);
  }, [eligibleVehicles, selectedModelId]);

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
    mutationFn: (id: number) => apiFetch(`/admin/parking/${id}`, { method: "DELETE" }),
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

  function resetModalState() {
    setSelectedZone("");
    setSelectedVehicleId("");
    setPickedVehicle(null);
    setBrowseMode(false);
    setSelectedBrandId("");
    setSelectedModelId("");
  }

  function handleOpenModal() {
    resetModalState();
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    resetModalState();
  }

  function handlePickVehicle(v: PlateSearchVehicle) {
    setPickedVehicle(v as FleetVehicle);
    setSelectedVehicleId(String(v.id));
  }

  function clearPickedVehicle() {
    setPickedVehicle(null);
    setSelectedVehicleId("");
  }

  // Capacity check used to disable submit before hitting the server.
  const selectedZoneData = selectedZone ? zones?.[selectedZone] : undefined;
  const selectedZoneDef = selectedZone ? ZONES.find((z) => z.name === selectedZone) : undefined;
  const selectedZoneFull =
    selectedZoneDef?.capacity != null &&
    (selectedZoneData?.assignments.length ?? 0) >= selectedZoneDef.capacity;

  const canSubmit = !!selectedZone && !!selectedVehicleId && !selectedZoneFull && !assignMutation.isPending;

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
            <Card key={zoneDef.name} className={`border ${zoneDef.borderColor} bg-card/80 hover-elevate`}>
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
                {cap !== null && (
                  <div className="mt-2 h-1.5 rounded-full bg-border/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverflow ? "bg-orange-500" : isFull ? "bg-red-500" : zoneDef.color.replace("text-", "bg-")
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
                  <div className="text-center py-6 text-muted-foreground text-sm">No vehicles parked</div>
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
                        <button
                          className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="View vehicle detail"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/crm/fleet?vehicleId=${entry.vehicleId}`;
                          }}
                        >
                          <Car className="w-3.5 h-3.5" />
                        </button>
                        {entry.activeServiceStatus && (
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded text-amber-400 hover:bg-amber-500/10 transition-colors"
                            title={
                              entry.activeServiceStatus === "IN_PROGRESS"
                                ? "Service in progress"
                                : "Scheduled service"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/crm/service?vehicleSearch=${encodeURIComponent(entry.licensePlate ?? "")}`;
                            }}
                          >
                            <Wrench className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          onClick={() => setConfirmRemove({
                            id: entry.id,
                            licensePlate: entry.licensePlate ?? null,
                            brandName: entry.brandName ?? null,
                            modelName: entry.modelName ?? null,
                            zone: entry.zone,
                          })}
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
            {/* ─── Quick add by plate ────────────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Vehicle (search by plate)
              </Label>

              <PlateSearchInput
                vehicles={eligibleVehicles}
                selected={pickedVehicle}
                onSelect={handlePickVehicle}
                onClear={clearPickedVehicle}
                loading={vehiclesLoading}
                cityLabel="Tbilisi"
              />

              {!pickedVehicle && (
                <button
                  type="button"
                  onClick={() => setBrowseMode((b) => !b)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
                >
                  {browseMode ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {browseMode ? "Hide browse" : "Browse vehicles instead"}
                </button>
              )}
            </div>

            {/* ─── Browse fallback (collapsed by default) ─────────────────────── */}
            {!pickedVehicle && browseMode && (
              <div className="space-y-3 rounded-md border border-border/40 bg-muted/20 p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand</Label>
                  <Select
                    value={selectedBrandId}
                    onValueChange={(v) => {
                      setSelectedBrandId(v);
                      setSelectedModelId("");
                      setSelectedVehicleId("");
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select brand…" /></SelectTrigger>
                    <SelectContent>
                      {(brands ?? []).map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model</Label>
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
                        <SelectItem value="none" disabled>No models for this brand in Tbilisi</SelectItem>
                      ) : (
                        modelsForBrand.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Vehicle <span className="ml-1.5 normal-case font-normal text-muted-foreground/70">(Tbilisi only)</span>
                  </Label>
                  <Select
                    value={selectedVehicleId}
                    disabled={!selectedModelId || vehiclesLoading}
                    onValueChange={(val) => {
                      setSelectedVehicleId(val);
                      const found = browseVehicles.find((v) => String(v.id) === val);
                      if (found) setPickedVehicle(found);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !selectedModelId ? "Select a model first" : vehiclesLoading ? "Loading vehicles…" : "Select vehicle…"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {!selectedModelId ? null : vehiclesLoading ? (
                        <SelectItem value="loading" disabled>Loading…</SelectItem>
                      ) : browseVehicles.length === 0 ? (
                        <SelectItem value="none" disabled>No available vehicles in Tbilisi</SelectItem>
                      ) : (
                        browseVehicles.map((v) => (
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
            )}

            {/* ─── Zone (always shown after a vehicle is picked) ─────────────── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                2. Parking Zone
              </Label>
              <Select value={selectedZone} onValueChange={setSelectedZone}>
                <SelectTrigger><SelectValue placeholder="Select zone…" /></SelectTrigger>
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
              {selectedZoneFull && (
                <p className="text-xs text-destructive">This zone is at capacity. Pick another zone.</p>
              )}
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

      {/* Remove from parking confirmation dialog */}
      <Dialog open={confirmRemove !== null} onOpenChange={(open) => { if (!open) setConfirmRemove(null); }}>
        <DialogContent className="max-w-sm w-full">
          <DialogHeader>
            <DialogTitle>Remove from parking?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1 text-sm">
            <p>
              <span className="font-semibold">{confirmRemove?.licensePlate ?? `#${confirmRemove?.id}`}</span>
              {(confirmRemove?.brandName || confirmRemove?.modelName) && (
                <span className="text-muted-foreground"> — {[confirmRemove.brandName, confirmRemove.modelName].filter(Boolean).join(" ")}</span>
              )}
            </p>
            <p className="text-muted-foreground">
              Zone: <span className="font-medium text-foreground">{confirmRemove?.zone}</span>
            </p>
          </div>
          <DialogFooter className="gap-2 flex-row justify-end">
            <Button variant="ghost" onClick={() => setConfirmRemove(null)} disabled={removeMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => {
                if (confirmRemove) {
                  removeMutation.mutate(confirmRemove.id);
                  setConfirmRemove(null);
                }
              }}
            >
              {removeMutation.isPending ? "Removing…" : "Remove from Parking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
