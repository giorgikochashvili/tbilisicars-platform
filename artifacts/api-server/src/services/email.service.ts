/**
 * Email service using Resend.
 * Sends booking confirmation emails non-blockingly.
 * If RESEND_API_KEY is not set, the email is skipped and logged.
 */
import { Resend } from "resend";
import { generateBookingVoucherPdf } from "./pdf-voucher.service.js";
import { calculateChargeableDays } from "../lib/pricing.js";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDT(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tbilisi",
    });
  } catch {
    return iso;
  }
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

const CITY_PICKUP_INSTRUCTIONS: Record<string, string> = {
  Tbilisi: "Our team will meet you at Tbilisi International Airport arrivals. Look for the Tbilisicars sign. Call +995 557 37 63 63 if you need assistance.",
  Kutaisi: "Our agent will meet you at Kutaisi International Airport arrivals. Call +995 595 28 66 00 on arrival.",
  Batumi: "Our team will meet you at Batumi International Airport arrivals. Look for the Tbilisicars sign. Call +995 557 37 63 63 if you need assistance.",
};

function getPickupInstructions(city?: string): string {
  if (!city) return "Our team will contact you shortly to confirm pick-up details.";
  return CITY_PICKUP_INSTRUCTIONS[city] ?? "Our team will contact you shortly to confirm pick-up details.";
}

function paymentMethodNote(method: string): string {
  const lower = method.toLowerCase();
  if (lower.includes("arrival")) return "Payment will be made at pick-up — cash or card accepted on site.";
  if (lower.includes("card")) return "Card payment — our team will follow up to process the payment.";
  if (lower.includes("transfer") || lower.includes("bank")) return "Bank transfer — please complete the transfer before your pick-up date.";
  return method;
}

export interface EmailExtra {
  name: string;
  quantity: number;
  pricePerUnit: number;
  pricingType: "per_day" | "per_trip" | string;
  maxDays?: number | null;
}

export interface BookingConfirmationEmailParams {
  toEmail: string;
  toName: string;
  reference: string;
  bookingId?: number;
  vehicleImageUrl?: string | null;
  vehicle: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  pickupCity?: string;
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
  attachPdfVoucher?: boolean;
  bookingStatus?: string;
  paymentStatus?: string;
  bookingNotes?: string | null;
}

