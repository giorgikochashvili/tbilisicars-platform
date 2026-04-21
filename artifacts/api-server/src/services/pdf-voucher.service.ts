/**
 * PDF Voucher generator for booking confirmations.
 * Uses pdf-lib (pure-JS, no native binary dependencies).
 * Returns a Buffer containing the complete PDF bytes.
 * All errors are re-thrown so the caller can suppress them non-fatally.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { EmailExtra } from "./email.service.js";
import { calculateChargeableDays } from "../lib/pricing.js";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  headerBg:   rgb(0.051, 0.106, 0.165),   // #0d1b2a
  accentRed:  rgb(0.498, 0.114, 0.180),   // #7f1d2e
  accentLite: rgb(0.878, 0.361, 0.447),   // #e05c72
  white:      rgb(1,     1,     1),
  dark:       rgb(0.133, 0.196, 0.275),   // #223244
  muted:      rgb(0.392, 0.455, 0.545),   // #64748b
  border:     rgb(0.882, 0.906, 0.937),   // #e1e7ef
  lightBg:    rgb(0.976, 0.980, 0.988),   // #f9fafb
  refBg:      rgb(0.945, 0.929, 0.929),   // near-white with warm tint
  amber:      rgb(0.969, 0.757, 0.176),   // #f7c12d
} as const;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN  = 48;
const CW      = PAGE_W - MARGIN * 2;        // content width
const HEADER_H = 88;
const ROW_H    = 19;
const GAP      = 12;

// ── Local helpers ─────────────────────────────────────────────────────────────
function fmtDT(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tbilisi",
    });
  } catch { return iso; }
}

function fmtMoney(n: number, cur: string): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

function trunc(s: string, max = 55): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Convert TC-00316 → #316 for customer-facing display only. */
function customerRef(ref: string): string {
  const m = ref.match(/TC-0*(\d+)/i);
  return m ? `#${m[1]}` : ref;
}

/**
 * Remove internal system-generated note blocks from combined booking notes
 * before rendering customer-facing output. Strips paragraphs that begin with
 * [WEBSITE DATA] or [RATE EXPIRED — these are staff-only blocks that must
 * never appear in customer-facing documents.
 */
function stripInternalBlocks(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const clean = notes
    .split(/\n\n+/)
    .filter(p => {
      const t = p.trimStart();
      return !t.startsWith("[WEBSITE DATA]") && !t.startsWith("[RATE EXPIRED");
    })
    .join("\n\n")
    .trim();
  return clean || null;
}

