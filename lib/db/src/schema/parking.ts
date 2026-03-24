import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehicleTable } from "./fleet";

// ─── Parking Zone Assignment ───────────────────────────────────────────────────
// Tracks which airport parking zone each vehicle is currently occupying.
// One active assignment per vehicle at a time (enforced by partial unique index).
// Zone capacities: TERMINAL = 5, OUT = 10, FREE = unlimited.
// Soft-delete via removed_at (null = active).

export const parkingAssignmentTable = pgTable(
  "parking_assignment",
  {
    id: serial("id").primaryKey(),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicleTable.id, { onDelete: "cascade" }),
    zone: varchar("zone", { length: 20 }).notNull(),
    assignedAt: timestamp("assigned_at").notNull().defaultNow(),
    // FK to admins.id kept as plain integer to avoid circular import with admins.ts
    assignedByAdminId: integer("assigned_by_admin_id"),
    removedAt: timestamp("removed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_parking_assignment_vehicle_id").on(t.vehicleId),
    index("idx_parking_assignment_zone").on(t.zone),
    index("idx_parking_assignment_removed_at").on(t.removedAt),
  ],
);

export const insertParkingAssignmentSchema = createInsertSchema(
  parkingAssignmentTable,
).omit({ id: true, createdAt: true, updatedAt: true });

export type ParkingAssignment = typeof parkingAssignmentTable.$inferSelect;
export type InsertParkingAssignment = z.infer<typeof insertParkingAssignmentSchema>;
