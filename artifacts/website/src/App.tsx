import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/hooks/use-toast";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient();

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
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
  promoCode: string;
  extras: SelectedExtra[];
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

// ─── API helpers ──────────────────────────────────────────────────────────────

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

// ─── Utility ──────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function formatDateTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function calcDays(pickup: string, dropoff: string): number {
  if (!pickup || !dropoff) return 0;
  const diff = new Date(dropoff).getTime() - new Date(pickup).getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function transmissionLabel(t: string | null) {
  if (!t) return "";
  return t === "AUTOMATIC" ? "Automatic" : t === "MANUAL" ? "Manual" : t;
}

function fuelLabel(f: string | null) {
  if (!f) return "";
  const map: Record<string, string> = { PETROL: "Petrol", DIESEL: "Diesel", ELECTRIC: "Electric", HYBRID: "Hybrid" };
  return map[f] ?? f;
}

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = ["Trip Details", "Choose Car", "Add-ons", "Your Info", "Review"];

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((label, i) => {
        const num = i + 1;
        const active = num === step;
        const done = num < step;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors",
                  done && "bg-primary border-primary text-primary-foreground",
                  active && "bg-primary border-primary text-primary-foreground shadow-md",
                  !done && !active && "bg-background border-border text-muted-foreground",
                )}
              >
                {done ? "✓" : num}
              </div>
              <span className={cn("text-xs mt-1 hidden sm:block whitespace-nowrap", active ? "text-primary font-semibold" : "text-muted-foreground")}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("h-0.5 w-8 sm:w-14 mx-1 mt-0 sm:-mt-5 transition-colors", done ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Input components ─────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-foreground mb-1.5">
      {children}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors",
        className,
      )}
      {...props}
    />
  );
}

