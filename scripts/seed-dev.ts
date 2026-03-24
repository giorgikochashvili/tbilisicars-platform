import {
  db,
  locationTable,
  brandTable,
  vehicleModelTable,
  vehicleTable,
  userTable,
  bookingTable,
  maintenanceServicesTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { seedServiceTypes } from "../artifacts/api-server/src/services/admin-service.service.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function dateAt(days: number, hour: number): Date {
  const d = daysFromNow(days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function toDateString(days: number): string {
  return daysFromNow(days).toISOString().slice(0, 10);
}

// ─── 1. Locations ─────────────────────────────────────────────────────────────
// No unique constraint on location.name — use SELECT-before-INSERT.

async function seedLocations() {
  const rows = [
    { name: "Tbilisi International Airport", address: "Airport Highway, Tbilisi", city: "Tbilisi", locationType: "rental_office" as const, isActive: true },
    { name: "Tbilisi City Center", address: "Rustaveli Avenue 1, Tbilisi", city: "Tbilisi", locationType: "rental_office" as const, isActive: true },
    { name: "Kutaisi International Airport", address: "Airport Road, Kutaisi", city: "Kutaisi", locationType: "meet_and_greet" as const, isActive: true },
    { name: "Batumi Sea Port", address: "Port Street 5, Batumi", city: "Batumi", locationType: "meet_and_greet" as const, isActive: true },
  ];

  let inserted = 0;
  for (const row of rows) {
    const existing = await db.select({ id: locationTable.id }).from(locationTable).where(eq(locationTable.name, row.name)).limit(1);
    if (existing.length === 0) {
      await db.insert(locationTable).values(row);
      inserted++;
    }
  }
  console.log(`  locations: ${inserted} inserted, ${rows.length - inserted} skipped`);
}

// ─── 2. Brands ────────────────────────────────────────────────────────────────
// Unique index uq_brand_name on name — ON CONFLICT DO NOTHING is safe.

async function seedBrands() {
  const names = ["Toyota", "Hyundai", "BMW", "Mercedes-Benz"];
  const rows = names.map((name) => ({ name }));

  const result = await db
    .insert(brandTable)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: brandTable.id });
  console.log(`  brands: ${result.length} inserted, ${rows.length - result.length} skipped`);
}

// ─── 3. Users (Customers) ─────────────────────────────────────────────────────
// Partial unique index uq_user_email_not_null on email WHERE email IS NOT NULL.

async function seedUsers() {
  const rows = [
    { fullName: "Giorgi Maisuradze",  phone: "+995591100001", email: "giorgi.m@example.ge", country: "Georgia" },
    { fullName: "Nino Kvaratskhelia", phone: "+995591100002", email: "nino.k@example.ge",   country: "Georgia" },
    { fullName: "Luka Beridze",       phone: "+995591100003", email: "luka.b@example.ge",   country: "Georgia" },
    { fullName: "Ana Tvalchrelidze",  phone: "+995591100004", email: "ana.t@example.ge",    country: "Georgia" },
    { fullName: "Davit Chikvanaia",   phone: "+995591100005", email: "davit.c@example.ge",  country: "Georgia" },
  ];

  const result = await db
    .insert(userTable)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: userTable.id });
  console.log(`  users: ${result.length} inserted, ${rows.length - result.length} skipped`);
}

// ─── 4. Maintenance Service Types ─────────────────────────────────────────────
// Delegates to canonical seedServiceTypes() in admin-service.service.ts.
// That function inserts the project's 16 service types via SELECT-before-INSERT.

async function runSeedServiceTypes() {
  await seedServiceTypes();
  console.log("  service types: seeded via admin-service.service.ts seedServiceTypes()");
}

// ─── 5. Vehicle Models ────────────────────────────────────────────────────────
// Unique index uq_brand_model_name on (brand_id, name) — ON CONFLICT DO NOTHING.

