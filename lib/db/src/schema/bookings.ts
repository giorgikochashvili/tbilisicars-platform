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
import { adminsTable } from "./admins";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const bookingStatusEnum = pgEnum("bookingstatusenum", [
  "PENDING",
  "CONFIRMED",
  "DELIVERED",
  "RETURNED",
  "CANCELED",
  "NO_SHOW",
]);

export const paymentStatusEnum = pgEnum("paymentstatusenum", [
  "UNPAID",
  "HALF",
  "PAID",
  "PREPAID",
  "REFUNDED",
]);

export const bookingPhotoTypeEnum = pgEnum("bookingphototypeenum", [
  "GENERAL",
  "PICKUP",
  "RETURN",
]);

export const pickupSatisfactionEnum = pgEnum("pickupsatisfactionenum", [
  "HAPPY",
  "NEUTRAL",
  "SAD",
  "PROBLEM",
]);

// ─── Booking ──────────────────────────────────────────────────────────────────

export const bookingTable = pgTable(
  "booking",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "restrict" }),
    vehicleId: integer("vehicle_id").references(() => vehicleTable.id, {
      onDelete: "set null",
    }),
    vehicleGroupId: integer("vehicle_group_id").references(
      () => vehiclegroupTable.id,
      { onDelete: "set null" },
    ),
    // Tracks which model was requested (added migration 036)
    vehicleModelId: integer("vehicle_model_id").references(
      () => vehicleModelTable.id,
      { onDelete: "set null" },
    ),
    pickupLocationId: integer("pickup_location_id")
      .notNull()
      .references(() => locationTable.id, { onDelete: "restrict" }),
    dropoffLocationId: integer("dropoff_location_id")
      .notNull()
      .references(() => locationTable.id, { onDelete: "restrict" }),
    pickupDatetime: timestamp("pickup_datetime").notNull(),
    dropoffDatetime: timestamp("dropoff_datetime").notNull(),
    status: bookingStatusEnum("status").notNull().default("PENDING"),
    paymentStatus: paymentStatusEnum("payment_status")
      .notNull()
      .default("UNPAID"),
    rateId: integer("rate_id").references(() => rateTable.id, {
      onDelete: "set null",
    }),
    rateTierId: integer("rate_tier_id").references(() => ratetierTable.id, {
      onDelete: "set null",
    }),
    pricePerDay: numeric("price_per_day", { precision: 10, scale: 2 }),
    baseRate: numeric("base_rate", { precision: 10, scale: 2 }).default("0"),
    taxes: numeric("taxes", { precision: 10, scale: 2 }).default("0"),
    fees: numeric("fees", { precision: 10, scale: 2 }).default("0"),
    discount: numeric("discount", { precision: 10, scale: 2 }).default("0"),
    oneWayFee: numeric("one_way_fee", { precision: 10, scale: 2 }).default("0"),
    // Added migration 013
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).default("0"),
    deposit: numeric("deposit", { precision: 10, scale: 2 }).default("0"),
    depositCurrency: varchar("deposit_currency", { length: 3 }),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).default("0"),
    currency: varchar("currency", { length: 3 }).default("GEL"),
    // Merged from first+last name in migration 020
    contactFullName: varchar("contact_full_name", { length: 200 }).notNull(),
    // Nullable since migration 014
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 50 }),
    notes: text("notes"),
    // Broker tracking evolved across migrations 011, 022, 030
    broker: varchar("broker", { length: 100 }),
    brokerId: varchar("broker_id", { length: 100 }),
    partnerId: integer("partner_id").references(() => partnerTable.id, {
      onDelete: "set null",
    }),
    // Object-storage keys for quick access to latest photos (added migration 031)
    pickupPhoto: varchar("pickup_photo", { length: 500 }),
    returnPhoto: varchar("return_photo", { length: 500 }),
    // Soft delete (added migration 032)
    deletedAt: timestamp("deleted_at"),
    // Customer document details (added migration 034)
    documentType: varchar("document_type", { length: 20 }),
    documentNumber: varchar("document_number", { length: 100 }),
    // Booking origin (added migration 041): web / broker / admin
    source: varchar("source", { length: 20 }),
    // Pickup/dropoff delivery type: airport | hotel | address | office
    pickupType: varchar("pickup_type", { length: 20 }),
    pickupAddress: varchar("pickup_address", { length: 500 }),
    dropoffType: varchar("dropoff_type", { length: 20 }),
    dropoffAddress: varchar("dropoff_address", { length: 500 }),
    // Voucher / reservation code fields (added for AI booking importer)
    reservationCode: varchar("reservation_code", { length: 30 }),
    externalReservationCode: varchar("external_reservation_code", { length: 100 }),
    voucherImportRef: varchar("voucher_import_ref", { length: 200 }),
    // Website discount snapshot — persisted at booking creation so historical
    // price breakdowns remain correct even if the discount rule is later edited
    // or disabled. NULL when no website discount was applied.
    websiteDiscountId: integer("website_discount_id"),
    websiteDiscountName: varchar("website_discount_name", { length: 100 }),
    websiteDiscountType: varchar("website_discount_type", { length: 10 }),
    websiteDiscountValue: numeric("website_discount_value", { precision: 10, scale: 2 }),
    websiteDiscountAmount: numeric("website_discount_amount", { precision: 10, scale: 2 }),
    originalRentalPrice: numeric("original_rental_price", { precision: 10, scale: 2 }),
    discountedRentalPrice: numeric("discounted_rental_price", { precision: 10, scale: 2 }),
    // Operational contact marker — staff marks customer as contacted before pickup/dropoff (added migration 0007)
    customerContacted: boolean("customer_contacted").notNull().default(false),
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

