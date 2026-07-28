#!/usr/bin/env bash
#
# verify-c2b3a.sh
#
# C2b-3a verification script — 8 outer steps.
#
# Step 4 invokes verify-c2b2.sh exactly once.  That nested invocation covers:
#   C1 / C2a / C2b-1 / C2b-2 suites, library typecheck, exact 11-diagnostic
#   API baseline (including zero C2b-3a diagnostics), production CJS build,
#   PostgreSQL fixture cleanup.
#
# Steps 1–3 and 5–8 are C2b-3a-specific.
#
# REQUIREMENTS:
#   DATABASE_URL          — production/dev DB reference (safety guard only)
#   RBG_TEST_DATABASE_URL — dedicated, fully disposable test database
#
# STEPS:
#   1.  Preflight: env vars present, databases distinct
#   2.  C2b-3a unit tests (15/15)
#   3.  General unit suite (224/224)
#   4.  Invoke scripts/verify-c2b2.sh exactly once
#   5.  Route-unmounted proof (protected-file zero-drift + handler import absent)
#   6.  Static import allowlist (handler imports exactly two approved sources)
#   7.  Checkpoint-safe cumulative five-file scope proof
#   8.  Protected-file zero drift (full protected list)
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

step() {
  echo ""
  echo "[Step $1] $2"
}

fail() {
  echo "STOP [verify-c2b3a step $1]: $2" >&2
  exit 1
}

echo "=== verify-c2b3a.sh — 8 outer steps ==="

# ── Step 1: Preflight ──────────────────────────────────────────────────────────

step 1 "Preflight: environment variables and database distinctness"

[[ -n "${DATABASE_URL:-}" ]] \
  || fail 1 "DATABASE_URL is not set. A production DB reference is required for safety guards."

[[ -n "${RBG_TEST_DATABASE_URL:-}" ]] \
  || fail 1 "RBG_TEST_DATABASE_URL is not set. Set it to a dedicated, fully disposable PostgreSQL database."

echo "  DATABASE_URL: set ✓"
echo "  RBG_TEST_DATABASE_URL: set ✓"

# Parse host/port/dbname from both URLs using Python (matches verify-c2b2.sh approach)
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

# ── Step 2: C2b-3a unit tests (15/15) ─────────────────────────────────────────

step 2 "C2b-3a unit tests — expected 15/15"

C2B3A_OUT=$(pnpm --filter @workspace/api-server run test:unit:c2b3a 2>&1) \
  || {
    echo "${C2B3A_OUT}" | tail -30
    fail 2 "C2b-3a unit test suite exited non-zero."
  }

# node:test outputs "# pass N" (TAP) or "ℹ pass N" (spec) depending on TTY detection
C2B3A_PASS=$(echo "${C2B3A_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
C2B3A_FAIL=$(echo "${C2B3A_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${C2B3A_PASS}" != "15" ]]; then
  echo "${C2B3A_OUT}" | tail -20
  fail 2 "Expected exactly 15 passing C2b-3a tests, got '${C2B3A_PASS:-<not found>}' (fail=${C2B3A_FAIL:-?})."
fi

if [[ "${C2B3A_FAIL:-0}" != "0" ]]; then
  echo "${C2B3A_OUT}" | tail -20
  fail 2 "C2b-3a test suite has ${C2B3A_FAIL} failing test(s)."
fi

echo "  C2b-3a unit tests: ${C2B3A_PASS}/15 ✓"

# ── Step 3: General unit suite (224/224) ──────────────────────────────────────

step 3 "General unit suite — expected 224/224"

UNIT_OUT=$(pnpm --filter @workspace/api-server run test:unit 2>&1) \
  || {
    echo "${UNIT_OUT}" | tail -30
    fail 3 "General unit suite exited non-zero."
  }

UNIT_PASS=$(echo "${UNIT_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
UNIT_FAIL=$(echo "${UNIT_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${UNIT_PASS}" != "224" ]]; then
  echo "${UNIT_OUT}" | tail -20
  fail 3 "Expected exactly 224 passing general unit tests, got '${UNIT_PASS:-<not found>}' (fail=${UNIT_FAIL:-?})."
