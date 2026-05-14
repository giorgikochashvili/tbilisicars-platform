import { db } from "@workspace/db";
import {
  showroomSlideTable,
  showroomPlaylistTable,
  showroomPlaylistItemTable,
  showroomModelPriceTable,
  showroomSettingTable,
  vehicleModelTable,
  brandTable,
} from "@workspace/db";
import { eq, asc, inArray } from "drizzle-orm";
import { NotFoundError } from "../lib/errors.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlideInput {
  vehicleModelId?: number | null;
  titleEn?: string | null;
  titleHe?: string | null;
  titleAr?: string | null;
  bodyEn?: string | null;
  bodyHe?: string | null;
  bodyAr?: string | null;
  badgeEn?: string | null;
  badgeHe?: string | null;
  badgeAr?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export interface PlaylistInput {
  name: string;
  active?: boolean;
}

export interface PlaylistItemInput {
  slideId: number;
  position: number;
  durationSeconds?: number;
}

export interface PriceInput {
  priceUsd: string | null;
  active?: boolean;
}

export interface SettingsInput {
  usdToEurRate: string;
}

// ─── Slides ───────────────────────────────────────────────────────────────────

function slideQuery() {
  return db
    .select({
      id: showroomSlideTable.id,
      vehicleModelId: showroomSlideTable.vehicleModelId,
      titleEn: showroomSlideTable.titleEn,
      titleHe: showroomSlideTable.titleHe,
      titleAr: showroomSlideTable.titleAr,
      bodyEn: showroomSlideTable.bodyEn,
      bodyHe: showroomSlideTable.bodyHe,
      bodyAr: showroomSlideTable.bodyAr,
      badgeEn: showroomSlideTable.badgeEn,
      badgeHe: showroomSlideTable.badgeHe,
      badgeAr: showroomSlideTable.badgeAr,
      active: showroomSlideTable.active,
      sortOrder: showroomSlideTable.sortOrder,
      createdAt: showroomSlideTable.createdAt,
      updatedAt: showroomSlideTable.updatedAt,
      modelName: vehicleModelTable.name,
      modelImageUrl: vehicleModelTable.imageUrl,
      brandName: brandTable.name,
    })
    .from(showroomSlideTable)
    .leftJoin(vehicleModelTable, eq(showroomSlideTable.vehicleModelId, vehicleModelTable.id))
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id));
}

export async function listSlides() {
  return slideQuery().orderBy(asc(showroomSlideTable.sortOrder), asc(showroomSlideTable.createdAt));
}

export async function getSlide(id: number) {
  const rows = await slideQuery().where(eq(showroomSlideTable.id, id));
  if (!rows[0]) throw new NotFoundError("Slide not found");
  return rows[0];
}

export async function createSlide(input: SlideInput) {
  const [row] = await db
    .insert(showroomSlideTable)
    .values({
      vehicleModelId: input.vehicleModelId ?? null,
      titleEn: input.titleEn ?? null,
      titleHe: input.titleHe ?? null,
      titleAr: input.titleAr ?? null,
      bodyEn: input.bodyEn ?? null,
      bodyHe: input.bodyHe ?? null,
      bodyAr: input.bodyAr ?? null,
      badgeEn: input.badgeEn ?? null,
      badgeHe: input.badgeHe ?? null,
      badgeAr: input.badgeAr ?? null,
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning({ id: showroomSlideTable.id });
  return getSlide(row.id);
}

export async function updateSlide(id: number, input: Partial<SlideInput>) {
  await getSlide(id);
  await db
    .update(showroomSlideTable)
    .set({
      ...(input.vehicleModelId !== undefined && { vehicleModelId: input.vehicleModelId }),
      ...(input.titleEn !== undefined && { titleEn: input.titleEn }),
      ...(input.titleHe !== undefined && { titleHe: input.titleHe }),
      ...(input.titleAr !== undefined && { titleAr: input.titleAr }),
      ...(input.bodyEn !== undefined && { bodyEn: input.bodyEn }),
      ...(input.bodyHe !== undefined && { bodyHe: input.bodyHe }),
      ...(input.bodyAr !== undefined && { bodyAr: input.bodyAr }),
      ...(input.badgeEn !== undefined && { badgeEn: input.badgeEn }),
      ...(input.badgeHe !== undefined && { badgeHe: input.badgeHe }),
      ...(input.badgeAr !== undefined && { badgeAr: input.badgeAr }),
      ...(input.active !== undefined && { active: input.active }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      updatedAt: new Date(),
    })
    .where(eq(showroomSlideTable.id, id));
  return getSlide(id);
}

export async function deleteSlide(id: number): Promise<void> {
  await getSlide(id);
  await db.delete(showroomSlideTable).where(eq(showroomSlideTable.id, id));
}

// ─── Playlists ────────────────────────────────────────────────────────────────

export async function listPlaylists() {
  return db
    .select()
    .from(showroomPlaylistTable)
    .orderBy(asc(showroomPlaylistTable.createdAt));
}

export async function getPlaylist(id: number) {
  const [playlist] = await db
    .select()
    .from(showroomPlaylistTable)
    .where(eq(showroomPlaylistTable.id, id));
  if (!playlist) throw new NotFoundError("Playlist not found");

  const items = await db
    .select({
      id: showroomPlaylistItemTable.id,
      playlistId: showroomPlaylistItemTable.playlistId,
      slideId: showroomPlaylistItemTable.slideId,
      position: showroomPlaylistItemTable.position,
      durationSeconds: showroomPlaylistItemTable.durationSeconds,
      slideTitleEn: showroomSlideTable.titleEn,
      slideModelId: showroomSlideTable.vehicleModelId,
      slideModelImageUrl: vehicleModelTable.imageUrl,
      slideModelName: vehicleModelTable.name,
      slideBrandName: brandTable.name,
    })
    .from(showroomPlaylistItemTable)
    .leftJoin(showroomSlideTable, eq(showroomPlaylistItemTable.slideId, showroomSlideTable.id))
    .leftJoin(vehicleModelTable, eq(showroomSlideTable.vehicleModelId, vehicleModelTable.id))
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .where(eq(showroomPlaylistItemTable.playlistId, id))
    .orderBy(asc(showroomPlaylistItemTable.position));

  return { ...playlist, items };
}

export async function createPlaylist(input: PlaylistInput) {
  const [row] = await db
    .insert(showroomPlaylistTable)
    .values({ name: input.name, active: input.active ?? true })
    .returning({ id: showroomPlaylistTable.id });
  return getPlaylist(row.id);
}

export async function updatePlaylist(id: number, input: Partial<PlaylistInput>) {
  const [existing] = await db
    .select()
    .from(showroomPlaylistTable)
    .where(eq(showroomPlaylistTable.id, id));
  if (!existing) throw new NotFoundError("Playlist not found");
  await db
    .update(showroomPlaylistTable)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.active !== undefined && { active: input.active }),
      updatedAt: new Date(),
    })
    .where(eq(showroomPlaylistTable.id, id));
  return getPlaylist(id);
}

