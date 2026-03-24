import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Car, Users, Fuel, Settings, Check, ChevronLeft } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Location {
  id: number;
  name: string;
  city: string;
}

interface VehicleModel {
  id: number;
  brand: string;
  model: string;
  category: string | null;
  seats: number | null;
  transmission: string | null;
  fuel_type: string | null;
  description: string | null;
  image_url: string | null;
  deposit: string | null;
  vehicle_count: string;
  min_price_per_day: string | null;
  price_currency: string | null;
}

interface Extra {
  id: number;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  pricing_type: string;
}

interface BookingConfig {
  locations: Location[];
  vehicleModels: VehicleModel[];
  extras: Extra[];
}

interface SelectedExtra {
  extraId: number;
  quantity: number;
}

interface FormData {
  pickupLocationId: string;
  dropoffLocationId: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  vehicleModelId: string;
  extras: SelectedExtra[];
  promoCode: string;
  insurancePlan: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationality: string;
  notes: string;
  paymentMethod: string;
}

interface Quote {
  quotable: boolean;
  days: number;
  rateId: number | null;
  rateTierId: number | null;
  rateName: string | null;
  basePricePerDay: number | null;
  baseCurrency: string | null;
  baseTotal: number | null;
  extrasTotal: number;
  promoDiscountType: string | null;
  promoDiscountValue: number | null;
  discountAmount: number | null;
  estimatedTotal: number | null;
}

interface BookingResult {
  bookingId: number;
  reference: string;
  vehicle: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  status: string;
  message: string;
}

// ─── Insurance Plans ──────────────────────────────────────────────────────────

const INSURANCE_PLANS: Array<{
  id: string;
  label: string;
  deposit: number;
  excess: number;
  desc: string;
  recommended?: boolean;
}> = [
  { id: "basic", label: "Basic", deposit: 300, excess: 300, desc: "Standard cover for everyday driving" },
  { id: "full", label: "Full", deposit: 300, excess: 100, desc: "Reduced excess for added peace of mind" },
  { id: "premium", label: "Premium", deposit: 100, excess: 100, desc: "Maximum cover, minimum liability", recommended: true },
];

const PAYMENT_METHODS = [
  "Credit Card", "Debit Card", "Cash", "Revolut",
  "Bank Transfer", "Apple Pay", "Google Pay", "Stripe", "AMEX",
];

const STEPS = ["Trip Details", "Vehicle", "Add-ons", "Insurance", "Your Info", "Payment", "Review"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as any).errors?.[0] ?? (body as any).message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function formatDateTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function calcDays(pickup: string, dropoff: string) {
  if (!pickup || !dropoff) return 0;
  const diff = new Date(dropoff).getTime() - new Date(pickup).getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function transmissionLabel(t: string | null) {
  if (!t) return null;
  return t === "AUTOMATIC" ? "Automatic" : t === "MANUAL" ? "Manual" : t;
}

function fuelLabel(f: string | null) {
  if (!f) return null;
  const map: Record<string, string> = { PETROL: "Petrol", DIESEL: "Diesel", ELECTRIC: "Electric", HYBRID: "Hybrid" };
  return map[f] ?? f;
}

function getMinDatetime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ─── Step Bar ─────────────────────────────────────────────────────────────────

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8 overflow-x-auto pb-2">
      {STEPS.map((label, i) => {
        const num = i + 1;
        const active = num === step;
        const done = num < step;
        return (
          <div key={i} className="flex items-center shrink-0">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                done && "bg-primary border-primary text-white",
                active && "bg-primary border-primary text-white shadow-lg shadow-primary/30",
                !done && !active && "border-border text-muted-foreground bg-muted",
              )}>
                {done ? <Check className="w-4 h-4" /> : num}
              </div>
              <span className={cn(
                "text-[10px] mt-1 hidden sm:block whitespace-nowrap font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                "h-0.5 w-6 sm:w-10 mx-0.5 mt-0 sm:-mt-5 transition-colors",
                done ? "bg-primary" : "bg-border",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Reusable form primitives ─────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
      {children}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
        "focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60 transition-colors",
        className,
      )}
      {...props}
    />
  );
}

function SelectInput({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60 transition-colors",
        className,
      )}
      {...props}
    />
  );
}

