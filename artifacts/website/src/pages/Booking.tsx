/**
 * Booking page — 6-step flow:
 * Step 1 Vehicle → Step 2 Extras → Step 3 Insurance → Step 4 Customer Info → Step 5 Payment Method → Step 6 Confirmation
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
  Car, Users, Fuel, Settings, Check, ChevronLeft, ChevronDown, ArrowRight,
  MapPin, Calendar, Phone, MessageCircle, CreditCard, Banknote, Info, Shield,
  Lock, Copy, Package, Baby, Wifi,
} from "lucide-react";
import { Link } from "wouter";
import { DateTimePicker } from "@/components/DateTimePicker";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location { id: number; name: string; city: string; }
interface VehicleModel {
  id: number; brand: string; model: string; category: string | null;
  seats: number | null; transmission: string | null; fuel_type: string | null;
  description: string | null; image_url: string | null; deposit: string | null;
  vehicle_count: string; min_price_per_day: string | null; price_currency: string | null;
}
interface Extra { id: number; name: string; description: string | null; price: string; currency: string; pricing_type: string; }
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
  estimatedTotal: number | null;
}

interface BookingResult {
  bookingId: number; reference: string; vehicle: string;
  pickupDatetime: string; dropoffDatetime: string;
  pickupLocationId?: number;
  message: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INSURANCE_PLANS: Array<{
  id: string; label: string; deposit: number; excess: number; desc: string; recommended?: boolean;
}> = [
  { id: "basic",   label: "Basic",   deposit: 300, excess: 300, desc: "Standard cover for everyday driving" },
  { id: "full",    label: "Full",    deposit: 300, excess: 100, desc: "Reduced excess for added peace of mind" },
  { id: "premium", label: "Premium", deposit: 100, excess: 100, desc: "Maximum cover, minimum liability", recommended: true },
];

const INSURANCE_VISUAL = {
  basic: {
    activeBorder: "border-muted-foreground/50",
    activeBg: "bg-muted/10",
    activeShadow: "shadow-muted/10",
    iconWrapper: "bg-muted/20 border-muted-foreground/20",
    iconColor: "text-muted-foreground",
    tierLabel: "Basic Cover",
    tierColor: "text-muted-foreground",
    checkBg: "bg-muted-foreground",
  },
  full: {
    activeBorder: "border-blue-400",
    activeBg: "bg-blue-500/10",
    activeShadow: "shadow-blue-500/15",
    iconWrapper: "bg-blue-500/15 border-blue-400/30",
    iconColor: "text-blue-400",
    tierLabel: "Good Cover",
    tierColor: "text-blue-400",
    checkBg: "bg-blue-400",
  },
  premium: {
    activeBorder: "border-primary",
    activeBg: "bg-primary/10",
    activeShadow: "shadow-primary/20",
    iconWrapper: "bg-primary/15 border-primary/30",
    iconColor: "text-primary",
    tierLabel: "Best Coverage",
    tierColor: "text-primary",
    checkBg: "bg-primary",
  },
};

const STEP_LABELS = ["Vehicle", "Extras", "Insurance", "Your Info", "Payment", "Confirm"];

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

function cn(...cls: (string | undefined | false | null)[]) { return cls.filter(Boolean).join(" "); }

function formatDT(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function calcDays(pickup: string, dropoff: string) {
  if (!pickup || !dropoff) return 0;
  return Math.max(1, Math.ceil((new Date(dropoff).getTime() - new Date(pickup).getTime()) / 86400000));
}

function transLabel(t: string | null) { return t === "AUTOMATIC" ? "Automatic" : t === "MANUAL" ? "Manual" : t; }
function fuelLabel(f: string | null) { const m: Record<string,string> = { PETROL:"Petrol", DIESEL:"Diesel", ELECTRIC:"Electric", HYBRID:"Hybrid" }; return f ? (m[f] ?? f) : null; }

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
      "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed",
      variant === "primary" && "bg-primary text-white hover:bg-accent shadow-sm",
      variant === "outline" && "border border-border text-foreground hover:bg-secondary/50",
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
              const multiplier = e.pricing_type === "per_day" ? days : 1;
              return (
                <div key={e.id} className="flex justify-between text-xs">
                  <span className="text-muted-foreground truncate mr-2">{e.name}</span>
                  <span className="text-white shrink-0">+{(Number(e.price) * multiplier).toLocaleString()} {e.currency}</span>
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

function StepBar({ step }: { step: number }) {
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
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 shrink-0",
                  done  && "bg-primary border-primary text-white",
                  active && "bg-primary border-primary text-white shadow-lg shadow-primary/40 ring-4 ring-primary/20",
                  !done && !active && "border-border text-muted-foreground bg-card",
                )}>
                  {done ? <Check className="w-4 h-4" /> : num}
                </div>
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

function TripDetailsBanner({ form, setForm, locations }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; locations: Location[];
}) {
  const cities = Array.from(new Set(locations.map((l) => l.city))).sort();
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
    <div className="bg-secondary/30 border border-border rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        <Calendar className="w-3.5 h-3.5 text-primary" />
        Trip Details
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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
            placeholder="Select pickup date & time"
          />
        </div>
        <div>
          <FieldLabel required>Return Date &amp; Time</FieldLabel>
          <DateTimePicker
            value={form.dropoffDatetime}
            min={form.pickupDatetime || md}
            onChange={(v) => setForm((f) => ({ ...f, dropoffDatetime: v }))}
            placeholder="Select return date & time"
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

// ─── Step 1: Vehicle ──────────────────────────────────────────────────────────

function Step1({ form, setForm, models, locations, onNext }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  models: VehicleModel[]; locations: Location[]; onNext: () => void;
}) {
  const needTrip = !form.pickupLocationId || !form.dropoffLocationId || !form.pickupDatetime || !form.dropoffDatetime;
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  function validate() {
    if (!form.pickupLocationId) { toast({ title: "Please select a pickup location", variant: "destructive" }); return; }
    if (!form.dropoffLocationId) { toast({ title: "Please select a drop-off location", variant: "destructive" }); return; }
    if (!form.pickupDatetime || !form.dropoffDatetime) { toast({ title: "Please select pickup and return dates", variant: "destructive" }); return; }
    if (new Date(form.dropoffDatetime) <= new Date(form.pickupDatetime)) { toast({ title: "Return date must be after pickup", variant: "destructive" }); return; }
    if (!form.vehicleModelId) { toast({ title: "Please select a vehicle", variant: "destructive" }); return; }
    onNext();
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Choose Your Vehicle</h2>
      <p className="text-muted-foreground text-sm mb-5">Select from our available fleet for your journey</p>

      {needTrip && <TripDetailsBanner form={form} setForm={setForm} locations={locations} />}

      {!needTrip && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 mb-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5 text-sm text-primary font-medium">
              <MapPin className="w-3.5 h-3.5" />
              {locations.find(l => String(l.id) === form.pickupLocationId)?.name ?? ""}
              {form.dropoffLocationId !== form.pickupLocationId && (
                <><ArrowRight className="w-3.5 h-3.5 text-primary/60 mx-0.5" />{locations.find(l => String(l.id) === form.dropoffLocationId)?.name ?? ""}</>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary/80">
              <Calendar className="w-3.5 h-3.5" />
              {formatDT(form.pickupDatetime)}
              <span className="text-primary/50 mx-0.5">→</span>
              {formatDT(form.dropoffDatetime)}
            </div>
            {days > 0 && (
              <span className="bg-primary/15 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                {days} {days === 1 ? "day" : "days"}
              </span>
            )}
          </div>
        </div>
      )}

      {models.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Car className="w-12 h-12 mx-auto mb-3 opacity-30" />
          No vehicles available for online booking.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 mb-6">
          {models.map((m) => {
            const selected = String(form.vehicleModelId) === String(m.id);
            const price = m.min_price_per_day ? Number(m.min_price_per_day) : null;
            const cur = m.price_currency ?? "GEL";
            const totalEst = price && days > 0 ? price * days : null;
            const isOnRequest = Number(m.vehicle_count) === 0;
            return (
              <button key={m.id} type="button" onClick={() => setForm((f) => ({ ...f, vehicleModelId: String(m.id) }))}
                className={cn(
                  "w-full text-left rounded-2xl border-2 overflow-hidden transition-all duration-200",
                  selected
                    ? "border-primary shadow-lg shadow-primary/20 ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40 hover:shadow-md hover:shadow-black/20"
                )}>
                {/* Image banner */}
                <div className="relative h-44 bg-gradient-to-br from-secondary to-card overflow-hidden">
                  {m.image_url
                    ? <img src={m.image_url} alt={`${m.brand} ${m.model}`} className="w-full h-full object-cover" />
                    : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Car className="w-16 h-16 text-muted-foreground/15" />
                      </div>
                    )
                  }
                  {/* Category pill */}
                  {m.category && (
                    <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">
                      {m.category}
                    </span>
                  )}
                  {/* On Request badge */}
                  {isOnRequest && (
                    <span className="absolute top-3 right-3 bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                      On Request
                    </span>
                  )}
                  {/* Price badge */}
                  {!isOnRequest && price !== null && (
                    <div className="absolute bottom-3 right-3 bg-primary/90 backdrop-blur-sm text-white rounded-xl px-3 py-1.5 text-right">
                      <div className="text-sm font-bold leading-none">{price.toLocaleString()} {cur}</div>
                      <div className="text-[10px] opacity-80 leading-none mt-0.5">/day</div>
                    </div>
                  )}
                  {isOnRequest && !m.image_url && null}
                  {/* Contact for pricing overlay */}
                  {!isOnRequest && price === null && (
                    <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-muted-foreground rounded-xl px-3 py-1.5">
                      <div className="text-xs leading-none">Contact for pricing</div>
                    </div>
                  )}
                  {/* Selected checkmark overlay */}
                  {selected && (
                    <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  {selected && <div className="absolute inset-0 bg-primary/5 pointer-events-none" />}
                </div>

                {/* Info panel */}
                <div className="p-4">
                  <div className="mb-2">
                    <div className="font-bold text-white text-base leading-tight">{m.brand} {m.model}</div>
                    {totalEst && days > 0 && !isOnRequest && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Est. {totalEst.toLocaleString()} {cur} for {days} {days === 1 ? "day" : "days"}
                      </div>
                    )}
                    {isOnRequest && selected && (
                      <p className="text-xs text-amber-400/80 mt-0.5">Available on request — we'll confirm by phone</p>
                    )}
                  </div>
                  {/* Spec chips */}
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
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex justify-end">
        <Btn onClick={validate} disabled={!form.vehicleModelId}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 2: Extras ───────────────────────────────────────────────────────────

function Step2({ form, setForm, extras, onNext, onBack }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  extras: Extra[]; onNext: () => void; onBack: () => void;
}) {
  const [promoInput, setPromoInput] = useState(form.promoCode);
  const [promoState, setPromoState] = useState<{ valid: boolean; msg: string } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  function toggleExtra(id: number) {
    setForm((f) => {
      const exists = f.extras.find((e) => e.extraId === id);
      return exists ? { ...f, extras: f.extras.filter((e) => e.extraId !== id) } : { ...f, extras: [...f.extras, { extraId: id, quantity: 1 }] };
    });
  }

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

  const extrasRunningTotal = form.extras.reduce((sum, se) => {
    const ex = extras.find((x) => x.id === se.extraId);
    if (!ex) return sum;
    return sum + Number(ex.price) * se.quantity * (ex.pricing_type === "per_day" ? days : 1);
  }, 0);

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Add-ons & Extras</h2>
      <p className="text-muted-foreground text-sm mb-5">Enhance your trip with optional add-ons</p>

      {extras.length > 0 ? (
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
                    ? "border-primary bg-primary/10 shadow-md shadow-primary/15"
                    : "border-border bg-card hover:border-primary/30 hover:bg-secondary/10"
                )}>
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200",
                    selected ? "bg-primary/20 text-primary" : "bg-secondary/50 text-muted-foreground"
                  )}>
                    {extraIcon(e.name)}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm text-white leading-snug">{e.name}</div>
                      <div className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all duration-200",
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
                        <span className="font-normal text-muted-foreground"> /{e.pricing_type === "per_day" ? "day" : "booking"}</span>
                      </span>
                      {selected && days > 0 && (
                        <span className="text-xs text-green-400 font-medium bg-green-400/10 border border-green-400/20 rounded-full px-2 py-0.5">
                          +{totalImpact.toLocaleString()} {e.currency} total
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground mb-4 p-4 bg-card border border-border rounded-xl">No add-ons are currently available.</div>
      )}

      {extrasRunningTotal > 0 && (
        <div className="mb-4 p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="w-4 h-4 text-primary" />
            Add-ons total{days > 0 ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}
          </div>
          <span className="text-sm font-bold text-white">+{extrasRunningTotal.toLocaleString()} GEL</span>
        </div>
      )}

      <div className="mb-6">
        <FieldLabel>Promo Code</FieldLabel>
        <div className="flex gap-2">
          <Inp placeholder="Enter promo code" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && applyPromo()} disabled={promoState?.valid} className="uppercase" />
          {promoState?.valid ? (
            <Btn variant="outline" onClick={() => { setPromoInput(""); setPromoState(null); setForm((f) => ({ ...f, promoCode: "" })); }} className="shrink-0 text-destructive border-destructive/30">Remove</Btn>
          ) : (
            <Btn variant="outline" onClick={applyPromo} loading={promoLoading} className="shrink-0">Apply</Btn>
          )}
        </div>
        {promoState && <p className={cn("text-xs mt-1.5", promoState.valid ? "text-green-400" : "text-destructive")}>{promoState.valid ? "Promo code applied!" : promoState.msg}</p>}
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={onNext}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 3: Insurance ────────────────────────────────────────────────────────

