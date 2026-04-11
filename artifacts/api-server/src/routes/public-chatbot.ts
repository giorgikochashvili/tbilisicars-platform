/**
 * Public chatbot endpoint — no authentication required.
 * Stage 1: rule-based FAQ / sales-assistant for website visitors.
 *
 * POST /api/public/chatbot
 * Request:  { message: string }
 * Response: { reply: string; actions: ChatAction[] }
 *
 * Safety:
 *  - No DB writes
 *  - No CRM access
 *  - No booking creation
 *  - No admin-only logic
 *  - Raw errors never forwarded to client
 */
import { Router, type IRouter } from "express";
import { processPublicChatbot } from "../services/public-chatbot.service.js";

const router: IRouter = Router();

router.post("/public/chatbot", (req, res) => {
  try {
    const { message } = req.body as { message?: unknown };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    if (message.length > 500) {
      res.status(400).json({ error: "message too long" });
      return;
    }

    const result = processPublicChatbot(message);
    res.json(result);
  } catch {
    res.status(500).json({ error: "An internal error occurred." });
  }
});

export default router;
