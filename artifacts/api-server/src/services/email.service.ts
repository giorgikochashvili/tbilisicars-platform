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
    }) + " (Tbilisi time)";
  } catch {
    return iso;
  }
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const CITY_PICKUP_INSTRUCTIONS: Record<string, string> = {
  Tbilisi: "Our team will meet you at Tbilisi International Airport arrivals. Look for the Tbilisicars sign. Call +995 557 37 63 63 if you need assistance.",
  Kutaisi: "Our agent will meet you at Kutaisi International Airport arrivals. Call +995 595 28 66 00 on arrival.",
  Batumi: "Our team will meet you at Batumi International Airport arrivals. Look for the Tbilisicars sign. Call +995 557 37 63 63 if you need assistance.",
};

function getPickupInstructions(city?: string): string {
  if (!city) return "Our team will contact you shortly to confirm pickup details.";
  return CITY_PICKUP_INSTRUCTIONS[city] ?? "Our team will contact you shortly to confirm pickup details.";
}

function paymentMethodNote(method: string): string {
  const lower = method.toLowerCase();
  if (lower.includes("arrival")) return "Payment will be made at pickup — cash or card accepted on site.";
  if (lower.includes("card")) return "Card payment — our team will follow up to process the payment.";
  if (lower.includes("transfer") || lower.includes("bank")) return "Bank transfer — please complete the transfer before your pickup date.";
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
  currency?: string;
  generatedPassword?: string | null;
  attachPdfVoucher?: boolean;
  bookingStatus?: string;
  paymentStatus?: string;
  customerNotes?: string | null;
}

