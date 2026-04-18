import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar, Shield, ChevronRight, ChevronDown,
  Clock, CheckCircle, Infinity, Car, HeartHandshake, ChevronLeft,
} from "lucide-react";
import { DateTimePicker } from "@/components/DateTimePicker";

interface Location {
  id: number;
  name: string;
  city: string;
}

interface BookingConfig {
  locations: Location[];
}

interface FeaturedSliderItem {
  id: number;
  title: string;
  subtitle: string | null;
  badgeText: string | null;
  displayPriceText: string;
  ctaLabel: string | null;
  imageUrl: string;
  vehicleModelId: number;
}

interface FeaturedSliderSettings {
  sectionTitle: string;
  sectionSubtitle: string;
  isSectionActive: boolean;
}

interface FeaturedSliderData {
  settings: FeaturedSliderSettings;
  items: FeaturedSliderItem[];
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
        <Car className="w-16 h-16 text-muted-foreground/30" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

async function apiFetch(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

function getMinDatetime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const TRUST_STATS = [
  { value: "10+", label: "Years Experience" },
  { value: "15,000+", label: "Customers Served" },
  { value: "4.7+", label: "Average Rating" },
  { value: "<15 min", label: "Pickup & Drop-off" },
  { value: "24/7", label: "Customer Support" },
];

const WHY_CARDS = [
  {
    icon: <Shield className="w-5 h-5 text-primary" />,
    title: "Full Insurance Options",
    desc: "Choose Basic, Full, or Premium coverage with transparent terms and no hidden surprises.",
  },
  {
    icon: <CheckCircle className="w-5 h-5 text-primary" />,
    title: "Transparent Pricing",
    desc: "What you see is what you pay — no surprise fees at pickup or drop-off.",
  },
  {
    icon: <Infinity className="w-5 h-5 text-primary" />,
    title: "Unlimited Mileage",
    desc: "Explore Georgia freely without worrying about distance limits.",
  },
  {
    icon: <Car className="w-5 h-5 text-primary" />,
    title: "Airport Service Included",
    desc: "Airport service and parking charges are already included where applicable.",
  },
  {
    icon: <HeartHandshake className="w-5 h-5 text-primary" />,
    title: "24/7 Support",
    desc: "Our team is available around the clock whenever you need assistance.",
  },
  {
    icon: <Clock className="w-5 h-5 text-primary" />,
    title: "Fast Pickup & Drop-off",
    desc: "Quick handover process designed to save your time.",
  },
];

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

interface LocationOption { id: number; name: string; city: string; }
function LocationSelect({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: LocationOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const selected = options.find((o) => String(o.id) === String(value));
  const cities = Array.from(new Set(options.map((o) => o.city)));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        className={[
          "w-full flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm text-left transition-all",
          "focus:outline-none focus:ring-2 focus:ring-primary/60",
          open ? "border-primary/50" : "border-white/10 hover:border-primary/40",
        ].join(" ")}
      >
        <span className={`flex-1 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="absolute z-50 top-full mt-1.5 w-full rounded-xl border border-white/10 shadow-2xl overflow-hidden"
          style={{ background: "hsl(211,55%,7%)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
        >
          <div className="max-h-56 overflow-y-auto premium-scroll">
            {cities.map((city) => (
              <div key={city}>
                <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  {city}
                </div>
                {options.filter((o) => o.city === city).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => { onChange(String(o.id)); setOpen(false); }}
                    className={[
                      "w-full text-left px-3 py-2.5 text-sm transition-colors",
                      String(o.id) === String(value)
                        ? "text-primary font-medium bg-primary/10"
                        : "text-foreground hover:bg-primary/10 hover:text-white",
                    ].join(" ")}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const [sameLocation, setSameLocation] = useState(true);
  const [pickupLocationId, setPickupLocationId] = useState("");
  const [dropoffLocationId, setDropoffLocationId] = useState("");
  const [pickupDatetime, setPickupDatetime] = useState("");
  const [dropoffDatetime, setDropoffDatetime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const minDt = getMinDatetime();

  const [stat0, setStat0] = useState("0");
  const [stat1, setStat1] = useState("0");
  const [stat2, setStat2] = useState("0.0");

  useEffect(() => {
    const duration = 2350;
    function animate(
      target: number,
      setter: (v: string) => void,
      format: (n: number) => string,
    ) {
      const start = performance.now();
      let raf: number;
      function step(now: number) {
        const elapsed = Math.min(now - start, duration);
        const value = target * (elapsed / duration);
        setter(format(value));
        if (elapsed < duration) raf = requestAnimationFrame(step);
      }
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }
    const c0 = animate(10, setStat0, (n) => String(Math.round(n)));
    const c1 = animate(15000, setStat1, (n) => Math.round(n).toLocaleString());
    const c2 = animate(4.7, setStat2, (n) => n.toFixed(1));
    return () => { c0(); c1(); c2(); };
  }, []);

  const { data: config } = useQuery<BookingConfig>({
    queryKey: ["booking-config"],
    queryFn: () => apiFetch("/api/public/booking-config"),
  });

  const { data: sliderData, isLoading: sliderLoading } = useQuery<FeaturedSliderData>({
    queryKey: ["public-featured-slider"],
    queryFn: () => apiFetch("/api/public/featured-slider"),
  });

  const sliderScrollRef = useRef<HTMLDivElement>(null);

  function scrollSlider(dir: "left" | "right") {
    const el = sliderScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -340 : 340, behavior: "smooth" });
  }

  const locations = sortLocations(config?.locations ?? []);
  const cities = Array.from(new Set(locations.map((l) => l.city)));

  useEffect(() => {
    if (sameLocation) setDropoffLocationId(pickupLocationId);
  }, [sameLocation, pickupLocationId]);

  function handleSearch() {
    setError(null);
    if (!pickupLocationId) { setError("Please select a pickup location"); return; }
    if (!sameLocation && !dropoffLocationId) { setError("Please select a drop-off location"); return; }
    if (!pickupDatetime) { setError("Please select a pickup date & time"); return; }
    if (!dropoffDatetime) { setError("Please select a return date & time"); return; }
    const pickup = new Date(pickupDatetime);
    const dropoff = new Date(dropoffDatetime);
    if (dropoff <= pickup) { setError("Return date must be after pickup date"); return; }
    const params = new URLSearchParams({
      pickupLocationId,
      dropoffLocationId: sameLocation ? pickupLocationId : dropoffLocationId,
      pickupDatetime,
      dropoffDatetime,
    });
    navigate(`/booking?${params.toString()}`);
  }

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section
        className="relative flex flex-col items-center px-4 pt-14 pb-12 sm:pt-20 sm:pb-16"
        style={{ background: "linear-gradient(135deg, hsl(211,55%,8%) 0%, hsl(211,53%,14%) 50%, hsl(211,50%,9%) 100%)" }}
      >
        {/* Subtle background radial accents */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, hsl(350,68%,38%) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(214,45%,25%) 0%, transparent 50%)"
        }} />
        {/* Tbilisi skyline — full hero background layer, screen blend dissolves the dark base away */}
        <img
          src="/tbilisi-skyline.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          style={{ objectFit: "cover", objectPosition: "center 60%", opacity: 0.75, mixBlendMode: "screen" }}
          draggable={false}
        />
        {/* Readability vignette — dark edges keep text and booking card crisp */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(to bottom, hsl(211,55%,8%) 0%, transparent 25%, transparent 65%, hsl(211,55%,8%) 100%)" }}
        />

        <div className="relative z-10 w-full max-w-5xl mx-auto text-center">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3 leading-[1.15]">
            <span className="text-white">Travel In Georgia Without Limits</span>
          </h1>
          <p className="text-base sm:text-lg font-medium text-primary mb-2 capitalize">
            We Know How To Serve Our Customers
          </p>
          <p className="text-xs sm:text-sm text-slate-300 mb-5 lg:mb-4 capitalize">
            24/7 Support&nbsp;•&nbsp;No Hidden Fees&nbsp;•&nbsp;Airport Service&nbsp;•&nbsp;Fast Pickup
          </p>

          {/* Booking Widget */}
          <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-5 lg:p-4 shadow-2xl text-left max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold text-white mb-5 lg:mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Choose Your Trip Details
            </h2>

            {/* Location row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 lg:mb-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Pickup Location
                </label>
                <LocationSelect
                  value={pickupLocationId}
                  onChange={setPickupLocationId}
                  options={locations}
                  placeholder="Select location…"
                />
              </div>

              {!sameLocation && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                    Return Location
                  </label>
                  <LocationSelect
                    value={dropoffLocationId}
                    onChange={setDropoffLocationId}
                    options={locations}
                    placeholder="Select location…"
                  />
                </div>
              )}
            </div>

            {/* Same location checkbox */}
            <label className="flex items-center gap-2 mb-4 lg:mb-3 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={sameLocation}
                onChange={(e) => setSameLocation(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary"
              />
              <span className="text-sm text-muted-foreground">Return to same location</span>
            </label>

            {/* Date row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 lg:mb-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Pickup Date &amp; Time
                </label>
                <DateTimePicker
                  value={pickupDatetime}
                  min={minDt}
                  onChange={setPickupDatetime}
                  placeholder="Select pickup date & time"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Return Date &amp; Time
                </label>
                <DateTimePicker
                  value={dropoffDatetime}
                  min={pickupDatetime || minDt}
                  onChange={setDropoffDatetime}
                  placeholder="Select return date & time"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive mb-4">{error}</p>
            )}

            <button
              onClick={handleSearch}
              className="w-full bg-primary hover:bg-accent text-white font-semibold py-3 px-6 rounded-xl transition-colors text-base shadow-md flex items-center justify-center gap-2"
            >
              Search Vehicles
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

        </div>
      </section>

      {/* ── Trust / Stats Strip ── */}
      <section className="py-8 px-4" style={{ background: "hsl(211,55%,7%)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {TRUST_STATS.map((s, i) => (
              <div
                key={s.label}
                className={[
                  "flex flex-col items-center text-center px-3 py-4 rounded-xl border border-white/8 bg-white/3",
                  i === 4 ? "col-span-2 sm:col-span-1" : "",
                ].join(" ")}
              >
                <span className="text-xl sm:text-2xl font-bold text-primary leading-none tabular-nums">
                  {i === 0 ? stat0 + "+" : i === 1 ? stat1 + "+" : i === 2 ? stat2 + "+" : s.value}
                </span>
                <span className="text-xs text-muted-foreground mt-1.5 leading-snug">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Cars Slider ── */}
      {(sliderLoading || (sliderData?.settings.isSectionActive && sliderData.items.length > 0)) && (
        <section className="py-20 px-4" style={{ background: "hsl(211,55%,6%)" }}>
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-end justify-between mb-10">
              <div>
                {sliderLoading ? (
                  <>
                    <div className="h-9 w-72 rounded-lg bg-white/5 animate-pulse mb-3" />
                    <div className="h-4 w-96 rounded bg-white/5 animate-pulse" />
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
                      {sliderData?.settings.sectionTitle}
                    </h2>
                    {sliderData?.settings.sectionSubtitle && (
                      <p className="text-muted-foreground max-w-xl">
                        {sliderData.settings.sectionSubtitle}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Nav arrows */}
              {!sliderLoading && (sliderData?.items.length ?? 0) > 1 && (
                <div className="hidden sm:flex gap-2 flex-shrink-0 ml-6">
                  <button
                    onClick={() => scrollSlider("left")}
                    className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => scrollSlider("right")}
                    className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                    aria-label="Next"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Slider track */}
            {sliderLoading ? (
              <div className="flex gap-5 overflow-hidden">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex-shrink-0 w-[340px] sm:w-[400px] h-[420px] rounded-2xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : (
              <div
                ref={sliderScrollRef}
                className="flex gap-5 overflow-x-auto pb-3 snap-x snap-mandatory scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {sliderData?.items.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/booking?vehicleModelId=${item.vehicleModelId}`)}
                    onKeyDown={(e) => e.key === "Enter" && navigate(`/booking?vehicleModelId=${item.vehicleModelId}`)}
                    className="flex-shrink-0 w-[340px] sm:w-[400px] snap-start rounded-2xl overflow-hidden border border-border hover:border-primary/40 transition-all group flex flex-col cursor-pointer"
                    style={{ background: "hsl(211,55%,9%)" }}
                  >
                    {/* Car image */}
                    <div className="relative w-full h-44 overflow-hidden bg-secondary/60">
                      <VehicleImg
                        src={toStorageSrc(item.imageUrl)}
                        alt={item.title}
                        className="w-full h-full object-contain object-center group-hover:brightness-110 transition-all duration-500"
                      />
                      {item.badgeText && (
                        <span className="absolute top-3 left-3 bg-primary text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                          {item.badgeText}
                        </span>
                      )}
                    </div>

                    {/* Card body */}
                    <div className="flex flex-col flex-1 p-5 gap-3">
                      <div>
                        <h3 className="text-white font-bold text-lg leading-tight">{item.title}</h3>
                        {item.subtitle && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.subtitle}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 mt-auto">
                        <span className="text-primary font-bold text-xl">{item.displayPriceText}</span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/booking?vehicleModelId=${item.vehicleModelId}`);
                        }}
                        className="w-full text-center bg-primary hover:bg-accent text-white font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm"
                      >
                        {item.ctaLabel ?? "Book Now"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Everything You Get With Us ── */}
      <section className="py-14 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Everything You Get With Us</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
              Everything you need for a smooth, transparent and stress-free car rental experience in Georgia.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WHY_CARDS.map((item) => (
              <div key={item.title} className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  {item.icon}
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm mb-1">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
