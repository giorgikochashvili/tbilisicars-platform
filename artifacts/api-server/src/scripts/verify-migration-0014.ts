/**
 * verify-migration-0014.ts
 *
 * Parity-gate verification script for migration 0014 (regional intake tables).
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run verify:migration-0014
 *
 * Requirements:
 *   - RBG_TEST_DATABASE_URL must be set to a dedicated, fully disposable
 *     PostgreSQL database.  DATABASE_URL must also be set as a safety reference.
 *   - The two URLs must never be equal.
 *   - The test database will have its public schema DROPPED and recreated.
 *
 * All SQL operations use psql (CLI); no pg module import required.
 *
 * Binding parity rule (Step 13):
 *   Snapshot A = catalog state produced by applying the SQL migration.
 *   Snapshot B = catalog state produced by drizzle-kit push with the Drizzle
 *   schema.  The two snapshots must be byte-identical.
 *
 *   If they differ, this script stops immediately.  Do NOT weaken, remove,
 *   rename, relax, or bypass any PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK
 *   constraint, cents bound, brand restriction, fingerprint rule, or ON DELETE
 *   behavior merely to make drizzle-kit pass.  Report the structural diff
 *   (printed above the STOP line) and escalate for review instead.
 */

import { execSync, spawnSync } from "node:child_process";
import {
  existsSync,
  writeFileSync,
  unlinkSync,
  readFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── ESM-safe __dirname ────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// artifacts/api-server/src/scripts → 4 levels up → workspace root
const WORKSPACE_ROOT  = join(__dirname, "../../../../");
const LIB_DB_DIR      = join(WORKSPACE_ROOT, "lib/db");
const SCHEMA_DIR      = join(LIB_DB_DIR,     "src/schema");
const MIGRATION_FILE  = join(LIB_DB_DIR,     "migrations/0014_regional_intake.sql");
const BASELINE_INDEX  = join(SCHEMA_DIR,     "__baseline_index.ts");
const TEMP_CONFIG     = join(LIB_DB_DIR,     "__baseline_drizzle_config.ts");
const BASELINE_COMMIT = "61d5400623e5f716efda9a3abd89ccbc7c67f49a";

const REGIONAL_INTAKE_TABLES = ["integration_client", "gateway_booking_context"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sentinel thrown by stop() so the finally block always runs. */
class VerifyStopError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "VerifyStopError";
  }
}

/** Log a STOP message and throw — finally block runs before process exits. */
function stop(msg: string): never {
  throw new VerifyStopError(`STOP: ${msg}`);
}

function step(n: number | string, msg: string): void {
  console.log(`\n[Step ${n}] ${msg}`);
}

function runCmd(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): void {
  const result = spawnSync(cmd, args, {
    cwd:   opts.cwd ?? WORKSPACE_ROOT,
    env:   opts.env ?? process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    stop(`Command failed (exit ${result.status}): ${cmd} ${args.join(" ")}`);
  }
}

/** Run SQL via psql and return trimmed stdout. Throws on non-zero exit. */
function psqlQuery(dbUrl: string, sql: string): string {
  const result = spawnSync(
    "psql",
    [dbUrl, "--no-psqlrc", "-t", "-A", "-F", "\t", "-c", sql],
    { encoding: "utf8", cwd: WORKSPACE_ROOT, shell: false },
  );
  if (result.status !== 0) {
    // Retain raw output internally; never emit credentials or full error text.
    const _rawOutput = result.stderr ?? result.stdout; // eslint-disable-line @typescript-eslint/no-unused-vars
    throw new Error(`psql query failed (exit ${result.status})`);
  }
  return result.stdout.trim();
}

/** Run SQL file via psql. Throws on non-zero exit. */
function psqlFile(dbUrl: string, filePath: string): void {
  const result = spawnSync(
    "psql",
    [dbUrl, "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-f", filePath],
    { encoding: "utf8", cwd: WORKSPACE_ROOT, stdio: "inherit", shell: false },
  );
  if (result.status !== 0) {
    stop(`psql -f ${filePath} failed (exit ${result.status})`);
  }
}

/** Parse psql tab-separated output into rows of key:value objects. */
function parsePsqlRows(
  output: string,
  columns: string[],
): Array<Record<string, string>> {
  if (!output) return [];
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t");
      const row: Record<string, string> = {};
      columns.forEach((col, i) => {
        row[col] = parts[i] ?? "";
      });
      return row;
    });
}

