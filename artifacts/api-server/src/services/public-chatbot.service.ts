/**
 * Public chatbot knowledge source and intent-matching engine.
 * Stage 1: rule-based, zero DB access, fully controlled replies.
 *
 * Future upgrade path (Stage 2):
 *   Replace the TOPICS array with a DB query (e.g. chatbot_topics table managed in CRM).
 *   The processPublicChatbot() function signature stays identical — no changes needed
 *   in the route or the website widget.
 */

export interface ChatAction {
  type: "link" | "external";
  label: string;
  href: string;
}

interface KnowledgeTopic {
  keywords: string[];
  reply: string;
  actions?: ChatAction[];
}

const SEARCH_CARS: ChatAction = { type: "link", label: "Book your car now", href: "/booking" };
const CONTACT_EMAIL: ChatAction = { type: "external", label: "Contact Support", href: "mailto:support@tbilisicars.com" };
const CALL_US: ChatAction = { type: "external", label: "Call Us", href: "tel:+995557376363" };
const WHATSAPP: ChatAction = { type: "external", label: "WhatsApp", href: "https://wa.me/995557376363" };

const TOPICS: KnowledgeTopic[] = [
  {
    keywords: ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "greetings", "howdy"],
    reply: "Hello! Welcome to Tbilisicars. I'm here to help with any questions about our car rental service in Georgia. What can I help you with today?",
    actions: [SEARCH_CARS, CALL_US],
  },
  {
    keywords: ["find a car", "find car", "search car", "search cars", "search for a car", "looking for a car", "i need a car", "want to rent"],
    reply: "Great! I'll help you find the right car for your trip 🚗\n\nTo get started, I need a few details:\n\n• Which city are you traveling in? (Tbilisi, Kutaisi, Batumi)\n• Where would you like to pick up and return the car?\n• How many people are traveling?\n\nOnce I have this, I can suggest the best options for you 👇",
    actions: [SEARCH_CARS, CONTACT_EMAIL],
  },
  {
    keywords: ["how to book", "make a booking", "how do i book", "how can i book", "how do i reserve", "book a car", "reserve a car", "make reservation", "place a booking", "booking process", "how does booking work", "how do i rent", "rent a car"],
    reply: "Booking is quick and simple 👍\n\nHere's how it works:\n\n1. Choose your car\n2. Add extras or services if needed\n3. Select insurance option\n4. Enter your details\n5. Choose payment method\n6. Confirm your booking\n\nYou don't need to pay in advance — you can complete everything and pay on arrival.",
    actions: [SEARCH_CARS, CONTACT_EMAIL],
  },
  {
    keywords: ["rental conditions", "rental condition", "rent conditions", "conditions"],
    reply: "Here are the basic rental requirements:\n\n• Minimum age: 21 years\n• Valid driving license (at least 2 years)\n• Passport or ID\n\nIf you're unsure about anything, I can help clarify 👍",
    actions: [SEARCH_CARS, CONTACT_EMAIL],
  },
  {
    keywords: ["age", "minimum age", "how old", "years old", "driver age", "young driver", "age requirement", "age limit", "maximum age"],
    reply: "Our age requirements are:\n• Minimum age: 21 years old\n• Maximum age: 70 years old\n• Valid driving licence required for at least 2 years\n\nThese apply to the main driver and any additional drivers.",
    actions: [SEARCH_CARS],
  },
  {
    keywords: ["document", "documents", "passport", "driving licence", "driving license", "id", "what do i need", "what to bring", "requirements", "what documents", "papers", "identification"],
    reply: "To rent a vehicle you will need:\n• A valid driving licence (held for at least 2 years)\n• A valid passport or national ID\n\nBoth the main driver and any additional drivers must meet these requirements. Our team will complete the rental agreement at pickup, which takes around 5 minutes.",
    actions: [SEARCH_CARS, CONTACT_EMAIL],
  },
  {
    keywords: ["airport", "airports", "tbilisi airport", "kutaisi airport", "batumi airport", "pick me up", "airport pickup", "airport delivery", "arrive at airport", "arriving at airport", "meet at airport", "tbs", "bus"],
    reply: "Yes, we offer airport service in all major cities ✈️\n\nHere's how it works:\n\n🇬🇪 Tbilisi Airport\nYou can go directly to our office in the arrival hall — fast and easy pickup.\n\n🇬🇪 Kutaisi Airport\nWhen you arrive and are ready, our team will meet you outside the terminal and take you to our nearby office (just 2 minutes away).\n\n🇬🇪 Batumi Airport\nWe provide meet & greet service — our staff will meet you in the arrival hall and guide you to your car just outside the terminal.\n\n📞 One day before your arrival, our team will contact you to coordinate everything and ensure a smooth pickup.\n\n👉 You can select airport pickup during booking.",
    actions: [SEARCH_CARS, CALL_US],
  },
  {
    keywords: ["city delivery", "city pickup", "hotel delivery", "hotel pickup", "deliver to hotel", "apartment", "custom location", "deliver to", "pickup from", "pick up from", "address", "city centre", "downtown", "tbilisi city", "kutaisi city", "batumi city"],
    reply: "We offer vehicle delivery and pickup across Georgia — including hotels, apartments, city addresses, and other agreed locations.\n\nAt delivery our team handles: rental agreement signing, vehicle inspection, payment processing, and driving instructions.\n\nPlease contact us to arrange a custom pickup location.",
    actions: [CONTACT_EMAIL, CALL_US, WHATSAPP],
  },
  {
    keywords: ["payment", "pay", "price", "cost", "how much", "pricing", "prices", "offers", "cash", "card", "credit card", "debit card", "revolut", "wise", "apple pay", "google pay", "bank transfer", "currency", "fee", "charge", "deposit", "prepayment"],
    reply: "We make payment simple and flexible 👍\n\n• No prepayment is required\n• You can pay on arrival\n\nWe accept:\n• Credit & Debit Cards\n• Cash\n• Apple Pay / Google Pay\n• Bank transfer\n• Revolut, Wise and more\n\nYou can choose the most convenient option for you.",
    actions: [SEARCH_CARS, CONTACT_EMAIL],
  },
  {
    keywords: ["cancel", "cancellation", "modify", "change booking", "change reservation", "refund", "free cancellation", "cancel booking", "cancel reservation", "reschedule"],
    reply: "Reservations can be modified or cancelled free of charge. Please notify us at least 24 hours before your scheduled pickup time.\n\nYou can also manage your booking through the 'My Booking' section on our website, or contact our team directly.",
    actions: [CALL_US, CONTACT_EMAIL],
  },
  {
    keywords: ["included", "what's included", "what is included", "unlimited mileage", "mileage", "additional driver", "extra driver", "second driver", "roadside", "assistance", "24/7", "support included"],
    reply: "Your rental includes:\n• Unlimited mileage — travel anywhere in Georgia without distance limits\n• Unlimited additional drivers — share driving at no extra cost\n• 24/7 customer support throughout your rental\n• Roadside assistance across Georgia\n• Airport parking and service charges\n\nWe maintain clear pricing with no hidden charges.",
    actions: [SEARCH_CARS],
  },
  {
    keywords: ["fuel", "petrol", "diesel", "gas", "refuel", "fuel policy", "tank", "fill up"],
    reply: "Vehicles are delivered with a set fuel level and should be returned with the same level. If the vehicle is returned with significantly less fuel, refueling charges may apply.\n\nFor specific fuel type for your chosen vehicle, please contact our team.",
    actions: [CONTACT_EMAIL, CALL_US],
  },
  {
    keywords: ["restricted", "region", "abkhazia", "south ossetia", "ossetia", "tusheti", "border", "prohibited", "where can i drive", "can i drive to", "allowed"],
    reply: "For safety and legal reasons, vehicles may not be driven in restricted territories. The following regions are strictly prohibited:\n• Abkhazia\n• South Ossetia\n• Tusheti Region\n• Border conflict zones\n\nDriving to these regions is strictly prohibited. If you have questions about a specific destination, please contact our team.",
    actions: [CONTACT_EMAIL, CALL_US],
  },
  {
    keywords: ["suv", "family car", "family vehicle", "minivan", "van", "7 seater", "seven seater", "large car", "big car", "spacious", "4x4", "four wheel", "jeep", "crossover"],
    reply: "For families or groups needing extra space, we recommend our SUV and crossover category — offering comfortable seating, generous luggage capacity, and confident performance across Georgia's varied roads.\n\nTo find the right vehicle for your dates and route, use our search tool. Our team is also happy to recommend the best fit.",
    actions: [SEARCH_CARS, CONTACT_EMAIL],
  },
  {
    keywords: ["economy", "budget", "cheap", "affordable", "small car", "compact", "cheapest", "best price", "low cost"],
    reply: "For budget-conscious travellers, our economy and compact category offers great value — reliable vehicles at accessible prices, ideal for city travel and shorter trips.\n\nSearch for your dates to see available options and our best rates.",
    actions: [SEARCH_CARS],
  },
  {
    keywords: ["automatic", "automatic car", "automatic transmission", "auto car", "no manual", "automatic gearbox", "auto gearbox"],
    reply: "Yes, most of our cars are automatic 👍\n\nIf you have a specific preference, I can help you find the right option.",
    actions: [SEARCH_CARS, CONTACT_EMAIL],
  },
  {
    keywords: ["recommend", "recommendation", "suggest", "what car should i", "which car", "best car", "popular", "top car", "popular cars", "what cars do you have", "what vehicles", "fleet", "available cars", "best vehicle"],
    reply: "Our fleet covers a range of categories to suit every trip:\n• Economy / Compact — great for city travel and budget-friendly trips\n• Saloons & Hatchbacks — comfortable for longer journeys\n• SUVs & Crossovers — ideal for families, groups, or Georgia's mountain roads\n• Automatic options available\n\nSearch your dates to browse current availability and real pricing.",
    actions: [SEARCH_CARS, CONTACT_EMAIL],
  },
  {
    keywords: ["insurance", "damage", "excess", "cover", "coverage", "accident", "crash", "what if", "dent", "scratch", "protection"],
    reply: "We offer insurance options that can be selected during booking. Insurance conditions will apply depending on your chosen coverage.\n\nIn case of damage during the rental, you must notify our team immediately and contact the police if needed. An accident report may be required.\n\nFor specific insurance plan details and excess amounts, please contact our team or check our terms.",
    actions: [CONTACT_EMAIL, CALL_US],
  },
  {
    keywords: ["smoking", "smoke", "pets", "animal", "cleaning", "cleanliness", "dirty"],
    reply: "Smoking inside vehicles is strictly prohibited. If excessive cleaning is required after return, a cleaning fee may apply.\n\nFor questions about travelling with pets or other specific needs, please contact our team in advance.",
    actions: [CONTACT_EMAIL],
  },
  {
    keywords: ["contact", "support", "help", "phone", "call", "whatsapp", "telegram", "email", "reach", "get in touch", "speak to", "talk to", "message", "chat with"],
    reply: "If you'd like, our team can assist you directly.\n\n📞 Contact us:\n• Phone / WhatsApp: +995 557 37 63 63 (Tbilisi & Batumi)\n• Phone / WhatsApp: +995 595 28 66 00 (Kutaisi)\n• Email: support@tbilisicars.com\n\nWe usually respond very quickly.",
    actions: [CALL_US, WHATSAPP, CONTACT_EMAIL],
  },
];

const FALLBACK: { reply: string; actions: ChatAction[] } = {
  reply: "I'm not sure I understood that 🤔\n\nI can help with:\n• Car selection\n• Prices\n• Rental conditions\n• Booking process\n\nOr you can contact our team directly:\n👉 support@tbilisicars.com",
  actions: [CALL_US, WHATSAPP, CONTACT_EMAIL],
};

export function processPublicChatbot(message: string): { reply: string; actions: ChatAction[] } {
  const lower = message.toLowerCase().trim();
  if (!lower) return FALLBACK;

  for (const topic of TOPICS) {
    for (const keyword of topic.keywords) {
      if (lower.includes(keyword)) {
        return { reply: topic.reply, actions: topic.actions ?? [] };
      }
    }
  }

  return FALLBACK;
}
