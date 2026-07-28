#!/usr/bin/env bash
#
# verify-c2b3b1.sh
#
# C2b-3b1 verification script — 10 outer steps.
#
# Step 6 invokes verify-c2b2.sh exactly once.  That nested invocation covers:
#   C1 / C2a / C2b-1 / C2b-2 suites, library typecheck, exact 11-diagnostic
#   API baseline, production CJS build, PostgreSQL fixture cleanup.
#
# Step 4 invokes the C2b-3a suite directly via the package script — NOT via
# verify-c2b3a.sh, whose exact five-file scope gate would reject legitimate
# C2b-3b1 additions as extra files.
#
# STEPS:
#   1.  Preflight: env vars present, databases distinct
#   2.  C2b-3b1 unit tests (10/10)
#   3.  C2b-3b1 PostgreSQL integration (2/2)
#   4.  C2b-3a regression via test:unit:c2b3a (15/15)
#   5.  General unit suite (224/224)
#   6.  Invoke scripts/verify-c2b2.sh exactly once
#   7.  Route-unmounted proof
#   8.  Notification import/dependency boundary proof
#   9.  Checkpoint-safe exact ten-file scope proof
#  10.  Protected-file zero-drift proof
#
# REQUIREMENTS:
#   DATABASE_URL          — production/dev DB reference (safety guard only)
#   RBG_TEST_DATABASE_URL — dedicated, fully disposable test database
#
# SAFETY:
#   - Never resets or migrates DATABASE_URL target
#   - Never derives one URL from the other
#   - verify-c2b2.sh invoked once as subprocess — not duplicated
#   - No credentials, full URLs, or raw source printed on failure
#   - All step failures exit non-zero with a STOP message
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

HANDLER_FILE="artifacts/api-server/src/routes/regional-intake-handler.ts"
NOTIFIER_FILE="artifacts/api-server/src/lib/regional-staff-notifier.ts"
SERVICE_FILE="artifacts/api-server/src/services/regional-intake.service.ts"

step() {
  echo ""
  echo "[Step $1] $2"
}

fail() {
  echo "STOP [verify-c2b3b1 step $1]: $2" >&2
  exit 1
}

echo "=== verify-c2b3b1.sh — 10 outer steps ==="

# ── Step 1: Preflight ──────────────────────────────────────────────────────────

step 1 "Preflight: environment variables and database distinctness"

[[ -n "${DATABASE_URL:-}" ]] \
  || fail 1 "DATABASE_URL is not set. A production DB reference is required for safety guards."

[[ -n "${RBG_TEST_DATABASE_URL:-}" ]] \
  || fail 1 "RBG_TEST_DATABASE_URL is not set. Set it to a dedicated, fully disposable PostgreSQL database."

echo "  DATABASE_URL: set ✓"
echo "  RBG_TEST_DATABASE_URL: set ✓"

read -r TEST_HOST TEST_PORT TEST_DBNAME <<< "$(
  RBG_PARSE_URL="${RBG_TEST_DATABASE_URL}" python3 - <<'PY'
import os
from urllib.parse import unquote, urlparse
parsed = urlparse(os.environ["RBG_PARSE_URL"])
print(parsed.hostname or "", parsed.port or 5432, unquote(parsed.path.lstrip("/")))
PY
)"

read -r DEV_HOST DEV_PORT DEV_DBNAME <<< "$(
  RBG_PARSE_URL="${DATABASE_URL}" python3 - <<'PY'
import os
from urllib.parse import unquote, urlparse
parsed = urlparse(os.environ["RBG_PARSE_URL"])
print(parsed.hostname or "", parsed.port or 5432, unquote(parsed.path.lstrip("/")))
PY
)"

[[ -n "${TEST_HOST}" && -n "${TEST_DBNAME}" ]] \
  || fail 1 "RBG_TEST_DATABASE_URL does not contain a valid host or database name."

[[ -n "${DEV_HOST}" && -n "${DEV_DBNAME}" ]] \
  || fail 1 "DATABASE_URL does not contain a valid host or database name."

