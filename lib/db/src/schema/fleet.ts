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
import { locationTable } from "./locations";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const vehicleClassEnum = pgEnum("vehicleclassenum", [
  "ECONOMY",
  "COMPACT",
  "MIDSIZE",
  "STANDARD",
  "FULLSIZE",
  "PREMIUM",
  "LUXURY",
  "SUV",
  "MINIVAN",
  "VAN",
  "TRUCK",
]);

// GASOLINE was renamed to PETROL in migration 999
export const fuelTypeEnum = pgEnum("fueltypeenum", [
  "PETROL",
  "DIESEL",
  "HYBRID",
  "ELECTRIC",
]);

export const transmissionEnum = pgEnum("transmissionenum", [
  "MANUAL",
  "AUTOMATIC",
]);

// TODO: verify exact status values from legacy code; these are inferred from routes/models
export const vehicleStatusEnum = pgEnum("vehiclestatusenum", [
  "AVAILABLE",
  "RENTED",
  "MAINTENANCE",
  "RESERVED",
  "INACTIVE",
]);

// Legacy per-vehicle pricing enums (vehicleprice table)
export const priceTypeEnum = pgEnum("pricetypeenum", [
  "BASE_DAILY",
  "WEEKLY",
  "MONTHLY",
  "WEEKEND",
  "SEASONAL",
  "ONE_WAY_FEE",
]);

export const currencyEnum = pgEnum("currencyenum", [
  "USD",
  "EUR",
  "GBP",
  "GEL",
]);

// ─── Brand ───────────────────────────────────────────────────────────────────

export const brandTable = pgTable(
  "brand",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    logoUrl: varchar("logo_url", { length: 500 }),
    countryOfOrigin: varchar("country_of_origin", { length: 100 }),
    // NOTE: migration 026 dropped `active` from brand — NOT included here
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_brand_name").on(t.name),
    index("idx_brand_name").on(t.name),
  ],
);

// ─── Vehicle Model ────────────────────────────────────────────────────────────
// NOTE: price/price_gel/price_usd were added in migration 027 and immediately
// removed in migration 028. They are NOT in the final effective schema.

export const vehicleModelTable = pgTable(
  "vehicle_model",
  {
    id: serial("id").primaryKey(),
    brandId: integer("brand_id")
      .notNull()
      .references(() => brandTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    imageUrl: varchar("image_url", { length: 500 }),
    active: boolean("active").notNull().default(true),
    availableForExternalSystems: boolean("available_for_external_systems")
      .notNull()
      .default(false),
    category: varchar("category", { length: 100 }),
    seats: integer("seats"),
    doors: integer("doors"),
    transmission: varchar("transmission", { length: 20 }),
    fuelType: varchar("fuel_type", { length: 20 }),
    luggageCapacity: integer("luggage_capacity"),
    mileageLimitPerDay: integer("mileage_limit_per_day"),
    deposit: numeric("deposit", { precision: 10, scale: 2 }).default("0"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_brand_model_name").on(t.brandId, t.name),
    index("idx_vehicle_model_brand_id").on(t.brandId),
    index("idx_vehicle_model_name").on(t.name),
  ],
);

// ─── Vehicle Model Photo ──────────────────────────────────────────────────────

export const vehicleModelPhotoTable = pgTable(
  "vehicle_model_photo",
  {
    id: serial("id").primaryKey(),
    vehicleModelId: integer("vehicle_model_id")
      .notNull()
      .references(() => vehicleModelTable.id, { onDelete: "cascade" }),
    photoUrl: varchar("photo_url", { length: 500 }).notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    displayOrder: integer("display_order").default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_vehicle_model_photo_model_id").on(t.vehicleModelId)],
);

// ─── Vehicle Group ────────────────────────────────────────────────────────────
// NOTE: After migration 035, rate tiers now reference vehicle_model, not vehiclegroup.
// vehiclegroup is still used for organisational grouping of vehicles but is no longer
// the primary pricing unit.

export const vehiclegroupTable = pgTable(
  "vehiclegroup",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 50 }),
    seats: integer("seats"),
    doors: integer("doors"),
    transmission: varchar("transmission", { length: 20 }),
    fuelType: varchar("fuel_type", { length: 20 }),
    basePricePerDay: numeric("base_price_per_day", { precision: 10, scale: 2 }),
    basePricePerWeek: numeric("base_price_per_week", {
      precision: 10,
      scale: 2,
    }),
    basePricePerMonth: numeric("base_price_per_month", {
      precision: 10,
      scale: 2,
    }),
    features: text("features"),
    imageUrl: varchar("image_url", { length: 500 }),
    displayOrder: integer("display_order").default(0),
    active: boolean("active").default(true),
    minRentalDays: integer("min_rental_days").default(1),
    maxRentalDays: integer("max_rental_days"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_vehiclegroup_name").on(t.name),
    index("idx_vehiclegroup_name").on(t.name),
    index("idx_vehiclegroup_active").on(t.active),
  ],
);

// ─── Vehicle ──────────────────────────────────────────────────────────────────
// NOTE: make/model are deprecated since migration 023 (replaced by vehicle_model_id)
// but still exist as nullable fields for backward compatibility with legacy data.

export const vehicleTable = pgTable(
  "vehicle",
  {
    id: serial("id").primaryKey(),
    vehicleModelId: integer("vehicle_model_id").references(
      () => vehicleModelTable.id,
      { onDelete: "set null" },
    ),
    vehicleGroupId: integer("vehicle_group_id").references(
      () => vehiclegroupTable.id,
      { onDelete: "set null" },
    ),
    // DEPRECATED: replaced by vehicle_model_id, kept for legacy data
    make: varchar("make", { length: 100 }),
    model: varchar("model", { length: 100 }),
    year: integer("year"),
    color: varchar("color", { length: 50 }),
    licensePlate: varchar("license_plate", { length: 50 }),
    vin: varchar("vin", { length: 50 }),
    vehicleClass: vehicleClassEnum("vehicle_class"),
    fuelType: fuelTypeEnum("fuel_type"),
    transmission: transmissionEnum("transmission"),
    status: vehicleStatusEnum("status"),
    mileage: integer("mileage"),
    locationId: integer("location_id").references(() => locationTable.id, {
      onDelete: "set null",
    }),
    // Added migration 010 — legacy starting price hint (mostly informational)
    startingPrice: numeric("starting_price", {
      precision: 10,
      scale: 2,
    }).default("50.00"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_vehicle_vehicle_group_id").on(t.vehicleGroupId),
    index("idx_vehicle_model_id").on(t.vehicleModelId),
    index("idx_vehicle_starting_price").on(t.startingPrice),
    index("idx_vehicle_status").on(t.status),
    index("idx_vehicle_location_id").on(t.locationId),
  ],
);

// ─── Vehicle Photo ────────────────────────────────────────────────────────────

export const vehiclephotoTable = pgTable(
  "vehiclephoto",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "cascade" }),
    photoUrl: varchar("photo_url", { length: 500 }),
    isPrimary: boolean("is_primary").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_vehiclephoto_vehicle_id").on(t.vehicleId)],
);

