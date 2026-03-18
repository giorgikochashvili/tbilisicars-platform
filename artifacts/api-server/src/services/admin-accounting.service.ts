import { db } from "@workspace/db";
import { accountingEntriesTable, exchangeRatesTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

// ─── Categories ────────────────────────────────────────────────────────────────

export const INCOME_CATEGORIES = [
  "Booking Payment",
  "Extra Payment",
  "Deposit Received",
  "Other Income",
] as const;

export const EXPENSE_CATEGORIES = [
  "Service / Maintenance",
  "Delivery / Transport",
  "Fuel",
  "Refund",
  "Office Expense",
  "Salary",
  "Marketing",
  "Other Expense",
] as const;

// ─── Exchange Rate ─────────────────────────────────────────────────────────────

export async function getExchangeRate() {
  const [rate] = await db
    .select()
    .from(exchangeRatesTable)
    .orderBy(desc(exchangeRatesTable.updatedAt))
    .limit(1);
  return rate ?? null;
}

export async function upsertExchangeRate(usdToGel: string, eurToGel: string) {
  const existing = await getExchangeRate();
  if (existing) {
    const [updated] = await db
      .update(exchangeRatesTable)
      .set({ usdToGel, eurToGel, updatedAt: new Date() })
      .where(eq(exchangeRatesTable.id, existing.id))
      .returning();
    return updated;
  }
  const [inserted] = await db
    .insert(exchangeRatesTable)
    .values({ usdToGel, eurToGel })
    .returning();
  return inserted;
}

export async function seedDefaultExchangeRate() {
  const existing = await getExchangeRate();
  if (!existing) {
    await db.insert(exchangeRatesTable).values({
      usdToGel: "2.7200",
      eurToGel: "2.9500",
    });
  }
}

export function convertToGel(
  amount: number,
  currency: "GEL" | "USD" | "EUR",
  rate: { usdToGel: string; eurToGel: string },
): number {
  if (currency === "GEL") return amount;
  if (currency === "USD") return Math.round(amount * parseFloat(rate.usdToGel) * 100) / 100;
  if (currency === "EUR") return Math.round(amount * parseFloat(rate.eurToGel) * 100) / 100;
  return amount;
}

// ─── List ──────────────────────────────────────────────────────────────────────

export interface ListAccountingParams {
  type?: "INCOME" | "EXPENSE";
  category?: string;
  currency?: "GEL" | "USD" | "EUR";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export async function listAccountingEntries(params: ListAccountingParams = {}) {
  const { type, category, currency, dateFrom, dateTo, page = 1, limit = 50 } = params;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (type) conditions.push(eq(accountingEntriesTable.type, type));
  if (category) conditions.push(eq(accountingEntriesTable.category, category));
  if (currency) conditions.push(eq(accountingEntriesTable.currency, currency));
  if (dateFrom) conditions.push(gte(accountingEntriesTable.entryDate, dateFrom));
  if (dateTo) conditions.push(lte(accountingEntriesTable.entryDate, dateTo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(accountingEntriesTable)
      .where(where)
      .orderBy(desc(accountingEntriesTable.entryDate), desc(accountingEntriesTable.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(accountingEntriesTable)
      .where(where),
  ]);

  return { data: rows, meta: { total: count, page, limit } };
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export async function getAccountingSummary() {
  const rows = await db
    .select({
      type: accountingEntriesTable.type,
      currency: accountingEntriesTable.currency,
      totalAmount: sql<string>`sum(${accountingEntriesTable.amount}::numeric)`,
      totalGel: sql<string>`sum(${accountingEntriesTable.convertedGel}::numeric)`,
    })
    .from(accountingEntriesTable)
    .groupBy(accountingEntriesTable.type, accountingEntriesTable.currency);

  const income: Record<string, number> = { GEL: 0, USD: 0, EUR: 0 };
  const expense: Record<string, number> = { GEL: 0, USD: 0, EUR: 0 };
  let totalIncomeGel = 0;
  let totalExpenseGel = 0;

  for (const row of rows) {
    const amount = parseFloat(row.totalAmount ?? "0");
    const gel = parseFloat(row.totalGel ?? "0");
    if (row.type === "INCOME") {
      income[row.currency!] = (income[row.currency!] ?? 0) + amount;
      totalIncomeGel += gel;
    } else {
      expense[row.currency!] = (expense[row.currency!] ?? 0) + amount;
      totalExpenseGel += gel;
    }
  }

  return {
    income,
    totalIncomeGel: Math.round(totalIncomeGel * 100) / 100,
    expense,
    totalExpenseGel: Math.round(totalExpenseGel * 100) / 100,
    netGel: Math.round((totalIncomeGel - totalExpenseGel) * 100) / 100,
  };
}

// ─── Single ───────────────────────────────────────────────────────────────────

export async function getAccountingEntry(id: number) {
  const [row] = await db
    .select()
    .from(accountingEntriesTable)
    .where(eq(accountingEntriesTable.id, id));
  if (!row) throw new NotFoundError(`Accounting entry ${id} not found`);
  return row;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export interface CreateAccountingEntryInput {
  type: "INCOME" | "EXPENSE";
  category: string;
  amount: string;
  currency: "GEL" | "USD" | "EUR";
  entryDate: string;
  notes?: string | null;
  relatedBookingId?: number | null;
  relatedVehicleId?: number | null;
  relatedServiceId?: number | null;
  adminId?: number | null;
  convertedGel?: string | null;
}

export async function createAccountingEntry(input: CreateAccountingEntryInput) {
  const rate = await getExchangeRate();
  const amountNum = parseFloat(input.amount);
  let gelAmount: string;
  if (input.convertedGel && input.currency !== "GEL") {
    gelAmount = input.convertedGel;
  } else {
    const converted = rate
      ? convertToGel(amountNum, input.currency, rate)
      : amountNum;
    gelAmount = converted.toFixed(2);
  }

  const [row] = await db
    .insert(accountingEntriesTable)
    .values({
      type: input.type,
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      convertedGel: gelAmount,
      entryDate: input.entryDate,
      notes: input.notes ?? null,
      relatedBookingId: input.relatedBookingId ?? null,
      relatedVehicleId: input.relatedVehicleId ?? null,
      relatedServiceId: input.relatedServiceId ?? null,
      adminId: input.adminId ?? null,
    })
    .returning();
  return row;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export interface UpdateAccountingEntryInput {
  type?: "INCOME" | "EXPENSE";
  category?: string;
  amount?: string;
  currency?: "GEL" | "USD" | "EUR";
  convertedGel?: string | null;
  entryDate?: string;
  notes?: string | null;
  relatedBookingId?: number | null;
  relatedVehicleId?: number | null;
  relatedServiceId?: number | null;
}

export async function updateAccountingEntry(
  id: number,
  input: UpdateAccountingEntryInput,
) {
  const existing = await getAccountingEntry(id);

  const currency = input.currency ?? existing.currency!;
  const amountStr = input.amount ?? existing.amount;
  const amountNum = parseFloat(amountStr);

  let gelAmount: string = existing.convertedGel;
  if (input.amount !== undefined || input.currency !== undefined) {
    if (input.convertedGel) {
      gelAmount = input.convertedGel;
    } else {
      const rate = await getExchangeRate();
      const converted = rate
        ? convertToGel(amountNum, currency as "GEL" | "USD" | "EUR", rate)
        : amountNum;
      gelAmount = converted.toFixed(2);
    }
  }

  const [row] = await db
    .update(accountingEntriesTable)
    .set({
      ...(input.type !== undefined && { type: input.type }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.amount !== undefined && { amount: input.amount }),
      ...(input.currency !== undefined && { currency: input.currency }),
      convertedGel: gelAmount,
      ...(input.entryDate !== undefined && { entryDate: input.entryDate }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.relatedBookingId !== undefined && { relatedBookingId: input.relatedBookingId }),
      ...(input.relatedVehicleId !== undefined && { relatedVehicleId: input.relatedVehicleId }),
      ...(input.relatedServiceId !== undefined && { relatedServiceId: input.relatedServiceId }),
      updatedAt: new Date(),
    })
    .where(eq(accountingEntriesTable.id, id))
    .returning();
  return row;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteAccountingEntry(id: number) {
  const [row] = await db
    .delete(accountingEntriesTable)
    .where(eq(accountingEntriesTable.id, id))
    .returning();
  if (!row) throw new NotFoundError(`Accounting entry ${id} not found`);
  return { message: "Accounting entry deleted" };
}
