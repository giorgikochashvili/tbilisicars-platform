import {
  db,
  bookingTable,
  locationTable,
  reservationCodeSequenceTable,
} from "@workspace/db";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createAdminBooking } from "./admin-bookings.service.js";
import { logAudit } from "./audit.service.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractedVoucherData {
  contactFullName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  pickupLocationRaw?: string | null;
  dropoffLocationRaw?: string | null;
  pickupDatetime?: string | null;
  dropoffDatetime?: string | null;
  brandRaw?: string | null;
  modelRaw?: string | null;
  totalAmount?: string | null;
  currency?: string | null;
  externalReservationCode?: string | null;
  flightNumber?: string | null;
  notes?: string | null;
  broker?: string | null;
}

const REQUIRED_RAW_FIELDS: Array<keyof ExtractedVoucherData> = [
  "contactFullName",
  "pickupLocationRaw",
  "dropoffLocationRaw",
  "pickupDatetime",
  "dropoffDatetime",
];

export interface ExtractResult {
  extracted: ExtractedVoucherData;
  warnings: string[];
  extractionFailed: boolean;
  /**
   * Machine-friendly failure category surfaced when extractionFailed=true.
   * Frontend uses this to render a specific message instead of a generic error.
   * Examples: "no_response", "no_json", "parse_error", "empty_extraction",
   * "openai_auth", "openai_rate_limit", "openai_model_not_found",
   * "openai_request_failed", "pdf_render_failed", "pdf_parse_failed".
   */
  reason?: string;
  /** Verbatim provider error message (truncated) — for diagnosis only. */
  providerMessage?: string;
  unresolvedFields: string[];
  resolvedPickupLocationId: number | null;
  resolvedDropoffLocationId: number | null;
}

// ─── Server-side location normalization ────────────────────────────────────────

type LocationRow = {
  id: number;
  name: string;
  city: string | null;
  reservationCodePrefix: string | null;
};

let _locationCache: LocationRow[] | null = null;
let _locationCacheTs = 0;
const CACHE_TTL_MS = 60_000;

async function getActiveLocations(): Promise<LocationRow[]> {
  const now = Date.now();
  if (_locationCache && now - _locationCacheTs < CACHE_TTL_MS)
    return _locationCache;
  _locationCache = await db
    .select({
      id: locationTable.id,
      name: locationTable.name,
      city: locationTable.city,
      reservationCodePrefix: locationTable.reservationCodePrefix,
    })
    .from(locationTable)
    .where(eq(locationTable.isActive, true));
  _locationCacheTs = now;
  return _locationCache;
}

function normalizeLocationHint(
  hint: string | null | undefined,
  locations: LocationRow[],
): number | null {
  if (!hint) return null;
  const lower = hint.toLowerCase().trim();
  // Exact name match
  let match = locations.find((l) => l.name.toLowerCase() === lower);
  if (match) return match.id;
  // Name contains hint or hint contains name
  match = locations.find(
    (l) =>
      l.name.toLowerCase().includes(lower) ||
      lower.includes(l.name.toLowerCase()),
  );
  if (match) return match.id;
  // City match
  match = locations.find((l) => l.city && l.city.toLowerCase() === lower);
  if (match) return match.id;
  match = locations.find(
    (l) =>
      l.city &&
      (l.city.toLowerCase().includes(lower) ||
        lower.includes(l.city.toLowerCase())),
  );
  if (match) return match.id;
  return null;
}

// ─── AI Extraction ─────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a car rental voucher data extractor.
Extract booking information from the provided voucher (image or text) and return ONLY valid JSON.

