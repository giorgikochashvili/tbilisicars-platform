import { Car, MapPin, Phone, Shield, Clock, Star } from "lucide-react";
import { Link } from "wouter";

export default function Services() {
  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            What We Offer
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Our Services</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            From short city trips to extended cross-country journeys, we offer a full range of car rental services tailored to your needs.
          </p>
        </div>

        {/* Main services */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {[
            {
              icon: <Car className="w-6 h-6 text-primary" />,
              title: "Standard Car Rental",
              desc: "Daily, weekly, and monthly rental options for all vehicle classes. Transparent pricing from the CRM rates module — no surprises.",
              features: ["Flexible duration", "Multiple vehicle classes", "Online booking"],
            },
            {
              icon: <MapPin className="w-6 h-6 text-primary" />,
              title: "Airport Transfer",
              desc: "Seamless car pickup and return at Georgia's major airports. Your car will be waiting when you land.",
              features: ["Tbilisi Airport", "Batumi Airport", "Kutaisi Airport"],
            },
            {
              icon: <Shield className="w-6 h-6 text-primary" />,
              title: "Full Insurance Coverage",
              desc: "Choose from our three insurance tiers — Basic, Full, or Premium — to match your level of coverage preference.",
              features: ["Basic: 300€ deposit / 300€ excess", "Full: 300€ deposit / 100€ excess", "Premium: 100€ deposit / 100€ excess"],
            },
            {
              icon: <Phone className="w-6 h-6 text-primary" />,
              title: "24/7 Roadside Assistance",
              desc: "Our support team is always available. Whether it's a flat tyre on a mountain road or a minor incident, we'll help you.",
              features: ["Emergency support", "Vehicle swap if needed", "Local expertise"],
            },
            {
              icon: <Clock className="w-6 h-6 text-primary" />,
              title: "Long-Term Rental",
              desc: "Discounted monthly rates for extended stays. Ideal for expats, business travelers, or long-term visitors to Georgia.",
              features: ["Monthly pricing tiers", "Flexible extension", "Priority fleet access"],
            },
            {
              icon: <Star className="w-6 h-6 text-primary" />,
              title: "Premium Add-Ons",
              desc: "Enhance your rental with additional services like GPS navigation, child seats, additional drivers, and more.",
              features: ["GPS / navigation", "Child & infant seats", "Additional drivers"],
            },
          ].map((service) => (
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
