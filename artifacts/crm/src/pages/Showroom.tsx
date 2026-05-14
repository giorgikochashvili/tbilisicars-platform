import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Monitor, ListVideo, DollarSign, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, Car, PenLine, Trash2, Plus, Check, X, ArrowLeft, Scale,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

function fmtPrice(usd: number, eur: boolean, rate: number) {
  if (eur) return `€${Math.round(usd * rate)}/day`;
  return `$${Math.round(usd)}/day`;
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
  titleHe: string | null;
  titleAr: string | null;
  bodyEn: string | null;
  bodyHe: string | null;
  bodyAr: string | null;
  badgeEn: string | null;
  badgeHe: string | null;
  badgeAr: string | null;
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
}

interface PlaylistItemFlat {
  id: number;
  playlistId: number;
  slideId: number;
  position: number;
  durationSeconds: number;
  slideTitleEn: string | null;
  slideModelId: number | null;
  slideModelImageUrl: string | null;
  slideModelName: string | null;
  slideBrandName: string | null;
}

interface ShowroomPlaylistDetail extends ShowroomPlaylist {
  items: PlaylistItemFlat[];
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

// ─── CarouselModal ─────────────────────────────────────────────────────────────

interface CarouselModalProps {
  open: boolean;
  onClose: () => void;
  catModels: VehicleModel[];
  index: number;
  onIndexChange: (i: number) => void;
  priceMap: Map<number, ShowroomPrice>;
  eurRate: number;
  slideMap: Map<number, ShowroomSlide>;
  compareList: VehicleModel[];
  onAddToCompare: (m: VehicleModel) => void;
  onEditSlide: (model: VehicleModel, slide: ShowroomSlide | null) => void;
}

function CarouselModal({
  open, onClose, catModels, index, onIndexChange,
  priceMap, eurRate, slideMap, compareList, onAddToCompare, onEditSlide,
}: CarouselModalProps) {
  const [eurMode, setEurMode] = useState(false);

  const total = catModels.length;
  const prev = () => onIndexChange((index - 1 + total) % total);
  const next = () => onIndexChange((index + 1) % total);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, index, total]);

  if (!open || !catModels[index]) return null;
  const model = catModels[index];

  const price = priceMap.get(model.id);
  const usd = price?.priceUsd ? parseFloat(price.priceUsd) : null;
  const slide = slideMap.get(model.id);
  const inCompare = compareList.some((c) => c.id === model.id);
  const compareFull = !inCompare && compareList.length >= 4;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/96"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Close */}
      <button
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        onClick={onClose}
      >
        <X className="w-5 h-5" />
      </button>

      {/* Prev */}
      {total > 1 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          onClick={prev}
          aria-label="Previous vehicle"
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}

      {/* Next */}
      {total > 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          onClick={next}
          aria-label="Next vehicle"
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      )}

      {/* Content */}
      <div className="flex flex-col items-center gap-5 px-20 max-w-xl w-full">
        {/* Image */}
        <div className="w-full h-60 flex items-center justify-center">
          {toStorageSrc(model.imageUrl) ? (
            <img
              src={toStorageSrc(model.imageUrl)}
              alt={model.name}
              className="max-h-60 max-w-full object-contain drop-shadow-2xl"
            />
          ) : (
            <div className="w-44 h-44 flex items-center justify-center bg-white/5 rounded-2xl">
              <Car className="w-16 h-16 text-white/20" />
            </div>
          )}
        </div>

        {/* Name */}
        <div className="text-center">
          {model.brandName && (
            <p className="text-xs text-white/40 uppercase tracking-widest mb-1">{model.brandName}</p>
          )}
          <h2 className="text-2xl font-bold text-white">{model.name}</h2>
          {model.category && (
            <p className="text-sm text-white/35 mt-1">{model.category}</p>
          )}
        </div>

        {/* Slide overlay content */}
        {(slide?.badgeEn || slide?.bodyEn) && (
          <div className="text-center space-y-1.5">
            {slide.badgeEn && (
              <span className="inline-block px-3 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs font-semibold uppercase tracking-wider">
                {slide.badgeEn}
              </span>
            )}
            {slide.bodyEn && (
              <p className="text-sm text-white/55 max-w-sm leading-relaxed">{slide.bodyEn}</p>
            )}
          </div>
        )}

        {/* Price + currency toggle */}
        <div className="flex items-center gap-3">
          {usd !== null ? (
            <>
              <span className="text-xl font-bold text-white">{fmtPrice(usd, eurMode, eurRate)}</span>
              <div className="flex items-center bg-white/10 rounded-lg p-0.5">
                <button
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-colors ${!eurMode ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
                  onClick={() => setEurMode(false)}
                >USD</button>
                <button
                  className={`px-2.5 py-0.5 rounded text-xs font-semibold transition-colors ${eurMode ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
                  onClick={() => setEurMode(true)}
                >EUR</button>
              </div>
            </>
          ) : (
            <span className="text-sm text-white/25 italic">No showroom price</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <Button
            size="sm"
            variant="outline"
            className={
              inCompare
                ? "border-primary/60 text-primary bg-primary/10"
                : compareFull
                ? "border-white/15 text-white/40 cursor-not-allowed"
                : "border-white/20 text-white hover:bg-white/10"
            }
            disabled={compareFull}
            onClick={() => { if (!inCompare) onAddToCompare(model); }}
          >
            <Scale className="w-3.5 h-3.5 mr-1.5" />
            {inCompare ? "In Compare" : compareFull ? "Compare full (4 max)" : "Add to Compare"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
            onClick={() => onEditSlide(model, slide ?? null)}
          >
            <PenLine className="w-3.5 h-3.5 mr-1.5" />
            {slide ? "Edit Slide" : "Create Slide"}
          </Button>
        </div>

        {/* Counter */}
        {total > 1 && (
          <p className="text-xs text-white/20">{index + 1} / {total}</p>
        )}
      </div>
    </div>
  );
}

// ─── SlideEditorModal ──────────────────────────────────────────────────────────

type Lang = "en" | "he" | "ar";
const LANG_LABEL: Record<Lang, string> = { en: "EN", he: "HE", ar: "AR" };
const RTL_LANGS: Lang[] = ["he", "ar"];

interface SlideEditorModalProps {
  open: boolean;
  onClose: () => void;
  slide: ShowroomSlide | null;
  defaultModelId?: number | null;
  vehicleModels: VehicleModel[];
}

interface SlideForm {
  vehicleModelId: number | null;
  titleEn: string; titleHe: string; titleAr: string;
  bodyEn: string;  bodyHe: string;  bodyAr: string;
  badgeEn: string; badgeHe: string; badgeAr: string;
  active: boolean;
  sortOrder: number;
}

const BLANK_FORM: SlideForm = {
  vehicleModelId: null,
  titleEn: "", titleHe: "", titleAr: "",
  bodyEn: "",  bodyHe: "",  bodyAr: "",
  badgeEn: "", badgeHe: "", badgeAr: "",
  active: true, sortOrder: 0,
};

function SlideEditorModal({
  open, onClose, slide, defaultModelId, vehicleModels,
}: SlideEditorModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lang, setLang] = useState<Lang>("en");
  const [form, setForm] = useState<SlideForm>(BLANK_FORM);

  useEffect(() => {
    if (!open) return;
    setLang("en");
    if (slide) {
      setForm({
        vehicleModelId: slide.vehicleModelId,
        titleEn: slide.titleEn ?? "", titleHe: slide.titleHe ?? "", titleAr: slide.titleAr ?? "",
        bodyEn: slide.bodyEn ?? "",   bodyHe: slide.bodyHe ?? "",   bodyAr: slide.bodyAr ?? "",
        badgeEn: slide.badgeEn ?? "", badgeHe: slide.badgeHe ?? "", badgeAr: slide.badgeAr ?? "",
        active: slide.active,
        sortOrder: slide.sortOrder,
      });
    } else {
      setForm({ ...BLANK_FORM, vehicleModelId: defaultModelId ?? null });
    }
  }, [open, slide?.id]);

  const set = <K extends keyof SlideForm>(k: K, v: SlideForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isRTL = RTL_LANGS.includes(lang);
  const titleKey = `title${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof SlideForm;
  const bodyKey  = `body${lang.charAt(0).toUpperCase() + lang.slice(1)}`  as keyof SlideForm;
  const badgeKey = `badge${lang.charAt(0).toUpperCase() + lang.slice(1)}` as keyof SlideForm;

  const selectedModel = vehicleModels.find((m) => m.id === form.vehicleModelId);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        vehicleModelId: form.vehicleModelId,
        titleEn: form.titleEn || null, titleHe: form.titleHe || null, titleAr: form.titleAr || null,
        bodyEn:  form.bodyEn  || null, bodyHe:  form.bodyHe  || null, bodyAr:  form.bodyAr  || null,
        badgeEn: form.badgeEn || null, badgeHe: form.badgeHe || null, badgeAr: form.badgeAr || null,
        active: form.active,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (slide) {
        return apiFetch(`/api/admin/showroom/slides/${slide.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      return apiFetch("/api/admin/showroom/slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-slides"] });
      toast({ title: slide ? "Slide updated" : "Slide created" });
      onClose();
    },
    onError: () => toast({ title: "Failed to save slide", variant: "destructive" }),
  });

  const previewTitle = form[titleKey] as string;
  const previewBody  = form[bodyKey]  as string;
  const previewBadge = form[badgeKey] as string;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle>{slide ? "Edit Slide" : "New Slide"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          {/* ── Left: fields ── */}
          <div className="space-y-4">
            {/* Vehicle model */}
            <div className="space-y-1.5">
              <Label className="text-sm">Vehicle model</Label>
              <Select
                value={form.vehicleModelId?.toString() ?? "none"}
                onValueChange={(v) => set("vehicleModelId", v === "none" ? null : parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No model —</SelectItem>
                  {vehicleModels.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.brandName ? `${m.brandName} ` : ""}{m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active + sort order */}
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                <Switch
                  id="slide-active"
                  checked={form.active}
                  onCheckedChange={(v) => set("active", v)}
                />
                <Label htmlFor="slide-active">Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="sort-order" className="text-sm text-muted-foreground whitespace-nowrap">Sort order</Label>
                <Input
                  id="sort-order"
                  type="number"
                  className="w-20 h-8 text-sm"
                  value={form.sortOrder}
                  onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Language tabs */}
            <div className="space-y-3">
              <div className="flex gap-1 border-b border-border pb-2">
                {(["en", "he", "ar"] as Lang[]).map((l) => (
                  <button
                    key={l}
                    className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                      lang === l
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "text-muted-foreground hover:text-white"
                    }`}
                    onClick={() => setLang(l)}
                  >
                    {LANG_LABEL[l]}
                  </button>
                ))}
                {isRTL && (
                  <span className="ml-auto text-xs text-muted-foreground self-center">RTL</span>
                )}
              </div>

              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Title</Label>
                  <Input
                    value={form[titleKey] as string}
                    onChange={(e) => set(titleKey, e.target.value)}
                    dir={isRTL ? "rtl" : "ltr"}
                    className={isRTL ? "text-right" : ""}
                    placeholder={
                      lang === "he" ? "כותרת…" : lang === "ar" ? "عنوان…" : "Title…"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Body text</Label>
                  <Textarea
                    value={form[bodyKey] as string}
                    onChange={(e) => set(bodyKey, e.target.value)}
                    dir={isRTL ? "rtl" : "ltr"}
                    className={`min-h-[5rem] resize-none ${isRTL ? "text-right" : ""}`}
                    placeholder={
                      lang === "he" ? "טקסט גוף…" : lang === "ar" ? "نص الجسم…" : "Body text…"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Badge</Label>
                  <Input
                    value={form[badgeKey] as string}
                    onChange={(e) => set(badgeKey, e.target.value)}
                    dir={isRTL ? "rtl" : "ltr"}
                    className={isRTL ? "text-right" : ""}
                    placeholder={
                      lang === "he" ? "תווית…" : lang === "ar" ? "شارة…" : "Badge label…"
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: preview ── */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Preview · {LANG_LABEL[lang]}
            </Label>
            <div
              className="relative rounded-xl overflow-hidden bg-zinc-900 border border-white/10 aspect-video flex items-end"
              dir={isRTL ? "rtl" : "ltr"}
            >
              {toStorageSrc(selectedModel?.imageUrl) ? (
                <img
                  src={toStorageSrc(selectedModel?.imageUrl)}
                  alt={selectedModel?.name}
                  className="absolute inset-0 w-full h-full object-contain p-4"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Car className="w-12 h-12 text-white/10" />
                </div>
              )}
              <div className="relative w-full bg-gradient-to-t from-black/80 to-transparent p-3 space-y-1">
                {previewBadge && (
                  <span className="inline-block px-2 py-0.5 bg-primary/80 text-white text-xs font-semibold rounded-full">
                    {previewBadge}
                  </span>
                )}
                {previewTitle && (
                  <p className="text-sm font-bold text-white leading-tight">{previewTitle}</p>
                )}
                {previewBody && (
                  <p className="text-xs text-white/70 leading-snug">{previewBody}</p>
                )}
                {!previewTitle && !previewBody && !previewBadge && (
                  <p className="text-xs text-white/30 italic">No content for {LANG_LABEL[lang]}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Overlay only — original image is not modified.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saveMutation.isPending}>Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {slide ? "Save changes" : "Create slide"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── PlaylistEditor ────────────────────────────────────────────────────────────

interface PlaylistEditorProps {
  playlistId: number;
  initialName: string;
  onBack: () => void;
  allSlides: ShowroomSlide[];
}

function PlaylistEditor({ playlistId, initialName, onBack, allSlides }: PlaylistEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ShowroomPlaylistDetail>({
    queryKey: ["showroom-playlist-detail", playlistId],
    queryFn: () => apiFetch(`/api/admin/showroom/playlists/${playlistId}`),
  });

  const [localItems, setLocalItems] = useState<PlaylistItemFlat[]>([]);
  const [addSlideId, setAddSlideId] = useState<string>("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(initialName);

  useEffect(() => {
    if (data?.items) setLocalItems([...data.items]);
  }, [data]);

  const saveItemsMutation = useMutation({
    mutationFn: (items: PlaylistItemFlat[]) =>
      apiFetch(`/api/admin/showroom/playlists/${playlistId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((it, i) => ({
            slideId: it.slideId,
            position: i + 1,
            durationSeconds: it.durationSeconds,
          })),
        }),
      }),
    onSuccess: (result: ShowroomPlaylistDetail) => {
      setLocalItems(result.items ?? []);
      queryClient.invalidateQueries({ queryKey: ["showroom-playlist-detail", playlistId] });
    },
    onError: () => toast({ title: "Failed to save items", variant: "destructive" }),
  });

  const saveNameMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/api/admin/showroom/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-playlists"] });
      setEditingName(false);
      toast({ title: "Playlist renamed" });
    },
    onError: () => toast({ title: "Failed to rename", variant: "destructive" }),
  });

  const commitItems = (items: PlaylistItemFlat[]) => {
    setLocalItems(items);
    saveItemsMutation.mutate(items);
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...localItems];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    commitItems(next);
  };

  const moveDown = (i: number) => {
    if (i === localItems.length - 1) return;
    const next = [...localItems];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    commitItems(next);
  };

  const removeItem = (i: number) => {
    commitItems(localItems.filter((_, idx) => idx !== i));
  };

  const setDuration = (i: number, val: number) => {
    const sec = Math.max(1, Math.min(120, isNaN(val) ? 8 : val));
    commitItems(localItems.map((it, idx) => (idx === i ? { ...it, durationSeconds: sec } : it)));
  };

  const addSlide = () => {
    const sid = parseInt(addSlideId);
    if (!sid) return;
    const s = allSlides.find((sl) => sl.id === sid);
    if (!s) return;
    const newItem: PlaylistItemFlat = {
      id: Date.now(),
      playlistId,
      slideId: sid,
      position: localItems.length + 1,
      durationSeconds: 8,
      slideTitleEn: s.titleEn,
      slideModelId: s.vehicleModelId,
      slideModelImageUrl: s.modelImageUrl ?? null,
      slideModelName: s.modelName ?? null,
      slideBrandName: s.brandName ?? null,
    };
    setAddSlideId("");
    commitItems([...localItems, newItem]);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const usedIds = new Set(localItems.map((it) => it.slideId));
  const available = allSlides.filter((s) => !usedIds.has(s.id));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack} className="text-muted-foreground flex-shrink-0">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Playlists
        </Button>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                className="h-8 text-sm flex-1"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nameValue.trim()) saveNameMutation.mutate(nameValue.trim());
                  if (e.key === "Escape") setEditingName(false);
                }}
              />
              <Button size="icon" variant="default" className="h-8 w-8"
                disabled={!nameValue.trim() || saveNameMutation.isPending}
                onClick={() => saveNameMutation.mutate(nameValue.trim())}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8"
                onClick={() => setEditingName(false)}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">{nameValue}</span>
              <button
                className="text-muted-foreground hover:text-white transition-colors flex-shrink-0"
                onClick={() => setEditingName(true)}
              >
                <PenLine className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <Button size="sm" variant="outline" disabled className="opacity-40 text-xs flex-shrink-0">
          Start Fullscreen
        </Button>
      </div>

      {/* Item list */}
      <div className="border border-border rounded-xl overflow-hidden">
        {localItems.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">
            No slides in this playlist yet. Add one below.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {localItems.map((item, i) => (
              <div
                key={`${item.slideId}-${i}`}
                className="flex items-center gap-3 px-3 py-2.5 bg-card hover:bg-muted/20 transition-colors"
              >
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    className="text-muted-foreground hover:text-white disabled:opacity-25 transition-colors"
                    onClick={() => moveUp(i)}
                    disabled={i === 0 || saveItemsMutation.isPending}
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-white disabled:opacity-25 transition-colors"
                    onClick={() => moveDown(i)}
                    disabled={i === localItems.length - 1 || saveItemsMutation.isPending}
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                {/* Slide image */}
                {toStorageSrc(item.slideModelImageUrl) ? (
                  <img
                    src={toStorageSrc(item.slideModelImageUrl)}
                    alt={item.slideModelName ?? ""}
                    className="w-14 h-10 object-contain flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-10 flex items-center justify-center bg-muted rounded flex-shrink-0">
                    <Car className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}

                {/* Slide info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {item.slideTitleEn ||
                      (item.slideBrandName && item.slideModelName
                        ? `${item.slideBrandName} ${item.slideModelName}`
                        : `Slide #${item.slideId}`)}
                  </p>
                  {item.slideModelName && (
                    <p className="text-xs text-muted-foreground truncate">
                      {item.slideBrandName ? `${item.slideBrandName} ` : ""}
                      {item.slideModelName}
                    </p>
                  )}
                </div>

                {/* Duration */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    className="w-16 h-7 text-sm text-center"
                    value={item.durationSeconds}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setLocalItems((prev) =>
                        prev.map((it, idx) => (idx === i ? { ...it, durationSeconds: isNaN(val) ? 8 : val } : it))
                      );
                    }}
                    onBlur={(e) => setDuration(i, parseInt(e.target.value))}
                  />
                  <span className="text-xs text-muted-foreground">s</span>
                </div>

                {/* Remove */}
                <button
                  className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                  onClick={() => removeItem(i)}
                  disabled={saveItemsMutation.isPending}
                  aria-label="Remove slide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add slide */}
      {available.length > 0 ? (
        <div className="flex items-center gap-2">
          <Select value={addSlideId} onValueChange={setAddSlideId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Pick a slide to add…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((s) => (
                <SelectItem key={s.id} value={s.id.toString()}>
                  {s.titleEn ||
                    (s.brandName && s.modelName
                      ? `${s.brandName} ${s.modelName}`
                      : `Slide #${s.id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!addSlideId || saveItemsMutation.isPending}
            onClick={addSlide}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
      ) : allSlides.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center">
          No slides exist yet. Create slides in the Slides tab first.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground text-center">
          All slides are already in this playlist.
        </p>
      )}
    </div>
  );
}

// ─── CompareTray ──────────────────────────────────────────────────────────────

interface CompareTrayProps {
  list: VehicleModel[];
  onRemove: (id: number) => void;
  onOpenCompare: () => void;
  onClear: () => void;
}

function CompareTray({ list, onRemove, onOpenCompare, onClear }: CompareTrayProps) {
  if (list.length === 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 border-t border-border backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-4">
        <Scale className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
          {list.map((m) => (
            <div key={m.id} className="relative flex-shrink-0">
              {toStorageSrc(m.imageUrl) ? (
                <img
                  src={toStorageSrc(m.imageUrl)}
                  alt={m.name}
                  className="h-10 w-16 object-contain"
                />
              ) : (
                <div className="h-10 w-16 flex items-center justify-center bg-muted rounded">
                  <Car className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <button
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-700 hover:bg-destructive flex items-center justify-center transition-colors"
                onClick={() => onRemove(m.id)}
                aria-label={`Remove ${m.name}`}
              >
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            </div>
          ))}
          <span className="text-sm text-muted-foreground flex-shrink-0 ml-1">
            {list.length} vehicle{list.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onClear}>
            Clear
          </Button>
          <Button size="sm" onClick={onOpenCompare} disabled={list.length < 2}>
            Compare
            {list.length < 2 && (
              <span className="text-xs ml-1 opacity-50">(need 2+)</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── CompareModal ─────────────────────────────────────────────────────────────

interface CompareModalProps {
  open: boolean;
  onClose: () => void;
  list: VehicleModel[];
  onRemove: (id: number) => void;
  priceMap: Map<number, ShowroomPrice>;
  eurRate: number;
  slideMap: Map<number, ShowroomSlide>;
}

function CompareModal({ open, onClose, list, onRemove, priceMap, eurRate, slideMap }: CompareModalProps) {
  const [eurMode, setEurMode] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 overflow-y-auto">
      {/* Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-white">Compare Vehicles</h2>
          <span className="text-sm text-white/30">{list.length} selected</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white/10 rounded-lg p-0.5">
            <button
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${!eurMode ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
              onClick={() => setEurMode(false)}
            >USD</button>
            <button
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${eurMode ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
              onClick={() => setEurMode(true)}
            >EUR</button>
          </div>
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Vehicle columns */}
      <div className="flex-1 flex items-start justify-center gap-4 p-6 flex-wrap">
        {list.map((model) => {
          const price = priceMap.get(model.id);
          const usd = price?.priceUsd ? parseFloat(price.priceUsd) : null;
          const slide = slideMap.get(model.id);

          return (
            <div
              key={model.id}
              className="relative bg-zinc-900 border border-white/10 rounded-2xl p-5 flex flex-col items-center gap-3 w-52 flex-shrink-0"
            >
              <button
                className="absolute top-3 right-3 text-white/25 hover:text-white/70 transition-colors"
                onClick={() => onRemove(model.id)}
                aria-label={`Remove ${model.name}`}
              >
                <X className="w-4 h-4" />
              </button>

              {toStorageSrc(model.imageUrl) ? (
                <img
                  src={toStorageSrc(model.imageUrl)}
                  alt={model.name}
                  className="w-full h-32 object-contain"
                />
              ) : (
                <div className="w-full h-32 flex items-center justify-center bg-white/5 rounded-xl">
                  <Car className="w-10 h-10 text-white/20" />
                </div>
              )}

              <div className="text-center space-y-0.5 w-full">
                {model.brandName && (
                  <p className="text-xs text-white/35 uppercase tracking-widest">{model.brandName}</p>
                )}
                <p className="text-base font-bold text-white leading-snug">{model.name}</p>
                {model.category && (
                  <p className="text-xs text-white/35">{model.category}</p>
                )}
              </div>

              {usd !== null ? (
                <p className="text-lg font-bold text-primary">{fmtPrice(usd, eurMode, eurRate)}</p>
              ) : (
                <p className="text-xs text-white/20 italic">No showroom price</p>
              )}

              {slide?.badgeEn && (
                <span className="inline-block px-2 py-0.5 bg-primary/20 border border-primary/40 text-primary text-xs font-semibold rounded-full text-center">
                  {slide.badgeEn}
                </span>
              )}
              {slide?.bodyEn && (
                <p className="text-xs text-white/45 text-center leading-snug">{slide.bodyEn}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── VehiclesTab ──────────────────────────────────────────────────────────────

interface VehiclesTabProps {
  priceMap: Map<number, ShowroomPrice>;
  eurRate: number;
  slideMap: Map<number, ShowroomSlide>;
  compareList: VehicleModel[];
  onAddToCompare: (m: VehicleModel) => void;
  onOpenCarousel: (cat: string, idx: number) => void;
}

function VehiclesTab({
  priceMap, eurRate, slideMap, compareList, onAddToCompare, onOpenCarousel,
}: VehiclesTabProps) {
  const { data: models, isLoading, error } = useQuery<VehicleModel[]>({
    queryKey: ["showroom-vehicle-models"],
    queryFn: () => apiFetch("/api/admin/fleet/models"),
  });

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCat = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
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
    <div className="space-y-6">
      {categories.map((cat) => {
        const catModels = grouped[cat];
        const isOpen = !collapsed.has(cat);

        return (
          <div key={cat}>
            {/* Category header — collapsible */}
            <button
              className="w-full flex items-center gap-2 text-left mb-3 group"
              onClick={() => toggleCat(cat)}
            >
              <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-white transition-colors">
                {cat}
              </span>
              <span className="text-xs text-muted-foreground/50">({catModels.length})</span>
              <div className="flex-1 h-px bg-border" />
              {isOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors flex-shrink-0" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-white transition-colors flex-shrink-0" />
              }
            </button>

            {/* Vehicle cards */}
            {isOpen && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {catModels.map((model, idx) => {
                  const inCompare = compareList.some((c) => c.id === model.id);
                  return (
                    <button
                      key={model.id}
                      className={`bg-card border rounded-xl p-3 flex flex-col items-center gap-2 transition-all cursor-pointer text-left hover:shadow-md hover:shadow-black/30 ${
                        inCompare
                          ? "border-primary/50 ring-1 ring-primary/25"
                          : "border-border hover:border-primary/40"
                      }`}
                      onClick={() => onOpenCarousel(cat, idx)}
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
                      <div className="text-center w-full">
                        {model.brandName && (
                          <p className="text-xs text-muted-foreground leading-none mb-0.5 truncate">
                            {model.brandName}
                          </p>
                        )}
                        <p className="text-sm font-medium text-white leading-snug truncate">{model.name}</p>
                      </div>
                      {inCompare && (
                        <span className="text-xs text-primary font-medium">In compare</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {categories.length === 0 && (
        <div className="text-center text-muted-foreground py-16 text-sm">
          No active vehicle models found.
        </div>
      )}
    </div>
  );
}

// ─── SlidesTab ────────────────────────────────────────────────────────────────

interface SlidesTabProps {
  slides: ShowroomSlide[];
  isLoading: boolean;
  error: Error | null;
  vehicleModels: VehicleModel[];
}

function SlidesTab({ slides, isLoading, error, vehicleModels }: SlidesTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<ShowroomSlide | null>(null);

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
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {slides.length} slide{slides.length !== 1 ? "s" : ""}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditingSlide(null); setEditorOpen(true); }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Slide
          </Button>
        </div>

        {slides.length > 0 ? (
          <div className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {slides.map((slide) => (
              <div
                key={slide.id}
                className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
              >
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
                    {slide.titleEn ||
                      (slide.brandName && slide.modelName
                        ? `${slide.brandName} ${slide.modelName}`
                        : `Slide #${slide.id}`)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {slide.badgeEn && (
                      <Badge variant="outline" className="text-xs">{slide.badgeEn}</Badge>
                    )}
                    {slide.titleHe && (
                      <span className="text-xs text-muted-foreground border border-border rounded px-1">HE</span>
                    )}
                    {slide.titleAr && (
                      <span className="text-xs text-muted-foreground border border-border rounded px-1">AR</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {slide.active ? (
                    <Badge variant="default" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7 text-muted-foreground hover:text-white"
                    onClick={() => { setEditingSlide(slide); setEditorOpen(true); }}
                  >
                    <PenLine className="w-3.5 h-3.5" />
                  </Button>
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
            No slides yet. Create your first slide above.
          </div>
        )}
      </div>

      <SlideEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        slide={editingSlide}
        vehicleModels={vehicleModels}
      />
    </>
  );
}

// ─── PlaylistsTab ─────────────────────────────────────────────────────────────

interface PlaylistsTabProps {
  allSlides: ShowroomSlide[];
}

function PlaylistsTab({ allSlides }: PlaylistsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

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

  if (editingId !== null) {
    return (
      <PlaylistEditor
        playlistId={editingId}
        initialName={editingName}
        onBack={() => setEditingId(null)}
        allSlides={allSlides}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {playlists?.length ?? 0} playlist{playlists?.length !== 1 ? "s" : ""}
        </p>
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
            <div
              key={pl.id}
              className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
            >
              <ListVideo className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{pl.name}</p>
              </div>
              {pl.active ? (
                <Badge variant="default" className="text-xs bg-green-500/20 text-green-400 border-green-500/30">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-white h-7 px-2"
                onClick={() => { setEditingId(pl.id); setEditingName(pl.name); }}
              >
                <PenLine className="w-3.5 h-3.5 mr-1" />
                Edit
              </Button>
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

// ─── PricesTab ────────────────────────────────────────────────────────────────

function PricesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingRate, setEditingRate] = useState(false);
  const [rateValue, setRateValue] = useState("");

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
      {/* Exchange rate row */}
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
            <Button
              size="icon"
              variant="default"
              className="h-8 w-8"
              disabled={!rateValue || saveRateMutation.isPending}
              onClick={() => saveRateMutation.mutate(rateValue)}
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setEditingRate(false)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-medium text-white">{eurRate.toFixed(6)}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => { setRateValue(settings?.usdToEurRate ?? "0.920000"); setEditingRate(true); }}
            >
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
          const eur = usd !== null ? Math.round(usd * eurRate) : null;
          const isEditing = editingId === model.id;

          return (
            <div
              key={model.id}
              className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
            >
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
                  <Button
                    size="icon"
                    variant="default"
                    className="h-8 w-8"
                    disabled={saveMutation.isPending}
                    onClick={() => saveMutation.mutate({ modelId: model.id, priceUsd: editValue || null })}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-shrink-0">
                  {usd !== null ? (
                    <div className="text-right">
                      <p className="text-sm font-semibold text-white">${usd.toFixed(0)}</p>
                      {eur !== null && (
                        <p className="text-xs text-muted-foreground">≈ €{eur}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">No price</span>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => {
                      setEditingId(model.id);
                      setEditValue(price?.priceUsd ?? "");
                    }}
                  >
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

interface CarouselState {
  cat: string;
  catModels: VehicleModel[];
  index: number;
}

interface SlideEditorFromCarousel {
  open: boolean;
  slide: ShowroomSlide | null;
  defaultModelId: number | null;
}

export default function Showroom() {
  // ── Shared data ──────────────────────────────────────────────────────────────
  const { data: models } = useQuery<VehicleModel[]>({
    queryKey: ["showroom-vehicle-models"],
    queryFn: () => apiFetch("/api/admin/fleet/models"),
  });

  const { data: prices } = useQuery<ShowroomPrice[]>({
    queryKey: ["showroom-prices"],
    queryFn: () => apiFetch("/api/admin/showroom/prices"),
  });

  const { data: settings } = useQuery<ShowroomSettings>({
    queryKey: ["showroom-settings"],
    queryFn: () => apiFetch("/api/admin/showroom/settings"),
  });

  const {
    data: slides = [],
    isLoading: slidesLoading,
    error: slidesError,
  } = useQuery<ShowroomSlide[]>({
    queryKey: ["showroom-slides"],
    queryFn: () => apiFetch("/api/admin/showroom/slides"),
  });

  // ── Computed maps ─────────────────────────────────────────────────────────────
  const priceMap = useMemo(
    () => new Map((prices ?? []).map((p) => [p.vehicleModelId, p])),
    [prices],
  );

  const slideMap = useMemo(
    () =>
      new Map(
        slides
          .filter((s) => s.vehicleModelId !== null)
          .map((s) => [s.vehicleModelId as number, s]),
      ),
    [slides],
  );

  const eurRate = parseFloat(settings?.usdToEurRate ?? "0.92");
  const activeModels = useMemo(
    () => (models ?? []).filter((m) => m.active),
    [models],
  );

  // ── Compare state ─────────────────────────────────────────────────────────────
  const [compareList, setCompareList] = useState<VehicleModel[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const addToCompare = (m: VehicleModel) => {
    setCompareList((prev) => {
      if (prev.some((c) => c.id === m.id) || prev.length >= 4) return prev;
      return [...prev, m];
    });
  };

  const removeFromCompare = (id: number) =>
    setCompareList((prev) => prev.filter((c) => c.id !== id));

  // ── Carousel state ────────────────────────────────────────────────────────────
  const [carousel, setCarousel] = useState<CarouselState | null>(null);

  const openCarousel = (cat: string, idx: number) => {
    const grouped = activeModels.reduce<Record<string, VehicleModel[]>>((acc, m) => {
      const c = m.category ?? "Other";
      if (!acc[c]) acc[c] = [];
      acc[c].push(m);
      return acc;
    }, {});
    const catModels = grouped[cat] ?? [];
    setCarousel({ cat, catModels, index: idx });
  };

  // ── Slide editor (opened from carousel) ───────────────────────────────────────
  const [carouselSlideEditor, setCarouselSlideEditor] = useState<SlideEditorFromCarousel>({
    open: false,
    slide: null,
    defaultModelId: null,
  });

  const openSlideEditorFromCarousel = (model: VehicleModel, slide: ShowroomSlide | null) => {
    setCarousel(null);
    setCarouselSlideEditor({ open: true, slide, defaultModelId: model.id });
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
          <Monitor className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white leading-none">Digital Showroom</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vehicle presentation · Sales tool</p>
        </div>
      </div>

      <Tabs defaultValue="vehicles">
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex">
          <TabsTrigger value="vehicles" className="flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vehicles</span>
          </TabsTrigger>
          <TabsTrigger value="slides" className="flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Slides</span>
          </TabsTrigger>
          <TabsTrigger value="playlists" className="flex items-center gap-1.5">
            <ListVideo className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Playlists</span>
          </TabsTrigger>
          <TabsTrigger value="prices" className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Prices</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles" className="mt-6">
          <VehiclesTab
            priceMap={priceMap}
            eurRate={eurRate}
            slideMap={slideMap}
            compareList={compareList}
            onAddToCompare={addToCompare}
            onOpenCarousel={openCarousel}
          />
        </TabsContent>

        <TabsContent value="slides" className="mt-6">
          <SlidesTab
            slides={slides}
            isLoading={slidesLoading}
            error={slidesError as Error | null}
            vehicleModels={activeModels}
          />
        </TabsContent>

        <TabsContent value="playlists" className="mt-6">
          <PlaylistsTab allSlides={slides} />
        </TabsContent>

        <TabsContent value="prices" className="mt-6">
          <PricesTab />
        </TabsContent>
      </Tabs>

      {/* ── Carousel modal ───────────────────────────────────────────────────────── */}
      {carousel && (
        <CarouselModal
          open={true}
          onClose={() => setCarousel(null)}
          catModels={carousel.catModels}
          index={carousel.index}
          onIndexChange={(i) => setCarousel((prev) => prev ? { ...prev, index: i } : null)}
          priceMap={priceMap}
          eurRate={eurRate}
          slideMap={slideMap}
          compareList={compareList}
          onAddToCompare={(m) => { addToCompare(m); }}
          onEditSlide={openSlideEditorFromCarousel}
        />
      )}

      {/* ── Slide editor (from carousel) ─────────────────────────────────────────── */}
      <SlideEditorModal
        open={carouselSlideEditor.open}
        onClose={() => setCarouselSlideEditor({ open: false, slide: null, defaultModelId: null })}
        slide={carouselSlideEditor.slide}
        defaultModelId={carouselSlideEditor.defaultModelId}
        vehicleModels={activeModels}
      />

      {/* ── Compare tray ─────────────────────────────────────────────────────────── */}
      <CompareTray
        list={compareList}
        onRemove={removeFromCompare}
        onOpenCompare={() => setCompareOpen(true)}
        onClear={() => setCompareList([])}
      />

      {/* ── Compare modal ─────────────────────────────────────────────────────────── */}
      <CompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        list={compareList}
        onRemove={(id) => {
          removeFromCompare(id);
          if (compareList.length <= 1) setCompareOpen(false);
        }}
        priceMap={priceMap}
        eurRate={eurRate}
        slideMap={slideMap}
      />
    </div>
  );
}
