import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Calendar, Shield, ChevronRight, ChevronDown,
  Users, CheckCircle, Phone, Infinity, Car, HeartHandshake, ChevronLeft,
} from "lucide-react";
import { Link } from "wouter";
import { DateTimePicker, type DateTimePickerHandle } from "@/components/DateTimePicker";

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

const STATS = [
  { value: "12K+", label: "Trusted By Customers" },
  { value: "250+", label: "Vehicles" },
  { value: "4.6", label: "Overall Rating" },
];

const WHY_CARDS = [
  {
    icon: <Shield className="w-6 h-6 text-primary" />,
    title: "Full Insurance Options",
    desc: "Choose from Basic, Full, or Premium coverage. We offer transparent insurance plans with no hidden clauses.",
  },
  {
    icon: <CheckCircle className="w-6 h-6 text-primary" />,
    title: "Transparent Pricing",
    desc: "The price you see is the price you pay. No surprise fees at the counter, ever.",
  },
  {
    icon: <Infinity className="w-6 h-6 text-primary" />,
    title: "Unlimited Mileage",
    desc: "Drive anywhere within Georgia without distance limitations. Explore freely.",
  },
  {
    icon: <Users className="w-6 h-6 text-primary" />,
    title: "Unlimited Additional Drivers",
    desc: "Add as many drivers as you need to your rental — no extra fees apply.",
  },
  {
    icon: <Car className="w-6 h-6 text-primary" />,
    title: "Airport Parking & Service Charges Included",
    desc: "All airport service charges and parking fees are already included in your rental price.",
  },
  {
    icon: <HeartHandshake className="w-6 h-6 text-primary" />,
    title: "24/7 Roadside Assistance Across Georgia",
    desc: "Our support team is available around the clock. Breakdown, flat tyre, or any emergency — we're here.",
  },
];

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
  const dropoffPickerRef = useRef<DateTimePickerHandle>(null);

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

  const locations = config?.locations ?? [];
  const cities = Array.from(new Set(locations.map((l) => l.city))).sort();

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
        className="relative min-h-screen flex flex-col items-center justify-center px-4 py-16 lg:py-6"
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

        <style>{`
          @keyframes badge-dot-pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(1.15); }
          }
          .badge-dot { animation: badge-dot-pulse 2.5s ease-in-out infinite; }
        `}</style>

        <div className="relative z-10 w-full max-w-5xl mx-auto text-center">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 bg-primary/20 border border-primary/30 rounded-full px-4 py-1.5 text-sm text-primary mb-4 lg:mb-2">
            <span className="badge-dot w-2 h-2 rounded-full bg-primary" />
            10+ Years Experience
          </div>

          <div className="text-xs text-muted-foreground mb-6 lg:mb-2">
            24/7 Airport Office Services &amp; Customer Support
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4 lg:mb-3 leading-[1.15]">
            <span className="text-white">Discover </span>
            <span className="text-primary">Georgia</span>
            <span className="text-white"> With Us</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto mb-10 lg:mb-5">
            Affordable Car Rental Across Georgia, Full Comprehensive Insurance, All Category Vehicles, Airport Offices, Unlimited Mileage, Roadside Assistance.
          </p>

          {/* Booking Widget */}
          <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-6 lg:p-5 shadow-2xl text-left max-w-3xl mx-auto">
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

            <button
              onClick={handleSearch}
              className="w-full bg-primary hover:bg-accent text-white font-semibold py-3 px-6 rounded-xl transition-colors text-base shadow-md flex items-center justify-center gap-2"
            >
              Search Vehicles
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Stats strip */}
          <div className="flex flex-wrap justify-center gap-6 mt-8 lg:mt-5">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col items-center px-5 py-3 bg-white/5 border border-white/10 rounded-xl">
                <span className="text-2xl font-bold text-primary">{s.value}</span>
                <span className="text-xs text-muted-foreground mt-0.5">{s.label}</span>
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
                      {item.imageUrl ? (
                        <img
                          src={toStorageSrc(item.imageUrl)}
                          alt={item.title}
                          className="w-full h-full object-contain object-center group-hover:brightness-110 transition-all duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Car className="w-16 h-16 text-muted-foreground/30" />
                        </div>
                      )}
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

      {/* ── Why Tbilisicars ── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Why Tbilisicars?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We combine premium vehicles with transparent pricing and outstanding service across Georgia.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {WHY_CARDS.map((item) => (
              <div key={item.title} className="bg-card border border-border rounded-xl p-6 hover:border-primary/40 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  {item.icon}
                </div>
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-2xl p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to Explore Georgia?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Browse our full fleet of premium vehicles and find the perfect car for your journey.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/booking"
              className="bg-primary hover:bg-accent text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-md"
            >
              Book Now
            </Link>
            <Link
              href="/fleet"
              className="border border-border text-foreground hover:bg-secondary/50 font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              View Fleet
            </Link>
            <Link
              href="/locations"
              className="border border-border text-foreground hover:bg-secondary/50 font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
