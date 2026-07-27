#!/usr/bin/env bash
#
# verify-c2b2.sh
#
# C2b-2 verification lifecycle script.
# Proves that all C1, C2a, C2b-1, and C2b-2 tests pass against a dedicated test
# database, that the API typecheck baseline is unchanged, that a production CJS
# build succeeds, and that the database is left clean after all tests.
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
#   6.  Apply migration 0014 atomically
#   7.  C1 PostgreSQL integration tests (test:integration) — 17
#   8.  C2a unit tests (test:unit:c2a) — 58
#   9.  C2a PostgreSQL integration tests (test:integration:c2a) — 14
#  10.  C2b-1 PostgreSQL integration tests (test:integration:c2b1) — 14
#  11.  C2b-2 unit/service tests (test:unit:c2b2) — 27
#  12.  C2b-2 PostgreSQL integration tests (test:integration:c2b2) — 10
#  13.  C2b-2 deterministic concurrency tests (test:concurrency:c2b2) — 5
#  14.  Root library typecheck (pnpm run typecheck:libs) — exit 0
#  15.  Bounded API diagnostic comparison (pinned baseline: 11 errors, 4 files)
#  16.  Production CJS build (pnpm --filter @workspace/api-server run build)
#  17.  Cleanup-state proof: all C2b-2 fixture categories are zero
#
# SAFETY:
#   - Never modifies DATABASE_URL target
#   - Never derives one URL from the other
#   - Stops immediately if URLs resolve to the same database
#   - Does NOT invoke prior verifier scripts
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

# Remove temp baseline files — no longer needed
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

# ── Step 10: Run C2b-1 PostgreSQL integration tests ──────────────────────────

step 10 "Running C2b-1 PostgreSQL integration tests (test:integration:c2b1)"

RBG_TEST_DATABASE_URL="${RBG_TEST_DATABASE_URL}" \
  pnpm --filter @workspace/api-server run test:integration:c2b1 || {
  echo "STOP: C2b-1 integration tests failed."
  exit 1
}

echo "  C2b-1 integration tests passed ✓"

# ── Step 11: Run C2b-2 unit/service tests ────────────────────────────────────

step 11 "Running C2b-2 unit/service tests (test:unit:c2b2)"

pnpm --filter @workspace/api-server run test:unit:c2b2 || {
  echo "STOP: C2b-2 unit/service tests failed."
  exit 1
}

echo "  C2b-2 unit/service tests passed ✓"

# ── Step 12: Run C2b-2 PostgreSQL integration tests ──────────────────────────

step 12 "Running C2b-2 PostgreSQL integration tests (test:integration:c2b2)"

RBG_TEST_DATABASE_URL="${RBG_TEST_DATABASE_URL}" \
  pnpm --filter @workspace/api-server run test:integration:c2b2 || {
  echo "STOP: C2b-2 integration tests failed."
  exit 1
}

echo "  C2b-2 integration tests passed ✓"

# ── Step 13: Run C2b-2 deterministic concurrency tests ───────────────────────

step 13 "Running C2b-2 deterministic concurrency tests (test:concurrency:c2b2)"

RBG_TEST_DATABASE_URL="${RBG_TEST_DATABASE_URL}" \
  pnpm --filter @workspace/api-server run test:concurrency:c2b2 || {
  echo "STOP: C2b-2 concurrency tests failed."
  exit 1
}

echo "  C2b-2 concurrency tests passed ✓"

# ── Step 14: Root library typecheck ──────────────────────────────────────────

step 14 "Running root library typecheck (pnpm run typecheck:libs)"

pnpm run typecheck:libs || {
  echo "STOP: Root library typecheck failed (non-zero exit)."
  exit 1
}

echo "  Library typecheck passed ✓"

# ── Step 15: Bounded API diagnostic comparison ────────────────────────────────

step 15 "Bounded API diagnostic comparison (pinned baseline: 11 diagnostics, 4 files)"

TYPECHECK_LOG="$(mktemp)"
TEMP_FILES+=("${TYPECHECK_LOG}")

# Run API tsc with --pretty false; preserve real exit status
set +e
pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit --pretty false \
  > "${TYPECHECK_LOG}" 2>&1
TYPECHECK_EXIT=$?
set -e

if [ "${TYPECHECK_EXIT}" -eq 0 ]; then
  echo "STOP: API typecheck unexpectedly exited 0. The approved baseline has known errors."
  echo "      A zero exit means new code introduced unexpected changes."
  exit 1
fi

# Parse with bounded inline Python — no grep, no basename matching, no || true
TYPECHECK_LOG_PATH="${TYPECHECK_LOG}" \
PKG_ROOT="${WORKSPACE_ROOT}/artifacts/api-server" \
python3 - << 'PY'
import sys, re, os

log_file = os.environ["TYPECHECK_LOG_PATH"]
pkg_root = os.environ["PKG_ROOT"]

ALLOWLIST = {
    "src/routes/admin-fleet.ts":      1,
    "src/routes/admin-locations.ts":  3,
    "src/routes/public-bookings.ts":  2,
    "src/routes/storage.ts":          5,
}

C2B2_PATTERNS = [
    "pg-error-metadata",
    "regional-intake.service",
    "regional-intake-service.test",
    "regional-intake-c2b2",
]

DIAG_RE = re.compile(r'^(.+?)\(\d+,\d+\): error TS\d+:')

diagnostics: dict[str, int] = {}

