import { db } from "@workspace/db";
import {
  homepageFeaturedSliderTable,
  companySettingsTable,
  brandTable,
  vehicleModelTable,
} from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SliderItemInput {
  title: string;
  subtitle?: string | null;
  badgeText?: string | null;
  displayPriceText: string;
  ctaLabel?: string | null;
  imageUrl: string;
  vehicleModelId: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface SliderSettingsInput {
  sectionTitle: string;
  sectionSubtitle: string;
  isSectionActive: boolean;
}

const SETTINGS_CATEGORY = "homepage_slider";
const DEFAULT_TITLE = "Choose Your Perfect Car";
const DEFAULT_SUBTITLE =
  "Browse a selection of our featured vehicles and start your journey across Georgia with comfort, style, and instant booking confirmation.";

// ─── Settings helpers ─────────────────────────────────────────────────────────

async function upsertSetting(key: string, value: string): Promise<void> {
  await db
    .insert(companySettingsTable)
    .values({ category: SETTINGS_CATEGORY, key, value })
    .onConflictDoUpdate({
      target: [companySettingsTable.category, companySettingsTable.key],
      set: { value, updatedAt: new Date() },
    });
}

export async function getSliderSettings(): Promise<{
  sectionTitle: string;
  sectionSubtitle: string;
  isSectionActive: boolean;
}> {
  const rows = await db
    .select({ key: companySettingsTable.key, value: companySettingsTable.value })
    .from(companySettingsTable)
    .where(eq(companySettingsTable.category, SETTINGS_CATEGORY));

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value ?? "";
  }

  return {
    sectionTitle: map["sectionTitle"] ?? DEFAULT_TITLE,
    sectionSubtitle: map["sectionSubtitle"] ?? DEFAULT_SUBTITLE,
    isSectionActive: map["isSectionActive"] !== "false",
  };
}

export async function saveSliderSettings(input: SliderSettingsInput): Promise<void> {
  await Promise.all([
    upsertSetting("sectionTitle", input.sectionTitle),
    upsertSetting("sectionSubtitle", input.sectionSubtitle),
    upsertSetting("isSectionActive", input.isSectionActive ? "true" : "false"),
  ]);
}

// ─── Item helpers ─────────────────────────────────────────────────────────────

function modelJoin() {
  return db
    .select({
      id: homepageFeaturedSliderTable.id,
      title: homepageFeaturedSliderTable.title,
      subtitle: homepageFeaturedSliderTable.subtitle,
      badgeText: homepageFeaturedSliderTable.badgeText,
      displayPriceText: homepageFeaturedSliderTable.displayPriceText,
      ctaLabel: homepageFeaturedSliderTable.ctaLabel,
      imageUrl: homepageFeaturedSliderTable.imageUrl,
      vehicleModelId: homepageFeaturedSliderTable.vehicleModelId,
      sortOrder: homepageFeaturedSliderTable.sortOrder,
      isActive: homepageFeaturedSliderTable.isActive,
      createdAt: homepageFeaturedSliderTable.createdAt,
      updatedAt: homepageFeaturedSliderTable.updatedAt,
      brandName: brandTable.name,
      modelName: vehicleModelTable.name,
    })
    .from(homepageFeaturedSliderTable)
    .leftJoin(
      vehicleModelTable,
      eq(homepageFeaturedSliderTable.vehicleModelId, vehicleModelTable.id),
    )
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id));
}

export async function listSliderItems() {
  return modelJoin().orderBy(
    asc(homepageFeaturedSliderTable.sortOrder),
    asc(homepageFeaturedSliderTable.createdAt),
  );
}

export async function listActiveSliderItems() {
  return modelJoin()
    .where(eq(homepageFeaturedSliderTable.isActive, true))
    .orderBy(
      asc(homepageFeaturedSliderTable.sortOrder),
      asc(homepageFeaturedSliderTable.createdAt),
    );
}

export async function getSliderItem(id: number) {
  const rows = await modelJoin().where(
    eq(homepageFeaturedSliderTable.id, id),
  );
  if (!rows[0]) throw new NotFoundError("Slider item not found");
  return rows[0];
}

export async function createSliderItem(input: SliderItemInput) {
  const [row] = await db
    .insert(homepageFeaturedSliderTable)
    .values({
      title: input.title,
      subtitle: input.subtitle ?? null,
      badgeText: input.badgeText ?? null,
      displayPriceText: input.displayPriceText,
      ctaLabel: input.ctaLabel ?? null,
      imageUrl: input.imageUrl,
      vehicleModelId: input.vehicleModelId,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    .returning({ id: homepageFeaturedSliderTable.id });
  return getSliderItem(row.id);
}

export async function updateSliderItem(id: number, input: Partial<SliderItemInput>) {
  await getSliderItem(id);
  await db
    .update(homepageFeaturedSliderTable)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.subtitle !== undefined && { subtitle: input.subtitle }),
      ...(input.badgeText !== undefined && { badgeText: input.badgeText }),
      ...(input.displayPriceText !== undefined && { displayPriceText: input.displayPriceText }),
      ...(input.ctaLabel !== undefined && { ctaLabel: input.ctaLabel }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(input.vehicleModelId !== undefined && { vehicleModelId: input.vehicleModelId }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(homepageFeaturedSliderTable.id, id));
  return getSliderItem(id);
}

export async function deleteSliderItem(id: number): Promise<void> {
  await getSliderItem(id);
  await db
    .delete(homepageFeaturedSliderTable)
    .where(eq(homepageFeaturedSliderTable.id, id));
}
