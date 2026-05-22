import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";

export const TERMS_SECTIONS = [
  {
    title: "1. Service Coverage",
    content: [
      "Our company provides rental vehicles across Georgia's major international airports and cities: Tbilisi International Airport – Tbilisi, Kutaisi International Airport – Kutaisi, and Batumi International Airport – Batumi.",
      "In addition to airport locations, we offer vehicle delivery and pick-up services across Georgia upon prior arrangement.",
      "Our mission is to provide reliable, flexible, and customer-focused mobility services throughout the country.",
    ],
  },
  {
    title: "2. What's Included in the Price",
    content: [
      "Unlimited Mileage – travel anywhere within Georgia without distance limitations.",
      "Unlimited Additional Drivers – share driving without extra fees.",
      "24/7 Customer Support – assistance during the entire rental period.",
      "Roadside Assistance Across Georgia – support in case of mechanical issues.",
      "Airport Parking & Service Charges Included.",
      "We maintain clear pricing with no hidden charges.",
    ],
  },
  {
    title: "3. Driver Age & License Requirements",
    content: [
      "The main driver and any additional drivers must meet the following requirements: minimum age 21 years old, maximum age 70 years old.",
      "Drivers must hold a valid driving license for at least 2 years.",
    ],
  },
  {
    title: "4. Reservation Options",
    content: [
      "Online Booking: Customers may book directly through our website. No prepayment required, no credit card details required, reservations are free of charge.",
      "Email Reservations: Customers may contact us via email and provide pick-up location, drop-off location, rental dates, and preferred vehicle category. Our team will recommend the most suitable vehicle.",
      "Phone & Messaging Apps: Customers may contact us via +995 557 37 63 63 (Tbilisi / Batumi) or +995 595 28 66 00 (Kutaisi). Available through WhatsApp, Telegram, Viber, WeChat, Signal, and other messaging platforms.",
    ],
  },
  {
    title: "5. Emergencies & Technical Issues",
    content: [
      "In case of emergency or technical issues during the rental period, customers must immediately contact our support team: +995 557 37 63 63 (Tbilisi / Batumi) or +995 595 28 66 00 (Kutaisi).",
      "Our team will provide immediate assistance and guidance.",
    ],
  },
  {
    title: "6. Booking Changes or Cancellations",
    content: [
      "Reservations can be modified or cancelled free of charge.",
      "Customers must notify us at least 24 hours before pick-up time.",
      "Bookings may also be modified through the 'My Booking' page on our website.",
    ],
  },
  {
    title: "7. Payment Policy",
    content: [
      "Standard reservations do not require advance payment. Payment is made upon vehicle pick-up.",
      "Accepted payment methods: Cash (EUR / USD / GEL), Credit Card / Debit Card, Revolut Transfers, Bank Transfers, Stripe Payments, and other alternative transfer methods.",
      "No additional payment processing fees apply.",
    ],
  },
  {
    title: "8. Vehicle Pick-Up Process",
    content: [
      "Tbilisi International Airport: Our office is located inside the arrivals hall. Rental agreement completed within 5 minutes. Agent escorts customer to airport parking (50 meters from terminal).",
      "Kutaisi International Airport: Our representative will meet customers in front of the arrivals hall. Customers will be transferred to our office approximately 2 km from the airport, where the vehicle will be delivered.",
      "Batumi International Airport: Our representative will meet customers inside the arrivals hall. The vehicle will be delivered in the airport parking area approximately 30 meters from the terminal.",
      "City Delivery or Custom Locations: Vehicles may be delivered to hotels, apartments, city addresses, or other agreed locations. At delivery: rental agreement signing, vehicle inspection, payment processing, and driving instructions.",
    ],
  },
  {
    title: "9. Restricted Regions",
    content: [
      "For safety and legal reasons, vehicles may not be driven in restricted territories.",
      "The following regions are strictly prohibited: Abkhazia, South Ossetia, border conflict zones, and the Tusheti Region.",
      "Driving rental vehicles to these regions is strictly prohibited.",
    ],
  },
  {
    title: "10. Fuel Policy",
    content: [
      "Vehicles are delivered with a certain fuel level and must be returned with the same fuel level.",
      "If the vehicle is returned with much less fuel, refueling charges may apply.",
    ],
  },
  {
    title: "11. Traffic Fines",
    content: [
      "The renter is fully responsible for: traffic fines, parking violations, and damages which are not reported with police.",
      "Any penalties issued during the rental period must be paid by the renter at drop-off.",
    ],
  },
  {
    title: "12. Vehicle Condition & Damage",
    content: [
      "Customers must return the vehicle in the same condition as received.",
      "In case of damage: the customer must notify the company immediately and call the POLICE.",
      "An accident report may be required by the police.",
      "Insurance conditions will apply depending on the selected coverage.",
    ],
  },
  {
    title: "13. Smoking & Vehicle Cleanliness",
    content: [
      "Smoking inside the vehicle is strictly prohibited.",
      "If excessive cleaning is required after return, a cleaning fee may apply.",
    ],
  },
  {
    title: "14. Loss of Keys or Documents",
    content: [
      "If vehicle keys, documents, or accessories are lost, the renter will be responsible for the replacement costs.",
    ],
  },
  {
    title: "15. Company Rights",
    content: [
      "Tbilisicars reserves the right to refuse rental if requirements are not met.",
      "Tbilisicars reserves the right to cancel reservations in exceptional circumstances.",
      "Tbilisicars reserves the right to replace reserved vehicles with similar category vehicles if necessary.",
    ],
  },
];

