import { Router } from "express";
import { db, bookingTable, pool } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import {
  listMonitoringRows,
  listMonitoringNotes,
  createMonitoringNote,
  listPickupPerformers,
  type SatisfactionMark,
} from "../services/admin-monitoring.service.js";
import {
  sendReviewRequestEmail,
  type ReviewDestination,
} from "../services/email.service.js";
import { logAudit, bookingRef } from "../services/audit.service.js";

const router = Router();

const VALID_DESTINATIONS: ReviewDestination[] = [
  "trustpilot",
  "google_tbilisi",
  "google_kutaisi",
];

router.get("/admin/monitoring", requireAdmin, async (req, res) => {
  const { pickupFrom, pickupTo, satisfaction, status, performerId } =
    req.query as Record<string, string | undefined>;

  const sat: SatisfactionMark | null =
    satisfaction === "HAPPY" ||
    satisfaction === "NEUTRAL" ||
    satisfaction === "SAD"
      ? satisfaction
      : null;

  const performerIdNum = performerId ? parseInt(performerId, 10) : null;

  const rows = await listMonitoringRows({
    pickupFrom: pickupFrom || null,
    pickupTo: pickupTo || null,
    satisfaction: sat,
    status: status || null,
    performerId: Number.isFinite(performerIdNum) ? performerIdNum : null,
  });
  res.json({ rows });
});

router.get("/admin/monitoring/performers", requireAdmin, async (_req, res) => {
  const performers = await listPickupPerformers();
  res.json(performers);
});

router.get("/admin/monitoring/config", requireAdmin, (_req, res) => {
  res.json({ emailEnabled: !!process.env.RESEND_API_KEY });
});

router.get(
  "/admin/monitoring/:bookingId/notes",
  requireAdmin,
  async (req, res) => {
    const id = parseInt(String(req.params.bookingId), 10);
    if (!id || isNaN(id)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }
    const notes = await listMonitoringNotes(id);
    res.json({ notes });
  },
);

router.post(
  "/admin/monitoring/:bookingId/notes",
  requireAdmin,
  async (req, res) => {
    const id = parseInt(String(req.params.bookingId), 10);
    if (!id || isNaN(id)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }
    const { body } = req.body as { body?: string };
    const trimmed = (body ?? "").trim();
    if (!trimmed) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    if (trimmed.length > 4000) {
      res.status(400).json({ error: "body must be 4000 chars or fewer" });
      return;
    }
    const [bk] = await db
      .select({ id: bookingTable.id })
      .from(bookingTable)
      .where(and(eq(bookingTable.id, id), isNull(bookingTable.deletedAt)))
      .limit(1);
    if (!bk) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    const note = await createMonitoringNote({
      bookingId: id,
      authorAdminId: req.session.adminId ?? null,
      body: trimmed,
    });
    res.status(201).json(note);
  },
);

router.post(
  "/admin/monitoring/:bookingId/send-review-request",
  requireAdmin,
  async (req, res) => {
    const id = parseInt(String(req.params.bookingId), 10);
    if (!id || isNaN(id)) {
      res.status(400).json({ error: "Invalid booking ID" });
      return;
    }

    const { destinations } = req.body as { destinations?: unknown };

    if (
      !Array.isArray(destinations) ||
      destinations.length === 0 ||
      !destinations.every((d) =>
        VALID_DESTINATIONS.includes(d as ReviewDestination),
      )
    ) {
      res.status(400).json({
        error:
          "destinations must be a non-empty array of: trustpilot, google_tbilisi, google_kutaisi",
      });
      return;
    }

    const validDests = destinations as ReviewDestination[];

    const [bk] = await db
      .select({
        id: bookingTable.id,
        reservationCode: bookingTable.reservationCode,
        contactFullName: bookingTable.contactFullName,
        contactEmail: bookingTable.contactEmail,
        status: bookingTable.status,
      })
      .from(bookingTable)
      .where(and(eq(bookingTable.id, id), isNull(bookingTable.deletedAt)))
      .limit(1);

    if (!bk) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    if (bk.status !== "RETURNED") {
      res
        .status(400)
        .json({
          error: "Review requests can only be sent for RETURNED bookings",
        });
      return;
    }
    if (!bk.contactEmail) {
      res
        .status(400)
        .json({ error: "Booking has no contact email on file" });
      return;
    }

    if (
      validDests.includes("trustpilot") &&
      !process.env.TRUSTPILOT_BCC_EMAIL
    ) {
      res.status(503).json({
        error:
          "Trustpilot BCC is not configured on this server. Contact the system administrator.",
      });
      return;
    }

    const { rows: priorRows } = await pool.query<{ created_at: Date }>(
      `SELECT created_at FROM audit_logs
       WHERE entity_type = 'booking' AND entity_id = $1 AND action = 'booking.review_request_sent'
       ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
    const alreadySentAt: Date | null = priorRows[0]?.created_at ?? null;

    const firstName =
      (bk.contactFullName ?? "").trim().split(/\s+/)[0] ?? "";
    const result = await sendReviewRequestEmail({
      toEmail: bk.contactEmail,
      firstName,
      reference: bk.reservationCode ?? bookingRef(id),
      destinations: validDests,
    });

    if (result.ok) {
      logAudit({
        actorId: req.session.adminId ?? null,
        entityType: "booking",
        entityId: id,
        entityRef: bookingRef(id),
        action: "booking.review_request_sent",
        summary: `Review request sent to ${bk.contactEmail} (destinations: ${validDests.join(", ")})`,
        afterData: { to: bk.contactEmail, destinations: validDests },
      });
      res.json({ ok: true, alreadySentAt });
      return;
    }

    res.status(result.skipped ? 503 : 502).json({
      ok: false,
      skipped: result.skipped ?? false,
      reason: result.reason ?? "Failed to send email",
    });
  },
);

export default router;
