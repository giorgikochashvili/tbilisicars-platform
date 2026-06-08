/**
 * Static brand registry for multi-brand/multi-domain architecture.
 * Single source of truth for all brand identity, contact, and configuration data.
 *
 * Design principles:
 * ─ Tbilisicars is the ONLY currently active brand (websiteActive/bookingEnabled: true).
 * ─ Kutaisicars and Batumicars have websiteActive: false and bookingEnabled: false.
 *   They must NOT be activated until DNS, hosting, email sender auth, and a
 *   frontend build are all in place. Activation requires a deliberate, reviewed
 *   code change to flip those flags.
 * ─ Email sender fields for inactive brands are null. Do NOT set emailFromAddress
 *   for kutaisicars or batumicars until Google Workspace + SPF/DKIM/DMARC is
 *   fully verified for that domain, and Resend sender domain is added.
 * ─ This file has ZERO runtime behavior impact on its own. It is imported by
 *   attribution.ts (Phase 1A) so domain → brand mapping has one source of truth.
 *   No booking logic, email logic, pricing, or website content is changed.
 */

export type BrandKey = "tbilisicars" | "kutaisicars" | "batumicars";

export type DomainStatus = "pending" | "dns_configured" | "live";

export interface BrandConfig {
  // ── Core identity ────────────────────────────────────────────────────────────
  brandKey: BrandKey;
  displayName: string;
  tagline: string;
  primaryDomain: string;
  /** All hostname variants (with/without www) that map to this brand. */
  allowedDomains: string[];

  // ── Assets ───────────────────────────────────────────────────────────────────
  logoAssetPath: string;
  faviconAssetPath: string;
  ogImageUrl: string;

  // ── Contact ──────────────────────────────────────────────────────────────────
  publicPhone: string | null;
  publicPhonePlain: string | null;
  reservationsEmail: string | null;
  businessEmail: string | null;
  whatsappNumber: string | null;
  googleReviewUrl: string | null;
  trustpilotUrl: string | null;

  // ── Activation guards ────────────────────────────────────────────────────────
  /**
   * True only when the public website for this brand is fully deployed and live.
   * Prerequisites for kutaisicars / batumicars:
   *   — DNS configured and resolving
   *   — Frontend build deployed to production
   *   — All page content and canonical tags correct
   *   — Search Console property verified
   */
  websiteActive: boolean;
  /**
   * True only when this brand's frontend can accept public bookings.
   * May differ from websiteActive — an informational site can exist before
   * the booking flow is enabled.
   */
  bookingEnabled: boolean;

  // ── SEO / canonical ──────────────────────────────────────────────────────────
  canonicalBaseUrl: string;
  sitemapUrl: string;
  defaultLocale: string;
  defaultCurrency: string;
  /** Google Ads conversion tag ID. Null if not yet configured for this brand. */
  googleAdsId: string | null;

  // ── Legal / documents ────────────────────────────────────────────────────────
  termsUrl: string;
  privacyUrl: string;
  footerOperatorNote: string | null;

  // ── Email sender — INACTIVE placeholder for kutaisicars / batumicars ─────────
  /**
   * Transactional email "From" address for this brand.
   * MUST remain null for kutaisicars and batumicars until ALL of the following:
   *   — Google Workspace account set up for the domain
   *   — SPF record published and verified
   *   — DKIM key published and verified
   *   — DMARC policy published
   *   — Resend sender domain added and verified
   * Activating without sender authentication causes email delivery failures and
   * spam classification. This field being non-null does NOT automatically change
   * any email behavior — email.service.ts must be updated separately in Phase 7.
   */
  emailFromAddress: string | null;
  /** Display name for the "From" header. Null when emailFromAddress is null. */
  emailFromName: string | null;
  /** Where CRM new-booking notifications go for this brand. Null = use default. */
  internalNotificationEmail: string | null;
  /**
   * True when Google Workspace + SPF/DKIM/DMARC is verified for this brand.
   * Prerequisite gate before any Phase 7 email activation.
   */
  googleWorkspaceReady: boolean;

