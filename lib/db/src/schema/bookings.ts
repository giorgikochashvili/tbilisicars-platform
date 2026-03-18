import {
  pgTable,
  pgEnum,
  serial,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userTable } from "./users";
import {
  vehicleTable,
  vehiclegroupTable,
  vehicleModelTable,
} from "./fleet";
import { locationTable } from "./locations";
import { rateTable, ratetierTable } from "./rates";
import { partnerTable } from "./partners";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const bookingStatusEnum = pgEnum("bookingstatusenum", [
  "PENDING",
  "CONFIRMED",
  "DELIVERED",
  "RETURNED",
  "CANCELED",
  "NO_SHOW",
]);

// NOTE: PREPAID was added then removed across migrations 014-018. Final enum has 4 values.
export const paymentStatusEnum = pgEnum("paymentstatusenum", [
  "UNPAID",
  "HALF",
  "PAID",
  "REFUNDED",
]);

export const extraPricingTypeEnum = pgEnum("extrapricingtypeenum", [
  "per_day",
  "per_trip",
]);

export const bookingPhotoTypeEnum = pgEnum("bookingphototypeenum", [
  "GENERAL",
  "PICKUP",
  "RETURN",
]);

// ─── Extra ────────────────────────────────────────────────────────────────────
// Add-on items/services available for booking (GPS, child seat, insurance, etc.)

export const extraTable = pgTable(
  "extra",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    pricingType: extraPricingTypeEnum("pricing_type")
      .notNull()
      .default("per_day"),
    // Added migration 039: maximum number of days charged for per_day extras
    maxDays: integer("max_days"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_extra_is_active").on(t.isActive),
    index("idx_extra_pricing_type").on(t.pricingType),
  ],
);

// ─── Booking ──────────────────────────────────────────────────────────────────
// Core rental booking record. Most heavily evolved table (20+ migrations).

export const bookingTable = pgTable(
  "booking",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "restrict" }),
    // Vehicle assignment — all nullable; assigned at confirmation
    vehicleId: integer("vehicle_id").references(() => vehicleTable.id, {
      onDelete: "set null",
    }),
    vehicleGroupId: integer("vehicle_group_id").references(
      () => vehiclegroupTable.id,
      { onDelete: "set null" },
    ),
    // Added migration 036: tracks which model was requested
    vehicleModelId: integer("vehicle_model_id").references(
      () => vehicleModelTable.id,
      { onDelete: "set null" },
    ),
    // Locations
    pickupLocationId: integer("pickup_location_id")
      .notNull()
      .references(() => locationTable.id, { onDelete: "restrict" }),
    dropoffLocationId: integer("dropoff_location_id")
      .notNull()
      .references(() => locationTable.id, { onDelete: "restrict" }),
    // Dates
    pickupDatetime: timestamp("pickup_datetime").notNull(),
    dropoffDatetime: timestamp("dropoff_datetime").notNull(),
    // Status
    status: bookingStatusEnum("status").notNull().default("PENDING"),
    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("UNPAID"),
    // Pricing — rate links (added migration 009)
    rateId: integer("rate_id").references(() => rateTable.id, {
      onDelete: "set null",
    }),
    rateTierId: integer("rate_tier_id").references(() => ratetierTable.id, {
      onDelete: "set null",
    }),
    pricePerDay: numeric("price_per_day", { precision: 10, scale: 2 }),
    // Financial breakdown
    baseRate: numeric("base_rate", { precision: 10, scale: 2 }).default("0"),
    taxes: numeric("taxes", { precision: 10, scale: 2 }).default("0"),
    fees: numeric("fees", { precision: 10, scale: 2 }).default("0"),
    discount: numeric("discount", { precision: 10, scale: 2 }).default("0"),
    oneWayFee: numeric("one_way_fee", { precision: 10, scale: 2 }).default("0"),
    // Added migration 013
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).default("0"),
    deposit: numeric("deposit", { precision: 10, scale: 2 }).default("0"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).default("0"),
    currency: varchar("currency", { length: 3 }).default("USD"),
    // Contact info — single field since migration 020 (merged from first+last)
    contactFullName: varchar("contact_full_name", { length: 200 }).notNull(),
    // Nullable since migration 014
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 50 }),
    notes: text("notes"),
    // Broker tracking — three separate fields evolved across migrations 011, 022, 030
    broker: varchar("broker", { length: 100 }),    // plain name (DiscoverCars, VIPCars, etc.)
    brokerId: varchar("broker_id", { length: 100 }), // external booking reference ID
    partnerId: integer("partner_id").references(() => partnerTable.id, {
      onDelete: "set null",
    }),
    // Photo references (added migration 031) — object storage keys for quick access
    pickupPhoto: varchar("pickup_photo", { length: 500 }),
    returnPhoto: varchar("return_photo", { length: 500 }),
    // Soft delete (added migration 032)
    deletedAt: timestamp("deleted_at"),
    // Document info (added migration 034)
    documentType: varchar("document_type", { length: 20 }),
    documentNumber: varchar("document_number", { length: 100 }),
    // Booking source (added migration 041)
    source: varchar("source", { length: 20 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_booking_user_id").on(t.userId),
    index("idx_booking_vehicle_id").on(t.vehicleId),
    index("idx_booking_vehicle_group_id").on(t.vehicleGroupId),
    index("idx_booking_vehicle_model_id").on(t.vehicleModelId),
    index("idx_booking_pickup_location_id").on(t.pickupLocationId),
    index("idx_booking_dropoff_location_id").on(t.dropoffLocationId),
    index("idx_booking_status").on(t.status),
    index("idx_booking_payment_status").on(t.paymentStatus),
    index("idx_booking_rate_id").on(t.rateId),
    index("idx_booking_rate_tier_id").on(t.rateTierId),
    index("idx_booking_broker").on(t.broker),
    index("ix_booking_broker_id").on(t.brokerId),
    index("idx_booking_partner_id").on(t.partnerId),
    index("ix_booking_deleted_at").on(t.deletedAt),
    index("ix_booking_source").on(t.source),
    index("idx_booking_pickup_datetime").on(t.pickupDatetime),
    index("idx_booking_dropoff_datetime").on(t.dropoffDatetime),
  ],
);