export async function sendBookingConfirmationEmail(params: BookingConfirmationEmailParams): Promise<void> {
  const {
    toEmail, toName, reference, bookingId,
    vehicle,
    pickupLocation, dropoffLocation,
    pickupDatetime, dropoffDatetime,
    pickupCity,
    extras = [],
    insurancePlan, paymentMethod, flightNumber,
    nationality, age,
    estimatedTotal, baseTotal, oneWayFee, promoCode, discountAmount,
    currency = "GEL",
    generatedPassword,
    attachPdfVoucher = false,
    bookingStatus = "PENDING",
    paymentStatus = "UNPAID",
    customerNotes,
  } = params;

  console.log(`[email] preparing ref=${reference} bookingId=${bookingId ?? "?"} to=${toEmail}`);

  const resend = getResend();
  if (!resend) {
    console.log(`[email] skipped_no_api_key ref=${reference}`);
    return;
  }

  const bookingStatusDisplay = capitalize(bookingStatus);
  const paymentStatusDisplay = capitalize(paymentStatus);

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "support@tbilisicars.com";
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
    return `<div class="row"><span class="label">${label}</span><span class="value">${fmt(lineTotal)}</span></div>`;
  }

  function extraTextLine(ex: EmailExtra): string {
    const lineTotal = extraLineTotal(ex);
    return `  • ${ex.name}${ex.quantity > 1 ? ` ×${ex.quantity}` : ""}: ${fmt(lineTotal)}`;
  }

  // ── HTML sections ──────────────────────────────────────────────────────────
  const pricingSection = estimatedTotal != null ? `
        <div class="pricing-section">
          <div class="section-title">Pricing Estimate</div>
          ${baseTotal != null ? `<div class="row"><span class="label">Base rate (${days} ${days === 1 ? "day" : "days"})</span><span class="value">${fmt(baseTotal)}</span></div>` : ""}
          ${extras.map(extraHtmlRow).join("")}
          ${oneWayFee != null && oneWayFee > 0 ? `<div class="row"><span class="label">One-way transfer fee</span><span class="value">${fmt(oneWayFee)}</span></div>` : ""}
          ${promoCode && discountAmount != null && discountAmount > 0 ? `<div class="row"><span class="label">Promo (${esc(promoCode)})</span><span class="value">&minus;${fmt(discountAmount)}</span></div>` : ""}
          <div class="total-row">
            <span class="total-label">Estimated Total</span>
            <span class="total-value">${fmt(estimatedTotal)}</span>
          </div>
          <p style="margin: 8px 0 0; font-size: 12px; color: #64748b;">Final pricing is confirmed before any charge is made.</p>
        </div>` : "";

  const extrasOnlySection = estimatedTotal == null && extras.length > 0 ? `
        <div class="section">
          <div class="section-title">Add-ons &amp; Extras</div>
          ${extras.map(extraHtmlRow).join("")}
        </div>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmation — ${esc(reference)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0d1b2a; font-family: 'Segoe UI', Arial, sans-serif; color: #e2e8f0; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #132033; border: 1px solid #1e3a5f; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #7f1d2e 0%, #9f2535 100%); padding: 32px 28px; text-align: center; }
    .header h1 { margin: 0; color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; color: rgba(255,255,255,0.8); font-size: 14px; }
    .body { padding: 28px; }
    .greeting { font-size: 16px; color: #e2e8f0; margin-bottom: 20px; line-height: 1.6; }
    .ref-block { background: rgba(127,29,46,0.15); border: 1px solid rgba(127,29,46,0.3); border-radius: 12px; padding: 16px 20px; text-align: center; margin-bottom: 24px; }
    .ref-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-bottom: 4px; }
    .ref-value { font-size: 28px; font-weight: 800; color: #e05c72; letter-spacing: 2px; }
    .status-row { display: flex; justify-content: center; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
    .status-badge { display: inline-block; background: rgba(234,179,8,0.15); border: 1px solid rgba(234,179,8,0.3); color: #fbbf24; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .status-badge-gray { display: inline-block; background: rgba(148,163,184,0.1); border: 1px solid rgba(148,163,184,0.25); color: #94a3b8; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #64748b; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #1e3a5f; }
    .row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-bottom: 1px solid #1a2f4a; font-size: 14px; gap: 12px; }
    .row:last-child { border-bottom: none; }
    .row .label { color: #94a3b8; }
    .row .value { color: #e2e8f0; font-weight: 500; text-align: right; flex-shrink: 0; }
    .pricing-section { background: rgba(127,29,46,0.08); border: 1px solid rgba(127,29,46,0.2); border-radius: 12px; padding: 16px; margin-bottom: 20px; }
    .pricing-section .section-title { border-color: rgba(127,29,46,0.2); }
    .pricing-section .row { border-bottom-color: rgba(127,29,46,0.15); }
    .total-row { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; margin-top: 8px; border-top: 1px solid rgba(127,29,46,0.3); }
    .total-label { font-size: 14px; font-weight: 600; color: #e2e8f0; }
    .total-value { font-size: 18px; font-weight: 800; color: #e05c72; }
    .instructions-box { background: rgba(14,165,233,0.06); border: 1px solid rgba(14,165,233,0.18); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
    .instructions-box .box-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #38bdf8; margin-bottom: 8px; }
    .instructions-box p { margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.6; }
    .payment-box { background: rgba(34,197,94,0.06); border: 1px solid rgba(34,197,94,0.18); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
    .payment-box .box-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #4ade80; margin-bottom: 6px; }
    .payment-box p { margin: 0; font-size: 13px; color: #94a3b8; line-height: 1.6; }
    .pdf-note { font-size: 13px; color: #94a3b8; margin-bottom: 20px; line-height: 1.5; }
    .contact-section { background: #0d1b2a; border-radius: 10px; padding: 16px 20px; }
    .contact-section p { margin: 0 0 8px; font-size: 13px; color: #94a3b8; }
    .contact-section a { color: #e05c72; text-decoration: none; }
    .account-box { background: rgba(30,58,95,0.35); border: 1px solid #2d5a8e; border-left: 3px solid #e05c72; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px; }
    .account-box .box-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #e05c72; margin-bottom: 10px; font-weight: 700; }
    .account-box .acct-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid rgba(45,90,142,0.4); font-size: 13px; gap: 12px; }
    .account-box .acct-row:last-of-type { border-bottom: none; }
    .account-box .acct-label { color: #94a3b8; flex-shrink: 0; }
    .account-box .acct-value { color: #e2e8f0; font-weight: 600; text-align: right; }
    .account-box .pw-value { color: #e05c72; font-family: monospace; font-size: 15px; font-weight: 700; letter-spacing: 2px; }
    .account-box .acct-note { font-size: 12px; color: #64748b; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(45,90,142,0.4); }
    .footer { text-align: center; padding: 20px 28px; font-size: 12px; color: #475569; }
    .footer a { color: #64748b; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Tbilisicars</h1>
        <p>Premium Car Rental &middot; Georgia</p>
      </div>
      <div class="body">
        <p class="greeting">Dear ${esc(toName)},<br/>Thank you for choosing Tbilisicars. We have received your booking request and will confirm availability shortly.</p>

        <div class="ref-block">
          <div class="ref-label">Booking Reference</div>
          <div class="ref-value">${esc(reference)}</div>
          <div class="status-row">
            <span class="status-badge">Booking: ${esc(bookingStatusDisplay)}</span>
            <span class="status-badge-gray">Payment: ${esc(paymentStatusDisplay)}</span>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Trip Details</div>
          <div class="row"><span class="label">Vehicle</span><span class="value">${esc(vehicle)}</span></div>
          <div class="row"><span class="label">Pickup Location</span><span class="value">${esc(pickupLocation)}</span></div>
          <div class="row"><span class="label">Drop-off Location</span><span class="value">${esc(dropoffLocation)}</span></div>
          <div class="row"><span class="label">Pickup Date &amp; Time</span><span class="value">${esc(formatDT(pickupDatetime))}</span></div>
          <div class="row"><span class="label">Return Date &amp; Time</span><span class="value">${esc(formatDT(dropoffDatetime))}</span></div>
          <div class="row"><span class="label">Duration</span><span class="value">${days} ${days === 1 ? "day" : "days"}</span></div>
          ${flightNumber ? `<div class="row"><span class="label">Flight Number</span><span class="value">${esc(flightNumber)}</span></div>` : ""}
        </div>

        ${insurancePlan ? `
        <div class="section">
          <div class="section-title">Insurance</div>
          <div class="row"><span class="label">Plan</span><span class="value">${esc(insurancePlan)} Cover</span></div>
        </div>` : ""}

        ${extrasOnlySection}
        ${pricingSection}

        ${paymentMethod ? `
        <div class="payment-box">
          <div class="box-title">Payment</div>
          <p>${esc(paymentMethodNote(paymentMethod))}</p>
        </div>` : ""}

        ${nationality || age ? `
        <div class="section">
          <div class="section-title">Additional Details</div>
          ${nationality ? `<div class="row"><span class="label">Nationality</span><span class="value">${esc(nationality)}</span></div>` : ""}
          ${age ? `<div class="row"><span class="label">Driver Age</span><span class="value">${esc(age)}</span></div>` : ""}
        </div>` : ""}

        <div class="instructions-box">
          <div class="box-title">Pickup Instructions</div>
          <p>${esc(pickupInstructions)}</p>
        </div>

        ${generatedPassword != null && generatedPassword !== "" ? `
        <div class="account-box">
          <div class="box-title">Your Account</div>
          <div class="acct-row">
            <span class="acct-label">Email</span>
            <span class="acct-value">${esc(toEmail)}</span>
          </div>
          <div class="acct-row">
            <span class="acct-label">Password</span>
            <span class="pw-value">${esc(generatedPassword)}</span>
          </div>
          <div class="acct-row">
            <span class="acct-label">Sign in at</span>
            <span class="acct-value"><a href="https://tbilisicars.com/login" style="color:#e05c72;">tbilisicars.com/login</a></span>
          </div>
          <p class="acct-note">We created this account automatically using your booking email. You can change your password from your cabinet.</p>
        </div>` : ""}

        <p class="pdf-note">Your full booking details are attached as a PDF. Our team will review your request and confirm within a few hours.</p>

        <div class="contact-section">
          <p><strong style="color:#e2e8f0;">Need help? Contact us anytime:</strong></p>
          <p>&#128222; <a href="tel:+995557376363">+995 557 37 63 63</a> &mdash; Tbilisi &amp; Batumi</p>
          <p>&#128222; <a href="tel:+995595286600">+995 595 28 66 00</a> &mdash; Kutaisi</p>
          <p>&#9993;&#65039; <a href="mailto:reservations@tbilisicars.com">reservations@tbilisicars.com</a></p>
        </div>
      </div>
      <div class="footer">
        &copy; 2026 Tbilisicars &middot; Premium Car Rental in Georgia<br/>
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
    ? `\nPRICING ESTIMATE\n${baseTotal != null ? `  Base rate (${days} ${days === 1 ? "day" : "days"}): ${fmt(baseTotal)}\n` : ""}${extras.map(extraTextLine).join("\n")}${extras.length > 0 ? "\n" : ""}${oneWayFee != null && oneWayFee > 0 ? `  One-way transfer fee: ${fmt(oneWayFee)}\n` : ""}${promoCode && discountAmount != null && discountAmount > 0 ? `  Promo (${promoCode}): -${fmt(discountAmount)}\n` : ""}  Estimated Total: ${fmt(estimatedTotal)}\n  (Final pricing confirmed before any charge)\n`
    : extrasText;

  const text = `
