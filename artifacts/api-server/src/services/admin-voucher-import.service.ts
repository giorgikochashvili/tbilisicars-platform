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
import { ValidationError } from "../lib/errors.js";

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
    unresolvedFields: [...new Set(unresolvedFields)],
    resolvedPickupLocationId,
    resolvedDropoffLocationId,
  };
}

export async function extractVoucherFromImage(
  base64Image: string,
  mimeType: string,
): Promise<ExtractResult> {
  const warnings: string[] = [];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
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

    const raw = response.choices[0]?.message?.content ?? "";
    const { data: extracted, parseFailed } = parseExtractionJson(raw, warnings);
    return resolveAndBuildResult(extracted, warnings, parseFailed);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    const message = (err as { message?: string })?.message;
    console.error(`[voucher-import] AI image extraction error status=${status ?? "?"} message=${message ?? String(err)}`);
    warnings.push("AI extraction failed — please fill in details manually.");
    return resolveAndBuildResult({}, warnings, true);
  }
}

export async function extractVoucherFromText(
  pdfText: string,
): Promise<ExtractResult> {
  const warnings: string[] = [];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1024,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract the booking data from this voucher text:\n\n${pdfText.slice(0, 8000)}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const { data: extracted, parseFailed } = parseExtractionJson(raw, warnings);
    return resolveAndBuildResult(extracted, warnings, parseFailed);
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    const message = (err as { message?: string })?.message;
    console.error(`[voucher-import] AI text extraction error status=${status ?? "?"} message=${message ?? String(err)}`);
    warnings.push("AI extraction failed — please fill in details manually.");
    return resolveAndBuildResult({}, warnings, true);
  }
}

function parseExtractionJson(
  raw: string,
  warnings: string[],
): { data: ExtractedVoucherData; parseFailed: boolean } {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      warnings.push(
        "Could not parse AI response — please fill in details manually.",
      );
      return { data: {}, parseFailed: true };
    }
    const data = JSON.parse(jsonMatch[0]) as ExtractedVoucherData;
    const hasAnyValue = Object.values(data).some((v) => v != null && v !== "");
    if (!hasAnyValue) {
      warnings.push(
        "AI returned empty extraction — please fill in details manually.",
      );
      return { data: {}, parseFailed: true };
    }
    return { data, parseFailed: false };
  } catch {
    warnings.push(
      "Could not parse AI response — please fill in details manually.",
    );
    return { data: {}, parseFailed: true };
  }
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
): Promise<string> {
  const locRows = await db
    .select({ reservationCodePrefix: locationTable.reservationCodePrefix })
    .from(locationTable)
    .where(eq(locationTable.id, pickupLocationId))
    .limit(1);

  const prefix = locRows[0]?.reservationCodePrefix;
  if (!prefix) {
    throw new ValidationError(
      "Pickup location has no reservation code prefix configured.",
    );
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
    paymentStatus: data.paymentStatus ?? "PREPAID",
    reservationCode,
    externalReservationCode: data.externalReservationCode,
    voucherImportRef: data.voucherImportRef,
  });

  logAudit({
    actorId,
    entityType: "booking",
    entityId: booking.id,
    entityRef: reservationCode,
    action: "voucher_import",
    summary: `Voucher imported → reservation code ${reservationCode}`,
    afterData: {
      bookingId: booking.id,
      reservationCode,
      externalReservationCode: data.externalReservationCode ?? null,
      voucherImportRef: data.voucherImportRef ?? null,
      contactFullName: data.contactFullName,
      extractedDraft: extractedDraft ?? null,
    },
  });

  return { booking, reservationCode };
}
