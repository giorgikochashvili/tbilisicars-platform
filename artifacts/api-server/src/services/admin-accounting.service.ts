import { db, pool } from "@workspace/db";
import {
  accountingEntriesTable,
  exchangeRatesTable,
  fixedExpenseTemplatesTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, asc } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

// ─── Categories ────────────────────────────────────────────────────────────────

export const INCOME_CATEGORIES = [
  "Booking Payment",
  "Extra Payment",
  "Extra Days Payment",
  "Advance Payment",
  "Other Income",
] as const;

export const EXPENSE_CATEGORIES = [
  "Service / Maintenance",
  "Fuel",
  "Refund",
  "Office Expense",
  "Salary",
  "Marketing",
  "Airport Office Fee",
  "Parking Fee",
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
  city?: string;
  page?: number;
  limit?: number;
}

export async function listAccountingEntries(params: ListAccountingParams = {}) {
  const { type, category, currency, dateFrom, dateTo, city, page = 1, limit = 50 } = params;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (type) conditions.push(eq(accountingEntriesTable.type, type));
  if (category) conditions.push(eq(accountingEntriesTable.category, category));
  if (currency) conditions.push(eq(accountingEntriesTable.currency, currency));
  if (dateFrom) conditions.push(gte(accountingEntriesTable.entryDate, dateFrom));
  if (dateTo) conditions.push(lte(accountingEntriesTable.entryDate, dateTo));
  if (city) {
    conditions.push(
      sql`(${accountingEntriesTable.relatedBookingId} IS NOT NULL AND EXISTS (
        SELECT 1 FROM booking b
        JOIN location l ON l.id = b.pickup_location_id
        WHERE b.id = ${accountingEntriesTable.relatedBookingId}
        AND LOWER(l.city) = LOWER(${city})
      ))`,
    );
  }

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
  const { rows } = await pool.query(
    `SELECT
      ae.*,
      b.id                 AS booking_ref_id,
      u.full_name          AS customer_name,
      u.email              AS customer_email,
      u.phone              AS customer_phone,
      v.license_plate      AS vehicle_plate,
      vm.name              AS vehicle_model_name,
      br.name              AS vehicle_brand_name,
      bp.method            AS payment_method,
      bp.payment_type      AS payment_type_detail
    FROM accounting_entries ae
    LEFT JOIN booking b        ON b.id   = ae.related_booking_id
    LEFT JOIN "user" u         ON u.id   = b.user_id
    LEFT JOIN vehicle v        ON v.id   = COALESCE(ae.related_vehicle_id, b.vehicle_id)
    LEFT JOIN vehicle_model vm ON vm.id  = v.vehicle_model_id
    LEFT JOIN brand br         ON br.id  = vm.brand_id
    LEFT JOIN booking_payment bp ON bp.accounting_entry_id = ae.id
    WHERE ae.id = $1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundError(`Accounting entry ${id} not found`);
  return rows[0] as typeof rows[0] & {
    booking_ref_id: number | null;
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    vehicle_plate: string | null;
    vehicle_model_name: string | null;
    vehicle_brand_name: string | null;
    payment_method: string | null;
    payment_type_detail: string | null;
  };
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

// ─── Fixed Expense Templates ──────────────────────────────────────────────────
//
// Templates are NOT accounting entries. They are definitions of recurring
// expenses. An accounting_entries EXPENSE row is created only when staff
// manually calls postFixedExpenseForMonth().

export async function listFixedExpenseTemplates(activeOnly = false) {
  const rows = await db
    .select()
    .from(fixedExpenseTemplatesTable)
    .where(activeOnly ? eq(fixedExpenseTemplatesTable.isActive, true) : undefined)
    .orderBy(asc(fixedExpenseTemplatesTable.name));
  return rows;
}

export interface CreateFixedExpenseTemplateInput {
  name: string;
  category: string;
  amount: number;
  currency: "GEL" | "USD" | "EUR";
  dueDay: number;
  notes?: string | null;
  createdById?: number | null;
}

export async function createFixedExpenseTemplate(
  input: CreateFixedExpenseTemplateInput,
) {
  const [row] = await db
    .insert(fixedExpenseTemplatesTable)
    .values({
      name: input.name.trim(),
      category: input.category,
      amount: String(input.amount),
      currency: input.currency,
      dueDay: input.dueDay,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
      isActive: true,
    })
    .returning();
  return row;
}

export interface UpdateFixedExpenseTemplateInput {
  name?: string;
  category?: string;
  amount?: number;
  currency?: "GEL" | "USD" | "EUR";
  dueDay?: number;
  notes?: string | null;
  isActive?: boolean;
}

export async function updateFixedExpenseTemplate(
  id: number,
  input: UpdateFixedExpenseTemplateInput,
) {
  const [existing] = await db
    .select()
    .from(fixedExpenseTemplatesTable)
    .where(eq(fixedExpenseTemplatesTable.id, id))
    .limit(1);
  if (!existing) throw new NotFoundError(`Fixed expense template ${id} not found`);

  const [row] = await db
    .update(fixedExpenseTemplatesTable)
    .set({
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.amount !== undefined && { amount: String(input.amount) }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.dueDay !== undefined && { dueDay: input.dueDay }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(fixedExpenseTemplatesTable.id, id))
    .returning();
  return row;
}

export async function deleteFixedExpenseTemplate(id: number) {
  const [existing] = await db
    .select()
    .from(fixedExpenseTemplatesTable)
    .where(eq(fixedExpenseTemplatesTable.id, id))
    .limit(1);
  if (!existing) throw new NotFoundError(`Fixed expense template ${id} not found`);

  // Block hard-delete if this template has already been posted to accounting.
  // Staff should deactivate instead to preserve historical entries.
  const [{ postCount }] = await db
    .select({ postCount: sql<number>`count(*)::int` })
    .from(accountingEntriesTable)
    .where(eq(accountingEntriesTable.fixedExpenseTemplateId, id));

  if (postCount > 0) {
    throw Object.assign(
      new Error(
        `Template has ${postCount} posted accounting ${postCount === 1 ? "entry" : "entries"} and cannot be deleted. Deactivate it instead.`,
      ),
      { code: "HAS_POSTS", postCount },
    );
  }

  await db
    .delete(fixedExpenseTemplatesTable)
    .where(eq(fixedExpenseTemplatesTable.id, id));
  return { message: "Fixed expense template deleted" };
}

// ─── Post Fixed Expense For Month ─────────────────────────────────────────────
//
// Creates exactly one accounting_entries EXPENSE row for the given template
// and month (YYYY-MM). Duplicate posts are blocked at both application and
// DB level (unique partial index uq_fixed_expense_post).

export async function postFixedExpenseForMonth(
  templateId: number,
  month: string,
  adminId?: number,
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("month must be in YYYY-MM format");
  }

  const [template] = await db
    .select()
    .from(fixedExpenseTemplatesTable)
    .where(eq(fixedExpenseTemplatesTable.id, templateId))
    .limit(1);
  if (!template) throw new NotFoundError(`Fixed expense template ${templateId} not found`);
  if (!template.isActive) {
    throw new Error("Cannot post an inactive fixed expense template");
  }

  // Application-layer duplicate guard (readable error before hitting the DB constraint)
  const [{ existing }] = await db
    .select({ existing: sql<number>`count(*)::int` })
    .from(accountingEntriesTable)
    .where(
      and(
        eq(accountingEntriesTable.fixedExpenseTemplateId, templateId),
        eq(accountingEntriesTable.fixedExpenseMonth, month),
      ),
    );
  if (existing > 0) {
    throw Object.assign(
      new Error(`Fixed expense "${template.name}" has already been posted for ${month}`),
      { code: "DUPLICATE_POST" },
    );
  }

  // Compute entryDate: use template's due_day clamped to the last day of the month
  const [year, mon] = month.split("-").map(Number);
  const lastDayOfMonth = new Date(year, mon, 0).getDate();
  const day = Math.min(template.dueDay, lastDayOfMonth);
  const entryDate = `${month}-${String(day).padStart(2, "0")}`;

  const currency = template.currency as "GEL" | "USD" | "EUR";
  const amount = parseFloat(String(template.amount));

  const rate = await getExchangeRate();
  const convertedGel = rate
    ? convertToGel(amount, currency, rate)
    : currency === "GEL"
      ? amount
      : amount;

  const baseNotes = `Fixed expense: ${template.name} (${month})`;
  const notes = template.notes
    ? `${baseNotes} — ${template.notes}`
    : baseNotes;

  const [entry] = await db
    .insert(accountingEntriesTable)
    .values({
      type: "EXPENSE",
      category: template.category,
      amount: String(amount),
      currency,
      convertedGel: convertedGel.toFixed(2),
      entryDate,
      notes,
      adminId: adminId ?? null,
      fixedExpenseTemplateId: templateId,
      fixedExpenseMonth: month,
    })
    .returning();

  return { entry, template };
}

// ─── Check Posted Months ──────────────────────────────────────────────────────
//
// Returns the set of YYYY-MM months for which a template has already been posted.
// Used by the CRM to show "Already Posted" badges next to template rows.

export async function getPostedMonthsForTemplate(templateId: number) {
  const rows = await db
    .select({ month: accountingEntriesTable.fixedExpenseMonth })
    .from(accountingEntriesTable)
    .where(eq(accountingEntriesTable.fixedExpenseTemplateId, templateId));
  return rows.map((r) => r.month).filter(Boolean) as string[];
}
