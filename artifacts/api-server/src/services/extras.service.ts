import { db, extraTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function listExtras() {
  return db
    .select()
    .from(extraTable)
    .where(eq(extraTable.isActive, true))
    .orderBy(extraTable.name);
}
