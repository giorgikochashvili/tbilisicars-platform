/**
 * Server-side booking attribution helpers.
 * Derives authoritative source_domain and source_brand from the request Host
 * header via a strict allowlist. Client-supplied values are never trusted.
 */

const BRAND_ALLOWLIST: Record<string, { sourceDomain: string; sourceBrand: string }> = {
  "tbilisicars.com":     { sourceDomain: "tbilisicars.com",  sourceBrand: "tbilisicars" },
  "www.tbilisicars.com": { sourceDomain: "tbilisicars.com",  sourceBrand: "tbilisicars" },
  "kutaisicars.com":     { sourceDomain: "kutaisicars.com",  sourceBrand: "kutaisicars" },
  "www.kutaisicars.com": { sourceDomain: "kutaisicars.com",  sourceBrand: "kutaisicars" },
  "batumicars.com":      { sourceDomain: "batumicars.com",   sourceBrand: "batumicars"  },
  "www.batumicars.com":  { sourceDomain: "batumicars.com",   sourceBrand: "batumicars"  },
};

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
    const match = BRAND_ALLOWLIST[host];
    if (match) return match;
  }

  return { sourceDomain: null, sourceBrand: null };
}