// ─── Booking Extra (Junction) ─────────────────────────────────────────────────
// TODO: verify — pre-migration baseline table; structure inferred from routes and models.
// Adjust if actual schema differs (e.g., different column names or constraint details).

export const bookingextraTable = pgTable(
  "bookingextra",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    extraId: integer("extra_id")
      .notNull()
      .references(() => extraTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").default(1),
    // Snapshot of the price at time of booking
    priceAtBooking: numeric("price_at_booking", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_bookingextra_booking_id").on(t.bookingId),
    index("idx_bookingextra_extra_id").on(t.extraId),
  ],
);

// ─── Booking History (Audit Log) ──────────────────────────────────────────────

export const bookingHistoryTable = pgTable(
  "booking_history",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    // changed_by_id is a plain integer — references admins.id but FK is omitted
    // to avoid circular import: bookings.ts → users.ts (adminsTable) → (no cycle, OK)
    // Actually safe to include — users.ts does NOT import bookings.ts
    changedById: integer("changed_by_id"),
    changedAt: timestamp("changed_at").notNull().defaultNow(),
    actionType: varchar("action_type", { length: 50 }).notNull(),
    fieldName: varchar("field_name", { length: 100 }),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_booking_history_booking_id").on(t.bookingId),
    index("idx_booking_history_changed_at").on(t.changedAt),
    index("idx_booking_history_action_type").on(t.actionType),
  ],
);

// ─── Booking Vehicle Assignments ──────────────────────────────────────────────
// Tracks vehicle swaps during a booking (start/end dates for each assigned vehicle).

export const bookingVehicleAssignmentsTable = pgTable(
  "booking_vehicle_assignments",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "restrict" }),
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    returnLocationId: integer("return_location_id").references(
      () => locationTable.id,
      { onDelete: "set null" },
    ),
    odometerReading: integer("odometer_reading"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_booking_vehicle_assignments_booking_id").on(t.bookingId),
    index("idx_booking_vehicle_assignments_vehicle_id").on(t.vehicleId),
    // CHECK (end_date > start_date) enforced at the DB level — add via raw SQL migration
  ],
);

// ─── Booking Photo ────────────────────────────────────────────────────────────
// Photos for a booking. photo_type added in migration 031.

export const bookingphotoTable = pgTable(
  "bookingphoto",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    photoUrl: varchar("photo_url", { length: 500 }),
    photoType: bookingPhotoTypeEnum("photo_type").notNull().default("GENERAL"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_bookingphoto_booking_id").on(t.bookingId),
    index("idx_bookingphoto_photo_type").on(t.photoType),
  ],
);

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertExtraSchema = createInsertSchema(extraTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertBookingSchema = createInsertSchema(bookingTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertBookingextraSchema = createInsertSchema(
  bookingextraTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBookingHistorySchema = createInsertSchema(
  bookingHistoryTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBookingVehicleAssignmentSchema = createInsertSchema(
  bookingVehicleAssignmentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBookingphotoSchema = createInsertSchema(
  bookingphotoTable,
).omit({ id: true, createdAt: true, updatedAt: true });

// ─── Types ────────────────────────────────────────────────────────────────────

export type Extra = typeof extraTable.$inferSelect;
export type InsertExtra = z.infer<typeof insertExtraSchema>;

export type Booking = typeof bookingTable.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;

export type Bookingextra = typeof bookingextraTable.$inferSelect;
export type InsertBookingextra = z.infer<typeof insertBookingextraSchema>;

export type BookingHistory = typeof bookingHistoryTable.$inferSelect;
export type InsertBookingHistory = z.infer<typeof insertBookingHistorySchema>;

export type BookingVehicleAssignment =
  typeof bookingVehicleAssignmentsTable.$inferSelect;
export type InsertBookingVehicleAssignment = z.infer<
  typeof insertBookingVehicleAssignmentSchema
>;

export type Bookingphoto = typeof bookingphotoTable.$inferSelect;
export type InsertBookingphoto = z.infer<typeof insertBookingphotoSchema>;