// ── Step 1: Require both environment variables explicitly ─────────────────────
step(1, "Resolving effective RBG test database URL");

if (!process.env["DATABASE_URL"]) {
  stop(
    "DATABASE_URL is not set. " +
    "A production database reference is required for safety guards.",
  );
}
if (!process.env["RBG_TEST_DATABASE_URL"]) {
  stop(
    "RBG_TEST_DATABASE_URL is not set. " +
    "Set it to a dedicated, fully disposable PostgreSQL database before running verify.",
  );
}

const effectiveTestUrl = process.env["RBG_TEST_DATABASE_URL"]!;
console.log("  Source: RBG_TEST_DATABASE_URL (explicit) ✓");

// ── Step 2: Guard — test URL must not equal DATABASE_URL ─────────────────────
step(2, "Verifying test URL is distinct from DATABASE_URL");

if (effectiveTestUrl === process.env["DATABASE_URL"]) {
  stop(
    "RBG_TEST_DATABASE_URL equals DATABASE_URL. " +
    "The test database must be a separate database.",
  );
}

const testParsed = new URL(effectiveTestUrl);
const testDbName = testParsed.pathname.slice(1);
if (!testDbName) {
  stop("RBG_TEST_DATABASE_URL does not contain a database name in the path.");
}

const devParsed = new URL(process.env["DATABASE_URL"]!);
const devDbName = devParsed.pathname.slice(1);

if (
  testParsed.hostname === devParsed.hostname &&
  testParsed.port     === devParsed.port &&
  testDbName          === devDbName
) {
  stop(
    `Test database '${testDbName}' is the same as the production database '${devDbName}'. ` +
    "Use a distinct database name.",
  );
}
console.log(`  Test database: ${testDbName} ✓`);

// ── Step 3: Guard — schema changes are limited to allowed files ───────────────
step(3, "Checking schema working-tree changes against baseline commit");

let diffOutput: string;
try {
  diffOutput = execSync(
    `git diff --name-only ${BASELINE_COMMIT} -- lib/db/src/schema/`,
    { cwd: WORKSPACE_ROOT, encoding: "utf8" },
  ).trim();
} catch {
  stop("Failed to run git diff. Ensure git is available and the baseline commit exists.");
}

const ALLOWED_SCHEMA_CHANGES = new Set([
  "lib/db/src/schema/index.ts",
  "lib/db/src/schema/regional-intake.ts",
  "lib/db/src/schema/__baseline_index.ts",
]);

if (diffOutput !== "") {
  const changed    = diffOutput.split("\n").filter(Boolean);
  const unexpected = changed.filter((f) => !ALLOWED_SCHEMA_CHANGES.has(f));
  if (unexpected.length > 0) {
    stop(
      "Unexpected schema changes detected since baseline commit:\n  " +
      unexpected.join("\n  ") + "\n" +
      "Phase C1 may only modify: index.ts, regional-intake.ts",
    );
  }
  console.log("  Allowed schema changes: " + changed.join(", ") + " ✓");
} else {
  console.log("  No schema changes detected ✓");
}

// ── Step 4: Guard — temp files must be absent ─────────────────────────────────
step(4, "Verifying temp files are absent");

if (existsSync(BASELINE_INDEX)) {
  stop(`${BASELINE_INDEX} already exists. Remove it before running verify.`);
}
if (existsSync(TEMP_CONFIG)) {
  stop(`${TEMP_CONFIG} already exists. Remove it before running verify.`);
}
console.log("  Temp files absent ✓");

