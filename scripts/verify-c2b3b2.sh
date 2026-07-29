#!/usr/bin/env bash
#
# verify-c2b3b2.sh
#
# C2b-3b2 verification script — 11 outer steps.
#
# Step 7 invokes verify-c2b2.sh exactly once.  That nested invocation covers:
#   C1 / C2a / C2b-1 / C2b-2 suites, library typecheck, exact 11-diagnostic
#   API baseline, production CJS build, PostgreSQL fixture cleanup.
#
# Steps 3/4/5 invoke the C2b-3b1 and C2b-3a suites directly via package
# scripts — NOT via verify-c2b3b1.sh or verify-c2b3a.sh, whose exact
# scope gates would reject legitimate C2b-3b2 additions as extra files.
#
# STEPS:
#   1.  Build-state-safe repository/environment preflight
#   2.  C2b-3b2 unit tests (15/15)
#   3.  C2b-3b1 unit regression (10/10)
#   4.  C2b-3b1 PostgreSQL integration regression (2/2)
#   5.  C2b-3a regression (15/15)
#   6.  General unit suite (224/224)
#   7.  Invoke scripts/verify-c2b2.sh exactly once
#   8.  Route-unmounted / runtime-import proof
#   9.  Comment-aware import/dependency/production-WEBSITE boundary
#  10.  Checkpoint-safe exact eight-file scope proof
#  11.  Protected-file zero-drift proof
#
# REQUIREMENTS:
#   DATABASE_URL          — production/dev DB reference (safety guard only)
#   RBG_TEST_DATABASE_URL — dedicated, fully disposable test database
#
# SAFETY:
#   - Never resets or migrates DATABASE_URL target
#   - verify-c2b2.sh invoked once as subprocess — not duplicated
#   - No credentials, full URLs, or raw source printed on failure
#   - All step failures exit non-zero with a STOP message
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

BASELINE="493dffb0a1dfcacc5b86383b4026681878444804"

step() {
  echo ""
  echo "[Step $1] $2"
}

fail() {
  echo "STOP [verify-c2b3b2 step $1]: $2" >&2
  exit 1
}

echo "=== verify-c2b3b2.sh — 11 outer steps ==="

# ── Step 1: Build-state-safe repository/environment preflight ─────────────────
#
# Distinct from executor's before-touching-source preflight.
# Allows dirty worktree and local checkpoint commits ahead of origin/main.
# Does NOT require clean tree or ahead/behind 0/0.

step 1 "Build-state-safe repository/environment preflight"

# 1a: current branch must be main
BRANCH=$(git branch --show-current 2>/dev/null || echo "")
[[ "${BRANCH}" == "main" ]] \
  || fail 1 "current branch is '${BRANCH}', expected 'main'"

echo "  Branch: main ✓"

# 1b: origin/main must be exactly the baseline
ORIGIN_SHA=$(git rev-parse origin/main 2>/dev/null || echo "")
[[ "${ORIGIN_SHA}" == "${BASELINE}" ]] \
  || fail 1 "origin/main is '${ORIGIN_SHA}', expected baseline '${BASELINE}'"

echo "  origin/main: ${BASELINE} ✓"

# 1c: no index.lock
[[ ! -f ".git/index.lock" ]] \
  || fail 1 ".git/index.lock is present — remove it before proceeding"

echo "  .git/index.lock: absent ✓"

# 1d: local HEAD must not be behind origin/main
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "error")
[[ "${BEHIND}" == "0" ]] \
  || fail 1 "HEAD is ${BEHIND} commit(s) behind origin/main — HEAD has diverged"

echo "  HEAD not behind origin/main ✓"

# 1e: HEAD must be a descendant of baseline (or equal)
git merge-base --is-ancestor "${BASELINE}" HEAD 2>/dev/null \
  || fail 1 "HEAD is not a descendant of baseline ${BASELINE}"

echo "  HEAD is at or ahead of baseline ✓"

# 1f: environment variables present
[[ -n "${DATABASE_URL:-}" ]] \
  || fail 1 "DATABASE_URL is not set. Required for safety guards."

[[ -n "${RBG_TEST_DATABASE_URL:-}" ]] \
  || fail 1 "RBG_TEST_DATABASE_URL is not set. Set it to a dedicated disposable database."

