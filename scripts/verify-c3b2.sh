#!/usr/bin/env bash
# verify-c3b2.sh
#
# C3b-2 Build Candidate Verifier
#
# Baseline:   39d80e8558274f63b91eb0dbda21624e42e8e7df  (C3b-1 commit, local only)
# Origin ref: 2c8bc0ade221ca8f33506d4f727e63c0c2545729  (C3a baseline; C3b-1 not yet pushed)
# Exit codes: 0 = all 26 steps passed; 1 = a step failed (reason printed to stderr)
#
# Prerequisites:
#   - RBG_TEST_DATABASE_URL set to a dedicated test DB with migration 0014 applied
#   - Workspace at baseline + exactly the 3 C3b-2 paths uncommitted

set -euo pipefail

NC='\033[0m'; GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[0;33m'
pass() { printf "${GRN}[PASS]${NC} %s\n"  "$1"; }
fail() { printf "${RED}[FAIL]${NC} %s\n"  "$1" >&2; exit 1; }
info() { printf "${YEL}[INFO]${NC} %s\n"  "$1"; }

# ── Constants ─────────────────────────────────────────────────────────────────

C3B1_SHA="39d80e8558274f63b91eb0dbda21624e42e8e7df"
C3A_SHA="2c8bc0ade221ca8f33506d4f727e63c0c2545729"
BACKUP_DIR="/home/runner/region-build-backups"
NORM_BASELINE="$BACKUP_DIR/CORE_C3B1_TYPECHECK_BASELINE_NORMALIZED_2026-07-31.txt"
EXPECTED_NORM_SHA="0e655d750f81e673d092bb6d1b45614bef1e371df6c756511f3bb5a4a391f914"

APPROVED_PATHS=(
  "artifacts/api-server/src/app.ts"
  "artifacts/api-server/src/test/integration/rbg-app-mount.integration.test.ts"
  "scripts/verify-c3b2.sh"
)

# All files that must not have drifted from the C3b-1 baseline SHA
PROTECTED_FILES=(
  "artifacts/api-server/src/index.ts"
  "artifacts/api-server/src/routes/index.ts"
  "artifacts/api-server/src/lib/rbg-runtime-binding.ts"
  "artifacts/api-server/src/lib/rbg-runtime-adapter.ts"
  "artifacts/api-server/src/test/unit/rbg-runtime-binding.test.ts"
  "scripts/verify-c3b1.sh"
  "artifacts/api-server/src/lib/intake-feature-classifier.ts"
  "artifacts/api-server/src/lib/rbg-core-intake-secrets.ts"
  "artifacts/api-server/src/lib/integration-secret-store.ts"
  "artifacts/api-server/src/composition/internal-rbg.composition.ts"
  "artifacts/api-server/src/repositories/integration-client.repository.ts"
  "artifacts/api-server/src/repositories/regional-intake.repository.ts"
  "artifacts/api-server/src/test/unit/integration-client.repository.test.ts"
  "artifacts/api-server/src/test/unit/rbg-core-intake-secrets.test.ts"
  "artifacts/api-server/src/test/unit/internal-rbg.composition.test.ts"
  "artifacts/api-server/package.json"
  "artifacts/api-server/src/services/regional-staff-notifier.impl.ts"
  "artifacts/api-server/src/routes/internal-rbg-router.ts"
  "artifacts/api-server/src/routes/regional-intake-handler.ts"
  "artifacts/api-server/src/services/regional-intake.service.ts"
)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "======================================================================"
echo "  C3b-2 VERIFIER  —  baseline $C3B1_SHA"
echo "======================================================================"
echo ""

# ── Step 1: Branch = main ─────────────────────────────────────────────────────

branch=$(git branch --show-current)
[[ "$branch" == "main" ]] || fail "Step 1: branch is '$branch', expected 'main'"
pass "Step 1: branch = main"

# ── Step 2: HEAD = C3b-1 baseline ────────────────────────────────────────────

head_sha=$(git rev-parse HEAD)
[[ "$head_sha" == "$C3B1_SHA" ]] \
  || fail "Step 2: HEAD $head_sha != C3b-1 baseline $C3B1_SHA"
pass "Step 2: HEAD = $C3B1_SHA (C3b-1)"

# ── Step 3: origin/main = C3a baseline (C3b-1 is local only) ─────────────────

origin_sha=$(git rev-parse origin/main)
[[ "$origin_sha" == "$C3A_SHA" ]] \
  || fail "Step 3: origin/main $origin_sha != C3a baseline $C3A_SHA"
pass "Step 3: origin/main = $C3A_SHA (C3a; C3b-1 not yet pushed)"

# ── Step 4: HEAD not behind origin ───────────────────────────────────────────

read -r behind _ < <(git rev-list --left-right --count origin/main...HEAD)
[[ "$behind" -eq 0 ]] || fail "Step 4: HEAD is $behind commits behind origin/main"
pass "Step 4: HEAD not behind origin (0)"

# ── Step 5: No active .git/index.lock ────────────────────────────────────────

[[ ! -f ".git/index.lock" ]] || fail "Step 5: .git/index.lock exists — Git operation in progress"
pass "Step 5: no .git/index.lock"

# ── Step 6: Exact scope = 3 approved paths ───────────────────────────────────

all_changed=$(GIT_OPTIONAL_LOCKS=0 git status --porcelain --untracked-files=all \
  | awk '{print $NF}' | sort)

expected_union=$(printf '%s\n' "${APPROVED_PATHS[@]}" | sort)

if [[ "$all_changed" != "$expected_union" ]]; then
  fail "Step 6: scope mismatch.
Expected:
$expected_union
Got:
$all_changed"
fi
pass "Step 6: scope = exactly 3 C3b-2 approved paths"

# ── Step 7: No .agents path in scope ─────────────────────────────────────────

if echo "$all_changed" | grep -q '\.agents'; then
  fail "Step 7: .agents path present in scope"
fi
pass "Step 7: no .agents path in scope"

# ── Step 8: Protected files zero drift from C3b-1 baseline ───────────────────

for f in "${PROTECTED_FILES[@]}"; do
  drift=$(GIT_OPTIONAL_LOCKS=0 git diff "$C3B1_SHA" -- "$f")
  [[ -z "$drift" ]] || fail "Step 8: protected file drifted: $f"
done
pass "Step 8: all protected files zero drift from C3b-1 baseline"

# ── Step 9: app.ts diff contains all 4 approved additions ─────────────────────

appts_diff=$(GIT_OPTIONAL_LOCKS=0 git diff "$C3B1_SHA" -- artifacts/api-server/src/app.ts)

echo "$appts_diff" | grep -q '+import { buildDefaultRbgRuntimeSources }' \
  || fail "Step 9: app.ts diff missing buildDefaultRbgRuntimeSources import"
echo "$appts_diff" | grep -q '+import { bindRbgRuntime }' \
  || fail "Step 9: app.ts diff missing bindRbgRuntime import"
echo "$appts_diff" | grep -q '+const rbgBinding = bindRbgRuntime(' \
  || fail "Step 9: app.ts diff missing binding call"
echo "$appts_diff" | grep -q '+if (rbgBinding.router !== null)' \
  || fail "Step 9: app.ts diff missing conditional mount guard"
echo "$appts_diff" | grep -q '+    "/api/internal/regional-brands/bookings"' \
  || fail "Step 9: app.ts diff missing literal mount path"
pass "Step 9: app.ts diff contains all 4 approved additions"

# ── Step 10: Conditional mount appears before express.json() in app.ts ────────

mount_line=$(grep -n 'if (rbgBinding.router !== null)' \
  artifacts/api-server/src/app.ts | head -1 | cut -d: -f1)
json_line=$(grep -n 'app\.use(express\.json())' \
  artifacts/api-server/src/app.ts | head -1 | cut -d: -f1)

[[ -n "$mount_line" ]] || fail "Step 10: conditional mount not found in app.ts"
[[ -n "$json_line"  ]] || fail "Step 10: app.use(express.json()) not found in app.ts"
[[ "$mount_line" -lt "$json_line" ]] \
  || fail "Step 10: mount (line $mount_line) must precede express.json() (line $json_line)"
pass "Step 10: conditional mount (line $mount_line) precedes express.json() (line $json_line)"

# ── Step 11: No RBG env reads in app.ts additions ─────────────────────────────

# Strip comment lines from diff additions then check for RBG env reads.
added_lines=$(echo "$appts_diff" | grep '^+' | grep -v '^+++' | sed 's|//.*||g')
if echo "$added_lines" | grep -qE 'process\.env\["RBG|process\.env\['"'"'RBG'; then
  fail "Step 11: app.ts additions contain RBG env read (must live in adapter, not app.ts)"
fi
pass "Step 11: no RBG env reads in app.ts additions"

# ── Step 12: No custom disabled handler in app.ts diff ────────────────────────

# The conditional mount must have no else branch and no 404/error fallback.
if echo "$added_lines" | grep -qE '^\+\s*else\s*\{'; then
  fail "Step 12: app.ts additions contain an else branch (custom disabled handler)"
fi
pass "Step 12: no custom disabled handler in app.ts additions"

# ── Step 13: routes/index.ts has no RBG symbols ───────────────────────────────

routes_stripped=$(sed 's|//.*||g' artifacts/api-server/src/routes/index.ts)
if echo "$routes_stripped" | grep -qE \
  'rbg-runtime-adapter|rbg-runtime-binding|bindRbgRuntime|buildDefaultRbgRuntimeSources'; then
  fail "Step 13: routes/index.ts contains RBG symbol (must be isolated)"
fi
pass "Step 13: routes/index.ts has no RBG imports or symbols"

# ── Step 14: Python whitespace / final-newline scan ──────────────────────────

python3 - <<'PYEOF' || fail "Step 14: whitespace / final-newline check failed"
import sys

files = [
  "artifacts/api-server/src/app.ts",
  "artifacts/api-server/src/test/integration/rbg-app-mount.integration.test.ts",
  "scripts/verify-c3b2.sh",
]

errors = []
for fpath in files:
  try:
    with open(fpath, "rb") as f:
      content = f.read()
    if not content:
      errors.append(f"{fpath}: empty file")
      continue
    if not content.endswith(b"\n"):
      errors.append(f"{fpath}: missing final newline")
    for i, raw_line in enumerate(content.split(b"\n"), 1):
      if raw_line != raw_line.rstrip(b" \t\r"):
        errors.append(f"{fpath}:{i}: trailing whitespace")
  except Exception as e:
    errors.append(f"{fpath}: read error: {e}")

if errors:
  for e in errors:
    print(f"WHITESPACE_ERROR: {e}", file=sys.stderr)
  sys.exit(1)

print("WHITESPACE_OK: all 3 files pass")
PYEOF

pass "Step 14: whitespace / final-newline scan — all 3 files clean"

# ── Step 15: git diff --check ─────────────────────────────────────────────────

GIT_OPTIONAL_LOCKS=0 git diff --check "$C3B1_SHA" -- . \
  || fail "Step 15: git diff --check found whitespace errors in tracked diff"
pass "Step 15: git diff --check clean"

# ── Step 16: Normalized baseline present and hash verified ────────────────────

[[ -f "$NORM_BASELINE" && -s "$NORM_BASELINE" ]] \
  || fail "Step 16: normalized baseline missing or empty: $NORM_BASELINE"

actual_norm=$(sha256sum "$NORM_BASELINE" | awk '{print $1}')
[[ "$actual_norm" == "$EXPECTED_NORM_SHA" ]] \
  || fail "Step 16: normalized baseline SHA mismatch: $actual_norm"
pass "Step 16: normalized baseline present; hash verified"

# ── Step 17: Typecheck no-regression ──────────────────────────────────────────

info "Step 17: Running post-Build typecheck..."
cd artifacts/api-server
pnpm run typecheck > /tmp/c3b2_tc_raw.txt 2>&1 || true
cd "$REPO_ROOT"

python3 - <<'PYEOF' || fail "Step 17: post-Build typecheck normalization failed"
import re

with open("/tmp/c3b2_tc_raw.txt") as f:
  content = f.read()

diag_re = re.compile(r"^(src/[^\s(]+\.ts)\((\d+),(\d+)\): error (TS\d+): (.+)$")
diags = []
for line in content.splitlines():
  m = diag_re.match(line.rstrip())
  if m:
    diags.append((m.group(1), int(m.group(2)), int(m.group(3)), m.group(4), m.group(5).strip()))

diags.sort(key=lambda d: (d[0], d[1], d[2], d[3]))
norm_lines = [f"{d[0]}({d[1]},{d[2]}): {d[3]}: {d[4]}" for d in diags]

with open("/tmp/c3b2_tc_normalized.txt", "w") as f:
  f.write("\n".join(norm_lines) + "\n")

print(f"POST_BUILD_DIAG_COUNT: {len(diags)}")
PYEOF

if ! diff "$NORM_BASELINE" /tmp/c3b2_tc_normalized.txt > /tmp/c3b2_tc_diff.txt 2>&1; then
  fail "Step 17: post-Build diagnostics differ from locked baseline:
$(cat /tmp/c3b2_tc_diff.txt)"
fi
pass "Step 17: typecheck normalized == locked baseline (11 diagnostics, exact)"

# ── Step 18: No C3b-2 file in typecheck diagnostics ──────────────────────────

for stem in "rbg-app-mount.integration.test.ts" "verify-c3b2.sh"; do
  if grep -q "$stem" /tmp/c3b2_tc_raw.txt; then
    fail "Step 18: C3b-2 file '$stem' appears in typecheck diagnostics"
  fi
done
pass "Step 18: no C3b-2 file in typecheck diagnostics"

# ── Step 19: Production build exits 0 ────────────────────────────────────────

info "Step 19: Running production build..."
cd artifacts/api-server
pnpm run build || fail "Step 19: production build failed (non-zero exit)"
cd "$REPO_ROOT"
pass "Step 19: production build exits 0"

# ── Step 20: RBG_TEST_DATABASE_URL is set ────────────────────────────────────

[[ -n "${RBG_TEST_DATABASE_URL:-}" ]] \
  || fail "Step 20: RBG_TEST_DATABASE_URL must be set to run C3b-2 integration tests"
pass "Step 20: RBG_TEST_DATABASE_URL is set"

# ── Step 21: C3b-2 integration tests 24/24 ───────────────────────────────────

info "Step 21: Running C3b-2 integration tests (expected: 24 pass, 0 fail)..."
cd artifacts/api-server
c3b2_out=$(node --import tsx --test \
  src/test/integration/rbg-app-mount.integration.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c3b2_pass=$(echo "$c3b2_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c3b2_fail=$(echo "$c3b2_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c3b2_pass" == "24" ]] \
  || fail "Step 21: C3b-2 integration pass=$c3b2_pass, expected 24
Output:
$c3b2_out"
[[ "$c3b2_fail" == "0" ]] \
  || fail "Step 21: C3b-2 integration fail=$c3b2_fail, expected 0
Output:
$c3b2_out"
pass "Step 21: C3b-2 integration tests 24/24"

# ── Step 22: C3b-1 unit regression 25/25 ─────────────────────────────────────

info "Step 22: Running C3b-1 unit regression (expected: 25 pass, 0 fail)..."
cd artifacts/api-server
c3b1_out=$(node --import tsx --test \
  src/test/unit/rbg-runtime-binding.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c3b1_pass=$(echo "$c3b1_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c3b1_fail=$(echo "$c3b1_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c3b1_pass" == "25" ]] \
  || fail "Step 22: C3b-1 unit pass=$c3b1_pass, expected 25
Output:
$c3b1_out"
[[ "$c3b1_fail" == "0"  ]] \
  || fail "Step 22: C3b-1 unit fail=$c3b1_fail, expected 0"
pass "Step 22: C3b-1 unit regression 25/25"

# ── Step 23: C3a unit regression 36/36 ───────────────────────────────────────

info "Step 23: Running C3a unit regression (expected: 36 pass, 0 fail)..."
cd artifacts/api-server
c3a_out=$(node --import tsx --test \
  src/test/unit/integration-client.repository.test.ts \
  src/test/unit/rbg-core-intake-secrets.test.ts \
  src/test/unit/internal-rbg.composition.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c3a_pass=$(echo "$c3a_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c3a_fail=$(echo "$c3a_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c3a_pass" == "36" ]] || fail "Step 23: C3a unit pass=$c3a_pass, expected 36"
[[ "$c3a_fail" == "0"  ]] || fail "Step 23: C3a unit fail=$c3a_fail, expected 0"
pass "Step 23: C3a unit regression 36/36"

# ── Step 24: General unit regression 224/224 ─────────────────────────────────

info "Step 24: Running general unit regression (expected: 224 pass, 0 fail)..."
cd artifacts/api-server
gen_out=$(pnpm run test:unit 2>&1 || true)
cd "$REPO_ROOT"

gen_pass=$(echo "$gen_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
gen_fail=$(echo "$gen_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$gen_pass" == "224" ]] || fail "Step 24: general unit pass=$gen_pass, expected 224"
[[ "$gen_fail" == "0"   ]] || fail "Step 24: general unit fail=$gen_fail, expected 0"
pass "Step 24: general unit regression 224/224"

# ── Step 25: Integration test uses no production DATABASE_URL ─────────────────

test_file="artifacts/api-server/src/test/integration/rbg-app-mount.integration.test.ts"
# Remove line comments before checking
test_stripped=$(sed 's|//.*||g' "$test_file")
# The test must reference only RBG_TEST_DATABASE_URL, not a bare DATABASE_URL literal
if echo "$test_stripped" | grep -qE \
  "process\.env\[.DATABASE_URL.\]" ; then
  # Allowed: only if the reference is guarded — check it's RBG_TEST_DATABASE_URL
  if echo "$test_stripped" | grep -v 'RBG_TEST_DATABASE_URL' | \
     grep -qE "process\.env\[.DATABASE_URL.\]"; then
    fail "Step 25: integration test reads bare DATABASE_URL (must use RBG_TEST_DATABASE_URL)"
  fi
fi
pass "Step 25: integration test references only RBG_TEST_DATABASE_URL"

# ── Step 26: No Resend construction in C3b-2 files ───────────────────────────

for c3b2_src in \
  "artifacts/api-server/src/app.ts" \
  "artifacts/api-server/src/test/integration/rbg-app-mount.integration.test.ts"
do
  stripped=$(sed 's|//.*||g' "$c3b2_src" | python3 -c "
import sys, re
src = sys.stdin.read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.DOTALL)
print(src)
")
  if echo "$stripped" | grep -qE 'new\s+Resend\s*\('; then
    fail "Step 26: 'new Resend(' found in $c3b2_src"
  fi
done
pass "Step 26: no Resend construction in C3b-2 source files"

# ── Final summary ─────────────────────────────────────────────────────────────

echo ""
echo "======================================================================"
echo "  C3b-2 VERIFIER COMPLETE — all 26 steps passed"
echo "======================================================================"
echo ""
