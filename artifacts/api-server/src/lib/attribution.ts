/**
 * Server-side booking attribution helpers.
 * Derives source_domain and source_brand from the request Host header
 * using a hardcoded Tbilisicars-only allowlist.
 * Client-supplied source brand/domain values are never trusted.
 */

const BRAND_ALLOWLIST = new Map<string, { sourceDomain: string; sourceBrand: string }>([
  ["tbilisicars.com",     { sourceDomain: "tbilisicars.com", sourceBrand: "tbilisicars" }],
  ["www.tbilisicars.com", { sourceDomain: "tbilisicars.com", sourceBrand: "tbilisicars" }],
]);

export interface DerivedBrand {
  sourceDomain: string | null;
  sourceBrand: string | null;
}

/**
 * Derives source_domain and source_brand from the request hostname.
 * Express with `trust proxy 1` ensures req.hostname is already proxy-resolved.
 * Falls back to the raw x-forwarded-host header if needed.
 * Unknown/Replit/localhost hosts return { sourceDomain: null, sourceBrand: null }.
 */
export function deriveSourceBrand(
  hostname: string | undefined,
  xForwardedHost: string | string[] | undefined,
): DerivedBrand {
  const candidates: string[] = [];

  if (hostname) candidates.push(hostname.toLowerCase().trim());

  const fwdHost = Array.isArray(xForwardedHost)
    ? xForwardedHost[0]
    : xForwardedHost;
  if (fwdHost) {
    candidates.push(fwdHost.split(",")[0].toLowerCase().trim());
  }

  for (const host of candidates) {
    const match = BRAND_ALLOWLIST.get(host);
    if (match) return match;
  }

  return { sourceDomain: null, sourceBrand: null };
}
