/**
 * Super Admin AI — Phase 2 Chat Orchestration Service
 *
 * Accepts a plain-text admin question, deterministically routes it to one of
 * eight intent buckets, fetches ONLY the relevant read-only data from the
 * existing admin-ai service layer, builds a grounded context for the model,
 * and returns a structured answer.
 *
 * Safety guarantees:
 *  - Model only sees data explicitly fetched in this module.
 *  - System prompt hard-prohibits the model from inventing system state or
 *    claiming write actions.
 *  - OpenAI errors are caught and swallowed — the caller receives a generic 500.
 *  - No PII, no raw questions, no raw answers are written to the DB or logs.
 */

import {
  getAISummary,
  getAIBookings,
  getAIBooking,
  getAIVehicles,
  getAICustomers,
  getAILogs,
} from "./admin-ai.service.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Intent =
  | "summary_overview"
  | "today_activity"
  | "booking_lookup"
  | "unpaid_bookings"
  | "available_vehicles"
  | "customer_lookup"
  | "diagnostics_lookup"
  | "unknown_general";

export interface UsedSource {
  type: string;
  count?: number;
}

export interface ChatResult {
  answer: string;
  usedSources: UsedSource[];
  intent: Intent;
  reasoningMode: "grounded-readonly";
  warnings: string[];
}

// ─── Intent Detection ─────────────────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ intent: Intent; patterns: RegExp[] }> = [
  {
    intent: "booking_lookup",
    patterns: [
      /TC-\d+/i,
      /booking\s*#?\s*\d+/i,
      /booking\s+number/i,
      /specific\s+booking/i,
    ],
  },
  {
    intent: "today_activity",
    patterns: [
      /\btoday\b/i,
      /\bpickup(s)?\b/i,
      /\bdropoff(s)?\b/i,
      /\bdelivery\b/i,
      /\bdeliveries\b/i,
      /\btomorrow\b/i,
    ],
  },
  {
    intent: "unpaid_bookings",
    patterns: [
      /\bunpaid\b/i,
      /\boutstanding\b/i,
      /balance\s+due/i,
      /\bowes\b/i,
      /payment\s+pending/i,
      /\bdebt\b/i,
      /\bowed\b/i,
    ],
  },
  {
    intent: "available_vehicles",
    patterns: [
      /\bavailable\b/i,
      /free\s+car/i,
      /which\s+car/i,
      /what\s+car/i,
      /vehicle\s+free/i,
      /cars?\s+available/i,
      /\bfleet\b/i,
    ],
  },
  {
    intent: "customer_lookup",
    patterns: [/\bcustomer\b/i, /\bclient\b/i, /who\s+is\b/i, /\bguest\b/i],
  },
  {
    intent: "diagnostics_lookup",
    patterns: [
      /\bproblem\b/i,
      /\bissue(s)?\b/i,
      /\banomaly\b/i,
      /\banomalies\b/i,
      /\boverdue\b/i,
      /\bmissing\b/i,
      /\bwrong\b/i,
      /\bbroken\b/i,
      /\berror(s)?\b/i,
      /why\s+is\b/i,
      /\bwarning(s)?\b/i,
      /\balert(s)?\b/i,
    ],
  },
  {
    intent: "summary_overview",
    patterns: [
      /\boverview\b/i,
      /\bsummary\b/i,
      /\bstatus\b/i,
      /\bsituation\b/i,
      /how\s+are\s+we/i,
      /what\s+is\s+happening/i,
      /what('s|\s+is)\s+going\s+on/i,
      /\bsnapshot\b/i,
    ],
  },
];

export function detectIntent(message: string): Intent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some((p) => p.test(message))) {
      return intent;
    }
  }
  return "unknown_general";
}

// ─── TC-XXXXX Reference Extractor ─────────────────────────────────────────────

