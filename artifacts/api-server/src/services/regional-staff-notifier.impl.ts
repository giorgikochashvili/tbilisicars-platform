/**
 * regional-staff-notifier.impl.ts
 *
 * C2b-3b2: Concrete RegionalStaffNotifier, RegionalMailClient seam, and
 * Resend adapter factory for the Regional Brands Gateway.
 *
 * Only this file may import Resend or access process.env.
 * No logging. No route wiring.
 */

import { Resend } from "resend";
import type {
  RegionalStaffNotification,
  RegionalStaffNotifier,
} from "../lib/regional-staff-notifier.js";
import { renderRegionalStaffEmail } from "./regional-staff-email.js";

// ── Module-private constant ───────────────────────────────────────────────────

const DELIVERY_ERROR = "Regional staff email delivery failed";

// ── Public seam types ─────────────────────────────────────────────────────────

export interface RegionalMailMessage {
  readonly from:    string;
  readonly to:      string;
  readonly subject: string;
  readonly html:    string;
  readonly text:    string;
}

export interface RegionalMailClient {
  send(message: RegionalMailMessage): Promise<void>;
}

// ── Resend adapter types ──────────────────────────────────────────────────────

interface ResendSendResult {
  readonly data?: {
    readonly id?: unknown;
  } | null;
  readonly error?: unknown;
}

interface ResendLikeClient {
  readonly emails: {
    send(message: RegionalMailMessage): Promise<ResendSendResult>;
  };
}

export type RegionalApiKeyProvider  = () => string | undefined;
export type ResendClientFactory     = (apiKey: string) => ResendLikeClient;

// ── Module-private helpers ────────────────────────────────────────────────────

/**
 * normalizeMailAddressHeader — notifier-private.
 * Trims the raw address; rejects blank, CR, or LF.
 * Not exported. Not imported from the renderer.
 */
function normalizeMailAddressHeader(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error(DELIVERY_ERROR);
  const trimmed = value.trim();
  if (!trimmed)              throw new Error(DELIVERY_ERROR);
  return trimmed;
}

function isAcceptedResult(r: unknown): boolean {
  if (r === null || r === undefined)  return false;
  if (typeof r !== "object")          return false;
  const result = r as ResendSendResult;
  if (result.error != null)           return false;
  if (result.data === null || result.data === undefined) return false;
  if (typeof result.data !== "object") return false;
  const id = (result.data as { id?: unknown }).id;
  if (typeof id !== "string")         return false;
  if (id.trim().length === 0)         return false;
  return true;
}

// ── Public factory: Resend mail-client adapter ────────────────────────────────

export function createResendMailClient({
  getApiKey,
  createClient,
}: {
  getApiKey:    RegionalApiKeyProvider;
  createClient: ResendClientFactory;
}): RegionalMailClient {
  return {
    async send(message: RegionalMailMessage): Promise<void> {
      try {
        const raw     = getApiKey();
        const trimmed = (raw ?? "").trim();
        if (!trimmed) throw new Error(DELIVERY_ERROR);
        const client = createClient(trimmed);
        const result = await client.emails.send(message);
        if (!isAcceptedResult(result)) throw new Error(DELIVERY_ERROR);
      } catch {
        throw new Error(DELIVERY_ERROR);
      }
    },
  };
}

// ── Public factory: concrete notifier ────────────────────────────────────────

export function createRegionalStaffNotifier({
  mailClient,
  fromAddress,
  toAddress,
}: {
  mailClient:  RegionalMailClient;
  fromAddress: string;
  toAddress:   string;
}): RegionalStaffNotifier {
  return {
    async notify(input: RegionalStaffNotification): Promise<void> {
      try {
        const normalizedFrom = normalizeMailAddressHeader(fromAddress);
        const normalizedTo   = normalizeMailAddressHeader(toAddress);
        const content = renderRegionalStaffEmail(input);
        const from = `Tbilisicars Reservations <${normalizedFrom}>`;
        await mailClient.send({
          from,
          to:      normalizedTo,
          subject: content.subject,
          html:    content.html,
          text:    content.text,
        });
      } catch {
        throw new Error(DELIVERY_ERROR);
      }
    },
  };
}

// ── Future composition helper (imported by no runtime entry in this phase) ─────

export function buildDefaultRegionalStaffNotifier(): RegionalStaffNotifier {
  const getApiKey: RegionalApiKeyProvider = () => process.env.RESEND_API_KEY;
  const createClient: ResendClientFactory = (key: string) => {
    const resend = new Resend(key);
    return {
      emails: {
        send: (message: RegionalMailMessage) =>
          resend.emails.send(message as Parameters<typeof resend.emails.send>[0]) as Promise<ResendSendResult>,
      },
    };
  };
  const fromAddress =
    process.env.RESEND_FROM_EMAIL?.trim() ?? "reservations@tbilisicars.com";
  const toAddress = "reservations@tbilisicars.com";
  const mailClient = createResendMailClient({ getApiKey, createClient });
  return createRegionalStaffNotifier({ mailClient, fromAddress, toAddress });
}