export async function deletePlaylist(id: number): Promise<void> {
  const [existing] = await db
    .select()
    .from(showroomPlaylistTable)
    .where(eq(showroomPlaylistTable.id, id));
  if (!existing) throw new NotFoundError("Playlist not found");
  await db.delete(showroomPlaylistTable).where(eq(showroomPlaylistTable.id, id));
}

export async function replacePlaylistItems(
  playlistId: number,
  items: PlaylistItemInput[],
) {
  const [existing] = await db
    .select()
    .from(showroomPlaylistTable)
    .where(eq(showroomPlaylistTable.id, playlistId));
  if (!existing) throw new NotFoundError("Playlist not found");

  await db
    .delete(showroomPlaylistItemTable)
    .where(eq(showroomPlaylistItemTable.playlistId, playlistId));

  if (items.length > 0) {
    await db.insert(showroomPlaylistItemTable).values(
      items.map((item) => ({
        playlistId,
        slideId: item.slideId,
        position: item.position,
        durationSeconds: item.durationSeconds ?? 8,
      })),
    );
  }

  return getPlaylist(playlistId);
}

// ─── Prices ───────────────────────────────────────────────────────────────────

export async function listPrices() {
  return db
    .select({
      id: showroomModelPriceTable.id,
      vehicleModelId: showroomModelPriceTable.vehicleModelId,
      priceUsd: showroomModelPriceTable.priceUsd,
      active: showroomModelPriceTable.active,
      updatedAt: showroomModelPriceTable.updatedAt,
      modelName: vehicleModelTable.name,
      modelImageUrl: vehicleModelTable.imageUrl,
      brandName: brandTable.name,
      category: vehicleModelTable.category,
    })
    .from(showroomModelPriceTable)
    .leftJoin(vehicleModelTable, eq(showroomModelPriceTable.vehicleModelId, vehicleModelTable.id))
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .orderBy(asc(vehicleModelTable.category), asc(vehicleModelTable.name));
}

export async function upsertPrice(vehicleModelId: number, input: PriceInput) {
  const [existing] = await db
    .select()
    .from(showroomModelPriceTable)
    .where(eq(showroomModelPriceTable.vehicleModelId, vehicleModelId));

  if (existing) {
    await db
      .update(showroomModelPriceTable)
      .set({
        priceUsd: input.priceUsd,
        ...(input.active !== undefined && { active: input.active }),
        updatedAt: new Date(),
      })
      .where(eq(showroomModelPriceTable.vehicleModelId, vehicleModelId));
  } else {
    await db.insert(showroomModelPriceTable).values({
      vehicleModelId,
      priceUsd: input.priceUsd,
      active: input.active ?? true,
    });
  }

  const [row] = await db
    .select({
      id: showroomModelPriceTable.id,
      vehicleModelId: showroomModelPriceTable.vehicleModelId,
      priceUsd: showroomModelPriceTable.priceUsd,
      active: showroomModelPriceTable.active,
      updatedAt: showroomModelPriceTable.updatedAt,
      modelName: vehicleModelTable.name,
      brandName: brandTable.name,
      category: vehicleModelTable.category,
    })
    .from(showroomModelPriceTable)
    .leftJoin(vehicleModelTable, eq(showroomModelPriceTable.vehicleModelId, vehicleModelTable.id))
    .leftJoin(brandTable, eq(vehicleModelTable.brandId, brandTable.id))
    .where(eq(showroomModelPriceTable.vehicleModelId, vehicleModelId));

  return row;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  const [row] = await db.select().from(showroomSettingTable).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(showroomSettingTable)
    .values({ usdToEurRate: "0.920000" })
    .returning();
  return created;
}

export async function updateSettings(input: SettingsInput) {
  const existing = await getSettings();
  await db
    .update(showroomSettingTable)
    .set({ usdToEurRate: input.usdToEurRate, updatedAt: new Date() })
    .where(eq(showroomSettingTable.id, existing.id));
  return getSettings();
}