Tbilisicars — Booking Confirmation

Dear ${toName},

Thank you for choosing Tbilisicars. We have received your booking request and will confirm shortly.

BOOKING REFERENCE: ${reference}
Booking Status: ${bookingStatusDisplay}
Payment Status: ${paymentStatusDisplay}

TRIP DETAILS
  Vehicle: ${vehicle}
  Pickup Location: ${pickupLocation}
  Drop-off Location: ${dropoffLocation}
  Pickup Date & Time: ${formatDT(pickupDatetime)}
  Return Date & Time: ${formatDT(dropoffDatetime)}
  Duration: ${days} ${days === 1 ? "day" : "days"}
${flightNumber ? `  Flight Number: ${flightNumber}\n` : ""}
${insurancePlan ? `INSURANCE\n  Plan: ${insurancePlan} Cover\n\n` : ""}${pricingText}
${paymentMethod ? `PAYMENT\n  ${paymentMethodNote(paymentMethod)}\n\n` : ""}${nationality || age ? `ADDITIONAL DETAILS\n${nationality ? `  Nationality: ${nationality}\n` : ""}${age ? `  Driver Age: ${age}\n` : ""}\n` : ""}PICKUP INSTRUCTIONS
  ${pickupInstructions}

Your full booking details are attached as a PDF.
Our team will review your request and confirm within a few hours.

