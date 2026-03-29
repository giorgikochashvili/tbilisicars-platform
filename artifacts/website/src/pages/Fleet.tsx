import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Car, Users, Fuel, Settings, ChevronRight, Phone } from "lucide-react";

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

interface BookingConfig {
  vehicleModels: VehicleModel[];
}

async function apiFetch(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
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

export default function Fleet() {
  const [, navigate] = useLocation();

  const { data: config, isLoading, error } = useQuery<BookingConfig>({
    queryKey: ["booking-config"],
    queryFn: () => apiFetch("/api/public/booking-config"),
  });

  const models = config?.vehicleModels ?? [];

  function bookVehicle(modelId: number) {
    navigate(`/booking?vehicleModelId=${modelId}`);
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            <Car className="w-4 h-4" />
            Our Premium Fleet
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Choose Your Perfect Car</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Browse our curated selection of premium vehicles, maintained to the highest standards for your journey across Georgia.
          </p>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden animate-pulse">
                <div className="h-48 bg-muted" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-10 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-center py-16 text-muted-foreground">
            <Car className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Unable to load vehicles. Please try again later.</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && models.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Car className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No vehicles are currently available for online booking.</p>
          </div>
        )}

        {/* Vehicle Grid */}
        {!isLoading && models.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {models.map((m) => {
              const transmission = transmissionLabel(m.transmission);
              const fuel = fuelLabel(m.fuel_type);
              const price = m.min_price_per_day ? Number(m.min_price_per_day) : null;
              const currency = m.price_currency ?? "GEL";
              const isOnRequest = Number(m.vehicle_count) === 0;

              return (
                <div
                  key={m.id}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 transition-all hover:shadow-lg hover:shadow-primary/10 group flex flex-col"
                >
                  {/* Vehicle image */}
                  <div className="relative h-48 bg-muted overflow-hidden shrink-0">
                    {m.image_url ? (
                      <img
                        src={m.image_url}
                        alt={`${m.brand} ${m.model}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Car className="w-16 h-16 text-muted-foreground/30" />
                      </div>
                    )}
                    {/* Category badge */}
                    {m.category && (
                      <span className="absolute top-3 left-3 bg-primary/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                        {m.category}
                      </span>
                    )}
                    {/* On Request badge */}
                    {isOnRequest && (
                      <span className="absolute top-3 right-3 bg-amber-500/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                        On Request
                      </span>
                    )}
                    {/* Price badge (only when vehicle is available) */}
                    {!isOnRequest && price !== null && (
                      <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm border border-border text-white text-sm font-bold px-3 py-1 rounded-full">
                        From {price.toLocaleString()} {currency}/day
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-lg font-bold text-white mb-1">
                      {m.brand} {m.model}
                    </h3>

                    {/* Specs */}
                    <div className="flex flex-wrap gap-3 mb-3">
                      {m.seats && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3.5 h-3.5" />
                          {m.seats} seats
                        </span>
                      )}
                      {transmission && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Settings className="w-3.5 h-3.5" />
                          {transmission}
                        </span>
                      )}
                      {fuel && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Fuel className="w-3.5 h-3.5" />
                          {fuel}
                        </span>
                      )}
                    </div>

                    {m.description && (
                      <p className="text-xs text-muted-foreground mb-4 line-clamp-2 leading-relaxed">
                        {m.description}
                      </p>
                    )}

                    {/* Price row */}
                    <div className="mb-4 mt-auto">
                      {isOnRequest ? (
                        <div>
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-1.5">
                            <Phone className="w-3 h-3" />
                            Available on request — contact us for pricing
                          </span>
                        </div>
                      ) : price !== null ? (
                        <div>
                          <span className="text-xs text-muted-foreground">Starting from</span>
                          <div className="text-xl font-bold text-primary">
                            {price.toLocaleString()} <span className="text-sm font-semibold">{currency}</span>
                            <span className="text-sm font-normal text-muted-foreground">/day</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs text-muted-foreground">Contact us for pricing</span>
                        </div>
                      )}
                    </div>

                    {isOnRequest ? (
                      <a
                        href="tel:+995557376363"
                        className="w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                      >
                        <Phone className="w-4 h-4" />
                        Call to Enquire
                      </a>
                    ) : (
                      <button
                        onClick={() => bookVehicle(m.id)}
                        className="w-full bg-primary hover:bg-accent text-white font-semibold py-2.5 px-4 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
                      >
                        Book This Car
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