export async function sendBookingConfirmationEmail(params: BookingConfirmationEmailParams): Promise<void> {
  const {
    toEmail, toName, reference, bookingId,
    vehicleImageUrl,
    vehicle,
    pickupLocation, dropoffLocation,
    pickupDatetime, dropoffDatetime,
    pickupCity,
    extras = [],
    insurancePlan, paymentMethod, flightNumber,
    nationality, age,
    estimatedTotal, baseTotal, oneWayFee, promoCode, discountAmount,
    websiteDiscountName, websiteDiscountAmount,
    originalRentalPrice, discountedRentalPrice,
    currency = "GEL",
    generatedPassword,
    attachPdfVoucher = false,
    bookingStatus = "PENDING",
    paymentStatus = "UNPAID",
    bookingNotes,
  } = params;

  console.log(`[email] preparing ref=${reference} bookingId=${bookingId ?? "?"} to=${toEmail}`);

  const resend = getResend();
  if (!resend) {
    console.log(`[email] skipped_no_api_key ref=${reference}`);
    return;
  }

  const bookingStatusDisplay = capitalize(bookingStatus);
  const paymentStatusDisplay = capitalize(paymentStatus);

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "reservations@tbilisicars.com";
  const days = calculateChargeableDays(new Date(pickupDatetime), new Date(dropoffDatetime));
  const pickupInstructions = getPickupInstructions(pickupCity);
  const fmt = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  function extraLineTotal(ex: EmailExtra): number {
    if (ex.pricingType === "per_trip") {
      return ex.pricePerUnit * ex.quantity;
    }
    const billableDays =
      ex.maxDays != null && ex.maxDays > 0 ? Math.min(days, ex.maxDays) : days;
    return ex.pricePerUnit * ex.quantity * billableDays;
  }

  function extraHtmlRow(ex: EmailExtra): string {
    const lineTotal = extraLineTotal(ex);
    const label = `${esc(ex.name)}${ex.quantity > 1 ? ` &times;${ex.quantity}` : ""}`;
    return `<tr><td style="padding:7px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.06);">${label}</td><td style="padding:7px 0;font-size:13px;color:#e2e8f0;font-weight:500;text-align:right;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.06);">${fmt(lineTotal)}</td></tr>`;
  }

  function extraTextLine(ex: EmailExtra): string {
    const lineTotal = extraLineTotal(ex);
    return `  \u2022 ${ex.name}${ex.quantity > 1 ? ` \u00D7${ex.quantity}` : ""}: ${fmt(lineTotal)}`;
  }

  // ── HTML sections ──────────────────────────────────────────────────────────
  // Use snapshot-backed rental amounts when available so historical emails
  // reflect the pricing at the time of booking, not recomputed live rates.
  const effectiveBaseRate = (websiteDiscountName && originalRentalPrice != null) ? originalRentalPrice : baseTotal;
  const pricingSection = estimatedTotal != null ? `
        <div class="pricing-section">
          <div class="section-title">Pricing Summary</div>
          <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
            ${effectiveBaseRate != null ? `<tr><td style="padding:7px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.06);">Base rate (${days} ${days === 1 ? "day" : "days"})</td><td style="padding:7px 0;font-size:13px;color:#e2e8f0;font-weight:500;text-align:right;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.06);">${fmt(effectiveBaseRate)}</td></tr>` : ""}
            ${extras.map(extraHtmlRow).join("")}
            ${oneWayFee != null && oneWayFee > 0 ? `<tr><td style="padding:7px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid rgba(255,255,255,0.06);">One-way transfer fee</td><td style="padding:7px 0;font-size:13px;color:#e2e8f0;font-weight:500;text-align:right;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.06);">${fmt(oneWayFee)}</td></tr>` : ""}
            ${websiteDiscountName && websiteDiscountAmount != null && websiteDiscountAmount > 0 ? `<tr><td style="padding:7px 0;font-size:13px;color:#22c55e;border-bottom:1px solid rgba(255,255,255,0.06);">Discount</td><td style="padding:7px 0;font-size:13px;color:#22c55e;font-weight:600;text-align:right;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.06);">&minus;${fmt(websiteDiscountAmount)}</td></tr>` : ""}
            ${promoCode && discountAmount != null && discountAmount > 0 ? `<tr><td style="padding:7px 0;font-size:13px;color:#22c55e;border-bottom:1px solid rgba(255,255,255,0.06);">Promo discount</td><td style="padding:7px 0;font-size:13px;color:#22c55e;font-weight:600;text-align:right;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,0.06);">&minus;${fmt(discountAmount)}</td></tr>` : ""}
            <tr>
              <td style="padding:10px 0 2px;font-size:14px;font-weight:600;color:#e2e8f0;border-top:1px solid #1e3a5f;">Total Amount</td>
              <td style="padding:10px 0 2px;font-size:16px;font-weight:800;color:#f1f5f9;text-align:right;white-space:nowrap;border-top:1px solid #1e3a5f;">${fmt(estimatedTotal)}</td>
            </tr>
          </table>
          <p style="margin: 10px 0 0; font-size: 12px; color: #64748b;">Final pricing is confirmed before any charge is made.</p>
        </div>` : "";

  const extrasOnlySection = estimatedTotal == null && extras.length > 0 ? `
        <div class="section">
          <div class="section-title">Add-ons &amp; Extras</div>
          <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
            ${extras.map(extraHtmlRow).join("")}
          </table>
        </div>` : "";

  // ── Meta strip: horizontal row of supplementary booking details ─────────────
  // Each item is a <td> cell; Duration is always shown, others are conditional.
  // border-right is applied to all except the last cell.
  const metaItems: Array<{ label: string; value: string }> = [
    { label: "Duration", value: `${days} ${days === 1 ? "day" : "days"}` },
    ...(insurancePlan ? [{ label: "Insurance", value: `${esc(insurancePlan)} Insurance` }] : []),
    ...(flightNumber  ? [{ label: "Flight No.", value: esc(flightNumber) }] : []),
    ...((nationality || age) ? [{
      label: "Driver",
      value: [nationality && esc(nationality), age && `Age ${esc(age)}`].filter(Boolean).join(" \u00B7 "),
    }] : []),
  ];
  const metaCellsHtml = metaItems.map((item, i) => {
    const borderRight = i < metaItems.length - 1 ? "border-right:1px solid #1e3a5f;" : "";
    return `<td style="padding:10px 14px;vertical-align:top;${borderRight}"><div class="meta-label">${item.label}</div><div class="meta-value">${item.value}</div></td>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmation \u2014 ${esc(customerRef(reference))}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0d1b2a; font-family: 'Segoe UI', Arial, sans-serif; color: #e2e8f0; }
    .wrapper { max-width: 640px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #132033; border: 1px solid #1e3a5f; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #0d1b2a 0%, #132033 100%); border-left: 5px solid #7f1d2e; padding: 18px 28px; }
    .body { padding: 24px 28px; }
    .greeting { font-size: 14px; color: #94a3b8; margin: 0 0 20px; line-height: 1.6; }
    .ref-block { background: rgba(19,32,51,0.9); border: 1px solid #1e3a5f; border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 20px; }
    .ref-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 4px; }
    .ref-value { font-size: 28px; font-weight: 800; color: #e05c72; letter-spacing: 2px; }
    .status-row { display: flex; justify-content: center; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
    .status-badge { display: inline-block; background: rgba(234,179,8,0.15); border: 1px solid rgba(234,179,8,0.3); color: #fbbf24; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .status-badge-gray { display: inline-block; background: rgba(148,163,184,0.1); border: 1px solid rgba(148,163,184,0.25); color: #94a3b8; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .dates-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 5px; }
    .dates-location { font-size: 13px; font-weight: 600; color: #e2e8f0; margin-bottom: 3px; }
    .dates-time { font-size: 12px; color: #94a3b8; }
    .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px; }
    .meta-value { font-size: 13px; color: #e2e8f0; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #64748b; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #1e3a5f; }
    .row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px solid #1a2f4a; font-size: 14px; gap: 12px; }
    .row:last-child { border-bottom: none; }
    .row .label { color: #94a3b8; }
    .row .value { color: #e2e8f0; font-weight: 500; text-align: right; flex-shrink: 0; }
    .pricing-section { background: rgba(19,32,51,0.8); border: 1px solid #1e3a5f; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
    .pricing-section .section-title { border-color: #1e3a5f; }
    .info-block { margin-bottom: 20px; }
    .info-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 6px; }
    .info-text { font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0; }
    .contact-block { border-top: 1px solid #1e3a5f; padding-top: 16px; margin-top: 4px; }
    .contact-block p { margin: 0 0 6px; font-size: 13px; color: #64748b; }
    .contact-block a { color: #94a3b8; text-decoration: none; }
    .footer { text-align: center; padding: 16px 28px 20px; font-size: 12px; color: #475569; }
    .footer a { color: #64748b; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
          <tr>
            <td style="vertical-align:middle;width:76px;">
              <img src="https://tbilisicars.com/tbilisicars-logo.png" alt="Tbilisicars" width="76" style="display:block;max-width:76px;height:auto;" />
            </td>
            <td style="vertical-align:middle;padding-left:14px;">
              <div style="font-size:17px;font-weight:700;color:#fff;letter-spacing:-0.3px;line-height:1.2;">Tbilisicars</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.55);margin-top:3px;letter-spacing:0.3px;">Car Rental Georgia</div>
            </td>
          </tr>
        </table>
      </div>
      <div class="body">
        <p class="greeting">Dear ${esc(toName)},<br/>Thank you for choosing Tbilisicars. We have received your booking request and will confirm availability shortly.</p>

        <div class="ref-block">
          <div class="ref-label">Booking Reference</div>
          <div class="ref-value">${esc(customerRef(reference))}</div>
          <div class="status-row">
            <span class="status-badge">Booking: ${esc(bookingStatusDisplay)}</span>
            <span class="status-badge-gray">Payment: ${esc(paymentStatusDisplay)}</span>
          </div>
        </div>

        <div style="border:1px solid #1e3a5f;border-radius:10px;overflow:hidden;margin-bottom:16px;">
          <table width="100%" cellspacing="0" cellpadding="0" role="presentation">
            <tr>
              <td style="width:50%;padding:14px 16px;vertical-align:top;border-right:1px solid #1e3a5f;">
                <div class="dates-label">Pickup</div>
                <div class="dates-location">${esc(pickupLocation)}</div>
                <div class="dates-time">${esc(formatDT(pickupDatetime))}</div>
              </td>
              <td style="width:50%;padding:14px 16px;vertical-align:top;">
                <div class="dates-label">Return</div>
                <div class="dates-location">${esc(dropoffLocation)}</div>
                <div class="dates-time">${esc(formatDT(dropoffDatetime))}</div>
              </td>
            </tr>
          </table>
        </div>

        <div style="border:1px solid #1e3a5f;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <table width="100%" cellspacing="0" cellpadding="0" role="presentation">
            <tr>${metaCellsHtml}</tr>
          </table>
        </div>

        ${extrasOnlySection}
        ${pricingSection}

        ${paymentMethod ? `
        <div class="info-block">
          <div class="info-label">Payment</div>
          <p class="info-text">${esc(paymentMethodNote(paymentMethod))}</p>
        </div>` : ""}

        <div class="info-block">
          <div class="info-label">Pickup Instructions</div>
          <p class="info-text">${esc(pickupInstructions)}</p>
        </div>

        <p style="font-size:13px;color:#64748b;margin:0 0 20px;">Your complete booking voucher is attached as a PDF. Our team will review your request and confirm within a few hours.</p>

        <div class="contact-block">
          <p><strong style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;">Contact Us</strong></p>
          <p>Tbilisi Office: <a href="tel:+995557376363">+995 557 37 63 63</a></p>
          <p>Batumi Office: <a href="tel:+995557376363">+995 557 37 63 63</a></p>
          <p>Kutaisi Office: <a href="tel:+995595286600">+995 595 28 66 00</a></p>
          <p>Email: <a href="mailto:reservations@tbilisicars.com">reservations@tbilisicars.com</a></p>
        </div>
      </div>
      <div class="footer">
        &copy; 2026 Tbilisicars &middot; Car Rental Georgia<br/>
        <a href="https://tbilisicars.com/terms">Terms &amp; Conditions</a> &middot;
        <a href="https://tbilisicars.com/privacy">Privacy Policy</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  // ── Plain-text version ─────────────────────────────────────────────────────
  const extrasText = extras.length > 0
    ? `\nADD-ONS & EXTRAS\n${extras.map(extraTextLine).join("\n")}\n`
    : "";

  const pricingText = estimatedTotal != null
    ? `\nPRICING SUMMARY\n${effectiveBaseRate != null ? `  Base rate (${days} ${days === 1 ? "day" : "days"}): ${fmt(effectiveBaseRate)}\n` : ""}${extras.map(extraTextLine).join("\n")}${extras.length > 0 ? "\n" : ""}${oneWayFee != null && oneWayFee > 0 ? `  One-way transfer fee: ${fmt(oneWayFee)}\n` : ""}${websiteDiscountName && websiteDiscountAmount != null && websiteDiscountAmount > 0 ? `  Discount: -${fmt(websiteDiscountAmount)}\n` : ""}${promoCode && discountAmount != null && discountAmount > 0 ? `  Promo discount: -${fmt(discountAmount)}\n` : ""}  Total Amount: ${fmt(estimatedTotal)}\n  (Final pricing confirmed before any charge)\n`
    : extrasText;

  const metaText = [
    `  Duration: ${days} ${days === 1 ? "day" : "days"}`,
    ...(insurancePlan ? [`  Insurance: ${insurancePlan} Insurance`] : []),
    ...(flightNumber  ? [`  Flight No.: ${flightNumber}`] : []),
    ...(nationality   ? [`  Nationality: ${nationality}`] : []),
    ...(age           ? [`  Driver Age: ${age}`] : []),
  ].join("\n");

  const text = `
Tbilisicars \u2014 Booking Confirmation

Dear ${toName},

Thank you for choosing Tbilisicars. We have received your booking request and will confirm shortly.

BOOKING REFERENCE: ${customerRef(reference)}
Booking: ${bookingStatusDisplay} \u00B7 Payment: ${paymentStatusDisplay}

VEHICLE
  ${vehicle}
  ${days} ${days === 1 ? "day" : "days"} rental

PICKUP
  ${pickupLocation}
  ${formatDT(pickupDatetime)}

RETURN
  ${dropoffLocation}
  ${formatDT(dropoffDatetime)}

DETAILS
${metaText}
${paymentMethod ? `\nPAYMENT\n  ${paymentMethodNote(paymentMethod)}\n` : ""}${pricingText}
PICKUP INSTRUCTIONS
  ${pickupInstructions}

Your complete booking voucher is attached as a PDF.
Our team will review your request and confirm within a few hours.

CONTACT US
  Tbilisi Office:  +995 557 37 63 63
  Batumi Office:   +995 557 37 63 63
  Kutaisi Office:  +995 595 28 66 00
  Email:           reservations@tbilisicars.com

\u00A9 2026 Tbilisicars \u2014 Car Rental Georgia
`.trim();

  // ── Optional PDF voucher attachment ─────────────────────────────────────────
  let pdfBuffer: Buffer | undefined;
  if (attachPdfVoucher) {
    try {
      pdfBuffer = await generateBookingVoucherPdf({
        toName, toEmail, reference, vehicle,
        vehicleImageUrl: vehicleImageUrl ?? null,
        pickupLocation, dropoffLocation,
        pickupDatetime, dropoffDatetime,
        extras, insurancePlan, paymentMethod,
        flightNumber, nationality, age,
        estimatedTotal, baseTotal, oneWayFee,
        promoCode, discountAmount,
        websiteDiscountName, websiteDiscountAmount,
        originalRentalPrice, discountedRentalPrice,
        currency, generatedPassword,
        bookingStatus,
        paymentStatus,
        bookingNotes,
      });
      console.log(`[email] pdf_generated ref=${reference}`);
    } catch (pdfErr) {
      console.error(`[email] pdf_failed ref=${reference} error=${pdfErr instanceof Error ? pdfErr.message : String(pdfErr)}`);
    }
  }

  try {
    await resend.emails.send({
      from: `Tbilisicars Reservations <${fromAddress}>`,
      to: toEmail,
      subject: bookingStatus === "CONFIRMED"
        ? `Booking Confirmed: ${customerRef(reference)} \u2014 ${vehicle}`
        : `Booking Request Received: ${customerRef(reference)} \u2014 ${vehicle}`,
      html,
      text,
      ...(pdfBuffer != null
        ? { attachments: [{ filename: `booking-voucher-${customerRef(reference).replace(/^#/, "")}.pdf`, content: pdfBuffer }] }
        : {}),
    });
    console.log(`[email] sent_ok ref=${reference}`);
  } catch (err) {
    console.error(`[email] send_failed ref=${reference} error=${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Pickup thank-you / review request ───────────────────────────────────────
// Sent from the Monitoring page after a successful pickup. Includes Google
// Review and Trustpilot links and is personalised with the customer's first
// name. Returns a `{ skipped: true, reason }` result when Resend is unset so
// the UI can surface a clear reason.

export interface ThankYouEmailParams {
  toEmail: string;
  firstName: string;
  reference: string;
  vehicle: string;
}

export interface ThankYouEmailResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
}

const GOOGLE_REVIEW_URL =
  "https://search.google.com/local/writereview?placeid=ChIJtbilisicars";
const TRUSTPILOT_URL = "https://www.trustpilot.com/review/tbilisicars.com";

export function renderThankYouEmail(params: ThankYouEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const { firstName, reference, vehicle } = params;
  const safeFirst = firstName?.trim() || "there";
  const subject = `Thanks for choosing Tbilisicars, ${safeFirst}!`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#0d1b2a;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:#132033;border:1px solid #1e3a5f;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#7f1d2e 0%,#9f2535 100%);padding:28px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Thank you, ${esc(safeFirst)}!</h1>
        <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Tbilisicars \u00B7 Car Rental Georgia</p>
      </div>
      <div style="padding:28px;font-size:14px;line-height:1.6;">
        <p>It was a pleasure handing over your <strong>${esc(vehicle)}</strong> today (booking <strong>${esc(reference)}</strong>). We hope you're enjoying the road and that everything is running smoothly.</p>
        <p>If you have a moment, a short public review really helps us reach more travellers in Georgia. Either of these takes about a minute:</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px auto;">
          <tr>
            <td style="padding:0 6px;">
              <a href="${GOOGLE_REVIEW_URL}" style="display:inline-block;background:#e05c72;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:13px;">Review us on Google</a>
            </td>
            <td style="padding:0 6px;">
              <a href="${TRUSTPILOT_URL}" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:13px;">Review us on Trustpilot</a>
            </td>
          </tr>
        </table>
        <p>If anything is less than perfect, just reply to this email or call <a href="tel:+995557376363" style="color:#e05c72;">+995 557 37 63 63</a> \u2014 we'd rather fix it than have you leave anything but a five-star review.</p>
        <p style="margin-top:24px;">Safe travels,<br/><strong>The Tbilisicars Team</strong></p>
      </div>
      <div style="text-align:center;padding:18px 28px;font-size:12px;color:#475569;">
        \u00A9 2026 Tbilisicars \u00B7 <a href="https://tbilisicars.com" style="color:#64748b;">tbilisicars.com</a>
      </div>
    </div>
  </div>
</body>
</html>`;
  const text = `Hi ${safeFirst},

Thank you for choosing Tbilisicars and picking up your ${vehicle} today (booking ${reference}). We hope everything is going smoothly so far.

If you have a moment, a short public review goes a long way:
  Google:     ${GOOGLE_REVIEW_URL}
  Trustpilot: ${TRUSTPILOT_URL}

If anything is less than perfect, just reply to this email or call +995 557 37 63 63 \u2014 we'd rather fix it.

Safe travels,
The Tbilisicars Team
`;
  return { subject, html, text };
}

export async function sendPickupThankYouEmail(
  params: ThankYouEmailParams,
): Promise<ThankYouEmailResult> {
  const resend = getResend();
  if (!resend) {
    console.log(`[email] thank_you_skipped_no_api_key ref=${params.reference}`);
    return { ok: false, skipped: true, reason: "RESEND_API_KEY is not set" };
  }
  const fromAddress =
    process.env.RESEND_FROM_EMAIL ?? "reservations@tbilisicars.com";
  const { subject, html, text } = renderThankYouEmail(params);
  try {
    await resend.emails.send({
      from: `Tbilisicars Reservations <${fromAddress}>`,
      to: params.toEmail,
      subject,
      html,
      text,
    });
    console.log(`[email] thank_you_sent_ok ref=${params.reference}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email] thank_you_send_failed ref=${params.reference} ${msg}`);
    return { ok: false, reason: msg };
  }
}

// ─── Internal staff notification ─────────────────────────────────────────────

interface InternalBookingEmailParams {
  bookingId: number;
  referenceNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  pickupDate: Date;
  dropoffDate: Date;
  pickupLocation: string;
  dropoffLocation: string;
  vehicleModel: string;
  totalAmount: number;
  currency: string;
  notes?: string;
  bookingStatus?: string;
}

export async function sendNewBookingInternalEmail(params: InternalBookingEmailParams): Promise<void> {
  const {
    bookingId, referenceNumber, customerName, customerEmail, customerPhone,
    pickupDate, dropoffDate, pickupLocation, dropoffLocation,
    vehicleModel, totalAmount, currency, notes, bookingStatus,
  } = params;

  const resend = getResend();
  if (!resend) {
    console.log(`[email] reservations_email_skipped_no_api_key bookingId=${bookingId}`);
    return;
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "reservations@tbilisicars.com";

  function fmtDate(d: Date): string {
    try {
      return d.toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tbilisi",
      });
    } catch { return d.toISOString(); }
  }

  function row(label: string, value: string): string {
    return `<tr>
      <td style="padding:9px 0;font-size:13px;color:#9ca3af;width:38%;vertical-align:top;border-bottom:1px solid rgba(255,255,255,0.05);">${esc(label)}</td>
      <td style="padding:9px 0;font-size:13px;color:#e4e4e7;font-weight:500;border-bottom:1px solid rgba(255,255,255,0.05);">${value}</td>
    </tr>`;
  }

  const totalFmt = `${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  const rows = [
    row("Booking Reference", `<strong style="font-size:15px;letter-spacing:0.5px;">${esc(customerRef(referenceNumber))}</strong>`),
    row("Customer Name", esc(customerName)),
    row("Customer Email", `<a href="mailto:${esc(customerEmail)}" style="color:#e05c72;">${esc(customerEmail)}</a>`),
    row("Customer Phone", customerPhone ? `<strong>${esc(customerPhone)}</strong>` : "\u2014"),
    row("Pickup Location", esc(pickupLocation)),
    row("Drop-off Location", esc(dropoffLocation)),
    row("Pickup Date", esc(fmtDate(pickupDate))),
    row("Return Date", esc(fmtDate(dropoffDate))),
    row("Vehicle", esc(vehicleModel)),
    row("Estimated Total", esc(totalFmt)),
    row("Booking Status", `<strong style="color:${(bookingStatus ?? "PENDING") === "CONFIRMED" ? "#22c55e" : "#fbbf24"};">${esc(bookingStatus ?? "PENDING")}</strong>`),
    row("Source", "<strong>WEBSITE</strong>"),
    ...(notes ? [row("Notes", `<span style="white-space:pre-wrap;">${esc(notes)}</span>`)] : []),
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;font-family:Inter,Helvetica,Arial,sans-serif;background:#0d1b2a;color:#e4e4e7;">
  <div style="max-width:600px;margin:32px auto;background:#13243a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#c0384f 0%,#a02040 100%);padding:24px 32px;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px;">&#128337; New Website Booking</h1>
      <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">Reference: <strong>${esc(customerRef(referenceNumber))}</strong></p>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        ${rows}
      </table>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,0.06);padding:14px 32px;font-size:12px;color:#6b7280;text-align:center;">
      Tbilisicars CRM &middot; Internal Notification &middot; Please do not reply to this email.
    </div>
  </div>
</body>
</html>`;

  const text = [
    `NEW WEBSITE BOOKING \u2014 ${customerRef(referenceNumber)}`,
    ``,
    `Reference:       ${customerRef(referenceNumber)}`,
    `Customer:        ${customerName}`,
    `Email:           ${customerEmail}`,
    `Phone:           ${customerPhone ?? "\u2014"}`,
    `Pickup:          ${pickupLocation}`,
    `Drop-off:        ${dropoffLocation}`,
    `Pickup date:     ${fmtDate(pickupDate)}`,
    `Return date:     ${fmtDate(dropoffDate)}`,
    `Vehicle:         ${vehicleModel}`,
    `Total:           ${totalFmt}`,
    `Booking Status:  ${bookingStatus ?? "PENDING"}`,
    `Source:          WEBSITE`,
    ...(notes ? [`Notes:\n${notes}`] : []),
  ].join("\n");

  try {
    await resend.emails.send({
      from: `Tbilisicars Reservations <${fromAddress}>`,
      to: "reservations@tbilisicars.com",
      subject: bookingStatus === "CONFIRMED"
        ? `New Website Booking (CONFIRMED) \u2014 ${customerRef(referenceNumber)}`
        : `New Website Booking (PENDING) \u2014 ${customerRef(referenceNumber)}`,
      html,
      text,
    });
    console.log(`[email] reservations_email_sent bookingId=${bookingId}`);
  } catch (err) {
    console.error(`[email] reservations_email_failed bookingId=${bookingId} error=${err instanceof Error ? err.message : String(err)}`);
  }
}
