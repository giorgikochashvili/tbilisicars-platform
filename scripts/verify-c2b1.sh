#!/usr/bin/env bash
#
# verify-c2b1.sh
#
# C2b-1 verification lifecycle script.
# Proves that all C1, C2a, and C2b-1 tests pass against a dedicated test database,
# and that the database is left clean after all tests.
#
# REQUIREMENTS:
#   DATABASE_URL          — production/dev DB reference (safety guard only)
#   RBG_TEST_DATABASE_URL — dedicated, fully disposable test database
#
# STEPS:
#   1.  Require both DATABASE_URL and RBG_TEST_DATABASE_URL
#   2.  Parse and compare host/port/database — stop if identical
#   3.  Probe connectivity to RBG_TEST_DATABASE_URL
#   4.  Reset test DB: DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL
#   5.  Materialize pre-0014 baseline from commit 61d5400
#   6.  Apply migration 0014 atomically (--single-transaction --no-psqlrc -v ON_ERROR_STOP=1)
#   7.  Run C1 PostgreSQL integration tests (test:integration) — 17/17
#   8.  Run C2a unit tests (test:unit:c2a) — 58/58
#   9.  Run C2a PostgreSQL integration tests (test:integration:c2a) — 14/14
#  10.  Run C2b-1 PostgreSQL integration/rollback tests (test:integration:c2b1)
#  11.  Cleanup-state proof: gateway_booking_context empty
#  12.  Cleanup-state proof: no C2b-1-owned booking rows
#  13.  Cleanup-state proof: no C2b-1-owned user rows
#  14.  Cleanup-state proof: no C2b-1-owned vehicle_model or brand fixtures
#  15.  Cleanup-state proof: no C2b-1-owned location fixtures
#  16.  Remove all temporary files (on success and failure)
#
# SAFETY:
#   - Never modifies DATABASE_URL target
#   - Never derives one URL from the other
#   - Stops immediately if URLs resolve to the same database
#   - Does NOT invoke the C1/C2a verifier scripts
#   - Never prints credentials, full URLs, or raw environment values
#   - Migration 0014 runs only against RBG_TEST_DATABASE_URL
#

set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_COMMIT="61d5400623e5f716efda9a3abd89ccbc7c67f49a"
MIGRATION_FILE="${WORKSPACE_ROOT}/lib/db/migrations/0014_regional_intake.sql"
SCHEMA_DIR="${WORKSPACE_ROOT}/lib/db/src/schema"
LIB_DB_DIR="${WORKSPACE_ROOT}/lib/db"
BASELINE_INDEX="${SCHEMA_DIR}/__baseline_index.ts"
TEMP_CONFIG="${LIB_DB_DIR}/__baseline_drizzle_config.ts"

# Track temp files for cleanup
TEMP_FILES=("${BASELINE_INDEX}" "${TEMP_CONFIG}")

# ── Exit hook — always remove temp files ─────────────────────────────────────

cleanup() {
  for f in "${TEMP_FILES[@]}"; do
    if [ -f "${f}" ]; then
      rm -f "${f}"
    fi
  done
}
trap cleanup EXIT

step() {
  echo ""
  echo "[Step $1] $2"
}

# ── Step 1: Require both environment variables ────────────────────────────────

step 1 "Checking required environment variables"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "STOP: DATABASE_URL is not set. A production database reference is required for safety guards."
  exit 1
fi

if [ -z "${RBG_TEST_DATABASE_URL:-}" ]; then
  echo "STOP: RBG_TEST_DATABASE_URL is not set. Set it to a dedicated, fully disposable PostgreSQL database."
  exit 1
fi

echo "  DATABASE_URL: set ✓"
echo "  RBG_TEST_DATABASE_URL: set ✓"

# ── Step 2: Parse and compare host/port/database ─────────────────────────────

step 2 "Verifying test URL is distinct from DATABASE_URL"

# URL parsing uses an isolated environment variable to avoid interpolating
# credentials into Python source strings or argv.
read -r TEST_HOST TEST_PORT TEST_DBNAME <<< "$(
  RBG_PARSE_URL="${RBG_TEST_DATABASE_URL}" python3 - <<'PY'