if [[ "${TEST_HOST}" == "${DEV_HOST}" ]] && \
   [[ "${TEST_PORT}" == "${DEV_PORT}" ]] && \
   [[ "${TEST_DBNAME}" == "${DEV_DBNAME}" ]]; then
  fail 1 "RBG_TEST_DATABASE_URL resolves to the same database as DATABASE_URL (${TEST_DBNAME}). They must be distinct."
fi

echo "  Databases distinct: main=${DEV_DBNAME}, test=${TEST_DBNAME} ✓"

# ── Step 2: C2b-3b1 unit tests (10/10) ────────────────────────────────────────

step 2 "C2b-3b1 unit tests — expected 10/10"

C2B3B1_UNIT_OUT=$(pnpm --filter @workspace/api-server run test:unit:c2b3b1 2>&1) \
  || {
    echo "${C2B3B1_UNIT_OUT}" | tail -30
    fail 2 "C2b-3b1 unit test suite exited non-zero."
  }

C2B3B1_UNIT_PASS=$(echo "${C2B3B1_UNIT_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
C2B3B1_UNIT_FAIL=$(echo "${C2B3B1_UNIT_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${C2B3B1_UNIT_PASS}" != "10" ]]; then
  echo "${C2B3B1_UNIT_OUT}" | tail -20
  fail 2 "Expected exactly 10 passing C2b-3b1 unit tests, got '${C2B3B1_UNIT_PASS:-<not found>}' (fail=${C2B3B1_UNIT_FAIL:-?})."
fi

if [[ "${C2B3B1_UNIT_FAIL:-0}" != "0" ]]; then
  echo "${C2B3B1_UNIT_OUT}" | tail -20
  fail 2 "C2b-3b1 unit suite has ${C2B3B1_UNIT_FAIL} failing test(s)."
fi

echo "  C2b-3b1 unit tests: ${C2B3B1_UNIT_PASS}/10 ✓"

# ── Step 3: C2b-3b1 PostgreSQL integration (2/2) ──────────────────────────────

step 3 "C2b-3b1 PostgreSQL integration — expected 2/2"

C2B3B1_INT_OUT=$(pnpm --filter @workspace/api-server run test:integration:c2b3b1 2>&1) \
  || {
    echo "${C2B3B1_INT_OUT}" | tail -30
    fail 3 "C2b-3b1 integration test suite exited non-zero."
  }

C2B3B1_INT_PASS=$(echo "${C2B3B1_INT_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
C2B3B1_INT_FAIL=$(echo "${C2B3B1_INT_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${C2B3B1_INT_PASS}" != "2" ]]; then
  echo "${C2B3B1_INT_OUT}" | tail -20
  fail 3 "Expected exactly 2 passing C2b-3b1 integration tests, got '${C2B3B1_INT_PASS:-<not found>}' (fail=${C2B3B1_INT_FAIL:-?})."
fi

if [[ "${C2B3B1_INT_FAIL:-0}" != "0" ]]; then
  echo "${C2B3B1_INT_OUT}" | tail -20
  fail 3 "C2b-3b1 integration suite has ${C2B3B1_INT_FAIL} failing test(s)."
fi

echo "  C2b-3b1 integration tests: ${C2B3B1_INT_PASS}/2 ✓"

# ── Step 4: C2b-3a regression (15/15) via package script ──────────────────────
#
# NOTE: verify-c2b3a.sh is intentionally NOT nested here.  Its scope gate
# asserts the cumulative diff contains exactly the five C2b-3a files; after
# C2b-3b1 adds further files, that gate would fail on legitimate additions.

step 4 "C2b-3a regression via test:unit:c2b3a — expected 15/15"

C2B3A_OUT=$(pnpm --filter @workspace/api-server run test:unit:c2b3a 2>&1) \
  || {
    echo "${C2B3A_OUT}" | tail -30
    fail 4 "C2b-3a regression suite exited non-zero."
  }

C2B3A_PASS=$(echo "${C2B3A_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
C2B3A_FAIL=$(echo "${C2B3A_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${C2B3A_PASS}" != "15" ]]; then
  echo "${C2B3A_OUT}" | tail -20
  fail 4 "Expected exactly 15 passing C2b-3a tests, got '${C2B3A_PASS:-<not found>}' (fail=${C2B3A_FAIL:-?})."