function Step3({ form, setForm, onNext, onBack }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onNext: () => void; onBack: () => void;
}) {
  function validate() {
    if (!form.insurancePlan) { toast({ title: "Please select an insurance plan", variant: "destructive" }); return; }
    onNext();
  }
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Insurance Plan</h2>
      <p className="text-muted-foreground text-sm mb-5">Choose the level of coverage that suits you. Selecting a plan updates your price summary.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {INSURANCE_PLANS.map((plan) => {
          const selected = form.insurancePlan === plan.id;
          const visual = INSURANCE_VISUAL[plan.id as keyof typeof INSURANCE_VISUAL];
          return (
            <button key={plan.id} type="button" onClick={() => setForm((f) => ({ ...f, insurancePlan: plan.id }))}
              className={cn(
                "relative w-full text-left rounded-xl border-2 p-5 transition-all duration-200",
                selected
                  ? cn("shadow-lg", visual.activeBorder, visual.activeBg)
                  : "border-border bg-card hover:border-primary/40"
              )}>
              {plan.recommended && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wide whitespace-nowrap shadow-md">
                  ★ Recommended
                </span>
              )}
              {/* Shield icon */}
              <div className={cn(
                "w-12 h-12 rounded-xl border flex items-center justify-center mb-4 transition-colors duration-200",
                selected ? visual.iconWrapper : "bg-secondary/30 border-border"
              )}>
                <Shield className={cn("w-6 h-6 transition-colors duration-200", selected ? visual.iconColor : "text-muted-foreground")} />
              </div>
              {/* Tier badge */}
              <div className="mb-1">
                <span className={cn("text-[10px] font-bold uppercase tracking-wider transition-colors duration-200", selected ? visual.tierColor : "text-muted-foreground/60")}>
                  {visual.tierLabel}
                </span>
              </div>
              <div className="font-bold text-white text-lg mb-2">{plan.label}</div>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed min-h-[32px]">{plan.desc}</p>
              {/* Stats */}
              <div className="space-y-2 pt-3 border-t border-border">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Deposit</span>
                  <span className={cn("font-bold transition-colors", selected ? visual.iconColor : "text-white")}>{plan.deposit}€</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Excess</span>
                  <span className={cn("font-bold transition-colors", selected ? visual.iconColor : "text-white")}>{plan.excess}€</span>
                </div>
              </div>
              {/* Selected check */}
              {selected && (
                <div className={cn("absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center shadow-sm", visual.checkBg)}>
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-3 rounded-lg bg-secondary/30 border border-border text-xs text-muted-foreground mb-6 flex gap-3">
        <Shield className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <span>Deposit is pre-authorised at pickup and fully refunded upon return of the vehicle in good condition.</span>
      </div>

      <div className="flex justify-between">
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
          <div><FieldLabel required>First Name</FieldLabel><Inp placeholder="e.g. Giorgi" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></div>
          <div><FieldLabel required>Last Name</FieldLabel><Inp placeholder="e.g. Beridze" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><FieldLabel required>Email Address</FieldLabel><Inp type="email" placeholder="your@email.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          <div><FieldLabel required>Phone Number</FieldLabel><Inp type="tel" placeholder="+995 555 000 000" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
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
            <Inp placeholder="e.g. Georgian" value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))} />
          </div>
          <div>
            <FieldLabel>Age</FieldLabel>
            <Inp type="number" placeholder="e.g. 28" min="18" max="99" value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))} />
            <p className="text-xs text-muted-foreground mt-1">Minimum age: 18 years</p>
          </div>
        </div>
        <div>
          <FieldLabel>Flight Number</FieldLabel>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Inp placeholder="e.g. W6 1234" value={form.flightNumber} onChange={(e) => setForm((f) => ({ ...f, flightNumber: e.target.value }))} className="pl-9" />
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
        <div className="mb-4">
          <FieldLabel>Special Requests / Notes</FieldLabel>
          <textarea placeholder="Any special requirements or requests…" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3}
            className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/60 transition-colors" />
        </div>

        {/* WhatsApp opt-in checkbox */}
        <div className="mb-5">
          <label className="flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border border-border bg-secondary/20 hover:border-green-500/30 transition-colors">
            <Checkbox
              checked={form.whatsAppOptIn}
              onChange={() => setForm((f) => ({ ...f, whatsAppOptIn: !f.whatsAppOptIn }))}
            />
            <div>
              <div className="text-sm font-medium text-white flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-400" />
                I can be reached via WhatsApp at my phone number
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Check this if our team can send you booking updates over WhatsApp. We'll use the phone number you provided above.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Terms & Privacy */}
      <div className="mb-6 space-y-3">
        <label className="flex items-start gap-3 cursor-pointer p-4 bg-secondary/20 border border-border rounded-xl hover:border-primary/30 transition-colors">
          <Checkbox checked={form.agreeToTerms} onChange={() => setForm((f) => ({ ...f, agreeToTerms: !f.agreeToTerms }))} />
          <span className="text-sm text-muted-foreground leading-relaxed">
            I have read and agree to the{" "}
            <Link href="/terms" className="text-primary hover:underline font-medium">Terms & Conditions</Link>.
            {" "}I confirm I am at least 18 years old and hold a valid driving licence.
          </span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer p-4 bg-secondary/20 border border-border rounded-xl hover:border-primary/30 transition-colors">
          <Checkbox checked={form.agreeToPrivacy} onChange={() => setForm((f) => ({ ...f, agreeToPrivacy: !f.agreeToPrivacy }))} />
          <span className="text-sm text-muted-foreground leading-relaxed">
            I have read and agree to the{" "}
            <Link href="/privacy" className="text-primary hover:underline font-medium">Privacy Policy</Link>
            {" "}and consent to the processing of my personal data for the purpose of this booking.
          </span>
        </label>
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={validate}>Continue →</Btn>
      </div>
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
  {
    id: "Card (Online)",
    label: "Pay by Card Now",
    desc: "Secure your reservation with an online card payment. Our team will contact you with a secure payment link.",
    icon: <CreditCard className="w-6 h-6 text-primary" />,
    recommended: false,
  },
];