fi

if [[ "${UNIT_FAIL:-0}" != "0" ]]; then
  echo "${UNIT_OUT}" | tail -20
  fail 3 "General unit suite has ${UNIT_FAIL} failing test(s)."
fi

echo "  General unit suite: ${UNIT_PASS}/224 ✓"

# ── Step 4: Full C2b-2 baseline (invoke verify-c2b2.sh exactly once) ──────────

step 4 "Full C2b-2 baseline — invoking scripts/verify-c2b2.sh exactly once"

bash "${REPO_ROOT}/scripts/verify-c2b2.sh" \
  || fail 4 "scripts/verify-c2b2.sh exited non-zero."

echo "  C2b-2 baseline: PASS ✓"

# ── Step 5: Route-unmounted proof ─────────────────────────────────────────────

step 5 "Route-unmounted proof"

# Part A: protected runtime entry files must have zero drift
ENTRY_DRIFT=$(git diff --name-only origin/main -- \
  artifacts/api-server/src/app.ts \
  artifacts/api-server/src/index.ts \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/routes/internal-rbg-router.ts \
  2>/dev/null || true)

if [[ -n "${ENTRY_DRIFT}" ]]; then
  fail 5 "Runtime entry file(s) modified — route must remain unmounted. Modified: ${ENTRY_DRIFT}"
fi

echo "  Part A: runtime entry files unmodified ✓"

# Part B: handler must not be imported/mounted in any runtime entry file
HANDLER_IMPORT_MATCH=$(grep -l "regional-intake-handler" \
  artifacts/api-server/src/app.ts \
  artifacts/api-server/src/index.ts \
  artifacts/api-server/src/routes/index.ts \
  2>/dev/null || true)

if [[ -n "${HANDLER_IMPORT_MATCH}" ]]; then
  fail 5 "Handler import found in runtime entry file(s): ${HANDLER_IMPORT_MATCH}"
fi

echo "  Part B: handler import absent from runtime entry files ✓"

# ── Step 6: Static import allowlist ───────────────────────────────────────────

step 6 "Static import allowlist — handler must import exactly two approved sources"

[[ -f "${HANDLER_FILE}" ]] \
  || fail 6 "Handler file not found: ${HANDLER_FILE}"

# Use Python for bounded, precise import extraction
python3 - "${HANDLER_FILE}" << 'PY'
import sys, re

handler_path = sys.argv[1]
ALLOWED = {
    "../services/regional-intake.service.js",
    "./internal-rbg-router.js",
}
# Forbidden substrings checked against import FROM-strings only (not comments/docs)
FORBIDDEN_IMPORT_SUBSTRINGS = [
    "email", "notif", "pdf", "voucher",
    "pool", "db", "pg",
]

with open(handler_path, encoding="utf-8") as f:
    source = f.read()

# Check for dynamic import expressions anywhere in the file (non-comment code)
# Strip line comments before checking to avoid false positives
stripped = re.sub(r'//[^\n]*', '', source)
stripped = re.sub(r'/\*.*?\*/', '', stripped, flags=re.DOTALL)

if re.search(r'\bimport\s*\(', stripped):
    print("STOP: Dynamic import() expression found in handler source.", flush=True)
    sys.exit(1)

if re.search(r'\brequire\s*\(', stripped):
    print("STOP: require() call found in handler source.", flush=True)
    sys.exit(1)

if 'process.env' in stripped:
    print("STOP: process.env found in handler source.", flush=True)
    sys.exit(1)

# Extract all static import from-strings
import_sources = re.findall(r'''^\s*import\b[^;]+?\bfrom\s+['"]([^'"]+)['"]''', source, re.MULTILINE)

# Forbidden substrings checked against import from-strings only
for src in import_sources:
    for substr in FORBIDDEN_IMPORT_SUBSTRINGS:
        if substr in src.lower():
            print(f"STOP: Forbidden import source '{src}' contains forbidden substring '{substr}'.", flush=True)
            sys.exit(1)

unexpected = [s for s in import_sources if s not in ALLOWED]
if unexpected:
    print(f"STOP: Unexpected import source(s) in handler: {unexpected}", flush=True)
    sys.exit(1)

