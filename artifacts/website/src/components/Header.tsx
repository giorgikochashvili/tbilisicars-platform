import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

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
      {/* Main nav */}
      <div className="bg-[hsl(211,55%,8%)] border-b border-border shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <img
                src="/tbilisi-logo.png"
                alt="Tbilisicars"
                className="h-9 w-auto"
                draggable={false}
              />
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
                className="flex items-center justify-center bg-primary hover:bg-accent text-white text-sm font-semibold px-4 py-3 rounded-lg transition-colors mt-1"
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
