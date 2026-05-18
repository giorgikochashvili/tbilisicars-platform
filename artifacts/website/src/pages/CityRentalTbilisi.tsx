import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { Shield, Gauge, Plane, Headphones, Car, Phone, MessageCircle, Mail, MapPin } from "lucide-react";

const FEATURES = [
  { icon: <Shield className="w-5 h-5 text-primary" />, text: "Full insurance options included with every rental" },
  { icon: <Gauge className="w-5 h-5 text-primary" />, text: "Unlimited mileage — drive across all of Georgia freely" },
  { icon: <Plane className="w-5 h-5 text-primary" />, text: "Pickup and dropoff at Tbilisi International Airport" },
  { icon: <Headphones className="w-5 h-5 text-primary" />, text: "24/7 support for any question or emergency" },
  { icon: <Car className="w-5 h-5 text-primary" />, text: "Wide range of vehicles — economy, SUV, automatic and manual" },
];

export default function CityRentalTbilisi() {
  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>Car Rental Tbilisi – Rent a Car in Georgia | Tbilisicars</title>
        <meta name="description" content="Rent a car in Tbilisi with full insurance, unlimited mileage and airport delivery. Book your car rental in Georgia with Tbilisicars." />
        <link rel="canonical" href="https://tbilisicars.com/car-rental-tbilisi" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/car-rental-tbilisi" />
        <meta property="og:title" content="Car Rental Tbilisi – Rent a Car in Georgia | Tbilisicars" />
        <meta property="og:description" content="Rent a car in Tbilisi with full insurance, unlimited mileage and airport delivery. Book your car rental in Georgia with Tbilisicars." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Car Rental Tbilisi – Rent a Car in Georgia | Tbilisicars" />
        <meta name="twitter:description" content="Rent a car in Tbilisi with full insurance, unlimited mileage and airport delivery. Book your car rental in Georgia with Tbilisicars." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
        <script type="application/ld+json">{`
{
  "@context": "https://schema.org",
  "@type": "AutoRental",
  "name": "Tbilisicars – Tbilisi Airport",
  "url": "https://tbilisicars.com/car-rental-tbilisi",
  "telephone": "+995557376363",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Tbilisi",
    "addressCountry": "GE"
  },
  "areaServed": "Tbilisi, Georgia"
}
`}</script>
      </Helmet>

      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            Tbilisi, Georgia
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            Car Rental in Tbilisi, Georgia
          </h1>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto leading-relaxed">
            Rent a car in Tbilisi with Tbilisicars. We offer reliable vehicles with full insurance, unlimited mileage and airport delivery for international travelers visiting Georgia's capital. Whether you're exploring the historic Old Town, driving up to Kazbegi, or navigating Rustaveli Avenue — we have the right car for your journey.
          </p>
        </div>

        {/* Why Tbilisi */}
        <div className="bg-card border border-border rounded-2xl p-8 mb-6">
          <h2 className="text-xl font-bold text-white mb-3">Why Rent a Car in Tbilisi?</h2>
          <p className="text-muted-foreground leading-relaxed">
            Tbilisi is Georgia's vibrant capital and the natural starting point for most visitors. A rental car gives you the freedom to visit Mtskheta, Gori, or the Kakheti wine region at your own pace, without depending on taxis or tour buses. Our team is available at Tbilisi International Airport to hand over your vehicle the moment you land.
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

        {/* Contact strip */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-8">
          <h2 className="text-base font-semibold text-white mb-4">Questions? We're Here to Help</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <a href="tel:+995557376363" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
              <Phone className="w-4 h-4 text-primary shrink-0" />+995 557 37 63 63
            </a>
            <a href="https://wa.me/995557376363" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
              <MessageCircle className="w-4 h-4 text-primary shrink-0" />WhatsApp
            </a>
            <a href="mailto:reservations@tbilisicars.com" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
              <Mail className="w-4 h-4 text-primary shrink-0" />reservations@tbilisicars.com
            </a>
            <a href="https://share.google/Jtio5bdi27NjFywoz" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
              <MapPin className="w-4 h-4 text-primary shrink-0" />Tbilisi Airport Office
            </a>
            <Link href="/contact" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors">
              More contact options
            </Link>
          </div>
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
