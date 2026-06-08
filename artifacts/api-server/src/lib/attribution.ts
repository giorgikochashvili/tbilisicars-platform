/**
 * Server-side booking attribution helpers.
 * Derives authoritative source_domain and source_brand from the request Host
 * header via a strict allowlist. Client-supplied values are never trusted.
 *
 * The allowlist is now derived from BRAND_REGISTRY (brand-registry.ts) so
 * there is a single source of truth for domain → brand mapping.
 * Behavior is identical to Phase 1A — no changes to public-bookings.ts required.
 */

import { BRAND_REGISTRY } from "./brand-registry.js";

/**
 * Built once at module load from BRAND_REGISTRY.allowedDomains.
 * Equivalent to the previous hardcoded BRAND_ALLOWLIST:
 *   tbilisicars.com     → { sourceDomain: "tbilisicars.com",  sourceBrand: "tbilisicars" }
 *   www.tbilisicars.com → { sourceDomain: "tbilisicars.com",  sourceBrand: "tbilisicars" }
 *   kutaisicars.com     → { sourceDomain: "kutaisicars.com",  sourceBrand: "kutaisicars" }
 *   www.kutaisicars.com → { sourceDomain: "kutaisicars.com",  sourceBrand: "kutaisicars" }
 *   batumicars.com      → { sourceDomain: "batumicars.com",   sourceBrand: "batumicars"  }
 *   www.batumicars.com  → { sourceDomain: "batumicars.com",   sourceBrand: "batumicars"  }
 */
const BRAND_ALLOWLIST: ReadonlyMap<string, { sourceDomain: string; sourceBrand: string }> =
  new Map(
    Object.values(BRAND_REGISTRY).flatMap((cfg) =>
      cfg.allowedDomains.map((domain) => [
        domain,
        { sourceDomain: cfg.primaryDomain, sourceBrand: cfg.brandKey },
      ]),
    ),
  );

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