// ── Step 5: Verify test DB connectivity ──────────────────────────────────────
step(5, "Verifying test database connectivity and identity");

let currentDbName: string;
try {
  currentDbName = psqlQuery(effectiveTestUrl, "SELECT current_database()");
} catch (err) {
  stop(`Cannot connect to test database '${testDbName}': ${err}`);
}

if (currentDbName !== testDbName) {
  stop(
    `Connected to '${currentDbName}' but expected '${testDbName}'. ` +
    "Check RBG_TEST_DATABASE_URL.",
  );
}
if (currentDbName === devDbName) {
  stop(
    `Connected database '${currentDbName}' matches the production database name '${devDbName}'. ` +
    "The test database must be distinct from the production database.",
  );
}
console.log(`  Connected to '${currentDbName}' ✓`);

// ── Step 6: Reset public schema ───────────────────────────────────────────────
step(6, "Resetting public schema (DROP SCHEMA public CASCADE; CREATE SCHEMA public)");
console.log("  WARNING: This irreversibly wipes all objects in the test database.");

try {
  psqlQuery(effectiveTestUrl, "DROP SCHEMA public CASCADE");
  psqlQuery(effectiveTestUrl, "CREATE SCHEMA public");
  psqlQuery(effectiveTestUrl, "GRANT ALL ON SCHEMA public TO public");
  console.log("  Public schema reset ✓");
} catch (err) {
  stop(`Failed to reset public schema: ${err}`);
}

