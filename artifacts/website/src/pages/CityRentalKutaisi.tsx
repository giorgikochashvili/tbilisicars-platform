import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { Shield, Gauge, Plane, Headphones, Car } from "lucide-react";

const FEATURES = [
  { icon: <Shield className="w-5 h-5 text-primary" />, text: "Full insurance options included with every rental" },
  { icon: <Gauge className="w-5 h-5 text-primary" />, text: "Unlimited mileage — explore Imereti and beyond without limits" },
  { icon: <Plane className="w-5 h-5 text-primary" />, text: "Pickup and dropoff at Kutaisi International Airport" },
  { icon: <Headphones className="w-5 h-5 text-primary" />, text: "24/7 support throughout your trip in Georgia" },
  { icon: <Car className="w-5 h-5 text-primary" />, text: "Wide range of vehicles — economy, SUV, automatic and manual" },
];

export default function CityRentalKutaisi() {
  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>Car Rental Kutaisi Airport – Rent a Car in Georgia | Tbilisicars</title>
        <meta name="description" content="Rent a car at Kutaisi Airport with full insurance, unlimited mileage and flexible pickup. Explore Imereti and Georgia with Tbilisicars." />
        <link rel="canonical" href="https://tbilisicars.com/car-rental-kutaisi" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/car-rental-kutaisi" />
        <meta property="og:title" content="Car Rental Kutaisi Airport – Rent a Car in Georgia | Tbilisicars" />
        <meta property="og:description" content="Rent a car at Kutaisi Airport with full insurance, unlimited mileage and flexible pickup. Explore Imereti and Georgia with Tbilisicars." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Car Rental Kutaisi Airport – Rent a Car in Georgia | Tbilisicars" />
        <meta name="twitter:description" content="Rent a car at Kutaisi Airport with full insurance, unlimited mileage and flexible pickup. Explore Imereti and Georgia with Tbilisicars." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
        <script type="application/ld+json">{`
{
  "@context": "https://schema.org",
  "@type": "AutoRental",
  "name": "Tbilisicars – Car Rental Kutaisi",
  "url": "https://tbilisicars.com/car-rental-kutaisi",
  "telephone": "+995595286600",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Kutaisi",
    "addressCountry": "GE"
  },
  "areaServed": "Kutaisi, Georgia"
}
`}</script>
      </Helmet>

      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            Kutaisi, Georgia
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Car Rental in Kutaisi, Georgia
          </h1>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto leading-relaxed">
            Rent a car at Kutaisi Airport with Tbilisicars. Kutaisi International Airport is one of Georgia's busiest entry points, and we ensure a smooth vehicle handover the moment you arrive. From Prometheus Cave to Gelati Monastery and the broader Imereti region, your rental car gives you the freedom to explore at your own pace.
          </p>
        </div>

        {/* Why Kutaisi */}
        <div className="bg-card border border-border rounded-2xl p-8 mb-6">
          <h2 className="text-xl font-bold text-white mb-3">Why Rent a Car at Kutaisi Airport?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Kutaisi is Georgia's second-largest city and a hub for western Georgia. With a rental car, you can easily reach Prometheus Cave, Okatse Canyon, the Gelati UNESCO World Heritage site, and the scenic mountain roads of Racha — all within a short drive. We offer flexible pickup directly at the airport terminal, with no waiting and no surprises.
          </p>
        </div>

        {/* Features */}
        <div className="bg-card border border-border rounded-2xl p-8 mb-8">
          <h2 className="text-xl font-bold text-white mb-6">What's Included</h2>
          <ul className="space-y-4">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  {f.icon}
                </div>
                <span className="text-muted-foreground leading-relaxed">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white font-semibold px-8 py-3 rounded-xl transition-colors text-base"
          >
            Search Available Cars
          </Link>
        </div>
      </div>
    </div>
  );
}
