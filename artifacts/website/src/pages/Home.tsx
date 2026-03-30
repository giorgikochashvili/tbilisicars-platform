import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin, Calendar, Shield, ChevronRight,
  Users, CheckCircle, Phone, Infinity, Car, HeartHandshake,
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
  { value: "10,000+", label: "Served Customers" },
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
        className="relative min-h-[90vh] lg:min-h-0 flex flex-col items-center justify-center px-4 py-16 lg:py-6"
        style={{ background: "linear-gradient(135deg, hsl(211,55%,8%) 0%, hsl(211,53%,14%) 50%, hsl(211,50%,9%) 100%)" }}
      >
        {/* Subtle background radial accents */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, hsl(350,68%,38%) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(214,45%,25%) 0%, transparent 50%)"
        }} />
        {/* Tbilisi skyline — full hero background layer, screen blend dissolves the dark base away */}
        <img
          src="/website/tbilisi-skyline.png"
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

          <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight mb-4 lg:mb-3 leading-[1.15]">
            Discover Georgia With Us
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-10 lg:mb-5">
            Affordable Car Rental Across Georgia, All Category Vehicles, Airport Offices, Unlimited Mileage, Roadside Assistance, Full Comprehensive Insurance.
          </p>

          {/* Booking Widget */}
          <div className="bg-[hsl(211,55%,8%)]/70 backdrop-blur-md border border-white/10 rounded-2xl p-6 lg:p-5 shadow-2xl text-left max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold text-white mb-5 lg:mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Find Your Car
            </h2>

            {/* Location row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 lg:mb-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Pickup Location
                </label>
                <select
                  value={pickupLocationId}
                  onChange={(e) => setPickupLocationId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                >
                  <option value="">Select location…</option>
                  {cities.map((city) => (
                    <optgroup key={city} label={city}>
                      {locations.filter((l) => l.city === city).map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {!sameLocation && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                    Return Location
                  </label>
                  <select
                    value={dropoffLocationId}
                    onChange={(e) => setDropoffLocationId(e.target.value)}
                    className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                  >
                    <option value="">Select location…</option>
                    {cities.map((city) => (
                      <optgroup key={city} label={city}>
                        {locations.filter((l) => l.city === city).map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
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
                <span className="text-2xl font-bold text-white">{s.value}</span>
                <span className="text-xs text-muted-foreground mt-0.5">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

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
