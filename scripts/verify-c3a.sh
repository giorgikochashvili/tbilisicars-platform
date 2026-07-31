#!/usr/bin/env bash
# verify-c3a.sh
#
# C3a — Zero-Runtime-Effect Composition Foundation verifier.
# 14 outer numbered steps.
#
# Canonical baseline:
#   fe30665bfee91296f0bbfee3c0058bcf58661cc5
#
# Usage:
#   bash scripts/verify-c3a.sh
#
# Exit codes:
#   0 — all 14 steps passed
#   1 — a step failed (reason printed to stderr)

set -euo pipefail

BASELINE="fe30665bfee91296f0bbfee3c0058bcf58661cc5"

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[0;33m'
NC='\033[0m'

pass() { printf "${GRN}[PASS]${NC} %s\n" "$1"; }
fail() { printf "${RED}[FAIL]${NC} %s\n" "$1" >&2; exit 1; }
info() { printf "${YEL}[INFO]${NC} %s\n" "$1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "============================================================"
echo "  C3a verifier — baseline: ${BASELINE}"
echo "============================================================"

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Repository / environment preflight
# ─────────────────────────────────────────────────────────────────────────────
info "Step 1: repository / environment preflight"

branch="$(git branch --show-current)"
[[ "$branch" == "main" ]] || fail "Step 1: branch is '$branch', expected 'main'"

head_sha="$(git rev-parse HEAD)"
origin_sha="$(git rev-parse origin/main)"

[[ "$origin_sha" == "$BASELINE" ]] || \
  fail "Step 1: origin/main is $origin_sha, expected $BASELINE"

# HEAD must equal baseline or be a local-checkpoint descendant of it
if [[ "$head_sha" != "$BASELINE" ]]; then
  git merge-base --is-ancestor "$BASELINE" "$head_sha" 2>/dev/null || \
    fail "Step 1: HEAD $head_sha is not a descendant of baseline $BASELINE"
  info "Step 1: HEAD is a local-checkpoint descendant of baseline (OK)"
fi

[[ ! -f ".git/index.lock" ]] || fail "Step 1: .git/index.lock exists"

behind="$(git rev-list --count HEAD..origin/main)"
[[ "$behind" -eq 0 ]] || fail "Step 1: HEAD is $behind commits behind origin/main"

[[ -n "${DATABASE_URL:-}"         ]] || fail "Step 1: DATABASE_URL is not set"
[[ -n "${RBG_TEST_DATABASE_URL:-}" ]] || fail "Step 1: RBG_TEST_DATABASE_URL is not set"
[[ "$DATABASE_URL" != "$RBG_TEST_DATABASE_URL" ]] || \
  fail "Step 1: DATABASE_URL and RBG_TEST_DATABASE_URL must be distinct"

pass "Step 1: repository / environment preflight"

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — C3a unit tests (36 passing, 0 failing)
# ─────────────────────────────────────────────────────────────────────────────
info "Step 2: C3a unit tests (expected: pass 36, fail 0)"

cd artifacts/api-server

unit_output="$(node --import tsx --test \
  src/test/unit/integration-client.repository.test.ts \
  src/test/unit/rbg-core-intake-secrets.test.ts \
  src/test/unit/internal-rbg.composition.test.ts \
  2>&1)"

echo "$unit_output"

unit_pass="$(echo "$unit_output" | grep -E '^ℹ pass ' | awk '{print $NF}')"
unit_fail="$(echo "$unit_output" | grep -E '^ℹ fail ' | awk '{print $NF}')"

[[ "$unit_pass" == "36" ]] || fail "Step 2: C3a unit pass=$unit_pass, expected 36"
[[ "$unit_fail" == "0"  ]] || fail "Step 2: C3a unit fail=$unit_fail, expected 0"

pass "Step 2: C3a unit tests (36/36)"

cd "$ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Invoke scripts/verify-c2b2.sh exactly once (DB reset + migration 0014)
# ─────────────────────────────────────────────────────────────────────────────
info "Step 3: invoking scripts/verify-c2b2.sh (DB reset + migration 0014)"

bash scripts/verify-c2b2.sh || fail "Step 3: verify-c2b2.sh exited non-zero"

pass "Step 3: verify-c2b2.sh completed (DB reset + migration 0014 applied)"

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — C3a PostgreSQL integration tests (3 passing, 0 failing)
# ─────────────────────────────────────────────────────────────────────────────
info "Step 4: C3a PostgreSQL integration tests (expected: pass 3, fail 0)"

cd artifacts/api-server

pg_output="$(node --import tsx --test \
  src/test/integration/integration-client-repository.integration.test.ts \
  2>&1)"

echo "$pg_output"

pg_pass="$(echo "$pg_output" | grep -E '^ℹ pass ' | awk '{print $NF}')"
pg_fail="$(echo "$pg_output" | grep -E '^ℹ fail ' | awk '{print $NF}')"

[[ "$pg_pass" == "3" ]] || fail "Step 4: C3a PostgreSQL pass=$pg_pass, expected 3"
[[ "$pg_fail" == "0" ]] || fail "Step 4: C3a PostgreSQL fail=$pg_fail, expected 0"

pass "Step 4: C3a PostgreSQL integration tests (3/3)"

cd "$ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — C2b-3b1 PostgreSQL regression (2 passing, 0 failing)
# ─────────────────────────────────────────────────────────────────────────────
info "Step 5: C2b-3b1 PostgreSQL regression (expected: pass 2, fail 0)"

cd artifacts/api-server

s5_output="$(node --import tsx --test \
  src/test/integration/regional-intake-c2b3b1.test.ts \
  2>&1)"

echo "$s5_output"

s5_pass="$(echo "$s5_output" | grep -E '^ℹ pass ' | awk '{print $NF}')"
s5_fail="$(echo "$s5_output" | grep -E '^ℹ fail ' | awk '{print $NF}')"

[[ "$s5_pass" == "2" ]] || fail "Step 5: C2b-3b1 PG pass=$s5_pass, expected 2"
[[ "$s5_fail" == "0" ]] || fail "Step 5: C2b-3b1 PG fail=$s5_fail, expected 0"

pass "Step 5: C2b-3b1 PostgreSQL regression (2/2)"

cd "$ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — C2b-3b2 unit regression (15 passing, 0 failing)
# ─────────────────────────────────────────────────────────────────────────────
info "Step 6: C2b-3b2 unit regression (expected: pass 15, fail 0)"

cd artifacts/api-server

s6_output="$(pnpm run test:unit:c2b3b2 2>&1)"
echo "$s6_output"

s6_pass="$(echo "$s6_output" | grep -E '^ℹ pass ' | awk '{print $NF}')"
s6_fail="$(echo "$s6_output" | grep -E '^ℹ fail ' | awk '{print $NF}')"

[[ "$s6_pass" == "15" ]] || fail "Step 6: C2b-3b2 unit pass=$s6_pass, expected 15"
[[ "$s6_fail" == "0"  ]] || fail "Step 6: C2b-3b2 unit fail=$s6_fail, expected 0"

pass "Step 6: C2b-3b2 unit regression (15/15)"

cd "$ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — C2b-3b1 unit regression (10 passing, 0 failing)
# ─────────────────────────────────────────────────────────────────────────────
info "Step 7: C2b-3b1 unit regression (expected: pass 10, fail 0)"

cd artifacts/api-server

s7_output="$(pnpm run test:unit:c2b3b1 2>&1)"
echo "$s7_output"

s7_pass="$(echo "$s7_output" | grep -E '^ℹ pass ' | awk '{print $NF}')"
s7_fail="$(echo "$s7_output" | grep -E '^ℹ fail ' | awk '{print $NF}')"

[[ "$s7_pass" == "10" ]] || fail "Step 7: C2b-3b1 unit pass=$s7_pass, expected 10"
[[ "$s7_fail" == "0"  ]] || fail "Step 7: C2b-3b1 unit fail=$s7_fail, expected 0"

pass "Step 7: C2b-3b1 unit regression (10/10)"

cd "$ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# Step 8 — C2b-3a unit regression (15 passing, 0 failing)
# ─────────────────────────────────────────────────────────────────────────────
info "Step 8: C2b-3a unit regression (expected: pass 15, fail 0)"

cd artifacts/api-server

s8_output="$(pnpm run test:unit:c2b3a 2>&1)"
echo "$s8_output"

s8_pass="$(echo "$s8_output" | grep -E '^ℹ pass ' | awk '{print $NF}')"
s8_fail="$(echo "$s8_output" | grep -E '^ℹ fail ' | awk '{print $NF}')"

[[ "$s8_pass" == "15" ]] || fail "Step 8: C2b-3a unit pass=$s8_pass, expected 15"
[[ "$s8_fail" == "0"  ]] || fail "Step 8: C2b-3a unit fail=$s8_fail, expected 0"

pass "Step 8: C2b-3a unit regression (15/15)"

cd "$ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# Step 9 — General unit suite (224 passing, 0 failing)
# ─────────────────────────────────────────────────────────────────────────────
info "Step 9: general unit suite (expected: pass 224, fail 0)"

cd artifacts/api-server

s9_output="$(pnpm run test:unit 2>&1)"
echo "$s9_output"

s9_pass="$(echo "$s9_output" | grep -E '^ℹ pass ' | awk '{print $NF}')"
s9_fail="$(echo "$s9_output" | grep -E '^ℹ fail ' | awk '{print $NF}')"

[[ "$s9_pass" == "224" ]] || fail "Step 9: general unit pass=$s9_pass, expected 224"
[[ "$s9_fail" == "0"   ]] || fail "Step 9: general unit fail=$s9_fail, expected 0"

pass "Step 9: general unit suite (224/224)"

cd "$ROOT"

# ─────────────────────────────────────────────────────────────────────────────
# Step 10 — Route-unmounted / runtime-import proof
# ─────────────────────────────────────────────────────────────────────────────
info "Step 10: route-unmounted / runtime-import proof"

# Zero committed drift in runtime entry files vs baseline
drift="$(git diff --name-only "$BASELINE" -- \
  artifacts/api-server/src/app.ts \
  artifacts/api-server/src/index.ts \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/routes/internal-rbg-router.ts \
  2>/dev/null)"

if [[ -n "$drift" ]]; then
  fail "Step 10: runtime entry files changed from baseline:\n$drift"
fi

# Zero import of C3a symbols in runtime entries
for entry_file in \
    artifacts/api-server/src/app.ts \
    artifacts/api-server/src/index.ts \
    artifacts/api-server/src/routes/index.ts; do

  if grep -qE \
      "internal-rbg\.composition|buildInternalRbgComposition|integration-client\.repository|rbg-core-intake-secrets|composition/" \
      "$entry_file" 2>/dev/null; then
    fail "Step 10: C3a symbol found in runtime entry: $entry_file"
  fi
done

pass "Step 10: route-unmounted / runtime-import proof"

# ─────────────────────────────────────────────────────────────────────────────
# Step 11 — Comment-aware import and forbidden-boundary proof
# ─────────────────────────────────────────────────────────────────────────────
info "Step 11: import boundary proof (Python comment-aware parser)"

python3 - <<'PYEOF'
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent if False else pathlib.Path(".")

def read(p):
    return pathlib.Path(p).read_text(encoding="utf-8")

def active_lines(src):
    """Return source with both // and /* ... */ comments stripped."""
    # First remove block comments (/* ... */ including multi-line)
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.DOTALL)
    # Then remove single-line // comments
    lines = []
    for line in src.splitlines():
        stripped = re.sub(r'//.*', '', line)
        lines.append(stripped)
    return "\n".join(lines)

def check(label, path, forbidden_patterns, description):
    try:
        src = active_lines(read(path))
    except FileNotFoundError:
        print(f"FAIL: {label}: file not found: {path}", file=sys.stderr)
        sys.exit(1)
    for pat in forbidden_patterns:
        if re.search(pat, src):
            print(f"FAIL: {label}: forbidden pattern '{pat}' found in {path}", file=sys.stderr)
            sys.exit(1)
    print(f"  OK: {label}: {description}")

# integration-client.repository.ts
check(
    "IC-repo",
    "artifacts/api-server/src/repositories/integration-client.repository.ts",
    [
        r'from ["\']@workspace/db["\']',
        r'process\.env',
        r'from ["\'].*resend',
        r'from ["\'].*email\.service',
        r'from ["\'].*public-bookings',
        r'from ["\'].*pdf',
        r'from ["\'].*voucher',
    ],
    "no @workspace/db singleton, no process.env, no forbidden imports",
)

# rbg-core-intake-secrets.ts
check(
    "Secrets-parser",
    "artifacts/api-server/src/lib/rbg-core-intake-secrets.ts",
    [
        r'from ["\']@workspace/db["\']',
        r'process\.env',
        r'from ["\'].*resend',
        r'from ["\'].*express',
        r'from ["\'].*email\.service',
        r'from ["\'].*public-bookings',
        r'from ["\'].*pdf',
        r'from ["\'].*voucher',
    ],
    "no @workspace/db, no process.env, no express, no forbidden imports",
)

# internal-rbg.composition.ts
check(
    "Composition",
    "artifacts/api-server/src/composition/internal-rbg.composition.ts",
    [
        r'from ["\']@workspace/db["\']',
        r'process\.env',
        r'console\.',
        r'buildDefaultRegionalStaffNotifier',
        r'from ["\'].*email\.service',
        r'from ["\'].*public-bookings',
        r'from ["\'].*pdf',
        r'from ["\'].*voucher',
        r'\bWEBSITE\b',
        r'new Resend',
    ],
    "no @workspace/db, no process.env, no console, no forbidden imports",
)

# ── Hardening 1: composition wiring proof ────────────────────────────────────
# Inspect the comment-stripped composition source to prove:
#   (a) enabled-client resolution uses deps.db (not a different db)
#   (b) transaction delegation is deps.db.transaction(cb) with no config arg
#   (c) no custom isolation level is specified
comp_path = "artifacts/api-server/src/composition/internal-rbg.composition.ts"
try:
    comp_src = active_lines(read(comp_path))
except FileNotFoundError:
    print(f"FAIL: Composition-wiring: file not found: {comp_path}", file=sys.stderr)
    sys.exit(1)

# Required wiring 1: resolveEnabledIntegrationClient(deps.db, ...)
# Tolerates normal whitespace and line breaks between tokens.
if not re.search(r'resolveEnabledIntegrationClient\s*\(\s*deps\.db\s*,', comp_src):
    print(
        f"FAIL: Composition-wiring: 'resolveEnabledIntegrationClient(deps.db, ...)'"
        f" not found in {comp_path}",
        file=sys.stderr,
    )
    sys.exit(1)
print(f"  OK: Composition-wiring: resolveEnabledIntegrationClient(deps.db, ...) present")

# Required wiring 2: deps.db.transaction(cb) with no second argument
# The closing paren must follow cb with only optional whitespace.
if not re.search(r'deps\.db\.transaction\s*\(\s*cb\s*\)', comp_src):
    print(
        f"FAIL: Composition-wiring: 'deps.db.transaction(cb)' (no config arg)"
        f" not found in {comp_path}",
        file=sys.stderr,
    )
    sys.exit(1)
print(f"  OK: Composition-wiring: deps.db.transaction(cb) present (no config argument)")

# Forbidden 1: isolationLevel
if re.search(r'isolationLevel', comp_src):
    print(
        f"FAIL: Composition-wiring: forbidden 'isolationLevel' found in {comp_path}",
        file=sys.stderr,
    )
    sys.exit(1)
print(f"  OK: Composition-wiring: no isolationLevel")

# Forbidden 2: deps.db.transaction with a second config argument
# Matches deps.db.transaction(cb, <anything>) — a comma after cb signals a config object.
if re.search(r'deps\.db\.transaction\s*\(\s*cb\s*,', comp_src):
    print(
        f"FAIL: Composition-wiring: deps.db.transaction called with second config"
        f" argument in {comp_path}",
        file=sys.stderr,
    )
    sys.exit(1)
print(f"  OK: Composition-wiring: deps.db.transaction has no second config argument")

# PostgreSQL integration test: must not import live @workspace/db singleton
integration_test = "artifacts/api-server/src/test/integration/integration-client-repository.integration.test.ts"
src = active_lines(read(integration_test))
# Allow @workspace/db/schema; forbid bare @workspace/db import
bare_import = re.search(r'from ["\']@workspace/db["\']', src)
if bare_import:
    print(f"FAIL: PG-test: live @workspace/db singleton import found in {integration_test}", file=sys.stderr)
    sys.exit(1)
print(f"  OK: PG-test: no @workspace/db singleton import in integration test")

print("Step 11: all import boundary and composition-wiring checks passed")
PYEOF

pass "Step 11: import boundary proof"

# ─────────────────────────────────────────────────────────────────────────────
# Step 12 — Transient artifact cleanup + checkpoint-safe scope proof
# ─────────────────────────────────────────────────────────────────────────────
info "Step 12: transient artifact cleanup + cumulative scope proof"

TRANSIENT_1="lib/db/_baseline_drizzle_config.ts"
TRANSIENT_2="lib/db/src/schema/__baseline_index.ts"

for t in "$TRANSIENT_1" "$TRANSIENT_2"; do
  if git ls-files --error-unmatch "$t" &>/dev/null; then
    fail "Step 12: transient path is tracked by Git: $t"
  fi
  rm -f "$t"
  if [[ -f "$t" ]]; then
    fail "Step 12: transient path still present after rm: $t"
  fi
done

# Cumulative scope: committed delta + worktree delta + untracked files
# relative to the canonical baseline.
EXPECTED_PATHS=(
  "artifacts/api-server/src/composition/internal-rbg.composition.ts"
  "artifacts/api-server/src/lib/rbg-core-intake-secrets.ts"
  "artifacts/api-server/src/repositories/integration-client.repository.ts"
  "artifacts/api-server/src/test/unit/integration-client.repository.test.ts"
  "artifacts/api-server/src/test/unit/rbg-core-intake-secrets.test.ts"
  "artifacts/api-server/src/test/unit/internal-rbg.composition.test.ts"
  "artifacts/api-server/src/test/integration/integration-client-repository.integration.test.ts"
  "scripts/verify-c3a.sh"
)

# Committed changes since baseline
committed="$(git diff --name-only "$BASELINE" HEAD 2>/dev/null || true)"
# Uncommitted worktree changes (tracked files)
worktree="$(git diff --name-only HEAD 2>/dev/null || true)"
# Untracked files
untracked="$(git ls-files --others --exclude-standard 2>/dev/null || true)"

# Build the union set (deduplicated, sorted)
all_delta="$(printf '%s\n' $committed $worktree $untracked | sort -u | grep -v '^$' || true)"

# Filter out transient paths already cleaned
all_delta="$(echo "$all_delta" | grep -v "^${TRANSIENT_1}$" | grep -v "^${TRANSIENT_2}$" || true)"

# Sort expected paths
expected_sorted="$(printf '%s\n' "${EXPECTED_PATHS[@]}" | sort)"

if [[ "$all_delta" != "$expected_sorted" ]]; then
  echo "  Expected paths:"
  printf '%s\n' "${EXPECTED_PATHS[@]}" | sort | sed 's/^/    /'
  echo "  Observed delta:"
  echo "$all_delta" | sed 's/^/    /'
  fail "Step 12: cumulative scope does not match expected 8-file set"
fi

pass "Step 12: transient cleanup and scope proof (exactly 8 paths)"

# ─────────────────────────────────────────────────────────────────────────────
# Step 13 — Protected-file zero-drift proof from canonical baseline
# ─────────────────────────────────────────────────────────────────────────────
info "Step 13: protected-file zero-drift proof"

PROTECTED=(
  "artifacts/api-server/src/app.ts"
  "artifacts/api-server/src/index.ts"
  "artifacts/api-server/src/routes/index.ts"
  "artifacts/api-server/src/routes/internal-rbg-router.ts"
  "artifacts/api-server/src/routes/regional-intake-handler.ts"
  "artifacts/api-server/src/services/regional-intake.service.ts"
  "artifacts/api-server/src/lib/integration-secret-store.ts"
  "artifacts/api-server/src/lib/intake-feature-classifier.ts"
  "artifacts/api-server/src/services/regional-staff-notifier.impl.ts"
  "artifacts/api-server/src/services/regional-notification-reporter.ts"
  "artifacts/api-server/package.json"
  "pnpm-lock.yaml"
)

for f in "${PROTECTED[@]}"; do
  diff_out="$(git diff "$BASELINE" -- "$f" 2>/dev/null)"
  if [[ -n "$diff_out" ]]; then
    fail "Step 13: protected file has changed from baseline: $f"
  fi
done

pass "Step 13: protected-file zero-drift proof"

# ─────────────────────────────────────────────────────────────────────────────
# Step 14 — Post-step-13 transient re-assertion + checkpoint-safe diff check
# ─────────────────────────────────────────────────────────────────────────────
info "Step 14: transient re-assertion + checkpoint-safe diff --check"

for t in "$TRANSIENT_1" "$TRANSIENT_2"; do
  if [[ -f "$t" ]]; then
    fail "Step 14: transient path re-appeared after step 12 cleanup: $t"
  fi
done

# ── Hardening 2: explicit Python whitespace scan over the eight approved paths ─
# git diff --check only covers committed/tracked diffs. When C3a files are
# untracked, it cannot detect trailing whitespace or missing final newlines in
# those files. This scan covers them explicitly without touching the Git index.
python3 - "${EXPECTED_PATHS[@]}" <<'WSEOF'
import sys, pathlib

paths = sys.argv[1:]
errors = []

for p in paths:
    try:
        text = pathlib.Path(p).read_text(encoding="utf-8")
    except Exception as exc:
        errors.append(f"UNREADABLE: {p}: {exc}")
        continue

    # Require a final newline (POSIX text file convention).
    if not text.endswith("\n"):
        errors.append(f"NO_FINAL_NEWLINE: {p}")

    # Reject any line that ends with a space or tab before its newline.
    for lineno, line in enumerate(text.split("\n"), 1):
        if line.endswith(" ") or line.endswith("\t"):
            errors.append(f"TRAILING_WHITESPACE: {p}:{lineno}: {repr(line[-12:])}")

if errors:
    for e in errors:
        print(f"FAIL: {e}", file=sys.stderr)
    sys.exit(1)

print(f"  OK: whitespace scan: all {len(paths)} approved C3a paths are clean")
WSEOF

# Use canonical baseline — NOT HEAD — to be safe against Replit checkpoints.
git diff --check "$BASELINE" || fail "Step 14: git diff --check found whitespace errors"

pass "Step 14: transient re-assertion, whitespace scan, and checkpoint-safe diff --check"

# ─────────────────────────────────────────────────────────────────────────────
# Final banner
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
printf "${GRN}  C3a VERIFIER: ALL 14 STEPS PASSED${NC}\n"
echo "  Baseline: $BASELINE"
echo "  C3a unit:       36 / 36"
echo "  C3a PostgreSQL:  3 /  3"
echo "  C2b-3b2 unit:   15 / 15"
echo "  C2b-3b1 unit:   10 / 10"
echo "  C2b-3b1 PG:      2 /  2"
echo "  C2b-3a unit:    15 / 15"
echo "  General unit:  224 / 224"
echo "  Scope:           8 files exactly"
echo "  Protected files: 0 drift"
echo "============================================================"
