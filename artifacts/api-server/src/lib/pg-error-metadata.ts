/**
 * pg-error-metadata.ts
 *
 * Bounded PostgreSQL error metadata extractor.
 *
 * Inspects only structured `code` and `constraint` properties.
 * Protects every property read with try/catch so a hostile or malformed
 * getter cannot make the extractor throw.
 * Traverses at most one level of `.cause` (depth 2 total).
 * Cycle-safe via a local Set<unknown>.
 * Never parses message text.
 * Never returns raw error objects or logs anything.
 */

function safeGet(obj: Record<string, unknown>, key: string): unknown {
  try { return obj[key]; } catch { return undefined; }
}

function tryExtract(obj: unknown): { code?: string; constraint?: string } | null {
  if (obj === null || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  let code: string | undefined;
  let constraint: string | undefined;
  // eslint-disable-next-line no-useless-catch
  try { const v = safeGet(o, "code");       if (typeof v === "string") code       = v; } catch { /* skip */ }
  // eslint-disable-next-line no-useless-catch
  try { const v = safeGet(o, "constraint"); if (typeof v === "string") constraint = v; } catch { /* skip */ }
  if (code !== undefined || constraint !== undefined) return { code, constraint };
  return null;
}

export function extractPostgresErrorMetadata(
  error: unknown,
): { code?: string; constraint?: string } {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 2; depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    const extracted = tryExtract(current);
    if (extracted) return extracted;
    if (current === null || typeof current !== "object") break;
    try { current = safeGet(current as Record<string, unknown>, "cause"); } catch { break; }
  }
  return {};
}
