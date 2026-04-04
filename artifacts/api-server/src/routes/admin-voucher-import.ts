/**
 * Admin Voucher Import Routes
 *
 * POST /api/admin/voucher-import/extract       — upload image/PDF, run AI extraction
 * POST /api/admin/voucher-import/duplicate-check — check if voucher already imported
 * POST /api/admin/voucher-import/confirm       — save booking with reservation code
 */

import { Router, type IRouter } from "express";
import multer from "multer";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import {
  extractVoucherFromImage,
  extractVoucherFromText,
  checkVoucherDuplicate,
  confirmVoucherImport,
} from "../services/admin-voucher-import.service.js";

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

    if (isImage) {
      const base64 = file.buffer.toString("base64");
      const result = await extractVoucherFromImage(base64, mimeType);
      res.json(result);
      return;
    }

    // PDF: try pdf-parse text extraction
    try {
      // pdf-parse exports differ between ESM/CJS builds — use flexible destructuring
      const pdfModule = await import("pdf-parse");
      const pdfParse = (pdfModule as any).default ?? pdfModule;
      const parsed = await pdfParse(file.buffer);
      const text = parsed.text?.trim() ?? "";

      if (text.length < 30) {
        // Likely a scanned PDF — fall back to image vision using first page as PNG
        // We don't have a PDF-to-image library; send what we have with a warning
        const result = await extractVoucherFromImage(
          file.buffer.toString("base64"),
          "application/pdf",
        );
        result.warnings.unshift(
          "This appears to be a scanned PDF. Text could not be extracted — AI used the raw file instead. Review extracted fields carefully.",
        );
        res.json(result);
        return;
      }

      const result = await extractVoucherFromText(text);
      res.json(result);
    } catch (err) {
      console.error("[voucher-import] PDF parse error:", err);
      // Never block — return empty extraction with warning
      res.json({
        extracted: {},
        warnings: ["Could not read PDF content. Please fill in all booking details manually."],
      });
    }
  },
);

// ─── POST /api/admin/voucher-import/duplicate-check ──────────────────────────

router.post("/admin/voucher-import/duplicate-check", ...canManage, async (req, res) => {
  const { externalReservationCode, voucherImportRef } = req.body as {
    externalReservationCode?: string | null;
    voucherImportRef?: string | null;
  };

  const result = await checkVoucherDuplicate(externalReservationCode, voucherImportRef);
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
      vehicleModelId: vehicleModelId ? parseInt(String(vehicleModelId), 10) : null,
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
  );

  res.status(201).json(result);
});

export default router;
