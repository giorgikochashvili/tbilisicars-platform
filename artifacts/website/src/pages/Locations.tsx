import { useQuery } from "@tanstack/react-query";
import { MapPin, Building2 } from "lucide-react";
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

export default function Locations() {
  const { data: config, isLoading, error } = useQuery<BookingConfig>({
    queryKey: ["booking-config"],
    queryFn: () => apiFetch("/api/public/booking-config"),
  });

  const locations = config?.locations ?? [];
  const cities = Array.from(new Set(locations.map((l) => l.city))).sort();

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            <MapPin className="w-4 h-4" />
            Our Locations
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Where to Find Us</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Pick up and return your car at any of our convenient locations across Georgia. Airport, city centre, and more.
          </p>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-16 text-muted-foreground">
            <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Unable to load locations. Please try again later.</p>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {cities.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No locations available at this time.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {cities.map((city) => (
                  <div key={city}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <h2 className="text-xl font-bold text-white">{city}</h2>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {locations
                        .filter((l) => l.city === city)
                        .map((loc) => (
                          <div
                            key={loc.id}
                            className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                <MapPin className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <div className="font-semibold text-white">{loc.name}</div>
                                <div className="text-sm text-muted-foreground mt-0.5">{loc.city}, Georgia</div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* CTA */}
        <div className="mt-14 text-center bg-card border border-border rounded-2xl p-8">
          <h2 className="text-xl font-bold text-white mb-3">Ready to book?</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            Choose your pickup location when starting your booking. We'll make sure the car is ready for you.
          </p>
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Start Your Booking
          </Link>
        </div>
      </div>
    </div>
  );
}