Return a JSON object with these fields (all optional/nullable):
- contactFullName: string — customer's full name
- contactEmail: string — customer email
- contactPhone: string — customer phone number
- pickupLocationRaw: string — pickup city or location name exactly as written on voucher
- dropoffLocationRaw: string — dropoff city or location name (if different, else same as pickup)
- pickupDatetime: string — ISO 8601 datetime if determinable (YYYY-MM-DDTHH:mm:00)
- dropoffDatetime: string — ISO 8601 datetime if determinable
- brandRaw: string — car brand/make as written on voucher (e.g. Toyota, Mercedes)
- modelRaw: string — car model/category as written on voucher (e.g. Corolla, Economy)
- totalAmount: string — numeric total amount as string
- currency: string — 3-letter currency code (e.g. GEL, USD, EUR)
- externalReservationCode: string — voucher/booking reference from the document
- flightNumber: string — flight number (e.g. TK248, W64420) from arrival/departure info or notes
- notes: string — any other relevant info
- broker: string — travel agency or broker name if present

Rules:
- Return null for any field you cannot determine
- For dates, use the year as printed; if year is ambiguous, omit
- Do NOT invent data — only extract what is clearly visible
- Return ONLY the JSON object, no markdown, no explanation`;

async function resolveAndBuildResult(
  extracted: ExtractedVoucherData,
  warnings: string[],
  extractionFailed: boolean,
  reason?: string,
  providerMessage?: string,
): Promise<ExtractResult> {
  const locations = await getActiveLocations();
  const resolvedPickupLocationId = normalizeLocationHint(
    extracted.pickupLocationRaw,
    locations,
  );
  const resolvedDropoffLocationId = normalizeLocationHint(
    extracted.dropoffLocationRaw ?? extracted.pickupLocationRaw,
    locations,
  );

  const unresolvedFields: string[] = [];
  for (const f of REQUIRED_RAW_FIELDS) {
    if (!extracted[f]) {
      unresolvedFields.push(String(f));
    }
  }
  if (!resolvedPickupLocationId) unresolvedFields.push("pickupLocation");
  if (!resolvedDropoffLocationId) unresolvedFields.push("dropoffLocation");

  return {
    extracted,
    warnings,
    extractionFailed,
    reason,
    providerMessage,
    unresolvedFields: [...new Set(unresolvedFields)],
    resolvedPickupLocationId,
    resolvedDropoffLocationId,
  };
}

interface ProviderError {
  status?: number;
  code?: string;
  type?: string;
  message?: string;
  name?: string;
}

/** Categorize an OpenAI SDK error into a stable {reason, message} pair. */
function classifyOpenAIError(err: unknown): {
  reason: string;
  providerMessage: string;
} {
  const e = (err ?? {}) as ProviderError;
  const status = e.status;
  const message = (e.message ?? String(err)).slice(0, 500);
  if (status === 401 || status === 403) return { reason: "openai_auth", providerMessage: message };
  if (status === 404) return { reason: "openai_model_not_found", providerMessage: message };
  if (status === 429) return { reason: "openai_rate_limit", providerMessage: message };
  if (status && status >= 500) return { reason: "openai_server_error", providerMessage: message };
  return { reason: "openai_request_failed", providerMessage: message };
}

const EXTRACT_MODEL = "gpt-4o";

interface ExtractionLogPayload {
  kind: "image" | "text";
  bytes: number;
  durationMs: number;
  model: string;
  success: boolean;
  reason?: string;
  rawPreview?: string;
}

function logExtraction(p: ExtractionLogPayload): void {
  const safe = {
    ...p,
    rawPreview: p.rawPreview ? p.rawPreview.slice(0, 500) : undefined,
  };
  // Single-line structured log so failures are diagnosable from logs alone.
  console.log(`[voucher-import] ${JSON.stringify(safe)}`);
}

export async function extractVoucherFromImage(
  base64Image: string,
  mimeType: string,
): Promise<ExtractResult> {
  const warnings: string[] = [];
  const start = Date.now();
  // base64 expands payload by ~4/3, so approx the underlying image size.
  const bytes = Math.round((base64Image.length * 3) / 4);

  let raw = "";
  try {
    const response = await openai.chat.completions.create({
      model: EXTRACT_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Extract the booking data from this voucher image.",
            },
          ],
        },
      ],
    });

    raw = response.choices[0]?.message?.content ?? "";
    const parsed = parseExtractionJson(raw, warnings);
    logExtraction({
      kind: "image",
      bytes,
      durationMs: Date.now() - start,
      model: EXTRACT_MODEL,
      success: !parsed.parseFailed,
      reason: parsed.reason,
      rawPreview: parsed.parseFailed ? raw : undefined,
    });
    return resolveAndBuildResult(
      parsed.data,
      warnings,
      parsed.parseFailed,
      parsed.reason,
    );
  } catch (err: unknown) {
    const { reason, providerMessage } = classifyOpenAIError(err);
    logExtraction({
      kind: "image",
      bytes,
      durationMs: Date.now() - start,
      model: EXTRACT_MODEL,
      success: false,
      reason,
      rawPreview: providerMessage,
    });
    warnings.push("AI extraction failed — please fill in details manually.");
    return resolveAndBuildResult({}, warnings, true, reason, providerMessage);
  }
}

export async function extractVoucherFromText(
  pdfText: string,
): Promise<ExtractResult> {
  const warnings: string[] = [];
  const start = Date.now();
  const truncated = pdfText.slice(0, 8000);
  const bytes = Buffer.byteLength(truncated, "utf8");

  let raw = "";
  try {
    const response = await openai.chat.completions.create({
      model: EXTRACT_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract the booking data from this voucher text:\n\n${truncated}`,
        },
      ],
    });

    raw = response.choices[0]?.message?.content ?? "";
    const parsed = parseExtractionJson(raw, warnings);
    logExtraction({
      kind: "text",
      bytes,
      durationMs: Date.now() - start,
      model: EXTRACT_MODEL,
      success: !parsed.parseFailed,
      reason: parsed.reason,
      rawPreview: parsed.parseFailed ? raw : undefined,
    });
    return resolveAndBuildResult(
      parsed.data,
      warnings,
      parsed.parseFailed,
      parsed.reason,
    );
  } catch (err: unknown) {
    const { reason, providerMessage } = classifyOpenAIError(err);
    logExtraction({
      kind: "text",
      bytes,
      durationMs: Date.now() - start,
      model: EXTRACT_MODEL,
      success: false,
      reason,
      rawPreview: providerMessage,
    });
    warnings.push("AI extraction failed — please fill in details manually.");
    return resolveAndBuildResult({}, warnings, true, reason, providerMessage);
  }
}

