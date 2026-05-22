import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ChevronDown, User, Shield, LogOut, Bookmark } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const NAV_LINKS = [
  { label: "Fleet", href: "/fleet" },
  { label: "Locations", href: "/locations" },
  { label: "Services", href: "/services" },
  { label: "Terms & Conditions", href: "/terms" },
];

interface CustomerMe {
  id: number;
  email: string;
  fullName: string | null;
}

export default function Header() {
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const loginMenuRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const queryClient = useQueryClient();

  const { data: customer } = useQuery<CustomerMe | null>({
    queryKey: ["customer-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/customer/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return res.json() as Promise<CustomerMe>;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loggedIn = customer != null;
  const firstName = customer?.fullName?.split(" ")[0] ?? "Account";

  async function handleLogout() {
    setLoginOpen(false);
    setOpen(false);
    await fetch("/api/auth/customer/logout", { method: "POST", credentials: "include" });
    await queryClient.invalidateQueries({ queryKey: ["customer-me"] });
    await queryClient.invalidateQueries({ queryKey: ["customer-bookings"] });
  }

  useEffect(() => {
    if (!loginOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (loginMenuRef.current && !loginMenuRef.current.contains(e.target as Node)) {
        setLoginOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [loginOpen]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <header className="sticky top-0 z-50">
      <div className="bg-[hsl(211,55%,8%)] border-b border-border shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
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

            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block" ref={loginMenuRef}>
                <button
                  onClick={() => setLoginOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 border border-white/20 hover:border-white/40 text-muted-foreground hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  aria-haspopup="true"
                  aria-expanded={loginOpen}
                >
                  {loggedIn ? firstName : "Log in"}
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${loginOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {loginOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-[hsl(211,55%,11%)] border border-border rounded-xl shadow-2xl overflow-hidden z-50">
                    {loggedIn ? (
                      <>
                        <Link
                          href="/cabinet"
                          onClick={() => setLoginOpen(false)}
                          className="flex items-center gap-3 px-4 py-3.5 text-sm text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                        >
                          <Bookmark className="w-4 h-4 shrink-0 text-primary" />
                          <div>
                            <div className="font-medium text-white/90">My Bookings</div>
                            <div className="text-xs text-muted-foreground/70 mt-0.5">View your reservations</div>
                          </div>
                        </Link>
                        <div className="border-t border-border/60" />
                        <button
                          onClick={() => void handleLogout()}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                        >
                          <LogOut className="w-4 h-4 shrink-0" />
                          <span className="font-medium text-white/90">Log out</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <Link
                          href="/login"
                          onClick={() => setLoginOpen(false)}
                          className="flex items-center gap-3 px-4 py-3.5 text-sm text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                        >
                          <User className="w-4 h-4 shrink-0 text-primary" />
                          <div>
                            <div className="font-medium text-white/90">Customer Log in</div>
                            <div className="text-xs text-muted-foreground/70 mt-0.5">View your bookings</div>
                          </div>
                        </Link>
                        <div className="border-t border-border/60" />
                        <a
                          href="/crm/login"
                          onClick={() => setLoginOpen(false)}
                          className="flex items-center gap-3 px-4 py-3.5 text-sm text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                        >
                          <Shield className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <div>
                            <div className="font-medium text-white/90">Staff Log in</div>
                            <div className="text-xs text-muted-foreground/70 mt-0.5">Operations portal</div>
                          </div>
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>

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

              <div className="border-t border-border/60 mt-1 pt-1 flex flex-col gap-1">
                {loggedIn ? (
                  <>
                    <Link
                      href="/cabinet"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 border border-white/20 hover:border-white/40 text-muted-foreground hover:text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
                    >
                      <Bookmark className="w-4 h-4 text-primary shrink-0" />
                      My Bookings
                    </Link>
                    <button
                      onClick={() => void handleLogout()}
                      className="flex items-center gap-3 border border-white/10 hover:border-white/30 text-muted-foreground/70 hover:text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 border border-white/20 hover:border-white/40 text-muted-foreground hover:text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
                    >
                      <User className="w-4 h-4 text-primary shrink-0" />
                      Customer Log in
                    </Link>
                    <a
                      href="/crm/login"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 border border-white/10 hover:border-white/30 text-muted-foreground/70 hover:text-white text-sm font-medium px-4 py-3 rounded-lg transition-colors"
                    >
                      <Shield className="w-4 h-4 shrink-0" />
                      Staff Log in
                    </a>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
