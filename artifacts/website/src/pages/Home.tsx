import { useState, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar, Shield, ChevronRight, ChevronDown,
  Clock, CheckCircle, Infinity, Car, HeartHandshake, ChevronLeft, Users,
} from "lucide-react";
import { DateTimePicker, DateTimePickerHandle } from "@/components/DateTimePicker";
import SearchButton from "@/components/SearchButton";

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
  { value: "4.6+", label: "Average Rating" },
];

const REVIEW_CARDS = [
  {
    platform: "Trustpilot",
    descriptor: "Excellent",
    rating: "4.6 / 5",
    href: "https://www.trustpilot.com/review/tbilisicars.com",
    brandMark: "★",
    markColor: "text-emerald-400",
    labelColor: "text-white",
    starColor: "text-emerald-400",
  },
  {
    platform: "Google",
    descriptor: "Excellent",
    rating: "4.7 / 5",
    href: "https://share.google/lbXYIFHqGODm91fdk",
    brandMark: "G",
    markColor: "text-blue-400",
    labelColor: "text-white",
    starColor: "text-yellow-400",
  },
];

const VEHICLE_CATEGORIES = [
  "Economy",
  "Crossover / Intermediate SUV",
  "Business Class",
];

const WHY_CARDS = [
  {
    icon: <Shield className="w-5 h-5 text-primary" />,
    title: "Full Insurance Coverage",
    desc: "Drive with confidence knowing you're fully protected throughout your journey.",
  },
  {
    icon: <CheckCircle className="w-5 h-5 text-primary" />,
    title: "Transparent Pricing",
    desc: "No hidden fees or surprises — all costs are clearly shown upfront.",
  },
  {
    icon: <Infinity className="w-5 h-5 text-primary" />,
    title: "Unlimited Mileage",
    desc: "Travel freely across Georgia with no distance limits.",
  },
  {
    icon: <Car className="w-5 h-5 text-primary" />,
    title: "Airport Service",
    desc: "Convenient vehicle delivery and return directly at the airport.",
  },
  {
    icon: <HeartHandshake className="w-5 h-5 text-primary" />,
    title: "24/7 Customer Support",
    desc: "Our team is available anytime you need assistance during your rental.",
  },
  {
    icon: <Clock className="w-5 h-5 text-primary" />,
    title: "Roadside Assistance",
    desc: "Quick help is always available in case of unexpected situations.",
  },
  {
    icon: <Users className="w-5 h-5 text-primary" />,
    title: "Additional Drivers",
    desc: "Add extra drivers at no additional cost for a flexible travel experience.",
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
  const airports = options.filter((o) => o.name.includes("Airport"));
  const downtowns = options.filter((o) => !o.name.includes("Airport"));
  const groups = [
    ...(airports.length > 0 ? [{ label: "Airports", items: airports }] : []),
    ...(downtowns.length > 0 ? [{ label: "Downtown Offices", items: downtowns }] : []),
  ];
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
            {groups.map(({ label, items }) => (
              <div key={label}>
                <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                  {label}
                </div>
                {items.map((o) => (
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
  const [pickupDelivery, setPickupDelivery] = useState(false);
  const [dropoffDelivery, setDropoffDelivery] = useState(false);
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
    const c2 = animate(4.6, setStat2, (n) => n.toFixed(1));
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
  const dropoffPickerRef = useRef<DateTimePickerHandle>(null);

  function scrollSlider(dir: "left" | "right") {
    const el = sliderScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -340 : 340, behavior: "smooth" });
  }

  const allLocations = sortLocations(config?.locations ?? []);
  const visibleLocations = allLocations.filter((l) => !l.name.includes("Hotel"));

  const pickupLoc = visibleLocations.find((l) => String(l.id) === pickupLocationId);
  const dropoffLoc = visibleLocations.find((l) => String(l.id) === dropoffLocationId);
  const pickupIsDowntown = pickupLoc?.name.includes("Downtown") ?? false;
  const dropoffIsDowntown = dropoffLoc?.name.includes("Downtown") ?? false;

  useEffect(() => {
    if (sameLocation) {
      setDropoffLocationId(pickupLocationId);
      setDropoffDelivery(false);
    }
  }, [sameLocation, pickupLocationId]);

  function handlePickupChange(id: string) {
    setPickupLocationId(id);
    const loc = visibleLocations.find((l) => String(l.id) === id);
    if (!loc?.name.includes("Downtown")) setPickupDelivery(false);
  }

  function handleDropoffChange(id: string) {
    setDropoffLocationId(id);
    const loc = visibleLocations.find((l) => String(l.id) === id);
    if (!loc?.name.includes("Downtown")) setDropoffDelivery(false);
  }

  function validateSearch(): boolean {
    setError(null);
    if (!pickupLocationId) { setError("Please select a pickup location"); return false; }
    if (!sameLocation && !dropoffLocationId) { setError("Please select a drop-off location"); return false; }
    if (!pickupDatetime) { setError("Please select a pickup date & time"); return false; }
    if (!dropoffDatetime) { setError("Please select a return date & time"); return false; }
    const pickup = new Date(pickupDatetime);
    const dropoff = new Date(dropoffDatetime);
    if (dropoff <= pickup) { setError("Return date must be after pickup date"); return false; }
    return true;
  }

  function navigateToBooking() {
    const params = new URLSearchParams({
      pickupLocationId,
      dropoffLocationId: sameLocation ? pickupLocationId : dropoffLocationId,
      pickupDatetime,
      dropoffDatetime,
    });
    if (pickupDelivery) params.set("pickupDelivery", "true");
    if (dropoffDelivery && !sameLocation) params.set("dropoffDelivery", "true");
    navigate(`/booking?${params.toString()}`);
  }

  return (
    <div className="min-h-screen">
      <Helmet>
        <title>Tbilisicars – Car Rental in Georgia | Tbilisi, Kutaisi, Batumi</title>
        <meta name="description" content="Reliable car rental in Georgia. Rent cars in Tbilisi, Kutaisi and Batumi with full insurance, unlimited mileage and 24/7 support." />
        <link rel="canonical" href="https://tbilisicars.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/" />
        <meta property="og:title" content="Tbilisicars – Car Rental in Georgia | Tbilisi, Kutaisi, Batumi" />
        <meta property="og:description" content="Reliable car rental in Georgia. Rent cars in Tbilisi, Kutaisi and Batumi with full insurance, unlimited mileage and 24/7 support." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Tbilisicars – Car Rental in Georgia | Tbilisi, Kutaisi, Batumi" />
        <meta name="twitter:description" content="Reliable car rental in Georgia. Rent cars in Tbilisi, Kutaisi and Batumi with full insurance, unlimited mileage and 24/7 support." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
        <script type="application/ld+json">{`
{
  "@context": "https://schema.org",
  "@type": ["Organization", "AutoRental"],
  "name": "Tbilisicars",
  "url": "https://tbilisicars.com/",
  "logo": "https://tbilisicars.com/tbilisicars-logo.png",
  "image": "https://tbilisicars.com/opengraph.jpg",
  "description": "Tbilisicars provides car rental services in Georgia for international travelers, tourists and local customers, with pickup and dropoff options in Tbilisi, Kutaisi and Batumi.",
  "areaServed": [
    { "@type": "Country", "name": "Georgia" },
    { "@type": "City", "name": "Tbilisi" },
    { "@type": "City", "name": "Kutaisi" },
    { "@type": "City", "name": "Batumi" }
  ],
  "serviceType": [
    "Car rental in Georgia",
    "Airport car rental",
    "City car delivery",
    "Rental cars for international travelers"
  ],
  "availableLanguage": ["English", "Georgian"],
  "sameAs": []
}
`}</script>
      </Helmet>
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
          {/* Review trust cards — above hero heading */}
          <div className="flex justify-center gap-3 mb-6 flex-wrap">
            {REVIEW_CARDS.map((r) => (
              <a
                key={r.platform}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-start gap-1 bg-black/30 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 hover:bg-black/50 hover:border-white/20 transition-colors min-w-[148px]"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm font-bold leading-none ${r.markColor}`}>{r.brandMark}</span>
                  <span className={`text-xs font-semibold tracking-wide ${r.labelColor}`}>{r.platform}</span>
                </div>
                <div className={`text-xs leading-none flex items-center ${r.starColor}`}>
                  <span>★★★★</span>
                  <span className="relative inline-block">
                    <span className="opacity-20">★</span>
                    <span className="absolute inset-0" style={{ clipPath: "inset(0 30% 0 0)" }}>★</span>
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{r.descriptor}</span>
                  <span className="text-xs font-bold text-white tabular-nums">{r.rating}</span>
                </div>
              </a>
            ))}
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3 leading-[1.15]">
            <span className="text-white">Discover Georgia With Us</span>
          </h1>
          <p className="text-base sm:text-lg font-medium text-primary mb-2">
            Trusted by thousands of travelers worldwide
          </p>
          <p className="text-xs sm:text-sm text-slate-300 mb-5 lg:mb-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            {[
              "Full Insurance",
              "Unlimited Mileage",
              "Free Additional Drivers",
              "Roadside Assistance",
              "24/7 Customer Support",
            ].map((item, idx, arr) => (
              <span key={item} className="flex items-center gap-x-2">
                <span>{item}</span>
                {idx < arr.length - 1 && (
                  <span className="inline-block w-1 h-1 rounded-full bg-red-500 opacity-70 animate-pulse" />
                )}
              </span>
            ))}
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
                  onChange={handlePickupChange}
                  options={visibleLocations}
                  placeholder="Select location…"
                />
                {pickupIsDowntown && (
                  <label className="flex items-center gap-2 mt-2 cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      checked={pickupDelivery}
                      onChange={(e) => setPickupDelivery(e.target.checked)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">Delivery Service</span>
                  </label>
                )}
              </div>

              {!sameLocation && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                    Return Location
                  </label>
                  <LocationSelect
                    value={dropoffLocationId}
                    onChange={handleDropoffChange}
                    options={visibleLocations}
                    placeholder="Select location…"
                  />
                  {dropoffIsDowntown && (
                    <label className="flex items-center gap-2 mt-2 cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        checked={dropoffDelivery}
                        onChange={(e) => setDropoffDelivery(e.target.checked)}
                        className="w-4 h-4 rounded border-border accent-primary"
                      />
                      <span className="text-xs text-muted-foreground">Delivery Service</span>
                    </label>
                  )}
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
                  onDone={() => dropoffPickerRef.current?.openPicker()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Return Date &amp; Time
                </label>
                <DateTimePicker
                  ref={dropoffPickerRef}
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

            <SearchButton onValidate={validateSearch} onSearch={navigateToBooking} />
          </div>

        </div>
      </section>

      {/* ── Trust / Stats Strip ── */}
      <section className="py-8 px-4" style={{ background: "hsl(211,55%,7%)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TRUST_STATS.map((s, i) => (
              <div
                key={s.label}
                className="flex flex-col items-center text-center px-3 py-4 rounded-xl border border-white/8 bg-white/3"
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
                  <div key={i} className="flex-shrink-0 w-[min(340px,85vw)] sm:w-[400px] h-[420px] rounded-2xl bg-white/5 animate-pulse" />
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
                    className="flex-shrink-0 w-[min(340px,85vw)] sm:w-[400px] snap-start rounded-2xl overflow-hidden border border-border hover:border-primary/40 transition-all group flex flex-col cursor-pointer"
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
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Rent a car with us and get benefits</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
              All prices shown on our website are final — what you see is exactly what you pay at pick-up. Every rental includes the benefits listed below.
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

      {/* ── Vehicle Categories ── */}
      <section className="py-12 px-4" style={{ background: "hsl(211,55%,6%)" }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">All Vehicle Categories in One Place</h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-2xl mx-auto">
            Browse our fleet — from Economy cars to Crossover SUVs and Business Class vehicles for your journey across Georgia.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {VEHICLE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => navigate("/fleet")}
                className="px-4 py-2 rounded-full border border-white/15 text-sm text-white/80 bg-white/5 hover:border-primary/50 hover:text-white transition-colors cursor-pointer"
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>


    </div>
  );
}
