/**
 * Client-side attribution capture utilities.
 * Captures first-touch UTM/GCLID/referrer/landing_path on page load
 * and makes it available to the booking submit function.
 *
 * Uses a dedicated sessionStorage key (tc_attribution) that is entirely
 * separate from the booking draft key (tc_booking_draft).
 */

const ATTRIBUTION_KEY = "tc_attribution";

export interface AttributionData {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  gclid: string | null;
  referrer: string | null;
  landing_path: string | null;
}

/**
 * Captures first-touch attribution from the current URL and document.referrer.
 * Stores the result in sessionStorage under tc_attribution.
 *
 * First-touch semantics: if tc_attribution already exists in sessionStorage
 * this function returns immediately without overwriting, so the original
 * landing page data is preserved across multi-page navigation.
 *
 * Entirely wrapped in try/catch — sessionStorage errors (private mode,
 * SecurityError, quota) are silently swallowed and will never break the site.
 */
export function captureAttribution(): void {
  try {
    if (sessionStorage.getItem(ATTRIBUTION_KEY) !== null) return;

    const p = new URLSearchParams(window.location.search);

    const data: AttributionData = {
      utm_source:   p.get("utm_source")   || null,
      utm_medium:   p.get("utm_medium")   || null,
      utm_campaign: p.get("utm_campaign") || null,
      utm_content:  p.get("utm_content")  || null,
      utm_term:     p.get("utm_term")     || null,
      gclid:        p.get("gclid")        || null,
      referrer:     document.referrer     || null,
      landing_path: (window.location.pathname + window.location.search) || null,
    };

    sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage unavailable or quota exceeded — non-fatal, attribution is best-effort
  }
}

/**
 * Reads the captured attribution data from sessionStorage.
 * Returns null if nothing was captured or on any read/parse error.
 */
export function getAttribution(): AttributionData | null {
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AttributionData;
  } catch {
    return null;
  }
}