// ─── Vehicle Document ─────────────────────────────────────────────────────────

export const documentTable = pgTable(
  "document",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    filePath: varchar("file_path", { length: 500 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_document_vehicle_id").on(t.vehicleId)],
);

// ─── Vehicle History (Audit Log) ──────────────────────────────────────────────

export const vehicleHistoryTable = pgTable(
  "vehicle_history",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "cascade" }),
    // changedById references admins.id — defined with lazy ref to avoid circular import
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
    index("idx_vehicle_history_vehicle_id").on(t.vehicleId),
    index("idx_vehicle_history_changed_at").on(t.changedAt),
    index("idx_vehicle_history_action_type").on(t.actionType),
  ],
);

// ─── Vehicle Price (Legacy) ───────────────────────────────────────────────────
// NOTE: This legacy table coexists with the newer rate/ratetier pricing system.
// It may be partially deprecated. Included per archaeology report since it still
// exists in the final effective schema.

export const vehiclepriceTable = pgTable(
  "vehicleprice",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "cascade" }),
    priceType: priceTypeEnum("price_type").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: currencyEnum("currency").notNull().default("USD"),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_vehicle_price_range").on(
      t.vehicleId,
      t.priceType,
      t.startDate,
      t.endDate,
    ),
    index("idx_vehicleprice_vehicle_id").on(t.vehicleId),
    index("idx_vehicleprice_price_type").on(t.priceType),
    index("idx_vehicleprice_is_active").on(t.isActive),
  ],
);

// ─── Insert Schemas ───────────────────────────────────────────────────────────

export const insertBrandSchema = createInsertSchema(brandTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertVehicleModelSchema = createInsertSchema(
  vehicleModelTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVehicleModelPhotoSchema = createInsertSchema(
  vehicleModelPhotoTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVehiclegroupSchema = createInsertSchema(
  vehiclegroupTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVehicleSchema = createInsertSchema(vehicleTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertVehiclephotoSchema = createInsertSchema(
  vehiclephotoTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentSchema = createInsertSchema(documentTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertVehicleHistorySchema = createInsertSchema(
  vehicleHistoryTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVehiclepriceSchema = createInsertSchema(
  vehiclepriceTable,
).omit({ id: true, createdAt: true, updatedAt: true });

// ─── Types ────────────────────────────────────────────────────────────────────

export type Brand = typeof brandTable.$inferSelect;
export type InsertBrand = z.infer<typeof insertBrandSchema>;

export type VehicleModel = typeof vehicleModelTable.$inferSelect;
export type InsertVehicleModel = z.infer<typeof insertVehicleModelSchema>;

export type VehicleModelPhoto = typeof vehicleModelPhotoTable.$inferSelect;
export type InsertVehicleModelPhoto = z.infer<
  typeof insertVehicleModelPhotoSchema
>;

export type Vehiclegroup = typeof vehiclegroupTable.$inferSelect;
export type InsertVehiclegroup = z.infer<typeof insertVehiclegroupSchema>;

export type Vehicle = typeof vehicleTable.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;

export type Vehiclephoto = typeof vehiclephotoTable.$inferSelect;
export type InsertVehiclephoto = z.infer<typeof insertVehiclephotoSchema>;

export type Document = typeof documentTable.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type VehicleHistory = typeof vehicleHistoryTable.$inferSelect;
export type InsertVehicleHistory = z.infer<typeof insertVehicleHistorySchema>;

export type Vehicleprice = typeof vehiclepriceTable.$inferSelect;
export type InsertVehicleprice = z.infer<typeof insertVehiclepriceSchema>;
