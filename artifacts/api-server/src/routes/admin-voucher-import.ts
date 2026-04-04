/**
 * Admin Voucher Import Routes
 *
 * POST /api/admin/voucher-import/extract       — upload image/PDF, run AI extraction
 * POST /api/admin/voucher-import/duplicate-check — check if voucher already imported
 * POST /api/admin/voucher-import/confirm       — save booking with reservation code
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import multer from "multer";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import { ValidationError } from "../lib/errors.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  extractVoucherFromImage,
  extractVoucherFromText,
  checkVoucherDuplicate,
  confirmVoucherImport,
} from "../services/admin-voucher-import.service.js";

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), "local-uploads");
const objectStorageService = new ObjectStorageService();

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

/**
 * Store the uploaded voucher file using the existing storage infrastructure:
 * - When PRIVATE_OBJECT_DIR is configured: request a presigned PUT URL from GCS,
 *   then PUT the buffer to it, then return the normalised objectPath.
 * - Fallback: write directly to the local-uploads directory (same path format
 *   as the /storage/uploads/request-url local fallback).
 */
async function storeVoucherFile(buffer: Buffer, mimeType: string): Promise<string> {
  const ext = MIME_TO_EXT[mimeType] ?? ".bin";

  if (process.env.PRIVATE_OBJECT_DIR) {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      await fetch(uploadURL, {
        method: "PUT",
        body: buffer,
        headers: { "Content-Type": mimeType },
      });
      const internalPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      return internalPath.startsWith("/objects/")
        ? `/api/storage${internalPath}`
        : internalPath;
    } catch (err) {
      console.warn("[voucher-import] GCS upload failed, falling back to local:", err);
    }
  }

  // Local filesystem fallback (mirrors /storage/uploads/request-url local path)
  const filename = randomUUID() + ext;
  await fs.promises.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(LOCAL_UPLOADS_DIR, filename), buffer);
  return `/api/storage/local-uploads/${filename}`;
}

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const canManage = [requireAdmin, requirePermission("canManageBookings")] as const;

// ─── POST /api/admin/voucher-import/extract ───────────────────────────────────

router.post(
  "/admin/voucher-import/extract",
  ...canManage,
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const mimeType = file.mimetype.toLowerCase();
    const isPdf = mimeType === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    const isImage = mimeType.startsWith("image/");

    if (!isPdf && !isImage) {
      res.status(400).json({ error: "Only image files (JPEG, PNG, WebP) and PDFs are supported" });
      return;
    }

    // Store the uploaded file for audit/dedup tracking
    let objectPath: string | null = null;
    try {
      objectPath = await storeVoucherFile(file.buffer, mimeType);
    } catch (storageErr) {
      console.warn("[voucher-import] File storage failed (non-fatal):", storageErr);
    }

    if (isImage) {
      const base64 = file.buffer.toString("base64");
      const result = await extractVoucherFromImage(base64, mimeType);
      res.json({ ...result, objectPath });
      return;
    }

    // PDF: try pdf-parse text extraction
    try {
      // pdf-parse exports differ between ESM/CJS builds — use flexible destructuring
      const pdfModule = await import("pdf-parse");
      // pdf-parse uses CJS `export =` so the callable may be under `.default` in ESM interop
      type PdfParseFn = (buf: Buffer) => Promise<{ text: string }>;
      const pdfParse: PdfParseFn =
        (pdfModule as { default?: PdfParseFn }).default ?? (pdfModule as unknown as PdfParseFn);
      const parsed = await pdfParse(file.buffer);
      const text = (parsed.text ?? "").trim();

      if (text.length < 30) {
        // Likely a scanned PDF — fall back to image vision
        const result = await extractVoucherFromImage(
          file.buffer.toString("base64"),
          "application/pdf",
        );
        result.warnings.unshift(
          "This appears to be a scanned PDF. Text could not be extracted — AI used the raw file instead. Review extracted fields carefully.",
        );
        res.json({ ...result, objectPath });
        return;
      }

      const result = await extractVoucherFromText(text);
      res.json({ ...result, objectPath });
    } catch (err) {
      console.error("[voucher-import] PDF parse error:", err);
      res.json({
        extracted: {},
        warnings: ["Could not read PDF content. Please fill in all booking details manually."],
        extractionFailed: true,
        unresolvedFields: ["contactFullName", "pickupLocation", "dropoffLocation", "pickupDatetime", "dropoffDatetime"],
        resolvedPickupLocationId: null,
        resolvedDropoffLocationId: null,
        objectPath,
      });
    }
  },
);

