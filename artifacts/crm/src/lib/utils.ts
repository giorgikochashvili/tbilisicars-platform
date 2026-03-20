import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
