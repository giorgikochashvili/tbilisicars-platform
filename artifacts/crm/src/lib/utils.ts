import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TBS_LOCALE = "en-GB";
const TBS_TZ = "Asia/Tbilisi";

export function formatDateTime(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(TBS_LOCALE, {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: TBS_TZ, hour12: false,
    }).format(typeof date === "string" ? new Date(date) : date);
  } catch {
    return "—";
  }
}

export function formatDate(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(TBS_LOCALE, {
      day: "2-digit", month: "short", year: "numeric",
      timeZone: TBS_TZ,
    }).format(typeof date === "string" ? new Date(date) : date);
  } catch {
    return "—";
  }
}

export function formatTime(date: Date | string): string {
  try {
    return new Intl.DateTimeFormat(TBS_LOCALE, {
      hour: "2-digit", minute: "2-digit",
      timeZone: TBS_TZ, hour12: false,
    }).format(typeof date === "string" ? new Date(date) : date);
  } catch {
    return "—";
  }
}

export function formatMoney(value: string | number | null | undefined): string {
  if (!value) return "₾0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "₾0.00";
  return "₾" + num.toFixed(2);
}

const CURRENCY_SYMBOL: Record<string, string> = { GEL: "₾", USD: "$", EUR: "€" };

export function formatBookingAmount(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): string {
  const sym = CURRENCY_SYMBOL[currency ?? "GEL"] ?? "₾";
  if (!amount) return `${sym}0.00`;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${sym}0.00`;
  return sym + num.toFixed(2);
}
