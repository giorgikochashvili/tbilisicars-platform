/**
 * Booking page — 6-step flow:
 * Step 1 Vehicle → Step 2 Extras & Services → Step 3 Insurance → Step 4 Customer Info → Step 5 Payment Method → Step 6 Confirmation
 *
 * - Sticky desktop sidebar + collapsible mobile bar on steps 1–5 (live price summary)
 * - Quote state lifted to main component and passed down; insurance updates summary immediately
 * - Premium DateTimePicker replaces native datetime-local inputs
 * - WhatsApp as opt-in checkbox; separate Terms and Privacy checkboxes in Step 4
 */
import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import {
  Car, Users, Fuel, Settings, Check, ChevronLeft, ChevronDown, ChevronUp, ArrowRight,
  MapPin, Calendar, Phone, MessageCircle, Banknote, Info, Shield,
  Lock, Copy, Package, Baby, Wifi, Clock, X, Tag, List, LayoutGrid, SlidersHorizontal,
} from "lucide-react";
import { Link } from "wouter";
import { DateTimePicker } from "@/components/DateTimePicker";
import { TERMS_SECTIONS } from "./Terms";
import { PRIVACY_SECTIONS } from "./Privacy";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location { id: number; name: string; city: string; }
interface VehicleModel {
  id: number; brand: string; model: string; category: string | null;
  seats: number | null; transmission: string | null; fuel_type: string | null;
  description: string | null; image_url: string | null; deposit: string | null;
  vehicle_count: string; min_price_per_day: string | null; price_currency: string | null;
}
interface Extra { id: number; name: string; description: string | null; price: string; currency: string; pricing_type: string; max_days: number | null; }
interface BookingConfig { locations: Location[]; vehicleModels: VehicleModel[]; extras: Extra[]; }
interface SelectedExtra { extraId: number; quantity: number; }

interface FormData {
  pickupLocationId: string; dropoffLocationId: string;
  pickupDatetime: string; dropoffDatetime: string;
  vehicleModelId: string;
  extras: SelectedExtra[]; promoCode: string;
  insurancePlan: string;
  firstName: string; lastName: string; email: string; phone: string; nationality: string; notes: string;
  whatsAppOptIn: boolean; age: string; flightNumber: string;
  agreeToTerms: boolean; agreeToPrivacy: boolean;
  paymentMethod: string;
}

interface Quote {
  quotable: boolean; days: number; rateId: number | null; rateTierId: number | null;
  rateName: string | null; basePricePerDay: number | null; baseCurrency: string | null;
  baseTotal: number | null; extrasTotal: number;
  promoDiscountType: string | null; promoDiscountValue: number | null; discountAmount: number | null;
  oneWayFee?: number;
  estimatedTotal: number | null;
}