function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors",
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-colors",
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost"; loading?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && "bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 shadow-sm",
        variant === "outline" && "border border-border text-foreground hover:bg-secondary active:opacity-80",
        variant === "ghost" && "text-muted-foreground hover:text-foreground hover:bg-secondary",
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
  form,
  setForm,
  locations,
  onNext,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  locations: Location[];
  onNext: () => void;
}) {
  const cities = Array.from(new Set(locations.map((l) => l.city))).sort();

  function validate() {
    if (!form.pickupLocationId) { toast({ title: "Please select a pickup location", variant: "destructive" }); return; }
    if (!form.dropoffLocationId) { toast({ title: "Please select a drop-off location", variant: "destructive" }); return; }
    if (!form.pickupDatetime) { toast({ title: "Please select a pickup date & time", variant: "destructive" }); return; }
    if (!form.dropoffDatetime) { toast({ title: "Please select a drop-off date & time", variant: "destructive" }); return; }
    const pickup = new Date(form.pickupDatetime);
    const dropoff = new Date(form.dropoffDatetime);
    if (dropoff <= pickup) { toast({ title: "Drop-off must be after pickup", variant: "destructive" }); return; }
    if (pickup < new Date()) { toast({ title: "Pickup date must be in the future", variant: "destructive" }); return; }
    onNext();
  }

  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-1">Trip Details</h2>
      <p className="text-muted-foreground text-sm mb-6">Where and when do you need the car?</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <Label required>Pickup Location</Label>
          <Select value={form.pickupLocationId} onChange={(e) => setForm((f) => ({ ...f, pickupLocationId: e.target.value }))}>
            <option value="">Select pickup location…</option>
            {cities.map((city) => (
              <optgroup key={city} label={city}>
                {locations.filter((l) => l.city === city).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
        <div>
          <Label required>Drop-off Location</Label>
          <Select value={form.dropoffLocationId} onChange={(e) => setForm((f) => ({ ...f, dropoffLocationId: e.target.value }))}>
            <option value="">Select drop-off location…</option>
            {cities.map((city) => (
              <optgroup key={city} label={city}>
                {locations.filter((l) => l.city === city).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <Label required>Pickup Date & Time</Label>
          <Input
            type="datetime-local"
            value={form.pickupDatetime}
            onChange={(e) => setForm((f) => ({ ...f, pickupDatetime: e.target.value }))}
          />
        </div>
        <div>
          <Label required>Drop-off Date & Time</Label>
          <Input
            type="datetime-local"
            value={form.dropoffDatetime}
            onChange={(e) => setForm((f) => ({ ...f, dropoffDatetime: e.target.value }))}
          />
        </div>
      </div>

      {days > 0 && (
        <div className="flex items-center gap-2 mb-6 p-3 rounded-lg bg-accent/10 border border-accent/20">
          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm text-accent font-medium">{days} {days === 1 ? "day" : "days"} rental</span>
        </div>
      )}

      <div className="flex justify-end">
        <Btn onClick={validate}>Continue <span aria-hidden>→</span></Btn>
      </div>
    </div>
  );
}

// ─── Step 2: Choose Car ───────────────────────────────────────────────────────

function Step2({
  form,
  setForm,
  models,
  onNext,
  onBack,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  models: VehicleModel[];
  onNext: () => void;
  onBack: () => void;
}) {
  function validate() {
    if (!form.vehicleModelId) { toast({ title: "Please select a vehicle", variant: "destructive" }); return; }
    onNext();
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-1">Choose Your Car</h2>
      <p className="text-muted-foreground text-sm mb-6">Select from our available fleet</p>

      {models.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No vehicles available for online booking at this time.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 mb-6">
          {models.map((m) => {
            const selected = String(form.vehicleModelId) === String(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, vehicleModelId: String(m.id) }))}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-4 transition-all hover:shadow-md",
                  selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/40",
                )}
              >
                <div className="flex gap-4 items-start">
                  <div className="w-24 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {m.image_url ? (
                      <img src={m.image_url} alt={`${m.brand} ${m.model}`} className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5c-4 0-7.5 3-7.5 7s2 5.5 7.5 5.5 7.5-2.5 7.5-5.5S16 4.5 12 4.5z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-foreground">{m.brand} {m.model}</div>
                        {m.category && <div className="text-xs text-muted-foreground mt-0.5">{m.category}</div>}
                      </div>
                      {selected && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                          <svg className="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {m.seats && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          {m.seats} seats
                        </span>
                      )}
                      {m.transmission && (
                        <span className="text-xs text-muted-foreground">{transmissionLabel(m.transmission)}</span>
                      )}
                      {m.fuel_type && (
                        <span className="text-xs text-muted-foreground">{fuelLabel(m.fuel_type)}</span>
                      )}
                      {m.deposit && Number(m.deposit) > 0 && (
                        <span className="text-xs text-muted-foreground">Deposit: {Number(m.deposit).toLocaleString()} GEL</span>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{m.description}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}>← Back</Btn>
        <Btn onClick={validate} disabled={!form.vehicleModelId}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 3: Add-ons ──────────────────────────────────────────────────────────

function Step3({
  form,
  setForm,
  extras,
  onNext,
  onBack,
}: {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  extras: Extra[];
  onNext: () => void;
  onBack: () => void;
}) {
  const [promoInput, setPromoInput] = useState(form.promoCode);
  const [promoState, setPromoState] = useState<{ valid: boolean; msg: string; discountType?: string; discountValue?: number } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  function toggleExtra(extraId: number) {
    setForm((f) => {
      const existing = f.extras.find((e) => e.extraId === extraId);
      if (existing) {
        return { ...f, extras: f.extras.filter((e) => e.extraId !== extraId) };
      }
      return { ...f, extras: [...f.extras, { extraId, quantity: 1 }] };
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
      setPromoState({ valid: data.valid, msg: data.error ?? "", discountType: data.discountType, discountValue: data.discountValue });
      if (data.valid) {
        setForm((f) => ({ ...f, promoCode: promoInput.trim() }));
      }
    } catch {
      setPromoState({ valid: false, msg: "Unable to validate promo code" });
    } finally {
      setPromoLoading(false);
    }
  }

  function removePromo() {
    setPromoInput("");
    setPromoState(null);
    setForm((f) => ({ ...f, promoCode: "" }));
  }

  const extrasTotal = form.extras.reduce((sum, e) => {
    const extra = extras.find((x) => x.id === e.extraId);
    if (!extra) return sum;
    return sum + Number(extra.price) * e.quantity * days;
  }, 0);

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-1">Add-ons & Extras</h2>
      <p className="text-muted-foreground text-sm mb-6">Enhance your trip with optional add-ons</p>

      {extras.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {extras.map((e) => {
            const selected = form.extras.some((x) => x.extraId === e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleExtra(e.id)}
                className={cn(
                  "w-full text-left rounded-xl border-2 p-3.5 transition-all",
                  selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground">{e.name}</div>
                    {e.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{e.description}</div>}
                    <div className="text-xs font-semibold text-primary mt-1.5">
                      {Number(e.price).toLocaleString()} {e.currency}
                      <span className="font-normal text-muted-foreground"> /{e.pricing_type === "per_day" ? "day" : "booking"}</span>
                    </div>
                  </div>
                  <div className={cn(
                    "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                    selected ? "bg-primary border-primary" : "border-border bg-background",
                  )}>
                    {selected && (
                      <svg className="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {extrasTotal > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-secondary/50 border border-border text-sm text-foreground">
          Selected add-ons: <span className="font-semibold">{extrasTotal.toLocaleString()} GEL</span>
          {days > 0 && <span className="text-muted-foreground"> for {days} {days === 1 ? "day" : "days"}</span>}
        </div>
      )}

      <div className="mb-6">
        <Label>Promo Code</Label>
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
            <Btn variant="outline" onClick={removePromo} className="shrink-0 text-destructive border-destructive/30">Remove</Btn>
          ) : (
            <Btn variant="outline" onClick={applyPromo} loading={promoLoading} className="shrink-0">Apply</Btn>
          )}
        </div>
        {promoState && (
          <p className={cn("text-xs mt-1.5", promoState.valid ? "text-green-600" : "text-destructive")}>
            {promoState.valid
              ? `✓ Promo applied! ${promoState.discountType === "percentage" ? promoState.discountValue + "% discount" : promoState.discountValue + " GEL off"}`
              : `✗ ${promoState.msg}`}
          </p>
        )}
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}>← Back</Btn>
        <Btn onClick={onNext}>Continue →</Btn>
      </div>
    </div>
  );
}

// ─── Step 4: Contact Info ─────────────────────────────────────────────────────

function Step4({
  form,
  setForm,
  onNext,
  onBack,
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
      <h2 className="text-xl font-bold text-foreground mb-1">Your Information</h2>
      <p className="text-muted-foreground text-sm mb-6">We need your contact details to confirm the booking</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <Label required>First Name</Label>
          <Input
            placeholder="e.g. Giorgi"
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
          />
        </div>
        <div>
          <Label required>Last Name</Label>
          <Input
            placeholder="e.g. Beridze"
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <Label required>Email Address</Label>
          <Input
            type="email"
            placeholder="your@email.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div>
          <Label required>Phone Number</Label>
          <Input
            type="tel"
            placeholder="+995 555 000 000"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
      </div>

      <div className="mb-6">
        <Label>Special Requests / Notes</Label>
        <Textarea
          placeholder="Any special requirements, preferred vehicle color, etc."
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
        />
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack}>← Back</Btn>
        <Btn onClick={validate}>Review Booking →</Btn>
      </div>
    </div>
  );
}

// ─── Step 5: Review & Submit ──────────────────────────────────────────────────

function Step5({
  form,
  models,
  locations,
  extras,
  onQuoteResolved,
  onBack,
  onSubmit,
  submitting,
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

  // Fetch pricing quote once on mount
  useEffect(() => {
    const vehicleModelId = Number(form.vehicleModelId);
    const pickupDatetime = form.pickupDatetime;
    const dropoffDatetime = form.dropoffDatetime;

    fetch("/api/public/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleModelId,
        pickupDatetime,
        dropoffDatetime,
        extras: form.extras.length > 0 ? form.extras : undefined,
        promoCode: form.promoCode.trim() || undefined,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((q: Quote) => {
        setQuote(q);
        onQuoteResolved(q);
        setQuoteError(null);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "network error";
        setQuoteError(msg);
        setQuote(null);
        onQuoteResolved(null);
      })
      .finally(() => setQuotePending(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — form values captured via closure

  const model = models.find((m) => String(m.id) === form.vehicleModelId);
  const pickupLoc = locations.find((l) => String(l.id) === form.pickupLocationId);
  const dropoffLoc = locations.find((l) => String(l.id) === form.dropoffLocationId);
  const days = calcDays(form.pickupDatetime, form.dropoffDatetime);

  const selectedExtras = form.extras.map((se) => ({
    extra: extras.find((e) => e.id === se.extraId),
    quantity: se.quantity,
  })).filter((x) => x.extra);

  function Row({ label, value, dimmed }: { label: string; value: string; dimmed?: boolean }) {
    return (
      <div className="flex justify-between py-2.5 border-b border-border last:border-0">
        <span className={cn("text-sm", dimmed ? "text-muted-foreground/60" : "text-muted-foreground")}>{label}</span>
        <span className={cn("text-sm font-medium text-right max-w-xs", dimmed ? "text-muted-foreground/60" : "text-foreground")}>{value}</span>
      </div>
    );
  }

  const cur = quote?.baseCurrency ?? "GEL";
  const fmtMoney = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

  return (
    <div>
      <h2 className="text-xl font-bold text-foreground mb-1">Review Your Booking</h2>
      <p className="text-muted-foreground text-sm mb-6">Please confirm all details before submitting</p>

      <div className="space-y-4 mb-6">
        {/* Trip Details */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Trip Details</div>
          <Row label="Pickup" value={`${pickupLoc?.name ?? ""} (${pickupLoc?.city ?? ""})`} />
          <Row label="Drop-off" value={`${dropoffLoc?.name ?? ""} (${dropoffLoc?.city ?? ""})`} />
          <Row label="Pickup Date" value={formatDateTime(form.pickupDatetime)} />
          <Row label="Drop-off Date" value={formatDateTime(form.dropoffDatetime)} />
          <Row label="Duration" value={`${days} ${days === 1 ? "day" : "days"}`} />
        </div>

        {/* Vehicle */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Vehicle</div>
          {model && <Row label="Car" value={`${model.brand} ${model.model}`} />}
          {model?.category && <Row label="Category" value={model.category} />}
          {model?.transmission && <Row label="Transmission" value={transmissionLabel(model.transmission)} />}
        </div>

        {/* Pricing — shown when quote resolves */}
        {quotePending ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Estimated Pricing</div>
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 bg-muted/50 rounded animate-pulse" style={{ width: i === 3 ? "60%" : "100%" }} />
              ))}
            </div>
          </div>
        ) : quote?.quotable ? (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-2 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Estimated Pricing
            </div>
            <Row label={`Base rate (${quote.basePricePerDay?.toLocaleString()} ${cur}/day × ${days} days)`} value={fmtMoney(quote.baseTotal!)} />
            {selectedExtras.map(({ extra, quantity }) => (
              <Row
                key={extra!.id}
                label={`${extra!.name} ×${quantity}`}
                value={fmtMoney(Number(extra!.price) * quantity * days)}
              />
            ))}
            {quote.discountAmount != null && quote.discountAmount > 0 && (
              <Row
                label={`Promo (${form.promoCode}${quote.promoDiscountType === "percentage" ? ` −${quote.promoDiscountValue}%` : ""})`}
                value={`−${fmtMoney(quote.discountAmount)}`}
              />
            )}
            <div className="flex justify-between pt-3 mt-1 border-t border-primary/20">
              <span className="text-sm font-semibold text-foreground">Estimated Total</span>
              <span className="text-base font-bold text-primary">{fmtMoney(quote.estimatedTotal!)}</span>
            </div>
            {quote.rateName && (
              <p className="text-xs text-muted-foreground mt-2">Rate: {quote.rateName}</p>
            )}
          </div>
        ) : (
          /* No rate found — honest fallback showing only what we know */
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pricing</div>
            {selectedExtras.length > 0 ? (
              <>
                {selectedExtras.map(({ extra, quantity }) => (
                  <Row
                    key={extra!.id}
                    label={extra!.name}
                    value={`${(Number(extra!.price) * quantity * days).toLocaleString()} GEL`}
                  />
                ))}
                <Row label="Add-ons Total" value={`${selectedExtras.reduce((s, { extra, quantity }) => s + Number(extra!.price) * quantity * days, 0).toLocaleString()} GEL`} />
              </>
            ) : null}
            {form.promoCode && <Row label="Promo Code" value={form.promoCode} />}
            <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
              Base vehicle rate will be confirmed by our team.
            </div>
          </div>
        )}

        {/* Contact */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contact</div>
          <Row label="Name" value={`${form.firstName} ${form.lastName}`} />
          <Row label="Email" value={form.email} />
          <Row label="Phone" value={form.phone} />
          {form.notes && <Row label="Notes" value={form.notes} />}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 mb-6 text-sm text-foreground">
        {quote?.quotable
          ? <><span className="font-semibold">Note:</span> The price shown is an estimate based on current rates. Final pricing is confirmed by our team before any charge is made.</>
          : <><span className="font-semibold">Note:</span> Submitting this form is a booking <em>request</em>. Our team will contact you within a few hours to confirm availability and final pricing.</>
        }
      </div>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={onBack} disabled={submitting}>← Back</Btn>
        <Btn onClick={onSubmit} loading={submitting}>Confirm Booking Request</Btn>
      </div>
    </div>
  );
}

// ─── Confirmation screen ──────────────────────────────────────────────────────

function Confirmation({ result, onReset }: { result: BookingResult; onReset: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-foreground mb-2">Booking Request Received!</h2>
      <p className="text-muted-foreground mb-6">We've received your booking request and will confirm shortly.</p>

      <div className="inline-block text-left rounded-xl border border-border bg-card p-6 mb-6 min-w-64">
        <div className="text-center mb-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Booking Reference</div>
          <div className="text-2xl font-bold text-primary">{result.reference}</div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Vehicle</span>
            <span className="font-medium text-right">{result.vehicle}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Pickup</span>
            <span className="font-medium text-right">{formatDateTime(result.pickupDatetime)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Drop-off</span>
            <span className="font-medium text-right">{formatDateTime(result.dropoffDatetime)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium text-yellow-600">Pending Confirmation</span>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-6">{result.message}</p>

      <Btn variant="outline" onClick={onReset}>Make Another Booking</Btn>
    </div>
  );
}

// ─── Booking Form orchestrator ─────────────────────────────────────────────────

function BookingForm() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  // quote is lifted to BookingForm so submit() can read it
  const [resolvedQuote, setResolvedQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState<FormData>({
    pickupLocationId: "",
    dropoffLocationId: "",
    pickupDatetime: "",
    dropoffDatetime: "",
    vehicleModelId: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
    promoCode: "",
    extras: [],
  });

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
          notes: form.notes.trim() || undefined,
          promoCode: form.promoCode || undefined,
          extras: form.extras.length > 0 ? form.extras : undefined,
          // Pass resolved rate fields so CRM booking stores proper pricing
          resolvedRateId: resolvedQuote?.rateId ?? null,
          resolvedRateTierId: resolvedQuote?.rateTierId ?? null,
          resolvedBaseRate: resolvedQuote?.basePricePerDay ?? null,
          resolvedTotal: resolvedQuote?.estimatedTotal ?? null,
          currency: resolvedQuote?.baseCurrency ?? undefined,
        }),
      });
      setResult(data);
      setStep(6);
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
    setForm({
      pickupLocationId: "",
      dropoffLocationId: "",
      pickupDatetime: "",
      dropoffDatetime: "",
      vehicleModelId: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      notes: "",
      promoCode: "",
      extras: [],
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        <p>Unable to load booking form. Please try again later.</p>
      </div>
    );
  }

  return (
    <div>
      {step < 6 && <StepBar step={step} />}

      {step === 6 && result ? (
        <Confirmation result={result} onReset={reset} />
      ) : step === 5 ? (
        <Step5
          form={form}
          models={config?.vehicleModels ?? []}
          locations={config?.locations ?? []}
          extras={config?.extras ?? []}
          onQuoteResolved={setResolvedQuote}
          onBack={() => setStep(4)}
          onSubmit={submit}
          submitting={submitting}
        />
      ) : step === 4 ? (
        <Step4 form={form} setForm={setForm} onNext={() => setStep(5)} onBack={() => setStep(3)} />
      ) : step === 3 ? (
        <Step3 form={form} setForm={setForm} extras={config?.extras ?? []} onNext={() => setStep(4)} onBack={() => setStep(2)} />
      ) : step === 2 ? (
        <Step2 form={form} setForm={setForm} models={config?.vehicleModels ?? []} onNext={() => setStep(3)} onBack={() => setStep(1)} />
      ) : (
        <Step1 form={form} setForm={setForm} locations={config?.locations ?? []} onNext={() => setStep(2)} />
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-md">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m0 0h3l3 3v4h-2m0 0a2 2 0 11-4 0 2 2 0 014 0zm-8 0a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <div className="font-bold text-lg leading-none">Tbilisi Cars</div>
            <div className="text-xs opacity-75 leading-none mt-0.5">Car Rental Georgia</div>
          </div>
        </div>
        <nav className="hidden sm:flex items-center gap-6 text-sm opacity-90">
          <a href="#booking" className="hover:opacity-100 transition-opacity">Book Now</a>
          <a href="#fleet" className="hover:opacity-100 transition-opacity">Our Fleet</a>
          <a href="#contact" className="hover:opacity-100 transition-opacity">Contact</a>
        </nav>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="bg-gradient-to-br from-primary via-primary to-[hsl(215,50%,20%)] text-primary-foreground py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <div className="inline-flex items-center gap-2 bg-accent/20 border border-accent/30 rounded-full px-4 py-1.5 text-sm mb-6">
          <span className="w-2 h-2 rounded-full bg-accent"></span>
          Available 7 days a week
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight">
          Explore Georgia<br />
          <span className="text-accent">Your Way</span>
        </h1>
        <p className="text-lg sm:text-xl opacity-80 max-w-2xl mx-auto mb-8">
          Rent a car in Tbilisi, Batumi, or Kutaisi. Fast booking, reliable fleet, no hidden fees.
        </p>
        <div className="flex flex-wrap justify-center gap-6 text-sm opacity-75">
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            No hidden fees
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Free cancellation
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            24/7 roadside assistance
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Airport pickup available
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Feature cards ────────────────────────────────────────────────────────────

function Features() {
  const items = [
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
      ),
      title: "Fully Insured",
      desc: "All vehicles come with comprehensive insurance for your peace of mind.",
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      ),
      title: "Multiple Locations",
      desc: "Pick up and drop off at any of our convenient locations across Georgia.",
    },
    {
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      ),
      title: "Instant Booking",
      desc: "Book online in minutes. Our team confirms your reservation within hours.",
    },
  ];

  return (
    <section id="fleet" className="py-12 sm:py-16 bg-secondary/30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl font-bold text-foreground text-center mb-8">Why Choose Us</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {items.map((item) => (
            <div key={item.title} className="bg-card rounded-xl border border-border p-5 text-center shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                {item.icon}
              </div>
              <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Contact footer ────────────────────────────────────────────────────────────

function Contact() {
  return (
    <section id="contact" className="py-12 sm:py-16 bg-primary text-primary-foreground">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-2xl font-bold mb-2">Contact Us</h2>
        <p className="opacity-75 mb-6">Have a question? We're here to help.</p>
        <div className="flex flex-wrap justify-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
            <span>+995 555 123 456</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            <span>bookings@tbilisicars.ge</span>
          </div>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
            <span>Tbilisi, Georgia</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <Hero />
      <Features />
      <section id="booking" className="py-12 sm:py-16 flex-1">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">Book Your Car</h2>
            <p className="text-muted-foreground">Complete the form below and we'll confirm your booking</p>
          </div>
          <div className="bg-card border border-border rounded-2xl shadow-lg p-6 sm:p-8">
            <BookingForm />
          </div>
        </div>
      </section>
      <Contact />
    </div>
  );
}

// ─── Router ────────────────────────────────────────────────────────────────────

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route>
        <div className="min-h-screen flex items-center justify-center text-center px-4">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
            <p className="text-muted-foreground">Page not found</p>
          </div>
        </div>
      </Route>
    </Switch>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