import os
from urllib.parse import unquote, urlparse

parsed = urlparse(os.environ["RBG_PARSE_URL"])
host     = parsed.hostname or ""
port     = parsed.port or 5432
database = unquote(parsed.path.lstrip("/"))

print(host, port, database)
PY
)"

read -r DEV_HOST DEV_PORT DEV_DBNAME <<< "$(
  RBG_PARSE_URL="${DATABASE_URL}" python3 - <<'PY'
import os
from urllib.parse import unquote, urlparse

parsed = urlparse(os.environ["RBG_PARSE_URL"])
host     = parsed.hostname or ""
port     = parsed.port or 5432
database = unquote(parsed.path.lstrip("/"))

print(host, port, database)
PY
)"

if [ -z "${TEST_HOST}" ] || [ -z "${TEST_DBNAME}" ]; then
  echo "STOP: RBG_TEST_DATABASE_URL does not contain a valid host or database name."
  exit 1
fi

if [ -z "${DEV_HOST}" ] || [ -z "${DEV_DBNAME}" ]; then
  echo "STOP: DATABASE_URL does not contain a valid host or database name."
  exit 1
fi

if [ "${TEST_HOST}" = "${DEV_HOST}" ] && \
   [ "${TEST_PORT}" = "${DEV_PORT}" ] && \
   [ "${TEST_DBNAME}" = "${DEV_DBNAME}" ]; then
  echo "STOP: RBG_TEST_DATABASE_URL resolves to the same database as DATABASE_URL."
  echo "      Test database must be distinct."
  exit 1
fi

echo "  Test database: ${TEST_DBNAME} ✓ (distinct from production)"

# ── Step 3: Probe connectivity ────────────────────────────────────────────────

step 3 "Probing test database connectivity"

CONNECTED_DB=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A -c "SELECT current_database()" 2>&1) || {
  echo "STOP: Cannot connect to test database. Check RBG_TEST_DATABASE_URL."
  exit 1
}
CONNECTED_DB="${CONNECTED_DB// /}"

if [ "${CONNECTED_DB}" != "${TEST_DBNAME}" ]; then
  echo "STOP: Connected to '${CONNECTED_DB}' but expected '${TEST_DBNAME}'."
  exit 1
fi

echo "  Connected to '${CONNECTED_DB}' ✓"

# ── Step 4: Reset test DB ─────────────────────────────────────────────────────

step 4 "Resetting test database public schema"
echo "  WARNING: This irreversibly wipes all objects in the test database."

psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -c "DROP SCHEMA public CASCADE" > /dev/null 2>&1
psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -c "CREATE SCHEMA public" > /dev/null 2>&1
psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -c "GRANT ALL ON SCHEMA public TO public" > /dev/null 2>&1

echo "  Public schema reset ✓"

# ── Step 5: Materialize pre-0014 baseline ────────────────────────────────────

step 5 "Extracting pre-0014 baseline schema from commit ${BASELINE_COMMIT:0:7}"

if ! git -C "${WORKSPACE_ROOT}" cat-file -e "${BASELINE_COMMIT}" 2>/dev/null; then
  echo "STOP: Baseline commit ${BASELINE_COMMIT} not found. Ensure git history is available."
  exit 1
fi

git -C "${WORKSPACE_ROOT}" show "${BASELINE_COMMIT}:lib/db/src/schema/index.ts" > "${BASELINE_INDEX}" 2>/dev/null || {
  echo "STOP: Failed to extract schema/index.ts from commit ${BASELINE_COMMIT:0:7}."
  exit 1
}

cat > "${TEMP_CONFIG}" << 'EOF'
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema:       "./src/schema/__baseline_index.ts",
  dialect:      "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  tablesFilter: ["!session"],
});
EOF

echo "  Baseline files written ✓"

BASELINE_PUSH_LOG="$(mktemp)"
TEMP_FILES+=("${BASELINE_PUSH_LOG}")

