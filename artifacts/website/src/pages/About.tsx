import { Helmet } from "react-helmet-async";
import { Shield, Star, Users, MapPin, Clock, Award } from "lucide-react";
import { Link } from "wouter";

const STATS = [
  { value: "10+", label: "Years Experience" },
  { value: "10,000+", label: "Served Customers" },
  { value: "250+", label: "Vehicles" },
  { value: "4.6", label: "Overall Rating" },
];

const VALUES = [
  {
    icon: <Shield className="w-6 h-6 text-primary" />,
    title: "Safety First",
    desc: "Every vehicle undergoes rigorous safety checks before each rental. Your safety on Georgia's diverse roads is our top priority.",
  },
  {
    icon: <Star className="w-6 h-6 text-primary" />,
    title: "Premium Quality",
    desc: "We carefully select and maintain our fleet to ensure you always receive a vehicle in immaculate condition.",
  },
  {
    icon: <Users className="w-6 h-6 text-primary" />,
    title: "Customer Focus",
    desc: "Our team is dedicated to making your rental experience as smooth and enjoyable as possible, from booking to return.",
  },
  {
    icon: <MapPin className="w-6 h-6 text-primary" />,
    title: "Local Expertise",
    desc: "As a Georgia-based company, we know the roads, the destinations, and the best routes to help you get where you're going.",
  },
  {
    icon: <Clock className="w-6 h-6 text-primary" />,
    title: "24/7 Availability",
    desc: "Our support team is reachable around the clock — airport pickups, roadside emergencies, and everything in between.",
  },
  {
    icon: <Award className="w-6 h-6 text-primary" />,
    title: "Transparent Pricing",
    desc: "No hidden fees, no surprise charges. The price shown is the price you pay — always.",
  },
];

export default function About() {
  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>About Tbilisicars – Car Rental Company in Georgia</title>
        <meta name="description" content="Learn more about Tbilisicars, a trusted car rental company in Georgia offering reliable service across Tbilisi, Kutaisi and Batumi." />
        <link rel="canonical" href="https://tbilisicars.com/about" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/about" />
        <meta property="og:title" content="About Tbilisicars – Car Rental Company in Georgia" />
        <meta property="og:description" content="Learn more about Tbilisicars, a trusted car rental company in Georgia offering reliable service across Tbilisi, Kutaisi and Batumi." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="About Tbilisicars – Your Trusted Car Rental Partner in Georgia" />
        <meta name="twitter:description" content="Learn about Tbilisicars, Georgia's trusted car rental company serving Tbilisi, Kutaisi and Batumi with full insurance and 24/7 support." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
      </Helmet>
      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            About Tbilisicars
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-6">Your Trusted Partner in Georgia</h1>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto leading-relaxed">
            Tbilisicars is a premium car rental company with over 10 years of experience serving travelers and locals across Georgia. We combine a curated fleet of well-maintained vehicles with exceptional customer service and airport-focused delivery across Tbilisi, Kutaisi, and Batumi.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">
          {STATS.map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-6 text-center hover:border-primary/40 transition-colors">
              <div className="text-2xl sm:text-3xl font-bold text-primary mb-1">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Our Story */}
        <div className="bg-card border border-border rounded-2xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-white mb-4">Our Story</h2>
          <div className="space-y-4 text-muted-foreground leading-relaxed">
            <p>
              Founded in Tbilisi over a decade ago, Tbilisicars set out to redefine car rental in Georgia. With more than 10,000 satisfied customers and a fleet of 250+ vehicles across the country, we have grown to become one of Georgia's most trusted rental providers.
            </p>
            <p>
              We specialize in airport services at Tbilisi International Airport, Kutaisi International Airport, and Batumi International Airport — ensuring seamless vehicle handover from the moment you land. Our team is present at each airport, ready to welcome you and complete the process in minutes.
            </p>
            <p>
              Our fleet is carefully maintained and regularly updated. Whether you need a compact city car for Tbilisi's winding streets, an SUV for mountain roads to Kazbegi, or a premium sedan for business travel, we have the perfect vehicle for you — with unlimited mileage, transparent pricing, and real 24/7 support.
            </p>
          </div>
        </div>

        {/* Values */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {VALUES.map((item) => (
            <div key={item.title} className="bg-card border border-border rounded-xl p-6 hover:border-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                {item.icon}
              </div>
              <h3 className="text-white font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white font-semibold px-8 py-3 rounded-xl transition-colors text-base"
          >
            Book Your Car Today
          </Link>
        </div>
      </div>
    </div>
  );
}
