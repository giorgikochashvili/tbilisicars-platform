import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Car, Clock, Plane } from "lucide-react";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Fleet", href: "/fleet" },
  { label: "About Us", href: "/about" },
  { label: "Terms & Conditions", href: "/terms" },
  { label: "Locations", href: "/locations" },
  { label: "Services", href: "/services" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <header className="sticky top-0 z-50">
      {/* Trust bar */}
      <div className="bg-primary/10 border-b border-primary/20 py-1.5 px-4 hidden sm:block">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-8 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-primary" />
            <span>10+ Years Experience</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <Plane className="w-3 h-3 text-primary" />
            <span>24/7 Airport Services &amp; Customer Support</span>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="bg-[hsl(211,55%,8%)] border-b border-border shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-md">
                <Car className="w-5 h-5 text-white" />
              </div>
              <div className="leading-none">
                <div className="font-bold text-white text-lg tracking-tight">Tbilisicars</div>
                <div className="text-xs text-muted-foreground">Car Rental Georgia</div>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive(link.href)
                      ? "text-white bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-white hover:bg-white/5",
                  ].join(" ")}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Book Now CTA + mobile burger */}
            <div className="flex items-center gap-3">
              <Link
                href="/booking"
                className="hidden sm:inline-flex items-center gap-2 bg-primary hover:bg-accent text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                Book Now
              </Link>
              <button
                onClick={() => setOpen(!open)}
                className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Toggle navigation menu"
              >
                {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="lg:hidden border-t border-border bg-[hsl(211,55%,8%)]">
            <nav className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
              {/* Mobile trust */}
              <div className="flex flex-col gap-1 pb-3 mb-1 border-b border-border">
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                  <Clock className="w-3 h-3 text-primary" />
                  <span>10+ Years Experience</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                  <Plane className="w-3 h-3 text-primary" />
                  <span>24/7 Airport Services &amp; Customer Support</span>
                </div>
              </div>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={[
                    "px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    isActive(link.href)
                      ? "text-white bg-primary/20"
                      : "text-muted-foreground hover:text-white hover:bg-white/5",
                  ].join(" ")}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/booking"
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center justify-center bg-primary hover:bg-accent text-white text-sm font-semibold px-4 py-3 rounded-lg transition-colors"
              >
                Book Now
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