/**
 * Robust JSON extraction from a chat-model response.
 *
 * Handles, in order:
 *   1. Empty / whitespace-only response       → reason "no_response"
 *   2. ```json ... ``` or ``` ... ``` fences  → strip and JSON.parse
 *   3. First balanced {...} block in the text → JSON.parse
 *   4. Greedy {...} fallback                  → JSON.parse
 * Then validates that at least one field is non-empty (else "empty_extraction").
 */
function parseExtractionJson(
  raw: string,
  warnings: string[],
): {
  data: ExtractedVoucherData;
  parseFailed: boolean;
  reason?: string;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    warnings.push("AI returned an empty response — please fill in details manually.");
    return { data: {}, parseFailed: true, reason: "no_response" };
  }

  const candidates = collectJsonCandidates(trimmed);
  if (candidates.length === 0) {
    warnings.push("AI response did not contain JSON — please fill in details manually.");
    return { data: {}, parseFailed: true, reason: "no_json" };
  }

  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate) as ExtractedVoucherData;
      const hasAnyValue = Object.values(data).some(
        (v) => v != null && v !== "",
      );
      if (!hasAnyValue) {
        warnings.push("AI returned empty extraction — please fill in details manually.");
        return { data: {}, parseFailed: true, reason: "empty_extraction" };
      }
      return { data, parseFailed: false };
    } catch {
      // try next candidate
    }
  }

  warnings.push("Could not parse AI response — please fill in details manually.");
  return { data: {}, parseFailed: true, reason: "parse_error" };
}

/**
 * Returns ordered JSON-object candidate strings to try parsing.
 * Strips fenced blocks first (```json or ```), then a balanced {...} scan,
 * then the legacy greedy regex as a last resort.
 */