function Btn({
  children,
  variant = "primary",
  className,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline"; loading?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-primary text-white hover:bg-accent shadow-sm",
        variant === "outline" && "border border-border text-foreground hover:bg-secondary/50",
        className,
      )}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

// ─── Step 1: Trip Details ─────────────────────────────────────────────────────

function Step1({
  form, setForm, locations, onNext,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  locations: Location[];
  onNext: () => void;
}) {
  const cities = Array.from(new Set(locations.map((l) => l.city))).sort();
  const minDt = getMinDatetime();
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  function validate() {
    if (!form.pickupLocationId) { toast({ title: "Please select a pickup location", variant: "destructive" }); return; }
    if (!form.dropoffLocationId) { toast({ title: "Please select a drop-off location", variant: "destructive" }); return; }
    if (!form.pickupDatetime) { toast({ title: "Please select a pickup date & time", variant: "destructive" }); return; }
    if (!form.dropoffDatetime) { toast({ title: "Please select a return date & time", variant: "destructive" }); return; }
    const pickup = new Date(form.pickupDatetime);
    const dropoff = new Date(form.dropoffDatetime);
    if (dropoff <= pickup) { toast({ title: "Return date must be after pickup", variant: "destructive" }); return; }
    onNext();
  }

  const LocationSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div>
      <FieldLabel required>{label}</FieldLabel>
      <SelectInput value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select location…</option>
        {cities.map((city) => (
          <optgroup key={city} label={city}>
            {locations.filter((l) => l.city === city).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </optgroup>
        ))}
      </SelectInput>
    </div>
  );

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Trip Details</h2>
      <p className="text-muted-foreground text-sm mb-6">Where and when do you need the car?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <LocationSelect
          label="Pickup Location"
          value={form.pickupLocationId}
          onChange={(v) => setForm((f) => ({ ...f, pickupLocationId: v }))}
        />
        <LocationSelect
          label="Drop-off Location"
          value={form.dropoffLocationId}
          onChange={(v) => setForm((f) => ({ ...f, dropoffLocationId: v }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <FieldLabel required>Pickup Date & Time</FieldLabel>
          <Input
            type="datetime-local"
            value={form.pickupDatetime}
            min={minDt}
            onChange={(e) => setForm((f) => ({ ...f, pickupDatetime: e.target.value }))}
          />
        </div>
        <div>
          <FieldLabel required>Return Date & Time</FieldLabel>
          <Input
            type="datetime-local"
            value={form.dropoffDatetime}
            min={form.pickupDatetime || minDt}
            onChange={(e) => setForm((f) => ({ ...f, dropoffDatetime: e.target.value }))}
          />
        </div>
      </div>

      {days > 0 && (
        <div className="flex items-center gap-2 mb-6 p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary font-medium">
          <Car className="w-4 h-4" />
          {days} {days === 1 ? "day" : "days"} rental
        </div>
      )}

      <div className="flex justify-end">
        <Btn onClick={validate}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 2: Vehicle ──────────────────────────────────────────────────────────

function Step2({
  form, setForm, models, onNext, onBack,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  models: VehicleModel[];
  onNext: () => void;
  onBack: () => void;
}) {
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  function validate() {
    if (!form.vehicleModelId) { toast({ title: "Please select a vehicle", variant: "destructive" }); return; }
    onNext();
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Choose Your Vehicle</h2>
      <p className="text-muted-foreground text-sm mb-6">Select from our available fleet — prices are based on your selected dates</p>

      {models.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Car className="w-12 h-12 mx-auto mb-3 opacity-30" />
          No vehicles available for online booking at this time.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 mb-6">
          {models.map((m) => {
            const selected = String(form.vehicleModelId) === String(m.id);
            const price = m.min_price_per_day ? Number(m.min_price_per_day) : null;
            const currency = m.price_currency ?? "GEL";
            const totalEstimate = price && days > 0 ? price * days : null;

            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, vehicleModelId: String(m.id) }))}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-4 transition-all",
                  selected
                    ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <div className="flex gap-4 items-start">
                  <div className="w-24 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {m.image_url ? (
                      <img src={m.image_url} alt={`${m.brand} ${m.model}`} className="w-full h-full object-cover" />
                    ) : (
                      <Car className="w-8 h-8 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-white">{m.brand} {m.model}</div>
                        {m.category && <div className="text-xs text-muted-foreground">{m.category}</div>}
                      </div>
                      <div className="text-right shrink-0">
                        {price !== null ? (
                          <>
                            <div className="text-sm font-bold text-primary">{price.toLocaleString()} {currency}/day</div>
                            {totalEstimate !== null && days > 0 && (
                              <div className="text-xs text-muted-foreground">Est. {totalEstimate.toLocaleString()} {currency} total</div>
                            )}
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground">Contact for pricing</div>
                        )}
                        {selected && (
                          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center ml-auto mt-1">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                      {m.seats && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" /> {m.seats} seats
                        </span>
                      )}
                      {m.transmission && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Settings className="w-3 h-3" /> {transmissionLabel(m.transmission)}
                        </span>
                      )}
                      {m.fuel_type && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Fuel className="w-3 h-3" /> {fuelLabel(m.fuel_type)}
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{m.description}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={validate} disabled={!form.vehicleModelId}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 3: Add-ons ──────────────────────────────────────────────────────────

function Step3({
  form, setForm, extras, onNext, onBack,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  extras: Extra[];
  onNext: () => void;
  onBack: () => void;
}) {
  const [promoInput, setPromoInput] = useState(form.promoCode);
  const [promoState, setPromoState] = useState<{ valid: boolean; msg: string } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  function toggleExtra(id: number) {
    setForm((f) => {
      const exists = f.extras.find((e) => e.extraId === id);
      return exists
        ? { ...f, extras: f.extras.filter((e) => e.extraId !== id) }
        : { ...f, extras: [...f.extras, { extraId: id, quantity: 1 }] };
    });
  }

  async function applyPromo() {
    if (!promoInput.trim()) return;
    setPromoLoading(true);
    try {
      const data = await apiFetch("/api/public/validate-promo", {
        method: "POST",
        body: JSON.stringify({ code: promoInput.trim() }),
      });
      setPromoState({ valid: data.valid, msg: data.error ?? "" });
      if (data.valid) setForm((f) => ({ ...f, promoCode: promoInput.trim() }));
    } catch {
      setPromoState({ valid: false, msg: "Unable to validate promo code" });
    } finally {
      setPromoLoading(false);
    }
  }

  const extrasTotal = form.extras.reduce((sum, e) => {
    const extra = extras.find((x) => x.id === e.extraId);
    if (!extra) return sum;
    return sum + Number(extra.price) * e.quantity * (extra.pricing_type === "per_day" ? days : 1);
  }, 0);

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Add-ons & Extras</h2>
      <p className="text-muted-foreground text-sm mb-6">Enhance your trip with optional add-ons</p>

      {extras.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {extras.map((e) => {
            const selected = form.extras.some((x) => x.extraId === e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleExtra(e.id)}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-4 transition-all",
                  selected ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-white">{e.name}</div>
                    {e.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.description}</div>
                    )}
                    <div className="text-xs font-semibold text-primary mt-1.5">
                      {Number(e.price).toLocaleString()} {e.currency}
                      <span className="font-normal text-muted-foreground"> /{e.pricing_type === "per_day" ? "day" : "booking"}</span>
                    </div>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                    selected ? "bg-primary border-primary" : "border-border",
                  )}>
                    {selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground mb-5 p-4 bg-card border border-border rounded-xl">
          No add-ons are currently available.
        </div>
      )}

      {extrasTotal > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-secondary/50 border border-border text-sm">
          Selected add-ons: <span className="font-semibold text-white">{extrasTotal.toLocaleString()} GEL</span>
          {days > 0 && <span className="text-muted-foreground"> for {days} days</span>}
        </div>
      )}

      <div className="mb-6">
        <FieldLabel>Promo Code</FieldLabel>
        <div className="flex gap-2">
          <Input
            placeholder="Enter promo code"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && applyPromo()}
            disabled={promoState?.valid}
            className="uppercase"
          />
          {promoState?.valid ? (
            <Btn
              variant="outline"
              onClick={() => { setPromoInput(""); setPromoState(null); setForm((f) => ({ ...f, promoCode: "" })); }}
              className="shrink-0 text-destructive border-destructive/30"
            >
              Remove
            </Btn>
          ) : (
            <Btn variant="outline" onClick={applyPromo} loading={promoLoading} className="shrink-0">
              Apply
            </Btn>
          )}
        </div>
        {promoState && (
          <p className={cn("text-xs mt-1.5", promoState.valid ? "text-green-400" : "text-destructive")}>
            {promoState.valid ? "Promo code applied!" : promoState.msg}
          </p>
        )}
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={onNext}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 4: Insurance ────────────────────────────────────────────────────────

function Step4({
  form, setForm, onNext, onBack,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onNext: () => void;
  onBack: () => void;
}) {
  function validate() {
    if (!form.insurancePlan) {
      toast({ title: "Please select an insurance plan", variant: "destructive" });
      return;
    }
    onNext();
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Insurance Plan</h2>
      <p className="text-muted-foreground text-sm mb-6">Choose the level of coverage that suits you</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {INSURANCE_PLANS.map((plan) => {
          const selected = form.insurancePlan === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setForm((f) => ({ ...f, insurancePlan: plan.id }))}
              className={cn(
                "relative w-full text-left rounded-xl border-2 p-5 transition-all",
                selected
                  ? "border-primary bg-primary/10 shadow-md shadow-primary/20"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              {plan.recommended && (
                <span className="absolute -top-2.5 left-4 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                  Recommended
                </span>
              )}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="font-bold text-white text-base">{plan.label}</div>
                {selected && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-4">{plan.desc}</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Deposit</span>
                  <span className="font-semibold text-white">{plan.deposit}€</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Excess</span>
                  <span className="font-semibold text-white">{plan.excess}€</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={validate}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 5: Customer Info ────────────────────────────────────────────────────

function Step5({
  form, setForm, onNext, onBack,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onNext: () => void;
  onBack: () => void;
}) {
  function validate() {
    if (!form.firstName.trim()) { toast({ title: "First name is required", variant: "destructive" }); return; }
    if (!form.lastName.trim()) { toast({ title: "Last name is required", variant: "destructive" }); return; }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast({ title: "Valid email address is required", variant: "destructive" }); return;
    }
    if (!form.phone.trim()) { toast({ title: "Phone number is required", variant: "destructive" }); return; }
    onNext();
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Your Information</h2>
      <p className="text-muted-foreground text-sm mb-6">We need your details to confirm the booking</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <FieldLabel required>First Name</FieldLabel>
          <Input placeholder="e.g. Giorgi" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
        </div>
        <div>
          <FieldLabel required>Last Name</FieldLabel>
          <Input placeholder="e.g. Beridze" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <FieldLabel required>Email Address</FieldLabel>
          <Input type="email" placeholder="your@email.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <FieldLabel required>Phone Number</FieldLabel>
          <Input type="tel" placeholder="+995 555 000 000" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
      </div>

      <div className="mb-4">
        <FieldLabel>Nationality</FieldLabel>
        <Input placeholder="e.g. Georgian" value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))} />
      </div>

      <div className="mb-6">
        <FieldLabel>Special Requests / Notes</FieldLabel>
        <textarea
          placeholder="Any special requirements or requests…"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/60 transition-colors"
        />
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={validate}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 6: Payment Method ───────────────────────────────────────────────────

function Step6({
  form, setForm, onNext, onBack,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  onNext: () => void;
  onBack: () => void;
}) {
  function validate() {
    if (!form.paymentMethod) {
      toast({ title: "Please select a payment method", variant: "destructive" });
      return;
    }
    onNext();
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Payment Method</h2>
      <p className="text-muted-foreground text-sm mb-6">How would you like to pay? Payment is collected at pickup.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {PAYMENT_METHODS.map((method) => {
          const selected = form.paymentMethod === method;
          return (
            <button
              key={method}
              type="button"
              onClick={() => setForm((f) => ({ ...f, paymentMethod: method }))}
              className={cn(
                "w-full text-left rounded-xl border-2 px-4 py-3.5 text-sm font-medium transition-all flex items-center justify-between gap-2",
                selected
                  ? "border-primary bg-primary/10 text-white shadow-md shadow-primary/20"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-white",
              )}
            >
              <span>{method}</span>
              {selected && (
                <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="p-4 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground mb-6">
        Payment is collected at vehicle pickup. No payment is required to submit your booking request.
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={validate}>Review Booking →</Btn>
      </div>
    </div>
  );
}

// ─── Step 7: Review & Submit ──────────────────────────────────────────────────

function Step7({
  form, models, locations, extras, onQuoteResolved, onBack, onSubmit, submitting,
}: {
  form: FormData;
  models: VehicleModel[];
  locations: Location[];
  extras: Extra[];
  onQuoteResolved: (q: Quote | null) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quotePending, setQuotePending] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleModelId: Number(form.vehicleModelId),
        pickupDatetime: form.pickupDatetime,
        dropoffDatetime: form.dropoffDatetime,
        extras: form.extras.length > 0 ? form.extras : undefined,
        promoCode: form.promoCode.trim() || undefined,
      }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((q: Quote) => {
        setQuote(q);
        onQuoteResolved(q);
      })
      .catch((err: unknown) => {
        setQuoteError(err instanceof Error ? err.message : "Failed to fetch quote");
        onQuoteResolved(null);
      })
      .finally(() => setQuotePending(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = models.find((m) => String(m.id) === form.vehicleModelId);
  const pickupLoc = locations.find((l) => String(l.id) === form.pickupLocationId);
  const dropoffLoc = locations.find((l) => String(l.id) === form.dropoffLocationId);
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);
  const insurance = INSURANCE_PLANS.find((p) => p.id === form.insurancePlan);
  const selectedExtras = form.extras.map((se) => ({ extra: extras.find((e) => e.id === se.extraId), qty: se.quantity })).filter((x) => x.extra);

  const cur = quote?.baseCurrency ?? "GEL";
  const fmt = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

  function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
      <div className="flex justify-between py-2 border-b border-border last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn("text-sm font-medium text-right max-w-xs", highlight ? "text-primary font-bold" : "text-white")}>
          {value}
        </span>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-1">Review Your Booking</h2>
      <p className="text-muted-foreground text-sm mb-6">Confirm all details before submitting your request</p>

      <div className="space-y-4 mb-6">
        {/* Trip */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Trip Details</div>
          <Row label="Pickup" value={`${pickupLoc?.name ?? ""} (${pickupLoc?.city ?? ""})`} />
          <Row label="Drop-off" value={`${dropoffLoc?.name ?? ""} (${dropoffLoc?.city ?? ""})`} />
          <Row label="Pickup Date" value={formatDateTime(form.pickupDatetime)} />
          <Row label="Return Date" value={formatDateTime(form.dropoffDatetime)} />
          <Row label="Duration" value={`${days} ${days === 1 ? "day" : "days"}`} />
        </div>

        {/* Vehicle */}
        {model && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Vehicle</div>
            <Row label="Car" value={`${model.brand} ${model.model}`} />
            {model.category && <Row label="Category" value={model.category} />}
            {model.transmission && <Row label="Transmission" value={transmissionLabel(model.transmission) ?? ""} />}
          </div>
        )}

        {/* Extras & pricing */}
        {quotePending ? (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pricing</div>
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-5 bg-muted/50 rounded animate-pulse" />)}
            </div>
          </div>
        ) : quote?.quotable ? (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-3">Estimated Pricing</div>
            <Row label={`Base rate (${quote.basePricePerDay?.toLocaleString()} ${cur}/day × ${days} days)`} value={fmt(quote.baseTotal!)} />
            {selectedExtras.map(({ extra, qty }) => (
              <Row key={extra!.id} label={`${extra!.name} ×${qty}`} value={fmt(Number(extra!.price) * qty * days)} />
            ))}
            {quote.discountAmount != null && quote.discountAmount > 0 && (
              <Row label={`Promo (${form.promoCode})`} value={`−${fmt(quote.discountAmount)}`} />
            )}
            <div className="flex justify-between pt-3 mt-1 border-t border-primary/20">
              <span className="text-sm font-semibold text-white">Estimated Total</span>
              <span className="text-base font-bold text-primary">{fmt(quote.estimatedTotal!)}</span>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Pricing</div>
            {selectedExtras.length > 0 && selectedExtras.map(({ extra, qty }) => (
              <Row key={extra!.id} label={extra!.name} value={`${(Number(extra!.price) * qty * days).toLocaleString()} GEL`} />
            ))}
            <p className="text-xs text-muted-foreground mt-2">{quoteError ? "Pricing will be confirmed by our team." : "Base rate will be confirmed by our team."}</p>
          </div>
        )}

        {/* Insurance */}
        {insurance && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Insurance</div>
            <Row label="Plan" value={`${insurance.label} Cover`} />
            <Row label="Deposit" value={`${insurance.deposit}€`} />
            <Row label="Excess" value={`${insurance.excess}€`} />
          </div>
        )}

        {/* Contact */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your Details</div>
          <Row label="Name" value={`${form.firstName} ${form.lastName}`} />
          <Row label="Email" value={form.email} />
          <Row label="Phone" value={form.phone} />
          {form.nationality && <Row label="Nationality" value={form.nationality} />}
          {form.paymentMethod && <Row label="Payment" value={form.paymentMethod} />}
          {form.notes && <Row label="Notes" value={form.notes} />}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-muted/40 border border-border mb-6 text-sm text-muted-foreground">
        <span className="font-semibold text-white">Note: </span>
        {quote?.quotable
          ? "Prices shown are estimates based on current rates. Final pricing confirmed before any charge."
          : "This is a booking request. Our team will contact you within a few hours to confirm availability and pricing."}
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack} disabled={submitting}><ChevronLeft className="w-4 h-4" /> Back</Btn>
        <Btn onClick={onSubmit} loading={submitting}>Confirm Booking Request</Btn>
      </div>
    </div>
  );
}

// ─── Confirmation screen ──────────────────────────────────────────────────────

function Confirmation({ result, onReset }: { result: BookingResult; onReset: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
        <Check className="w-8 h-8 text-green-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Booking Request Received!</h2>
      <p className="text-muted-foreground mb-8">We've received your booking and will confirm shortly.</p>

      <div className="inline-block text-left rounded-xl border border-border bg-card p-6 mb-6 min-w-64">
        <div className="text-center mb-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Booking Reference</div>
          <div className="text-3xl font-bold text-primary">{result.reference}</div>
        </div>
        <div className="space-y-2 text-sm">
          {[
            { label: "Vehicle", value: result.vehicle },
            { label: "Pickup", value: formatDateTime(result.pickupDatetime) },
            { label: "Return", value: formatDateTime(result.dropoffDatetime) },
          ].map((row) => (
            <div key={row.label} className="flex justify-between gap-6">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium text-white text-right">{row.value}</span>
            </div>
          ))}
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium text-yellow-400">Pending Confirmation</span>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-6">{result.message}</p>
      <Btn variant="outline" onClick={onReset}>Make Another Booking</Btn>
    </div>
  );
}

// ─── Main Booking page ────────────────────────────────────────────────────────

export default function Booking() {
  // Read query params on mount to pre-fill form
  const getInitialForm = useCallback((): FormData => {
    const p = new URLSearchParams(window.location.search);
    return {
      pickupLocationId: p.get("pickupLocationId") ?? "",
      dropoffLocationId: p.get("dropoffLocationId") ?? "",
      pickupDatetime: p.get("pickupDatetime") ?? "",
      dropoffDatetime: p.get("dropoffDatetime") ?? "",
      vehicleModelId: p.get("vehicleModelId") ?? "",
      extras: [],
      promoCode: "",
      insurancePlan: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      nationality: "",
      notes: "",
      paymentMethod: "",
    };
  }, []);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [resolvedQuote, setResolvedQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState<FormData>(getInitialForm);

  const { data: config, isLoading, error } = useQuery<BookingConfig>({
    queryKey: ["booking-config"],
    queryFn: () => apiFetch("/api/public/booking-config"),
  });

  async function submit() {
    setSubmitting(true);
    try {
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
          insurancePlan: form.insurancePlan
            ? INSURANCE_PLANS.find((p) => p.id === form.insurancePlan)?.label ?? form.insurancePlan
            : undefined,
          promoCode: form.promoCode || undefined,
          extras: form.extras.length > 0 ? form.extras : undefined,
          resolvedRateId: resolvedQuote?.rateId ?? null,
          resolvedRateTierId: resolvedQuote?.rateTierId ?? null,
          resolvedBaseRate: resolvedQuote?.basePricePerDay ?? null,
          resolvedTotal: resolvedQuote?.estimatedTotal ?? null,
          currency: resolvedQuote?.baseCurrency ?? undefined,
        }),
      });
      setResult(data);
      setStep(8);
    } catch (err: any) {
      toast({ title: "Booking failed", description: err.message ?? "Please try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep(1);
    setResult(null);
    setResolvedQuote(null);
    setForm(getInitialForm());
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() { setStep((s) => s + 1); scrollTop(); }
  function back() { setStep((s) => s - 1); scrollTop(); }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <p className="text-destructive mb-2">Unable to load booking form.</p>
          <p className="text-sm text-muted-foreground">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Page header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Book Your Car</h1>
          <p className="text-sm text-muted-foreground">Complete the steps below to submit your reservation</p>
        </div>

        {/* Step content */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8">
          {step < 8 && <StepBar step={step} />}

          {step === 8 && result ? (
            <Confirmation result={result} onReset={reset} />
          ) : step === 7 ? (
            <Step7
              form={form}
              models={config?.vehicleModels ?? []}
              locations={config?.locations ?? []}
              extras={config?.extras ?? []}
              onQuoteResolved={setResolvedQuote}
              onBack={back}
              onSubmit={submit}
              submitting={submitting}
            />
          ) : step === 6 ? (
            <Step6 form={form} setForm={setForm} onNext={next} onBack={back} />
          ) : step === 5 ? (
            <Step5 form={form} setForm={setForm} onNext={next} onBack={back} />
          ) : step === 4 ? (
            <Step4 form={form} setForm={setForm} onNext={next} onBack={back} />
          ) : step === 3 ? (
            <Step3 form={form} setForm={setForm} extras={config?.extras ?? []} onNext={next} onBack={back} />
          ) : step === 2 ? (
            <Step2 form={form} setForm={setForm} models={config?.vehicleModels ?? []} onNext={next} onBack={back} />
          ) : (
            <Step1 form={form} setForm={setForm} locations={config?.locations ?? []} onNext={next} />
          )}
        </div>
      </div>
    </div>
  );
}