# 1g: databases must be distinct
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
echo "  Step 1 PASS ✓"

# ── Step 2: C2b-3b2 unit tests (15/15) ───────────────────────────────────────

step 2 "C2b-3b2 unit tests — expected 15/15"

C2B3B2_OUT=$(pnpm --filter @workspace/api-server run test:unit:c2b3b2 2>&1) \
  || {
    echo "${C2B3B2_OUT}" | tail -30
    fail 2 "C2b-3b2 unit test suite exited non-zero."
  }

C2B3B2_PASS=$(echo "${C2B3B2_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
C2B3B2_FAIL=$(echo "${C2B3B2_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${C2B3B2_PASS}" != "15" ]]; then
  echo "${C2B3B2_OUT}" | tail -30
  fail 2 "Expected exactly 15 C2b-3b2 unit tests, got '${C2B3B2_PASS:-<not found>}' (fail=${C2B3B2_FAIL:-?})."
fi

if [[ "${C2B3B2_FAIL:-0}" != "0" ]]; then
  echo "${C2B3B2_OUT}" | tail -20
  fail 2 "C2b-3b2 unit suite has ${C2B3B2_FAIL} failing test(s)."
fi

echo "  C2b-3b2 unit tests: ${C2B3B2_PASS}/15 ✓"

# ── Step 3: C2b-3b1 unit regression (10/10) ──────────────────────────────────

step 3 "C2b-3b1 unit regression — expected 10/10"

C2B3B1_UNIT_OUT=$(pnpm --filter @workspace/api-server run test:unit:c2b3b1 2>&1) \
  || {
    echo "${C2B3B1_UNIT_OUT}" | tail -30
    fail 3 "C2b-3b1 unit test suite exited non-zero."
  }

C2B3B1_UNIT_PASS=$(echo "${C2B3B1_UNIT_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
C2B3B1_UNIT_FAIL=$(echo "${C2B3B1_UNIT_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${C2B3B1_UNIT_PASS}" != "10" ]]; then
  echo "${C2B3B1_UNIT_OUT}" | tail -20
  fail 3 "Expected exactly 10 C2b-3b1 unit tests, got '${C2B3B1_UNIT_PASS:-<not found>}' (fail=${C2B3B1_UNIT_FAIL:-?})."
fi

if [[ "${C2B3B1_UNIT_FAIL:-0}" != "0" ]]; then
  echo "${C2B3B1_UNIT_OUT}" | tail -20
  fail 3 "C2b-3b1 unit suite has ${C2B3B1_UNIT_FAIL} failing test(s)."
fi

echo "  C2b-3b1 unit regression: ${C2B3B1_UNIT_PASS}/10 ✓"

# ── Step 4: C2b-3b1 PostgreSQL integration regression (2/2) ──────────────────

step 4 "C2b-3b1 PostgreSQL integration regression — expected 2/2"

C2B3B1_INT_OUT=$(pnpm --filter @workspace/api-server run test:integration:c2b3b1 2>&1) \
  || {
    echo "${C2B3B1_INT_OUT}" | tail -30
    fail 4 "C2b-3b1 integration test suite exited non-zero."
  }

C2B3B1_INT_PASS=$(echo "${C2B3B1_INT_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
C2B3B1_INT_FAIL=$(echo "${C2B3B1_INT_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${C2B3B1_INT_PASS}" != "2" ]]; then
  echo "${C2B3B1_INT_OUT}" | tail -20
  fail 4 "Expected exactly 2 C2b-3b1 integration tests, got '${C2B3B1_INT_PASS:-<not found>}' (fail=${C2B3B1_INT_FAIL:-?})."
fi

if [[ "${C2B3B1_INT_FAIL:-0}" != "0" ]]; then
  echo "${C2B3B1_INT_OUT}" | tail -20
  fail 4 "C2b-3b1 integration suite has ${C2B3B1_INT_FAIL} failing test(s)."
fi

echo "  C2b-3b1 integration regression: ${C2B3B1_INT_PASS}/2 ✓"

# ── Step 5: C2b-3a regression (15/15) ────────────────────────────────────────

step 5 "C2b-3a regression — expected 15/15"

C2B3A_OUT=$(pnpm --filter @workspace/api-server run test:unit:c2b3a 2>&1) \
  || {
    echo "${C2B3A_OUT}" | tail -30
    fail 5 "C2b-3a regression suite exited non-zero."
  }

