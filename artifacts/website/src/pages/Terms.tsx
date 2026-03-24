export default function Terms() {
  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 rounded-full px-4 py-1.5 text-sm text-primary mb-4">
            Legal
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">Terms & Conditions</h1>
          <p className="text-muted-foreground">Last updated: January 2025</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 space-y-8">
          {[
            {
              title: "1. Eligibility Requirements",
              content: [
                "Drivers must be at least 21 years of age (23 for premium vehicles).",
                "A valid driving licence held for at least 2 years is required.",
                "An international driving permit is required for non-Georgian licence holders.",
                "A valid passport or national ID must be presented at pickup.",
              ],
            },
            {
              title: "2. Reservations & Payment",
              content: [
                "Bookings made online are requests and are confirmed by our team within 24 hours.",
                "A security deposit is required at vehicle pickup. The amount varies by vehicle model.",
                "Accepted payment methods include credit card, debit card, cash, and bank transfer.",
                "Rates are quoted in Georgian Lari (GEL) or Euros (€) as displayed.",
              ],
            },
            {
              title: "3. Vehicle Use",
              content: [
                "Vehicles must only be driven by the named driver(s) on the rental agreement.",
                "Off-road driving is strictly prohibited unless the vehicle is specifically designated for such use.",
                "Smoking is not permitted in any of our vehicles.",
                "Vehicles may not be taken outside Georgia without prior written consent.",
              ],
            },
            {
              title: "4. Fuel Policy",
              content: [
                "Vehicles are provided with a full tank of fuel and must be returned full.",
                "If returned with less fuel, a refuelling charge will apply.",
              ],
            },
            {
              title: "5. Insurance & Liability",
              content: [
                "Third-party liability insurance is included with all rentals.",
                "Collision Damage Waiver (CDW) is available in Basic, Full, and Premium tiers.",
                "The excess amount varies by insurance plan selected.",
                "Any damage not covered by the selected plan is the renter's responsibility up to the excess amount.",
              ],
            },
            {
              title: "6. Cancellations",
              content: [
                "Cancellations made more than 24 hours before pickup are free of charge.",
                "Cancellations within 24 hours of pickup may incur a cancellation fee.",
                "No-shows will be charged one day's rental fee.",
              ],
            },
            {
              title: "7. Late Returns",
              content: [
                "A grace period of 1 hour is provided for returns.",
                "Returns later than 1 hour after the agreed time may incur an additional day's charge.",
                "Please contact us as early as possible if you expect to be delayed.",
              ],
            },
            {
              title: "8. Traffic Violations & Fines",
              content: [
                "The renter is responsible for all traffic violations and fines incurred during the rental period.",
                "An administration fee may be charged for processing fines on behalf of the renter.",
              ],
            },
          ].map((section) => (
            <div key={section.title}>
              <h2 className="text-lg font-semibold text-white mb-3">{section.title}</h2>
              <ul className="space-y-2">
                {section.content.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              By making a reservation with Tbilisi Cars, you agree to these terms and conditions. For any questions, please contact us before booking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
