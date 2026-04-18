import fs from "fs";
import path from "path";

const EXPLICIT_DIRS = [
  "/var/www/tbilisicars-platform/artifacts/api-server/local-uploads",
  "/root/local-uploads",
];

function resolveUploadsDir(): string {
  if (process.env.UPLOADS_DIR) return process.env.UPLOADS_DIR;
  for (const dir of EXPLICIT_DIRS) {
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(process.cwd(), "local-uploads");
}

function getLegacyUploadsDirs(primary: string): string[] {
  const allKnown = [
    ...EXPLICIT_DIRS,
    path.join(process.cwd(), "local-uploads"),
  ];
  return allKnown.filter((d) => d !== primary && fs.existsSync(d));
}

export const PRIMARY = resolveUploadsDir();
export const LEGACY = getLegacyUploadsDirs(PRIMARY);

console.log(`[UPLOADS] primary=${PRIMARY} legacy=[${LEGACY.join(", ")}]`);