async function seedVehicleModels() {
  const brands = await db.select({ id: brandTable.id, name: brandTable.name }).from(brandTable);
  const brandMap = new Map(brands.map((b) => [b.name, b.id]));

  const rows = [
    { brand: "Toyota",        name: "Corolla", category: "Economy", seats: 5, doors: 4, transmission: "AUTOMATIC" as const, fuelType: "PETROL" as const },
    { brand: "Toyota",        name: "RAV4",    category: "SUV",     seats: 5, doors: 4, transmission: "AUTOMATIC" as const, fuelType: "HYBRID" as const },
    { brand: "Hyundai",       name: "Tucson",  category: "SUV",     seats: 5, doors: 4, transmission: "AUTOMATIC" as const, fuelType: "PETROL" as const },
    { brand: "Hyundai",       name: "i20",     category: "Economy", seats: 5, doors: 4, transmission: "MANUAL"    as const, fuelType: "PETROL" as const },
    { brand: "BMW",           name: "X5",      category: "Luxury",  seats: 5, doors: 4, transmission: "AUTOMATIC" as const, fuelType: "DIESEL" as const },
    { brand: "Mercedes-Benz", name: "E-Class", category: "Luxury",  seats: 5, doors: 4, transmission: "AUTOMATIC" as const, fuelType: "PETROL" as const },
  ];

  const insertRows = rows.map(({ brand, ...rest }) => ({
    brandId: brandMap.get(brand)!,
    ...rest,
  }));

  const result = await db
    .insert(vehicleModelTable)
    .values(insertRows)
    .onConflictDoNothing()
    .returning({ id: vehicleModelTable.id });
  console.log(`  vehicle models: ${result.length} inserted, ${rows.length - result.length} skipped`);
}

// ─── 6. Vehicles ──────────────────────────────────────────────────────────────
// No unique constraint on license_plate — SELECT-before-INSERT by plate.

async function seedVehicles() {
  const models = await db
    .select({ id: vehicleModelTable.id, name: vehicleModelTable.name, brandId: vehicleModelTable.brandId })
    .from(vehicleModelTable);
  const brands = await db.select({ id: brandTable.id, name: brandTable.name }).from(brandTable);
  const brandNameMap = new Map(brands.map((b) => [b.id, b.name]));

  const modelKey = (brandName: string, modelName: string) => `${brandName}::${modelName}`;
  const modelMap = new Map(
    models.map((m) => [modelKey(brandNameMap.get(m.brandId) ?? "", m.name), m.id]),
  );

  const locations = await db.select({ id: locationTable.id, name: locationTable.name }).from(locationTable);
  const locationMap = new Map(locations.map((l) => [l.name, l.id]));

  const rows = [
    { plate: "GG-001-AA", model: modelKey("Toyota",        "Corolla"), color: "White",     year: 2022, status: "AVAILABLE"   as const, location: "Tbilisi International Airport", mileage: 34200 },
    { plate: "GG-002-BB", model: modelKey("Toyota",        "RAV4"),    color: "Silver",    year: 2023, status: "RENTED"      as const, location: "Tbilisi City Center",           mileage: 18500 },
    { plate: "GG-003-CC", model: modelKey("Hyundai",       "Tucson"),  color: "Black",     year: 2022, status: "AVAILABLE"   as const, location: "Tbilisi International Airport", mileage: 27300 },
    { plate: "GG-004-DD", model: modelKey("Hyundai",       "i20"),     color: "Red",       year: 2021, status: "MAINTENANCE" as const, location: "Tbilisi City Center",           mileage: 61000 },
    { plate: "GG-005-EE", model: modelKey("BMW",           "X5"),      color: "Dark Blue", year: 2023, status: "AVAILABLE"   as const, location: "Kutaisi International Airport", mileage:  9800 },
    { plate: "GG-006-FF", model: modelKey("Mercedes-Benz", "E-Class"), color: "White",     year: 2022, status: "RESERVED"    as const, location: "Batumi Sea Port",               mileage: 22100 },
  ];

  let inserted = 0;
  for (const row of rows) {
    const existing = await db
      .select({ id: vehicleTable.id })
      .from(vehicleTable)
      .where(eq(vehicleTable.licensePlate, row.plate))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(vehicleTable).values({
        licensePlate: row.plate,
        vehicleModelId: modelMap.get(row.model)!,
        color: row.color,
        year: row.year,
        status: row.status,
        locationId: locationMap.get(row.location)!,
        mileage: row.mileage,
      });
      inserted++;
    }
  }
  console.log(`  vehicles: ${inserted} inserted, ${rows.length - inserted} skipped`);
}