function collectJsonCandidates(text: string): string[] {
  const out: string[] = [];

  // 1. Fenced code blocks (```json ... ``` and ``` ... ```)
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const inner = m[1].trim();
    if (inner.startsWith("{")) out.push(inner);
  }

  // 2. First balanced {...} block (handles nested objects, ignores braces in strings)
  const balanced = findFirstBalancedObject(text);
  if (balanced) out.push(balanced);

  // 3. Greedy fallback (legacy behavior — last resort)
  const greedy = text.match(/\{[\s\S]*\}/);
  if (greedy) out.push(greedy[0]);

  // De-duplicate while preserving order
  return [...new Set(out)];
}

function findFirstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// ─── Duplicate Check ───────────────────────────────────────────────────────────

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  warnings: string[];
}

export async function checkVoucherDuplicate(params: {
  externalReservationCode?: string | null;
  voucherImportRef?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  pickupDatetime?: string | null;
  pickupLocationId?: number | null;
}): Promise<DuplicateCheckResult> {
  const {
    externalReservationCode,
    voucherImportRef,
    contactPhone,
    contactEmail,
    pickupDatetime,
  } = params;
  const warnings: string[] = [];
  let isDuplicate = false;

  // 1. Exact external reservation code match
  if (externalReservationCode) {
    const rows = await db
      .select({ id: bookingTable.id })
      .from(bookingTable)
      .where(
        and(
          eq(bookingTable.externalReservationCode, externalReservationCode),
          isNull(bookingTable.deletedAt),
        ),
      )
      .limit(1);
    if (rows[0]) {
      isDuplicate = true;
      warnings.push(
        `Booking #${rows[0].id} already exists with this voucher reference code.`,
      );
    }
  }

  // 2. Voucher import ref match (file identity)
  if (!isDuplicate && voucherImportRef) {
    const rows = await db
      .select({ id: bookingTable.id })
      .from(bookingTable)
      .where(
        and(
          eq(bookingTable.voucherImportRef, voucherImportRef),
          isNull(bookingTable.deletedAt),
        ),
      )
      .limit(1);
    if (rows[0]) {
      isDuplicate = true;
      warnings.push(
        `Booking #${rows[0].id} was already created from this file.`,
      );
    }
  }

  // 3. Soft check: same phone/email + similar pickup datetime (±2 hours, no location constraint)
  if (pickupDatetime && (contactPhone || contactEmail)) {
    const pickupDate = new Date(pickupDatetime);
    const windowStart = new Date(pickupDate.getTime() - 2 * 60 * 60 * 1000);
    const windowEnd = new Date(pickupDate.getTime() + 2 * 60 * 60 * 1000);

    const contactConditions = [];
    if (contactPhone)
      contactConditions.push(eq(bookingTable.contactPhone, contactPhone));
    if (contactEmail)
      contactConditions.push(eq(bookingTable.contactEmail, contactEmail));

    const rows = await db
      .select({ id: bookingTable.id })
      .from(bookingTable)
      .where(
        and(
          or(...contactConditions)!,
          gte(bookingTable.pickupDatetime, windowStart),
          lte(bookingTable.pickupDatetime, windowEnd),
          isNull(bookingTable.deletedAt),
        ),
      )
      .limit(1);

    if (rows[0]) {
      warnings.push(
        `Possible duplicate: Booking #${rows[0].id} has the same contact info and a similar pickup time.`,
      );
      isDuplicate = isDuplicate || true;
    }
  }

  return { isDuplicate, warnings };
}

// ─── Reservation Code Generation ───────────────────────────────────────────────
// Format: PREFIX + sequence number (e.g. TBS8001) — no separator

