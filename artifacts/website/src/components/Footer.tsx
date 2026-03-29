import { Link } from "wouter";
import { Car, Phone, Mail, MapPin } from "lucide-react";

const OFFICES = [
  { city: "Tbilisi Office", phone: "+995 557 37 63 63" },
  { city: "Kutaisi Office", phone: "+995 595 28 66 00" },
  { city: "Batumi Office", phone: "+995 557 37 63 63" },
];

export default function Footer() {
  return (
    <footer className="bg-[hsl(211,55%,8%)] border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                <Car className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-white text-lg leading-none">Tbilisicars</div>
                <div className="text-xs text-muted-foreground mt-0.5">Car Rental Georgia</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Premium car rental across Georgia. Reliable fleet, transparent pricing, and exceptional customer service since 2014.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Navigation</h3>
            <ul className="space-y-2">
              {[
                { label: "Home", href: "/" },
                { label: "Our Fleet", href: "/fleet" },
                { label: "About Us", href: "/about" },
                { label: "Locations", href: "/locations" },
                { label: "Services", href: "/services" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Legal</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/terms" className="text-sm text-muted-foreground hover:text-white transition-colors">
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-sm text-muted-foreground hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Contact</h3>
            <ul className="space-y-3">
              {OFFICES.map((o) => (
                <li key={o.city} className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground/70 mb-0.5">{o.city}</div>
                    <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="text-sm text-muted-foreground hover:text-white transition-colors">
                      {o.phone}
                    </a>
                  </div>
                </li>
              ))}
              <li className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-primary shrink-0" />
                <a href="mailto:reservations@tbilisicars.com" className="text-sm text-muted-foreground hover:text-white transition-colors">
                  reservations@tbilisicars.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Tbilisicars. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="text-xs text-muted-foreground hover:text-white transition-colors">
              Terms &amp; Conditions
            </Link>
            <span className="text-xs text-border">|</span>
            <Link href="/privacy" className="text-xs text-muted-foreground hover:text-white transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
