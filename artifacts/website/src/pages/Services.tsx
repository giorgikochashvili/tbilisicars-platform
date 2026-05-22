import { Helmet } from "react-helmet-async";
import { Car, MapPin, Clock, Shield, Users, Infinity, HeartHandshake } from "lucide-react";
import { Link } from "wouter";

const SERVICES = [
  {
    icon: <Car className="w-6 h-6 text-primary" />,
    title: "Car Rental Services",
    desc: "We offer daily, weekly, monthly and corporate car rental services across Georgia. Whether you need a car for a short city trip, an airport arrival, a long journey around the country, or regular business use, our team helps you choose the right vehicle and rental plan.",
    features: ["Daily, weekly & monthly rentals", "Corporate rentals", "Economy, sedan, SUV, 7-seater & van"],
  },
  {
    icon: <MapPin className="w-6 h-6 text-primary" />,
    title: "Airport & City Service",
    desc: "Tbilisicars provides car rental service at Georgia's three main airports — Tbilisi, Kutaisi and Batumi — as well as city, downtown, hotel and address-based handover where available. Our goal is to make vehicle pickup and return simple, timely and convenient for your travel schedule.",
    features: ["Tbilisi International Airport", "Kutaisi International Airport", "Batumi International Airport", "Downtown & hotel handover"],
  },
  {
    icon: <Shield className="w-6 h-6 text-primary" />,
    title: "Full Insurance & Low Deposit",
    desc: "All vehicles include an insurance package in the price shown on our website. Customers can also choose an additional comprehensive insurance option for extra protection. A low deposit, usually from 100 EUR, is left when picking up the vehicle and returned after the car is brought back, subject to rental conditions.",
    features: ["Insurance package included in price", "Optional comprehensive upgrade", "Deposit from 100 EUR, returned on return"],
  },
  {
    icon: <Infinity className="w-6 h-6 text-primary" />,
    title: "Unlimited Mileage",
    desc: "During the rental period, you can drive across Georgia without worrying about distance limits. Mileage is unlimited, so there are no extra charges based on how many kilometres you drive.",
    features: ["No distance cap", "No overage charges", "Suitable for long trips across Georgia"],
  },
  {
    icon: <Users className="w-6 h-6 text-primary" />,
    title: "Free Additional Drivers",
    desc: "Additional drivers are included free of charge. Any person travelling with the main renter may drive the vehicle if they meet the rental requirements, are between 21 and 70 years old, and hold a valid driving licence. This is especially useful for long trips and shared driving across Georgia.",
    features: ["No per-driver fee", "Age requirement: 21–70 years", "Valid driving licence required"],
  },
  {
    icon: <Clock className="w-6 h-6 text-primary" />,
    title: "24/7 Working Hours & Roadside Assistance",
    desc: "We work 24/7 to support pickups, returns and customer assistance according to your flight or travel schedule. If you have a road incident, technical issue, or urgent question during your rental, our team is ready to provide timely information, coordination and assistance.",
    features: ["24/7 service adapted to your flights", "Assistance during rental", "Coordination for road incidents"],
  },
  {
    icon: <HeartHandshake className="w-6 h-6 text-primary" />,
    title: "Chauffeur Service",
    desc: "For customers who prefer to travel with a driver or guide, we can arrange a chauffeur service by request. This service is often in high demand, so we recommend contacting us in advance with your travel dates, route, number of days and preferences. Our team will prepare an individual offer based on your itinerary.",
    features: ["Driver or guide by request", "Individual pricing prepared", "Contact: reservations@tbilisicars.com"],
  },
];

export default function Services() {
  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>Car Rental Services in Georgia | Tbilisicars</title>
        <meta name="description" content="Tbilisicars provides car rental services at Tbilisi, Kutaisi and Batumi airports, city locations and hotels, with insurance package options, unlimited mileage, free additional drivers and 24/7 working hours." />
        <link rel="canonical" href="https://tbilisicars.com/services" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/services" />
        <meta property="og:title" content="Car Rental Services in Georgia | Tbilisicars" />
        <meta property="og:description" content="Tbilisicars provides car rental services at Tbilisi, Kutaisi and Batumi airports, city locations and hotels, with insurance package options, unlimited mileage, free additional drivers and 24/7 working hours." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Car Rental Services in Georgia | Tbilisicars" />
        <meta name="twitter:description" content="Tbilisicars provides car rental services at Tbilisi, Kutaisi and Batumi airports, city locations and hotels, with insurance package options, unlimited mileage, free additional drivers and 24/7 working hours." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
      </Helmet>
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            Our Services
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Car Rental Services in Georgia</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Tbilisicars provides car rental services at Tbilisi, Kutaisi and Batumi airports, downtown city locations, hotels and addresses by arrangement. Online booking, transparent prices and 24/7 working hours.
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

        {/* CTA */}
        <div className="text-center pb-4">
          <p className="text-muted-foreground text-sm mb-5">
            Select your dates and pickup location to see available vehicles and prices.
          </p>
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white font-semibold px-8 py-3 rounded-xl transition-colors text-base"
          >
            Choose Your Car
          </Link>
        </div>

      </div>
    </div>
  );
}
