import { db, bookingTable, locationTable, reservationCodeSequenceTable } from "@workspace/db";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { createAdminBooking } from "./admin-bookings.service.js";
import { logAudit } from "./audit.service.js";
import { ValidationError } from "../lib/errors.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExtractedVoucherData {
  contactFullName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  pickupLocationHint?: string | null;
  dropoffLocationHint?: string | null;
  pickupDatetime?: string | null;
  dropoffDatetime?: string | null;
  vehicleModelHint?: string | null;
  totalAmount?: string | null;
  currency?: string | null;
  externalReservationCode?: string | null;
  notes?: string | null;
  broker?: string | null;
}

// Fields that are required for the confirm step — used to populate unresolvedFields[]
const REQUIRED_FIELDS: Array<keyof ExtractedVoucherData> = [
  "contactFullName",
  "pickupLocationHint",
  "dropoffLocationHint",
  "pickupDatetime",
  "dropoffDatetime",
];

export interface ExtractResult {
  extracted: ExtractedVoucherData;
  warnings: string[];
  extractionFailed: boolean;
  unresolvedFields: string[];
}

// ─── AI Extraction ─────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a car rental voucher data extractor.
Extract booking information from the provided voucher (image or text) and return ONLY valid JSON.

Return a JSON object with these fields (all optional/nullable):
- contactFullName: string — customer's full name
- contactEmail: string — customer email
- contactPhone: string — customer phone number
- pickupLocationHint: string — pickup city or location name as written on voucher
- dropoffLocationHint: string — dropoff city or location name (if different, else same as pickup)
- pickupDatetime: string — ISO 8601 datetime if determinable (YYYY-MM-DDTHH:mm:00)
- dropoffDatetime: string — ISO 8601 datetime if determinable
- vehicleModelHint: string — car model or category
- totalAmount: string — numeric total amount as string
- currency: string — 3-letter currency code (e.g. GEL, USD, EUR)
- externalReservationCode: string — voucher/booking reference from the document
- notes: string — any other relevant info
- broker: string — travel agency or broker name if present

