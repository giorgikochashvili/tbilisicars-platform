import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Monitor, ListVideo, DollarSign, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, Car, PenLine, Trash2, Plus, Check, X, ArrowLeft, Scale,
  Maximize2, Minimize2, Play, Eye, EyeOff, Settings2,
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

function getSlideText(
  slide: ShowroomSlide,
  lang: SlideshowLang,
  field: "title" | "body" | "badge",
): string | null {
  const cap = lang === "en" ? "En" : lang === "he" ? "He" : "Ar";
  const key = `${field}${cap}` as keyof ShowroomSlide;
  const val = slide[key] as string | null | undefined;
  if (val) return val;
  const fallbackKey = `${field}En` as keyof ShowroomSlide;
  return (slide[fallbackKey] as string | null | undefined) ?? null;
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

type SlideshowLang = "en" | "he" | "ar";
type SlideshowCurrency = "usd" | "eur";

interface SlideshowSettings {
  lang: SlideshowLang;
  currency: SlideshowCurrency;
  showPrice: boolean;
}

interface ShowroomModelSetting {
  id: number;
  vehicleModelId: number;
  visible: boolean;
  sortOrder: number;
  modelName: string | null;
  modelImageUrl: string | null;
  brandName: string | null;
  category: string | null;
  fleetActive: boolean | null;
}

const CATEGORY_SORT_PRIORITY: Record<string, number> = {
  "Economy":           1,
  "Intermediate":      2,
  "Standard":          3,
  "Full-Size":         4,
  "Crossover":         5,
  "Intermediate SUV":  6,
  "Full-Size SUV":     7,
  "Premium SUV":       8,
  "Business Class":    9,
  "7 Seater SUV":      10,
  "Off-Road":          11,
  "Sports":            12,
  "Convertible":       13,
  "Special":           14,
};

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
  const [fullscreen, setFullscreen] = useState(false);

  const total = catModels.length;
  const prev = () => onIndexChange((index - 1 + total) % total);
  const next = () => onIndexChange((index + 1) % total);

  useEffect(() => {
    if (open) setFullscreen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") {
        if (fullscreen) setFullscreen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, index, total, fullscreen]);

  if (!open || !catModels[index]) return null;
  const model = catModels[index];

  const price = priceMap.get(model.id);
  const usd = price?.priceUsd ? parseFloat(price.priceUsd) : null;
  const slide = slideMap.get(model.id);
  const inCompare = compareList.some((c) => c.id === model.id);
  const compareFull = !inCompare && compareList.length >= 4;

  // ── Fullscreen presentation mode ──────────────────────────────────────────
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-[#07101e] overflow-hidden">
        {/* Exit fullscreen — z-30, always above everything */}
        <button
          className="absolute top-4 left-4 z-30 flex items-center gap-1.5 text-white/30 hover:text-white transition-colors text-xs"
          onClick={() => setFullscreen(false)}
        >
          <Minimize2 className="w-4 h-4" />
          <span>Exit</span>
        </button>

        {/* Image layer — fills entire screen, behind info panel */}
        <div
          className="absolute inset-0 flex items-center justify-center px-20 py-24"
          style={{ background: "radial-gradient(ellipse 60% 50% at 50% 45%, #0e2a4a 0%, #07101e 100%)" }}
        >
          {toStorageSrc(model.imageUrl) ? (
            <img
              src={toStorageSrc(model.imageUrl)}
              alt={model.name}
              className="max-h-full max-w-full object-contain drop-shadow-2xl"
            />
          ) : (
            <div className="flex items-center justify-center bg-white/5 rounded-3xl w-64 h-64">
              <Car className="w-24 h-24 text-white/10" />
            </div>
          )}
        </div>

        {/* Prev / Next — z-20, above image */}
        {total > 1 && (
          <button
            className="absolute z-20 left-4 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-all"
            onClick={prev}
            aria-label="Previous vehicle"
          >
            <ChevronLeft className="w-9 h-9" />
          </button>
        )}
        {total > 1 && (
          <button
            className="absolute z-20 right-4 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-all"
            onClick={next}
            aria-label="Next vehicle"
          >
            <ChevronRight className="w-9 h-9" />
          </button>
        )}

        {/* Info panel — z-10 overlay, bottom-anchored, never behind image */}
        <div className="absolute bottom-0 inset-x-0 z-10 flex items-end justify-between px-10 pb-8 pt-20 gap-6 bg-gradient-to-t from-[#07101e] via-[#07101e]/60 to-transparent">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              {model.brandName && (
                <span className="text-xs text-white/40 uppercase tracking-widest">{model.brandName}</span>
              )}
              {model.category && (
                <span className="text-xs text-white/25">· {model.category}</span>
              )}
            </div>
            <h2 className="text-4xl font-bold text-white">{model.name}</h2>
            {slide?.badgeEn && (
              <span className="inline-block px-3 py-0.5 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs font-semibold uppercase tracking-wider">
                {slide.badgeEn}
              </span>
            )}
            {slide?.bodyEn && (
              <p className="text-base text-white/55 max-w-lg leading-relaxed">{slide.bodyEn}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {usd !== null ? (
              <>
                <span className="text-3xl font-bold text-white">{fmtPrice(usd, eurMode, eurRate)}</span>
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
              </>
            ) : null}
            {total > 1 && (
              <p className="text-xs text-white/20">{index + 1} / {total}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Normal carousel (admin view) ────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-[#07101e] overflow-hidden">
      {/* Top bar — z-20, always above image */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-6 pt-5 pb-6 bg-gradient-to-b from-black/80 to-transparent">
        <button
          className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors text-xs"
          onClick={() => setFullscreen(true)}
          title="Enter fullscreen presentation"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="hidden sm:inline">Present</span>
        </button>
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image layer — fills entire screen, behind all overlays */}
      <div
        className="absolute inset-0 flex items-center justify-center px-20 py-8"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 45%, #0e2a4a 0%, #07101e 100%)" }}
      >
        {toStorageSrc(model.imageUrl) ? (
          <img
            src={toStorageSrc(model.imageUrl)}
            alt={model.name}
            className="max-h-full max-w-full object-contain drop-shadow-2xl"
          />
        ) : (
          <div className="flex items-center justify-center bg-white/5 rounded-3xl w-56 h-56">
            <Car className="w-20 h-20 text-white/20" />
          </div>
        )}
      </div>

      {/* Prev / Next — z-20, above image */}
      {total > 1 && (
        <button
          className="absolute z-20 left-4 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          onClick={prev}
          aria-label="Previous vehicle"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}
      {total > 1 && (
        <button
          className="absolute z-20 right-4 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          onClick={next}
          aria-label="Next vehicle"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}

      {/* Info panel — z-10, bottom overlay, always in front of image */}
      <div className="absolute bottom-0 inset-x-0 z-10 flex justify-center px-8 pb-6 pt-20 bg-gradient-to-t from-[#07101e] via-[#07101e]/60 to-transparent">
        <div className="w-full max-w-lg flex flex-col items-center gap-3">
          {/* Name + category */}
          <div className="text-center">
            {model.brandName && (
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1">{model.brandName}</p>
            )}
            <h2 className="text-2xl font-bold text-white">{model.name}</h2>
            {model.category && (
              <p className="text-sm text-white/35 mt-0.5">{model.category}</p>
            )}
          </div>

          {/* Slide badge/body */}
          {(slide?.badgeEn || slide?.bodyEn) && (
            <div className="text-center space-y-1">
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

          {/* Price + currency */}
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

          {/* Actions */}
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

          {total > 1 && (
            <p className="text-xs text-white/20">{index + 1} / {total}</p>
          )}
        </div>
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

            {/* Active */}
            <div className="flex items-center gap-2">
              <Switch
                id="slide-active"
                checked={form.active}
                onCheckedChange={(v) => set("active", v)}
              />
              <Label htmlFor="slide-active">Active</Label>
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

// ─── LaunchSettingsModal ───────────────────────────────────────────────────────

interface LaunchSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onLaunch: (settings: SlideshowSettings) => void;
  hasItems: boolean;
}

function LaunchSettingsModal({ open, onClose, onLaunch, hasItems }: LaunchSettingsModalProps) {
  const [lang, setLang] = useState<SlideshowLang>("en");
  const [currency, setCurrency] = useState<SlideshowCurrency>("usd");
  const [showPrice, setShowPrice] = useState(true);

  const langOptions: { value: SlideshowLang; label: string }[] = [
    { value: "en", label: "English" },
    { value: "he", label: "Hebrew" },
    { value: "ar", label: "Arabic" },
  ];
  const currencyOptions: { value: SlideshowCurrency; label: string }[] = [
    { value: "usd", label: "USD $" },
    { value: "eur", label: "EUR €" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Launch Slideshow</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Language</Label>
            <div className="flex gap-2">
              {langOptions.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setLang(value)}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    lang === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-white hover:border-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Currency</Label>
            <div className="flex gap-2">
              {currencyOptions.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setCurrency(value)}
                  className={`flex-1 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                    currency === value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-white hover:border-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Show Price</Label>
            <Switch checked={showPrice} onCheckedChange={setShowPrice} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!hasItems}
            onClick={() => onLaunch({ lang, currency, showPrice })}
          >
            <Play className="w-3.5 h-3.5 mr-1.5" />
            Start Slideshow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SlideshowPlayer ──────────────────────────────────────────────────────────

const SLIDESHOW_RTL: SlideshowLang[] = ["he", "ar"];

interface SlideshowPlayerProps {
  playlistId: number;
  settings: SlideshowSettings;
  slideIdMap: Map<number, ShowroomSlide>;
  priceMap: Map<number, ShowroomPrice>;
  eurRate: number;
  onClose: () => void;
}

function SlideshowPlayer({
  playlistId,
  settings,
  slideIdMap,
  priceMap,
  eurRate,
  onClose,
}: SlideshowPlayerProps) {
  const { data, isLoading } = useQuery<ShowroomPlaylistDetail>({
    queryKey: ["showroom-playlist-detail", playlistId],
    queryFn: () => apiFetch(`/api/admin/showroom/playlists/${playlistId}`),
  });

  const items = data?.items ?? [];

  const resolvedItems = useMemo(() => {
    return items
      .map((item) => ({
        item,
        slide: item.slideId != null ? slideIdMap.get(item.slideId) : undefined,
      }))
      .filter((r): r is { item: PlaylistItemFlat; slide: ShowroomSlide } =>
        r.slide != null,
      );
  }, [items, slideIdMap]);

  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRTL = SLIDESHOW_RTL.includes(settings.lang);

  const goTo = useCallback(
    (nextIdx: number) => {
      if (resolvedItems.length === 0) return;
      setVisible(false);
      setTimeout(() => {
        setIdx(nextIdx);
        setVisible(true);
      }, 280);
    },
    [resolvedItems.length],
  );

  useEffect(() => {
    if (resolvedItems.length === 0) return;
    const current = resolvedItems[idx];
    if (!current) return;
    const ms = (current.item.durationSeconds ?? 8) * 1000;
    timerRef.current = setTimeout(() => {
      goTo((idx + 1) % resolvedItems.length);
    }, ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [idx, resolvedItems, goTo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (resolvedItems.length === 0) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (timerRef.current) clearTimeout(timerRef.current);
        goTo((idx + 1) % resolvedItems.length);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (timerRef.current) clearTimeout(timerRef.current);
        goTo((idx - 1 + resolvedItems.length) % resolvedItems.length);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [idx, resolvedItems, goTo, onClose]);

  useEffect(() => {
    if (resolvedItems.length > 0 && idx >= resolvedItems.length) {
      setIdx(0);
    }
  }, [resolvedItems.length, idx]);

  const current = resolvedItems[idx];
  const slide = current?.slide;
  const item = current?.item;

  const title = slide ? getSlideText(slide, settings.lang, "title") : null;
  const body = slide ? getSlideText(slide, settings.lang, "body") : null;
  const badge = slide ? getSlideText(slide, settings.lang, "badge") : null;
  const imgSrc = toStorageSrc(item?.slideModelImageUrl ?? slide?.modelImageUrl);

  let priceStr: string | null = null;
  if (settings.showPrice && item?.slideModelId != null) {
    const entry = priceMap.get(item.slideModelId);
    if (entry?.priceUsd && entry.active) {
      priceStr = fmtPrice(parseFloat(entry.priceUsd), settings.currency === "eur", eurRate);
    }
  }

  const prev = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    goTo((idx - 1 + resolvedItems.length) % resolvedItems.length);
  };
  const next = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    goTo((idx + 1) % resolvedItems.length);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-[#07101e] flex items-center justify-center select-none overflow-hidden">
      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center gap-3 text-white/40">
          <Loader2 className="w-10 h-10 animate-spin" />
          <p className="text-sm tracking-wide">Loading playlist…</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && resolvedItems.length === 0 && (
        <div className="flex flex-col items-center gap-3 text-white/30">
          <Car className="w-20 h-20" />
          <p className="text-sm tracking-wide">No slides to display</p>
        </div>
      )}

      {/* Slide content */}
      {!isLoading && slide && (
        <div
          className={`absolute inset-0 transition-opacity duration-[280ms] ease-in-out ${visible ? "opacity-100" : "opacity-0"}`}
          dir={isRTL ? "rtl" : "ltr"}
        >
          {/* Vehicle image — fills most of the screen */}
          {imgSrc ? (
            <img
              src={imgSrc}
              alt={slide.modelName ?? ""}
              className="absolute inset-0 w-full h-full object-contain px-8 pt-8 pb-48 sm:px-20 sm:pt-12 sm:pb-56"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center pb-40">
              <Car className="w-40 h-40 text-white/8" />
            </div>
          )}

          {/* Bottom gradient */}
          <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#07101e] via-[#07101e]/80 to-transparent pointer-events-none" />

          {/* Text panel */}
          <div
            className={`absolute bottom-0 inset-x-0 px-8 pb-12 sm:px-16 sm:pb-16 space-y-3 ${isRTL ? "text-right" : "text-left"}`}
          >
            {badge && (
              <div>
                <span className="inline-block px-4 py-1 bg-primary/90 text-white text-sm font-semibold rounded-full tracking-wide shadow-lg">
                  {badge}
                </span>
              </div>
            )}
            {title && (
              <h2 className="text-4xl sm:text-6xl font-bold text-white leading-tight tracking-tight drop-shadow-2xl">
                {title}
              </h2>
            )}
            {body && (
              <p className="text-lg sm:text-2xl text-white/65 leading-relaxed max-w-3xl drop-shadow">
                {body}
              </p>
            )}
            {priceStr && (
              <div className="inline-block mt-1 px-5 py-2.5 bg-white/8 backdrop-blur-md border border-white/15 rounded-2xl shadow-xl">
                <span className="text-2xl sm:text-3xl font-bold text-white tracking-wide">
                  {priceStr}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Exit button */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-[61] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/50 hover:text-white text-xs font-medium transition-colors backdrop-blur-sm border border-white/10"
      >
        <X className="w-3.5 h-3.5" />
        Exit
      </button>

      {/* Slide counter */}
      {resolvedItems.length > 1 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[61] px-3 py-1 rounded-full bg-white/8 text-white/40 text-xs backdrop-blur-sm border border-white/10">
          {idx + 1} / {resolvedItems.length}
        </div>
      )}

      {/* Prev / Next */}
      {resolvedItems.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-[61] w-11 h-11 flex items-center justify-center rounded-full bg-white/8 hover:bg-white/18 text-white/50 hover:text-white transition-colors backdrop-blur-sm border border-white/10"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-[61] w-11 h-11 flex items-center justify-center rounded-full bg-white/8 hover:bg-white/18 text-white/50 hover:text-white transition-colors backdrop-blur-sm border border-white/10"
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Progress bar */}
      {resolvedItems.length > 1 && (
        <div className="absolute bottom-0 inset-x-0 z-[61] h-[2px] bg-white/8">
          <div
            className="h-full bg-primary/70 transition-none"
            style={{ width: `${((idx + 1) / resolvedItems.length) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ─── PlaylistEditor ────────────────────────────────────────────────────────────

interface PlaylistEditorProps {
  playlistId: number;
  initialName: string;
  onBack: () => void;
  allSlides: ShowroomSlide[];
  onStartSlideshow?: (playlistId: number) => void;
}

function PlaylistEditor({ playlistId, initialName, onBack, allSlides, onStartSlideshow }: PlaylistEditorProps) {
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
        <Button
          size="sm"
          variant="outline"
          className="text-xs flex-shrink-0"
          disabled={localItems.length === 0}
          onClick={() => onStartSlideshow?.(playlistId)}
        >
          <Play className="w-3 h-3 mr-1" />
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
    <div className="fixed bottom-5 right-5 z-40 bg-zinc-950/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl shadow-black/60 px-3 py-2.5 flex flex-col gap-2 max-w-xs">
      {/* Thumbnails row */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <Scale className="w-3.5 h-3.5 text-white/30 flex-shrink-0" />
        {list.map((m) => (
          <div key={m.id} className="relative flex-shrink-0">
            {toStorageSrc(m.imageUrl) ? (
              <img
                src={toStorageSrc(m.imageUrl)}
                alt={m.name}
                className="h-9 w-14 object-contain"
              />
            ) : (
              <div className="h-9 w-14 flex items-center justify-center bg-white/5 rounded">
                <Car className="w-3.5 h-3.5 text-white/20" />
              </div>
            )}
            <button
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-zinc-700 hover:bg-destructive flex items-center justify-center transition-colors"
              onClick={() => onRemove(m.id)}
              aria-label={`Remove ${m.name}`}
            >
              <X className="w-2 h-2 text-white" />
            </button>
          </div>
        ))}
      </div>
      {/* Actions row */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-white/30 flex-1">{list.length} of 4</span>
        <button
          className="text-xs text-white/35 hover:text-white/70 transition-colors px-1.5 py-0.5"
          onClick={onClear}
        >
          Clear
        </button>
        <Button
          size="sm"
          className="h-7 text-xs px-3"
          onClick={onOpenCompare}
          disabled={list.length < 2}
        >
          Compare
        </Button>
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
  const [viewMode, setViewMode] = useState<"carousel" | "grid">("carousel");
  const [carouselIdx, setCarouselIdx] = useState(0);

  const safeIdx = Math.min(carouselIdx, Math.max(0, list.length - 1));
  const prevCompare = () => setCarouselIdx((i) => (i - 1 + list.length) % list.length);
  const nextCompare = () => setCarouselIdx((i) => (i + 1) % list.length);

  useEffect(() => {
    if (open) { setCarouselIdx(0); setViewMode("carousel"); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (viewMode === "carousel") {
        if (e.key === "ArrowLeft") prevCompare();
        else if (e.key === "ArrowRight") nextCompare();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, viewMode, list.length]);

  if (!open || list.length === 0) return null;

  const carouselModel = list[safeIdx];
  const carouselPrice = priceMap.get(carouselModel?.id ?? -1);
  const carouselUsd = carouselPrice?.priceUsd ? parseFloat(carouselPrice.priceUsd) : null;
  const carouselSlide = carouselModel ? slideMap.get(carouselModel.id) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#07101e]">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Scale className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-white">Compare</h2>
          <span className="text-sm text-white/30">{list.length} vehicles</span>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode */}
          <div className="flex items-center bg-white/10 rounded-lg p-0.5">
            <button
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${viewMode === "carousel" ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
              onClick={() => setViewMode("carousel")}
            >Carousel</button>
            <button
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${viewMode === "grid" ? "bg-white text-black" : "text-white/50 hover:text-white"}`}
              onClick={() => setViewMode("grid")}
            >Grid</button>
          </div>
          {/* Currency */}
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
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Carousel mode ──────────────────────────────────────────────────────── */}
      {viewMode === "carousel" ? (
        <div className="flex-1 relative overflow-hidden">
          {/* Image layer — fills the whole content area, behind overlays */}
          <div
            className="absolute inset-0 flex items-center justify-center px-20 py-8"
            style={{ background: "radial-gradient(ellipse 60% 50% at 50% 45%, #0e2a4a 0%, #07101e 100%)" }}
          >
            {toStorageSrc(carouselModel?.imageUrl) ? (
              <img
                src={toStorageSrc(carouselModel?.imageUrl)}
                alt={carouselModel?.name}
                className="max-h-full max-w-full object-contain drop-shadow-2xl"
              />
            ) : (
              <div className="flex items-center justify-center bg-white/5 rounded-3xl w-56 h-56">
                <Car className="w-20 h-20 text-white/20" />
              </div>
            )}
          </div>

          {/* Prev / Next — z-20, always above image */}
          {list.length > 1 && (
            <>
              <button
                className="absolute z-20 left-4 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                onClick={prevCompare}
                aria-label="Previous vehicle"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              <button
                className="absolute z-20 right-4 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                onClick={nextCompare}
                aria-label="Next vehicle"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </>
          )}

          {/* Info panel — z-10, bottom overlay, always in front of image */}
          <div className="absolute bottom-0 inset-x-0 z-10 flex justify-center px-6 pb-6 pt-16 bg-gradient-to-t from-[#07101e] via-[#07101e]/60 to-transparent">
            <div className="w-full max-w-lg flex flex-col items-center gap-3">
              <div className="text-center">
                {carouselModel?.brandName && (
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-0.5">{carouselModel.brandName}</p>
                )}
                <h2 className="text-2xl font-bold text-white">{carouselModel?.name}</h2>
                {carouselModel?.category && (
                  <p className="text-sm text-white/35 mt-0.5">{carouselModel.category}</p>
                )}
              </div>
              {carouselSlide?.badgeEn && (
                <span className="inline-block px-3 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary text-xs font-semibold uppercase tracking-wider">
                  {carouselSlide.badgeEn}
                </span>
              )}
              {carouselSlide?.bodyEn && (
                <p className="text-sm text-white/50 text-center max-w-md leading-relaxed">{carouselSlide.bodyEn}</p>
              )}
              {carouselUsd !== null ? (
                <p className="text-xl font-bold text-white">{fmtPrice(carouselUsd, eurMode, eurRate)}</p>
              ) : (
                <p className="text-sm text-white/25 italic">No showroom price</p>
              )}
              {/* Dot indicators */}
              {list.length > 1 && (
                <div className="flex items-center gap-1.5">
                  {list.map((m, i) => (
                    <button
                      key={m.id}
                      className={`w-2 h-2 rounded-full transition-colors ${i === safeIdx ? "bg-white" : "bg-white/25 hover:bg-white/50"}`}
                      onClick={() => setCarouselIdx(i)}
                      aria-label={m.name}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── Grid mode ────────────────────────────────────────────────────────── */
        <div className="flex-1 flex items-start justify-center gap-4 p-6 overflow-y-auto flex-wrap">
          {list.map((model) => {
            const price = priceMap.get(model.id);
            const usd = price?.priceUsd ? parseFloat(price.priceUsd) : null;
            const slide = slideMap.get(model.id);
            return (
              <div
                key={model.id}
                className="relative bg-[#0c1e32] border border-white/10 rounded-2xl p-5 flex flex-col items-center gap-3 w-52 flex-shrink-0"
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
      )}
    </div>
  );
}

// ─── ManageModelsPanel ────────────────────────────────────────────────────────

interface ManageModelsLocalItem {
  model: VehicleModel;
  visible: boolean;
  sortOrder: number;
}

function ManageModelsPanel({
  allModels,
  onBack,
}: {
  allModels: VehicleModel[];
  onBack: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: modelSettings = [], isLoading } = useQuery<ShowroomModelSetting[]>({
    queryKey: ["showroom-model-settings"],
    queryFn: () => apiFetch("/api/admin/showroom/model-settings"),
  });

  const [localList, setLocalList] = useState<ManageModelsLocalItem[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isLoading || initialized) return;
    const map = new Map(modelSettings.map((s) => [s.vehicleModelId, s]));
    const merged = allModels
      .map((model) => {
        const s = map.get(model.id);
        return { model, visible: s?.visible ?? true, sortOrder: s?.sortOrder ?? 9999 };
      })
      .sort((a, b) => a.sortOrder - b.sortOrder || a.model.name.localeCompare(b.model.name));
    setLocalList(merged);
    setInitialized(true);
  }, [modelSettings, allModels, isLoading, initialized]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/showroom/model-settings/batch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: localList.map((item, i) => ({
            vehicleModelId: item.model.id,
            visible: item.visible,
            sortOrder: (i + 1) * 10,
          })),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-model-settings"] });
      toast({ title: "Showroom model settings saved" });
      onBack();
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const moveUp = (i: number) => {
    if (i === 0) return;
    setLocalList((prev) => {
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  };

  const moveDown = (i: number) => {
    if (i === localList.length - 1) return;
    setLocalList((prev) => {
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  };

  const toggleVisible = (i: number) => {
    setLocalList((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, visible: !item.visible } : item)),
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground flex-shrink-0 px-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Vehicles
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Manage Showroom Models</p>
          <p className="text-xs text-muted-foreground">
            {localList.filter((x) => x.visible).length} visible · {localList.length} total · use Up/Down to reorder
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex-shrink-0"
        >
          {saveMutation.isPending && (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          )}
          Save
        </Button>
      </div>

      {/* Model list */}
      <div className="border border-border rounded-xl overflow-hidden">
        {localList.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">
            No active fleet models found.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {localList.map((item, i) => (
              <div
                key={item.model.id}
                className={`flex items-center gap-3 px-3 py-2.5 bg-card transition-opacity ${
                  item.visible ? "opacity-100" : "opacity-40"
                }`}
              >
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0 flex-shrink-0">
                  <button
                    className="text-muted-foreground hover:text-white disabled:opacity-25 transition-colors p-0.5"
                    onClick={() => moveUp(i)}
                    disabled={i === 0 || saveMutation.isPending}
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-white disabled:opacity-25 transition-colors p-0.5"
                    onClick={() => moveDown(i)}
                    disabled={i === localList.length - 1 || saveMutation.isPending}
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Order number */}
                <span className="text-xs text-muted-foreground/40 w-5 text-right flex-shrink-0 tabular-nums">
                  {i + 1}
                </span>

                {/* Thumbnail */}
                {toStorageSrc(item.model.imageUrl) ? (
                  <img
                    src={toStorageSrc(item.model.imageUrl)}
                    alt={item.model.name}
                    className="w-14 h-9 object-contain flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-9 flex items-center justify-center bg-muted rounded flex-shrink-0">
                    <Car className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}

                {/* Name + category */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate leading-tight">
                    {item.model.brandName ? `${item.model.brandName} ` : ""}
                    {item.model.name}
                  </p>
                  {item.model.category && (
                    <p className="text-xs text-muted-foreground truncate">{item.model.category}</p>
                  )}
                </div>

                {/* Visibility toggle */}
                <button
                  className={`flex-shrink-0 p-1 rounded transition-colors ${
                    item.visible
                      ? "text-green-400 hover:text-green-300"
                      : "text-muted-foreground/40 hover:text-muted-foreground"
                  }`}
                  onClick={() => toggleVisible(i)}
                  disabled={saveMutation.isPending}
                  aria-label={item.visible ? "Hide from showroom" : "Show in showroom"}
                  title={item.visible ? "Visible — click to hide" : "Hidden — click to show"}
                >
                  {item.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
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

  const { data: tabModelSettings = [] } = useQuery<ShowroomModelSetting[]>({
    queryKey: ["showroom-model-settings"],
    queryFn: () => apiFetch("/api/admin/showroom/model-settings"),
  });

  const settingsMap = useMemo(
    () => new Map(tabModelSettings.map((s) => [s.vehicleModelId, s])),
    [tabModelSettings],
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showManage, setShowManage] = useState(false);

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

  if (showManage) {
    return (
      <ManageModelsPanel
        allModels={models.filter((m) => m.active)}
        onBack={() => setShowManage(false)}
      />
    );
  }

  const visible = models
    .filter((m) => m.active && settingsMap.get(m.id)?.visible !== false)
    .sort(
      (a, b) =>
        (settingsMap.get(a.id)?.sortOrder ?? 9999) -
        (settingsMap.get(b.id)?.sortOrder ?? 9999),
    );

  const grouped = visible.reduce<Record<string, VehicleModel[]>>((acc, m) => {
    const cat = m.category ?? "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort(
    (a, b) =>
      (CATEGORY_SORT_PRIORITY[a] ?? 99) - (CATEGORY_SORT_PRIORITY[b] ?? 99) ||
      a.localeCompare(b),
  );

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {visible.length} model{visible.length !== 1 ? "s" : ""} in showroom
        </p>
        <Button
          size="sm"
          variant="outline"
          className="flex items-center gap-1.5 text-xs"
          onClick={() => setShowManage(true)}
        >
          <Settings2 className="w-3.5 h-3.5" />
          Manage Models
        </Button>
      </div>

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
  onStartSlideshow: (playlistId: number) => void;
}

function PlaylistsTab({ allSlides, onStartSlideshow }: PlaylistsTabProps) {
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
        onStartSlideshow={onStartSlideshow}
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
                className="text-muted-foreground hover:text-white h-7 px-2 flex-shrink-0"
                onClick={() => onStartSlideshow(pl.id)}
              >
                <Play className="w-3 h-3 mr-1" />
                Play
              </Button>
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

  const { data: modelSettings = [] } = useQuery<ShowroomModelSetting[]>({
    queryKey: ["showroom-model-settings"],
    queryFn: () => apiFetch("/api/admin/showroom/model-settings"),
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

  const slideIdMap = useMemo(
    () => new Map(slides.map((s) => [s.id, s])),
    [slides],
  );

  const eurRate = parseFloat(settings?.usdToEurRate ?? "0.92");

  const activeModels = useMemo(
    () => (models ?? []).filter((m) => m.active),
    [models],
  );

  const modelSettingsMap = useMemo(
    () => new Map(modelSettings.map((s) => [s.vehicleModelId, s])),
    [modelSettings],
  );

  const showroomModels = useMemo(
    () =>
      (models ?? [])
        .filter((m) => m.active && modelSettingsMap.get(m.id)?.visible !== false)
        .sort(
          (a, b) =>
            (modelSettingsMap.get(a.id)?.sortOrder ?? 9999) -
            (modelSettingsMap.get(b.id)?.sortOrder ?? 9999),
        ),
    [models, modelSettingsMap],
  );

  // ── Slideshow state ───────────────────────────────────────────────────────────
  const [launchPlaylistId, setLaunchPlaylistId] = useState<number | null>(null);
  const [launchSettingsOpen, setLaunchSettingsOpen] = useState(false);
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [slideshowSettings, setSlideshowSettings] = useState<SlideshowSettings>({
    lang: "en",
    currency: "usd",
    showPrice: true,
  });

  const handleStartSlideshow = (playlistId: number) => {
    setLaunchPlaylistId(playlistId);
    setLaunchSettingsOpen(true);
  };

  const handleLaunch = (s: SlideshowSettings) => {
    setSlideshowSettings(s);
    setLaunchSettingsOpen(false);
    setSlideshowActive(true);
  };

  const handleCloseSlideshow = () => {
    setSlideshowActive(false);
    setLaunchPlaylistId(null);
  };

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
    const grouped = showroomModels.reduce<Record<string, VehicleModel[]>>((acc, m) => {
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
          <PlaylistsTab allSlides={slides} onStartSlideshow={handleStartSlideshow} />
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

      {/* ── Launch settings modal ──────────────────────────────────────────────────── */}
      <LaunchSettingsModal
        open={launchSettingsOpen}
        onClose={() => setLaunchSettingsOpen(false)}
        onLaunch={handleLaunch}
        hasItems={launchPlaylistId !== null}
      />

      {/* ── Slideshow player ──────────────────────────────────────────────────────── */}
      {slideshowActive && launchPlaylistId !== null && (
        <SlideshowPlayer
          playlistId={launchPlaylistId}
          settings={slideshowSettings}
          slideIdMap={slideIdMap}
          priceMap={priceMap}
          eurRate={eurRate}
          onClose={handleCloseSlideshow}
        />
      )}
    </div>
  );
}
