import { Helmet } from "react-helmet-async";

export const PRIVACY_SECTIONS = [
  {
    title: "Information We Collect",
    content: [
      "Full name",
      "Email address",
      "Phone number",
      "Driver's license details",
      "Payment information",
      "Pick-up and drop-off locations",
      "Rental dates",
    ],
    intro: "When you make a reservation or rent a vehicle, we may collect the following information:",
  },
  {
    title: "How We Use Your Information",
    content: [
      "Process and manage your vehicle reservations",
      "Communicate with you about your booking",
      "Provide customer support during and after the rental",
      "Send booking confirmations and updates",
      "Improve our services and website functionality",
    ],
    intro: "The information we collect is used to:",
    note: "We do not sell or share your personal data with third parties for marketing purposes.",
  },
  {
    title: "Data Protection",
    content: [
      "We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, loss, or misuse.",
      "Payment processing is handled through secure, trusted third-party providers. We do not store full payment card details on our servers.",
    ],
  },
  {
    title: "Sharing of Information",
    content: [
      "With trusted service providers who assist us in operating our business (e.g., payment processors)",
      "When required by law or legal process",
      "To protect the rights and safety of our company or customers",
    ],
    intro: "We may share your information only in the following cases:",
  },
  {
    title: "Your Rights",
    content: [
      "Request access to the personal data we hold about you",
      "Request correction or deletion of your data",
      "Withdraw consent for data processing at any time",
    ],
    intro: "You have the right to:",
    note: "To exercise any of these rights, please contact us using the details below.",
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen py-12 px-4">
      <Helmet>
        <title>Privacy Policy | Tbilisicars</title>
        <meta name="description" content="Read the Tbilisicars privacy policy to understand how we handle your personal data." />
        <link rel="canonical" href="https://tbilisicars.com/privacy" />
      </Helmet>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            Legal
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-1">Tbilisicars</p>
          <p className="text-sm text-muted-foreground">Last Updated: 08.03.2026</p>
        </div>

        {/* Intro */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            At Tbilisicars, we are committed to protecting the privacy of our customers. This Privacy Policy explains how we collect, use, and safeguard your personal information when you use our website or rent a vehicle from us.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-4 mb-8">
          {PRIVACY_SECTIONS.map((s) => (
            <div key={s.title} className="bg-card border border-border rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-3">{s.title}</h2>
              {s.intro && (
                <p className="text-sm text-muted-foreground mb-3">{s.intro}</p>
              )}
              <ul className="space-y-2">
                {s.content.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              {s.note && (
                <p className="mt-3 text-sm text-muted-foreground italic">{s.note}</p>
              )}
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-3">Contact Information</h2>
          <p className="text-sm text-muted-foreground mb-3">
            If you have any questions about this Privacy Policy or wish to exercise your rights, please contact us:
          </p>
          <ul className="space-y-2">
            <li className="text-sm text-muted-foreground">
              Email:{" "}
              <a href="mailto:reservations@tbilisicars.com" className="text-primary hover:underline">
                reservations@tbilisicars.com
              </a>
            </li>
            <li className="text-sm text-muted-foreground">
              Phone:{" "}
              <a href="tel:+995591002630" className="text-primary hover:underline">
                +995 591 00 26 30
              </a>
            </li>
          </ul>
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            This Privacy Policy may be updated periodically. Any significant changes will be communicated through our website.
          </p>
        </div>
      </div>
    </div>
  );
}