C2B3A_PASS=$(echo "${C2B3A_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
C2B3A_FAIL=$(echo "${C2B3A_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${C2B3A_PASS}" != "15" ]]; then
  echo "${C2B3A_OUT}" | tail -20
  fail 5 "Expected exactly 15 C2b-3a tests, got '${C2B3A_PASS:-<not found>}' (fail=${C2B3A_FAIL:-?})."
fi

if [[ "${C2B3A_FAIL:-0}" != "0" ]]; then
  echo "${C2B3A_OUT}" | tail -20
  fail 5 "C2b-3a regression suite has ${C2B3A_FAIL} failing test(s)."
fi

echo "  C2b-3a regression: ${C2B3A_PASS}/15 ✓"

# ── Step 6: General unit suite (224/224) ──────────────────────────────────────

step 6 "General unit suite — expected 224/224"

UNIT_OUT=$(pnpm --filter @workspace/api-server run test:unit 2>&1) \
  || {
    echo "${UNIT_OUT}" | tail -30
    fail 6 "General unit suite exited non-zero."
  }

UNIT_PASS=$(echo "${UNIT_OUT}" | grep -E " pass [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)
UNIT_FAIL=$(echo "${UNIT_OUT}" | grep -E " fail [0-9]+" | grep -oE "[0-9]+$" | tail -1 || true)

if [[ "${UNIT_PASS}" != "224" ]]; then
  echo "${UNIT_OUT}" | tail -20
  fail 6 "Expected exactly 224 general unit tests, got '${UNIT_PASS:-<not found>}' (fail=${UNIT_FAIL:-?})."
fi

if [[ "${UNIT_FAIL:-0}" != "0" ]]; then
  echo "${UNIT_OUT}" | tail -20
  fail 6 "General unit suite has ${UNIT_FAIL} failing test(s)."
fi

echo "  General unit suite: ${UNIT_PASS}/224 ✓"

# ── Step 7: Full C2b-2 baseline ───────────────────────────────────────────────

step 7 "Full C2b-2 baseline — invoking scripts/verify-c2b2.sh exactly once"

bash "${REPO_ROOT}/scripts/verify-c2b2.sh" \
  || fail 7 "scripts/verify-c2b2.sh exited non-zero."

echo "  C2b-2 baseline: PASS ✓"

# ── Step 8: Route-unmounted / runtime-import proof ────────────────────────────

step 8 "Route-unmounted / runtime-import proof"

# 8a: protected runtime entry files must have zero drift
ENTRY_DRIFT=$(git diff --name-only "${BASELINE}" -- \
  artifacts/api-server/src/app.ts \
  artifacts/api-server/src/index.ts \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/routes/internal-rbg-router.ts \
  2>/dev/null || true)

if [[ -n "${ENTRY_DRIFT}" ]]; then
  fail 8 "Runtime entry file(s) modified: ${ENTRY_DRIFT}"
fi

echo "  Part A: runtime entry files unmodified ✓"

# 8b: none of the entry files may import C2b-3b2 production symbols
for PATTERN in \
  "regional-staff-email" \
  "regional-staff-notifier.impl" \
  "regional-notification-reporter" \
  "regional-intake-handler"; do
  MATCH=$(grep -l "${PATTERN}" \
    artifacts/api-server/src/app.ts \
    artifacts/api-server/src/index.ts \
    artifacts/api-server/src/routes/index.ts \
    artifacts/api-server/src/routes/internal-rbg-router.ts \
    2>/dev/null || true)
  if [[ -n "${MATCH}" ]]; then
    fail 8 "'${PATTERN}' import found in runtime entry file(s): ${MATCH}"
  fi
done

echo "  Part B: C2b-3b2 symbols absent from runtime entry files ✓"

# ── Step 9: Comment-aware import/dependency/production-WEBSITE boundary ────────

step 9 "Comment-aware import/dependency/production-WEBSITE boundary"

python3 - <<'PY'
import sys, re

RENDERER      = "artifacts/api-server/src/services/regional-staff-email.ts"
NOTIFIER_IMPL = "artifacts/api-server/src/services/regional-staff-notifier.impl.ts"
REPORTER      = "artifacts/api-server/src/services/regional-notification-reporter.ts"

FORBIDDEN_IMPORT_SUBSTRINGS = [
    "email.service",
    "public-bookings",
    "pdf",
    "voucher",
]

def strip_comments(src: str) -> str:
    src = re.sub(r"//[^\n]*", "", src)
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.DOTALL)
    return src