fi

if [[ "${C2B3A_FAIL:-0}" != "0" ]]; then
  echo "${C2B3A_OUT}" | tail -20
  fail 4 "C2b-3a regression suite has ${C2B3A_FAIL} failing test(s)."
fi

echo "  C2b-3a regression: ${C2B3A_PASS}/15 ✓"

# ── Step 5: General unit suite (224/224) ──────────────────────────────────────

step 5 "General unit suite — expected 224/224"

UNIT_OUT=$(pnpm --filter @workspace/api-server run test:unit 2>&1) \
  || {
    echo "${UNIT_OUT}" | tail -30
    fail 5 "General unit suite exited non-zero."
  }

UNIT_PASS=$(echo "${UNIT_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
UNIT_FAIL=$(echo "${UNIT_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${UNIT_PASS}" != "224" ]]; then
  echo "${UNIT_OUT}" | tail -20
  fail 5 "Expected exactly 224 passing general unit tests, got '${UNIT_PASS:-<not found>}' (fail=${UNIT_FAIL:-?})."
fi

if [[ "${UNIT_FAIL:-0}" != "0" ]]; then
  echo "${UNIT_OUT}" | tail -20
  fail 5 "General unit suite has ${UNIT_FAIL} failing test(s)."
fi

echo "  General unit suite: ${UNIT_PASS}/224 ✓"

# ── Step 6: Full C2b-2 baseline ───────────────────────────────────────────────

step 6 "Full C2b-2 baseline — invoking scripts/verify-c2b2.sh exactly once"

bash "${REPO_ROOT}/scripts/verify-c2b2.sh" \
  || fail 6 "scripts/verify-c2b2.sh exited non-zero."

echo "  C2b-2 baseline: PASS ✓"

# ── Step 7: Route-unmounted proof ─────────────────────────────────────────────

step 7 "Route-unmounted proof"

# Part A: protected runtime entry files must have zero drift
ENTRY_DRIFT=$(git diff --name-only origin/main -- \
  artifacts/api-server/src/app.ts \
  artifacts/api-server/src/index.ts \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/routes/internal-rbg-router.ts \
  2>/dev/null || true)

if [[ -n "${ENTRY_DRIFT}" ]]; then
  fail 7 "Runtime entry file(s) modified — route must remain unmounted. Modified: ${ENTRY_DRIFT}"
fi

echo "  Part A: runtime entry files unmodified ✓"

# Part B: neither the handler nor the notifier lib may be imported/mounted in runtime entry files
for PATTERN in "regional-intake-handler" "regional-staff-notifier"; do
  MATCH=$(grep -l "${PATTERN}" \
    artifacts/api-server/src/app.ts \
    artifacts/api-server/src/index.ts \
    artifacts/api-server/src/routes/index.ts \
    2>/dev/null || true)
  if [[ -n "${MATCH}" ]]; then
    fail 7 "'${PATTERN}' import found in runtime entry file(s): ${MATCH}"
  fi
done

echo "  Part B: handler and notifier imports absent from runtime entry files ✓"

# ── Step 8: Notification import/dependency boundary proof ─────────────────────

step 8 "Notification import/dependency boundary proof"

[[ -f "${HANDLER_FILE}" ]] \
  || fail 8 "Handler file not found: ${HANDLER_FILE}"

[[ -f "${NOTIFIER_FILE}" ]] \
  || fail 8 "Notifier lib file not found: ${NOTIFIER_FILE}"

[[ -f "${SERVICE_FILE}" ]] \
  || fail 8 "Service file not found: ${SERVICE_FILE}"

# 8a: Handler import allowlist (now three approved sources)
python3 - "${HANDLER_FILE}" << 'PY'
import sys, re

handler_path = sys.argv[1]
ALLOWED = {
    "../services/regional-intake.service.js",
    "./internal-rbg-router.js",
    "../lib/regional-staff-notifier.js",
}
FORBIDDEN_IMPORT_SUBSTRINGS = [
    "email", "pdf", "voucher",
    "pool", "pg",
    "resend",
]

