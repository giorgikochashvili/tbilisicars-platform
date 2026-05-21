import { Link } from "wouter";
import { Phone, Mail, MapPin } from "lucide-react";

const RATING_CARDS = [
  {
    platform: "Trustpilot",
    descriptor: "Excellent",
    rating: "4.6 / 5",
    href: "https://www.trustpilot.com/review/tbilisicars.com",
    brandMark: "★",
    markColor: "text-emerald-400",
    starColor: "text-emerald-400",
  },
  {
    platform: "Google",
    descriptor: "Excellent",
    rating: "4.7 / 5",
    href: "https://share.google/lbXYIFHqGODm91fdk",
    brandMark: "G",
    markColor: "text-blue-400",
    starColor: "text-yellow-400",
  },
];

const OFFICES = [
  { city: "Tbilisi Airport", phone: "+995 557 37 63 63" },
  { city: "Kutaisi Airport", phone: "+995 595 28 66 00" },
  { city: "Batumi Office", phone: "+995 557 37 63 63" },
];

export default function Footer() {
  return (
    <footer className="bg-[hsl(211,55%,8%)] border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-5 sm:gap-8">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/tbilisi-logo.png"
                alt="Tbilisicars"
                className="h-9 w-auto"
                draggable={false}
              />
              <div>
                <div className="font-bold text-white text-lg leading-none">Tbilisicars</div>
                <div className="text-xs text-muted-foreground mt-0.5">Car Rental Georgia</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Reliable car rental service across Georgia.
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
                { label: "Contact Us", href: "/contact" },
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

          {/* Car Rental Cities */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Car Rental Cities</h3>
            <ul className="space-y-2">
              {[
                { label: "Car Rental Tbilisi", href: "/car-rental-tbilisi" },
                { label: "Car Rental Kutaisi", href: "/car-rental-kutaisi" },
                { label: "Car Rental Batumi",  href: "/car-rental-batumi"  },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Contact</h3>
            <ul className="space-y-2">
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

        {/* Rating trust cards — Trustpilot & Google */}
        <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-border/50 flex justify-center">
          <div className="flex flex-wrap justify-center gap-3">
            {RATING_CARDS.map((r) => (
              <a
                key={r.platform}
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white/[0.06] border border-white/10 rounded-xl px-4 py-3 hover:bg-white/10 hover:border-white/20 transition-colors"
              >
                <span className={`text-base font-bold leading-none select-none ${r.markColor}`}>
                  {r.brandMark}
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-white">{r.platform}</span>
                    <span className={`text-[10px] leading-none ${r.starColor}`}>★★★★★</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    <span className="font-semibold text-white/80">{r.rating}</span>
                    {" · "}{r.descriptor}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-6 sm:mt-10 pt-4 sm:pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
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