// ─── 7. Bookings ──────────────────────────────────────────────────────────────
// No unique constraint — skip entire block if any bookings already exist.

async function seedBookings() {
  const [{ total }] = await db.select({ total: count() }).from(bookingTable);
  if (Number(total) > 0) {
    console.log(`  bookings: skipped (${total} already exist)`);
    return;
  }

  const users = await db.select({ id: userTable.id, fullName: userTable.fullName }).from(userTable);
  const userMap = new Map(users.map((u) => [u.fullName!, u.id]));

  const vehicles = await db.select({ id: vehicleTable.id, plate: vehicleTable.licensePlate }).from(vehicleTable);
  const vehicleMap = new Map(vehicles.map((v) => [v.plate!, v.id]));

  const locations = await db.select({ id: locationTable.id, name: locationTable.name }).from(locationTable);
  const locMap = new Map(locations.map((l) => [l.name, l.id]));

  const tbilisiAirport = locMap.get("Tbilisi International Airport")!;
  const tbilisiCity    = locMap.get("Tbilisi City Center")!;
  const kutaisiAirport = locMap.get("Kutaisi International Airport")!;
  const batumiSeaPort  = locMap.get("Batumi Sea Port")!;

  const bookings = [
    {
      userId:            userMap.get("Giorgi Maisuradze")!,
      vehicleId:         vehicleMap.get("GG-002-BB"),
      pickupLocationId:  tbilisiAirport,
      dropoffLocationId: tbilisiCity,
      pickupDatetime:    dateAt(0, 10),
      dropoffDatetime:   dateAt(3, 10),
      status:            "DELIVERED" as const,
      paymentStatus:     "HALF"      as const,
      totalAmount:       "270.00",
      currency:          "GEL",
      contactFullName:   "Giorgi Maisuradze",
      contactPhone:      "+995591100001",
    },
    {
      userId:            userMap.get("Nino Kvaratskhelia")!,
      vehicleId:         vehicleMap.get("GG-005-EE"),
      pickupLocationId:  kutaisiAirport,
      dropoffLocationId: kutaisiAirport,
      pickupDatetime:    dateAt(-3, 9),
      dropoffDatetime:   dateAt(0, 9),
      status:            "DELIVERED" as const,
      paymentStatus:     "PAID"      as const,
      totalAmount:       "450.00",
      currency:          "GEL",
      contactFullName:   "Nino Kvaratskhelia",
      contactPhone:      "+995591100002",
    },
    {
      userId:            userMap.get("Luka Beridze")!,
      vehicleId:         vehicleMap.get("GG-003-CC"),
      pickupLocationId:  tbilisiAirport,
      dropoffLocationId: tbilisiAirport,
      pickupDatetime:    dateAt(2, 12),
      dropoffDatetime:   dateAt(5, 12),
      status:            "CONFIRMED" as const,
      paymentStatus:     "UNPAID"    as const,
      totalAmount:       "240.00",
      currency:          "GEL",
      contactFullName:   "Luka Beridze",
      contactPhone:      "+995591100003",
    },
    {
      userId:            userMap.get("Ana Tvalchrelidze")!,
      vehicleId:         vehicleMap.get("GG-006-FF"),
      pickupLocationId:  batumiSeaPort,
      dropoffLocationId: batumiSeaPort,
      pickupDatetime:    dateAt(-10, 11),
      dropoffDatetime:   dateAt(-7, 11),
      status:            "RETURNED"  as const,
      paymentStatus:     "PAID"      as const,
      totalAmount:       "360.00",
      currency:          "GEL",
      contactFullName:   "Ana Tvalchrelidze",
      contactPhone:      "+995591100004",
    },
    {
      userId:            userMap.get("Davit Chikvanaia")!,
      vehicleId:         vehicleMap.get("GG-001-AA"),
      pickupLocationId:  tbilisiCity,
      dropoffLocationId: tbilisiAirport,
      pickupDatetime:    dateAt(-5, 14),
      dropoffDatetime:   dateAt(-2, 14),
      status:            "RETURNED"  as const,
      paymentStatus:     "REFUNDED"  as const,
      totalAmount:       "180.00",
      currency:          "GEL",
      contactFullName:   "Davit Chikvanaia",
      contactPhone:      "+995591100005",
    },
    {
      userId:            userMap.get("Giorgi Maisuradze")!,
      vehicleId:         vehicleMap.get("GG-001-AA"),
      pickupLocationId:  tbilisiAirport,
      dropoffLocationId: tbilisiAirport,
      pickupDatetime:    dateAt(-30, 10),
      dropoffDatetime:   dateAt(-27, 10),
      status:            "CANCELED"  as const,
      paymentStatus:     "UNPAID"    as const,
      totalAmount:       "180.00",
      currency:          "GEL",
      contactFullName:   "Giorgi Maisuradze",
      contactPhone:      "+995591100001",
    },
  ];

  await db.insert(bookingTable).values(bookings);
  console.log(`  bookings: ${bookings.length} inserted`);
}

