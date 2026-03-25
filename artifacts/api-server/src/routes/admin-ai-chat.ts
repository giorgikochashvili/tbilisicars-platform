/**
 * Super Admin AI — Phase 2 Chat Endpoint
 *
 * POST /api/admin-ai/chat
 * Protected by requireAdmin. Accepts a plain-text message, routes it through
 * the intent-based orchestration service, and returns a grounded AI answer.
 *
 * Response contract:
 *   200 { answer, usedSources, intent, reasoningMode, warnings }
 *   400 { error: "message is required" | "message must not exceed 2000 characters" }
 *   500 { error: "An internal error occurred." }
 *
 * Safety: raw AI/DB errors are never forwarded to the client.
 */

import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/requireAdmin.js";
import { processAdminChat } from "../services/admin-ai-chat.service.js";

const router: IRouter = Router();

router.post("/admin-ai/chat", requireAdmin, async (req, res) => {
  const { message } = req.body as { message?: unknown };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (message.length > 2000) {
    res.status(400).json({ error: "message must not exceed 2000 characters" });
    return;
  }

  const adminId: number = (req.session as { adminId?: number }).adminId ?? 0;

  try {
    const result = await processAdminChat(message.trim(), adminId);
    res.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "";
    if (errMsg === "data_fetch_failed" || errMsg === "openai_failed") {
      res.status(500).json({ error: "An internal error occurred." });
    } else {
      console.error("[admin-ai-chat] unexpected error:", err);
      res.status(500).json({ error: "An internal error occurred." });
    }
  }
});

export default router;