// ── From here, always clean up temp files ─────────────────────────────────────
let verifyFailed = false;
try {
  // ── Step 7: Extract baseline schema index from git ──────────────────────────
  step(7, `Extracting schema/index.ts from commit ${BASELINE_COMMIT.slice(0, 7)}`);

  let baselineContent: string;
  try {
    baselineContent = execSync(
      `git show ${BASELINE_COMMIT}:lib/db/src/schema/index.ts`,
      { cwd: WORKSPACE_ROOT, encoding: "utf8" },
    );
  } catch {
    stop(
      `Failed to git show baseline schema index from commit ${BASELINE_COMMIT}. ` +
      "Ensure the commit exists.",
    );
  }

  writeFileSync(BASELINE_INDEX, baselineContent, "utf8");
  console.log(`  Written: ${BASELINE_INDEX}`);

  // ── Step 7b: Write temp drizzle config pointing to __baseline_index.ts ──────
  const baselineConfig = [
    `import { defineConfig } from "drizzle-kit";`,
    `export default defineConfig({`,
    `  schema:       "./src/schema/__baseline_index.ts",`,
    `  dialect:      "postgresql",`,
    `  dbCredentials: { url: process.env.DATABASE_URL! },`,
    `  tablesFilter: ["!session"],`,
    `});`,
    ``,
  ].join("\n");
  writeFileSync(TEMP_CONFIG, baselineConfig, "utf8");
  console.log(`  Written: ${TEMP_CONFIG}`);

  // ── Step 8: Push baseline schema (pre-0014 state) ───────────────────────────
  step(8, "Pushing pre-0014 baseline schema via drizzle-kit");

  runCmd(
    "pnpm",
    [
      "--filter", "@workspace/db",
      "exec", "drizzle-kit",
      "push",
      "--config=__baseline_drizzle_config.ts",
      "--force",
    ],
    {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, DATABASE_URL: effectiveTestUrl },
    },
  );
  console.log("  Baseline schema pushed ✓");

  // ── Step 9: Apply migration 0014 ─────────────────────────────────────────────
  step(9, "Applying migration 0014_regional_intake.sql");

  psqlFile(effectiveTestUrl, MIGRATION_FILE);
  console.log("  Migration 0014 applied ✓");

  // ── Step 10: Snapshot A ───────────────────────────────────────────────────────
  step(10, "Taking Snapshot A (catalog state after migration)");
  const snapshotA = takeCatalogSnapshot(effectiveTestUrl);
  console.log(
    `  Snapshot A: ${snapshotA.columns.length} column rows, ` +
    `${snapshotA.constraints.length} constraints, ` +
    `${snapshotA.indexes.length} indexes`,
  );

  // ── Step 11: Push post-C1 schema (parity check) ──────────────────────────────
  step(11, "Pushing post-C1 schema via drizzle-kit (parity gate)");

  runCmd(
    "pnpm",
    ["--filter", "@workspace/db", "exec", "drizzle-kit", "push", "--force"],
    {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, DATABASE_URL: effectiveTestUrl },
    },
  );
  console.log("  Post-C1 schema pushed ✓");

  // ── Step 12: Snapshot B ───────────────────────────────────────────────────────
  step(12, "Taking Snapshot B (catalog state after parity push)");
  const snapshotB = takeCatalogSnapshot(effectiveTestUrl);
  console.log(
    `  Snapshot B: ${snapshotB.columns.length} column rows, ` +
    `${snapshotB.constraints.length} constraints, ` +
    `${snapshotB.indexes.length} indexes`,
  );

  // ── Step 13: Compare snapshots ────────────────────────────────────────────────
  step(13, "Comparing Snapshot A vs Snapshot B (must be identical)");

  const aJson = JSON.stringify(snapshotA, null, 2);
  const bJson = JSON.stringify(snapshotB, null, 2);

  if (aJson !== bJson) {
    // Print the structural diff for review. Output contains only schema
    // metadata (column names, constraint names, types, index definitions).
    // No credentials, URLs, or raw environment values are emitted.
    console.error("\n=== Snapshot A (SQL migration) ===\n" + aJson);
    console.error("\n=== Snapshot B (Drizzle push)  ===\n" + bJson);
    stop(
      "Snapshot A ≠ Snapshot B: the Drizzle schema (regional-intake.ts) does " +
      "not match the SQL migration (0014_regional_intake.sql) exactly. " +
      "Binding parity rule: do NOT weaken, remove, rename, relax, or bypass " +
      "any PRIMARY KEY, UNIQUE, FOREIGN KEY, CHECK constraint, cents bound, " +
      "brand restriction, fingerprint rule, or ON DELETE behavior merely to " +
      "make drizzle-kit pass. Review the structural diff above, fix " +
      "regional-intake.ts to match the migration exactly, and escalate for " +
      "review if a migration amendment is needed.",
    );
  }
  console.log("  Snapshot A === Snapshot B ✓");

  // ── Step 14: Run integration tests (BEFORE rollback) ─────────────────────────
  step(14, "Running integration tests against the migrated test database");

  const testResult = spawnSync(
    "pnpm",
    ["--filter", "@workspace/api-server", "run", "test:integration"],
    {
      cwd:   WORKSPACE_ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        RBG_TEST_DATABASE_URL: effectiveTestUrl,
      },
    },
  );
  if (testResult.status !== 0) {
    stop(
      `Integration tests failed (exit ${testResult.status}). ` +
      "See test output above.",
    );
  }
  console.log("  Integration tests passed ✓");

  // ── Step 15: Rollback proof ───────────────────────────────────────────────────
  step(15, "Rollback proof: dropping gateway_booking_context and integration_client");

  try {
    psqlQuery(effectiveTestUrl, "DROP TABLE gateway_booking_context");
    psqlQuery(effectiveTestUrl, "DROP TABLE integration_client");
    console.log("  Tables dropped ✓");
  } catch (err) {
    stop(`Rollback proof failed: ${err}`);
  }

  // ── Step 16: Verify both tables gone ─────────────────────────────────────────
  step(16, "Verifying both tables are gone");

  const remainingRaw = psqlQuery(
    effectiveTestUrl,
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('gateway_booking_context', 'integration_client')`,
  );
  if (remainingRaw !== "") {
    stop(`Tables still present after rollback proof: ${remainingRaw}`);
  }
  console.log("  Both tables gone ✓");

  // ── Done ──────────────────────────────────────────────────────────────────────
  console.log(
    "\n╔══════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║  PASS: Migration 0014 verified — SQL ≡ Drizzle ≡ Tests          ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════╝\n",
  );

} catch (err) {
  if (err instanceof VerifyStopError) {
    console.error(`\n${err.message}`);
    verifyFailed = true;
  } else {
    throw err;
  }
} finally {
  if (existsSync(BASELINE_INDEX)) {
    unlinkSync(BASELINE_INDEX);
    console.log(`  Cleaned up: ${BASELINE_INDEX}`);
  }
  if (existsSync(TEMP_CONFIG)) {
    unlinkSync(TEMP_CONFIG);
    console.log(`  Cleaned up: ${TEMP_CONFIG}`);
  }
}

if (verifyFailed) {
  process.exit(1);
}

// ── Snapshot helper ───────────────────────────────────────────────────────────

interface CatalogSnapshot {
  columns:     Array<Record<string, string>>;
  constraints: Array<Record<string, string>>;
  checkDefs:   Array<Record<string, string>>;
  fkRefs:      Array<Record<string, string>>;
  indexes:     Array<Record<string, string>>;
}

function takeCatalogSnapshot(dbUrl: string): CatalogSnapshot {
  const tables = REGIONAL_INTAKE_TABLES.map((t) => `'${t}'`).join(",");

  const columnsRaw = psqlQuery(
    dbUrl,
    `SELECT table_name, column_name, data_type,
            COALESCE(character_maximum_length::text,'') AS char_max,
            COALESCE(numeric_precision::text,'') AS num_prec,
            is_nullable,
            COALESCE(column_default,'') AS col_default
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (${tables})
      ORDER BY table_name, ordinal_position`,
  );
  const columns = parsePsqlRows(columnsRaw, [
    "table_name","column_name","data_type","char_max","num_prec","is_nullable","col_default",
  ]);

  const constraintsRaw = psqlQuery(
    dbUrl,
    `SELECT tc.table_name, tc.constraint_name, tc.constraint_type
       FROM information_schema.table_constraints tc
      WHERE tc.table_schema = 'public'
        AND tc.table_name IN (${tables})
      ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name`,
  );
  const constraints = parsePsqlRows(constraintsRaw, [
    "table_name","constraint_name","constraint_type",
  ]);

  const checkDefsRaw = psqlQuery(
    dbUrl,
    `SELECT tc.table_name, tc.constraint_name, cc.check_clause
       FROM information_schema.table_constraints tc
       JOIN information_schema.check_constraints cc
         ON cc.constraint_name  = tc.constraint_name
        AND cc.constraint_schema = tc.table_schema
      WHERE tc.table_schema    = 'public'
        AND tc.table_name      IN (${tables})
        AND tc.constraint_type = 'CHECK'
      ORDER BY tc.table_name, tc.constraint_name`,
  );
  const checkDefs = parsePsqlRows(checkDefsRaw, [
    "table_name","constraint_name","check_clause",
  ]);

  const fkRefsRaw = psqlQuery(
    dbUrl,
    `SELECT tc.constraint_name, tc.table_name,
            kcu.column_name, ccu.table_name AS foreign_table,
            ccu.column_name AS foreign_column,
            rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
        AND kcu.table_schema    = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema    = tc.table_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name  = tc.constraint_name
        AND rc.constraint_schema = tc.table_schema
      WHERE tc.table_schema    = 'public'
        AND tc.table_name      IN (${tables})
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.constraint_name`,
  );
  const fkRefs = parsePsqlRows(fkRefsRaw, [
    "constraint_name","table_name","column_name","foreign_table","foreign_column","delete_rule",
  ]);

  const indexesRaw = psqlQuery(
    dbUrl,
    `SELECT tablename, indexname, indexdef
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN (${tables})
      ORDER BY tablename, indexname`,
  );
  const indexes = parsePsqlRows(indexesRaw, ["tablename","indexname","indexdef"]);

  return { columns, constraints, checkDefs, fkRefs, indexes };
}