def get_import_sources(src: str) -> list:
    return re.findall(
        r"""^\s*import\b[^;]+?\bfrom\s+['"]((?:[^'"\\]|\\.)+)['"]\s*;?""",
        src,
        re.MULTILINE,
    )

def is_db_like(path: str) -> bool:
    """True if the import path looks like a DB/pool/pg import."""
    return (
        re.search(r"\bpg\b", path) is not None
        or "pool" in path.lower()
        or re.search(r"/db\b", path) is not None
    )

checks = [
    {"path": RENDERER,      "allow_resend": False, "allow_process_env": False},
    {"path": REPORTER,      "allow_resend": False, "allow_process_env": False},
    {"path": NOTIFIER_IMPL, "allow_resend": True,  "allow_process_env": True},
]

ok = True
for chk in checks:
    path = chk["path"]
    try:
        with open(path, encoding="utf-8") as f:
            src = f.read()
    except FileNotFoundError:
        print(f"STOP: {path} not found", flush=True)
        sys.exit(1)

    stripped       = strip_comments(src)
    import_sources = get_import_sources(src)

    # WEBSITE literal must not appear in production files
    if "WEBSITE" in stripped:
        print(f"STOP: WEBSITE literal found in production file: {path}", flush=True)
        sys.exit(1)

    # process.env
    if not chk["allow_process_env"] and "process.env" in stripped:
        print(f"STOP: process.env found in {path}", flush=True)
        sys.exit(1)

    for imp in import_sources:
        # Resend
        if not chk["allow_resend"] and "resend" in imp.lower():
            print(f"STOP: Resend import '{imp}' in {path}", flush=True)
            sys.exit(1)

        # Forbidden substrings
        for sub in FORBIDDEN_IMPORT_SUBSTRINGS:
            if sub in imp.lower():
                print(f"STOP: Forbidden import '{imp}' (matches '{sub}') in {path}", flush=True)
                sys.exit(1)

        # DB/pool/pg
        if is_db_like(imp):
            print(f"STOP: DB/pool/pg import '{imp}' in {path}", flush=True)
            sys.exit(1)

    print(f"  {path}: PASS ✓", flush=True)

sys.exit(0)
PY

[[ $? -eq 0 ]] || fail 9 "Import/dependency/WEBSITE boundary check failed."
echo "  Step 9 PASS ✓"

# ── Step 10: Checkpoint-safe exact eight-file scope proof ─────────────────────

step 10 "Checkpoint-safe exact eight-file scope proof"

# ── 10a: Purge known transient baseline artifacts before scope calculation ─────
#
# These files may be deposited by Replit checkpoint machinery.  They must never
# be tracked by Git; if they are untracked we remove them so they do not appear
# in the untracked delta and pollute the scope union.

TRANSIENT_PATHS=(
  "lib/db/_baseline_drizzle_config.ts"
  "lib/db/src/schema/__baseline_index.ts"
)

for TP in "${TRANSIENT_PATHS[@]}"; do
  # Hard-fail if Git considers this file tracked.
  if git ls-files --error-unmatch "${TP}" >/dev/null 2>&1; then
    fail 10 "Transient baseline artifact '${TP}' is tracked by Git — cannot safely remove."
  fi

  # Remove if present (no-op if already absent).
  rm -f "${TP}"

  # Hard-fail if still present after removal attempt.
  if [[ -e "${TP}" ]]; then
    fail 10 "Transient baseline artifact '${TP}' still exists after rm -f."
  fi

  echo "  Transient artifact absent: ${TP} ✓"
done

EXPECTED_SCOPE=(
  "artifacts/api-server/package.json"
  "artifacts/api-server/src/services/regional-notification-reporter.ts"
  "artifacts/api-server/src/services/regional-staff-email.ts"
  "artifacts/api-server/src/services/regional-staff-notifier.impl.ts"
  "artifacts/api-server/src/test/unit/regional-notification-reporter.test.ts"
  "artifacts/api-server/src/test/unit/regional-staff-email.test.ts"
  "artifacts/api-server/src/test/unit/regional-staff-notifier.test.ts"
  "scripts/verify-c2b3b2.sh"
)

