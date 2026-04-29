import { Helmet } from "react-helmet-async";
import { Car, MapPin, Phone, Shield, Users, Infinity, HeartHandshake } from "lucide-react";
import { Link } from "wouter";

const SERVICES = [
  {
    icon: <Car className="w-6 h-6 text-primary" />,
    title: "Standard Car Rental",
    desc: "Daily, weekly, and monthly rental options across all vehicle classes. Transparent CRM-driven pricing with no surprise fees at the counter.",
    features: ["Flexible duration", "Multiple vehicle classes", "Online booking available"],
  },
  {
    icon: <MapPin className="w-6 h-6 text-primary" />,
    title: "Airport Delivery",
    desc: "Seamless vehicle pickup and return at Georgia's major international airports. Our team is on-site to meet you the moment you land.",
    features: ["Tbilisi International Airport", "Kutaisi International Airport", "Batumi International Airport"],
  },
  {
    icon: <Shield className="w-6 h-6 text-primary" />,
    title: "Full Insurance Options",
    desc: "Choose from our three coverage tiers — Basic, Full, or Premium — with transparent deposits and excess amounts. No hidden clauses.",
    features: ["Basic coverage", "Full coverage", "Premium coverage"],
  },
  {
    icon: <Infinity className="w-6 h-6 text-primary" />,
    title: "Unlimited Mileage",
    desc: "Drive anywhere within Georgia without distance limitations. Explore Kazbegi, Svaneti, or the Black Sea coast — all included in your rate.",
    features: ["No distance cap", "No overage charges", "Full Georgia coverage"],
  },
  {
    icon: <Users className="w-6 h-6 text-primary" />,
    title: "Unlimited Additional Drivers",
    desc: "Add as many drivers as you need to share the driving experience — at no extra charge on any rental.",
    features: ["No per-driver fee", "All drivers covered by insurance", "Listed on the rental agreement"],
  },
  {
    icon: <Phone className="w-6 h-6 text-primary" />,
    title: "24/7 Customer Support",
    desc: "Our support team is available around the clock via phone, WhatsApp, Telegram, and other messaging platforms. We're always reachable.",
    features: ["Phone & messaging", "Airport assistance", "Emergency escalation"],
  },
  {
    icon: <HeartHandshake className="w-6 h-6 text-primary" />,
    title: "Roadside Assistance",
    desc: "In case of breakdown, flat tyre, or any mechanical issue during your rental, our team provides immediate assistance anywhere in Georgia.",
    features: ["24/7 coverage", "Vehicle swap if needed", "Pan-Georgia reach"],
  },
];

export default function Services() {
  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>Car Rental Services in Georgia | Tbilisicars</title>
        <meta name="description" content="Explore our car rental services including airport delivery, full insurance, unlimited drivers and 24/7 support in Georgia." />
        <link rel="canonical" href="https://tbilisicars.com/services" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/services" />
        <meta property="og:title" content="Car Rental Services in Georgia | Tbilisicars" />
        <meta property="og:description" content="Explore our car rental services including airport delivery, full insurance, unlimited drivers and 24/7 support in Georgia." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Car Rental Services – Insurance, Delivery & More | Tbilisicars" />
        <meta name="twitter:description" content="Explore Tbilisicars services: full insurance, unlimited mileage, airport delivery, child seats and 24/7 roadside assistance in Georgia." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
      </Helmet>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            What We Offer
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Our Services</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            From short city trips to extended cross-country journeys, we offer a full range of car rental services built around your needs.
          </p>
        </div>

        {/* Services grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {SERVICES.map((service) => (
            <div key={service.title} className="bg-card border border-border rounded-2xl p-6 hover:border-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                {service.icon}
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{service.title}</h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{service.desc}</p>
              <ul className="space-y-1.5">
                {service.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Extras note */}
        <div className="bg-primary/10 border border-primary/25 rounded-xl p-6 mb-10">
          <h2 className="text-white font-semibold mb-2">Add-Ons Available at Booking</h2>
          <p className="text-sm text-muted-foreground">
            When booking online, you'll see a full selection of available add-ons pulled directly from our system — GPS, child seats, additional drivers, and more. Pricing is transparent and shown upfront.
          </p>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white font-semibold px-8 py-3 rounded-xl transition-colors text-base"
          >
            Book a Car Now
          </Link>
        </div>
      </div>
    </div>
  );
}