if DATABASE_URL="${RBG_TEST_DATABASE_URL}" \
  pnpm --filter @workspace/db exec drizzle-kit push \
    --config=__baseline_drizzle_config.ts \
    --force \
    >"${BASELINE_PUSH_LOG}" 2>&1
then
  echo "  Pre-0014 baseline schema applied ✓"
else
  echo "STOP: Pre-0014 baseline schema push failed."
  exit 1
fi

# Remove temp files now — no longer needed
rm -f "${BASELINE_INDEX}" "${TEMP_CONFIG}"

# ── Step 6: Apply migration 0014 atomically ───────────────────────────────────

step 6 "Applying migration 0014_regional_intake.sql"

if [ ! -f "${MIGRATION_FILE}" ]; then
  echo "STOP: Migration file not found: ${MIGRATION_FILE}"
  exit 1
fi

psql "${RBG_TEST_DATABASE_URL}" \
  --single-transaction \
  --no-psqlrc \
  -v ON_ERROR_STOP=1 \
  -f "${MIGRATION_FILE}" > /dev/null 2>&1 || {
  echo "STOP: Migration 0014 failed to apply atomically."
  exit 1
}

echo "  Migration 0014 applied atomically ✓"

# ── Step 7: Run C1 integration tests ─────────────────────────────────────────

step 7 "Running C1 PostgreSQL integration tests (test:integration)"

RBG_TEST_DATABASE_URL="${RBG_TEST_DATABASE_URL}" \
  pnpm --filter @workspace/api-server run test:integration || {
  echo "STOP: C1 integration tests failed."
  exit 1
}

echo "  C1 integration tests passed ✓"

# ── Step 8: Run C2a unit tests ────────────────────────────────────────────────

step 8 "Running C2a unit tests (test:unit:c2a)"

pnpm --filter @workspace/api-server run test:unit:c2a || {
  echo "STOP: C2a unit tests failed."
  exit 1
}

echo "  C2a unit tests passed ✓"

# ── Step 9: Run C2a integration tests ────────────────────────────────────────

step 9 "Running C2a PostgreSQL integration tests (test:integration:c2a)"

RBG_TEST_DATABASE_URL="${RBG_TEST_DATABASE_URL}" \
  pnpm --filter @workspace/api-server run test:integration:c2a || {
  echo "STOP: C2a integration tests failed."
  exit 1
}

echo "  C2a integration tests passed ✓"

# ── Step 10: Run C2b-1 PostgreSQL integration/rollback tests ─────────────────

step 10 "Running C2b-1 PostgreSQL integration/rollback tests (test:integration:c2b1)"

RBG_TEST_DATABASE_URL="${RBG_TEST_DATABASE_URL}" \
  pnpm --filter @workspace/api-server run test:integration:c2b1 || {
  echo "STOP: C2b-1 integration tests failed."
  exit 1
}

echo "  C2b-1 integration tests passed ✓"

# ── Step 11: Cleanup-state proof — gateway_booking_context empty ──────────────

step 11 "Cleanup-state proof: gateway_booking_context must be empty"

GBC_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM gateway_booking_context")
GBC_COUNT="${GBC_COUNT// /}"

if [ "${GBC_COUNT}" -ne "0" ]; then
  echo "STOP: ${GBC_COUNT} row(s) remain in gateway_booking_context after all tests."
  echo "      All test fixtures must be cleaned up in finally blocks."
  exit 1
fi

echo "  gateway_booking_context: 0 rows ✓"

# ── Step 12: Cleanup-state proof — booking_attribution must be empty ──────────

step 12 "Cleanup-state proof: booking_attribution must be empty"

ATTR_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM booking_attribution")
ATTR_COUNT="${ATTR_COUNT// /}"

if [ "${ATTR_COUNT}" -ne "0" ]; then
  echo "STOP: ${ATTR_COUNT} row(s) remain in booking_attribution after all tests."
  echo "      All test fixtures must be cleaned up in finally blocks."
  exit 1
fi

echo "  booking_attribution: 0 rows ✓"

# ── Step 13: Cleanup-state proof — no C2b-1 booking rows ─────────────────────