${generatedPassword != null && generatedPassword !== "" ? `YOUR ACCOUNT
  Email:    ${toEmail}
  Password: ${generatedPassword}
  Sign in:  https://tbilisicars.com/login
  (You can change your password from your cabinet.)

` : ""}CONTACT US
  Tbilisi / Batumi: +995 557 37 63 63
  Kutaisi: +995 595 28 66 00
  Email: reservations@tbilisicars.com

© 2026 Tbilisicars — Premium Car Rental in Georgia
`.trim();

  // ── Optional PDF voucher attachment ─────────────────────────────────────────
  let pdfBuffer: Buffer | undefined;
  if (attachPdfVoucher) {
    try {
      pdfBuffer = await generateBookingVoucherPdf({
        toName, toEmail, reference, vehicle,
        pickupLocation, dropoffLocation,
        pickupDatetime, dropoffDatetime,
        extras, insurancePlan, paymentMethod,
        flightNumber, nationality, age,
        estimatedTotal, baseTotal, oneWayFee,
        promoCode, discountAmount,
        currency, generatedPassword,
        bookingStatus,
        paymentStatus,
        customerNotes,
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
      subject: `Booking Confirmed: ${reference} — ${vehicle}`,
      html,
      text,
      ...(pdfBuffer != null
        ? { attachments: [{ filename: `booking-${reference}.pdf`, content: pdfBuffer }] }
        : {}),
    });
    console.log(`[email] sent_ok ref=${reference}`);
  } catch (err) {
    console.error(`[email] send_failed ref=${reference} error=${err instanceof Error ? err.message : String(err)}`);
  }
}
