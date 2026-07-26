import {
  pgTable,
  serial,
  varchar,
  smallint,
  integer,
  char,
  timestamp,
  uuid,
  bigint,
  primaryKey,
  foreignKey,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bookingTable } from "./bookings";

// ── integration_client ────────────────────────────────────────────────────────
// DB authority for known clients, enabled state, and canonical brand code.
// Secret bytes are NOT stored here — runtime secret store only.
// Enabled means: disabled_at IS NULL.

export const integrationClientTable = pgTable(
  "integration_client",
  {
    id:         serial("id").notNull(),
    keyId:      varchar("key_id",     { length: 64  }).notNull(),
    brandCode:  varchar("brand_code", { length: 50  }).notNull(),
    disabledAt: timestamp("disabled_at"),
    createdAt:  timestamp("created_at").notNull().defaultNow(),
    updatedAt:  timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "pk_ic",        columns: [t.id]    }),
    unique("uq_ic_key_id").on(t.keyId),
    check("chk_ic_brand_code",
      sql`${t.brandCode} IN ('batumicars', 'kutaisicars')`),
  ],
);

// ── gateway_booking_context ───────────────────────────────────────────────────
// Idempotency anchor for gateway-originated bookings.
// total_amount_cents: BIGINT, mode "number" — safe because
//   max value 9,999,999,999 < Number.MAX_SAFE_INTEGER (9,007,199,254,740,991).

export const gatewayBookingContextTable = pgTable(
  "gateway_booking_context",
  {
    id:                        serial("id").notNull(),
    bookingId:                 integer("booking_id").notNull(),
    brandCode:                 varchar("brand_code",           { length: 50 }).notNull(),
    gatewayBookingId:          uuid("gateway_booking_id").notNull(),
    gatewayQuoteId:            uuid("gateway_quote_id").notNull(),
    payloadFingerprintVersion: smallint("payload_fingerprint_version").notNull().default(1),
    payloadFingerprint:        char("payload_fingerprint",     { length: 64 }).notNull(),
    totalAmountCents:          bigint("total_amount_cents",    { mode: "number" }).notNull(),
    createdAt:                 timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "pk_gbc",        columns: [t.id]    }),
    unique("uq_gbc_booking_id").on(t.bookingId),
    unique("uq_gbc_brand_gateway_booking").on(t.brandCode, t.gatewayBookingId),
    unique("uq_gbc_brand_gateway_quote").on(t.brandCode, t.gatewayQuoteId),
    foreignKey({
      name:           "fk_gbc_booking_id",
      columns:        [t.bookingId],
      foreignColumns: [bookingTable.id],
    }).onDelete("cascade"),
    check("chk_gbc_brand_code",
      sql`${t.brandCode} IN ('batumicars', 'kutaisicars')`),
    check("chk_gbc_total_amount_cents",
      sql`${t.totalAmountCents} > 0 AND ${t.totalAmountCents} <= 9999999999`),
    check("chk_gbc_fingerprint",
      sql`${t.payloadFingerprint} ~ '^[0-9a-f]{64}$'`),
  ],
);

export type IntegrationClient     = typeof integrationClientTable.$inferSelect;
export type GatewayBookingContext = typeof gatewayBookingContextTable.$inferSelect;
