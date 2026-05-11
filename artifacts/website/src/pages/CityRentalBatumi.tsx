import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { Shield, Gauge, Plane, Headphones, Car } from "lucide-react";

const FEATURES = [
  { icon: <Shield className="w-5 h-5 text-primary" />, text: "Full insurance options included with every rental" },
  { icon: <Gauge className="w-5 h-5 text-primary" />, text: "Unlimited mileage — drive the Black Sea coast and beyond" },
  { icon: <Plane className="w-5 h-5 text-primary" />, text: "Pickup and dropoff at Batumi International Airport" },
  { icon: <Headphones className="w-5 h-5 text-primary" />, text: "24/7 support available throughout your stay in Adjara" },
  { icon: <Car className="w-5 h-5 text-primary" />, text: "Wide range of vehicles — economy, SUV, automatic and manual" },
];

export default function CityRentalBatumi() {
  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>Car Rental Batumi – Rent a Car in Georgia | Tbilisicars</title>
        <meta name="description" content="Rent a car in Batumi with full insurance, unlimited mileage and airport delivery. Explore Adjara and the Black Sea coast with Tbilisicars." />
        <link rel="canonical" href="https://tbilisicars.com/car-rental-batumi" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/car-rental-batumi" />
        <meta property="og:title" content="Car Rental Batumi – Rent a Car in Georgia | Tbilisicars" />
        <meta property="og:description" content="Rent a car in Batumi with full insurance, unlimited mileage and airport delivery. Explore Adjara and the Black Sea coast with Tbilisicars." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Car Rental Batumi – Rent a Car in Georgia | Tbilisicars" />
        <meta name="twitter:description" content="Rent a car in Batumi with full insurance, unlimited mileage and airport delivery. Explore Adjara and the Black Sea coast with Tbilisicars." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
        <script type="application/ld+json">{`
{
  "@context": "https://schema.org",
  "@type": "AutoRental",
  "name": "Tbilisicars – Car Rental Batumi",
  "url": "https://tbilisicars.com/car-rental-batumi",
  "telephone": "+995557376363",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Batumi",
    "addressCountry": "GE"
  },
  "areaServed": "Batumi, Georgia"
}
`}</script>
      </Helmet>

      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            Batumi, Georgia
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Car Rental in Batumi, Georgia
          </h1>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto leading-relaxed">
            Rent a car in Batumi with Tbilisicars. We offer reliable vehicles with full insurance, unlimited mileage and direct airport pickup for travelers arriving at Batumi International Airport. Whether you're staying along the Black Sea coast, heading into the Adjara mountains, or planning a scenic drive toward Svaneti — we have the right vehicle for your trip.
          </p>
        </div>

        {/* Why Batumi */}
        <div className="bg-card border border-border rounded-2xl p-8 mb-6">
          <h2 className="text-xl font-bold text-white mb-3">Why Rent a Car in Batumi?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Batumi is Georgia's Black Sea resort city and a gateway to the stunning Adjara region. A rental car lets you explore the Batumi Botanical Garden, the mountain villages of Adjara, and the coastal road toward Turkey — all on your own schedule. Our team meets you directly at Batumi Airport, so you can be on the road within minutes of landing.
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