// ─── 8. Maintenance Service Records ──────────────────────────────────────────
// No unique constraint — skip entire block if any records already exist.

async function seedServiceRecords() {
  const [{ total }] = await db.select({ total: count() }).from(maintenanceServicesTable);
  if (Number(total) > 0) {
    console.log(`  service records: skipped (${total} already exist)`);
    return;
  }

  const vehicles = await db
    .select({ id: vehicleTable.id, plate: vehicleTable.licensePlate })
    .from(vehicleTable);
  const vehicleMap = new Map(vehicles.map((v) => [v.plate!, v.id]));

  const { maintenanceServiceTypesTable: svcTypesTable } = await import("@workspace/db");
  const types = await db
    .select({ id: svcTypesTable.id, name: svcTypesTable.name })
    .from(svcTypesTable);
  const typeMap = new Map(types.map((t) => [t.name, t.id]));

  const records = [
    {
      vehicleId:     vehicleMap.get("GG-001-AA")!,
      serviceTypeId: typeMap.get("Oil")!,
      status:        "COMPLETED"   as const,
      serviceDate:   toDateString(-14),
      mileage:       33500,
      cost:          "85.00",
      shopName:      "AutoService Tbilisi",
    },
    {
      vehicleId:     vehicleMap.get("GG-005-EE")!,
      serviceTypeId: typeMap.get("Wheel Diagnostic")!,
      status:        "COMPLETED"   as const,
      serviceDate:   toDateString(-30),
      mileage:       9200,
      cost:          "150.00",
      shopName:      "BMW Center Kutaisi",
    },
    {
      vehicleId:     vehicleMap.get("GG-004-DD")!,
      serviceTypeId: typeMap.get("Brake Pads Front")!,
      status:        "IN_PROGRESS" as const,
      serviceDate:   toDateString(0),
      mileage:       60800,
      cost:          "200.00",
      shopName:      "City Auto Tbilisi",
    },
  ];

  await db.insert(maintenanceServicesTable).values(records);
  console.log(`  service records: ${records.length} inserted`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding development data…");

  await seedLocations();
  await seedBrands();
  await seedUsers();
  await runSeedServiceTypes();
  await seedVehicleModels();
  await seedVehicles();
  await seedBookings();
  await seedServiceRecords();

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
