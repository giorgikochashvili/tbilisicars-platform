import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Car, Users, Fuel, Settings, ChevronRight, Phone, Search } from "lucide-react";
import { Link } from "wouter";

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
  // Discount fields — only present when location + pickup_datetime are provided
  website_discount_id?: number | null;
  website_discount_name?: string | null;
  website_discount_type?: string | null;
  website_discount_value?: number | null;
  website_discount_amount?: number | null;
  original_min_price_per_day?: number | null;
  discounted_min_price_per_day?: number | null;
}

interface BookingConfig {
  vehicleModels: VehicleModel[];
}

async function apiFetch(path: string) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
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
        <Car className="w-16 h-16 text-muted-foreground/15" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card border border-border rounded-2xl overflow-hidden animate-pulse">
                <div className="aspect-[16/10] bg-muted" />
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
            <p className="mb-4">Unable to load vehicles. Please try again later.</p>
            <a href="tel:+995557376363" className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
              <Phone className="w-4 h-4" /> Call Us to Book
            </a>
          </div>
        )}

        {/* Empty state — professional with actions */}
        {!isLoading && !error && models.length === 0 && (
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-5">
              <Car className="w-8 h-8 text-primary/60" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No vehicles listed yet</h3>
            <p className="text-muted-foreground mb-3 leading-relaxed">
              Our fleet is being updated. You can start a search from the homepage or contact us directly — we have over 250 vehicles available.
            </p>
            <p className="text-xs text-amber-400/80 mb-8">
              Some vehicles may still be available on request — call us and we can check availability for your dates.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                <Search className="w-4 h-4" />
                Edit Search
              </Link>
              <a
                href="tel:+995557376363"
                className="inline-flex items-center gap-2 border border-border text-foreground hover:bg-secondary/50 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                <Phone className="w-4 h-4" />
                Contact Support
              </a>
            </div>
          </div>
        )}

        {/* Vehicle Grid */}
        {!isLoading && models.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {models.map((m) => {
              const transmission = transmissionLabel(m.transmission);
              const fuel = fuelLabel(m.fuel_type);
              const originalPrice = m.min_price_per_day ? Number(m.min_price_per_day) : null;
              const hasDiscount = !!(m.website_discount_id && m.discounted_min_price_per_day != null);
              const price = hasDiscount ? m.discounted_min_price_per_day! : originalPrice;
              const currency = m.price_currency ?? "GEL";
              const isOnRequest = Number(m.vehicle_count) === 0;

              return (
                <div
                  key={m.id}
                  className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/10 group flex flex-col"
                >
                  {/* Vehicle image */}
                  <div className="relative aspect-[16/10] bg-gradient-to-br from-secondary to-card overflow-hidden shrink-0">
                    <VehicleImg
                      src={toStorageSrc(m.image_url)}
                      alt={`${m.brand} ${m.model}`}
                      className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform duration-500"
                    />
                    {/* Category pill — top left */}
                    {m.category && (
                      <span className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide">
                        {m.category}
                      </span>
                    )}
                    {/* On Request badge — top right */}
                    {isOnRequest && (
                      <span className="absolute top-3 right-3 bg-amber-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                        On Request
                      </span>
                    )}
                    {/* Discount badge — top right (when discount active and not on request) */}
                    {hasDiscount && !isOnRequest && m.website_discount_name && (
                      <span className="absolute top-3 right-3 bg-green-500/90 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                        {m.website_discount_type === "PERCENT"
                          ? `${m.website_discount_value}% OFF`
                          : `${m.website_discount_value} GEL OFF`}
                      </span>
                    )}
                    {/* Price badge — bottom right */}
                    {price !== null && (
                      <div className="absolute bottom-3 right-3 bg-primary/90 backdrop-blur-sm text-white rounded-xl px-3 py-1.5 text-right">
                        {hasDiscount && originalPrice != null && (
                          <div className="text-[10px] line-through opacity-60 leading-none">{originalPrice.toLocaleString()} {currency}</div>
                        )}
                        <div className="text-sm font-bold leading-none">{price.toLocaleString()} {currency}</div>
                        <div className="text-[10px] opacity-80 leading-none mt-0.5">/day</div>
                      </div>
                    )}
                    {price === null && (
                      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-muted-foreground rounded-xl px-3 py-1.5">
                        <div className="text-xs leading-none">Contact for pricing</div>
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-base font-bold text-white mb-0.5">
                      {m.brand} {m.model}
                    </h3>

                    {/* Spec chips */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {m.seats && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 border border-border/50 rounded-full px-2.5 py-1">
                          <Users className="w-3 h-3" /> {m.seats} seats
                        </span>
                      )}
                      {transmission && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 border border-border/50 rounded-full px-2.5 py-1">
                          <Settings className="w-3 h-3" /> {transmission}
                        </span>
                      )}
                      {fuel && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 border border-border/50 rounded-full px-2.5 py-1">
                          <Fuel className="w-3 h-3" /> {fuel}
                        </span>
                      )}
                    </div>

                    {m.description && (
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                        {m.description}
                      </p>
                    )}

                    {/* On-request explanation — always visible */}
                    {isOnRequest && (
                      <div className="mb-3 mt-auto p-3 rounded-xl bg-amber-400/10 border border-amber-400/20">
                        <p className="text-xs text-amber-400/90 leading-relaxed">
                          This vehicle is not instantly available but can be requested — we'll confirm availability for your dates.
                        </p>
                      </div>
                    )}

                    {/* Price line */}
                    <div className="mb-3 mt-auto">
                      {price !== null ? (
                        <div>
                          {hasDiscount && m.website_discount_name ? (
                            <span className="text-xs text-green-400 font-medium">
                              {m.website_discount_name}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Starting from</span>
                          )}
                          <div className="flex items-baseline gap-2 flex-wrap">
                            {hasDiscount && originalPrice != null && (
                              <span className="text-base line-through text-muted-foreground/50">
                                {originalPrice.toLocaleString()} {currency}
                              </span>
                            )}
                            <div className="text-xl font-bold text-primary">
                              {price.toLocaleString()} <span className="text-sm font-semibold">{currency}</span>
                              <span className="text-sm font-normal text-muted-foreground">/day</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Contact us for pricing</span>
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