COMMITTED=$(git diff --name-only "${BASELINE}...HEAD" 2>/dev/null || true)
WORKTREE=$(git diff --name-only "${BASELINE}" -- 2>/dev/null || true)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)

ACTUAL_SCOPE=$(printf '%s\n' ${COMMITTED} ${WORKTREE} ${UNTRACKED} \
  | sort -u \
  | grep -v '^$' || true)

EXPECTED_SORTED=$(printf '%s\n' "${EXPECTED_SCOPE[@]}" | sort)

MISSING=$(comm -23 <(echo "${EXPECTED_SORTED}") <(echo "${ACTUAL_SCOPE}") || true)
EXTRA=$(comm -13 <(echo "${EXPECTED_SORTED}") <(echo "${ACTUAL_SCOPE}") || true)

if [[ -n "${MISSING}" ]]; then
  fail 10 "Expected file(s) missing from cumulative scope: $(echo "${MISSING}" | tr '\n' ' ')"
fi

if [[ -n "${EXTRA}" ]]; then
  fail 10 "Unexpected file(s) in cumulative scope (outside locked eight-file set): $(echo "${EXTRA}" | tr '\n' ' ')"
fi

echo "  Cumulative scope: exactly 8 locked files ✓"
for f in "${EXPECTED_SCOPE[@]}"; do
  echo "    ${f}"
done

# ── Step 11: Protected-file zero drift ────────────────────────────────────────

step 11 "Protected-file zero drift"

PROTECTED_DRIFT=$(git diff --name-only "${BASELINE}" -- \
  artifacts/api-server/src/lib/regional-staff-notifier.ts \
  artifacts/api-server/src/routes/regional-intake-handler.ts \
  artifacts/api-server/src/services/regional-intake.service.ts \
  artifacts/api-server/src/services/email.service.ts \
  artifacts/api-server/src/routes/public-bookings.ts \
  artifacts/api-server/src/routes/internal-rbg-router.ts \
  artifacts/api-server/src/app.ts \
  artifacts/api-server/src/index.ts \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/lib/regional-intake-transaction.ts \
  artifacts/api-server/src/lib/regional-intake-dto.ts \
  artifacts/api-server/src/lib/regional-intake-helpers.ts \
  artifacts/api-server/src/lib/pg-error-metadata.ts \
  artifacts/api-server/src/repositories/regional-intake.repository.ts \
  artifacts/api-server/src/repositories/regional-intake-write.repository.ts \
  scripts/verify-c2a.sh \
  scripts/verify-c2b1.sh \
  scripts/verify-c2b2.sh \
  scripts/verify-c2b3a.sh \
  scripts/verify-c2b3b1.sh \
  pnpm-lock.yaml \
  2>/dev/null || true)

if [[ -n "${PROTECTED_DRIFT}" ]]; then
  fail 11 "Protected file(s) modified: ${PROTECTED_DRIFT}"
fi

echo "  Protected-file drift: zero ✓"

# ── Post-step-11 transient-artifact absence assertion ─────────────────────────
#
# Assert both known transient baseline artifacts are absent.
# This re-check is independent of the scope proof in step 10 and runs after
# all git-diff checks, so any late re-appearance is caught before the banner.

for TP in "${TRANSIENT_PATHS[@]}"; do
  if [[ -e "${TP}" ]]; then
    fail 11 "Transient baseline artifact '${TP}' reappeared after step 10 removal."
  fi
  echo "  Post-step-11 absent: ${TP} ✓"
done

# ── All steps passed ───────────────────────────────────────────────────────────

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║  PASS: C2b-3b2 verified — 11 outer steps                                 ║"
echo "║  C2b-3b2 unit ✓ (15/15) · C2b-3b1 unit ✓ (10/10)                       ║"
echo "║  C2b-3b1 integration ✓ (2/2) · C2b-3a ✓ (15/15)                        ║"
echo "║  general unit ✓ (224/224) · C2b-2 baseline ✓                            ║"
echo "║  route unmounted ✓ · import boundary ✓ · eight-file scope ✓             ║"
echo "║  protected-file drift zero ✓                                             ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
