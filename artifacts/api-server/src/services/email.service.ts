/**
 * Email service using Resend.
 * Sends booking confirmation emails non-blockingly.
 * If RESEND_API_KEY is not set, emails are silently skipped.
 */
import { Resend } from "resend";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

function formatDT(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tbilisi",
    }) + " (Tbilisi time)";
  } catch {
    return iso;
  }
}

export interface BookingConfirmationEmailParams {
  toEmail: string;
  toName: string;
  reference: string;
  vehicle: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  insurancePlan?: string;
  paymentMethod?: string;
  flightNumber?: string;
  estimatedTotal?: number | null;
  currency?: string;
}

export async function sendBookingConfirmationEmail(params: BookingConfirmationEmailParams): Promise<void> {
  const resend = getResend();
  if (!resend) return; // silently skip if not configured

  const {
    toEmail, toName, reference, vehicle,
    pickupLocation, dropoffLocation,
    pickupDatetime, dropoffDatetime,
    insurancePlan, paymentMethod, flightNumber,
    estimatedTotal, currency = "GEL",
  } = params;

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "reservations@tbilisicars.com";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmation</title>
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
    .section { margin-bottom: 20px; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #64748b; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #1e3a5f; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1a2f4a; font-size: 14px; }
    .row:last-child { border-bottom: none; }
    .row .label { color: #94a3b8; }
    .row .value { color: #e2e8f0; font-weight: 500; text-align: right; max-width: 60%; }
    .total-row { background: rgba(127,29,46,0.1); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
    .total-label { font-size: 14px; font-weight: 600; color: #e2e8f0; }
    .total-value { font-size: 18px; font-weight: 800; color: #e05c72; }
    .status-badge { display: inline-block; background: rgba(234,179,8,0.15); border: 1px solid rgba(234,179,8,0.3); color: #fbbf24; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-top: 6px; }
    .info-box { background: rgba(14,165,233,0.08); border: 1px solid rgba(14,165,233,0.2); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; font-size: 13px; color: #94a3b8; line-height: 1.6; }
    .info-box strong { color: #e2e8f0; }
    .contact-section { background: #0d1b2a; border-radius: 10px; padding: 16px 20px; margin-top: 24px; }
    .contact-section p { margin: 0 0 8px; font-size: 13px; color: #94a3b8; }
    .contact-section a { color: #e05c72; text-decoration: none; }
    .footer { text-align: center; padding: 20px 28px; font-size: 12px; color: #475569; }
    .footer a { color: #64748b; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Tbilisicars</h1>
        <p>Premium Car Rental · Georgia</p>
      </div>
      <div class="body">
        <p class="greeting">Dear ${toName},<br/>Thank you for choosing Tbilisicars. We have received your booking request and will confirm availability shortly.</p>

        <div class="ref-block">
          <div class="ref-label">Booking Reference</div>
          <div class="ref-value">${reference}</div>
          <div class="status-badge">Pending Confirmation</div>
        </div>

        <div class="section">
          <div class="section-title">Trip Details</div>
          <div class="row"><span class="label">Vehicle</span><span class="value">${vehicle}</span></div>
          <div class="row"><span class="label">Pickup</span><span class="value">${pickupLocation}</span></div>
          <div class="row"><span class="label">Drop-off</span><span class="value">${dropoffLocation}</span></div>
          <div class="row"><span class="label">Pickup Date</span><span class="value">${formatDT(pickupDatetime)}</span></div>
          <div class="row"><span class="label">Return Date</span><span class="value">${formatDT(dropoffDatetime)}</span></div>
          ${flightNumber ? `<div class="row"><span class="label">Flight Number</span><span class="value">${flightNumber}</span></div>` : ""}
        </div>

        ${insurancePlan || paymentMethod ? `
        <div class="section">
          <div class="section-title">Booking Details</div>
          ${insurancePlan ? `<div class="row"><span class="label">Insurance Plan</span><span class="value">${insurancePlan} Cover</span></div>` : ""}
          ${paymentMethod ? `<div class="row"><span class="label">Payment Method</span><span class="value">${paymentMethod}</span></div>` : ""}
        </div>` : ""}

        ${estimatedTotal != null ? `
        <div class="total-row">
          <span class="total-label">Estimated Total</span>
          <span class="total-value">${estimatedTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
        </div>` : ""}

        <div class="info-box" style="margin-top: 20px;">
          <strong>What happens next?</strong><br/>
          Our team will review your request and send a confirmation within a few hours. If you have a flight arriving soon, please also contact us directly so we can ensure your car is ready on time.
        </div>

        <div class="contact-section">
          <p>Questions? Contact us anytime:</p>
          <p>📞 <a href="tel:+995557376363">+995 557 37 63 63</a> (Tbilisi / Batumi)</p>
          <p>📞 <a href="tel:+995595286600">+995 595 28 66 00</a> (Kutaisi)</p>
          <p>✉️ <a href="mailto:reservations@tbilisicars.com">reservations@tbilisicars.com</a></p>
        </div>
      </div>
      <div class="footer">
        &copy; 2026 Tbilisicars · Premium Car Rental in Georgia<br/>
        <a href="https://tbilisicars.com/terms">Terms &amp; Conditions</a> · <a href="https://tbilisicars.com/privacy">Privacy Policy</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `
Tbilisicars — Booking Confirmation

Dear ${toName},

Thank you for choosing Tbilisicars! We have received your booking request and will confirm shortly.

BOOKING REFERENCE: ${reference}
Status: Pending Confirmation

TRIP DETAILS
Vehicle: ${vehicle}
Pickup: ${pickupLocation}
Drop-off: ${dropoffLocation}
Pickup Date: ${formatDT(pickupDatetime)}
Return Date: ${formatDT(dropoffDatetime)}
${flightNumber ? `Flight Number: ${flightNumber}\n` : ""}
${insurancePlan ? `Insurance Plan: ${insurancePlan} Cover\n` : ""}
${paymentMethod ? `Payment Method: ${paymentMethod}\n` : ""}
${estimatedTotal != null ? `\nEstimated Total: ${estimatedTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : ""}

WHAT HAPPENS NEXT?
Our team will review your request and send a confirmation within a few hours.

CONTACT US
Tbilisi / Batumi: +995 557 37 63 63
Kutaisi: +995 595 28 66 00
Email: reservations@tbilisicars.com

© 2026 Tbilisicars — Premium Car Rental in Georgia
`.trim();

  try {
    await resend.emails.send({
      from: `Tbilisicars Reservations <${fromAddress}>`,
      to: toEmail,
      subject: `Booking Confirmed: ${reference} — ${vehicle}`,
      html,
      text,
    });
  } catch (err) {
    // Non-blocking: log but don't throw
    console.error("[email] Failed to send booking confirmation:", err);
  }
}
