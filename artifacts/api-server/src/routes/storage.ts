import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import express, { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAdmin } from "../middlewares/requireAdmin.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "local-uploads");

function getExtFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  return map[contentType.toLowerCase()] || ".png";
}

function getMimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * Falls back to local file storage when PRIVATE_OBJECT_DIR is not configured.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  if (!process.env.PRIVATE_OBJECT_DIR) {
    const ext = getExtFromContentType(contentType);
    const filename = randomUUID() + ext;
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const host = req.get("x-forwarded-host") || req.get("host") || `localhost:${process.env.PORT ?? 8080}`;
    const baseUrl = `${proto}://${host}`;
    const uploadURL = `${baseUrl}/api/storage/local-uploads/${filename}`;
    const objectPath = `/api/storage/local-uploads/${filename}`;

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const internalPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const objectPath = internalPath.startsWith("/objects/")
      ? `/api/storage${internalPath}`
      : internalPath;

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    console.warn("Object storage unavailable, falling back to local uploads:", (error as Error).message);
    const ext = getExtFromContentType(contentType);
    const filename = randomUUID() + ext;
    const proto = req.get("x-forwarded-proto") || req.protocol;
    const host = req.get("x-forwarded-host") || req.get("host") || `localhost:${process.env.PORT ?? 8080}`;
    const baseUrl = `${proto}://${host}`;
    const uploadURL = `${baseUrl}/api/storage/local-uploads/${filename}`;
    const objectPath = `/api/storage/local-uploads/${filename}`;
    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  }
});

/**
 * PUT /storage/local-uploads/:filename
 *
 * Direct file upload to local disk (fallback when object storage is not configured).
 * The browser PUT request carries the raw file body.
 */
router.put(
  "/storage/local-uploads/:filename",
  express.raw({ type: "*/*", limit: "25mb" }),
  async (req: Request, res: Response) => {
    const { filename } = req.params;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.[a-z]{2,5}$/.test(filename)) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }
    try {
      await fs.promises.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
      await fs.promises.writeFile(
        path.join(LOCAL_UPLOADS_DIR, filename),
        req.body as Buffer,
      );
      res.status(200).end();
    } catch (err) {
      console.error("Error saving local upload", err);
      res.status(500).json({ error: "Failed to save file" });
    }
  },
);

/**
 * GET /storage/local-uploads/:filename
 *
 * Serve locally stored upload files.
 */
router.get("/storage/local-uploads/:filename", async (req: Request, res: Response) => {
  const { filename } = req.params;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.[a-z]{2,5}$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const filePath = path.join(LOCAL_UPLOADS_DIR, filename);
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    const ext = path.extname(filename).toLowerCase();
    res.setHeader("Content-Type", getMimeFromExt(ext));
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Error serving public object", error);
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", requireAdmin, async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      console.warn("Object not found", error);
      res.status(404).json({ error: "Object not found" });
      return;
    }
    console.error("Error serving object", error);
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
