import { Link } from "wouter";
import { Phone, Mail, MapPin } from "lucide-react";

const OFFICES = [
  { city: "Tbilisi Airport", phone: "+995 557 37 63 63" },
  { city: "Kutaisi Airport", phone: "+995 595 28 66 00" },
  { city: "Batumi Office", phone: "+995 557 37 63 63" },
];

export default function Footer() {
  return (
    <footer className="bg-[hsl(211,55%,8%)] border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5 sm:gap-6 lg:gap-4">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <div className="flex items-center gap-3 mb-3">
              <img
                src="/tbilisi-logo.png"
                alt="Tbilisicars"
                className="h-9 w-auto"
                draggable={false}
              />
              <div>
                <div className="font-bold text-white text-base leading-none">Tbilisicars</div>
                <div className="text-xs text-muted-foreground mt-0.5">Car Rental Georgia</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[200px]">
              Reliable car rental across Georgia with transparent prices and full insurance.
            </p>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Company</h3>
            <ul className="space-y-2">
              {[
                { label: "About Us", href: "/about" },
                { label: "Contact Us", href: "/contact" },
                { label: "Car Rental Tbilisi", href: "/car-rental-tbilisi" },
                { label: "Car Rental Kutaisi", href: "/car-rental-kutaisi" },
                { label: "Car Rental Batumi", href: "/car-rental-batumi" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-xs text-muted-foreground hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Fleet */}
          <div>
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Fleet</h3>
            <ul className="space-y-2">
              {[
                { label: "All Vehicles", href: "/fleet" },
                { label: "SUVs", href: "/fleet" },
                { label: "Sedans", href: "/fleet" },
                { label: "Vans", href: "/fleet" },
              ].map((l, i) => (
                <li key={i}>
                  <Link href={l.href} className="text-xs text-muted-foreground hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Services</h3>
            <ul className="space-y-2">
              {[
                { label: "Car Rental Services", href: "/services" },
                { label: "Airport & City Service", href: "/services" },
                { label: "Additional Services", href: "/services" },
              ].map((l, i) => (
                <li key={i}>
                  <Link href={l.href} className="text-xs text-muted-foreground hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Help */}
          <div>
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Help</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/terms" className="text-xs text-muted-foreground hover:text-white transition-colors">
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-xs text-muted-foreground hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Contact Us</h3>
            <ul className="space-y-2.5">
              {OFFICES.map((o) => (
                <li key={o.city} className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] text-muted-foreground/70 mb-0.5">{o.city}</div>
                    <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="text-xs text-muted-foreground hover:text-white transition-colors">
                      {o.phone}
                    </a>
                  </div>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-primary shrink-0" />
                <a href="mailto:reservations@tbilisicars.com" className="text-xs text-muted-foreground hover:text-white transition-colors break-all">
                  reservations@tbilisicars.com
                </a>
              </li>
            </ul>
          </div>

        </div>

        <div className="mt-6 pt-5 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
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