interface BookingResult {
  bookingId: number; reference: string; vehicle: string;
  pickupDatetime: string; dropoffDatetime: string;
  pickupLocationId?: number;
  message: string;
  generatedPassword?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INSURANCE_PLANS: Array<{
  id: string; label: string; deposit: number; excess: number; desc: string; recommended?: boolean;
}> = [
  { id: "basic",   label: "Basic",   deposit: 300, excess: 300, desc: "Standard cover for everyday driving" },
  { id: "full",    label: "Full",    deposit: 100, excess: 100, desc: "Reduced excess for added peace of mind" },
  { id: "premium", label: "Premium", deposit: 100, excess: 100, desc: "Maximum cover, minimum liability", recommended: true },
];

const INSURANCE_VISUAL = {
  basic: {
    activeBorder: "border-muted-foreground/50",
    activeBg: "bg-muted/10",
    iconWrapper: "bg-muted/20 border-muted-foreground/20",
    iconColor: "text-muted-foreground",
    tierLabel: "Basic Cover",
    tierColor: "text-muted-foreground",
    checkBg: "bg-muted-foreground",
  },
  full: {
    activeBorder: "border-blue-400",
    activeBg: "bg-blue-500/10",
    iconWrapper: "bg-blue-500/15 border-blue-400/30",
    iconColor: "text-blue-400",
    tierLabel: "Good Cover",
    tierColor: "text-blue-400",
    checkBg: "bg-blue-400",
  },
  premium: {
    activeBorder: "border-primary",
    activeBg: "bg-primary/10",
    iconWrapper: "bg-primary/15 border-primary/30",
    iconColor: "text-primary",
    tierLabel: "Best Coverage",
    tierColor: "text-primary",
    checkBg: "bg-primary",
  },
};

const STEP_LABELS = ["Vehicle", "Extras", "Insurance", "Your Info", "Payment", "Confirm"];

const BOOKING_DRAFT_KEY = "tc_booking_draft";

const SEAT_BUCKETS: Array<{ label: string; value: string; match: (s: number) => boolean }> = [
  { label: "2 seats",  value: "2",  match: (s) => s === 2 },
  { label: "4 seats",  value: "4",  match: (s) => s === 4 },
  { label: "5 seats",  value: "5",  match: (s) => s === 5 },
  { label: "7+ seats", value: "7+", match: (s) => s >= 7 },
];

const CATEGORY_ORDER: string[] = [
  "Economy",
  "Standard / Intermediate Sedan",
  "Full-Size Sedan",
  "Crossover / Intermediate SUV",
  "Full-Size SUV",
  "7 Seater SUV",
  "Minivan / People Carrier",
  "Off-Road",
  "Business Class",
  "Coupe / Convertible",
  "Sports Car",
];

const CITY_PICKUP_INSTRUCTIONS: Record<string, string> = {
  Tbilisi: "Our team will meet you at Tbilisi International Airport arrivals. Look for the Tbilisicars sign. Call +995 557 37 63 63 if you need assistance.",
  Kutaisi: "Our agent will meet you at Kutaisi International Airport arrivals. Call +995 595 28 66 00 on arrival.",
  Batumi: "Our team will meet you at Batumi International Airport arrivals. Look for the Tbilisicars sign. Call +995 557 37 63 63 if you need assistance.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options, headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any).errors?.[0] ?? (body as any).message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

function toStorageSrc(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("/api/storage/")) return path;
  return `/api/storage${path}`;
}

function VehicleImg({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Car className="w-16 h-16 text-muted-foreground/15" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function cn(...cls: (string | undefined | false | null)[]) { return cls.filter(Boolean).join(" "); }

function sortLocations<T extends { name: string; city: string }>(locs: T[]): T[] {
  function typePriority(name: string): number {
    if (name.includes("Airport")) return 1;
    if (name.includes("Downtown")) return 2;
    if (name.includes("Hotel")) return 3;
    return 4;
  }
  function cityPriority(city: string): number {
    if (city === "Tbilisi") return 1;
    if (city === "Kutaisi") return 2;
    if (city === "Batumi") return 3;
    return 4;
  }
  return [...locs].sort((a, b) => {
    const dt = typePriority(a.name) - typePriority(b.name);
    if (dt !== 0) return dt;
    return cityPriority(a.city) - cityPriority(b.city);
  });
}

function formatDT(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tbilisi", hour12: false });
}

function calcDays(pickup: string, dropoff: string) {
  if (!pickup || !dropoff) return 0;
  const elapsedMs = new Date(dropoff).getTime() - new Date(pickup).getTime();
  if (elapsedMs <= 0) return 0;
  const fullBlocks = Math.floor(elapsedMs / 86_400_000);
  const remainderMinutes = (elapsedMs - fullBlocks * 86_400_000) / 60_000;
  const extraDay = remainderMinutes > 120 ? 1 : 0;
  return Math.max(2, fullBlocks + extraDay);
}

function transLabel(t: string | null) { return t === "AUTOMATIC" ? "Automatic" : t === "MANUAL" ? "Manual" : t; }
function fuelLabel(f: string | null) { const m: Record<string,string> = { PETROL:"Petrol", DIESEL:"Diesel", ELECTRIC:"Electric", HYBRID:"Hybrid" }; return f ? (m[f] ?? f) : null; }
function formatPrice(amount: number, currency: string) {
  return currency === "EUR" ? `€${amount.toLocaleString()}` : `${amount.toLocaleString()} ${currency}`;
}

function minDT() {
  const now = new Date(); now.setMinutes(now.getMinutes() + 30);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth()+1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}`;
}

function extraIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("child") || n.includes("baby") || n.includes("booster") || n.includes("infant") || n.includes("seat"))
    return <Baby className="w-5 h-5" />;
  if (n.includes("wifi") || n.includes("internet") || n.includes("hotspot") || n.includes("sim") || n.includes("data"))
    return <Wifi className="w-5 h-5" />;
  if (n.includes("gps") || n.includes("navigation") || n.includes("nav") || n.includes("map"))
    return <MapPin className="w-5 h-5" />;
  if (n.includes("driver") || n.includes("chauffeur"))
    return <Users className="w-5 h-5" />;
  if (n.includes("insur") || n.includes("protect") || n.includes("cover"))
    return <Shield className="w-5 h-5" />;
  return <Package className="w-5 h-5" />;
}

// ─── Country list for nationality dropdown ────────────────────────────────────

const COUNTRY_NAMES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia",
  "Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan",
  "Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde",
  "Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros",
  "Congo (Republic)","Congo (Democratic Republic)","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic",
  "Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea",
  "Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany",
  "Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary",
  "Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan",
  "Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya",
  "Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta",
  "Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro",
  "Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger",
  "Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama",
  "Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda",
  "Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino",
  "Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia",
  "Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan",
  "Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo",
  "Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine",
  "United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City",
  "Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];

function CountrySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (open) { setSearch(""); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const filtered = search.trim()
    ? COUNTRY_NAMES.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : COUNTRY_NAMES;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-primary/60 transition-colors"
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{value || "Select country…"}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1.5 w-full rounded-xl border border-border bg-card shadow-2xl overflow-hidden" style={{ maxHeight: 260 }}>
          <div className="p-2 border-b border-border/50">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country…"
              className="w-full rounded-lg bg-secondary/40 border border-input px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
            />
          </div>
          <div
            className="overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-secondary/20 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full"
            style={{ maxHeight: 200, scrollbarWidth: "thin", scrollbarColor: "rgba(160,160,160,0.3) transparent" }}
          >
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">No match</p>
            ) : filtered.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm transition-colors",
                  c === value ? "text-primary font-medium bg-primary/10" : "text-foreground hover:bg-secondary/60 hover:text-white",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Legal Modal (Terms & Privacy) ────────────────────────────────────────────

type LegalSection = {
  title: string;
  content: string[];
  intro?: string;
  note?: string;
};

type LegalModalType = "terms" | "privacy" | null;

function LegalModal({ type, onClose }: { type: LegalModalType; onClose: () => void }) {
  useEffect(() => {
    if (!type) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [type, onClose]);

  if (!type) return null;

  const isTerms = type === "terms";
  const title = isTerms ? "Rental Terms & Conditions" : "Privacy Policy";
  const sections: LegalSection[] = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-2xl max-h-[90dvh] sm:max-h-[80vh] flex flex-col bg-[#0f1e30] border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4
          [&::-webkit-scrollbar]:w-1.5
          [&::-webkit-scrollbar-track]:bg-white/5
          [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30
          [&::-webkit-scrollbar-thumb]:rounded-full">
          {sections.map((s) => (
            <div key={s.title} className="bg-card/60 border border-border/60 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-white mb-2">{s.title}</h3>
              {s.intro && (
                <p className="text-xs text-muted-foreground mb-2">{s.intro}</p>
              )}
              <ul className="space-y-1.5">
                {s.content.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              {s.note && (
                <p className="mt-2 text-xs text-muted-foreground italic">{s.note}</p>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-medium py-2.5 hover:bg-primary/25 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Promo Code field (self-contained, used in Step 4) ────────────────────────

function PromoField({ form, setForm }: { form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>> }) {
  const [promoInput, setPromoInput] = useState(form.promoCode);
  const [promoState, setPromoState] = useState<{ valid: boolean; msg: string } | null>(
    form.promoCode ? { valid: true, msg: "" } : null
  );
  const [promoLoading, setPromoLoading] = useState(false);

  async function applyPromo() {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    try {
      const data = await apiFetch("/api/public/validate-promo", { method: "POST", body: JSON.stringify({ code: promoInput.trim() }) });
      setPromoState({ valid: data.valid, msg: data.error ?? "" });
      if (data.valid) setForm((f) => ({ ...f, promoCode: promoInput.trim() }));
    } catch { setPromoState({ valid: false, msg: "Unable to validate promo code" }); }
    finally { setPromoLoading(false); }
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-2 border-b border-border/50">
        <Copy className="w-3.5 h-3.5 text-primary" />
        Promo Code
      </div>
      <div className="flex gap-2">
        <Inp
          value={promoInput}
          onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && applyPromo()}
          disabled={promoState?.valid}
          className="uppercase"
          placeholder="Enter code…"
        />
        {promoState?.valid ? (
          <Btn variant="outline" onClick={() => { setPromoInput(""); setPromoState(null); setForm((f) => ({ ...f, promoCode: "" })); }} className="shrink-0 text-destructive border-destructive/30">Remove</Btn>
        ) : (
          <Btn variant="outline" onClick={applyPromo} loading={promoLoading} className="shrink-0">Apply</Btn>
        )}
      </div>
      {promoState && <p className={cn("text-xs mt-1.5", promoState.valid ? "text-green-400" : "text-destructive")}>{promoState.valid ? "Promo code applied!" : promoState.msg}</p>}
    </div>
  );
}

// ─── Primitive components ─────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
      {children}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}
function Inp({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 transition-colors", className)} {...p} />;
}
function Sel({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60 transition-colors", className)} {...p} />;
}
function Btn({ children, variant = "primary", className, loading, ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary"|"outline"; loading?: boolean }) {
  return (
    <button className={cn(
      "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed",
      variant === "primary" && "bg-primary text-white hover:bg-accent active:scale-95 shadow-sm hover:shadow-md hover:shadow-primary/25",
      variant === "outline" && "border border-border/60 text-foreground hover:bg-secondary/50 hover:border-border active:scale-95",
      className,
    )} disabled={p.disabled || loading} {...p}>
      {loading && <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
      {children}
    </button>
  );
}

// ─── Custom checkbox helper ───────────────────────────────────────────────────

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => (e.key === " " || e.key === "Enter") && onChange()}
      className={cn(
        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40",
        checked ? "bg-primary border-primary scale-105" : "border-border hover:border-primary/50",
      )}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
    </div>
  );
}

// ─── Live pricing summary (shared content for sidebar + mobile bar) ────────────

function PricingSummaryContent({
  form, models, extras, quote, quoteLoading,
}: {
  form: FormData; models: VehicleModel[]; extras: Extra[];
  quote: Quote | null; quoteLoading: boolean;
}) {
  const model = models.find((m) => String(m.id) === form.vehicleModelId);
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);
  const insurance = INSURANCE_PLANS.find((p) => p.id === form.insurancePlan);
  const cur = quote?.baseCurrency ?? model?.price_currency ?? "GEL";
  const fmt = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

  const selectedExtras = form.extras
    .map((se) => extras.find((e) => e.id === se.extraId))
    .filter(Boolean) as Extra[];

  return (
    <div className="space-y-4 text-sm">
      {model ? (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Vehicle</div>
          <div className="font-semibold text-white">{model.brand} {model.model}</div>
          {model.category && <div className="text-xs text-muted-foreground">{model.category}</div>}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground italic">No vehicle selected yet</div>
      )}

      {form.pickupDatetime && form.dropoffDatetime && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Trip</div>
          <div className="text-xs text-white">{formatDT(form.pickupDatetime)}</div>
          <div className="text-xs text-muted-foreground">→ {formatDT(form.dropoffDatetime)}</div>
          {days > 0 && (
            <div className="text-xs font-semibold text-primary mt-0.5">{days} {days === 1 ? "day" : "days"}</div>
          )}
        </div>
      )}

      {selectedExtras.length > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Extras</div>
          <div className="space-y-1">
            {selectedExtras.map((e) => {
              const billableDays = e.pricing_type === "per_day"
                ? (e.max_days != null && e.max_days > 0 ? Math.min(days, e.max_days) : days)
                : 1;
              return (
                <div key={e.id} className="flex justify-between text-xs">
                  <span className="text-muted-foreground truncate mr-2">{e.name}</span>
                  <span className="text-white shrink-0">+{(Number(e.price) * billableDays).toLocaleString()} {e.currency}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {insurance && (
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Insurance</div>
          <div className="text-xs font-semibold text-white">{insurance.label} Cover</div>
          <div className="text-xs text-muted-foreground">{insurance.deposit}€ deposit · {insurance.excess}€ excess</div>
        </div>
      )}

      {model && <div className="border-t border-border" />}

      {model && (
        <div>
          {quoteLoading ? (
            <div className="space-y-2">
              <div className="h-3 bg-muted/50 rounded animate-pulse" />
              <div className="h-5 bg-muted/50 rounded animate-pulse w-2/3" />
            </div>
          ) : quote?.quotable ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{quote.basePricePerDay?.toLocaleString()} {cur}/day × {days}</span>
                <span className="text-white font-medium">{fmt(quote.baseTotal!)}</span>
              </div>
              {quote.extrasTotal > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Extras</span>
                  <span className="text-white font-medium">+{fmt(quote.extrasTotal)}</span>
                </div>
              )}
              {quote.discountAmount != null && quote.discountAmount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Promo</span>
                  <span className="text-green-400 font-medium">−{fmt(quote.discountAmount)}</span>
                </div>
              )}
              {quote.oneWayFee != null && quote.oneWayFee > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">One Way Fee (Drop off in different location)</span>
                  <span className="text-white font-medium">+{fmt(quote.oneWayFee)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-border mt-1">
                <span className="text-xs font-semibold text-white">Est. Total</span>
                <span className="text-base font-bold text-primary">{fmt(quote.estimatedTotal!)}</span>
              </div>
              {insurance && (
                <div className="text-[10px] text-muted-foreground pt-1 border-t border-border mt-1">
                  + {insurance.deposit}€ insurance deposit required at pickup
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {days > 0 && <span className="text-primary font-medium block">{days} {days === 1 ? "day" : "days"} rental</span>}
              Pricing will be confirmed by our team.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Mobile collapsible pricing bar ──────────────────────────────────────────

function MobilePricingBar({ form, models, extras, quote, quoteLoading }: {
  form: FormData; models: VehicleModel[]; extras: Extra[];
  quote: Quote | null; quoteLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const model = models.find((m) => String(m.id) === form.vehicleModelId);
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);
  const cur = quote?.baseCurrency ?? model?.price_currency ?? "GEL";

  return (
    <div className="lg:hidden bg-secondary/20 border border-border rounded-xl mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2 text-white font-medium text-sm">
          <Car className="w-4 h-4 text-primary" />
          {model ? `${model.brand} ${model.model}` : "Booking Summary"}
        </div>
        <div className="flex items-center gap-2">
          {quoteLoading ? (
            <span className="text-xs text-muted-foreground">Calculating…</span>
          ) : quote?.quotable ? (
            <span className="text-primary font-bold text-sm">
              {quote.estimatedTotal?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cur}
            </span>
          ) : days > 0 ? (
            <span className="text-xs text-muted-foreground">{days} {days === 1 ? "day" : "days"}</span>
          ) : null}
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", expanded && "rotate-180")} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-3">
          <PricingSummaryContent form={form} models={models} extras={extras} quote={quote} quoteLoading={quoteLoading} />
        </div>
      )}
    </div>
  );
}

// ─── Step bar ─────────────────────────────────────────────────────────────────

function StepBar({ step, onGoTo }: { step: number; onGoTo?: (n: number) => void }) {
  const pct = Math.round(((step - 1) / (STEP_LABELS.length - 1)) * 100);
  return (
    <div className="mb-8">
      {/* Mobile: compact progress indicator */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Step {step} of {STEP_LABELS.length}</span>
          <span className="text-sm font-semibold text-white">{STEP_LABELS[step - 1]}</span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Desktop: numbered step circles with connecting lines */}
      <div className="hidden sm:flex items-start gap-0">
        {STEP_LABELS.map((label, i) => {
          const num = i + 1; const active = num === step; const done = num < step;
          const isLast = i === STEP_LABELS.length - 1;
          return (
            <Fragment key={i}>
              <div className="flex flex-col items-center">
                {done ? (
                  <button
                    type="button"
                    onClick={() => onGoTo?.(num)}
                    title={`Back to ${label}`}
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 shrink-0 cursor-pointer",
                      "bg-primary border-primary text-white hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    )}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                ) : (
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 shrink-0",
                    active && "bg-primary border-primary text-white shadow-lg shadow-primary/40 ring-4 ring-primary/20",
                    !active && "border-border text-muted-foreground bg-card",
                  )}>
                    {num}
                  </div>
                )}
                <span className={cn(
                  "text-[10px] mt-1.5 text-center whitespace-nowrap font-medium leading-none",
                  active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/50"
                )}>
                  {label}
                </span>
              </div>
              {!isLast && (
                <div className={cn(
                  "flex-1 h-0.5 mt-[18px] mx-1 transition-colors duration-300",
                  done ? "bg-primary" : "bg-border"
                )} />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Trip Details Banner (shown inline when dates/locations missing) ───────────

function TripDetailsBanner({ form, setForm, locations, onClose }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; locations: Location[];
  onClose?: () => void;
}) {
  const cities = Array.from(new Set(locations.map((l) => l.city)));
  const LocOpts = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Sel value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select location…</option>
      {cities.map((city) => (
        <optgroup key={city} label={city}>
          {locations.filter((l) => l.city === city).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </optgroup>
      ))}
    </Sel>
  );
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);
  const md = minDT();

  return (
    <div className="bg-secondary/30 border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Calendar className="w-3.5 h-3.5 text-primary" />
          Trip Details
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-primary hover:underline font-medium focus:outline-none"
          >
            Done
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3 mb-3">
        <div>
          <FieldLabel required>Pickup Location</FieldLabel>
          <LocOpts value={form.pickupLocationId} onChange={(v) => setForm((f) => ({ ...f, pickupLocationId: v, dropoffLocationId: f.dropoffLocationId || v }))} />
        </div>
        <div>
          <FieldLabel required>Drop-off Location</FieldLabel>
          <LocOpts value={form.dropoffLocationId} onChange={(v) => setForm((f) => ({ ...f, dropoffLocationId: v }))} />
        </div>
        <div>
          <FieldLabel required>Pickup Date &amp; Time</FieldLabel>
          <DateTimePicker
            value={form.pickupDatetime}
            min={md}
            onChange={(v) => setForm((f) => ({ ...f, pickupDatetime: v }))}
          />
        </div>
        <div>
          <FieldLabel required>Return Date &amp; Time</FieldLabel>
          <DateTimePicker
            value={form.dropoffDatetime}
            min={form.pickupDatetime || md}
            onChange={(v) => setForm((f) => ({ ...f, dropoffDatetime: v }))}
          />
        </div>
      </div>
      {days > 0 && (
        <div className="flex items-center gap-2 text-xs text-primary font-medium">
          <Car className="w-3.5 h-3.5" /> {days} {days === 1 ? "day" : "days"} rental
        </div>
      )}
    </div>
  );
}

// ─── Vehicle card (grid / category view) ──────────────────────────────────────

function VehicleCard({
  m, selected, days, showCategoryPill = true, onSelect, onConfirm,
}: {
  m: VehicleModel; selected: boolean; days: number;
  showCategoryPill?: boolean;
  onSelect: () => void; onConfirm: () => void;
}) {
  const price = m.min_price_per_day ? Number(m.min_price_per_day) : null;
  const cur = m.price_currency ?? "EUR";
  const totalEst = price && days > 0 ? price * days : null;
  const isOnRequest = Number(m.vehicle_count) === 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-2xl border-2 overflow-hidden transition-all duration-200",
        selected
          ? "border-primary shadow-lg shadow-primary/20 ring-1 ring-primary/30"
          : "border-border hover:border-primary/40 hover:shadow-md hover:shadow-black/20",
      )}
    >
      {/* Image area */}
      <div className="relative aspect-[16/10] bg-gradient-to-br from-secondary to-card overflow-hidden">
        <VehicleImg
          src={toStorageSrc(m.image_url)}
          alt={`${m.brand} ${m.model}`}
          className="w-full h-full object-contain p-3"
        />
        {showCategoryPill && m.category && (
          <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">
            {m.category}
          </span>
        )}
        {isOnRequest && !selected && (
          <span className="absolute top-3 right-3 bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
            On Request
          </span>
        )}
        {price !== null ? (
          <div className="absolute bottom-3 right-3 bg-primary/90 backdrop-blur-sm text-white rounded-xl px-3 py-1.5 text-right">
            {totalEst ? (
              <>
                <div className="text-sm font-bold leading-none">
                  {formatPrice(totalEst, cur)}{" "}
                  <span className="text-[10px] font-normal opacity-80">total</span>
                </div>
                <div className="text-[10px] opacity-70 leading-none mt-0.5">{formatPrice(price, cur)}/day</div>
              </>
            ) : (
              <>
                <div className="text-sm font-bold leading-none">{formatPrice(price, cur)}</div>
                <div className="text-[10px] opacity-80 leading-none mt-0.5">/day</div>
              </>
            )}
          </div>
        ) : (
          <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-muted-foreground rounded-xl px-3 py-1.5">
            <div className="text-xs leading-none">Contact for pricing</div>
          </div>
        )}
        {selected && (
          <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        {selected && <div className="absolute inset-0 bg-primary/[0.08] pointer-events-none" />}
      </div>

      {/* Info panel */}
      <div className="p-4">
        <div className="mb-2.5">
          <div className="font-bold text-white text-base leading-tight">{m.brand} {m.model}</div>
          {isOnRequest && (
            <p className="text-xs text-amber-400/80 mt-0.5">
              Not instantly available — we'll confirm before finalising
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {m.seats && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 border border-border/50 rounded-full px-2.5 py-1">
              <Users className="w-3 h-3" /> {m.seats} seats
            </span>
          )}
          {m.transmission && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 border border-border/50 rounded-full px-2.5 py-1">
              <Settings className="w-3 h-3" /> {transLabel(m.transmission)}
            </span>
          )}
          {m.fuel_type && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 border border-border/50 rounded-full px-2.5 py-1">
              <Fuel className="w-3 h-3" /> {fuelLabel(m.fuel_type)}
            </span>
          )}
        </div>
        {selected && (
          <div className="mt-3 pt-3 border-t border-primary/20">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onConfirm(); }}
              className="w-full inline-flex items-center justify-center gap-2 bg-primary hover:bg-accent text-white font-semibold py-2.5 rounded-xl transition-all duration-150 text-sm shadow-sm hover:shadow-md hover:shadow-primary/25 active:scale-95"
            >
              Choose this car <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Vehicle list row (list view) ──────────────────────────────────────────────

function VehicleListRow({
  m, selected, days, onSelect, onConfirm,
}: {
  m: VehicleModel; selected: boolean; days: number;
  onSelect: () => void; onConfirm: () => void;
}) {
  const price = m.min_price_per_day ? Number(m.min_price_per_day) : null;
  const cur = m.price_currency ?? "EUR";
  const isOnRequest = Number(m.vehicle_count) === 0;
  return (
    <div className={cn(
      "rounded-2xl border-2 transition-all duration-200 overflow-hidden",
      selected
        ? "border-primary bg-primary/5 shadow-md shadow-primary/15 ring-1 ring-primary/30"
        : "border-border bg-card hover:border-primary/30 hover:bg-secondary/10",
    )}>
      {/* Tappable row — selects this vehicle */}
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left flex items-center gap-3 sm:gap-4 p-3"
      >
        {/* Thumbnail */}
        <div className="w-20 sm:w-24 h-14 sm:h-16 rounded-xl bg-gradient-to-br from-secondary to-card overflow-hidden shrink-0 relative">
          <VehicleImg
            src={toStorageSrc(m.image_url)}
            alt={`${m.brand} ${m.model}`}
            className="w-full h-full object-contain p-2"
          />
          {selected && <div className="absolute inset-0 bg-primary/10 pointer-events-none rounded-xl" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <div className="font-bold text-white text-sm leading-tight">
            {m.brand} {m.model}
          </div>
          {m.category && (
            <div className="text-[11px] text-primary/70 font-medium mt-0.5">{m.category}</div>
          )}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
            {m.seats && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="w-2.5 h-2.5" /> {m.seats}
              </span>
            )}
            {m.transmission && (
              <span className="text-[11px] text-muted-foreground">· {transLabel(m.transmission)}</span>
            )}
            {m.fuel_type && (
              <span className="text-[11px] text-muted-foreground">· {fuelLabel(m.fuel_type)}</span>
            )}
            {isOnRequest && (
              <span className="text-[11px] text-amber-400 font-medium">· On Request</span>
            )}
          </div>
        </div>

        {/* Price + selector indicator */}
        <div className="shrink-0 flex flex-col items-end gap-2">
          {price !== null ? (
            <div className="text-right">
              <div className="text-sm font-bold text-primary leading-none">{formatPrice(price, cur)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">/day</div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-right leading-snug">Contact<br />for pricing</div>
          )}
          <div className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200",
            selected ? "bg-primary border-primary" : "border-border",
          )}>
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
        </div>
      </button>

      {/* Compact inline CTA — shown only when this row is selected */}
      {selected && (
        <div className="px-3 pb-3 pt-0">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-primary hover:bg-accent text-white font-semibold py-2 rounded-xl transition-all duration-150 text-xs shadow-sm active:scale-95"
          >
            Continue with this car <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 1: Vehicle ──────────────────────────────────────────────────────────

function Step1({ form, setForm, models, locations, extras, quote, quoteLoading, onNext, isRefetching }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  models: VehicleModel[]; locations: Location[]; extras: Extra[];
  quote: Quote | null; quoteLoading: boolean;
  onNext: () => void; isRefetching?: boolean;
}) {
  const [editSearch, setEditSearch] = useState(false);
  const [filters, setFilters] = useState({ category: "", transmission: "", seats: "", fuelType: "" });
  const [openTrip, setOpenTrip] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"default" | "price_asc" | "price_desc">("default");
  const [viewMode, setViewMode] = useState<"category" | "list" | "grid">("category");
  const needTrip = !form.pickupLocationId || !form.dropoffLocationId || !form.pickupDatetime || !form.dropoffDatetime;
  const showBanner = needTrip || editSearch;
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  // Reset filters whenever the user submits new trip parameters (location or dates change)
  const prevTripKeyRef = useRef("");
  useEffect(() => {
    const key = `${form.pickupLocationId}|${form.dropoffLocationId}|${form.pickupDatetime}|${form.dropoffDatetime}`;
    if (prevTripKeyRef.current && prevTripKeyRef.current !== key) {
      setFilters({ category: "", transmission: "", seats: "", fuelType: "" });
    }
    prevTripKeyRef.current = key;
  }, [form.pickupLocationId, form.dropoffLocationId, form.pickupDatetime, form.dropoffDatetime]);

  // Derive filter option lists from loaded models (category, transmission, fuel from data; seats as fixed buckets)
  const categoryOptions = [...new Set(models.map((m) => m.category).filter((c): c is string => c != null))].sort();
  const transmissionOptions = [...new Set(models.map((m) => m.transmission).filter((t): t is string => t != null))].sort();
  const fuelOptions = [...new Set(models.map((m) => m.fuel_type).filter((f): f is string => f != null))].sort();
  const hasFilters = !!(filters.category || filters.transmission || filters.seats || filters.fuelType);
  const showFilters = !showBanner && models.length > 0 &&
    (categoryOptions.length > 0 || transmissionOptions.length > 0 || SEAT_BUCKETS.length > 0 || fuelOptions.length > 0);

  // Client-side filtering — when a filter is active, vehicles with null values for that field are excluded
  const filteredModels = models.filter((m) => {
    if (filters.category) {
      if (m.category == null || m.category !== filters.category) return false;
    }
    if (filters.transmission) {
      if (m.transmission == null || m.transmission !== filters.transmission) return false;
    }
    if (filters.seats) {
      const bucket = SEAT_BUCKETS.find((b) => b.value === filters.seats);
      if (m.seats == null || !bucket || !bucket.match(m.seats)) return false;
    }
    if (filters.fuelType) {
      if (m.fuel_type == null || m.fuel_type !== filters.fuelType) return false;
    }
    return true;
  }).slice().sort((a, b) => {
    if (sortBy === "price_asc") {
      const pa = a.min_price_per_day ? Number(a.min_price_per_day) : Infinity;
      const pb = b.min_price_per_day ? Number(b.min_price_per_day) : Infinity;
      return pa - pb;
    }
    if (sortBy === "price_desc") {
      const pa = a.min_price_per_day ? Number(a.min_price_per_day) : -Infinity;
      const pb = b.min_price_per_day ? Number(b.min_price_per_day) : -Infinity;
      return pb - pa;
    }
    // Default: available models first, On Request (vehicle_count === 0) last; alphabetical tie-break
    const aAvail = Number(a.vehicle_count) > 0 ? 0 : 1;
    const bAvail = Number(b.vehicle_count) > 0 ? 0 : 1;
    if (aAvail !== bAvail) return aAvail - bAvail;
    const aName = `${a.brand ?? ""} ${a.model ?? ""}`.trim().toLowerCase();
    const bName = `${b.brand ?? ""} ${b.model ?? ""}`.trim().toLowerCase();
    return aName.localeCompare(bName);
  });

  function clearFilters() { setFilters({ category: "", transmission: "", seats: "", fuelType: "" }); }

  function validate() {
    if (!form.pickupLocationId) { toast({ title: "Please select a pickup location", variant: "destructive" }); return; }
    if (!form.dropoffLocationId) { toast({ title: "Please select a drop-off location", variant: "destructive" }); return; }
    if (!form.pickupDatetime || !form.dropoffDatetime) { toast({ title: "Please select pickup and return dates", variant: "destructive" }); return; }
    if (new Date(form.dropoffDatetime) <= new Date(form.pickupDatetime)) { toast({ title: "Return date must be after pickup", variant: "destructive" }); return; }
    if (!form.vehicleModelId) { toast({ title: "Please select a vehicle", variant: "destructive" }); return; }
    onNext();
  }

  return (
    <div className="lg:grid lg:grid-cols-[240px_1fr] gap-4 items-start">

      {/* ── Left sticky rail ─────────────────────────────────────────────── */}
      <div className="mb-4 lg:mb-0 lg:self-start">
        <div className="lg:sticky lg:top-6 space-y-3">

          {/* 1. Edit Search — trip details edit form or compact summary */}
          {showBanner ? (
            <TripDetailsBanner
              form={form}
              setForm={setForm}
              locations={locations}
              onClose={editSearch && !needTrip ? () => setEditSearch(false) : undefined}
            />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Collapsible header */}
              <button
                type="button"
                onClick={() => setOpenTrip((p) => !p)}
                className="w-full flex items-center justify-between px-4 py-3 text-left focus:outline-none hover:bg-secondary/20 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span className="text-white font-medium normal-case tracking-normal text-sm truncate max-w-[160px] lg:max-w-[120px]">
                    {locations.find((l) => String(l.id) === form.pickupLocationId)?.name ?? "Your Trip"}
                    {days > 0 && <span className="ml-2 text-primary text-xs font-bold">· {days}d</span>}
                  </span>
                </div>
                {openTrip ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
              </button>
              {openTrip && (
                <div className="px-4 pb-4 border-t border-border/40">
                  <div className="space-y-2 text-sm mt-3 mb-3">
                    <div className="flex items-center gap-1.5 text-primary font-medium">
                      {locations.find((l) => String(l.id) === form.pickupLocationId)?.name ?? ""}
                      {form.dropoffLocationId !== form.pickupLocationId && (
                        <><ArrowRight className="w-3.5 h-3.5 text-primary/60 mx-0.5" />{locations.find((l) => String(l.id) === form.dropoffLocationId)?.name ?? ""}</>
                      )}
                    </div>
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div>
                        <div>{formatDT(form.pickupDatetime)}</div>
                        <div className="text-primary/60">→ {formatDT(form.dropoffDatetime)}</div>
                      </div>
                    </div>
                    {days > 0 && (
                      <span className="inline-block bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                        {days} {days === 1 ? "day" : "days"}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditSearch(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-primary border border-primary/30 hover:border-primary/60 hover:bg-primary/5 rounded-lg px-3 py-2 transition-colors focus:outline-none"
                  >
                    <Settings className="w-3.5 h-3.5" /> Edit Search
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 3. Filters — visible when trip confirmed and filter options exist */}
          {showFilters && (
            <>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Toggle header */}
                <button
                  type="button"
                  onClick={() => setOpenFilters((p) => !p)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left focus:outline-none hover:bg-secondary/20 transition-colors min-h-[48px]"
                >
                  <div className="flex items-center gap-2.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-white">Filters</span>
                    {hasFilters && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-bold px-1">
                        {[filters.category, filters.transmission, filters.seats, filters.fuelType].filter(Boolean).length}
                      </span>
                    )}
                  </div>
                  {openFilters
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>

                {/* Active filter chips — only when collapsed and filters are on */}
                {hasFilters && !openFilters && (
                  <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
                    {filters.category && (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-medium max-w-[120px] truncate">
                        {filters.category}
                      </span>
                    )}
                    {filters.transmission && (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-medium">
                        {transLabel(filters.transmission)}
                      </span>
                    )}
                    {filters.seats && (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-medium">
                        {SEAT_BUCKETS.find((b) => b.value === filters.seats)?.label ?? filters.seats}
                      </span>
                    )}
                    {filters.fuelType && (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-medium">
                        {fuelLabel(filters.fuelType)}
                      </span>
                    )}
                  </div>
                )}

                {/* Expanded filter body */}
                {openFilters && (
                  <div className="px-4 pb-5 border-t border-border/40 pt-3 space-y-4">
                    {categoryOptions.length > 0 && (
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Category
                        </label>
                        <Sel
                          value={filters.category}
                          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
                          className="min-h-[44px]"
                        >
                          <option value="">All categories</option>
                          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                        </Sel>
                      </div>
                    )}
                    {transmissionOptions.length > 0 && (
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Transmission
                        </label>
                        <Sel
                          value={filters.transmission}
                          onChange={(e) => setFilters((f) => ({ ...f, transmission: e.target.value }))}
                          className="min-h-[44px]"
                        >
                          <option value="">Any</option>
                          {transmissionOptions.map((t) => <option key={t} value={t}>{transLabel(t)}</option>)}
                        </Sel>
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Seats
                      </label>
                      <Sel
                        value={filters.seats}
                        onChange={(e) => setFilters((f) => ({ ...f, seats: e.target.value }))}
                        className="min-h-[44px]"
                      >
                        <option value="">Any</option>
                        {SEAT_BUCKETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                      </Sel>
                    </div>
                    {fuelOptions.length > 0 && (
                      <div>
                        <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                          Fuel Type
                        </label>
                        <Sel
                          value={filters.fuelType}
                          onChange={(e) => setFilters((f) => ({ ...f, fuelType: e.target.value }))}
                          className="min-h-[44px]"
                        >
                          <option value="">Any</option>
                          {fuelOptions.map((fu) => <option key={fu} value={fu}>{fuelLabel(fu)}</option>)}
                        </Sel>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Clear all — visible without opening the panel */}
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="w-full text-xs text-primary/70 hover:text-primary focus:outline-none py-1 text-center transition-colors"
                >
                  × Clear all filters
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right: vehicle list ──────────────────────────────────────────── */}
      <div>

        {/* Heading + view switcher */}
        <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-white mb-0.5">Choose Your Vehicle</h2>
            <p className="text-muted-foreground text-sm">
              {filteredModels.length > 0
                ? `${filteredModels.length} model${filteredModels.length !== 1 ? "s" : ""} available`
                : "Select from our available fleet"}
            </p>
          </div>
          {models.length > 0 && (
            <div className="flex items-center gap-1 bg-secondary/40 border border-border/60 rounded-xl p-1 shrink-0">
              {(
                [
                  { mode: "category" as const, Icon: Tag,        label: "Category" },
                  { mode: "list"     as const, Icon: List,       label: "List" },
                  { mode: "grid"     as const, Icon: LayoutGrid, label: "Grid" },
                ]
              ).map(({ mode, Icon, label }) => (
                <button
                  key={mode}
                  type="button"
                  title={label}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 min-h-[34px]",
                    viewMode === mode
                      ? "bg-primary text-white shadow-md shadow-primary/25"
                      : "text-muted-foreground hover:text-white hover:bg-white/5",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sort row — shown below heading only in List / Grid view */}
        {viewMode !== "category" && models.length > 0 && (
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-border/40">
            <span className="text-xs text-muted-foreground shrink-0">Sort:</span>
            <Sel
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "default" | "price_asc" | "price_desc")}
              className="!w-auto flex-1 text-xs py-1.5"
            >
              <option value="default">Default order</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </Sel>
          </div>
        )}
        {viewMode === "category" && <div className="mb-5" />}

        {isRefetching ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <svg className="animate-spin h-7 w-7 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <p className="text-sm text-muted-foreground">Checking availability…</p>
          </div>
        ) : models.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
              <Car className="w-6 h-6 text-primary/50" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">No vehicles found</h3>
            <p className="text-sm text-muted-foreground mb-1 max-w-xs mx-auto leading-relaxed">
              No vehicles are currently listed for online booking.
            </p>
            <p className="text-xs text-amber-400/80 mb-4">
              Some vehicles may still be available on request — contact us directly.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => setEditSearch(true)}
                className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
              >
                Edit Search
              </button>
              <a
                href="tel:+995557376363"
                className="inline-flex items-center gap-2 border border-border text-foreground hover:bg-secondary/50 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
              >
                <Phone className="w-4 h-4" /> Contact Support
              </a>
            </div>
          </div>
        ) : filteredModels.length === 0 ? (
          <div className="text-center py-8 rounded-xl border border-border/40 bg-secondary/10">
            <Settings className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-white mb-1">No vehicles match your filters</p>
            <p className="text-xs text-muted-foreground mb-3">Try adjusting or clearing your filter selections.</p>
            <button type="button" onClick={clearFilters} className="text-xs text-primary hover:underline focus:outline-none">
              Clear all filters
            </button>
          </div>

        ) : viewMode === "category" ? (
          /* ── Category View ─────────────────────────────────────────────────── */
          <div className="space-y-10 mb-6">
            {CATEGORY_ORDER.map((cat) => {
              const catModels = filteredModels.filter((m) => m.category === cat);
              if (catModels.length === 0) return null;
              const prices = catModels
                .map((m) => m.min_price_per_day ? Number(m.min_price_per_day) : null)
                .filter((p): p is number => p !== null);
              const minPrice = prices.length > 0 ? Math.min(...prices) : null;
              const firstCur = catModels.find((m) => m.min_price_per_day != null)?.price_currency ?? "EUR";
              const availCount = catModels.filter((m) => Number(m.vehicle_count) > 0).length;
              return (
                <div key={cat}>
                  {/* Section header */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/40">
                    <div className="border-l-2 border-primary/50 pl-2.5">
                      <h3 className="text-lg font-bold text-white leading-tight">{cat}</h3>
                      <p className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {minPrice !== null ? (
                          <span className="text-primary/80 font-medium">{`From ${formatPrice(minPrice, firstCur)}/day`}</span>
                        ) : (
                          <span className="text-muted-foreground">Contact for pricing</span>
                        )}
                        <span className="text-border">·</span>
                        {availCount > 0 ? (
                          <span className="text-muted-foreground">{availCount} car{availCount !== 1 ? "s" : ""} available</span>
                        ) : (
                          <span className="text-amber-400/70">On Request</span>
                        )}
                      </p>
                    </div>
                    <span className="text-[11px] text-primary/70 bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5 shrink-0 ml-3 font-medium">
                      {catModels.length} {catModels.length === 1 ? "model" : "models"}
                    </span>
                  </div>
                  {/* Cards: centered snap carousel on mobile, 2-col grid on sm, 3-col on lg */}
                  <div className="-mx-4 px-[9%] flex overflow-x-auto snap-x snap-mandatory gap-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 sm:overflow-x-clip sm:pb-0 sm:gap-4 lg:grid-cols-3">
                    {catModels.map((m) => (
                      <div key={m.id} className="shrink-0 w-full snap-center sm:w-auto sm:shrink sm:snap-align-none">
                        <VehicleCard
                          m={m}
                          selected={String(form.vehicleModelId) === String(m.id)}
                          days={days}
                          showCategoryPill={false}
                          onSelect={() => setForm((f) => ({ ...f, vehicleModelId: String(m.id) }))}
                          onConfirm={validate}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Catch-all: models with no category or unrecognised category */}
            {(() => {
              const other = filteredModels.filter(
                (m) => !m.category || !CATEGORY_ORDER.includes(m.category),
              );
              if (other.length === 0) return null;
              return (
                <div>
                  <div className="mb-4 pb-3 border-b border-border/60">
                    <h3 className="text-base font-bold text-white">Other Vehicles</h3>
                  </div>
                  <div className="-mx-4 px-[9%] flex overflow-x-auto snap-x snap-mandatory gap-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 sm:overflow-x-clip sm:pb-0 sm:gap-4 lg:grid-cols-3">
                    {other.map((m) => (
                      <div key={m.id} className="shrink-0 w-full snap-center sm:w-auto sm:shrink sm:snap-align-none">
                        <VehicleCard
                          m={m}
                          selected={String(form.vehicleModelId) === String(m.id)}
                          days={days}
                          showCategoryPill
                          onSelect={() => setForm((f) => ({ ...f, vehicleModelId: String(m.id) }))}
                          onConfirm={validate}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

        ) : viewMode === "list" ? (
          /* ── List View ─────────────────────────────────────────────────────── */
          <div className="space-y-2 mb-6">
            {filteredModels.map((m) => (
              <VehicleListRow
                key={m.id}
                m={m}
                selected={String(form.vehicleModelId) === String(m.id)}
                days={days}
                onSelect={() => setForm((f) => ({ ...f, vehicleModelId: String(m.id) }))}
                onConfirm={validate}
              />
            ))}
          </div>

        ) : (
          /* ── Grid View ─────────────────────────────────────────────────────── */
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
            {filteredModels.map((m) => (
              <VehicleCard
                key={m.id}
                m={m}
                selected={String(form.vehicleModelId) === String(m.id)}
                days={days}
                showCategoryPill
                onSelect={() => setForm((f) => ({ ...f, vehicleModelId: String(m.id) }))}
                onConfirm={validate}
              />
            ))}
          </div>
        )}

        {/* Bottom continue area */}
        <div className="pt-4 border-t border-border/30 mt-2">
          {form.vehicleModelId ? (() => {
            const sel = models.find((m) => String(m.id) === form.vehicleModelId);
            const price = sel?.min_price_per_day ? Number(sel.min_price_per_day) : null;
            const cur = sel?.price_currency ?? "EUR";
            return (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-white truncate">{sel?.brand} {sel?.model}</span>
                  {price !== null && (
                    <span className="text-xs text-primary/70 shrink-0 hidden sm:inline">
                      · {formatPrice(price, cur)}/day
                    </span>
                  )}
                </div>
                <Btn onClick={validate} className="shrink-0">Continue →</Btn>
              </div>
            );
          })() : (
            <div className="flex justify-end">
              <Btn onClick={validate} disabled>Continue →</Btn>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── Step 2: Extras ───────────────────────────────────────────────────────────

function Step2({ form, setForm, extras, onNext, onBack }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  extras: Extra[]; onNext: () => void; onBack: () => void;
}) {
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  function toggleExtra(id: number) {
    setForm((f) => {
      const exists = f.extras.find((e) => e.extraId === id);
      return exists ? { ...f, extras: f.extras.filter((e) => e.extraId !== id) } : { ...f, extras: [...f.extras, { extraId: id, quantity: 1 }] };
    });
  }

  const extrasRunningTotal = form.extras.reduce((sum, se) => {
    const ex = extras.find((x) => x.id === se.extraId);
    if (!ex) return sum;
    return sum + Number(ex.price) * se.quantity * (ex.pricing_type === "per_day" ? days : 1);
  }, 0);
  const extrasCurrency = form.extras.length > 0
    ? (extras.find((e) => e.id === form.extras[0].extraId)?.currency ?? "EUR")
    : "EUR";

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Extras & Services</h2>
      <p className="text-muted-foreground text-sm mb-6">All extras are optional — continue without selecting any if you prefer.</p>

      {extras.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {extras.map((e) => {
            const selected = form.extras.some((x) => x.extraId === e.id);
            const pricePerUnit = Number(e.price);
            const totalImpact = pricePerUnit * (e.pricing_type === "per_day" ? days : 1);
            return (
              <button key={e.id} type="button" onClick={() => toggleExtra(e.id)}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-4 transition-all duration-200",
                  selected
                    ? "border-primary bg-primary/10 shadow-md shadow-primary/15 ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-primary/30 hover:bg-secondary/10 hover:shadow-md hover:shadow-black/20"
                )}>
                <div className="flex items-start gap-2.5">
                  {/* Icon */}
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200",
                    selected ? "bg-primary/20 text-primary" : "bg-secondary/50 text-muted-foreground"
                  )}>
                    {extraIcon(e.name)}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm text-white leading-snug">{e.name}</div>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all duration-200",
                        selected ? "bg-primary border-primary scale-110" : "border-border"
                      )}>
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    {e.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{e.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-xs font-semibold text-primary">
                        {pricePerUnit.toLocaleString()} {e.currency}
                        <span className="font-normal text-muted-foreground"> /{e.pricing_type === "per_day" ? "day" : "rental"}</span>
                      </span>
                      {selected && days > 0 && (
                        <span className="text-xs font-medium bg-primary/10 border border-primary/20 text-primary rounded-full px-2 py-0.5">
                          +{totalImpact.toLocaleString()} {e.currency} total
                        </span>
                      )}
                      {!selected && e.pricing_type === "per_day" && days > 1 && (
                        <span className="text-[11px] text-muted-foreground/60">
                          = {totalImpact.toLocaleString()} {e.currency} for {days} days
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          </div>
        </>
      ) : (
        <div className="text-center py-10 rounded-xl border border-border bg-card mb-4">
          <Package className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No extras or services available</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Continue to the next step to proceed with your booking.</p>
        </div>
      )}

      {extrasRunningTotal > 0 && (
        <div className="sticky bottom-0 -mx-6 sm:-mx-8 -mb-2 px-6 sm:px-8 py-3 bg-card border-t border-border/50 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="w-4 h-4" />
            Add-ons total{days > 0 ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}
          </div>
          <span className="text-sm font-bold text-white">+{extrasRunningTotal.toLocaleString()} {extrasCurrency}</span>
        </div>
      )}

      <div className="pt-6 border-t border-border/30 mt-2 flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={onNext}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 3: Insurance ────────────────────────────────────────────────────────

const FULL_PLAN = INSURANCE_PLANS.find((p) => p.id === "full")!;
const FULL_VISUAL = INSURANCE_VISUAL.full;

function Step3({ form, setForm, onNext, onBack }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onNext: () => void; onBack: () => void;
}) {
  // Auto-select Full if nothing is already chosen (respects session-restored value)
  useEffect(() => {
    if (!form.insurancePlan) {
      setForm((f) => ({ ...f, insurancePlan: "full" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate() {
    if (!form.insurancePlan) { toast({ title: "Please select an insurance plan", variant: "destructive" }); return; }
    onNext();
  }

  const selected = form.insurancePlan === "full" || !form.insurancePlan;

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Insurance Plan</h2>
      <p className="text-muted-foreground text-sm mb-6">Full Insurance is activated without any additional fee.</p>

      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 pb-2 border-b border-border/50">
        <Shield className="w-3.5 h-3.5 text-primary" />
        Your Coverage
      </div>

      {/* Single Full Insurance card */}
      <div className={cn(
        "relative w-full rounded-xl border-2 p-5 shadow-lg mb-6",
        FULL_VISUAL.activeBorder, FULL_VISUAL.activeBg,
      )}>
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center shadow-sm bg-blue-400">
          <Check className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className={cn("w-12 h-12 rounded-xl border flex items-center justify-center shrink-0", FULL_VISUAL.iconWrapper)}>
            <Shield className={cn("w-6 h-6", FULL_VISUAL.iconColor)} />
          </div>
          <div>
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", FULL_VISUAL.tierColor)}>
              {FULL_VISUAL.tierLabel}
            </span>
            <div className="font-bold text-white text-lg leading-tight">{FULL_PLAN.label} Insurance</div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{FULL_PLAN.desc}</p>

        {/* Detail grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {/* Covered */}
          <div className="rounded-xl bg-blue-500/10 border border-blue-400/20 p-4">
            <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> What's Covered
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex gap-2"><span className="text-blue-400 shrink-0 mt-0.5">✓</span> Third-party liability</li>
              <li className="flex gap-2"><span className="text-blue-400 shrink-0 mt-0.5">✓</span> Collision damage (excess applies)</li>
              <li className="flex gap-2"><span className="text-blue-400 shrink-0 mt-0.5">✓</span> Theft protection</li>
              <li className="flex gap-2"><span className="text-blue-400 shrink-0 mt-0.5">✓</span> Windscreen &amp; glass</li>
              <li className="flex gap-2"><span className="text-blue-400 shrink-0 mt-0.5">✓</span> 24/7 roadside assistance</li>
            </ul>
          </div>
          {/* Not covered */}
          <div className="rounded-xl bg-secondary/20 border border-border p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" /> Not Covered
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex gap-2"><span className="text-destructive/70 shrink-0 mt-0.5">✗</span> Driver negligence or recklessness</li>
              <li className="flex gap-2"><span className="text-destructive/70 shrink-0 mt-0.5">✗</span> Driving under influence (DUI)</li>
              <li className="flex gap-2"><span className="text-destructive/70 shrink-0 mt-0.5">✗</span> Restricted zones (Abkhazia etc.)</li>
              <li className="flex gap-2"><span className="text-destructive/70 shrink-0 mt-0.5">✗</span> Intentional damage</li>
              <li className="flex gap-2"><span className="text-destructive/70 shrink-0 mt-0.5">✗</span> Personal belongings</li>
            </ul>
          </div>
        </div>

        {/* Deposit / Excess */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-blue-400/20">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Security Deposit</div>
            <div className={cn("text-2xl font-black", FULL_VISUAL.iconColor)}>{FULL_PLAN.deposit}€</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Pre-authorised at pickup</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">Damage Excess</div>
            <div className={cn("text-2xl font-black", FULL_VISUAL.iconColor)}>{FULL_PLAN.excess}€</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Max liability if damage occurs</div>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-secondary/20 border border-border text-xs text-muted-foreground mb-6 flex gap-3">
        <Shield className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <span>Deposit is pre-authorised at pickup and fully refunded upon return of the vehicle in good condition.</span>
      </div>

      <div className="pt-6 border-t border-border/30 mt-2 flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={validate}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 4: Customer Info ────────────────────────────────────────────────────

function Step4({ form, setForm, onNext, onBack }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; onNext: () => void; onBack: () => void;
}) {
  const [legalModal, setLegalModal] = useState<LegalModalType>(null);

  function validate() {
    if (!form.firstName.trim()) { toast({ title: "First name is required", variant: "destructive" }); return; }
    if (!form.lastName.trim()) { toast({ title: "Last name is required", variant: "destructive" }); return; }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast({ title: "Valid email address is required", variant: "destructive" }); return; }
    if (!form.phone.trim()) { toast({ title: "Phone number is required", variant: "destructive" }); return; }
    if (!form.agreeToTerms) { toast({ title: "Please accept the Terms & Conditions to continue", variant: "destructive" }); return; }
    if (!form.agreeToPrivacy) { toast({ title: "Please accept the Privacy Policy to continue", variant: "destructive" }); return; }
    onNext();
  }
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Your Information</h2>
      <p className="text-muted-foreground text-sm mb-6">We need your details to confirm the booking</p>

      {/* Section: Personal Details */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 pb-2 border-b border-border/50">
          <Users className="w-3.5 h-3.5 text-primary" />
          Personal Details
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div><FieldLabel required>First Name</FieldLabel><Inp value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></div>
          <div><FieldLabel required>Last Name</FieldLabel><Inp value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel required>Email Address</FieldLabel>
            <Inp type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Use your real email address so you can receive your booking confirmation and voucher.
            </p>
          </div>
          <div>
            <FieldLabel required>Phone Number</FieldLabel>
            <Inp type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            {/* WhatsApp inline toggle */}
            <label className="flex items-center gap-2 mt-2 cursor-pointer w-fit">
              <Checkbox
                checked={form.whatsAppOptIn}
                onChange={() => setForm((f) => ({ ...f, whatsAppOptIn: !f.whatsAppOptIn }))}
              />
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                Available on WhatsApp
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Section: Trip Details */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 pb-2 border-b border-border/50">
          <Car className="w-3.5 h-3.5 text-primary" />
          Trip Details
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <FieldLabel>Nationality</FieldLabel>
            <CountrySelect value={form.nationality} onChange={(v) => setForm((f) => ({ ...f, nationality: v }))} />
          </div>
          <div>
            <FieldLabel>Age</FieldLabel>
            <Inp
              type="number" min="21" max="70"
              value={form.age}
              onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
              className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <p className="text-xs text-muted-foreground mt-1">Minimum age: 21 · Maximum age: 70</p>
          </div>
        </div>
        <div>
          <FieldLabel>Flight Number</FieldLabel>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Inp value={form.flightNumber} onChange={(e) => setForm((f) => ({ ...f, flightNumber: e.target.value }))} className="pl-9" />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Helps us track your arrival for smooth pickup</p>
        </div>
      </div>

      {/* Section: Preferences */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 pb-2 border-b border-border/50">
          <MessageCircle className="w-3.5 h-3.5 text-primary" />
          Preferences
        </div>
        <div>
          <FieldLabel>Special Requests / Notes</FieldLabel>
          <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3}
            className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/60 transition-colors" />
        </div>
      </div>

      {/* Promo Code */}
      <PromoField form={form} setForm={setForm} />

      {/* Terms & Privacy */}
      <div className="mb-6 space-y-3">
        <div
          className="flex items-start gap-3 cursor-pointer p-4 bg-secondary/20 border border-border rounded-xl hover:border-primary/30 transition-colors"
          onClick={() => setForm((f) => ({ ...f, agreeToTerms: !f.agreeToTerms }))}
        >
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={form.agreeToTerms} onChange={() => setForm((f) => ({ ...f, agreeToTerms: !f.agreeToTerms }))} />
          </div>
          <span className="text-sm text-muted-foreground leading-relaxed">
            I have read and agree to the{" "}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLegalModal("terms"); }}
              className="text-primary hover:underline font-medium"
            >Terms &amp; Conditions</button>.
            {" "}I confirm I am at least 21 years old and hold a valid driving licence.
          </span>
        </div>
        <div
          className="flex items-start gap-3 cursor-pointer p-4 bg-secondary/20 border border-border rounded-xl hover:border-primary/30 transition-colors"
          onClick={() => setForm((f) => ({ ...f, agreeToPrivacy: !f.agreeToPrivacy }))}
        >
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={form.agreeToPrivacy} onChange={() => setForm((f) => ({ ...f, agreeToPrivacy: !f.agreeToPrivacy }))} />
          </div>
          <span className="text-sm text-muted-foreground leading-relaxed">
            I have read and agree to the{" "}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setLegalModal("privacy"); }}
              className="text-primary hover:underline font-medium"
            >Privacy Policy</button>
            {" "}and consent to the processing of my personal data for the purpose of this booking.
          </span>
        </div>
      </div>

      <div className="pt-6 border-t border-border/30 mt-2 flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={validate}>Continue →</Btn>
      </div>

      {/* Legal modal — zero interaction with form state or sessionStorage */}
      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  );
}

// ─── Step 5: Payment Method ───────────────────────────────────────────────────

const PRIMARY_PAYMENT_OPTIONS = [
  {
    id: "Pay on Arrival",
    label: "Pay on Arrival",
    desc: "No payment required now. Settle in full at vehicle pickup using your preferred method (cash, card, or transfer).",
    icon: <Banknote className="w-6 h-6 text-primary" />,
    recommended: true,
  },
];

const OTHER_PAYMENT_METHODS = [
  "Cash", "Credit Card", "Debit Card", "Bank Transfer",
  "Revolut", "Apple Pay", "Google Pay", "AMEX", "Other",
];

function Step5({ form, setForm, onNext, onBack }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; onNext: () => void; onBack: () => void;
}) {
  const [showOther, setShowOther] = useState(false);

  useEffect(() => {
    if (form.paymentMethod === "Pay on Arrival") setShowOther(true);
  }, [form.paymentMethod]);

  function validate() {
    if (!form.paymentMethod) { toast({ title: "Please select a payment method", variant: "destructive" }); return; }
    onNext();
  }

  const isPrimary = PRIMARY_PAYMENT_OPTIONS.some((o) => o.id === form.paymentMethod);
  const isOther = form.paymentMethod && !isPrimary;

  const selArrival = form.paymentMethod === "Pay on Arrival";

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Payment Method</h2>
      <p className="text-muted-foreground text-sm mb-6">Choose how you'd like to handle payment for your rental</p>

      <div className="grid grid-cols-1 gap-4 mb-5">

        {/* ── Pay on Arrival ── PRIMARY option */}
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, paymentMethod: "Pay on Arrival" }))}
          className={cn(
            "relative w-full text-left rounded-xl border-2 p-5 transition-all duration-200 flex flex-col",
            selArrival
              ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
              : "border-border bg-card hover:border-primary/40"
          )}
        >
          {/* Recommended badge */}
          <span className="absolute -top-3 left-4 inline-flex items-center gap-1 bg-green-500/20 border border-green-500/30 text-green-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
            <Check className="w-2.5 h-2.5" /> Recommended · No charge now
          </span>

          <div className="flex items-start justify-between gap-3 mb-3 mt-1">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-colors duration-200",
              selArrival ? "bg-primary/20 border-primary/30" : "bg-primary/10 border-primary/15"
            )}>
              <Banknote className="w-6 h-6 text-primary" />
            </div>
            {selArrival && (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </div>

          <div className="font-bold text-white text-base mb-1">Pay on Arrival</div>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            No payment required now. Settle in full at vehicle pickup using your preferred method.
          </p>

          {/* Accepted at pickup */}
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {["Cash", "Card", "Bank Transfer"].map((m) => (
              <span key={m} className="text-[10px] text-muted-foreground bg-secondary/50 border border-border/50 rounded-full px-2 py-0.5">{m}</span>
            ))}
          </div>
        </button>
      </div>

      {/* At-pickup payment methods */}
      <div className="mb-5">
        <button
          type="button"
          onClick={() => setShowOther((v) => !v)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors mb-3"
        >
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", showOther && "rotate-180")} />
          {showOther ? "Hide pickup payment options" : "At pickup you can also use:"}
        </button>

        {(showOther || isOther) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {OTHER_PAYMENT_METHODS.map((method) => {
              const selected = form.paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, paymentMethod: method }))}
                  className={cn(
                    "w-full text-center rounded-lg border px-3 py-2.5 text-xs font-medium transition-all duration-200",
                    selected
                      ? "border-primary bg-primary/10 text-white shadow-sm shadow-primary/20"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-white"
                  )}
                >
                  {selected && <Check className="w-3 h-3 inline mr-1 text-primary" />}
                  {method}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Trust block */}
      <div className="rounded-xl bg-secondary/20 border border-border mb-6 overflow-hidden">
        <div className="p-4 flex gap-3">
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <span className="text-xs text-muted-foreground leading-relaxed">
            No payment is charged to submit your booking request. You will only be charged upon vehicle pickup or as separately agreed.
          </span>
        </div>
        <div className="border-t border-border/50 px-4 py-2.5 flex flex-wrap gap-3">
          {[
            { icon: <Lock className="w-3 h-3" />, label: "SSL Encrypted" },
            { icon: <Check className="w-3 h-3" />, label: "No card required now" },
            { icon: <Check className="w-3 h-3" />, label: "Cancel anytime*" },
          ].map(({ icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="text-primary">{icon}</span> {label}
            </span>
          ))}
        </div>
      </div>

      <div className="pt-6 border-t border-border/30 mt-2 flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={validate}>Review & Confirm →</Btn>
      </div>
    </div>
  );
}

// ─── Step 6: Confirmation ─────────────────────────────────────────────────────

function Step6({ form, models, locations, extras, onBack, onDone, goToStep }: {
  form: FormData; models: VehicleModel[]; locations: Location[]; extras: Extra[];
  onBack: () => void; onDone: (result: BookingResult) => void; goToStep: (n: number) => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotePending, setQuotePending] = useState(true);
  const [resolvedQuote, setResolvedQuote] = useState<Quote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch("/api/public/quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleModelId: Number(form.vehicleModelId),
        pickupDatetime: form.pickupDatetime,
        dropoffDatetime: form.dropoffDatetime,
        pickupLocationId: form.pickupLocationId ? Number(form.pickupLocationId) : undefined,
        dropoffLocationId: form.dropoffLocationId ? Number(form.dropoffLocationId) : undefined,
        extras: form.extras.length > 0 ? form.extras : undefined,
        promoCode: form.promoCode.trim() || undefined,
      }),
    })
      .then((r) => r.json())
      .then((q: Quote) => { setQuote(q); setResolvedQuote(q); })
      .catch(() => setQuote(null))
      .finally(() => setQuotePending(false));
  }, []);

  async function submit() {
    setSubmitting(true);
    try {
      const insurancePlanObj = INSURANCE_PLANS.find((p) => p.id === form.insurancePlan);
      const data = await apiFetch("/api/public/bookings", {
        method: "POST",
        body: JSON.stringify({
          pickupLocationId: Number(form.pickupLocationId),
          dropoffLocationId: Number(form.dropoffLocationId),
          pickupDatetime: form.pickupDatetime,
          dropoffDatetime: form.dropoffDatetime,
          vehicleModelId: Number(form.vehicleModelId),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          nationality: form.nationality.trim() || undefined,
          notes: form.notes.trim() || undefined,
          paymentMethod: form.paymentMethod || undefined,
          insurancePlan: insurancePlanObj?.label ?? form.insurancePlan,
          promoCode: form.promoCode || undefined,
          extras: form.extras.length > 0 ? form.extras : undefined,
          whatsAppOptIn: form.whatsAppOptIn || undefined,
          age: form.age.trim() || undefined,
          flightNumber: form.flightNumber.trim() || undefined,
          resolvedRateId: resolvedQuote?.rateId ?? null,
          resolvedRateTierId: resolvedQuote?.rateTierId ?? null,
          resolvedBaseRate: resolvedQuote?.basePricePerDay ?? null,
          resolvedTotal: resolvedQuote?.estimatedTotal ?? null,
          resolvedOneWayFee: resolvedQuote?.oneWayFee ?? null,
          currency: resolvedQuote?.baseCurrency ?? undefined,
        }),
      });
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
      try { sessionStorage.removeItem(BOOKING_DRAFT_KEY); } catch { /* ignore */ }
    } catch (err: any) {
      toast({ title: "Booking failed", description: err.message ?? "Please try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const model = models.find((m) => String(m.id) === form.vehicleModelId);
  const pickupLoc = locations.find((l) => String(l.id) === form.pickupLocationId);
  const dropoffLoc = locations.find((l) => String(l.id) === form.dropoffLocationId);
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);
  const insurance = INSURANCE_PLANS.find((p) => p.id === form.insurancePlan);
  const selectedExtras = form.extras
    .map((se) => ({ extra: extras.find((e) => e.id === se.extraId), qty: se.quantity }))
    .filter((x) => x.extra);
  const cur = quote?.baseCurrency ?? "GEL";
  const fmt = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

  function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
      <div className="flex justify-between py-2 border-b border-border last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn("text-sm font-medium text-right max-w-[55%]", highlight ? "text-primary font-bold" : "text-white")}>{value}</span>
      </div>
    );
  }

  const pickupCity = pickupLoc?.city ?? "";
  const pickupInstructions = CITY_PICKUP_INSTRUCTIONS[pickupCity] ?? "Our team will contact you shortly to confirm pickup details.";

  // ── Success state ──
  if (result) {

    return (
      <div className="py-2">
        {/* Success header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Booking Request Received!</h2>
          <p className="text-muted-foreground max-w-sm mx-auto text-sm leading-relaxed">
            We've received your booking and will confirm via email shortly.
          </p>
        </div>

        {/* Reference hero */}
        <div className="bg-gradient-to-b from-primary/20 to-primary/5 border border-primary/30 rounded-2xl p-6 mb-5 text-center">
          <div className="text-xs font-semibold text-primary/70 uppercase tracking-wider mb-2">Your Booking Reference</div>
          <div className="text-4xl font-black text-white tracking-widest mb-3">{result.reference}</div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(result.reference).catch(() => {})}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mb-4"
          >
            <Copy className="w-3 h-3" /> Copy reference number
          </button>
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-full px-4 py-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
              <span className="text-amber-400 text-xs font-semibold">Pending Confirmation</span>
            </span>
          </div>
        </div>

        {/* Trip timeline */}
        <div className="bg-card border border-border rounded-xl p-5 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5 text-primary" />
            Trip Summary
          </div>
          <div className="relative pl-7">
            {/* Vertical line */}
            <div className="absolute left-3 top-3 bottom-3 w-px bg-border" />
            {/* Milestone: Booking received */}
            <div className="relative mb-5">
              <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-green-400 border-2 border-card" />
              <div className="text-xs font-semibold text-green-400 uppercase tracking-wide">Booking Received</div>
              <div className="text-xs text-muted-foreground mt-0.5">Reference: <span className="text-white font-mono">{result.reference}</span></div>
            </div>
            {/* Milestone: Vehicle */}
            <div className="relative mb-5">
              <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-primary/70 border-2 border-card" />
              <div className="text-xs font-semibold text-primary uppercase tracking-wide">Vehicle</div>
              <div className="text-sm text-white mt-0.5">{result.vehicle}</div>
            </div>
            {/* Milestone: Pickup */}
            <div className="relative mb-5">
              <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-primary border-2 border-card" />
              <div className="text-xs font-semibold text-primary uppercase tracking-wide">Pickup</div>
              <div className="text-sm text-white mt-0.5">{formatDT(result.pickupDatetime)}</div>
              {pickupLoc && <div className="text-xs text-muted-foreground">{pickupLoc.name}, {pickupLoc.city}</div>}
            </div>
            {/* Milestone: Return */}
            <div className="relative">
              <div className="absolute -left-4 top-1 w-3 h-3 rounded-full bg-border border-2 border-card" />
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Return</div>
              <div className="text-sm text-white mt-0.5">{formatDT(result.dropoffDatetime)}</div>
              {dropoffLoc && <div className="text-xs text-muted-foreground">{dropoffLoc.name}, {dropoffLoc.city}</div>}
              {days > 0 && <div className="text-xs text-primary font-medium mt-0.5">{days} {days === 1 ? "day" : "days"} total</div>}
            </div>
          </div>
        </div>

        {/* Extras */}
        {selectedExtras.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Add-ons & Extras</div>
            {selectedExtras.map(({ extra, qty }) => {
              const multiplier = extra!.pricing_type === "per_booking" ? 1 : days;
              const cost = Number(extra!.price) * qty * multiplier;
              const perLabel = extra!.pricing_type === "per_booking" ? "per booking" : "per day";
              return (
                <SummaryRow
                  key={extra!.id}
                  label={`${extra!.name}${qty > 1 ? ` ×${qty}` : ""} (${Number(extra!.price).toLocaleString()} ${cur} ${perLabel})`}
                  value={fmt(cost)}
                />
              );
            })}
          </div>
        )}

        {/* Insurance */}
        {insurance && (
          <div className="bg-card border border-border rounded-xl p-4 mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Insurance</div>
            <SummaryRow label="Plan" value={`${insurance.label} Cover`} />
            <SummaryRow label="Deposit" value={`${insurance.deposit}€`} />
            <SummaryRow label="Excess" value={`${insurance.excess}€`} />
          </div>
        )}

        {/* Pricing total */}
        {quote?.quotable ? (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-3">Pricing Estimate</div>
            <SummaryRow label={`Base rate (${quote.basePricePerDay?.toLocaleString()} ${cur}/day × ${days} days)`} value={fmt(quote.baseTotal!)} />
            {selectedExtras.map(({ extra, qty }) => {
              const multiplier = extra!.pricing_type === "per_booking" ? 1 : days;
              return <SummaryRow key={extra!.id} label={`${extra!.name} ×${qty}`} value={fmt(Number(extra!.price) * qty * multiplier)} />;
            })}
            {form.promoCode && quote.discountAmount != null && quote.discountAmount > 0 && (
              <SummaryRow label={`Promo (${form.promoCode})`} value={`−${fmt(quote.discountAmount)}`} />
            )}
            {quote.oneWayFee != null && quote.oneWayFee > 0 && (
              <SummaryRow label="One Way Fee (Drop off in different location)" value={fmt(quote.oneWayFee)} />
            )}
            <div className="flex justify-between pt-3 mt-1 border-t border-primary/20">
              <span className="text-sm font-semibold text-white">Estimated Total</span>
              <span className="text-base font-bold text-primary">{fmt(quote.estimatedTotal!)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Final pricing confirmed before any charge.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-4 mb-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pricing</div>
            <p className="text-xs text-muted-foreground">Our team will contact you with pricing details shortly.</p>
          </div>
        )}

        {/* Customer details */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your Details</div>
          <SummaryRow label="Name" value={`${form.firstName} ${form.lastName}`} />
          <SummaryRow label="Email" value={form.email} />
          <SummaryRow label="Phone" value={form.phone} />
          {form.whatsAppOptIn && <SummaryRow label="WhatsApp" value="Yes (at phone number above)" />}
          {form.age && <SummaryRow label="Age" value={form.age} />}
          {form.nationality && <SummaryRow label="Nationality" value={form.nationality} />}
          {form.flightNumber && <SummaryRow label="Flight Number" value={form.flightNumber} />}
          {form.paymentMethod && <SummaryRow label="Payment Method" value={form.paymentMethod} />}
          {form.notes && <SummaryRow label="Notes" value={form.notes} />}
        </div>

        {/* Pickup instructions */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Pickup Instructions</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{pickupInstructions}</p>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-secondary/20 border border-border rounded-xl p-4 mb-5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Need Help?</div>
          <div className="flex flex-wrap gap-3">
            <a href="tel:+995557376363" className="flex items-center gap-2 text-sm text-white hover:text-primary transition-colors">
              <Phone className="w-4 h-4 text-primary" />
              +995 557 37 63 63
            </a>
            <a href="mailto:reservations@tbilisicars.com" className="flex items-center gap-2 text-sm text-white hover:text-primary transition-colors">
              <MessageCircle className="w-4 h-4 text-primary" />
              reservations@tbilisicars.com
            </a>
          </div>
        </div>

        {/* Bottom CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link href="/"
            className="flex-1 inline-flex items-center justify-center gap-2 bg-card border border-border hover:border-primary/40 active:scale-95 text-white font-semibold px-4 py-3 rounded-xl transition-all duration-150 text-sm">
            Return to Home
          </Link>
          <button
            type="button"
            onClick={() => onDone(result)}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-primary hover:bg-accent active:scale-95 text-white font-semibold px-4 py-3 rounded-xl transition-all duration-150 text-sm shadow-sm hover:shadow-md hover:shadow-primary/25">
            Make Another Booking
          </button>
        </div>
      </div>
    );
  }

  // ── Review state ──
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Review Your Booking</h2>
      <p className="text-muted-foreground text-sm mb-5">Check every detail before confirming your request</p>

      {/* Trust strip */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { icon: <Check className="w-3 h-3" />, label: "No hidden fees" },
          { icon: <Check className="w-3 h-3" />, label: "Free cancellation*" },
          { icon: <Check className="w-3 h-3" />, label: "24/7 support" },
        ].map(({ icon, label }) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1.5">
            {icon} {label}
          </span>
        ))}
      </div>

      {/* Two-column sticky layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] lg:gap-6 lg:items-start mb-4">

        {/* ── LEFT: scrollable content ── */}
        <div className="space-y-4 mb-4 lg:mb-0">

          {/* Vehicle */}
          {model && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Car className="w-3.5 h-3.5 text-primary" />Vehicle</span>
                <button type="button" onClick={() => goToStep(1)} className="text-xs text-primary hover:underline focus:outline-none">Edit</button>
              </div>
              {model.image_url && (
                <div className="w-full h-28 rounded-lg overflow-hidden mb-3">
                  <VehicleImg src={toStorageSrc(model.image_url)} alt={`${model.brand} ${model.model}`} className="w-full h-full object-contain p-3" />
                </div>
              )}
              <SummaryRow label="Car" value={`${model.brand} ${model.model}`} />
              {model.category && <SummaryRow label="Category" value={model.category} />}
              {model.transmission && <SummaryRow label="Transmission" value={transLabel(model.transmission) ?? ""} />}
            </div>
          )}

          {/* Trip Details */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-primary" />Trip Details</span>
              <button type="button" onClick={() => goToStep(1)} className="text-xs text-primary hover:underline focus:outline-none">Edit</button>
            </div>
            <SummaryRow label="Pickup" value={`${pickupLoc?.name ?? "—"}, ${pickupLoc?.city ?? ""}`} />
            <SummaryRow label="Drop-off" value={`${dropoffLoc?.name ?? "—"}, ${dropoffLoc?.city ?? ""}`} />
            <SummaryRow label="Pickup date" value={formatDT(form.pickupDatetime)} />
            <SummaryRow label="Return date" value={formatDT(form.dropoffDatetime)} />
            <SummaryRow label="Duration" value={`${days} ${days === 1 ? "day" : "days"}`} />
          </div>

          {/* Customer details */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" />Your Details</span>
              <button type="button" onClick={() => goToStep(4)} className="text-xs text-primary hover:underline focus:outline-none">Edit</button>
            </div>
            <SummaryRow label="Name" value={`${form.firstName} ${form.lastName}`} />
            <SummaryRow label="Email" value={form.email} />
            <SummaryRow label="Phone" value={form.phone} />
            {form.whatsAppOptIn && <SummaryRow label="WhatsApp" value="Yes (at phone number above)" />}
            {form.age && <SummaryRow label="Age" value={form.age} />}
            {form.nationality && <SummaryRow label="Nationality" value={form.nationality} />}
            {form.flightNumber && <SummaryRow label="Flight Number" value={form.flightNumber} />}
            {form.paymentMethod && <SummaryRow label="Payment" value={form.paymentMethod} />}
            {form.notes && <SummaryRow label="Notes" value={form.notes} />}
          </div>

          {/* Important Information */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-primary" />Important Information
            </div>
            <div className="space-y-3">
              {/* Pickup instructions */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-white mb-0.5">Pickup Instructions</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{pickupInstructions}</p>
                </div>
              </div>
              {/* Deposit */}
              {insurance && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
                  <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white mb-0.5">Security Deposit</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      A deposit of <span className="text-white font-medium">{insurance.deposit}€</span> will be authorised on your card at vehicle pickup and released upon return in good condition.
                    </p>
                  </div>
                </div>
              )}
              {/* What happens next */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
                <Phone className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-white mb-0.5">What Happens Next</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    We'll send a confirmation to <span className="text-white">{form.email}</span>. Our team will call you before your pickup date to confirm all details.
                  </p>
                </div>
              </div>
              {/* Cancellation */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/20">
                <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-white mb-0.5">Cancellation Policy</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Free cancellation when notified at least 24 hours before your scheduled pickup. Contact us via phone or email.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed px-1">
            * Free cancellation subject to 24-hour notice before pickup. Final pricing confirmed before any charge is made.
          </p>
        </div>

        {/* ── RIGHT: sticky summary + CTA ── */}
        <div className="lg:sticky lg:top-6 space-y-4">

          {/* Pricing breakdown */}
          {quotePending ? (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Price Breakdown</div>
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-5 bg-muted/50 rounded animate-pulse" />)}</div>
            </div>
          ) : quote?.quotable ? (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-3 flex items-center gap-1.5">
                Price Breakdown
              </div>
              <SummaryRow label={`Base rate (${quote.basePricePerDay?.toLocaleString()} ${cur}/day × ${days} days)`} value={fmt(quote.baseTotal!)} />
              {selectedExtras.map(({ extra, qty }) => {
                const multiplier = extra!.pricing_type === "per_booking" ? 1 : days;
                return <SummaryRow key={extra!.id} label={`${extra!.name} ×${qty}`} value={fmt(Number(extra!.price) * qty * multiplier)} />;
              })}
              {form.promoCode && quote.discountAmount != null && quote.discountAmount > 0 && (
                <SummaryRow label={`Promo (${form.promoCode})`} value={`−${fmt(quote.discountAmount)}`} />
              )}
              {quote.oneWayFee != null && quote.oneWayFee > 0 && (
                <SummaryRow label="One Way Fee (Drop off in different location)" value={fmt(quote.oneWayFee)} />
              )}
              <div className="flex justify-between pt-3 mt-1 border-t border-primary/20">
                <span className="text-sm font-semibold text-white">Estimated Total</span>
                <span className="text-base font-bold text-primary">{fmt(quote.estimatedTotal!)}</span>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pricing</div>
              {selectedExtras.length > 0 && selectedExtras.map(({ extra, qty }) => {
                const multiplier = extra!.pricing_type === "per_booking" ? 1 : days;
                return <SummaryRow key={extra!.id} label={extra!.name} value={`${(Number(extra!.price) * qty * multiplier).toLocaleString()} ${cur}`} />;
              })}
              <p className="text-xs text-muted-foreground mt-2">Base rate confirmed by our team.</p>
            </div>
          )}

          {/* Insurance summary */}
          {insurance && (
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" />Insurance</span>
                <button type="button" onClick={() => goToStep(3)} className="text-xs text-primary hover:underline focus:outline-none">Edit</button>
              </div>
              <SummaryRow label="Plan" value={`${insurance.label} Cover`} />
              <SummaryRow label="Deposit" value={`${insurance.deposit}€`} />
              <SummaryRow label="Excess" value={`${insurance.excess}€`} />
            </div>
          )}

          {/* Urgency text */}
          <p className="text-xs text-amber-400/80 italic text-center px-1">
            Availability may change — secure your booking now
          </p>

          {/* CTA panel */}
          <div className="bg-gradient-to-b from-primary/15 to-primary/5 border border-primary/30 rounded-xl p-5">
            {quote?.quotable && (
              <div className="text-center mb-4 pb-4 border-b border-primary/20">
                <div className="text-xs text-muted-foreground mb-1">Estimated Total</div>
                <div className="text-3xl font-black text-white leading-none">
                  {quote.estimatedTotal?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-base font-semibold text-primary ml-2">{cur}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1.5">No payment required now — pay on arrival</div>
              </div>
            )}
            <Btn onClick={submit} loading={submitting} className="w-full justify-center py-3 text-base">
              Confirm Booking Request →
            </Btn>
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="w-full text-xs text-muted-foreground hover:text-white text-center mt-3 transition-colors disabled:opacity-40"
            >
              <ChevronLeft className="w-3 h-3 inline mr-0.5" /> Back to Payment
            </button>
          </div>

          {/* Need help */}
          <div className="bg-secondary/20 border border-border rounded-xl p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Need Help?</div>
            <div className="space-y-2">
              <a href="tel:+995557376363" className="flex items-center gap-2 text-sm text-white hover:text-primary transition-colors">
                <Phone className="w-4 h-4 text-primary shrink-0" /> +995 557 37 63 63
              </a>
              <a href="mailto:reservations@tbilisicars.com" className="flex items-center gap-2 text-sm text-white hover:text-primary transition-colors">
                <MessageCircle className="w-4 h-4 text-primary shrink-0" /> reservations@tbilisicars.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Booking() {
  const getInitialForm = useCallback((): FormData => {
    const p = new URLSearchParams(window.location.search);
    return {
      pickupLocationId: p.get("pickupLocationId") ?? "",
      dropoffLocationId: p.get("dropoffLocationId") ?? "",
      pickupDatetime: p.get("pickupDatetime") ?? "",
      dropoffDatetime: p.get("dropoffDatetime") ?? "",
      vehicleModelId: p.get("vehicleModelId") ?? "",
      extras: [], promoCode: "",
      insurancePlan: "",
      firstName: "", lastName: "", email: "", phone: "", nationality: "", notes: "",
      whatsAppOptIn: false, age: "", flightNumber: "",
      agreeToTerms: false, agreeToPrivacy: false,
      paymentMethod: "",
    };
  }, []);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(getInitialForm);

  // ── Session draft restore (mount-only) ──────────────────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BOOKING_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { step: number; form: FormData };
        if (draft.step && draft.form) {
          setStep(draft.step);
          setForm(draft.form);
        }
      }
    } catch { /* ignore parse/storage errors */ }
  }, []); // mount only — runs once before config loads

  // ── Session draft save (runs on every step or form change) ──────────────────
  useEffect(() => {
    try {
      sessionStorage.setItem(BOOKING_DRAFT_KEY, JSON.stringify({ step, form }));
    } catch { /* ignore quota/storage errors */ }
  }, [step, form]);

  // ── Lifted quote state (used by sidebar on steps 1–5) ──────────────────────
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!form.vehicleModelId || !form.pickupDatetime || !form.dropoffDatetime) {
      setQuote(null);
      return;
    }
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    quoteTimerRef.current = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const q = await apiFetch("/api/public/quote", {
          method: "POST",
          body: JSON.stringify({
            vehicleModelId: Number(form.vehicleModelId),
            pickupDatetime: form.pickupDatetime,
            dropoffDatetime: form.dropoffDatetime,
            pickupLocationId: form.pickupLocationId ? Number(form.pickupLocationId) : undefined,
            dropoffLocationId: form.dropoffLocationId ? Number(form.dropoffLocationId) : undefined,
            extras: form.extras.length > 0 ? form.extras : undefined,
            promoCode: form.promoCode.trim() || undefined,
          }),
        });
        setQuote(q);
      } catch {
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 600);
    return () => { if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current); };
  }, [form.vehicleModelId, form.pickupDatetime, form.dropoffDatetime, form.pickupLocationId, form.dropoffLocationId, form.extras, form.promoCode]);
  // ───────────────────────────────────────────────────────────────────────────

  const configDays = calcDays(form.pickupDatetime, form.dropoffDatetime);
  const { data: config, isLoading, isFetching: configFetching, error } = useQuery<BookingConfig>({
    queryKey: [
      "booking-config",
      form.pickupLocationId || null,
      form.pickupDatetime || null,
      form.dropoffDatetime || null,
      configDays > 0 ? configDays : null,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (form.pickupLocationId) params.set("location_id", form.pickupLocationId);
      if (form.pickupDatetime) params.set("pickup_datetime", form.pickupDatetime);
      if (form.dropoffDatetime) params.set("dropoff_datetime", form.dropoffDatetime);
      if (configDays > 0) params.set("days", String(configDays));
      const qs = params.toString();
      return apiFetch(qs ? `/api/public/booking-config?${qs}` : "/api/public/booking-config");
    },
  });

  // ── One-shot config validation after first load (guards restored IDs) ────────
  const configValidatedRef = useRef(false);
  useEffect(() => {
    if (!config || configValidatedRef.current) return;
    configValidatedRef.current = true;

    const locationIds = new Set((config.locations ?? []).map((l) => String(l.id)));
    const modelIds = new Set((config.vehicleModels ?? []).map((m) => String(m.id)));

    // Read current form values at validation time (closure capture is safe here —
    // this effect intentionally fires only once when config first resolves)
    setForm((currentForm) => {
      const modelInvalid = !!currentForm.vehicleModelId && !modelIds.has(currentForm.vehicleModelId);
      const pickupInvalid = !!currentForm.pickupLocationId && !locationIds.has(currentForm.pickupLocationId);
      const dropoffInvalid = !!currentForm.dropoffLocationId && !locationIds.has(currentForm.dropoffLocationId);

      if (!modelInvalid && !pickupInvalid && !dropoffInvalid) return currentForm;

      setTimeout(() => {
        setStep(1);
        toast({ title: "Session restored — please re-confirm your vehicle selection." });
      }, 0);

      return {
        ...currentForm,
        vehicleModelId: modelInvalid ? "" : currentForm.vehicleModelId,
        pickupLocationId: pickupInvalid ? "" : currentForm.pickupLocationId,
        dropoffLocationId: dropoffInvalid ? "" : currentForm.dropoffLocationId,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]); // intentionally omit form — effect runs once, form is read via functional setForm

  function next() { setStep((s) => s + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function back() { setStep((s) => s - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function goToStep(n: number) { setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function reset() {
    setStep(1);
    setForm(getInitialForm());
    window.scrollTo({ top: 0, behavior: "smooth" });
    try { sessionStorage.removeItem(BOOKING_DRAFT_KEY); } catch { /* ignore */ }
  }

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      <p className="text-sm text-muted-foreground">Loading your booking…</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div><p className="text-destructive mb-2">Unable to load booking form.</p><p className="text-sm text-muted-foreground">Please try again later.</p></div>
    </div>
  );

  const models = config?.vehicleModels ?? [];
  const locations = sortLocations(config?.locations ?? []);
  const extras = config?.extras ?? [];

  // ── Step 1: dedicated layout — stepper above, true left-rail + vehicle grid ──
  if (step === 1) {
    return (
      <div className="min-h-screen py-6 px-4">
        <div className="mx-auto max-w-7xl">
          {/* Unified header card: title + subtitle + step progress row */}
          <div className="bg-card border border-border rounded-2xl px-6 pt-6 pb-4 mb-6">
            <div className="text-center mb-4">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Choose Your Perfect Car</h1>
              <p className="text-sm text-primary">Fill in the fields and follow the steps to complete your booking.</p>
            </div>
            <StepBar step={step} onGoTo={(n) => goToStep(n)} />
          </div>
          {/* Mobile collapsible pricing summary */}
          <div className="lg:hidden mb-4">
            <MobilePricingBar form={form} models={models} extras={extras} quote={quote} quoteLoading={quoteLoading} />
          </div>
          {/* Step 1 two-column layout (left rail + vehicle grid) */}
          <div className="booking-step-enter">
            <Step1
              form={form} setForm={setForm}
              models={models} locations={locations}
              extras={extras} quote={quote} quoteLoading={quoteLoading}
              onNext={next} isRefetching={configFetching && !isLoading}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Steps 2–6: original card layout with right sidebar for steps 2–5 ─────────
  const showSidebar = step >= 2 && step <= 5;

  return (
    <div className="min-h-screen py-6 px-4">
      <div className={cn("mx-auto", (showSidebar || step === 6) ? "max-w-5xl" : "max-w-2xl")}>
        <div className={cn("items-start", showSidebar && "lg:grid lg:grid-cols-[1fr_288px] lg:gap-6")}>
          {/* Main step card */}
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 min-w-0">
            <StepBar step={step} onGoTo={(n) => goToStep(n)} />

            {/* Mobile collapsible summary (steps 2–5) */}
            {showSidebar && (
              <MobilePricingBar form={form} models={models} extras={extras} quote={quote} quoteLoading={quoteLoading} />
            )}

            {/* Step content with fade-in animation */}
            <div key={step} className="booking-step-enter">
              {step === 2 && <Step2 form={form} setForm={setForm} extras={extras} onNext={next} onBack={back} />}
              {step === 3 && <Step3 form={form} setForm={setForm} onNext={next} onBack={back} />}
              {step === 4 && <Step4 form={form} setForm={setForm} onNext={next} onBack={back} />}
              {step === 5 && <Step5 form={form} setForm={setForm} onNext={next} onBack={back} />}
              {step === 6 && (
                <Step6
                  form={form}
                  models={models}
                  locations={locations}
                  extras={extras}
                  onBack={back}
                  onDone={reset}
                  goToStep={goToStep}
                />
              )}
            </div>
          </div>

          {/* Desktop sticky right sidebar (steps 2–5 only) */}
          {showSidebar && (
            <div className="hidden lg:block">
              <div className="sticky top-6">
                <div className="bg-card border border-border rounded-2xl p-5">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Car className="w-3.5 h-3.5 text-primary" />
                    Booking Summary
                  </div>
                  <PricingSummaryContent
                    form={form}
                    models={models}
                    extras={extras}
                    quote={quote}
                    quoteLoading={quoteLoading}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