export async function generateReservationCode(
  pickupLocationId: number,
): Promise<string | null> {
  const locRows = await db
    .select({ reservationCodePrefix: locationTable.reservationCodePrefix })
    .from(locationTable)
    .where(eq(locationTable.id, pickupLocationId))
    .limit(1);

  const prefix = locRows[0]?.reservationCodePrefix;
  if (!prefix) {
    return null;
  }

  return await db.transaction(async (tx) => {
    // Safe concurrent first-row creation:
    // 1. INSERT ... ON CONFLICT DO NOTHING — safe if another concurrent request already inserted
    // 2. SELECT FOR UPDATE — guarantees we hold a lock on the single row before incrementing
    // 3. UPDATE nextVal + RETURNING — atomic allocation
    await tx
      .insert(reservationCodeSequenceTable)
      .values({ prefix, nextVal: 8001 })
      .onConflictDoNothing();

    const [seqRow] = await tx
      .select({ nextVal: reservationCodeSequenceTable.nextVal })
      .from(reservationCodeSequenceTable)
      .where(eq(reservationCodeSequenceTable.prefix, prefix))
      .for("update");

    if (!seqRow) {
      throw new Error(`Failed to initialize sequence for prefix "${prefix}"`);
    }

    const allocated = seqRow.nextVal;
    await tx
      .update(reservationCodeSequenceTable)
      .set({ nextVal: sql`${reservationCodeSequenceTable.nextVal} + 1` })
      .where(eq(reservationCodeSequenceTable.prefix, prefix));

    return `${prefix}${allocated}`;
  });
}

// ─── Confirm Import ────────────────────────────────────────────────────────────

export interface ConfirmVoucherImportData {
  contactFullName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  pickupLocationId: number;
  dropoffLocationId: number;
  pickupDatetime: string;
  dropoffDatetime: string;
  vehicleModelId: number;
  totalAmount?: string | null;
  currency?: string | null;
  notes?: string | null;
  flightNumber?: string | null;
  broker?: string | null;
  externalReservationCode?: string | null;
  voucherImportRef?: string | null;
  status?:
    | "PENDING"
    | "CONFIRMED"
    | "DELIVERED"
    | "RETURNED"
    | "CANCELED"
    | "NO_SHOW";
  paymentStatus?: "UNPAID" | "HALF" | "PAID" | "PREPAID" | "REFUNDED";
}

export async function confirmVoucherImport(
  data: ConfirmVoucherImportData,
  actorId: number,
  extractedDraft?: ExtractedVoucherData | null,
) {
  const reservationCode = await generateReservationCode(data.pickupLocationId);

  // Merge flightNumber into notes since the bookings table has no separate flight_number column in V1
  const flightPrefix = data.flightNumber
    ? `Flight: ${data.flightNumber}`
    : null;
  const mergedNotes =
    [flightPrefix, data.notes].filter(Boolean).join("\n") || null;

  const booking = await createAdminBooking({
    contactFullName: data.contactFullName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    pickupLocationId: data.pickupLocationId,
    dropoffLocationId: data.dropoffLocationId,
    pickupDatetime: data.pickupDatetime,
    dropoffDatetime: data.dropoffDatetime,
    vehicleModelId: data.vehicleModelId,
    totalAmount: data.totalAmount,
    currency: data.currency,
    notes: mergedNotes,
    broker: data.broker,
    source: "voucher",
    status: data.status ?? "CONFIRMED",
    paymentStatus: data.paymentStatus ?? "UNPAID",
    reservationCode,
    externalReservationCode: data.externalReservationCode,
    voucherImportRef: data.voucherImportRef,
  });

  logAudit({
    actorId,
    entityType: "booking",
    entityId: booking.id,
    entityRef: reservationCode ?? null,
    action: "voucher_import",
    summary: reservationCode
      ? `Voucher imported → reservation code ${reservationCode}`
      : `Voucher imported → no reservation code (location has no prefix)`,
    afterData: {
      bookingId: booking.id,
      reservationCode: reservationCode ?? null,
      externalReservationCode: data.externalReservationCode ?? null,
      voucherImportRef: data.voucherImportRef ?? null,
      contactFullName: data.contactFullName,
      extractedDraft: extractedDraft ?? null,
    },
  });

  return { booking, reservationCode };
}
