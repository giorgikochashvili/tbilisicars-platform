import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, MoreHorizontal, Star, ToggleLeft, ToggleRight, ImageIcon, Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

function toStorageSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("/api/storage/")) return path;
  return `/api/storage${path}`;
}

function SliderImg({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <ImageIcon className="w-5 h-5 text-muted-foreground" />;
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: undefined })) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

interface SliderItem {
  id: number;
  title: string;
  subtitle: string | null;
  badgeText: string | null;
  displayPriceText: string;
  ctaLabel: string | null;
  imageUrl: string;
  vehicleModelId: number;
  sortOrder: number;
  isActive: boolean;
  brandName: string | null;
  modelName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SliderSettings {
  sectionTitle: string;
  sectionSubtitle: string;
  isSectionActive: boolean;
}

interface VehicleModel {
  id: number;
  name: string;
  brand: string;
}

interface RawVehicleModel {
  id: number;
  name: string;
  brandName?: string;
  brand?: { id: number; name: string | null; logoUrl?: string | null } | null;
}

interface MutationError {
  message: string;
}

interface SliderItemPayload {
  title: string;
  subtitle: string | null;
  badgeText: string | null;
  displayPriceText: string;
  ctaLabel: string | null;
  imageUrl: string;
  vehicleModelId: number;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  badgeText: "",
  displayPriceText: "",
  ctaLabel: "",
  imageUrl: "",
  vehicleModelId: "",
  sortOrder: "0",
  isActive: true,
};

export default function FeaturedSliderPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ─── Items query ────────────────────────────────────────────────────────────

  const { data: items, isLoading: itemsLoading } = useQuery<SliderItem[]>({
    queryKey: ["featured-slider-items"],
    queryFn: () => apiFetch(`${API}/admin/featured-slider`),
  });

  // ─── Settings query ──────────────────────────────────────────────────────────

  const { data: settings, isLoading: settingsLoading } = useQuery<SliderSettings>({
    queryKey: ["featured-slider-settings"],
    queryFn: () => apiFetch(`${API}/admin/featured-slider/settings`),
  });

  // ─── Vehicle models query (for selector) ─────────────────────────────────────

  const { data: modelsRaw } = useQuery<RawVehicleModel[]>({
    queryKey: ["admin-fleet-models-for-slider"],
    queryFn: () => apiFetch(`${API}/admin/fleet/models`),
  });

