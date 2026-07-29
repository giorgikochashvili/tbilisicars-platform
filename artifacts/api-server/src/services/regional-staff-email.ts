/**
 * regional-staff-email.ts
 *
 * C2b-3b2: Pure brand-aware HTML/text email renderer for Regional Brands
 * Gateway staff notifications.
 *
 * No process.env. No Resend. No provider calls. No Date construction.
 * No logging.
 */

import type { RegionalStaffNotification }
  from "../lib/regional-staff-notifier.js";

// ── Local derived brand-code type ─────────────────────────────────────────────

type RegionalStaffBrandCode = RegionalStaffNotification["brandCode"];

// ── Module-private constants ──────────────────────────────────────────────────

const RENDERING_ERROR = "Regional staff email rendering failed";

const MONTH_NAMES: readonly string[] = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ── Module-private helpers ────────────────────────────────────────────────────

function assertNever(x: never): never {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void x;
  throw new Error(RENDERING_ERROR);
}

function brandLabel(code: RegionalStaffBrandCode): string {
  switch (code) {
    case "batumicars":  return "BATUMICARS";
    case "kutaisicars": return "KUTAISICARS";
    default:            return assertNever(code);
  }
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * guardSubjectHeader — renderer-private.
 * Validates only the rendered subject; rejects CR or LF.
 * Not exported. Not called by the notifier.
 */
function guardSubjectHeader(value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(RENDERING_ERROR);
  }
  return value;
}

function daysInMonth(year: number, month: number): number {
  const thirtyOne = [1, 3, 5, 7, 8, 10, 12];
  if (thirtyOne.indexOf(month) !== -1) return 31;
  if (month !== 2) return 30;
  // February — pure integer leap-year arithmetic
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 29 : 28;
}

/**
 * formatWallClock — pure string/integer formatter, no Date.
 * Input: canonical YYYY-MM-DDTHH:mm
 * Output: DD Mon YYYY, HH:mm
 */
function formatWallClock(canonical: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(canonical)) {
    throw new Error(RENDERING_ERROR);
  }

  const tIdx     = canonical.indexOf("T");
  const datePart = canonical.slice(0, tIdx);
  const timePart = canonical.slice(tIdx + 1);

  const yearStr   = datePart.slice(0, 4);
  const monthStr  = datePart.slice(5, 7);
  const dayStr    = datePart.slice(8, 10);
  const hourStr   = timePart.slice(0, 2);
  const minuteStr = timePart.slice(3, 5);

  const year   = parseInt(yearStr,   10);
  const month  = parseInt(monthStr,  10);
  const day    = parseInt(dayStr,    10);
  const hour   = parseInt(hourStr,   10);
  const minute = parseInt(minuteStr, 10);

  if (month  < 1  || month  > 12) throw new Error(RENDERING_ERROR);
  if (hour   < 0  || hour   > 23) throw new Error(RENDERING_ERROR);
  if (minute < 0  || minute > 59) throw new Error(RENDERING_ERROR);

  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) throw new Error(RENDERING_ERROR);

  const dd  = dayStr.padStart(2, "0");
  const hh  = hourStr.padStart(2, "0");
  const mm  = minuteStr.padStart(2, "0");
  const mon = MONTH_NAMES[month - 1];

  return `${dd} ${mon} ${year}, ${hh}:${mm}`;
}

/**
 * formatEurCents — integer-only EUR formatter.
 * Requires Number.isSafeInteger(cents) and cents >= 0.
 */
function formatEurCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error(RENDERING_ERROR);
  if (cents < 0)                    throw new Error(RENDERING_ERROR);
  const euros     = Math.floor(cents / 100);
  const centsPart = cents % 100;
  return `${euros}.${String(centsPart).padStart(2, "0")} EUR`;
}

// ── HTML and text builders ────────────────────────────────────────────────────

function buildHtml(
  brand:      string,
  input:      RegionalStaffNotification,
  pickupFmt:  string,
  dropoffFmt: string,
  amountFmt:  string,
): string {
  const e          = escHtml;
  const brandE     = e(brand);
  const refE       = e(input.reference);
  const nameE      = e(input.customerName);
  const emailE     = e(input.customerEmail);
  const phoneE     = e(input.customerPhone);
  const pickupE    = e(pickupFmt);
  const dropoffE   = e(dropoffFmt);
  const pickupLocE = e(input.pickupLocationName);
  const dropoffLocE = e(input.dropoffLocationName);
  const vehicleE   = e(input.vehicleModelName);
  const amountE    = e(amountFmt);
  const currencyE  = e(input.currency);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>New ${brandE} Booking</title>
</head>
<body style="font-family:Arial,sans-serif;color:#333;">
<h2>New ${brandE} Booking</h2>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
  <tbody>
    <tr><th align="left">Brand / Source</th><td>${brandE}</td></tr>
    <tr><th align="left">Booking Reference</th><td>${refE}</td></tr>
    <tr><th align="left">Booking ID</th><td>${input.bookingId}</td></tr>
    <tr><th align="left">Customer Name</th><td>${nameE}</td></tr>
    <tr><th align="left">Customer Email</th><td>${emailE}</td></tr>
    <tr><th align="left">Customer Phone</th><td>${phoneE}</td></tr>
    <tr><th align="left">Pickup</th><td>${pickupE}</td></tr>
    <tr><th align="left">Drop-off</th><td>${dropoffE}</td></tr>
    <tr><th align="left">Pickup Location</th><td>${pickupLocE}</td></tr>
    <tr><th align="left">Drop-off Location</th><td>${dropoffLocE}</td></tr>
    <tr><th align="left">Vehicle</th><td>${vehicleE}</td></tr>
    <tr><th align="left">Total Amount</th><td>${amountE}</td></tr>
    <tr><th align="left">Currency</th><td>${currencyE}</td></tr>
  </tbody>
</table>
</body>
</html>`;
}

function buildText(
  brand:      string,
  input:      RegionalStaffNotification,
  pickupFmt:  string,
  dropoffFmt: string,
  amountFmt:  string,
): string {
  return [
    `New ${brand} Booking`,
    ``,
    `Brand / Source: ${brand}`,
    `Booking Reference: ${input.reference}`,
    `Booking ID: ${input.bookingId}`,
    `Customer Name: ${input.customerName}`,
    `Customer Email: ${input.customerEmail}`,
    `Customer Phone: ${input.customerPhone}`,
    `Pickup: ${pickupFmt}`,
    `Drop-off: ${dropoffFmt}`,
    `Pickup Location: ${input.pickupLocationName}`,
    `Drop-off Location: ${input.dropoffLocationName}`,
    `Vehicle: ${input.vehicleModelName}`,
    `Total Amount: ${amountFmt}`,
    `Currency: ${input.currency}`,
  ].join("\n");
}

// ── Public exports ────────────────────────────────────────────────────────────

export interface RegionalStaffEmailContent {
  readonly subject: string;
  readonly html:    string;
  readonly text:    string;
}

export function renderRegionalStaffEmail(
  input: RegionalStaffNotification,
): RegionalStaffEmailContent {
  const brand      = brandLabel(input.brandCode);
  const pickupFmt  = formatWallClock(input.pickupDatetime);
  const dropoffFmt = formatWallClock(input.dropoffDatetime);
  const amountFmt  = formatEurCents(input.totalAmountCents);

  const subject = guardSubjectHeader(
    `New ${brand} Booking \u2013 ${input.reference}`,
  );

  const html = buildHtml(brand, input, pickupFmt, dropoffFmt, amountFmt);
  const text = buildText(brand, input, pickupFmt, dropoffFmt, amountFmt);

  return { subject, html, text };
}
