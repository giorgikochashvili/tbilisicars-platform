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
    }) + " (Tbilisi)";
  } catch { return iso; }
}

function fmtMoney(n: number, cur: string): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}


function trunc(s: string, max = 55): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
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
  currency?: string;
  generatedPassword?: string | null;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateBookingVoucherPdf(params: VoucherParams): Promise<Buffer> {
  const {
    toName, toEmail, reference, vehicle,
    pickupLocation, dropoffLocation, pickupDatetime, dropoffDatetime,
    extras = [], insurancePlan, paymentMethod,
    flightNumber, nationality, age,
    estimatedTotal, baseTotal, oneWayFee, promoCode, discountAmount,
    currency = "GEL",
    generatedPassword,
  } = params;

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
  page.drawText("Premium Car Rental \u00B7 Georgia", {
    x: MARGIN, y: PAGE_H - 72, size: 8.5, font, color: rgb(0.5, 0.6, 0.7),
  });

  y = PAGE_H - HEADER_H - 18;

  // ── Reference block ──────────────────────────────────────────────────────────
  const refH = 54;
  page.drawRectangle({ x: MARGIN, y: y - refH, width: CW, height: refH, color: C.refBg });
  page.drawRectangle({ x: MARGIN, y: y - refH, width: CW, height: refH,
    borderColor: C.accentRed, borderWidth: 0.8 });

  page.drawText("BOOKING REFERENCE", {
    x: MARGIN + 12, y: y - 16, size: 7.5, font, color: C.muted,
  });
  page.drawText(reference, {
    x: MARGIN + 12, y: y - 36, size: 17, font: fontBold, color: C.accentLite,
  });
  page.drawText("Status: Pending Confirmation", {
    x: MARGIN + CW - 148, y: y - 28, size: 8.5, font: fontBold, color: C.amber,
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
  row("Pickup Location", pickupLocation);
  row("Drop-off Location", dropoffLocation);
  row("Pickup Date & Time", fmtDT(pickupDatetime));
  row("Return Date & Time", fmtDT(dropoffDatetime));
  row("Duration", `${days} ${days === 1 ? "day" : "days"}`);
  if (flightNumber) row("Flight Number", flightNumber);
  y -= GAP;

  // ── Insurance ────────────────────────────────────────────────────────────────
  if (insurancePlan) {
    sectionHeader("INSURANCE");
    row("Plan", `${insurancePlan} Cover`);
    y -= GAP;
  }

  // ── Pricing ──────────────────────────────────────────────────────────────────
  if (estimatedTotal != null) {
    sectionHeader("PRICING ESTIMATE");
    if (baseTotal != null) {
      row(`Base rate (${days} ${days === 1 ? "day" : "days"})`, fmtMoney(baseTotal, currency));
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
    if (promoCode && discountAmount != null && discountAmount > 0) {
      row(`Promo (${promoCode})`, `-${fmtMoney(discountAmount, currency)}`);
    }
    page.drawLine({
      start: { x: MARGIN, y: y + ROW_H - 2 }, end: { x: MARGIN + CW, y: y + ROW_H - 2 },
      thickness: 0.4, color: C.border,
    });
    page.drawText("ESTIMATED TOTAL", { x: MARGIN, y, size: 9, font: fontBold, color: C.dark });
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

  // ── Account block (new accounts only) ────────────────────────────────────────
  if (generatedPassword != null && generatedPassword !== "") {
    const acctH = 90;
    const boxY = Math.max(y - acctH, 50); // never clip below footer
    page.drawRectangle({ x: MARGIN, y: boxY, width: CW, height: acctH, color: C.lightBg });
    page.drawRectangle({ x: MARGIN, y: boxY, width: CW, height: acctH,
      borderColor: C.border, borderWidth: 0.8 });
    page.drawRectangle({ x: MARGIN, y: boxY, width: 4, height: acctH, color: C.accentLite });

    const by = boxY + acctH; // top of box
    page.drawText("YOUR ACCOUNT", {
      x: MARGIN + 14, y: by - 16, size: 8, font: fontBold, color: C.dark,
    });
    page.drawText("Use these credentials to access your personal booking cabinet:", {
      x: MARGIN + 14, y: by - 30, size: 8.5, font, color: C.muted,
    });
    page.drawText("Email:", { x: MARGIN + 14, y: by - 46, size: 9, font: fontBold, color: C.muted });
    page.drawText(trunc(toEmail, 52), { x: MARGIN + 62, y: by - 46, size: 9, font, color: C.dark });
    page.drawText("Password:", { x: MARGIN + 14, y: by - 62, size: 9, font: fontBold, color: C.muted });
    page.drawText(generatedPassword, {
      x: MARGIN + 62, y: by - 62, size: 10, font: fontBold, color: C.accentLite,
    });
    page.drawText("You can change your password from your cabinet.", {
      x: MARGIN + 14, y: by - 78, size: 8, font, color: C.muted,
    });
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y: 28 }, end: { x: MARGIN + CW, y: 28 },
    thickness: 0.4, color: C.border,
  });
  page.drawText(
    "\u00A9 2026 Tbilisicars \u00B7 reservations@tbilisicars.com \u00B7 +995 557 37 63 63",
    { x: MARGIN, y: 14, size: 7.5, font, color: C.muted },
  );

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
