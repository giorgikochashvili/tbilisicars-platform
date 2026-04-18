/**
 * audit-uploads
 *
 * Developer utility — NOT an API route, NOT run at startup.
 * Call runUploadAudit() manually when investigating missing vehicle images.
 *
 * Queries all DB tables that may store /api/storage/local-uploads/<filename> paths,
 * extracts filenames, and checks which files are absent from every known upload directory.
 *
 * Usage (from a one-off script or REPL):
 *   import { runUploadAudit } from "./lib/audit-uploads.js";
 *   const report = await runUploadAudit();
 *   console.log(report);
 */

import fs from "fs";
import path from "path";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { PRIMARY, LEGACY } from "./uploads-dir.js";

const LOCAL_UPLOADS_PREFIX = "/api/storage/local-uploads/";

function extractFilename(urlPath: string): string | null {
  if (!urlPath.startsWith(LOCAL_UPLOADS_PREFIX)) return null;
  return urlPath.slice(LOCAL_UPLOADS_PREFIX.length).split("/")[0] ?? null;
}

function fileExistsInAnyDir(filename: string, dirs: string[]): { exists: boolean; dir: string | null } {
  for (const dir of dirs) {
    try {
      fs.accessSync(path.join(dir, filename), fs.constants.R_OK);
      return { exists: true, dir };
    } catch {
      // not in this dir
    }
  }
  return { exists: false, dir: null };
}

export async function runUploadAudit(): Promise<{
  checked: number;
  missing: string[];
  found: { filename: string; dir: string }[];
}> {
  const allDirs = [PRIMARY, ...LEGACY];

  const rawPaths: string[] = [];

  // vehicle_model.image_url
  const models = await db.execute(
    sql`SELECT image_url FROM vehicle_model WHERE image_url IS NOT NULL`,
  );
  for (const row of models.rows as { image_url: string }[]) {
    if (row.image_url) rawPaths.push(row.image_url);
  }

  // vehicle_model_photo.photo_url
  const modelPhotos = await db.execute(
    sql`SELECT photo_url FROM vehicle_model_photo WHERE photo_url IS NOT NULL`,
  );
  for (const row of modelPhotos.rows as { photo_url: string }[]) {
    if (row.photo_url) rawPaths.push(row.photo_url);
  }

  // homepage_featured_slider.image_url
  const sliderItems = await db.execute(
    sql`SELECT image_url FROM homepage_featured_slider WHERE image_url IS NOT NULL`,
  );
  for (const row of sliderItems.rows as { image_url: string }[]) {
    if (row.image_url) rawPaths.push(row.image_url);
  }

  // bookingphoto.photo_url
  const bookingPhotos = await db.execute(
    sql`SELECT photo_url FROM bookingphoto WHERE photo_url IS NOT NULL`,
  );
  for (const row of bookingPhotos.rows as { photo_url: string }[]) {
    if (row.photo_url) rawPaths.push(row.photo_url);
  }

  // damagereport.photo_urls (stored as JSON text array)
  const damageReports = await db.execute(
    sql`SELECT photo_urls FROM damagereport WHERE photo_urls IS NOT NULL`,
  );
  for (const row of damageReports.rows as { photo_urls: string }[]) {
    if (!row.photo_urls) continue;
    try {
      const urls: unknown = JSON.parse(row.photo_urls);
      if (Array.isArray(urls)) {
        for (const u of urls) {
          if (typeof u === "string") rawPaths.push(u);
        }
      }
    } catch {
      // malformed JSON — skip
    }
  }

  // Deduplicate and filter to local-uploads paths only
  const localPaths = [...new Set(rawPaths)].filter((p) =>
    p.startsWith(LOCAL_UPLOADS_PREFIX),
  );

  const missing: string[] = [];
  const found: { filename: string; dir: string }[] = [];

  for (const p of localPaths) {
    const filename = extractFilename(p);
    if (!filename) continue;
    const result = fileExistsInAnyDir(filename, allDirs);
    if (result.exists && result.dir) {
      found.push({ filename, dir: result.dir });
    } else {
      missing.push(filename);
    }
  }

  console.log(`[audit-uploads] dirs checked: [${allDirs.join(", ")}]`);
  console.log(`[audit-uploads] total local-uploads references: ${localPaths.length}`);
  console.log(`[audit-uploads] found: ${found.length}  missing: ${missing.length}`);
  if (missing.length > 0) {
    console.log("[audit-uploads] missing files:", missing);
  }

  return { checked: localPaths.length, missing, found };
}