# Every allowed source must be present
missing = ALLOWED - set(import_sources)
if missing:
    print(f"STOP: Expected import source(s) missing from handler: {missing}", flush=True)
    sys.exit(1)

print(f"Import allowlist check passed — sources: {sorted(import_sources)}", flush=True)
sys.exit(0)
PY

[[ $? -eq 0 ]] || fail 6 "Import allowlist check failed."

echo "  Import allowlist: exactly two approved sources ✓"

# ── Step 7: Checkpoint-safe cumulative five-file scope proof ──────────────────

step 7 "Checkpoint-safe cumulative five-file scope proof"

EXPECTED_SCOPE=(
  "artifacts/api-server/package.json"
  "artifacts/api-server/src/routes/regional-intake-handler.ts"
  "artifacts/api-server/src/test/unit/regional-intake-handler.test.ts"
  "artifacts/api-server/src/test/unit/regional-intake-http-map.test.ts"
  "scripts/verify-c2b3a.sh"
)

# Build cumulative set from three sources
COMMITTED=$(git diff --name-only origin/main...HEAD 2>/dev/null || true)
WORKTREE=$(git diff --name-only origin/main -- 2>/dev/null || true)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)

# Deduplicate and sort
ACTUAL_SCOPE=$(printf '%s\n' ${COMMITTED} ${WORKTREE} ${UNTRACKED} \
  | sort -u \
  | grep -v '^$' || true)

EXPECTED_SORTED=$(printf '%s\n' "${EXPECTED_SCOPE[@]}" | sort)

MISSING=$(comm -23 <(echo "${EXPECTED_SORTED}") <(echo "${ACTUAL_SCOPE}") || true)
EXTRA=$(comm -13 <(echo "${EXPECTED_SORTED}") <(echo "${ACTUAL_SCOPE}") || true)

if [[ -n "${MISSING}" ]]; then
  fail 7 "Expected file(s) missing from cumulative scope: $(echo "${MISSING}" | tr '\n' ' ')"
fi

if [[ -n "${EXTRA}" ]]; then
  fail 7 "Unexpected file(s) in cumulative scope (outside locked five-file set): $(echo "${EXTRA}" | tr '\n' ' ')"
fi

echo "  Cumulative scope: exactly 5 locked files ✓"
for f in "${EXPECTED_SCOPE[@]}"; do
  echo "    ${f}"
done

# ── Step 8: Protected-file zero drift ─────────────────────────────────────────

step 8 "Protected-file zero drift"

PROTECTED_DRIFT=$(git diff --name-only origin/main -- \
  artifacts/api-server/src/app.ts \
  artifacts/api-server/src/index.ts \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/routes/internal-rbg-router.ts \
  artifacts/api-server/src/routes/public-bookings.ts \
  artifacts/api-server/src/services/regional-intake.service.ts \
  artifacts/api-server/src/services/email.service.ts \
  artifacts/api-server/src/lib/pg-error-metadata.ts \
  artifacts/api-server/src/lib/regional-intake-dto.ts \
  artifacts/api-server/src/lib/regional-intake-helpers.ts \
  artifacts/api-server/src/lib/regional-intake-transaction.ts \
  artifacts/api-server/src/repositories/regional-intake.repository.ts \
  artifacts/api-server/src/repositories/regional-intake-write.repository.ts \
  scripts/verify-c2a.sh \
  scripts/verify-c2b1.sh \
  scripts/verify-c2b2.sh \
  pnpm-lock.yaml \
  2>/dev/null || true)

if [[ -n "${PROTECTED_DRIFT}" ]]; then
  fail 8 "Protected file(s) modified: ${PROTECTED_DRIFT}"
fi

echo "  Protected-file drift: zero ✓"

# ── All steps passed ───────────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  PASS: C2b-3a verified — 8 outer steps                                   ║"
echo "║  C2b-3a unit ✓ (15/15) · general unit ✓ (224/224)                       ║"
echo "║  C2b-2 baseline ✓ · route unmounted ✓ · import allowlist ✓              ║"
echo "║  five-file scope ✓ · protected-file drift zero ✓                         ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
