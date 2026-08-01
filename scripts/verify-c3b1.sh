#!/usr/bin/env bash
# verify-c3b1.sh
#
# C3b-1 Build Candidate Verifier
#
# Baseline:   2c8bc0ade221ca8f33506d4f727e63c0c2545729
# Exit codes: 0 = all 26 steps passed; 1 = a step failed (reason printed to stderr)
#
# Use GIT_OPTIONAL_LOCKS=0 for all git commands that may attempt optional index
# locking (status, diff, ls-files). This is required in the Replit workspace shell.

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────

NC='\033[0m'; GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[0;33m'

pass() { printf "${GRN}[PASS]${NC} %s\n"  "$1"; }
fail() { printf "${RED}[FAIL]${NC} %s\n"  "$1" >&2; exit 1; }
info() { printf "${YEL}[INFO]${NC} %s\n"  "$1"; }

# ── Constants ─────────────────────────────────────────────────────────────────

BASELINE_SHA="2c8bc0ade221ca8f33506d4f727e63c0c2545729"
BACKUP_DIR="/home/runner/region-build-backups"
RAW_BASELINE="$BACKUP_DIR/CORE_C3B1_TYPECHECK_BASELINE_RAW_2026-07-31.txt"
NORM_BASELINE="$BACKUP_DIR/CORE_C3B1_TYPECHECK_BASELINE_NORMALIZED_2026-07-31.txt"
EXPECTED_RAW_SHA="2a46bf2856b96fe5344ea266c2d97e30c495a6264869c40ce6bf806c15edd4b7"
EXPECTED_NORM_SHA="0e655d750f81e673d092bb6d1b45614bef1e371df6c756511f3bb5a4a391f914"

APPROVED_PATHS=(
  "artifacts/api-server/src/lib/rbg-runtime-binding.ts"
  "artifacts/api-server/src/lib/rbg-runtime-adapter.ts"
  "artifacts/api-server/src/test/unit/rbg-runtime-binding.test.ts"
  "scripts/verify-c3b1.sh"
)

PROTECTED_FILES=(
  "artifacts/api-server/src/app.ts"
  "artifacts/api-server/src/index.ts"
  "artifacts/api-server/src/routes/index.ts"
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
echo "  C3b-1 VERIFIER  —  baseline $BASELINE_SHA"
echo "======================================================================"
echo ""

# ── Step 1: Branch = main ─────────────────────────────────────────────────────

branch=$(git branch --show-current)
[[ "$branch" == "main" ]] || fail "Step 1: branch is '$branch', expected 'main'"
pass "Step 1: branch = main"

# ── Step 2: HEAD = baseline SHA ───────────────────────────────────────────────

head_sha=$(git rev-parse HEAD)
[[ "$head_sha" == "$BASELINE_SHA" ]] \
  || fail "Step 2: HEAD $head_sha != baseline $BASELINE_SHA"
pass "Step 2: HEAD = $BASELINE_SHA"

# ── Step 3: origin/main = baseline SHA ───────────────────────────────────────

origin_sha=$(git rev-parse origin/main)
[[ "$origin_sha" == "$BASELINE_SHA" ]] \
  || fail "Step 3: origin/main $origin_sha != baseline $BASELINE_SHA"
pass "Step 3: origin/main = $BASELINE_SHA"

# ── Step 4: HEAD not behind origin ───────────────────────────────────────────

read -r behind _ < <(git rev-list --left-right --count origin/main...HEAD)
[[ "$behind" -eq 0 ]] || fail "Step 4: HEAD is $behind commits behind origin/main"
pass "Step 4: HEAD not behind origin (0)"

# ── Step 5: No active .git/index.lock ────────────────────────────────────────

[[ ! -f ".git/index.lock" ]] || fail "Step 5: .git/index.lock exists — Git operation in progress"
pass "Step 5: no .git/index.lock"

# ── Step 6: Exact phase scope union = 4 approved paths ───────────────────────

# porcelain --untracked-files=all gives all modified tracked + all untracked new files.
# Extract just the path field (last column); sort for deterministic comparison.
all_changed=$(GIT_OPTIONAL_LOCKS=0 git status --porcelain --untracked-files=all \
  | awk '{print $NF}' | sort)

expected_union=$(printf '%s\n' "${APPROVED_PATHS[@]}" | sort)

if [[ "$all_changed" != "$expected_union" ]]; then
  fail "Step 6: scope union mismatch.
Expected:
$expected_union
Got:
$all_changed"
fi
pass "Step 6: scope union = exactly 4 approved C3b-1 paths"

# ── Step 7: No .agents exclusion or hidden path filtering ─────────────────────

if echo "$all_changed" | grep -q '\.agents'; then
  fail "Step 7: .agents path present in scope — hidden filtering detected"
fi
pass "Step 7: no .agents path in scope"

# ── Step 8: Protected files zero drift from baseline ─────────────────────────

for f in "${PROTECTED_FILES[@]}"; do
  drift=$(GIT_OPTIONAL_LOCKS=0 git diff "$BASELINE_SHA" -- "$f")
  [[ -z "$drift" ]] || fail "Step 8: protected file changed from baseline: $f"
done
pass "Step 8: all protected files = zero drift from baseline"

# ── Step 9: Runtime entry files contain no C3b-1 imports or symbols ──────────

for entry in \
  "artifacts/api-server/src/app.ts" \
  "artifacts/api-server/src/index.ts" \
  "artifacts/api-server/src/routes/index.ts"
do
  # Strip line comments before grep
  stripped=$(sed 's|//.*||g' "$entry")
  if echo "$stripped" | grep -qE \
    'rbg-runtime-binding|rbg-runtime-adapter|bindRbgRuntime|buildDefaultRbgRuntimeSources'
  then
    fail "Step 9: C3b-1 symbol found in runtime entry: $entry"
  fi
done
pass "Step 9: app.ts / index.ts / routes/index.ts — no C3b-1 imports or symbols"

# ── Step 10: Pure binder purity restrictions ──────────────────────────────────

binder="artifacts/api-server/src/lib/rbg-runtime-binding.ts"

# Strip line comments; strip block comments; then grep for forbidden patterns.
stripped_binder=$(sed 's|//.*||g' "$binder" | python3 -c "
import sys, re
src = sys.stdin.read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.DOTALL)
print(src)
")

forbidden_binder=(
  'process\.env'
  'console\.'
  "from ['\"]@workspace/db['\"]"
  'regional-staff-notifier\.impl'
  'from.*resend'
  'buildInternalRbgComposition'
)

for pat in "${forbidden_binder[@]}"; do
  if echo "$stripped_binder" | grep -qE "$pat"; then
    fail "Step 10: forbidden pattern '$pat' found in pure binder (comment-stripped)"
  fi
done
pass "Step 10: pure binder passes all purity restrictions"

# ── Step 11: Adapter — no forbidden module-scope invocation ──────────────────

python3 - <<'PYEOF' || fail "Step 11: adapter has forbidden module-scope invocation"
import sys, re

adapter_path = "artifacts/api-server/src/lib/rbg-runtime-adapter.ts"

with open(adapter_path) as f:
    source = f.read()

# Remove line comments
source_nc = re.sub(r'//[^\n]*', '', source)
# Remove block comments
source_nc = re.sub(r'/\*.*?\*/', '', source_nc, flags=re.DOTALL)

lines = source_nc.splitlines()

# Patterns forbidden at module scope (depth == 0 when the line begins)
forbidden_patterns = [
    r'bindRbgRuntime\s*\(',
    r'app\.use\s*\(',
    r'\.transaction\s*\(',
    r'notifier\.notify\s*\(',
    r'new\s+Resend\s*\(',
    r'\.send\s*\(',
]

depth = 0
errors = []
for i, line in enumerate(lines, 1):
    stripped = line.strip()
    if depth == 0 and stripped:
        for pat in forbidden_patterns:
            if re.search(pat, line):
                errors.append(f"line {i}: {stripped[:100]}")
    depth += line.count('{') - line.count('}')
    if depth < 0:
        depth = 0

if errors:
    for e in errors:
        print(f"FORBIDDEN_MODULE_SCOPE: {e}", file=sys.stderr)
    sys.exit(1)

print("ADAPTER_SCOPE_OK")
PYEOF

pass "Step 11: adapter — no forbidden module-scope invocation"

# ── Step 12: Unit test does not import the adapter ────────────────────────────

test_file="artifacts/api-server/src/test/unit/rbg-runtime-binding.test.ts"

# Strip line and block comments before checking — prevents false positives from
# documentation comments that mention the adapter name.
stripped_test=$(sed 's|//.*||g' "$test_file" | python3 -c "
import sys, re
src = sys.stdin.read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.DOTALL)
print(src)
")
if echo "$stripped_test" | grep -q 'rbg-runtime-adapter'; then
  fail "Step 12: unit test imports rbg-runtime-adapter (comment-stripped)"
fi
pass "Step 12: unit test does not import the adapter"

# ── Step 13: Python whitespace / final-newline scan ──────────────────────────
# Python scan is the authority for untracked files; git diff --check (step 14)
# does not examine untracked files.

python3 - <<'PYEOF' || fail "Step 13: whitespace / final-newline check failed"
import sys

files = [
    "artifacts/api-server/src/lib/rbg-runtime-binding.ts",
    "artifacts/api-server/src/lib/rbg-runtime-adapter.ts",
    "artifacts/api-server/src/test/unit/rbg-runtime-binding.test.ts",
    "scripts/verify-c3b1.sh",
]

errors = []
for path in files:
    try:
        with open(path, 'rb') as f:
            content = f.read()
        if not content:
            errors.append(f"{path}: empty file")
            continue
        if not content.endswith(b'\n'):
            errors.append(f"{path}: missing final newline")
        for i, raw_line in enumerate(content.split(b'\n'), 1):
            if raw_line != raw_line.rstrip(b' \t\r'):
                errors.append(f"{path}:{i}: trailing whitespace")
    except Exception as e:
        errors.append(f"{path}: cannot read: {e}")

if errors:
    for e in errors:
        print(f"WHITESPACE_ERROR: {e}", file=sys.stderr)
    sys.exit(1)

print("WHITESPACE_OK: all 4 files pass")
PYEOF

pass "Step 13: Python whitespace / final-newline scan — all 4 files clean"

# ── Step 14: git diff --check (tracked diff complement) ──────────────────────
# Complements step 13; covers tracked file whitespace in the diff.
# Untracked files are covered by the Python scan above.

GIT_OPTIONAL_LOCKS=0 git diff --check "$BASELINE_SHA" -- . \
  || fail "Step 14: git diff --check found whitespace errors in tracked diff"
pass "Step 14: git diff --check clean"

# ── Step 15: Baseline files exist and match locked hashes ────────────────────

[[ -f "$RAW_BASELINE"  && -s "$RAW_BASELINE"  ]] \
  || fail "Step 15: RAW baseline file missing or empty: $RAW_BASELINE"
[[ -f "$NORM_BASELINE" && -s "$NORM_BASELINE" ]] \
  || fail "Step 15: NORMALIZED baseline file missing or empty: $NORM_BASELINE"

actual_raw_sha=$(sha256sum  "$RAW_BASELINE"  | awk '{print $1}')
actual_norm_sha=$(sha256sum "$NORM_BASELINE" | awk '{print $1}')

[[ "$actual_raw_sha"  == "$EXPECTED_RAW_SHA"  ]] \
  || fail "Step 15: RAW baseline SHA mismatch: $actual_raw_sha"
[[ "$actual_norm_sha" == "$EXPECTED_NORM_SHA" ]] \
  || fail "Step 15: NORMALIZED baseline SHA mismatch: $actual_norm_sha"

pass "Step 15: baseline files present; hashes verified"

# ── Step 16: Baseline normalized file contains exactly 11 diagnostics ─────────

norm_count=$(wc -l < "$NORM_BASELINE")
[[ "$norm_count" -eq 11 ]] \
  || fail "Step 16: normalized baseline has $norm_count lines, expected 11"
pass "Step 16: normalized baseline = 11 diagnostics"

# ── Steps 17–19: Typecheck no-regression ──────────────────────────────────────

info "Step 17: Running post-Build typecheck (baseline exit code was 2; regression check only)..."

cd artifacts/api-server
pnpm run typecheck > /tmp/c3b1_tc_postbuild_raw.txt 2>&1 || true
cd "$REPO_ROOT"

# Step 17: Normalize post-Build diagnostics with the same deterministic parser.
python3 - <<'PYEOF' || fail "Step 17: post-Build typecheck normalization failed"
import re, sys

with open("/tmp/c3b1_tc_postbuild_raw.txt") as f:
    content = f.read()

diag_re = re.compile(r'^(src/[^\s(]+\.ts)\((\d+),(\d+)\): error (TS\d+): (.+)$')

diags = []
for line in content.splitlines():
    m = diag_re.match(line.rstrip())
    if m:
        path = m.group(1)
        ln   = int(m.group(2))
        col  = int(m.group(3))
        code = m.group(4)
        msg  = m.group(5).strip()
        diags.append((path, ln, col, code, msg))

diags.sort(key=lambda d: (d[0], d[1], d[2], d[3]))
norm_lines = [f"{d[0]}({d[1]},{d[2]}): {d[3]}: {d[4]}" for d in diags]

with open("/tmp/c3b1_tc_postbuild_normalized.txt", "w") as f:
    f.write("\n".join(norm_lines) + "\n")

print(f"POST_BUILD_DIAG_COUNT: {len(diags)}")
PYEOF

pass "Step 17: post-Build typecheck normalized"

# Step 18: Exact diagnostic equality vs locked baseline.
if ! diff "$NORM_BASELINE" /tmp/c3b1_tc_postbuild_normalized.txt > /tmp/c3b1_tc_diff.txt 2>&1; then
  fail "Step 18: post-Build diagnostics differ from locked baseline:
$(cat /tmp/c3b1_tc_diff.txt)"
fi
pass "Step 18: post-Build normalized diagnostics = locked baseline (exact)"

# Step 19: No C3b-1 file appears in TypeScript diagnostics.
for c3b1_stem in \
  "rbg-runtime-binding.ts" \
  "rbg-runtime-adapter.ts" \
  "rbg-runtime-binding.test.ts" \
  "verify-c3b1.sh"
do
  if grep -q "$c3b1_stem" /tmp/c3b1_tc_postbuild_raw.txt; then
    fail "Step 19: C3b-1 file '$c3b1_stem' appears in post-Build typecheck diagnostics"
  fi
done
pass "Step 19: no C3b-1 file in typecheck diagnostics"

# ── Step 20: Production build exits 0 ────────────────────────────────────────

info "Step 20: Running production build..."
cd artifacts/api-server
pnpm run build || fail "Step 20: production build failed (non-zero exit)"
cd "$REPO_ROOT"
pass "Step 20: production build exits 0"

# ── Step 21: C3b-1 unit tests 25/25 ──────────────────────────────────────────

info "Step 21: Running C3b-1 unit tests (expected: 25 pass, 0 fail)..."
cd artifacts/api-server
c3b1_out=$(node --import tsx --test \
  src/test/unit/rbg-runtime-binding.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c3b1_pass=$(echo "$c3b1_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c3b1_fail=$(echo "$c3b1_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c3b1_pass" == "25" ]] \
  || fail "Step 21: C3b-1 unit pass=$c3b1_pass, expected 25
Output:
$c3b1_out"
[[ "$c3b1_fail" == "0" ]] \
  || fail "Step 21: C3b-1 unit fail=$c3b1_fail, expected 0
Output:
$c3b1_out"
pass "Step 21: C3b-1 unit tests 25/25"

# ── Step 22: C3a unit regression 36/36 ───────────────────────────────────────

info "Step 22: Running C3a unit regression (expected: 36 pass, 0 fail)..."
cd artifacts/api-server
c3a_out=$(node --import tsx --test \
  src/test/unit/integration-client.repository.test.ts \
  src/test/unit/rbg-core-intake-secrets.test.ts \
  src/test/unit/internal-rbg.composition.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c3a_pass=$(echo "$c3a_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c3a_fail=$(echo "$c3a_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c3a_pass" == "36" ]] || fail "Step 22: C3a unit pass=$c3a_pass, expected 36"
[[ "$c3a_fail" == "0"  ]] || fail "Step 22: C3a unit fail=$c3a_fail, expected 0"
pass "Step 22: C3a unit regression 36/36"

# ── Step 23: General unit regression 224/224 ─────────────────────────────────

info "Step 23: Running general unit regression (expected: 224 pass, 0 fail)..."
cd artifacts/api-server
gen_out=$(pnpm run test:unit 2>&1 || true)
cd "$REPO_ROOT"

gen_pass=$(echo "$gen_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
gen_fail=$(echo "$gen_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$gen_pass" == "224" ]] || fail "Step 23: general unit pass=$gen_pass, expected 224"
[[ "$gen_fail" == "0"   ]] || fail "Step 23: general unit fail=$gen_fail, expected 0"
pass "Step 23: general unit regression 224/224"

# ── Step 24: No production DB fallback in pure binder ────────────────────────

# Strip type-only import lines then check for any runtime @workspace/db import.
binder_no_type=$(grep -v '^\s*import type ' \
  artifacts/api-server/src/lib/rbg-runtime-binding.ts | sed 's|//.*||g')
if echo "$binder_no_type" | grep -qE "from ['\"]@workspace/db['\"]"; then
  fail "Step 24: pure binder has a runtime @workspace/db import"
fi
pass "Step 24: no production DB fallback in pure binder"

# ── Step 25: No live email or Resend call ─────────────────────────────────────

for c3b1_src in \
  "artifacts/api-server/src/lib/rbg-runtime-binding.ts" \
  "artifacts/api-server/src/lib/rbg-runtime-adapter.ts"
do
  stripped_src=$(sed 's|//.*||g' "$c3b1_src" | python3 -c "
import sys, re
src = sys.stdin.read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.DOTALL)
print(src)
")
  if echo "$stripped_src" | grep -qE 'new\s+Resend\s*\('; then
    fail "Step 25: 'new Resend(' found in $c3b1_src"
  fi
done
pass "Step 25: no Resend construction in C3b-1 source files"

# ── Step 26: Zero runtime reachability ───────────────────────────────────────

for entry in \
  "artifacts/api-server/src/app.ts" \
  "artifacts/api-server/src/index.ts" \
  "artifacts/api-server/src/routes/index.ts"
do
  entry_stripped=$(sed 's|//.*||g' "$entry")
  if echo "$entry_stripped" | grep -qE \
    'rbg-runtime-binding|rbg-runtime-adapter|bindRbgRuntime|buildDefaultRbgRuntimeSources'
  then
    fail "Step 26: C3b-1 symbol found in runtime entry '$entry' — zero reachability violated"
  fi
done
pass "Step 26: zero runtime reachability confirmed — no entry imports C3b-1 symbols"

# ── Final summary ─────────────────────────────────────────────────────────────

echo ""
echo "======================================================================"
echo "  C3b-1 VERIFIER COMPLETE — all 26 steps passed"
echo "======================================================================"
echo ""