step 13 "Cleanup-state proof: no C2b-1-owned booking rows"

C2B1_BOOKING_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM booking WHERE source = 'gateway'")
C2B1_BOOKING_COUNT="${C2B1_BOOKING_COUNT// /}"

if [ "${C2B1_BOOKING_COUNT}" -ne "0" ]; then
  echo "STOP: ${C2B1_BOOKING_COUNT} gateway booking row(s) remain after C2b-1 tests."
  exit 1
fi

echo "  gateway booking rows: 0 ✓"

# ── Step 14: Cleanup-state proof — no C2b-1-owned user rows ──────────────────

step 14 "Cleanup-state proof: no C2b-1-owned user rows"

C2B1_USER_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM \"user\" WHERE email LIKE 'c2b1-%@rbg-test.invalid'")
C2B1_USER_COUNT="${C2B1_USER_COUNT// /}"

if [ "${C2B1_USER_COUNT}" -ne "0" ]; then
  echo "STOP: ${C2B1_USER_COUNT} C2b-1-owned user row(s) remain after tests."
  exit 1
fi

echo "  C2b-1 user fixtures: 0 rows ✓"

# ── Step 15: Cleanup-state proof — no C2b-1 vehicle_model or brand fixtures ──

step 15 "Cleanup-state proof: no C2b-1-owned vehicle_model or brand fixtures"

C2B1_MODEL_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM vehicle_model WHERE name LIKE 'C2b1 %'")
C2B1_MODEL_COUNT="${C2B1_MODEL_COUNT// /}"

if [ "${C2B1_MODEL_COUNT}" -ne "0" ]; then
  echo "STOP: ${C2B1_MODEL_COUNT} C2b-1-owned vehicle_model row(s) remain after tests."
  exit 1
fi

echo "  C2b-1 vehicle_model fixtures: 0 rows ✓"

C2B1_BRAND_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM brand WHERE name LIKE 'C2b1 %'")
C2B1_BRAND_COUNT="${C2B1_BRAND_COUNT// /}"

if [ "${C2B1_BRAND_COUNT}" -ne "0" ]; then
  echo "STOP: ${C2B1_BRAND_COUNT} C2b-1-owned brand row(s) remain after tests."
  exit 1
fi

echo "  C2b-1 brand fixtures: 0 rows ✓"

# ── Step 16: Cleanup-state proof — no C2b-1 location fixtures ────────────────

step 16 "Cleanup-state proof: no C2b-1-owned location fixtures"

C2B1_LOC_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM location WHERE name LIKE 'C2b1 %'")
C2B1_LOC_COUNT="${C2B1_LOC_COUNT// /}"

if [ "${C2B1_LOC_COUNT}" -ne "0" ]; then
  echo "STOP: ${C2B1_LOC_COUNT} C2b-1-owned location row(s) remain after tests."
  exit 1
fi

echo "  C2b-1 location fixtures: 0 rows ✓"

# Also verify C2a fixtures are still clean (regression guard)
C2A_LOC_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM location WHERE name LIKE 'C2a %'")
C2A_LOC_COUNT="${C2A_LOC_COUNT// /}"

if [ "${C2A_LOC_COUNT}" -ne "0" ]; then
  echo "STOP: ${C2A_LOC_COUNT} C2a-owned location row(s) remain after tests."
  exit 1
fi

echo "  C2a location fixtures: 0 rows ✓"

C2A_MODEL_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM vehicle_model WHERE name LIKE 'C2a %'")
C2A_MODEL_COUNT="${C2A_MODEL_COUNT// /}"

if [ "${C2A_MODEL_COUNT}" -ne "0" ]; then
  echo "STOP: ${C2A_MODEL_COUNT} C2a-owned vehicle_model row(s) remain after tests."
  exit 1
fi

echo "  C2a vehicle_model fixtures: 0 rows ✓"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  PASS: C2b-1 verified                                           ║"
echo "║        C1 integration ✓ · C2a unit ✓ · C2a integration ✓       ║"
echo "║        C2b-1 integration ✓ · cleanup-state proof ✓             ║"
echo "║        no temp files remain                                     ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
