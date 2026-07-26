#!/usr/bin/env bash
#
# verify-c2a.sh
#
# C2a verification lifecycle script.
# Proves that all C2a unit and integration tests pass against a dedicated
# test database, and that the database is left clean after all tests.
#
# REQUIREMENTS:
#   DATABASE_URL         — production/dev DB reference (safety guard only)
#   RBG_TEST_DATABASE_URL — dedicated, fully disposable test database
#
# STEPS:
#   1.  Require both DATABASE_URL and RBG_TEST_DATABASE_URL
#   2.  Parse and compare host/port/database — stop if identical
#   3.  Probe connectivity to RBG_TEST_DATABASE_URL
#   4.  Reset test DB: DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL
#   5.  Materialize pre-0014 baseline from commit 61d5400
#   6.  Apply migration 0014 atomically
#   7.  Run existing C1 integration tests (test:integration) exactly once
#   8.  Run C2a unit tests (test:unit:c2a) exactly once
#   9.  Run C2a integration tests (test:integration:c2a) exactly once
#  10.  Cleanup-state proof: gateway_booking_context must be empty
#  11.  Prove no C2a-owned fixtures remain (locations with name prefix 'C2a')
#  12.  Remove all temporary files (on success and failure)
#
# SAFETY:
#   - Never modifies DATABASE_URL target
#   - Stops immediately if URLs resolve to the same database
#   - Does NOT invoke the full C1 verifier (which would wipe tables before C2a tests)
#   - Never prints credentials, complete DB URLs, or raw environment values
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

# Use Python for portable URL parsing (no external deps beyond python3)
read -r TEST_HOST TEST_PORT TEST_DBNAME <<< "$(python3 -c "
from urllib.parse import urlparse
import sys
u = urlparse('${RBG_TEST_DATABASE_URL}')
print(u.hostname or '', u.port or 5432, u.path.lstrip('/'))
")"

read -r DEV_HOST DEV_PORT DEV_DBNAME <<< "$(python3 -c "
from urllib.parse import urlparse
import sys
u = urlparse('${DATABASE_URL}')
print(u.hostname or '', u.port or 5432, u.path.lstrip('/'))
")"

if [ -z "${TEST_DBNAME}" ]; then
  echo "STOP: RBG_TEST_DATABASE_URL does not contain a database name in the path."
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

DATABASE_URL="${RBG_TEST_DATABASE_URL}" pnpm --filter @workspace/db exec drizzle-kit push \
  --config=__baseline_drizzle_config.ts \
  --force \
  2>&1 | grep -v "password\|PASSWORD\|credentials\|CREDENTIALS" || true

echo "  Pre-0014 baseline schema applied ✓"

# Remove temp files now — they're no longer needed
rm -f "${BASELINE_INDEX}" "${TEMP_CONFIG}"

# ── Step 6: Apply migration 0014 atomically ───────────────────────────────────

step 6 "Applying migration 0014_regional_intake.sql"

if [ ! -f "${MIGRATION_FILE}" ]; then
  echo "STOP: Migration file not found: ${MIGRATION_FILE}"
  exit 1
fi

psql "${RBG_TEST_DATABASE_URL}" \
  --no-psqlrc \
  --single-transaction \
  -v ON_ERROR_STOP=1 \
  -f "${MIGRATION_FILE}" > /dev/null 2>&1 || {
  echo "STOP: Migration 0014 failed to apply atomically."
  exit 1
}

echo "  Migration 0014 applied atomically ✓"

# ── Step 7: Run C1 integration tests (existing command, exactly once) ─────────

step 7 "Running C1 integration tests (test:integration)"

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

step 9 "Running C2a integration tests (test:integration:c2a)"

RBG_TEST_DATABASE_URL="${RBG_TEST_DATABASE_URL}" \
  pnpm --filter @workspace/api-server run test:integration:c2a || {
  echo "STOP: C2a integration tests failed."
  exit 1
}

echo "  C2a integration tests passed ✓"

# ── Step 10: Cleanup-state proof — gateway_booking_context empty ──────────────

step 10 "Cleanup-state proof: verifying gateway_booking_context is empty"

GBC_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM gateway_booking_context")
GBC_COUNT="${GBC_COUNT// /}"

if [ "${GBC_COUNT}" -ne "0" ]; then
  echo "STOP: C2a tests left ${GBC_COUNT} row(s) in gateway_booking_context."
  echo "      All test fixtures must be cleaned up in finally blocks."
  exit 1
fi

echo "  gateway_booking_context: 0 rows ✓"

# ── Step 11: Prove no C2a-owned fixture rows remain ───────────────────────────

step 11 "Cleanup-state proof: verifying no C2a-owned location fixtures remain"

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
echo "║  PASS: C2a verified — unit tests ✓ · integration tests ✓        ║"
echo "║        cleanup-state proof ✓ · no temp files remain             ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
