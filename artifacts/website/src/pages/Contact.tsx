import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { Phone, Mail, MessageCircle, MapPin, Plane, Building2, ArrowRight } from "lucide-react";

const REGIONS = [
  {
    city: "Tbilisi",
    label: "Tbilisi Airport",
    sublabel: "Tbilisi International Airport (TBS)",
    icon: <Plane className="w-5 h-5 text-primary" />,
    phone: "+995 557 37 63 63",
    phonePlain: "995557376363",
  },
  {
    city: "Kutaisi",
    label: "Kutaisi Airport",
    sublabel: "Kutaisi International Airport (KUT)",
    icon: <Plane className="w-5 h-5 text-primary" />,
    phone: "+995 595 28 66 00",
    phonePlain: "995595286600",
  },
  {
    city: "Batumi",
    label: "Batumi Office",
    sublabel: "Batumi, Adjara",
    icon: <Building2 className="w-5 h-5 text-primary" />,
    phone: "+995 557 37 63 63",
    phonePlain: "995557376363",
  },
];

const EMAIL = "reservations@tbilisicars.com";
const PRIMARY_PHONE = "+995 557 37 63 63";
const PRIMARY_PHONE_PLAIN = "995557376363";

const BUSINESS_EMAIL = "info@tbilisicars.com";
const BUSINESS_PHONE = "+995 591 00 26 30";

export default function Contact() {
  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>Contact Tbilisicars – Car Rental in Georgia</title>
        <meta name="description" content="Contact Tbilisicars for car rental in Tbilisi, Kutaisi and Batumi. Reach our reservations team by phone, WhatsApp or email." />
        <link rel="canonical" href="https://tbilisicars.com/contact" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/contact" />
        <meta property="og:title" content="Contact Tbilisicars – Car Rental in Georgia" />
        <meta property="og:description" content="Contact Tbilisicars for car rental in Tbilisi, Kutaisi and Batumi. Reach our reservations team by phone, WhatsApp or email." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Contact Tbilisicars – Car Rental in Georgia" />
        <meta name="twitter:description" content="Contact Tbilisicars for car rental in Tbilisi, Kutaisi and Batumi. Reach our reservations team by phone, WhatsApp or email." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
      </Helmet>

      <div className="max-w-5xl mx-auto">

        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            Tbilisi · Kutaisi · Batumi
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-5">
            Contact Tbilisicars
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
            Our reservations team is available to help with bookings, questions about your rental, or any assistance you need before, during, or after your trip in Georgia.
          </p>
        </div>

        {/* Primary action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <a
            href={`tel:+${PRIMARY_PHONE_PLAIN}`}
            className="flex flex-col items-center gap-3 bg-card border border-border rounded-2xl p-6 hover:border-primary/50 hover:bg-card/80 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Phone className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-white mb-0.5">Call Us</div>
              <div className="text-sm text-muted-foreground">{PRIMARY_PHONE}</div>
            </div>
          </a>

          <a
            href={`https://wa.me/${PRIMARY_PHONE_PLAIN}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-3 bg-card border border-border rounded-2xl p-6 hover:border-primary/50 hover:bg-card/80 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <MessageCircle className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-white mb-0.5">WhatsApp</div>
              <div className="text-sm text-muted-foreground">{PRIMARY_PHONE}</div>
            </div>
          </a>

          <a
            href={`mailto:${EMAIL}`}
            className="flex flex-col items-center gap-3 bg-card border border-border rounded-2xl p-6 hover:border-primary/50 hover:bg-card/80 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-white mb-0.5">Email</div>
              <div className="text-sm text-muted-foreground">{EMAIL}</div>
            </div>
          </a>
        </div>

        {/* Region cards */}
        <div className="mb-10">
          <h2 className="text-xl font-bold text-white mb-5">Our Locations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {REGIONS.map((r) => (
              <div key={r.city} className="bg-card border border-border rounded-2xl p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {r.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm">{r.city}</div>
                    <div className="text-xs text-muted-foreground">{r.label}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-xs text-muted-foreground">{r.sublabel}</span>
                </div>
                <div className="space-y-2">
                  <a
                    href={`tel:${r.phone.replace(/\s/g, "")}`}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-primary shrink-0" />
                    {r.phone}
                  </a>
                  <a
                    href={`https://wa.me/${r.phonePlain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-primary shrink-0" />
                    WhatsApp
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Email block */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-10">
          <h2 className="text-lg font-bold text-white mb-2">Reservations Email</h2>
          <p className="text-muted-foreground text-sm mb-3">
            For booking enquiries, quotes, and rental documentation, reach us by email. We typically respond within a few hours.
          </p>
          <a
            href={`mailto:${EMAIL}`}
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors font-medium"
          >
            <Mail className="w-4 h-4" />
            {EMAIL}
          </a>
        </div>

        {/* Business & Partnerships */}
        <div className="border border-border/50 border-dashed rounded-2xl p-6 mb-10">
          <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Business &amp; Partnerships
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            For business inquiries, fleet offers, and partnership matters — not for car rental reservations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href={`mailto:${BUSINESS_EMAIL}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
            >
              <Mail className="w-4 h-4 shrink-0" />
              {BUSINESS_EMAIL}
            </a>
            <a
              href={`tel:${BUSINESS_PHONE.replace(/\s/g, "")}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
            >
              <Phone className="w-4 h-4 shrink-0" />
              {BUSINESS_PHONE}
            </a>
          </div>
        </div>

        {/* Booking CTA */}
        <div className="bg-primary/10 border border-primary/25 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Ready to Book?</h2>
          <p className="text-muted-foreground mb-5 max-w-xl mx-auto text-sm leading-relaxed">
            Check availability, choose your vehicle and complete your reservation online — instantly confirmed, no waiting required.
          </p>
          <Link
            href="/booking"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-xl hover:bg-primary/90 transition-colors"
          >
            Book a Car
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </div>
  );
}
