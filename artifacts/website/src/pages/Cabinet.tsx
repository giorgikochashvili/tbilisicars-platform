import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Car,
  MapPin,
  Bookmark,
  LogIn,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerMe {
  id: number;
  email: string;
  fullName: string | null;
  phone: string | null;
}

interface CustomerBooking {
  id: number;
  reference: string;
  status: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  totalAmount: string | null;
  currency: string;
  createdAt: string;
  pickupLocationName: string;
  dropoffLocationName: string;
  vehicleName: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  CONFIRMED: "bg-green-500/15 text-green-400 border-green-500/30",
  DELIVERED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  RETURNED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  CANCELED: "bg-red-500/15 text-red-400 border-red-500/30",
  NO_SHOW: "bg-red-500/15 text-red-300 border-red-500/30",
};

function statusLabel(s: string): string {
  return s === "NO_SHOW" ? "No Show" : s.charAt(0) + s.slice(1).toLowerCase();
}

function fmt(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-28 rounded bg-white/10" />
        <div className="h-5 w-20 rounded-full bg-white/10" />
      </div>
      <div className="space-y-2.5">
        <div className="h-3.5 w-3/4 rounded bg-white/10" />
        <div className="h-3.5 w-1/2 rounded bg-white/10" />
        <div className="h-3.5 w-2/3 rounded bg-white/10" />
      </div>
    </div>
  );
}

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({ b }: { b: CustomerBooking }) {
  const badge = STATUS_STYLES[b.status] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30";
  return (
    <div className="bg-card border border-border hover:border-border/80 rounded-xl p-5 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-4">
        <span className="font-mono text-sm font-semibold text-white/90 tracking-wide">
          {b.reference}
        </span>
        <span className={`shrink-0 inline-flex items-center border text-xs font-medium px-2 py-0.5 rounded-full ${badge}`}>
          {statusLabel(b.status)}
        </span>
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        {b.vehicleName && (
          <div className="flex items-center gap-2">
            <Car className="w-3.5 h-3.5 shrink-0 text-primary" />
            <span className="text-white/80">{b.vehicleName}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5 shrink-0 text-primary" />
          <span>
            {fmt(b.pickupDatetime)}
            {" — "}
            {fmt(b.dropoffDatetime)}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-primary mt-0.5" />
          <span>
            {b.pickupLocationName === b.dropoffLocationName
              ? b.pickupLocationName
              : `${b.pickupLocationName} → ${b.dropoffLocationName}`}
          </span>
        </div>
      </div>

      {b.totalAmount && parseFloat(b.totalAmount) > 0 && (
        <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between">
          <span className="text-xs text-muted-foreground/70">Total</span>
          <span className="text-sm font-semibold text-white">
            {parseFloat(b.totalAmount).toFixed(0)} {b.currency}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Cabinet() {
  const [, navigate] = useLocation();

  const meQuery = useQuery<CustomerMe>({
    queryKey: ["customer-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/customer/me", { credentials: "include" });
      if (res.status === 401) throw new Error("UNAUTHORIZED");
      if (!res.ok) throw new Error("Failed to load account");
      return res.json() as Promise<CustomerMe>;
    },
    retry: false,
    staleTime: 2 * 60 * 1000,
  });

  const bookingsQuery = useQuery<CustomerBooking[]>({
    queryKey: ["customer-bookings"],
    queryFn: async () => {
      const res = await fetch("/api/customer/bookings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json() as Promise<CustomerBooking[]>;
    },
    enabled: meQuery.isSuccess,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (meQuery.error?.message === "UNAUTHORIZED") {
      navigate("/login");
    }
  }, [meQuery.error, navigate]);

  if (meQuery.isError && meQuery.error?.message !== "UNAUTHORIZED") {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Unable to load your account. Please try again.</p>
          <button
            onClick={() => void meQuery.refetch()}
            className="text-primary text-sm hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const customer = meQuery.data;
  const bookings = bookingsQuery.data;
  const loading = meQuery.isPending || (meQuery.isSuccess && bookingsQuery.isPending);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Bookmark className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-white">My Bookings</h1>
        </div>
        {customer && (
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="text-white/80">{customer.email}</span>
          </p>
        )}
      </div>

      {/* Booking list */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((k) => <SkeletonCard key={k} />)}
        </div>
      )}

      {bookingsQuery.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4">
          <p className="text-sm text-red-400">Unable to load bookings. Please try refreshing the page.</p>
        </div>
      )}

      {!loading && !bookingsQuery.isError && bookings && bookings.length === 0 && (
        <div className="text-center py-16 border border-border/50 rounded-xl bg-card/40">
          <Car className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-white/70 font-medium mb-1">No bookings yet</p>
          <p className="text-sm text-muted-foreground mb-5">
            Your confirmed reservations will appear here.
          </p>
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            <LogIn className="w-4 h-4" />
            Book a car
          </Link>
        </div>
      )}

      {!loading && bookings && bookings.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {bookings.map((b) => <BookingCard key={b.id} b={b} />)}
        </div>
      )}
    </div>
  );
}
