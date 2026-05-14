import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Monitor, Image, ListVideo, DollarSign, ChevronRight, Loader2, AlertCircle, Car, PenLine, Trash2, Plus, Check, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStorageSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("/api/storage/")) return path;
  return `/api/storage${path}`;
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...options });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehicleModel {
  id: number;
  name: string;
  category: string | null;
  imageUrl: string | null;
  brandName?: string | null;
  active: boolean;
}

interface ShowroomSlide {
  id: number;
  vehicleModelId: number | null;
  titleEn: string | null;
  badgeEn: string | null;
  active: boolean;
  sortOrder: number;
  modelName?: string | null;
  modelImageUrl?: string | null;
  brandName?: string | null;
}

interface ShowroomPlaylist {
  id: number;
  name: string;
  active: boolean;
  items?: { id: number }[];
}

interface ShowroomPrice {
  id: number;
  vehicleModelId: number;
  priceUsd: string | null;
  active: boolean;
  modelName?: string | null;
  brandName?: string | null;
  category?: string | null;
}

interface ShowroomSettings {
  id: number;
  usdToEurRate: string;
}

// ─── Vehicles Tab ─────────────────────────────────────────────────────────────

function VehiclesTab() {
  const { data: models, isLoading, error } = useQuery<VehicleModel[]>({
    queryKey: ["showroom-vehicle-models"],
    queryFn: () => apiFetch("/api/admin/fleet/models"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !models) {
    return (
      <div className="flex items-center gap-2 text-destructive py-10">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Failed to load vehicles.</span>
      </div>
    );
  }

  const active = models.filter((m) => m.active);
  const grouped = active.reduce<Record<string, VehicleModel[]>>((acc, m) => {
    const cat = m.category ?? "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  return (
    <div className="space-y-8">
      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {cat}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {grouped[cat].map((model) => (
              <div
                key={model.id}
                className="bg-card border border-border rounded-xl p-3 flex flex-col items-center gap-2 hover:border-primary/40 transition-colors"
              >
                {toStorageSrc(model.imageUrl) ? (
                  <img
                    src={toStorageSrc(model.imageUrl)}
                    alt={model.name}
                    className="w-full h-20 object-contain"
                  />
                ) : (
                  <div className="w-full h-20 flex items-center justify-center bg-muted rounded-lg">
                    <Car className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="text-center">
                  {model.brandName && (
                    <p className="text-xs text-muted-foreground leading-none mb-0.5">{model.brandName}</p>
                  )}
                  <p className="text-sm font-medium text-white leading-snug">{model.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {categories.length === 0 && (
        <div className="text-center text-muted-foreground py-16 text-sm">
          No active vehicle models found.
        </div>
      )}
    </div>
  );
}

// ─── Slides Tab ───────────────────────────────────────────────────────────────

function SlidesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: slides, isLoading, error } = useQuery<ShowroomSlide[]>({
    queryKey: ["showroom-slides"],
    queryFn: () => apiFetch("/api/admin/showroom/slides"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/showroom/slides/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-slides"] });
      toast({ title: "Slide deleted" });
    },
    onError: () => toast({ title: "Failed to delete slide", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-10">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Failed to load slides.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{slides?.length ?? 0} slide{slides?.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="outline" disabled className="opacity-50 cursor-not-allowed">
          <Plus className="w-4 h-4 mr-1.5" />
          New Slide
          <Badge variant="secondary" className="ml-2 text-xs">Phase 2</Badge>
        </Button>
      </div>

      {slides && slides.length > 0 ? (
        <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
          {slides.map((slide) => (
            <div key={slide.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
              {toStorageSrc(slide.modelImageUrl) ? (
                <img
                  src={toStorageSrc(slide.modelImageUrl)}
                  alt={slide.modelName ?? ""}
                  className="w-14 h-10 object-contain flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
                  <Car className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {slide.titleEn || (slide.brandName && slide.modelName ? `${slide.brandName} ${slide.modelName}` : `Slide #${slide.id}`)}
                </p>
                {slide.badgeEn && (
                  <Badge variant="outline" className="text-xs mt-0.5">{slide.badgeEn}</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {slide.active ? (
                  <Badge variant="default" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-7 h-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteMutation.mutate(slide.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-16 text-sm border border-dashed border-border rounded-xl">
          No slides yet. Slide editor coming in Phase 2.
        </div>
      )}
    </div>
  );
}

// ─── Playlists Tab ────────────────────────────────────────────────────────────

function PlaylistsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: playlists, isLoading, error } = useQuery<ShowroomPlaylist[]>({
    queryKey: ["showroom-playlists"],
    queryFn: () => apiFetch("/api/admin/showroom/playlists"),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch("/api/admin/showroom/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-playlists"] });
      setCreating(false);
      setNewName("");
      toast({ title: "Playlist created" });
    },
    onError: () => toast({ title: "Failed to create playlist", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/showroom/playlists/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-playlists"] });
      toast({ title: "Playlist deleted" });
    },
    onError: () => toast({ title: "Failed to delete playlist", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-10">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Failed to load playlists.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{playlists?.length ?? 0} playlist{playlists?.length !== 1 ? "s" : ""}</p>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            New Playlist
          </Button>
        )}
      </div>

      {creating && (
        <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-xl">
          <Input
            autoFocus
            placeholder="Playlist name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim());
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            className="flex-1"
          />
          <Button
            size="icon"
            variant="default"
            disabled={!newName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(newName.trim())}
          >
            <Check className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => { setCreating(false); setNewName(""); }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {playlists && playlists.length > 0 ? (
        <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
          {playlists.map((pl) => (
            <div key={pl.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
              <ListVideo className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{pl.name}</p>
              </div>
              {pl.active ? (
                <Badge variant="default" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="w-7 h-7 text-muted-foreground hover:text-destructive"
                onClick={() => deleteMutation.mutate(pl.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-muted-foreground py-16 text-sm border border-dashed border-border rounded-xl">
          No playlists yet. Create one above to get started.
        </div>
      )}
    </div>
  );
}

// ─── Prices Tab ───────────────────────────────────────────────────────────────

function PricesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: settings } = useQuery<ShowroomSettings>({
    queryKey: ["showroom-settings"],
    queryFn: () => apiFetch("/api/admin/showroom/settings"),
  });

  const { data: prices, isLoading, error } = useQuery<ShowroomPrice[]>({
    queryKey: ["showroom-prices"],
    queryFn: () => apiFetch("/api/admin/showroom/prices"),
  });

  const { data: models } = useQuery<VehicleModel[]>({
    queryKey: ["showroom-vehicle-models"],
    queryFn: () => apiFetch("/api/admin/fleet/models"),
  });

  const saveMutation = useMutation({
    mutationFn: ({ modelId, priceUsd }: { modelId: number; priceUsd: string | null }) =>
      apiFetch(`/api/admin/showroom/prices/${modelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceUsd }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-prices"] });
      setEditingId(null);
      toast({ title: "Price saved" });
    },
    onError: () => toast({ title: "Failed to save price", variant: "destructive" }),
  });

  const [editingRate, setEditingRate] = useState(false);
  const [rateValue, setRateValue] = useState("");

  const saveRateMutation = useMutation({
    mutationFn: (usdToEurRate: string) =>
      apiFetch("/api/admin/showroom/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdToEurRate }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-settings"] });
      setEditingRate(false);
      toast({ title: "Exchange rate saved" });
    },
    onError: () => toast({ title: "Failed to save rate", variant: "destructive" }),
  });

  const eurRate = parseFloat(settings?.usdToEurRate ?? "0.92");
  const priceMap = new Map((prices ?? []).map((p) => [p.vehicleModelId, p]));
  const activeModels = (models ?? []).filter((m) => m.active);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-10">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Failed to load prices.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Exchange rate */}
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
        <DollarSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">USD → EUR rate (showroom only)</span>
        {editingRate ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              className="w-28 h-8 text-sm"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && rateValue) saveRateMutation.mutate(rateValue);
                if (e.key === "Escape") setEditingRate(false);
              }}
            />
            <Button size="icon" variant="default" className="h-8 w-8"
              disabled={!rateValue || saveRateMutation.isPending}
              onClick={() => saveRateMutation.mutate(rateValue)}>
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8"
              onClick={() => setEditingRate(false)}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-medium text-white">{eurRate.toFixed(6)}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
              onClick={() => { setRateValue(settings?.usdToEurRate ?? "0.920000"); setEditingRate(true); }}>
              <PenLine className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Price list */}
      <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
        {activeModels.length === 0 && (
          <div className="text-center text-muted-foreground py-16 text-sm">No active vehicle models.</div>
        )}
        {activeModels.map((model) => {
          const price = priceMap.get(model.id);
          const usd = price?.priceUsd ? parseFloat(price.priceUsd) : null;
          const eur = usd !== null ? (usd * eurRate).toFixed(0) : null;
          const isEditing = editingId === model.id;

          return (
            <div key={model.id} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
              {toStorageSrc(model.imageUrl) ? (
                <img
                  src={toStorageSrc(model.imageUrl)}
                  alt={model.name}
                  className="w-14 h-10 object-contain flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
                  <Car className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{model.name}</p>
                {model.category && (
                  <p className="text-xs text-muted-foreground">{model.category}</p>
                )}
              </div>

              {isEditing ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">USD</span>
                  <Input
                    autoFocus
                    className="w-24 h-8 text-sm"
                    value={editValue}
                    placeholder="0"
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        saveMutation.mutate({ modelId: model.id, priceUsd: editValue || null });
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button size="icon" variant="default" className="h-8 w-8"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate({ modelId: model.id, priceUsd: editValue || null })}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8"
                    onClick={() => setEditingId(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-shrink-0">
                  {usd !== null ? (
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">${usd.toFixed(0)}</p>
                      {eur && <p className="text-xs text-muted-foreground">≈ €{eur}</p>}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No price</span>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                    onClick={() => { setEditingId(model.id); setEditValue(price?.priceUsd ?? ""); }}>
                    <PenLine className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Showroom() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
          <Monitor className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white leading-none">Digital Showroom</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Vehicle presentation for desk &amp; airport screens</p>
        </div>
      </div>

      <Tabs defaultValue="vehicles">
        <TabsList className="grid grid-cols-4 w-full max-w-md">
          <TabsTrigger value="vehicles" className="flex items-center gap-1.5 text-xs">
            <Car className="w-3.5 h-3.5" />
            Vehicles
          </TabsTrigger>
          <TabsTrigger value="slides" className="flex items-center gap-1.5 text-xs">
            <Image className="w-3.5 h-3.5" />
            Slides
          </TabsTrigger>
          <TabsTrigger value="playlists" className="flex items-center gap-1.5 text-xs">
            <ListVideo className="w-3.5 h-3.5" />
            Playlists
          </TabsTrigger>
          <TabsTrigger value="prices" className="flex items-center gap-1.5 text-xs">
            <DollarSign className="w-3.5 h-3.5" />
            Prices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="mt-6">
          <VehiclesTab />
        </TabsContent>

        <TabsContent value="slides" className="mt-6">
          <SlidesTab />
        </TabsContent>

        <TabsContent value="playlists" className="mt-6">
          <PlaylistsTab />
        </TabsContent>

        <TabsContent value="prices" className="mt-6">
          <PricesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