  // ── Domain / infrastructure tracking (informational only) ────────────────────
  /** Lifecycle stage of the domain. Informational — not an activation gate. */
  domainStatus: DomainStatus;
  /** True when a Google Search Console property is verified for primaryDomain. */
  searchConsoleVerified: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export const BRAND_REGISTRY: Record<BrandKey, BrandConfig> = {

  tbilisicars: {
    brandKey:         "tbilisicars",
    displayName:      "Tbilisicars",
    tagline:          "Car Rental Georgia",
    primaryDomain:    "tbilisicars.com",
    allowedDomains:   ["tbilisicars.com", "www.tbilisicars.com"],

    logoAssetPath:    "/tbilisi-logo.png",
    faviconAssetPath: "/favicon.ico",
    ogImageUrl:       "https://tbilisicars.com/opengraph.jpg",

    publicPhone:       "+995 557 37 63 63",
    publicPhonePlain:  "995557376363",
    reservationsEmail: "reservations@tbilisicars.com",
    businessEmail:     "info@tbilisicars.com",
    whatsappNumber:    "995557376363",
    googleReviewUrl:   "https://g.page/r/CbUg7g106nJGEBM/review",
    trustpilotUrl:     "https://www.trustpilot.com/review/tbilisicars.com",

    websiteActive:  true,
    bookingEnabled: true,

    canonicalBaseUrl: "https://tbilisicars.com",
    sitemapUrl:       "https://tbilisicars.com/sitemap.xml",
    defaultLocale:    "en",
    defaultCurrency:  "USD",
    googleAdsId:      "AW-18043925820",

    termsUrl:           "/terms",
    privacyUrl:         "/privacy",
    footerOperatorNote: null,

    emailFromAddress:          "reservations@tbilisicars.com",
    emailFromName:             "Tbilisicars Reservations",
    internalNotificationEmail: "reservations@tbilisicars.com",
    googleWorkspaceReady:      true,

    domainStatus:          "live",
    searchConsoleVerified: true,
  },

  kutaisicars: {
    brandKey:         "kutaisicars",
    displayName:      "Kutaisicars",
    tagline:          "Car Rental Kutaisi",
    primaryDomain:    "kutaisicars.com",
    allowedDomains:   ["kutaisicars.com", "www.kutaisicars.com"],

    logoAssetPath:    "/kutaisicars-logo.png",
    faviconAssetPath: "/favicon.ico",
    ogImageUrl:       "https://kutaisicars.com/opengraph.jpg",

    publicPhone:       "+995 555 21 12 10",
    publicPhonePlain:  "995555211210",
    reservationsEmail: "info@kutaisicars.com",
    businessEmail:     "info@kutaisicars.com",
    whatsappNumber:    "995555211210",
    googleReviewUrl:   "https://g.page/r/Cc-dBHtnNfYKEBM/review",
    trustpilotUrl:     null,

    // ⚠ NOT active — domain purchased but DNS/hosting/frontend not configured.
    websiteActive:  false,
    bookingEnabled: false,

    canonicalBaseUrl: "https://kutaisicars.com",
    sitemapUrl:       "https://kutaisicars.com/sitemap.xml",
    defaultLocale:    "en",
    defaultCurrency:  "USD",
    googleAdsId:      null,

    termsUrl:           "/terms",
    privacyUrl:         "/privacy",
    footerOperatorNote: null,

    // ⚠ Email sender NOT active — Google Workspace + SPF/DKIM/DMARC not set up.
    emailFromAddress:          null,
    emailFromName:             null,
    internalNotificationEmail: null,
    googleWorkspaceReady:      false,

    domainStatus:          "pending",
    searchConsoleVerified: false,
  },

  batumicars: {
    brandKey:         "batumicars",
    displayName:      "Batumicars",
    tagline:          "Car Rental Batumi",
    primaryDomain:    "batumicars.com",
    allowedDomains:   ["batumicars.com", "www.batumicars.com"],

    logoAssetPath:    "/batumicars-logo.png",
    faviconAssetPath: "/favicon.ico",
    ogImageUrl:       "https://batumicars.com/opengraph.jpg",

    publicPhone:       "+995 514 03 02 01",
    publicPhonePlain:  "995514030201",
    reservationsEmail: "info@batumicars.com",
    businessEmail:     "info@batumicars.com",
    whatsappNumber:    "995514030201",
    googleReviewUrl:   null,
    trustpilotUrl:     null,

    // ⚠ NOT active — domain purchased but DNS/hosting/frontend not configured.
    websiteActive:  false,
    bookingEnabled: false,

    canonicalBaseUrl: "https://batumicars.com",
    sitemapUrl:       "https://batumicars.com/sitemap.xml",
    defaultLocale:    "en",
    defaultCurrency:  "USD",
    googleAdsId:      null,

    termsUrl:           "/terms",
    privacyUrl:         "/privacy",
    footerOperatorNote: null,

    // ⚠ Email sender NOT active — Google Workspace + SPF/DKIM/DMARC not set up.
    emailFromAddress:          null,
    emailFromName:             null,
    internalNotificationEmail: null,
    googleWorkspaceReady:      false,

    domainStatus:          "pending",
    searchConsoleVerified: false,
  },

};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the BrandConfig for the given hostname, or null if the host does not
 * appear in any brand's allowedDomains list.
 * Case-insensitive; strips leading/trailing whitespace.
 * Server-side use only — mirrors Phase 1A Host-header semantics.
 */
export function getBrandByHost(host: string): BrandConfig | null {
  const normalized = host.toLowerCase().trim();
  for (const config of Object.values(BRAND_REGISTRY)) {
    if (config.allowedDomains.includes(normalized)) return config;
  }
  return null;
}

/**
 * Typed array of all brand keys in definition order.
 * Prefer this over Object.keys(BRAND_REGISTRY) to keep ordering deterministic.
 */
export const BRAND_KEYS: readonly BrandKey[] = [
  "tbilisicars",
  "kutaisicars",
  "batumicars",
] as const;