/** Wrap text to lines of at most `maxChars` characters, breaking on spaces. */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!word) continue;
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ── Param type ────────────────────────────────────────────────────────────────
export interface VoucherParams {
  toName: string;
  toEmail: string;
  reference: string;
  vehicle: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  extras?: EmailExtra[];
  insurancePlan?: string;
  paymentMethod?: string;
  flightNumber?: string;
  nationality?: string;
  age?: string;
  estimatedTotal?: number | null;
  baseTotal?: number | null;
  oneWayFee?: number | null;
  promoCode?: string;
  discountAmount?: number | null;
  websiteDiscountName?: string | null;
  websiteDiscountAmount?: number | null;
  originalRentalPrice?: number | null;
  discountedRentalPrice?: number | null;
  currency?: string;
  generatedPassword?: string | null;
  bookingStatus?: string;
  paymentStatus?: string;
  bookingNotes?: string | null;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateBookingVoucherPdf(params: VoucherParams): Promise<Buffer> {
  const {
    toName, toEmail, reference, vehicle,
    pickupLocation, dropoffLocation, pickupDatetime, dropoffDatetime,
    extras = [], insurancePlan, paymentMethod,
    flightNumber, nationality, age,
    estimatedTotal, baseTotal, oneWayFee, promoCode, discountAmount,
    websiteDiscountName, websiteDiscountAmount,
    originalRentalPrice,
    currency = "GEL",
    generatedPassword,
    bookingStatus = "PENDING",
    paymentStatus = "UNPAID",
    bookingNotes,
  } = params;

  const bookingStatusDisplay = capitalize(bookingStatus);
  const paymentStatusDisplay = capitalize(paymentStatus);

  const days = calculateChargeableDays(new Date(pickupDatetime), new Date(dropoffDatetime));

  const pdfDoc  = await PDFDocument.create();
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page     = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // current Y cursor (decrements as we add content)
  let y = PAGE_H;

  // ── Header ──────────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: PAGE_W, height: HEADER_H, color: C.headerBg });
  page.drawRectangle({ x: 0, y: PAGE_H - HEADER_H, width: 5, height: HEADER_H, color: C.accentRed });

  page.drawText("Tbilisicars", {
    x: MARGIN, y: PAGE_H - 38, size: 22, font: fontBold, color: C.white,
  });
  page.drawText("BOOKING VOUCHER", {
    x: MARGIN, y: PAGE_H - 56, size: 8.5, font, color: rgb(0.6, 0.7, 0.8),
  });
  page.drawText("Tbilisicars.com \u00B7 Car Rental Georgia", {
    x: MARGIN, y: PAGE_H - 72, size: 8.5, font, color: rgb(0.5, 0.6, 0.7),
  });

  y = PAGE_H - HEADER_H - 18;

  // ── Reference block (taller to fit two status rows) ───────────────────────
  const refH = 70;
  page.drawRectangle({ x: MARGIN, y: y - refH, width: CW, height: refH, color: C.refBg });
  page.drawRectangle({ x: MARGIN, y: y - refH, width: CW, height: refH,
    borderColor: C.accentRed, borderWidth: 0.8 });

  // Left: label + reference number
  page.drawText("BOOKING REFERENCE", {
    x: MARGIN + 12, y: y - 16, size: 7.5, font, color: C.muted,
  });
  page.drawText(customerRef(reference), {
    x: MARGIN + 12, y: y - 40, size: 17, font: fontBold, color: C.accentLite,
  });

  // Right: two separate status lines
  const statusX = MARGIN + CW - 145;
  const bookingStatusColor = bookingStatus.toUpperCase() === "CONFIRMED"
    ? rgb(0.133, 0.773, 0.369)  // green for confirmed
    : C.amber;
  page.drawText(`Booking Status: ${bookingStatusDisplay}`, {
    x: statusX, y: y - 24, size: 8, font: fontBold, color: bookingStatusColor,
  });
  page.drawText(`Payment Status: ${paymentStatusDisplay}`, {
    x: statusX, y: y - 40, size: 8, font, color: C.muted,
  });

  y -= refH + GAP + 6;

  // ── Drawing helpers ──────────────────────────────────────────────────────────
  function sectionHeader(title: string) {
    page.drawText(title, { x: MARGIN, y, size: 7.5, font: fontBold, color: C.muted });
    page.drawLine({
      start: { x: MARGIN, y: y - 5 },
      end:   { x: MARGIN + CW, y: y - 5 },
      thickness: 0.4, color: C.border,
    });
    y -= 15;
  }

  function row(label: string, value: string, valueBold = false) {
    page.drawText(trunc(label, 32), { x: MARGIN, y, size: 9, font, color: C.muted });
    page.drawText(trunc(value, 42), {
      x: MARGIN + 152, y, size: 9,
      font: valueBold ? fontBold : font, color: C.dark,
    });
    y -= ROW_H;
  }

  // ── Trip Details ─────────────────────────────────────────────────────────────
  sectionHeader("TRIP DETAILS");
  row("Vehicle", vehicle);
  row("Pick-up Location", pickupLocation);
  row("Drop-off Location", dropoffLocation);
  row("Pick-up Date & Time", fmtDT(pickupDatetime));
  row("Return Date & Time", fmtDT(dropoffDatetime));
  row("Duration", `${days} ${days === 1 ? "day" : "days"}`);
  if (flightNumber) row("Flight Number", flightNumber);
  y -= GAP;

  // ── Insurance ────────────────────────────────────────────────────────────────
  if (insurancePlan) {
    sectionHeader("INSURANCE");
    row("Plan", `${insurancePlan} Insurance`);
    y -= GAP;
  }

  // ── Pricing ──────────────────────────────────────────────────────────────────
  // When a website discount applies, use the snapshot-backed originalRentalPrice
  // for the base-rate line so the PDF reflects the exact amount at booking time.
  const effectivePdfBaseRate = (websiteDiscountName && originalRentalPrice != null) ? originalRentalPrice : baseTotal;
  if (estimatedTotal != null) {
    sectionHeader("PRICING SUMMARY");
    if (effectivePdfBaseRate != null) {
      row(`Base rate (${days} ${days === 1 ? "day" : "days"})`, fmtMoney(effectivePdfBaseRate, currency));
    }
    for (const ex of extras) {
      const billableDays = ex.pricingType === "per_trip"
        ? 1
        : (ex.maxDays != null && ex.maxDays > 0 ? Math.min(days, ex.maxDays) : days);
      const total = ex.pricePerUnit * ex.quantity * billableDays;
      row(`${ex.name}${ex.quantity > 1 ? ` \u00D7${ex.quantity}` : ""}`, fmtMoney(total, currency));
    }
    if (oneWayFee != null && oneWayFee > 0) {
      row("One-way transfer fee", fmtMoney(oneWayFee, currency));
    }
    if (websiteDiscountName && websiteDiscountAmount != null && websiteDiscountAmount > 0) {
      row("Discount", `-${fmtMoney(websiteDiscountAmount, currency)}`);
    }
    if (promoCode && discountAmount != null && discountAmount > 0) {
      row("Promo discount", `-${fmtMoney(discountAmount, currency)}`);
    }
    page.drawLine({
      start: { x: MARGIN, y: y + ROW_H - 2 }, end: { x: MARGIN + CW, y: y + ROW_H - 2 },
      thickness: 0.4, color: C.border,
    });
    page.drawText("TOTAL AMOUNT", { x: MARGIN, y, size: 9, font: fontBold, color: C.dark });
    page.drawText(fmtMoney(estimatedTotal, currency), {
      x: MARGIN + 152, y, size: 10, font: fontBold, color: C.accentLite,
    });
    y -= ROW_H;
    page.drawText("Final pricing confirmed before any charge.", {
      x: MARGIN, y, size: 7.5, font, color: C.muted,
    });
    y -= ROW_H + GAP;
  } else if (extras.length > 0) {
    sectionHeader("ADD-ONS & EXTRAS");
    for (const ex of extras) {
      const billableDays = ex.pricingType === "per_trip"
        ? 1
        : (ex.maxDays != null && ex.maxDays > 0 ? Math.min(days, ex.maxDays) : days);
      const total = ex.pricePerUnit * ex.quantity * billableDays;
      row(`${ex.name}${ex.quantity > 1 ? ` \u00D7${ex.quantity}` : ""}`, fmtMoney(total, currency));
    }
    y -= GAP;
  }

  // ── Customer Details ─────────────────────────────────────────────────────────
  sectionHeader("CUSTOMER DETAILS");
  row("Name", toName);
  row("Email", toEmail);
  if (nationality) row("Nationality", nationality);
  if (age) row("Age", age);
  if (paymentMethod) row("Payment Method", paymentMethod);
  y -= GAP;

  // ── Booking Notes (customer-facing portion only) ─────────────────────────────
  // stripInternalBlocks removes [WEBSITE DATA] and [RATE EXPIRED] paragraphs
  // so internal staff blocks never appear in the customer-facing PDF.
  const trimmedNotes = stripInternalBlocks(bookingNotes);
  if (trimmedNotes) {
    sectionHeader("BOOKING NOTES");
    const noteLines = wrapText(trimmedNotes, 72);
    for (const line of noteLines) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: C.dark });
      y -= ROW_H;
    }
    y -= GAP;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y: 28 }, end: { x: MARGIN + CW, y: 28 },
    thickness: 0.4, color: C.border,
  });
  page.drawText(
    "\u00A9 2026 Tbilisicars \u00B7 reservations@tbilisicars.com \u00B7 Tbilisi/Batumi: +995 557 37 63 63 \u00B7 Kutaisi: +995 595 28 66 00",
    { x: MARGIN, y: 14, size: 7, font, color: C.muted },
  );

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
