import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Calendar, Shield, Star, Clock, ChevronRight } from "lucide-react";
import { Link } from "wouter";

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

function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function getMinDatetime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
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
        className="relative min-h-[90vh] flex flex-col items-center justify-center bg-cover bg-center px-4 py-16"
        style={{ background: "linear-gradient(135deg, hsl(211,55%,8%) 0%, hsl(211,53%,14%) 50%, hsl(211,50%,9%) 100%)" }}
      >
        {/* Background texture overlay */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, hsl(350,68%,38%) 0%, transparent 50%), radial-gradient(circle at 80% 20%, hsl(214,45%,25%) 0%, transparent 50%)"
        }} />

        <div className="relative z-10 w-full max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-primary/20 border border-primary/30 rounded-full px-4 py-1.5 text-sm text-primary mb-6">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Available 7 days a week across Georgia
          </div>

          <h1 className="text-4xl sm:text-6xl font-bold text-white tracking-tight mb-4 leading-[1.1]">
            Drive Georgia<br />
            <span className="text-primary">in Style</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Premium car rental in Tbilisi, Batumi, and Kutaisi. No hidden fees, no surprises — just exceptional cars and service.
          </p>

          {/* Booking Widget */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl text-left max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Find Your Car
            </h2>

            {/* Location row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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
            <label className="flex items-center gap-2 mb-4 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={sameLocation}
                onChange={(e) => setSameLocation(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary"
              />
              <span className="text-sm text-muted-foreground">Return to same location</span>
            </label>

            {/* Date row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Pickup Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={pickupDatetime}
                  min={minDt}
                  onChange={(e) => setPickupDatetime(e.target.value)}
                  className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Return Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={dropoffDatetime}
                  min={pickupDatetime || minDt}
                  onChange={(e) => setDropoffDatetime(e.target.value)}
                  className="w-full rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
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

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-6 mt-8 text-sm text-muted-foreground">
            {[
              { icon: <Shield className="w-4 h-4 text-primary" />, label: "Fully insured fleet" },
              { icon: <Star className="w-4 h-4 text-primary" />, label: "No hidden fees" },
              { icon: <Clock className="w-4 h-4 text-primary" />, label: "24/7 support" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                {item.icon}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Choose Us ── */}
      <section className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Why Tbilisi Cars?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We combine premium vehicles with transparent pricing and outstanding service across Georgia.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <Shield className="w-6 h-6 text-primary" />,
                title: "Fully Insured",
                desc: "All our vehicles come with comprehensive insurance options to keep you protected on Georgian roads.",
              },
              {
                icon: <Star className="w-6 h-6 text-primary" />,
                title: "Premium Fleet",
                desc: "Choose from a curated selection of well-maintained, modern vehicles for every need and budget.",
              },
              {
                icon: <MapPin className="w-6 h-6 text-primary" />,
                title: "Multiple Locations",
                desc: "Pick up and return your car at convenient locations in Tbilisi, Batumi, Kutaisi, and more.",
              },
              {
                icon: <Clock className="w-6 h-6 text-primary" />,
                title: "Flexible Hours",
                desc: "Available 7 days a week with early morning and late evening pickup slots to fit your schedule.",
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ),
                title: "Transparent Pricing",
                desc: "No surprises at the counter. The price you see is the price you pay — always.",
              },
              {
                icon: (
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                ),
                title: "24/7 Roadside Support",
                desc: "Our team is always reachable. Breakdown, flat tyre, or any emergency — we've got you covered.",
              },
            ].map((item) => (
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

      {/* ── CTA Banner ── */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-2xl p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to Explore Georgia?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Browse our full fleet of premium vehicles and find the perfect car for your adventure.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/fleet"
              className="bg-primary hover:bg-accent text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-md"
            >
              View Our Fleet
            </Link>
            <Link
              href="/booking"
              className="border border-border text-foreground hover:bg-secondary/50 font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Book Now
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