Rules:
- Return null for any field you cannot determine
- For dates, use the year as printed; if year is ambiguous, omit
- Do NOT invent data — only extract what is clearly visible
- Return ONLY the JSON object, no markdown, no explanation`;

function computeUnresolvedFields(extracted: ExtractedVoucherData): string[] {
  return REQUIRED_FIELDS.filter((f) => !extracted[f]);
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
            { type: "text", text: "Extract the booking data from this voucher image." },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const extracted = parseExtractionJson(raw, warnings);
    return {
      extracted,
      warnings,
      extractionFailed: false,
      unresolvedFields: computeUnresolvedFields(extracted),
    };
  } catch (err) {
    console.error("[voucher-import] AI image extraction error:", err);
    warnings.push("AI extraction failed — please fill in details manually.");
    return {
      extracted: {},
      warnings,
      extractionFailed: true,
      unresolvedFields: REQUIRED_FIELDS as string[],
    };
  }
}

export async function extractVoucherFromText(pdfText: string): Promise<ExtractResult> {
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
    const extracted = parseExtractionJson(raw, warnings);
    return {
      extracted,
      warnings,
      extractionFailed: false,
      unresolvedFields: computeUnresolvedFields(extracted),
    };
  } catch (err) {
    console.error("[voucher-import] AI text extraction error:", err);
    warnings.push("AI extraction failed — please fill in details manually.");
    return {
      extracted: {},
      warnings,
      extractionFailed: true,
      unresolvedFields: REQUIRED_FIELDS as string[],
    };
  }
}

function parseExtractionJson(raw: string, warnings: string[]): ExtractedVoucherData {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      warnings.push("Could not parse AI response — please fill in details manually.");
      return {};
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed as ExtractedVoucherData;
  } catch {
    warnings.push("Could not parse AI response — please fill in details manually.");
    return {};
  }
}

// ─── Duplicate Check ───────────────────────────────────────────────────────────

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingBookingId?: number;
  matchedOn?: string;
}

export async function checkVoucherDuplicate(params: {
  externalReservationCode?: string | null;
  voucherImportRef?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  pickupDatetime?: string | null;
  pickupLocationId?: number | null;
}): Promise<DuplicateCheckResult> {
  const { externalReservationCode, voucherImportRef, contactPhone, contactEmail, pickupDatetime, pickupLocationId } = params;

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
      return { isDuplicate: true, existingBookingId: rows[0].id, matchedOn: "externalReservationCode" };
    }
  }

  // 2. Voucher import ref match (file identity)
  if (voucherImportRef) {
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
      return { isDuplicate: true, existingBookingId: rows[0].id, matchedOn: "voucherImportRef" };
    }
  }

  // 3. Soft check: same phone/email + same pickup location + same pickup day (±1 hour window)
  if (pickupDatetime && pickupLocationId && (contactPhone || contactEmail)) {
    const pickupDate = new Date(pickupDatetime);
    const windowStart = new Date(pickupDate.getTime() - 60 * 60 * 1000);
    const windowEnd = new Date(pickupDate.getTime() + 60 * 60 * 1000);

    const contactConditions = [];
    if (contactPhone) contactConditions.push(eq(bookingTable.contactPhone, contactPhone));
    if (contactEmail) contactConditions.push(eq(bookingTable.contactEmail, contactEmail));

    const rows = await db
      .select({ id: bookingTable.id })
      .from(bookingTable)
      .where(
        and(
          or(...contactConditions)!,
          eq(bookingTable.pickupLocationId, pickupLocationId),
          gte(bookingTable.pickupDatetime, windowStart),
          lte(bookingTable.pickupDatetime, windowEnd),
          isNull(bookingTable.deletedAt),
        ),
      )
      .limit(1);

    if (rows[0]) {
      return { isDuplicate: true, existingBookingId: rows[0].id, matchedOn: "contactAndPickupTime" };
    }
  }

  return { isDuplicate: false };
}

// ─── Reservation Code Generation ───────────────────────────────────────────────
// Format: PREFIX + sequence number (e.g. TBS8001) — no separator

export async function generateReservationCode(pickupLocationId: number): Promise<string> {
  const locRows = await db
    .select({ reservationCodePrefix: locationTable.reservationCodePrefix })
    .from(locationTable)
    .where(eq(locationTable.id, pickupLocationId))
    .limit(1);

  const prefix = locRows[0]?.reservationCodePrefix;
  if (!prefix) {
    throw new ValidationError(
      `Pickup location (id=${pickupLocationId}) has no reservation code prefix configured. ` +
        `Please set a prefix in Locations settings before importing.`,
    );
  }

  return await db.transaction(async (tx) => {
    const seqRows = await tx
      .select({ nextVal: reservationCodeSequenceTable.nextVal })
      .from(reservationCodeSequenceTable)
      .where(eq(reservationCodeSequenceTable.prefix, prefix))
      .for("update");

    let nextVal: number;

    if (seqRows.length === 0) {
      await tx.insert(reservationCodeSequenceTable).values({ prefix, nextVal: 8002 });
      nextVal = 8001;
    } else {
      nextVal = seqRows[0]!.nextVal;
      await tx
        .update(reservationCodeSequenceTable)
        .set({ nextVal: nextVal + 1 })
        .where(eq(reservationCodeSequenceTable.prefix, prefix));
    }

    return `${prefix}${nextVal}`;
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
  vehicleModelId?: number | null;
  totalAmount?: string | null;
  currency?: string | null;
  notes?: string | null;
  broker?: string | null;
  externalReservationCode?: string | null;
  voucherImportRef?: string | null;
  status?: "PENDING" | "CONFIRMED" | "DELIVERED" | "RETURNED" | "CANCELED" | "NO_SHOW";
  paymentStatus?: "UNPAID" | "HALF" | "PAID" | "PREPAID" | "REFUNDED";
}

export async function confirmVoucherImport(
  data: ConfirmVoucherImportData,
  actorId: number,
) {
  const reservationCode = await generateReservationCode(data.pickupLocationId);

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
    notes: data.notes,
    broker: data.broker,
    source: "voucher",
    status: data.status ?? "CONFIRMED",
    paymentStatus: data.paymentStatus ?? "PREPAID",
    reservationCode,
    externalReservationCode: data.externalReservationCode,
    voucherImportRef: data.voucherImportRef,
  } as any);

  logAudit({
    actorId,
    entityType: "booking",
    entityId: booking.id,
    entityRef: reservationCode,
    action: "voucher_import",
    summary: `Voucher imported → reservation code ${reservationCode}`,
    afterData: {
      reservationCode,
      externalReservationCode: data.externalReservationCode ?? null,
      voucherImportRef: data.voucherImportRef ?? null,
      contactFullName: data.contactFullName,
    },
  });

  return { booking, reservationCode };
}
