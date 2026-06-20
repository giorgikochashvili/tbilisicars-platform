import { useState, useEffect, useRef, useMemo, type CSSProperties } from "react";
import ReactDOM from "react-dom";
import { Helmet } from "react-helmet-async";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Award, MapPin, Shield, ChevronRight, ChevronDown,
  Clock, CheckCircle, Infinity, Car, HeartHandshake, ChevronLeft, Users,
} from "lucide-react";
import { DateTimePicker, DateTimePickerHandle } from "@/components/DateTimePicker";
import SearchButton from "@/components/SearchButton";

interface Location {
  id: number;
  name: string;
  city: string;
}

interface VehicleModelForCategories {
  category: string | null;
  vehicle_count: string;
}

interface BookingConfig {
  locations: Location[];
  vehicleModels: VehicleModelForCategories[];
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

const HERO_RATING_CARDS = [
  {
    platform: "Trustpilot",
    descriptor: "Excellent",
    rating: "4.6 / 5",
    href: "https://www.trustpilot.com/review/tbilisicars.com",
    brandMark: "★",
    markColor: "text-emerald-400",
    starColor: "text-emerald-400",
  },
  {
    platform: "Google",
    descriptor: "Excellent",
    rating: "4.7 / 5",
    href: "https://share.google/lbXYIFHqGODm91fdk",
    brandMark: "G",
    markColor: "text-blue-400",
    starColor: "text-yellow-400",
  },
];

const LOCATION_CARDS = [
  { label: "Tbilisi Airport", sub: "Easy pickup & fast start",       href: "/car-rental-tbilisi" },
  { label: "Kutaisi Airport", sub: "Your gateway to the west",       href: "/car-rental-kutaisi" },
  { label: "Batumi Airport",  sub: "Explore the Black Sea coast",    href: "/car-rental-batumi"  },
  { label: "City Delivery",   sub: "We deliver to your location",    href: "/locations"          },
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
  const [dropStyle, setDropStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropH = 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= dropH ? rect.bottom + 4 : rect.top - dropH - 4;
    setDropStyle({
      position: "fixed",
      top: Math.max(8, top),
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleDown(e: MouseEvent) {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropRef.current?.contains(e.target as Node)
      ) setOpen(false);
    }
    function handleScroll() { setOpen(false); }
    document.addEventListener("mousedown", handleDown);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  const selected = options.find((o) => String(o.id) === String(value));
  const airports = options.filter((o) => o.name.includes("Airport"));
  const downtowns = options.filter((o) => !o.name.includes("Airport"));
  const groups = [
    ...(airports.length > 0 ? [{ label: "Airports", items: airports }] : []),
    ...(downtowns.length > 0 ? [{ label: "Downtown Offices", items: downtowns }] : []),
  ];

  const dropdown = open
    ? ReactDOM.createPortal(
        <div
          ref={dropRef}
          style={{
            ...dropStyle,
            background: "hsl(211,55%,7%)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
          className="rounded-xl border border-white/10 shadow-2xl overflow-hidden"
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
        </div>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        style={{ background: "rgba(255,255,255,0.05)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        className={[
          "w-full flex items-center gap-2 rounded-lg border px-3.5 py-3 text-sm text-left transition-all",
          "focus:outline-none focus:ring-2 focus:ring-primary/60",
          open ? "border-primary/50" : "border-white/10 hover:border-primary/40",
        ].join(" ")}
      >
        <span className={`flex-1 truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {dropdown}
    </div>
  );
}

function makeDefaultDatetimes(): { pickup: string; dropoff: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const p = new Date();
  p.setDate(p.getDate() + 3);
  p.setHours(10, 0, 0, 0);
  const r = new Date(p);
  r.setDate(r.getDate() + 7);
  return { pickup: fmt(p), dropoff: fmt(r) };
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

  // Sub-step A: prefill dates on first mount only.
  // Home.tsx never reads dates from URL on mount (only writes on navigate-away),
  // so the empty-string guard is sufficient — no URL race condition possible.
  useEffect(() => {
    if (pickupDatetime === "" && dropoffDatetime === "") {
      const { pickup, dropoff } = makeDefaultDatetimes();
      setPickupDatetime(pickup);
      setDropoffDatetime(dropoff);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: config } = useQuery<BookingConfig>({
    queryKey: ["booking-config"],
    queryFn: () => apiFetch("/api/public/booking-config"),
  });

  const dynamicCategories = useMemo<string[] | null>(() => {
    if (!config) return null;
    const seen = new Set<string>();
    const result: string[] = [];
    for (const m of config.vehicleModels ?? []) {
      if (m.category && Number(m.vehicle_count) > 0 && !seen.has(m.category)) {
        seen.add(m.category);
        result.push(m.category);
      }
    }
    return result;
  }, [config]);

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
        className="relative overflow-hidden min-h-[680px] sm:min-h-[640px]"
        style={{ background: "hsl(211,55%,8%)" }}
      >
        {/* Hero background image */}
        <img
          src="/images/home-hero-georgia-road.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover object-[50%_28%] sm:object-[60%_45%] pointer-events-none select-none"
          draggable={false}
        />

        {/* Gradient overlay — left dark for readability, right transparent to show car */}
        <div
          className="absolute inset-0 pointer-events-none hidden sm:block"
          style={{
            background:
              "linear-gradient(to right, rgba(5,16,30,0.92) 0%, rgba(5,16,30,0.80) 25%, rgba(5,16,30,0.28) 50%, rgba(5,16,30,0.05) 72%, transparent 100%)",
          }}
        />
        {/* Mobile: vertical valley overlay — dark top (H1), lighter middle (car), dark bottom (form) */}
        <div
          className="absolute inset-0 pointer-events-none sm:hidden"
          style={{
            background:
              "linear-gradient(to bottom, rgba(5,16,30,0.88) 0%, rgba(5,16,30,0.78) 22%, rgba(5,16,30,0.32) 50%, rgba(5,16,30,0.68) 72%, rgba(5,16,30,0.84) 100%)",
          }}
        />
        {/* Top fade — prevents church from visually colliding with the header */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none z-[1]"
          style={{
            height: "90px",
            background: "linear-gradient(to bottom, hsl(211,55%,8%) 0%, transparent 100%)",
          }}
        />
        {/* Bottom fade into continuation section */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: "100px",
            background: "linear-gradient(to top, hsl(211,55%,8%) 0%, transparent 100%)",
          }}
        />

        {/* Content — flex column; benefits + form pin to bottom */}
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-5 sm:pt-12 flex flex-col min-h-[680px] sm:min-h-[640px]">

          {/* Hero copy — left-aligned, constrained width so car stays visible */}
          <div className="max-w-xl mb-0">
            <h1 className="text-3xl sm:text-[2.7rem] font-bold tracking-tight mb-2 leading-[1.1] text-white">
              Rent a Car in Georgia
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mb-2 leading-snug">
              Tbilisi · Kutaisi · Batumi Airport &amp; City Services
            </p>
            {/* Top trust cluster — Full Insurance / 24h / No Prepayment with pulsing dots */}
            <div className="flex flex-wrap items-center gap-y-1.5 mb-1.5">
              {[
                { label: "Full Insurance", Icon: Shield },
                { label: "24/7 Working Hours", Icon: Clock },
                { label: "No Prepayment", Icon: CheckCircle },
              ].map(({ label, Icon }, idx, arr) => (
                <span key={label} className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-200">
                  <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>{label}</span>
                  {idx < arr.length - 1 && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mx-2 animate-pulse [animation-duration:2.5s]" />
                  )}
                </span>
              ))}
            </div>
            <p className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-primary">
              <Award className="w-3.5 h-3.5 shrink-0 animate-pulse [animation-duration:3s]" />
              10+ years of car rental experience
            </p>
          </div>

          {/* Spacer — pushes benefits + form to bottom, lets hero scenery show */}
          <div className="flex-1" />

          {/* Benefits + Booking constrained to left — car stays visible on the right */}
          <div className="max-w-[960px]">

          {/* Benefits strip — directly above the booking bar (no duplicates from top row) */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-2">
            {[
              { label: "Unlimited Mileage", Icon: Infinity },
              { label: "Additional Drivers", Icon: Users },
              { label: "Transparent Prices", Icon: CheckCircle },
              { label: "Roadside Assistance", Icon: HeartHandshake },
            ].map(({ label, Icon }, idx, arr) => (
              <span key={label} className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-300">
                <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{label}</span>
                {idx < arr.length - 1 && (
                  <span className="hidden sm:inline-block w-px h-3 bg-slate-600/70 ml-1" />
                )}
              </span>
            ))}
          </div>

          {/* Booking Widget */}
          <div className="pb-6 sm:pb-8">
            <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl text-left">

              {/* Main bar — stacked on mobile/tablet, single row on lg+ */}
              <div className="flex flex-col lg:flex-row lg:items-stretch divide-y lg:divide-y-0 lg:divide-x divide-white/10">

                {/* Pickup Location */}
                <div className="flex-1 min-w-0 p-3 lg:p-2.5">
                  <LocationSelect
                    value={pickupLocationId}
                    onChange={handlePickupChange}
                    options={visibleLocations}
                    placeholder="Pickup Location"
                  />
                  {/* "Drop-off in different location" — unchecked=same, checked=different */}
                  <label className="flex items-center gap-2 mt-2.5 cursor-pointer w-fit group">
                    <input
                      type="checkbox"
                      checked={!sameLocation}
                      onChange={(e) => setSameLocation(!e.target.checked)}
                      className="w-4 h-4 rounded border-white/20 accent-primary shrink-0 cursor-pointer"
                    />
                    <span className={`text-[11px] transition-colors leading-tight select-none group-hover:text-white ${!sameLocation ? "text-white font-medium" : "text-slate-400"}`}>Drop-off in different location</span>
                  </label>
                  {pickupIsDowntown && (
                    <label className="flex items-center gap-2 mt-1.5 cursor-pointer w-fit">
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

                {/* Mobile only — Return Location between Pickup and Dates when checkbox is ticked */}
                {!sameLocation && (
                  <div className="lg:hidden flex-1 min-w-0 p-3 border-t border-white/10">
                    <LocationSelect
                      value={dropoffLocationId}
                      onChange={handleDropoffChange}
                      options={visibleLocations}
                      placeholder="Drop-off Location"
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

                {/* Desktop only — Drop-off Location as inline column in main row when checkbox is ticked */}
                {!sameLocation && (
                  <div className="hidden lg:block flex-1 min-w-0 p-2.5">
                    <LocationSelect
                      value={dropoffLocationId}
                      onChange={handleDropoffChange}
                      options={visibleLocations}
                      placeholder="Drop-off Location"
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

                {/* Pickup Date & Time */}
                <div className="flex-1 min-w-0 p-3 lg:p-2.5">
                  <DateTimePicker
                    value={pickupDatetime}
                    min={minDt}
                    onChange={setPickupDatetime}
                    placeholder="Pickup Date & Time"
                    onDone={() => dropoffPickerRef.current?.openPicker()}
                  />
                </div>

                {/* Return Date & Time */}
                <div className="flex-1 min-w-0 p-3 lg:p-2.5">
                  <DateTimePicker
                    ref={dropoffPickerRef}
                    value={dropoffDatetime}
                    min={pickupDatetime || minDt}
                    onChange={setDropoffDatetime}
                    placeholder="Return Date & Time"
                  />
                </div>

                {/* Action column: Search Vehicles only */}
                <div className="shrink-0 lg:w-52 p-3 lg:p-2.5 flex flex-col justify-center">
                  <SearchButton
                    onValidate={validateSearch}
                    onSearch={navigateToBooking}
                    className="w-full bg-primary hover:bg-accent text-white font-semibold py-3 px-5 rounded-xl transition-colors text-sm shadow-md flex items-center justify-center gap-2 whitespace-nowrap"
                  />
                </div>
              </div>

              {error && (
                <p className="px-3 pb-3 text-sm text-destructive">{error}</p>
              )}
            </div>
          </div>
          </div>{/* end max-w-[860px] form constraint */}
        </div>
      </section>

      {/* ── Trust cards + Explore Georgia — continuation of dark hero section ── */}
      <section style={{ background: "hsl(211,55%,8%)" }} className="pb-10">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6">

          {/* Trustpilot & Google — glass-like, centered, compact */}
          <div className="flex justify-center flex-wrap gap-3 pt-4 pb-7">
            {HERO_RATING_CARDS.map((r) => (
              <a
                key={r.platform}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 hover:bg-white/[0.10] hover:border-white/20 transition-colors backdrop-blur-md"
              >
                <span className={`text-lg font-bold leading-none select-none ${r.markColor}`}>
                  {r.brandMark}
                </span>
                <div>
                  <div className="text-sm font-semibold text-white leading-tight">{r.platform}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-semibold text-white/80">{r.rating}</span>
                    {" · "}{r.descriptor}
                  </div>
                </div>
              </a>
            ))}
          </div>

          {/* TEMPORARILY HIDDEN — Restore: change false → true */}
          {false && (
            <>
              {/* Explore Georgia heading — centred */}
              <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-3">
                Explore Georgia with Tbilisicars
              </h2>

              {/* Short red divider */}
              <div className="w-14 h-[2px] bg-primary rounded-full mx-auto mb-5" />

              {/* Location / service cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {LOCATION_CARDS.map((card) => (
                  <Link
                    key={card.href + card.label}
                    href={card.href}
                    className="group flex items-start gap-3 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-4 hover:bg-white/[0.11] hover:border-primary/40 hover:shadow-[0_0_20px_rgba(0,0,0,0.4)] transition-all duration-200 backdrop-blur-sm"
                  >
                    <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-primary group-hover:text-primary/80 transition-colors" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white leading-tight">{card.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{card.sub}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}

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
          {dynamicCategories && dynamicCategories.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {dynamicCategories.map((cat) => (
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
          )}
        </div>
      </section>

    </div>
  );
}
