import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Building2, Plane, Clock, Car, ChevronRight, Hotel } from "lucide-react";
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

const CITY_INFO: Record<string, { description: string }> = {
  Tbilisi: {
    description:
      "Tbilisicars provides car rental service at Tbilisi International Airport and in the city. Hotel and address handover is available by arrangement.",
  },
  Kutaisi: {
    description:
      "Tbilisicars provides car rental service at Kutaisi International Airport and in the city. Hotel and address handover is available by arrangement where possible.",
  },
  Batumi: {
    description:
      "Tbilisicars provides car rental service at Batumi Airport and in the city. Hotel and address handover is available by arrangement where possible.",
  },
};

const CITY_CARDS = [
  {
    city: "Tbilisi",
    airport: "Tbilisi International Airport",
    href: "/car-rental-tbilisi",
    bullets: [
      "Airport pickup and return",
      "City and downtown service",
      "Hotel and address handover by arrangement",
      "Good starting point for eastern Georgia and mountain routes",
    ],
  },
  {
    city: "Kutaisi",
    airport: "Kutaisi International Airport",
    href: "/car-rental-kutaisi",
    bullets: [
      "Airport pickup and return",
      "City service available",
      "Gateway to western Georgia — Imereti, Svaneti, Samegrelo and Batumi",
      "Hotel and address handover by arrangement where available",
    ],
  },
  {
    city: "Batumi",
    airport: "Batumi International Airport",
    href: "/car-rental-batumi",
    bullets: [
      "Airport and city service",
      "Black Sea coast and Adjara travel",
      "Hotel and address handover by arrangement where available",
    ],
  },
];

const HANDOVER_ITEMS = [
  {
    icon: Plane,
    title: "Airport pickup and return",
    body: "Pick up and return your car at the airport. Our team coordinates handover to suit your arrival and departure schedule.",
  },
  {
    icon: Building2,
    title: "City and downtown service",
    body: "Car rental service is available in Tbilisi, Kutaisi and Batumi city locations depending on availability.",
  },
  {
    icon: Hotel,
    title: "Hotel and address handover",
    body: "Handover to hotels, apartments or agreed addresses can be arranged where available. Contact us to confirm for your location.",
  },
  {
    icon: Clock,
    title: "24/7 working hours",
    body: "We adapt pickup and return times to flight schedules and travel plans.",
  },
];

export default function Locations() {
  const { data: config, isLoading, error } = useQuery<BookingConfig>({
    queryKey: ["booking-config"],
    queryFn: () => apiFetch("/api/public/booking-config"),
  });

  const locations = config?.locations ?? [];
  const cities = Array.from(new Set(locations.map((l) => l.city))).sort();

  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>Car Rental Locations in Georgia – Tbilisi, Kutaisi, Batumi</title>
        <meta name="description" content="Find Tbilisicars rental locations in Tbilisi, Kutaisi and Batumi including airport and city delivery options." />
        <link rel="canonical" href="https://tbilisicars.com/locations" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/locations" />
        <meta property="og:title" content="Car Rental Locations in Georgia – Tbilisi, Kutaisi, Batumi" />
        <meta property="og:description" content="Find Tbilisicars rental locations in Tbilisi, Kutaisi and Batumi including airport and city delivery options." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Car Rental Locations in Georgia – Tbilisi, Kutaisi, Batumi" />
        <meta name="twitter:description" content="Find Tbilisicars rental locations in Tbilisi, Kutaisi and Batumi including airport and city delivery options." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
      </Helmet>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            <MapPin className="w-4 h-4" />
            Our Locations
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Car Rental Locations in Georgia</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Tbilisicars provides airport and city car rental services in Georgia's main travel hubs — Tbilisi, Kutaisi and Batumi — with pickup, return, and hotel or address handover options available by arrangement.
          </p>
        </div>

        {/* City hub cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-14">
          {CITY_CARDS.map((card) => (
            <Link
              key={card.city}
              href={card.href}
              className="group bg-card border border-border rounded-2xl p-6 flex flex-col hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 transition-all duration-200"
            >
              {/* Card header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Plane className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-white text-base">{card.city}</div>
                  <div className="text-xs text-muted-foreground">{card.airport}</div>
                </div>
              </div>

              {/* Bullets */}
              <ul className="space-y-2 flex-1 mb-5">
                {card.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>

              {/* Learn more */}
              <div className="flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
                Learn More <ChevronRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>

        {/* Handover explanation section */}
        <div className="mb-14">
          <h2 className="text-xl font-bold text-white mb-6 text-center">Pickup & Handover Options</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {HANDOVER_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="bg-card border border-border rounded-xl p-5 flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm mb-1">{item.title}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic location list from API */}
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
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No locations available at this time.</p>
              </div>
            ) : (
              <div className="space-y-10 mb-10">
                {cities.map((city) => {
                  const info = CITY_INFO[city];
                  return (
                    <div key={city}>
                      {/* City heading */}
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-primary" />
                        </div>
                        <h2 className="text-xl font-bold text-white">{city}</h2>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      {/* City description */}
                      {info?.description && (
                        <p className="text-sm text-muted-foreground mb-4 max-w-2xl">{info.description}</p>
                      )}

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
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* CTA */}
        <div className="mt-10 text-center bg-card border border-border rounded-2xl p-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Car className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-white mb-3">Ready to book?</h2>
          <p className="text-muted-foreground mb-6 text-sm max-w-md mx-auto">
            Choose your pickup location when starting your booking. We'll make sure your car is ready for your trip.
          </p>
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            Choose Your Car
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </div>
  );
}