// ─── Booking History (Audit Log) ──────────────────────────────────────────────

export const bookingHistoryTable = pgTable(
  "booking_history",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    // FK to admins.id omitted as plain integer to break the circular module dep
    // admins.ts does not import bookings.ts, so this would be safe — but keeping
    // it as a plain integer to remain consistent with the approach used across the schema.
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
// Tracks vehicle swaps during a booking (added migration 017).
// DB-level check (end_date > start_date) should be applied via a raw SQL migration.

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
  ],
);

// ─── Booking Photo ────────────────────────────────────────────────────────────
// photo_type added in migration 031.

export const bookingphotoTable = pgTable(
  "bookingphoto",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    photoUrl: varchar("photo_url", { length: 500 }),
    photoType: bookingPhotoTypeEnum("photo_type").notNull().default("GENERAL"),
    // Nullable — set when the photo is archived (30-day lifecycle, migration 0003)
    photoArchivedAt: timestamp("photo_archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_bookingphoto_booking_id").on(t.bookingId),
    index("idx_bookingphoto_photo_type").on(t.photoType),
  ],
);

// ─── Booking Handover ─────────────────────────────────────────────────────────
// Records formal vehicle handover and return actions (PICKUP / DROPOFF).
// performed_by_admin_id is a real FK to admins.id (admins.ts does not import bookings.ts).

export const bookingHandoverTable = pgTable(
  "booking_handover",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    handoverType: varchar("handover_type", { length: 20 }).notNull(), // PICKUP | DROPOFF
    actionAt: timestamp("action_at").notNull(),
    mileage: integer("mileage"),
    fuelLevel: integer("fuel_level"), // 0–100
    performedByAdminId: integer("performed_by_admin_id").references(
      () => adminsTable.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    // Captured at PICKUP only — three-state customer satisfaction signal.
    // NULL for legacy pickup rows recorded before the Monitoring module was added.
    pickupSatisfaction: pickupSatisfactionEnum("pickup_satisfaction"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_booking_handover_booking_id").on(t.bookingId),
    index("idx_booking_handover_type").on(t.handoverType),
  ],
);

// ─── Monitoring Notes ─────────────────────────────────────────────────────────
// Internal append-only notes attached to a booking by Monitoring users.
// Visible only inside the CRM Monitoring page.

export const monitoringNoteTable = pgTable(
  "monitoring_notes",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingTable.id, { onDelete: "cascade" }),
    authorAdminId: integer("author_admin_id").references(
      () => adminsTable.id,
      { onDelete: "set null" },
    ),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_monitoring_notes_booking_id").on(t.bookingId),
    index("idx_monitoring_notes_created_at").on(t.createdAt),
  ],
);

// ─── Reservation Code Sequence ────────────────────────────────────────────────
// Per-prefix auto-increment counter used by the AI voucher importer to generate
// unique reservation codes (e.g. TBS-8001, TBS-8002, ...).

export const reservationCodeSequenceTable = pgTable(
  "reservation_code_sequence",
  {
    prefix: varchar("prefix", { length: 10 }).primaryKey(),
    nextVal: integer("next_val").notNull().default(8001),
  },
);

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertBookingSchema = createInsertSchema(bookingTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
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

export type Booking = typeof bookingTable.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;

export type BookingHistory = typeof bookingHistoryTable.$inferSelect;
export type InsertBookingHistory = z.infer<typeof insertBookingHistorySchema>;

export type BookingVehicleAssignment =
  typeof bookingVehicleAssignmentsTable.$inferSelect;
export type InsertBookingVehicleAssignment = z.infer<
  typeof insertBookingVehicleAssignmentSchema
>;

export type Bookingphoto = typeof bookingphotoTable.$inferSelect;
export type InsertBookingphoto = z.infer<typeof insertBookingphotoSchema>;
