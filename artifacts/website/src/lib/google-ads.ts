declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const ADS_ID = "AW-18043925820";
const CONVERSION_LABEL = "Sy7mCPP_5q8cELzqgZxD";
const SEND_TO = `${ADS_ID}/${CONVERSION_LABEL}`;
const DEDUP_PREFIX = "tc_conv_";

export function trackBookingConversion(bookingId: number, _reference: string): void {
  try {
    const key = `${DEDUP_PREFIX}${bookingId}`;

    // 1. Check dedup — if already fired this session, skip
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      // sessionStorage unavailable (private mode, SecurityError) — skip dedup check, proceed
    }

    // 2. Guard — gtag not loaded (script blocked, not yet available)
    //    Return WITHOUT writing dedup key so a future call can still fire
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    // 3. Fire the conversion event
    window.gtag("event", "conversion", {
      send_to: SEND_TO,
      value: 1.0,
      currency: "USD",
      transaction_id: String(bookingId),
    });

    // 4. Mark as fired — only after the gtag call succeeds
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage write failed — non-fatal
    }
  } catch {
    // Outer safety net — tracking must never break the booking flow
  }
}