with open(log_file, encoding="utf-8", errors="replace") as f:
    for line in f:
        m = DIAG_RE.match(line)
        if not m:
            continue
        raw_path = m.group(1)
        try:
            # tsc may output absolute or CWD-relative paths depending on how it
            # was invoked. Resolve relative paths against pkg_root so that the
            # relpath computation is always anchored correctly.
            if os.path.isabs(raw_path):
                abs_path = os.path.normpath(raw_path)
            else:
                abs_path = os.path.normpath(os.path.join(pkg_root, raw_path))
            rel = os.path.relpath(abs_path, pkg_root)
        except Exception:
            print(f"STOP: Cannot normalize path: {raw_path!r}", flush=True)
            sys.exit(1)
        rel = rel.replace("\\", "/")

        # Reject any C2b-2 diagnostic
        for pat in C2B2_PATTERNS:
            if pat in rel:
                print(f"STOP: C2b-2 diagnostic found in {rel!r}", flush=True)
                sys.exit(1)

        # Reject paths not in allowlist
        if rel not in ALLOWLIST:
            print(f"STOP: Unexpected diagnostic in {rel!r} (not in approved allowlist)", flush=True)
            sys.exit(1)

        diagnostics[rel] = diagnostics.get(rel, 0) + 1

total = sum(diagnostics.values())

if total != 11:
    print(f"STOP: Expected exactly 11 diagnostics, got {total}. Distribution: {diagnostics}", flush=True)
    sys.exit(1)

for path, expected_count in ALLOWLIST.items():
    actual = diagnostics.get(path, 0)
    if actual != expected_count:
        print(f"STOP: {path!r} — expected {expected_count} diagnostic(s), got {actual}", flush=True)
        sys.exit(1)

print("API_TYPECHECK_BASELINE=PASS")
print(f"TOTAL_DIAGNOSTICS={total}")
print(f"FILES={len(diagnostics)}")
print("C2B2_DIAGNOSTICS=0")
PY

if [ $? -ne 0 ]; then
  echo "STOP: API typecheck baseline check failed."
  exit 1
fi

echo "  API typecheck baseline matched ✓"

# ── Step 16: Production CJS build ────────────────────────────────────────────

step 16 "Production CJS build (pnpm --filter @workspace/api-server run build)"

pnpm --filter @workspace/api-server run build || {
  echo "STOP: Production CJS build failed."
  exit 1
}

echo "  Production CJS build passed ✓"

# ── Step 17: Cleanup-state proof — all C2b-2 fixture categories zero ──────────

step 17 "Cleanup-state proof: all C2b-2 fixture categories must be zero"

GBC_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM gateway_booking_context")
GBC_COUNT="${GBC_COUNT// /}"

if [ "${GBC_COUNT}" -ne "0" ]; then
  echo "STOP: ${GBC_COUNT} row(s) remain in gateway_booking_context."
  exit 1
fi
echo "  gateway_booking_context: 0 rows ✓"

ATTR_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM booking_attribution")
ATTR_COUNT="${ATTR_COUNT// /}"

if [ "${ATTR_COUNT}" -ne "0" ]; then
  echo "STOP: ${ATTR_COUNT} row(s) remain in booking_attribution."
  exit 1
fi
echo "  booking_attribution: 0 rows ✓"

BK_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM booking WHERE source = 'gateway'")
BK_COUNT="${BK_COUNT// /}"

if [ "${BK_COUNT}" -ne "0" ]; then
  echo "STOP: ${BK_COUNT} gateway booking row(s) remain."
  exit 1
fi
echo "  booking rows (source='gateway'): 0 ✓"

USER_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM \"user\" WHERE email LIKE 'c2b2-%@rbg-test.invalid'")
USER_COUNT="${USER_COUNT// /}"

if [ "${USER_COUNT}" -ne "0" ]; then
  echo "STOP: ${USER_COUNT} C2b-2 user row(s) remain (email LIKE 'c2b2-%@rbg-test.invalid')."
  exit 1
fi
echo "  user rows (c2b2-% email): 0 ✓"

MODEL_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM vehicle_model WHERE name LIKE 'C2b2 %'")
MODEL_COUNT="${MODEL_COUNT// /}"

if [ "${MODEL_COUNT}" -ne "0" ]; then
  echo "STOP: ${MODEL_COUNT} C2b-2 vehicle_model row(s) remain."
  exit 1
fi
echo "  vehicle_model rows (C2b2 %): 0 ✓"

BRAND_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM brand WHERE name LIKE 'C2b2 %'")
BRAND_COUNT="${BRAND_COUNT// /}"

if [ "${BRAND_COUNT}" -ne "0" ]; then
  echo "STOP: ${BRAND_COUNT} C2b-2 brand row(s) remain."
  exit 1
fi
echo "  brand rows (C2b2 %): 0 ✓"

LOC_COUNT=$(psql "${RBG_TEST_DATABASE_URL}" --no-psqlrc -t -A \
  -c "SELECT COUNT(*) FROM location WHERE name LIKE 'C2b2 %'")
LOC_COUNT="${LOC_COUNT// /}"

if [ "${LOC_COUNT}" -ne "0" ]; then
  echo "STOP: ${LOC_COUNT} C2b-2 location row(s) remain."
  exit 1
fi
echo "  location rows (C2b2 %): 0 ✓"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  PASS: C2b-2 verified                                                    ║"
echo "║        C1 ✓ · C2a unit ✓ · C2a integration ✓ · C2b-1 ✓                 ║"
echo "║        C2b-2 unit ✓ · C2b-2 integration ✓ · C2b-2 concurrency ✓        ║"
echo "║        typecheck:libs ✓ · API baseline ✓ · build ✓ · cleanup ✓          ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