  const models: VehicleModel[] = (modelsRaw ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    brand: m.brand?.name ?? m.brandName ?? "",
  }));

  // ─── Item modal state ─────────────────────────────────────────────────────

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SliderItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Delete confirm state ─────────────────────────────────────────────────

  const [deleteTarget, setDeleteTarget] = useState<SliderItem | null>(null);

  // ─── Settings form state ──────────────────────────────────────────────────

  const [settingsForm, setSettingsForm] = useState<SliderSettings | null>(null);

  useEffect(() => {
    if (settings) setSettingsForm(settings);
  }, [settings]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: SliderItemPayload) =>
      apiFetch(`${API}/admin/featured-slider`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["featured-slider-items"] });
      toast({ title: "Item created" });
      setModalOpen(false);
    },
    onError: (err: MutationError) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SliderItemPayload }) =>
      apiFetch(`${API}/admin/featured-slider/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["featured-slider-items"] });
      toast({ title: "Item updated" });
      setModalOpen(false);
    },
    onError: (err: MutationError) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`${API}/admin/featured-slider/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["featured-slider-items"] });
      toast({ title: "Item deleted" });
      setDeleteTarget(null);
    },
    onError: (err: MutationError) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`${API}/admin/featured-slider/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["featured-slider-items"] });
    },
    onError: (err: MutationError) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (data: SliderSettings) =>
      apiFetch(`${API}/admin/featured-slider/settings`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: (updated: SliderSettings) => {
      queryClient.invalidateQueries({ queryKey: ["featured-slider-settings"] });
      setSettingsForm(updated);
      toast({ title: "Settings saved" });
    },
    onError: (err: MutationError) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ─── Image upload ─────────────────────────────────────────────────────────

  async function handleImageUpload(file: File) {
    setImageUploading(true);
    try {
      const metaRes = await fetch(`${API}/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "image/jpeg" }),
      });
      if (!metaRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await metaRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!putRes.ok) throw new Error("File upload failed");
      setForm((f) => ({ ...f, imageUrl: objectPath }));
      toast({ title: "Image uploaded" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  }

  // ─── Modal helpers ────────────────────────────────────────────────────────

  function openCreate() {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(item: SliderItem) {
    setEditingItem(item);
    setForm({
      title: item.title,
      subtitle: item.subtitle ?? "",
      badgeText: item.badgeText ?? "",
      displayPriceText: item.displayPriceText,
      ctaLabel: item.ctaLabel ?? "",
      imageUrl: item.imageUrl,
      vehicleModelId: String(item.vehicleModelId),
      sortOrder: String(item.sortOrder),
      isActive: item.isActive,
    });
    setModalOpen(true);
  }

  function handleSave() {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!form.displayPriceText.trim()) {
      toast({ title: "Display price text is required", variant: "destructive" });
      return;
    }
    if (!form.imageUrl) {
      toast({ title: "Image is required", variant: "destructive" });
      return;
    }
    if (!form.vehicleModelId) {
      toast({ title: "Vehicle model is required", variant: "destructive" });
      return;
    }
    const payload: SliderItemPayload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      badgeText: form.badgeText.trim() || null,
      displayPriceText: form.displayPriceText.trim(),
      ctaLabel: form.ctaLabel.trim() || null,
      imageUrl: form.imageUrl,
      vehicleModelId: parseInt(form.vehicleModelId, 10),
      sortOrder: parseInt(form.sortOrder, 10) || 0,
      isActive: form.isActive,
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Featured Cars</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage the homepage featured cars slider section.
          </p>
        </div>
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Slider Items</TabsTrigger>
          <TabsTrigger value="settings">Section Settings</TabsTrigger>
        </TabsList>

        {/* ── Items tab ─────────────────────────────────────────────────── */}
        <TabsContent value="items" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </div>

          {itemsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : !items || items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Star className="w-10 h-10 opacity-30" />
                <p className="text-sm">No slider items yet. Add one to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="w-14 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center border border-border">
                        <SliderImg
                          src={toStorageSrc(item.imageUrl)}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{item.title}</span>
                          {item.badgeText && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              {item.badgeText}
                            </Badge>
                          )}
                          <Badge
                            variant={item.isActive ? "default" : "outline"}
                            className={`text-xs px-1.5 py-0 ${item.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}
                          >
                            {item.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                          {item.brandName && item.modelName && (
                            <span>{item.brandName} {item.modelName}</span>
                          )}
                          <span className="text-primary font-medium">{item.displayPriceText}</span>
                          <span>Order: {item.sortOrder}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(item)}>
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              toggleMutation.mutate({ id: item.id, isActive: !item.isActive })
                            }
                          >
                            {item.isActive ? (
                              <>
                                <ToggleLeft className="w-3.5 h-3.5 mr-2" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <ToggleRight className="w-3.5 h-3.5 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(item)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Settings tab ──────────────────────────────────────────────── */}
        <TabsContent value="settings" className="mt-4">
          {settingsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : settingsForm ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Homepage Section Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Section Title</Label>
                  <Input
                    value={settingsForm.sectionTitle}
                    onChange={(e) =>
                      setSettingsForm((s) => s ? { ...s, sectionTitle: e.target.value } : s)
                    }
                    placeholder="e.g. Choose Your Perfect Car"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Section Subtitle</Label>
                  <textarea
                    className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 transition-colors resize-none"
                    rows={3}
                    value={settingsForm.sectionSubtitle}
                    onChange={(e) =>
                      setSettingsForm((s) => s ? { ...s, sectionSubtitle: e.target.value } : s)
                    }
                    placeholder="Supporting text shown below the section title"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={settingsForm.isSectionActive}
                    onCheckedChange={(v) =>
                      setSettingsForm((s) => s ? { ...s, isSectionActive: v } : s)
                    }
                  />
                  <div>
                    <p className="text-sm font-medium">Section Active</p>
                    <p className="text-xs text-muted-foreground">
                      When off, the entire Featured Cars section is hidden from the homepage.
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => settingsForm && saveSettingsMutation.mutate(settingsForm)}
                  disabled={saveSettingsMutation.isPending}
                  className="gap-2"
                >
                  <Save className="w-4 h-4" />
                  {saveSettingsMutation.isPending ? "Saving…" : "Save Settings"}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* ── Create/Edit modal ───────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Slider Item" : "Add Slider Item"}</DialogTitle>
            <DialogDescription>
              Fill in the details for the featured car slider card.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. BMW 3 Series"
              />
            </div>

            {/* Subtitle */}
            <div className="space-y-1.5">
              <Label>Subtitle</Label>
              <Input
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                placeholder="e.g. Perfect for business travel"
              />
            </div>

            {/* Badge */}
            <div className="space-y-1.5">
              <Label>Badge Text</Label>
              <Input
                value={form.badgeText}
                onChange={(e) => setForm((f) => ({ ...f, badgeText: e.target.value }))}
                placeholder="e.g. Popular, Premium SUV, Best Value"
              />
            </div>

            {/* Display price */}
            <div className="space-y-1.5">
              <Label>Display Price <span className="text-destructive">*</span></Label>
              <Input
                value={form.displayPriceText}
                onChange={(e) => setForm((f) => ({ ...f, displayPriceText: e.target.value }))}
                placeholder="e.g. From $65/day"
              />
              <p className="text-xs text-muted-foreground">
                Marketing display price only — does not affect booking pricing.
              </p>
            </div>

            {/* CTA label */}
            <div className="space-y-1.5">
              <Label>CTA Button Label</Label>
              <Input
                value={form.ctaLabel}
                onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                placeholder="e.g. Book Now (leave blank for default)"
              />
            </div>

            {/* Vehicle model */}
            <div className="space-y-1.5">
              <Label>Vehicle Model <span className="text-destructive">*</span></Label>
              <select
                className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 transition-colors"
                value={form.vehicleModelId}
                onChange={(e) => setForm((f) => ({ ...f, vehicleModelId: e.target.value }))}
              >
                <option value="">Select vehicle model…</option>
                {models.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.brand} – {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Image */}
            <div className="space-y-1.5">
              <Label>Car Image <span className="text-destructive">*</span></Label>
              {form.imageUrl ? (
                <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border">
                  <img
                    src={toStorageSrc(form.imageUrl)}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="absolute bottom-2 right-2 text-xs h-7"
                    onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div
                  className="w-full h-24 rounded-lg border border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors bg-muted/20"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImageIcon className="w-6 h-6" />
                    <span className="text-xs">Click to upload image</span>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
                className="text-xs"
              >
                {imageUploading ? "Uploading…" : form.imageUrl ? "Replace Image" : "Upload Image"}
              </Button>
            </div>

            {/* Sort order + Active */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  min="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Active</Label>
                <div className="flex items-center h-10">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : editingItem ? "Save Changes" : "Create Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ──────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Slider Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