const OTHER_PAYMENT_METHODS = [
  "Cash", "Credit Card", "Debit Card", "Bank Transfer",
  "Revolut", "Apple Pay", "Google Pay", "AMEX",
];

function Step5({ form, setForm, onNext, onBack }: {
  form: FormData; setForm: React.Dispatch<React.SetStateAction<FormData>>; onNext: () => void; onBack: () => void;
}) {
  const [showOther, setShowOther] = useState(false);

  function validate() {
    if (!form.paymentMethod) { toast({ title: "Please select a payment method", variant: "destructive" }); return; }
    onNext();
  }

  const isPrimary = PRIMARY_PAYMENT_OPTIONS.some((o) => o.id === form.paymentMethod);
  const isOther = form.paymentMethod && !isPrimary;

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Payment Method</h2>
      <p className="text-muted-foreground text-sm mb-5">How would you like to pay for your rental?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {PRIMARY_PAYMENT_OPTIONS.map((opt) => {
          const selected = form.paymentMethod === opt.id;
          return (
            <button key={opt.id} type="button" onClick={() => { setForm((f) => ({ ...f, paymentMethod: opt.id })); setShowOther(false); }}
              className={cn(
                "relative w-full text-left rounded-xl border-2 p-5 transition-all duration-200 min-h-[152px] flex flex-col",
                selected
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                  : "border-border bg-card hover:border-primary/40"
              )}>
              {opt.recommended && (
                <span className="absolute -top-2.5 left-4 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Most Popular</span>
              )}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center shrink-0 border transition-colors duration-200",
                  selected ? "bg-primary/20 border-primary/30" : "bg-primary/10 border-primary/15"
                )}>
                  {opt.icon}
                </div>
                {selected && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="font-bold text-white text-base mb-1">{opt.label}</div>
                <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
              </div>
              {opt.id === "Card (Online)" && (
                <div className="mt-3 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2.5 py-1.5">
                  Our team will send you a secure payment link. No charge at this step.
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button type="button" onClick={() => setShowOther((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors mb-3">
        <Info className="w-3.5 h-3.5" />
        {showOther ? "Hide other payment options" : "Show other payment options"}
      </button>

      {(showOther || isOther) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {OTHER_PAYMENT_METHODS.map((method) => {
            const selected = form.paymentMethod === method;
            return (
              <button key={method} type="button" onClick={() => setForm((f) => ({ ...f, paymentMethod: method }))}
                className={cn(
                  "w-full text-center rounded-lg border px-3 py-2.5 text-xs font-medium transition-all duration-200",
                  selected
                    ? "border-primary bg-primary/10 text-white shadow-sm shadow-primary/20"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-white"
                )}>
                {selected && <Check className="w-3 h-3 inline mr-1 text-primary" />}
                {method}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-4 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground mb-6 flex gap-3">
        <Lock className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <span>No payment is charged to submit your booking request. You will only be charged upon vehicle pickup or as separately agreed.</span>
      </div>
      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={validate}>Review & Confirm →</Btn>
      </div>
    </div>
  );
}

// ─── Step 6: Confirmation ─────────────────────────────────────────────────────

function Step6({ form, models, locations, extras, onBack, onDone }: {
  form: FormData; models: VehicleModel[]; locations: Location[]; extras: Extra[];
  onBack: () => void; onDone: (result: BookingResult) => void;
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
          currency: resolvedQuote?.baseCurrency ?? undefined,
        }),
      });
      setResult(data);
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

  // ── Success state ──
  if (result) {
    const pickupCity = pickupLoc?.city ?? "";
    const pickupInstructions = CITY_PICKUP_INSTRUCTIONS[pickupCity] ?? "Our team will contact you shortly to confirm pickup details.";

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

        {/* Trip summary */}
        <div className="bg-card border border-border rounded-xl p-4 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Car className="w-3.5 h-3.5 text-primary" />
            Trip Summary
          </div>
          <SummaryRow label="Vehicle" value={result.vehicle} />
          <SummaryRow label="Pickup" value={formatDT(result.pickupDatetime)} />
          <SummaryRow label="Return" value={formatDT(result.dropoffDatetime)} />
          <SummaryRow label="Duration" value={`${days} ${days === 1 ? "day" : "days"}`} />
          {pickupLoc && <SummaryRow label="Pickup Location" value={`${pickupLoc.name}, ${pickupLoc.city}`} />}
          {dropoffLoc && dropoffLoc.id !== pickupLoc?.id && <SummaryRow label="Return Location" value={`${dropoffLoc.name}, ${dropoffLoc.city}`} />}
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

        <p className="text-xs text-muted-foreground text-center mb-5">{result.message}</p>
        <div className="flex justify-center">
          <Btn variant="outline" onClick={() => onDone(result)}>Make Another Booking</Btn>
        </div>
      </div>
    );
  }

  // ── Review state ──
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Booking Confirmation</h2>
      <p className="text-muted-foreground text-sm mb-5">Review everything before confirming your request</p>

      <div className="mb-5">
        {/* Two-column on desktop: left = Trip + Vehicle, right = Pricing + Insurance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Left column */}
          <div className="space-y-4">
            {/* Trip */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Trip Details
              </div>
              <SummaryRow label="Pickup" value={`${pickupLoc?.name ?? "—"}, ${pickupLoc?.city ?? ""}`} />
              <SummaryRow label="Drop-off" value={`${dropoffLoc?.name ?? "—"}, ${dropoffLoc?.city ?? ""}`} />
              <SummaryRow label="Pickup date" value={formatDT(form.pickupDatetime)} />
              <SummaryRow label="Return date" value={formatDT(form.dropoffDatetime)} />
              <SummaryRow label="Duration" value={`${days} ${days === 1 ? "day" : "days"}`} />
            </div>

            {/* Vehicle */}
            {model && (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-primary" />
                  Vehicle
                </div>
                {model.image_url && (
                  <div className="w-full h-28 rounded-lg overflow-hidden mb-3">
                    <img src={model.image_url} alt={`${model.brand} ${model.model}`} className="w-full h-full object-cover" />
                  </div>
                )}
                <SummaryRow label="Car" value={`${model.brand} ${model.model}`} />
                {model.category && <SummaryRow label="Category" value={model.category} />}
                {model.transmission && <SummaryRow label="Transmission" value={transLabel(model.transmission) ?? ""} />}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Pricing */}
            {quotePending ? (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pricing</div>
                <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-5 bg-muted/50 rounded animate-pulse" />)}</div>
              </div>
            ) : quote?.quotable ? (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-3 flex items-center gap-1.5">
                  Pricing Estimate
                </div>
                <SummaryRow label={`Base rate (${quote.basePricePerDay?.toLocaleString()} ${cur}/day × ${days} days)`} value={fmt(quote.baseTotal!)} />
                {selectedExtras.map(({ extra, qty }) => {
                  const multiplier = extra!.pricing_type === "per_booking" ? 1 : days;
                  return <SummaryRow key={extra!.id} label={`${extra!.name} ×${qty}`} value={fmt(Number(extra!.price) * qty * multiplier)} />;
                })}
                {form.promoCode && quote.discountAmount != null && quote.discountAmount > 0 && (
                  <SummaryRow label={`Promo (${form.promoCode})`} value={`−${fmt(quote.discountAmount)}`} />
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
                  return <SummaryRow key={extra!.id} label={extra!.name} value={`${(Number(extra!.price) * qty * multiplier).toLocaleString()} GEL`} />;
                })}
                <p className="text-xs text-muted-foreground mt-2">Base rate will be confirmed by our team.</p>
              </div>
            )}

            {/* Insurance */}
            {insurance && (
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  Insurance
                </div>
                <SummaryRow label="Plan" value={`${insurance.label} Cover`} />
                <SummaryRow label="Deposit" value={`${insurance.deposit}€`} />
                <SummaryRow label="Excess" value={`${insurance.excess}€`} />
              </div>
            )}
          </div>
        </div>

        {/* Customer details — full width */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-primary" />
            Your Details
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
      </div>

      <div className="p-4 rounded-xl bg-muted/40 border border-border mb-6 text-sm text-muted-foreground">
        <span className="font-semibold text-white">Note: </span>
        {quote?.quotable
          ? "Prices shown are estimates. Final pricing is confirmed before any charge is made."
          : "This is a booking request. Our team will contact you to confirm availability and pricing."}
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <Btn variant="outline" onClick={onBack} disabled={submitting} className="justify-center">
          <ChevronLeft className="w-4 h-4" /> Back
        </Btn>
        <Btn onClick={submit} loading={submitting} className="justify-center sm:px-8 sm:py-3 sm:text-base">
          Confirm Booking Request →
        </Btn>
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
  }, [form.vehicleModelId, form.pickupDatetime, form.dropoffDatetime, form.extras, form.promoCode]);
  // ───────────────────────────────────────────────────────────────────────────

  const { data: config, isLoading, error } = useQuery<BookingConfig>({
    queryKey: ["booking-config"],
    queryFn: () => apiFetch("/api/public/booking-config"),
  });

  function next() { setStep((s) => s + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function back() { setStep((s) => s - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function reset() { setStep(1); setForm(getInitialForm()); }

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center text-center px-4">
      <div><p className="text-destructive mb-2">Unable to load booking form.</p><p className="text-sm text-muted-foreground">Please try again later.</p></div>
    </div>
  );

  const models = config?.vehicleModels ?? [];
  const locations = config?.locations ?? [];
  const extras = config?.extras ?? [];

  // Sidebar visible on steps 1–5; step 6 is full review/success (no sidebar needed)
  const showSidebar = step >= 1 && step <= 5;

  return (
    <div className="min-h-screen py-10 px-4">
      <div className={cn("mx-auto", showSidebar ? "max-w-5xl" : "max-w-2xl")}>
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Book Your Car</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">Complete the steps below to submit your reservation request.</p>
        </div>

        {/* Two-column layout for steps 1–5, single column for step 6 */}
        <div className={cn("items-start", showSidebar && "lg:grid lg:grid-cols-[1fr_288px] lg:gap-6")}>
          {/* Main step card */}
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 min-w-0">
            <StepBar step={step} />

            {/* Mobile collapsible summary (steps 1–5 only) */}
            {showSidebar && (
              <MobilePricingBar form={form} models={models} extras={extras} quote={quote} quoteLoading={quoteLoading} />
            )}

            {/* Step content with fade-in animation on step change */}
            <div key={step} className="booking-step-enter">
              {step === 1 && <Step1 form={form} setForm={setForm} models={models} locations={locations} onNext={next} />}
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
                />
              )}
            </div>
          </div>

          {/* Desktop sticky sidebar (steps 1–5 only) */}
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