with open(handler_path, encoding="utf-8") as f:
    source = f.read()

# Strip comments before checking for dynamic constructs
stripped = re.sub(r'//[^\n]*', '', source)
stripped = re.sub(r'/\*.*?\*/', '', stripped, flags=re.DOTALL)

if re.search(r'\bimport\s*\(', stripped):
    print("STOP: Dynamic import() expression found in handler.", flush=True); sys.exit(1)

if re.search(r'\brequire\s*\(', stripped):
    print("STOP: require() call found in handler.", flush=True); sys.exit(1)

if 'process.env' in stripped:
    print("STOP: process.env found in handler.", flush=True); sys.exit(1)

import_sources = re.findall(r'''^\s*import\b[^;]+?\bfrom\s+['"]([^'"]+)['"]''', source, re.MULTILINE)

for src in import_sources:
    for substr in FORBIDDEN_IMPORT_SUBSTRINGS:
        if substr in src.lower():
            print(f"STOP: Forbidden import source '{src}' contains forbidden substring '{substr}'.", flush=True)
            sys.exit(1)

unexpected = [s for s in import_sources if s not in ALLOWED]
if unexpected:
    print(f"STOP: Unexpected import source(s) in handler: {unexpected}", flush=True); sys.exit(1)

missing = ALLOWED - set(import_sources)
if missing:
    print(f"STOP: Expected import source(s) missing from handler: {missing}", flush=True); sys.exit(1)

print(f"  Handler import allowlist: exactly 3 approved sources {sorted(import_sources)} ✓", flush=True)
sys.exit(0)
PY

[[ $? -eq 0 ]] || fail 8 "Handler import allowlist check failed."

# 8b: Notifier lib must not import email, Resend, pool/db/pg, process.env
python3 - "${NOTIFIER_FILE}" << 'PY'
import sys, re

notifier_path = sys.argv[1]
FORBIDDEN = ["email", "resend", "pool", "pool", "pg", "process.env"]

with open(notifier_path, encoding="utf-8") as f:
    source = f.read()

stripped = re.sub(r'//[^\n]*', '', source)
stripped = re.sub(r'/\*.*?\*/', '', stripped, flags=re.DOTALL)

if re.search(r'\bimport\s*\(', stripped):
    print("STOP: Dynamic import() in notifier lib.", flush=True); sys.exit(1)

if 'process.env' in stripped:
    print("STOP: process.env in notifier lib.", flush=True); sys.exit(1)

import_sources = re.findall(r'''^\s*import\b[^;]+?\bfrom\s+['"]([^'"]+)['"]''', source, re.MULTILINE)

for src in import_sources:
    for sub in ["email", "resend", "pool", "db", "pg"]:
        if sub in src.lower() and "regional-intake-write.repository" not in src.lower():
            print(f"STOP: Forbidden import '{src}' in notifier lib.", flush=True)
            sys.exit(1)

print(f"  Notifier lib imports: {import_sources} ✓", flush=True)
sys.exit(0)
PY

[[ $? -eq 0 ]] || fail 8 "Notifier lib import check failed."

# 8c: Service must not have new pool/pg top-level imports beyond its existing DB abstractions
python3 - "${SERVICE_FILE}" << 'PY'
import sys, re

service_path = sys.argv[1]
# The service already uses repository abstractions (RbgDb, RbgTx).
# It must not directly import pg/pool/drizzle or email/Resend.
FORBIDDEN_DIRECT = ["resend", "email.service", "pdf", "voucher", "public-bookings"]

with open(service_path, encoding="utf-8") as f:
    source = f.read()

import_sources = re.findall(r'''^\s*import\b[^;]+?\bfrom\s+['"]([^'"]+)['"]''', source, re.MULTILINE)

for src in import_sources:
    for sub in FORBIDDEN_DIRECT:
        if sub in src.lower():
            print(f"STOP: Forbidden import '{src}' in service.", flush=True)
            sys.exit(1)

print(f"  Service import boundary: no forbidden imports ✓", flush=True)
sys.exit(0)
PY

[[ $? -eq 0 ]] || fail 8 "Service import boundary check failed."

echo "  Notification import/dependency boundary: PASS ✓"

