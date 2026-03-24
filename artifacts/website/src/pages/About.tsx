import { Shield, Star, Users, MapPin } from "lucide-react";
import { Link } from "wouter";

export default function About() {
  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            About Tbilisi Cars
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-6">Your Trusted Partner in Georgia</h1>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto leading-relaxed">
            Tbilisi Cars is a premium car rental company serving travelers and locals across Georgia. We combine a curated fleet of exceptional vehicles with outstanding customer service to make every journey memorable.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-16">
          {[
            { value: "500+", label: "Happy Customers" },
            { value: "50+", label: "Vehicles in Fleet" },
            { value: "3+", label: "Cities Covered" },
            { value: "7/7", label: "Days Available" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-6 text-center">
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
              Founded in Tbilisi, we set out to redefine car rental in Georgia. We noticed that travelers deserved more than just a set of keys — they deserved an experience. From the moment you make your reservation to the moment you return your vehicle, every detail matters.
            </p>
            <p>
              Our fleet is carefully maintained and regularly updated to ensure you always have access to reliable, modern vehicles. Whether you need a compact city car for exploring Tbilisi's winding streets, an SUV for the mountain roads to Kazbegi, or a premium sedan for business travel, we have the perfect vehicle for you.
            </p>
            <p>
              We pride ourselves on transparency. No hidden fees, no surprise charges — just straightforward, honest pricing backed by exceptional service.
            </p>
          </div>
        </div>

        {/* Values */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          {[
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
          ].map((item) => (
            <div key={item.title} className="bg-card border border-border rounded-xl p-6">
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