function extractBookingRef(message: string): number | null {
  const match = message.match(/TC-(\d+)/i);
  if (match) return parseInt(match[1], 10);
  const numMatch = message.match(/booking\s*#?\s*(\d+)/i);
  if (numMatch) return parseInt(numMatch[1], 10);
  return null;
}

function extractCustomerName(message: string): string | undefined {
  const match = message.match(/(?:customer|client|who\s+is)\s+([A-Za-z][\w\s'-]{1,40})/i);
  return match?.[1]?.trim();
}

// ─── Data Fetcher ─────────────────────────────────────────────────────────────

interface FetchedContext {
  sources: UsedSource[];
  data: Record<string, unknown>;
  warnings: string[];
}

async function fetchDataForIntent(
  intent: Intent,
  message: string,
): Promise<FetchedContext> {
  const sources: UsedSource[] = [];
  const data: Record<string, unknown> = {};
  const warnings: string[] = [];

  switch (intent) {
    case "summary_overview": {
      const summary = await getAISummary();
      sources.push({ type: "summary" });
      data.summary = summary;
      if (summary.parking === null) {
        warnings.push("Parking module is not installed in this environment.");
      }
      break;
    }

    case "today_activity": {
      const summary = await getAISummary();
      sources.push({ type: "summary" });
      data.todayActivity = summary.todayActivity;
      data.fleet = summary.fleet;
      if (summary.parking === null) {
        warnings.push("Parking module is not installed in this environment.");
      }
      break;
    }

    case "booking_lookup": {
      const bookingId = extractBookingRef(message);
      if (bookingId !== null) {
        const booking = await getAIBooking(bookingId);
        if (booking) {
          sources.push({ type: "bookings", count: 1 });
          data.booking = booking;
        } else {
          sources.push({ type: "bookings", count: 0 });
          data.booking = null;
          warnings.push(`No booking found with ID ${bookingId}.`);
        }
      } else {
        // No specific reference: return recent bookings list for context
        const result = await getAIBookings({ limit: 20 });
        sources.push({ type: "bookings", count: result.rows.length });
        data.bookings = result;
      }
      break;
    }

    case "unpaid_bookings": {
      const [confirmed, delivered] = await Promise.all([
        getAIBookings({ paymentStatus: "UNPAID", status: "CONFIRMED", limit: 50 }),
        getAIBookings({ paymentStatus: "UNPAID", status: "DELIVERED", limit: 50 }),
      ]);
      const allUnpaid = [...confirmed.rows, ...delivered.rows];
      sources.push({ type: "bookings", count: allUnpaid.length });
      data.unpaidBookings = {
        total: confirmed.total + delivered.total,
        confirmedCount: confirmed.total,
        deliveredCount: delivered.total,
        rows: allUnpaid,
      };
      break;
    }

    case "available_vehicles": {
      const vehicles = await getAIVehicles({ status: "AVAILABLE" });
      sources.push({ type: "vehicles", count: vehicles.length });
      data.availableVehicles = { total: vehicles.length, vehicles };
      break;
    }

    case "customer_lookup": {
      const name = extractCustomerName(message);
      const customers = await getAICustomers({ search: name, limit: 20 });
      sources.push({ type: "customers", count: customers.rows.length });
      data.customers = customers;
      if (name) data.searchedFor = name;
      break;
    }

    case "diagnostics_lookup": {
      const [logs, summary] = await Promise.all([
        getAILogs({ limit: 20 }),
        getAISummary(),
      ]);
      sources.push({ type: "diagnostics", count: logs.diagnostics.length });
      sources.push({ type: "logs", count: logs.auditLog.length });
      sources.push({ type: "summary" });
      data.diagnostics = logs.diagnostics;
      data.recentAuditLog = logs.auditLog;
      data.bookingSummary = summary.bookings;
      data.fleet = summary.fleet;
      if (summary.parking === null) {
        warnings.push("Parking module is not installed in this environment.");
      }
      break;
    }

    case "unknown_general":
    default: {
      const [summary, logs] = await Promise.all([
        getAISummary(),
        getAILogs({ limit: 20 }),
      ]);
      sources.push({ type: "summary" });
      sources.push({ type: "logs", count: logs.auditLog.length });
      data.summary = summary;
      data.recentActivity = logs.auditLog;
      if (summary.parking === null) {
        warnings.push("Parking module is not installed in this environment.");
      }
      break;
    }
  }

  return { sources, data, warnings };
}

// ─── Context Serializer ───────────────────────────────────────────────────────

function buildSystemPrompt(
  intent: Intent,
  sources: UsedSource[],
  contextData: Record<string, unknown>,
): string {
  const sourceList = sources
    .map((s) => (s.count !== undefined ? `${s.type} (${s.count})` : s.type))
    .join(", ");

  const contextJson = JSON.stringify(contextData, null, 2);

  return `You are the Super Admin AI for Tbilisicars, a car rental management system.
Your role is operations analyst and admin assistant.

CRITICAL RULES:
- Answer ONLY using the data provided in the DATA CONTEXT below.
- Do NOT invent, assume, or guess any data not present in the context.
- If the data is incomplete or missing, say so explicitly.
- This is a READ-ONLY system. Never claim to have performed any action.
- Never say a booking was changed, created, cancelled, or assigned.
- Never promise future actions.
- If parking data shows null, say parking information is unavailable in this environment.
- Be concise, direct, and operationally useful.
- Prefer specific facts: "Booking TC-00006 is confirmed but has no assigned vehicle" over vague summaries.
- Mention anomalies and diagnostic warnings clearly if they are present in the data.
- If you do not find what the admin asked for, say you could not find it in the current data.

RESPONSE STYLE:
- Write like an operations assistant, not a chatbot.
- Use booking references (TC-XXXXX format) when referring to bookings.
- Be brief unless detail is needed.
- No filler phrases like "Certainly!" or "Great question!".

DATA CONTEXT:
[intent: ${intent}]
[sources used: ${sourceList}]

${contextJson}`;
}

// ─── Main Chat Function ───────────────────────────────────────────────────────

export async function processAdminChat(
  message: string,
  adminId: number,
): Promise<ChatResult> {
  const intent = detectIntent(message);
  const startMs = Date.now();

  let fetchedContext: FetchedContext;
  try {
    fetchedContext = await fetchDataForIntent(intent, message);
  } catch (err) {
    const safeMsg = err instanceof Error ? err.message.slice(0, 120) : "unknown";
    console.error(`[admin-ai-chat] intent=${intent} sources=[] adminId=${adminId} data-fetch-error=${safeMsg}`);
    throw new Error("data_fetch_failed");
  }

  const { sources, data, warnings } = fetchedContext;

  console.log(
    `[admin-ai-chat] intent=${intent} sources=[${sources.map((s) => s.type).join(",")}] adminId=${adminId}`,
  );
  const systemPrompt = buildSystemPrompt(intent, sources, data);

  let answer: string;
  try {
    const { openai } = await import("@workspace/integrations-openai-ai-server");
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    });
    answer = completion.choices[0]?.message?.content ?? "No response generated.";
  } catch (err) {
    const safeMsg = err instanceof Error ? err.message.slice(0, 120) : "unknown";
    console.error(`[admin-ai-chat] openai error intent=${intent} error=${safeMsg}`);
    throw new Error("openai_failed");
  }

  const latencyMs = Date.now() - startMs;
  console.log(
    `[admin-ai-chat] success intent=${intent} sources=[${sources.map((s) => s.type).join(",")}] latency=${latencyMs}ms`,
  );

  return {
    answer,
    usedSources: sources,
    intent,
    reasoningMode: "grounded-readonly",
    warnings,
  };
}