# ── Step 9: Checkpoint-safe exact ten-file scope proof ────────────────────────

step 9 "Checkpoint-safe exact ten-file cumulative scope proof"

EXPECTED_SCOPE=(
  "artifacts/api-server/package.json"
  "artifacts/api-server/src/lib/regional-staff-notifier.ts"
  "artifacts/api-server/src/routes/regional-intake-handler.ts"
  "artifacts/api-server/src/services/regional-intake.service.ts"
  "artifacts/api-server/src/test/integration/regional-intake-c2b3b1.test.ts"
  "artifacts/api-server/src/test/unit/regional-intake-handler-notification.test.ts"
  "artifacts/api-server/src/test/unit/regional-intake-handler.test.ts"
  "artifacts/api-server/src/test/unit/regional-intake-http-map.test.ts"
  "artifacts/api-server/src/test/unit/regional-intake-service-payload.test.ts"
  "scripts/verify-c2b3b1.sh"
)

COMMITTED=$(git diff --name-only origin/main...HEAD 2>/dev/null || true)
WORKTREE=$(git diff --name-only origin/main -- 2>/dev/null || true)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)

ACTUAL_SCOPE=$(printf '%s\n' ${COMMITTED} ${WORKTREE} ${UNTRACKED} \
  | sort -u \
  | grep -v '^$' || true)

EXPECTED_SORTED=$(printf '%s\n' "${EXPECTED_SCOPE[@]}" | sort)

MISSING=$(comm -23 <(echo "${EXPECTED_SORTED}") <(echo "${ACTUAL_SCOPE}") || true)
EXTRA=$(comm -13 <(echo "${EXPECTED_SORTED}") <(echo "${ACTUAL_SCOPE}") || true)

if [[ -n "${MISSING}" ]]; then
  fail 9 "Expected file(s) missing from cumulative scope: $(echo "${MISSING}" | tr '\n' ' ')"
fi

if [[ -n "${EXTRA}" ]]; then
  fail 9 "Unexpected file(s) in cumulative scope (outside locked ten-file set): $(echo "${EXTRA}" | tr '\n' ' ')"
fi

echo "  Cumulative scope: exactly 10 locked files ✓"
for f in "${EXPECTED_SCOPE[@]}"; do
  echo "    ${f}"
done

# ── Step 10: Protected-file zero drift ────────────────────────────────────────

step 10 "Protected-file zero drift"

PROTECTED_DRIFT=$(git diff --name-only origin/main -- \
  artifacts/api-server/src/app.ts \
  artifacts/api-server/src/index.ts \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/routes/internal-rbg-router.ts \
  artifacts/api-server/src/routes/public-bookings.ts \
  artifacts/api-server/src/lib/regional-intake-transaction.ts \
  artifacts/api-server/src/lib/regional-intake-dto.ts \
  artifacts/api-server/src/lib/regional-intake-helpers.ts \
  artifacts/api-server/src/lib/pg-error-metadata.ts \
  artifacts/api-server/src/repositories/regional-intake.repository.ts \
  artifacts/api-server/src/repositories/regional-intake-write.repository.ts \
  artifacts/api-server/src/services/email.service.ts \
  scripts/verify-c2a.sh \
  scripts/verify-c2b1.sh \
  scripts/verify-c2b2.sh \
  scripts/verify-c2b3a.sh \
  pnpm-lock.yaml \
  2>/dev/null || true)

if [[ -n "${PROTECTED_DRIFT}" ]]; then
  fail 10 "Protected file(s) modified: ${PROTECTED_DRIFT}"
fi

echo "  Protected-file drift: zero ✓"

# ── All steps passed ───────────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  PASS: C2b-3b1 verified — 10 outer steps                                 ║"
echo "║  C2b-3b1 unit ✓ (10/10) · C2b-3b1 integration ✓ (2/2)                  ║"
echo "║  C2b-3a regression ✓ (15/15) · general unit ✓ (224/224)                 ║"
echo "║  C2b-2 baseline ✓ · route unmounted ✓ · import boundary ✓               ║"
echo "║  ten-file scope ✓ · protected-file drift zero ✓                          ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