// Anchor IDs — separate from TERMS_SECTIONS to keep its shape unchanged (Booking.tsx compatibility)
const SECTION_IDS: Record<string, string> = {
  "1. Service Coverage": "service-coverage",
  "2. What's Included in the Price": "whats-included",
  "3. Driver Age & License Requirements": "driver-requirements",
  "4. Reservation Options": "reservation-options",
  "5. Emergencies & Technical Issues": "emergencies",
  "6. Booking Changes or Cancellations": "cancellation",
  "7. Payment Policy": "payment-policy",
  "8. Vehicle Pick-Up Process": "pickup-return",
  "9. Restricted Regions": "restricted-areas",
  "10. Fuel Policy": "fuel-policy",
  "11. Traffic Fines": "traffic-fines",
  "12. Vehicle Condition & Damage": "vehicle-damage",
  "13. Smoking & Vehicle Cleanliness": "smoking",
  "14. Loss of Keys or Documents": "loss-of-keys",
  "15. Company Rights": "company-rights",
};

const SUMMARY_ITEMS = [
  { text: "No prepayment — payment is made at vehicle pickup" },
  { text: "Unlimited mileage within Georgia" },
  { text: "Additional drivers included — no extra charge" },
  { text: "Driver age requirement: 21–70, valid licence for min. 2 years" },
  { text: "24/7 customer support and roadside assistance" },
  { text: "Free modification or cancellation with 24h notice" },
];

const TOC_LINKS = [
  { label: "What's Included", id: "whats-included" },
  { label: "Driver Requirements", id: "driver-requirements" },
  { label: "Reservation Options", id: "reservation-options" },
  { label: "Payment Policy", id: "payment-policy" },
  { label: "Pickup & Return", id: "pickup-return" },
  { label: "Restricted Areas", id: "restricted-areas" },
  { label: "Fuel Policy", id: "fuel-policy" },
  { label: "Traffic Fines", id: "traffic-fines" },
  { label: "Vehicle Damage", id: "vehicle-damage" },
  { label: "Cancellation", id: "cancellation" },
];

function TermsSection({
  title,
  content,
  id,
  defaultOpen,
}: {
  title: string;
  content: string[];
  id?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div id={id} className="border border-border rounded-xl overflow-hidden scroll-mt-20">
      <button
        className="w-full flex items-center justify-between px-6 py-4 text-left bg-card hover:bg-secondary/20 transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <h2 className="text-base font-semibold text-white pr-4">{title}</h2>
        {open
          ? <ChevronUp className="w-4 h-4 text-primary shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </button>
      {open && (
        <div className="px-6 pb-5 pt-1 bg-card/50">
          <ul className="space-y-2">
            {content.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Terms() {
  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>Terms &amp; Conditions | Tbilisicars</title>
        <meta name="description" content="Read the terms and conditions for renting a car with Tbilisicars in Georgia." />
        <link rel="canonical" href="https://tbilisicars.com/terms" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Tbilisicars" />
        <meta property="og:url" content="https://tbilisicars.com/terms" />
        <meta property="og:title" content="Terms & Conditions | Tbilisicars" />
        <meta property="og:description" content="Read the terms and conditions for renting a car with Tbilisicars in Georgia." />
        <meta property="og:image" content="https://tbilisicars.com/opengraph.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Terms & Conditions | Tbilisicars" />
        <meta name="twitter:description" content="Read the terms and conditions for renting a car with Tbilisicars in Georgia." />
        <meta name="twitter:image" content="https://tbilisicars.com/opengraph.jpg" />
      </Helmet>
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            Legal
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Rental Terms &amp; Conditions</h1>
          <p className="text-sm text-muted-foreground mb-1">Tbilisicars</p>
          <p className="text-sm text-muted-foreground">Last Updated: 08.03.2026</p>
        </div>

        {/* Key Rental Conditions summary */}
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">Key Rental Conditions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SUMMARY_ITEMS.map((item) => (
              <div key={item.text} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span className="text-sm text-white/90 leading-snug">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Intro */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            These Rental Terms &amp; Conditions govern the rental agreement between Tbilisicars and the customer renting a vehicle through our website, offices, or any other reservation channel. By making a reservation or renting a vehicle, the customer agrees to the terms described below.
          </p>
        </div>

        {/* Table of Contents */}
        <div className="bg-card border border-border rounded-xl p-5 mb-8">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Navigation</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {TOC_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className="text-sm text-primary hover:text-white hover:underline transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-3 mb-8">
          {TERMS_SECTIONS.map((s) => (
            <TermsSection
              key={s.title}
              title={s.title}
              content={s.content}
              id={SECTION_IDS[s.title]}
              defaultOpen={s.title === "2. What's Included in the Price"}
            />
          ))}
        </div>

        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            By making a reservation with Tbilisicars, you agree to these terms and conditions. For any questions, please contact us at{" "}
            <a href="mailto:reservations@tbilisicars.com" className="text-primary hover:underline">
              reservations@tbilisicars.com
            </a>{" "}
            before booking.
          </p>
        </div>
      </div>
    </div>
  );
}