// ─── POST /api/admin/voucher-import/duplicate-check ──────────────────────────

router.post("/admin/voucher-import/duplicate-check", ...canManage, async (req, res) => {
  const {
    externalReservationCode,
    voucherImportRef,
    contactPhone,
    contactEmail,
    pickupDatetime,
    pickupLocationId,
  } = req.body as {
    externalReservationCode?: string | null;
    voucherImportRef?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    pickupDatetime?: string | null;
    pickupLocationId?: number | null;
  };

  const result = await checkVoucherDuplicate({
    externalReservationCode,
    voucherImportRef,
    contactPhone,
    contactEmail,
    pickupDatetime,
    pickupLocationId,
  });
  res.json(result);
});

// ─── POST /api/admin/voucher-import/confirm ───────────────────────────────────

router.post("/admin/voucher-import/confirm", ...canManage, async (req, res) => {
  const {
    contactFullName,
    contactEmail,
    contactPhone,
    pickupLocationId,
    dropoffLocationId,
    pickupDatetime,
    dropoffDatetime,
    vehicleModelId,
    totalAmount,
    currency,
    notes,
    broker,
    externalReservationCode,
    voucherImportRef,
    status,
    paymentStatus,
    extractedDraft,
  } = req.body;

  if (!contactFullName || typeof contactFullName !== "string" || !contactFullName.trim()) {
    res.status(400).json({ error: "contactFullName is required" });
    return;
  }

  const pickupLocId = parseInt(String(pickupLocationId), 10);
  if (isNaN(pickupLocId) || pickupLocId <= 0) {
    res.status(400).json({ error: "pickupLocationId must be a valid positive integer" });
    return;
  }

  const dropoffLocId = parseInt(String(dropoffLocationId), 10);
  if (isNaN(dropoffLocId) || dropoffLocId <= 0) {
    res.status(400).json({ error: "dropoffLocationId must be a valid positive integer" });
    return;
  }

  if (!pickupDatetime || !dropoffDatetime) {
    res.status(400).json({ error: "pickupDatetime and dropoffDatetime are required" });
    return;
  }

  const vehicleModelIdParsed = vehicleModelId ? parseInt(String(vehicleModelId), 10) : NaN;
  if (isNaN(vehicleModelIdParsed) || vehicleModelIdParsed <= 0) {
    res.status(400).json({ error: "vehicleModelId is required and must be a valid vehicle model" });
    return;
  }

  try {
    const actorId = req.session.adminId!;
    const result = await confirmVoucherImport(
      {
        contactFullName: contactFullName.trim(),
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        pickupLocationId: pickupLocId,
        dropoffLocationId: dropoffLocId,
        pickupDatetime,
        dropoffDatetime,
        vehicleModelId: vehicleModelIdParsed,
        totalAmount: totalAmount || null,
        currency: currency || "GEL",
        notes: notes || null,
        broker: broker || null,
        externalReservationCode: externalReservationCode || null,
        voucherImportRef: voucherImportRef || null,
        status: status || "CONFIRMED",
        paymentStatus: paymentStatus || "PREPAID",
      },
      actorId,
      extractedDraft ?? null,
    );

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: (err as Error).message });
      return;
    }
    throw err;
  }
});

export default router;
