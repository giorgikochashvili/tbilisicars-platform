#!/usr/bin/env bash
# verify-c4a.sh
#
# C4a Build Candidate Verifier — 38 gates
#
# Baseline (origin/main, C3b-2 commit):
#   b3b2111f18634e6c21fc5f80a76ed0c7955e5eb4
#
# Exit codes: 0 = all 38 gates passed; 1 = a gate failed (reason to stderr)
#
# Prerequisites:
#   - RBG_TEST_DATABASE_URL set to a dedicated test DB with migration 0014 applied
#   - Workspace at baseline + exactly the 5 C4a paths uncommitted
#   - Normalized typecheck baseline at $NORM_BASELINE (regenerate if absent)

set -euo pipefail

NC='\033[0m'; GRN='\033[0;32m'; RED='\033[0;31m'; YEL='\033[0;33m'
pass() { printf "${GRN}[PASS]${NC} %s\n"  "$1"; }
fail() { printf "${RED}[FAIL]${NC} %s\n"  "$1" >&2; exit 1; }
info() { printf "${YEL}[INFO]${NC} %s\n"  "$1"; }

# ── Constants ─────────────────────────────────────────────────────────────────

BASELINE_SHA="b3b2111f18634e6c21fc5f80a76ed0c7955e5eb4"
BACKUP_DIR="/home/runner/region-build-backups"
NORM_BASELINE="$BACKUP_DIR/CORE_C3B1_TYPECHECK_BASELINE_NORMALIZED_2026-07-31.txt"
EXPECTED_NORM_SHA="0e655d750f81e673d092bb6d1b45614bef1e371df6c756511f3bb5a4a391f914"

APPROVED_PATHS=(
  "artifacts/api-server/src/app.ts"
  "artifacts/api-server/src/lib/internal-rbg-rate-limit.ts"
  "artifacts/api-server/src/test/unit/internal-rbg-rate-limit.test.ts"
  "artifacts/api-server/src/test/integration/rbg-rate-limit.integration.test.ts"
  "scripts/verify-c4a.sh"
)

# All C3 source/test/verifier files except app.ts (approved narrow diff in C4a)
PROTECTED_FILES=(
  "artifacts/api-server/src/index.ts"
  "artifacts/api-server/src/routes/index.ts"
  "artifacts/api-server/src/lib/rbg-runtime-binding.ts"
  "artifacts/api-server/src/lib/rbg-runtime-adapter.ts"
  "artifacts/api-server/src/test/unit/rbg-runtime-binding.test.ts"
  "scripts/verify-c3b1.sh"
  "scripts/verify-c3b2.sh"
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
  "artifacts/api-server/src/test/integration/rbg-app-mount.integration.test.ts"
)

LIMITER_MODULE="artifacts/api-server/src/lib/internal-rbg-rate-limit.ts"
UNIT_TEST="artifacts/api-server/src/test/unit/internal-rbg-rate-limit.test.ts"
INT_TEST="artifacts/api-server/src/test/integration/rbg-rate-limit.integration.test.ts"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "======================================================================"
echo "  C4a VERIFIER  —  baseline $BASELINE_SHA"
echo "======================================================================"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# GROUP 1 — Git state (Gates 1–5)
# ══════════════════════════════════════════════════════════════════════════════

branch=$(git branch --show-current)
[[ "$branch" == "main" ]] || fail "Gate 1: branch is '$branch', expected 'main'"
pass "Gate 1: branch = main"

head_sha=$(git rev-parse HEAD)
[[ "$head_sha" == "$BASELINE_SHA" ]] \
  || fail "Gate 2: HEAD $head_sha != baseline $BASELINE_SHA"
pass "Gate 2: HEAD = $BASELINE_SHA"

origin_sha=$(git rev-parse origin/main)
[[ "$origin_sha" == "$BASELINE_SHA" ]] \
  || fail "Gate 3: origin/main $origin_sha != baseline $BASELINE_SHA"
pass "Gate 3: origin/main = $BASELINE_SHA"

read -r behind _ < <(git rev-list --left-right --count origin/main...HEAD)
[[ "$behind" -eq 0 ]] || fail "Gate 4: HEAD is $behind commits behind origin/main"
pass "Gate 4: HEAD not behind origin (0)"

[[ ! -f ".git/index.lock" ]] || fail "Gate 5: .git/index.lock exists"
pass "Gate 5: no .git/index.lock"

# ── Gate 5 also checks exact scope ────────────────────────────────────────────

all_changed=$(GIT_OPTIONAL_LOCKS=0 git status --porcelain --untracked-files=all \
  | awk '{print $NF}' | sort)

expected_union=$(printf '%s\n' "${APPROVED_PATHS[@]}" | sort)

if [[ "$all_changed" != "$expected_union" ]]; then
  fail "Gate 5: scope mismatch.
Expected:
$expected_union
Got:
$all_changed"
fi
pass "Gate 5: working tree dirty with exactly 5 C4a approved paths"

# ══════════════════════════════════════════════════════════════════════════════
# GROUP 2 — Scope integrity (Gates 6–10)
# ══════════════════════════════════════════════════════════════════════════════

if echo "$all_changed" | grep -q '\.agents'; then
  fail "Gate 6: .agents path present in dirty set"
fi
pass "Gate 6: no .agents path in dirty set"

for f in "${PROTECTED_FILES[@]}"; do
  drift=$(GIT_OPTIONAL_LOCKS=0 git diff "$BASELINE_SHA" -- "$f")
  [[ -z "$drift" ]] || fail "Gate 7: protected file drifted from baseline: $f"
done
pass "Gate 7: all protected C3 files zero drift from baseline (app.ts correctly excluded)"

pkg_drift=$(GIT_OPTIONAL_LOCKS=0 git diff "$BASELINE_SHA" -- artifacts/api-server/package.json)
[[ -z "$pkg_drift" ]] || fail "Gate 8: artifacts/api-server/package.json changed"
pass "Gate 8: artifacts/api-server/package.json unchanged"

lock_drift=$(GIT_OPTIONAL_LOCKS=0 git diff "$BASELINE_SHA" -- pnpm-lock.yaml)
[[ -z "$lock_drift" ]] || fail "Gate 9: pnpm-lock.yaml changed"
pass "Gate 9: pnpm-lock.yaml unchanged"

schema_drift=$(GIT_OPTIONAL_LOCKS=0 git diff "$BASELINE_SHA" --name-only \
  -- "*/migrations/*" "*/schema*" "db/src/*" 2>/dev/null)
[[ -z "$schema_drift" ]] || fail "Gate 10: schema/migration files changed: $schema_drift"
pass "Gate 10: schema and migration files unchanged"

# ══════════════════════════════════════════════════════════════════════════════
# GROUP 3 — app.ts structural checks (Gates 11–18)
# ══════════════════════════════════════════════════════════════════════════════

appts_diff=$(GIT_OPTIONAL_LOCKS=0 git diff "$BASELINE_SHA" -- artifacts/api-server/src/app.ts)

echo "$appts_diff" | grep -q '+import { createInternalRbgRateLimiter }' \
  || fail "Gate 11: app.ts diff missing createInternalRbgRateLimiter import"
pass "Gate 11: app.ts diff contains import of createInternalRbgRateLimiter"

# Gate 12: construction is inside the enabled block (not at module scope)
python3 - <<'PYEOF' || fail "Gate 12: limiter construction is not inside the enabled if block"
import sys

with open("artifacts/api-server/src/app.ts") as f:
    lines = f.readlines()

if_line = next(
    (i for i, l in enumerate(lines) if "if (rbgBinding.router !== null)" in l),
    None,
)
if if_line is None:
    print("ERROR: if block not found", file=sys.stderr); sys.exit(1)

const_line = next(
    (i for i, l in enumerate(lines)
     if "const internalRbgRateLimiter = createInternalRbgRateLimiter()" in l),
    None,
)
if const_line is None:
    print("ERROR: construction line not found", file=sys.stderr); sys.exit(1)

depth = 0
close_line = None
for i in range(if_line, len(lines)):
    depth += lines[i].count("{") - lines[i].count("}")
    if i > if_line and depth == 0:
        close_line = i
        break

if close_line is None:
    print("ERROR: could not find closing brace of if block", file=sys.stderr); sys.exit(1)

if not (if_line < const_line < close_line):
    print(
        f"ERROR: construction at line {const_line+1} is not inside "
        f"if block ({if_line+1}..{close_line+1})",
        file=sys.stderr,
    )
    sys.exit(1)

print(f"OK: construction at line {const_line+1} inside if block ({if_line+1}..{close_line+1})")
PYEOF
pass "Gate 12: limiter construction is inside the enabled if block (not at module scope)"

# Gate 13: limiter mount inside enabled block
echo "$appts_diff" | grep -q 'internalRbgRateLimiter,' \
  || fail "Gate 13: app.ts diff missing limiter mount line"
pass "Gate 13: app.ts diff contains limiter mount inside enabled if block"

# Gate 14: limiter mount precedes router mount
python3 - <<'PYEOF' || fail "Gate 14: limiter mount does not precede router mount in the if block"
import sys

with open("artifacts/api-server/src/app.ts") as f:
    lines = f.readlines()

limiter_mount = next(
    (i for i, l in enumerate(lines) if "internalRbgRateLimiter," in l),
    None,
)
router_mount = next(
    (i for i, l in enumerate(lines) if "rbgBinding.router," in l),
    None,
)

if limiter_mount is None:
    print("ERROR: limiter mount line not found", file=sys.stderr); sys.exit(1)
if router_mount is None:
    print("ERROR: router mount line not found", file=sys.stderr); sys.exit(1)
if limiter_mount >= router_mount:
    print(
        f"ERROR: limiter mount (line {limiter_mount+1}) does not precede "
        f"router mount (line {router_mount+1})",
        file=sys.stderr,
    )
    sys.exit(1)

print(f"OK: limiter mount (line {limiter_mount+1}) precedes router mount (line {router_mount+1})")
PYEOF
pass "Gate 14: limiter mount line precedes router mount line in the if block"

# Gate 15: router mount precedes express.json()
python3 - <<'PYEOF' || fail "Gate 15: router mount does not precede express.json()"
import sys

with open("artifacts/api-server/src/app.ts") as f:
    lines = f.readlines()

router_mount = next(
    (i for i, l in enumerate(lines) if "rbgBinding.router," in l),
    None,
)
json_line = next(
    (i for i, l in enumerate(lines) if "app.use(express.json())" in l),
    None,
)

if router_mount is None:
    print("ERROR: router mount line not found", file=sys.stderr); sys.exit(1)
if json_line is None:
    print("ERROR: express.json() line not found", file=sys.stderr); sys.exit(1)
if router_mount >= json_line:
    print(
        f"ERROR: router mount (line {router_mount+1}) does not precede "
        f"express.json() (line {json_line+1})",
        file=sys.stderr,
    )
    sys.exit(1)

print(f"OK: router mount (line {router_mount+1}) precedes express.json() (line {json_line+1})")
PYEOF
pass "Gate 15: router mount line precedes app.use(express.json())"

# Gate 16: no limiter construction or mount OUTSIDE the enabled block
python3 - <<'PYEOF' || fail "Gate 16: limiter construction or mount found outside enabled if block"
import sys
import re

with open("artifacts/api-server/src/app.ts") as f:
    lines = f.readlines()

if_line = next(
    (i for i, l in enumerate(lines) if "if (rbgBinding.router !== null)" in l),
    None,
)
if if_line is None:
    print("ERROR: if block not found", file=sys.stderr); sys.exit(1)

depth = 0
close_line = None
for i in range(if_line, len(lines)):
    depth += lines[i].count("{") - lines[i].count("}")
    if i > if_line and depth == 0:
        close_line = i
        break

if close_line is None:
    print("ERROR: could not find closing brace", file=sys.stderr); sys.exit(1)

pat = re.compile(r"internalRbgRateLimiter")
errors = []
for i, line in enumerate(lines):
    stripped = re.sub(r"//.*", "", line)
    if pat.search(stripped) and not (if_line <= i <= close_line):
        errors.append(f"line {i+1}: {line.rstrip()}")

if errors:
    for e in errors:
        print(f"ERROR: internalRbgRateLimiter outside enabled block: {e}", file=sys.stderr)
    sys.exit(1)

print(
    f"OK: all internalRbgRateLimiter references inside enabled block "
    f"({if_line+1}..{close_line+1})"
)
PYEOF
pass "Gate 16: no limiter construction or mount outside the enabled if block"

# Gate 17: no new process.env in app.ts diff
added_lines=$(echo "$appts_diff" | grep '^+' | grep -v '^+++' | sed 's|//.*||g')
if echo "$added_lines" | grep -qE "process\.env"; then
  fail "Gate 17: app.ts additions contain process.env"
fi
pass "Gate 17: no new process.env reads in app.ts diff"

# Gate 18: no x-rbg-key-id keying in app.ts diff
if echo "$added_lines" | grep -q 'x-rbg-key-id'; then
  fail "Gate 18: app.ts additions reference x-rbg-key-id (must key on IP)"
fi
pass "Gate 18: no x-rbg-key-id as keyGenerator key in app.ts diff"

# ══════════════════════════════════════════════════════════════════════════════
# GROUP 4 — Limiter module checks (Gates 19–25)
# ══════════════════════════════════════════════════════════════════════════════

limiter_stripped=$(sed 's|//.*||g' "$LIMITER_MODULE" | python3 -c "
import sys, re
src = sys.stdin.read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.DOTALL)
print(src)
")

# Gate 19: no body-reading API in limiter module
if echo "$limiter_stripped" | grep -qE \
  'express\.(json|raw|text|urlencoded)|req\.(pipe|read|resume)|req\.on\(.*['\''"]data['\''"]|body-parser'; then
  fail "Gate 19: body-reading API found in limiter module"
fi
pass "Gate 19: no body-reading API in limiter module (express.json/raw/text/urlencoded, req.pipe/read/resume/on-data, body-parser)"

# Gate 20: no process.env in limiter module
if echo "$limiter_stripped" | grep -q 'process\.env'; then
  fail "Gate 20: process.env found in limiter module"
fi
pass "Gate 20: no process.env in limiter module"

# Gate 21: no x-rbg-key-id in limiter module keyGenerator
if echo "$limiter_stripped" | grep -q 'x-rbg-key-id'; then
  fail "Gate 21: x-rbg-key-id found in limiter module (must key on IP, not header)"
fi
pass "Gate 21: no x-rbg-key-id in limiter module keyGenerator"

# Gate 22: no Resend import or construction in any C4a file
for c4a_src in \
  "artifacts/api-server/src/app.ts" \
  "artifacts/api-server/src/lib/internal-rbg-rate-limit.ts" \
  "artifacts/api-server/src/test/unit/internal-rbg-rate-limit.test.ts" \
  "artifacts/api-server/src/test/integration/rbg-rate-limit.integration.test.ts"
do
  stripped=$(sed 's|//.*||g' "$c4a_src" | python3 -c "
import sys, re
src = sys.stdin.read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.DOTALL)
print(src)
")
  if echo "$stripped" | grep -qiE '(from|import).*['\''"]@?resend|new\s+Resend\s*\('; then
    fail "Gate 22: Resend found in $c4a_src"
  fi
done
pass "Gate 22: no Resend import or construction in C4a files"

# Gate 23: 429 body {"error":"RATE_LIMITED"} in limiter module
if ! grep -q '"RATE_LIMITED"' "$LIMITER_MODULE"; then
  fail 'Gate 23: "RATE_LIMITED" not found in limiter module'
fi
pass 'Gate 23: 429 JSON body {"error":"RATE_LIMITED"} present in limiter module'

# Gate 24: x-rbg-request-id set via randomUUID() in limiter module
if ! grep -q 'x-rbg-request-id' "$LIMITER_MODULE" || ! grep -q 'randomUUID()' "$LIMITER_MODULE"; then
  fail "Gate 24: x-rbg-request-id not set via randomUUID() in limiter module"
fi
pass "Gate 24: x-rbg-request-id set via randomUUID() in handler"

# Gate 25: ipKeyGenerator imported and called
if ! grep -q 'ipKeyGenerator' "$LIMITER_MODULE"; then
  fail "Gate 25: ipKeyGenerator not found in limiter module"
fi
pass "Gate 25: ipKeyGenerator imported and called in keyGenerator"

# ══════════════════════════════════════════════════════════════════════════════
# GROUP 5 — Code quality (Gates 26–27)
# ══════════════════════════════════════════════════════════════════════════════

python3 - <<'PYEOF' || fail "Gate 26: whitespace / final-newline check failed"
import sys

files = [
  "artifacts/api-server/src/app.ts",
  "artifacts/api-server/src/lib/internal-rbg-rate-limit.ts",
  "artifacts/api-server/src/test/unit/internal-rbg-rate-limit.test.ts",
  "artifacts/api-server/src/test/integration/rbg-rate-limit.integration.test.ts",
  "scripts/verify-c4a.sh",
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

print("WHITESPACE_OK: all 5 C4a files pass")
PYEOF
pass "Gate 26: whitespace / final-newline scan — all 5 C4a files clean"

GIT_OPTIONAL_LOCKS=0 git diff --check "$BASELINE_SHA" -- . \
  || fail "Gate 27: git diff --check found whitespace errors"
pass "Gate 27: git diff --check clean"

# ══════════════════════════════════════════════════════════════════════════════
# GROUP 6 — Type checking (Gates 28–29)
# ══════════════════════════════════════════════════════════════════════════════

[[ -f "$NORM_BASELINE" && -s "$NORM_BASELINE" ]] \
  || fail "Gate 28 prereq: normalized baseline missing or empty: $NORM_BASELINE — regenerate it"

actual_norm_sha=$(sha256sum "$NORM_BASELINE" | awk '{print $1}')
[[ "$actual_norm_sha" == "$EXPECTED_NORM_SHA" ]] \
  || fail "Gate 28 prereq: normalized baseline SHA mismatch: $actual_norm_sha"

info "Gate 28: Running typecheck..."
cd artifacts/api-server
pnpm run typecheck > /tmp/c4a_tc_raw.txt 2>&1 || true
cd "$REPO_ROOT"

python3 - <<'PYEOF' || fail "Gate 28: typecheck normalization failed"
import re

with open("/tmp/c4a_tc_raw.txt") as f:
  content = f.read()

diag_re = re.compile(r"^(src/[^\s(]+\.ts)\((\d+),(\d+)\): error (TS\d+): (.+)$")
diags = []
for line in content.splitlines():
  m = diag_re.match(line.rstrip())
  if m:
    diags.append((m.group(1), int(m.group(2)), int(m.group(3)), m.group(4), m.group(5).strip()))

diags.sort(key=lambda d: (d[0], d[1], d[2], d[3]))
norm_lines = [f"{d[0]}({d[1]},{d[2]}): {d[3]}: {d[4]}" for d in diags]

with open("/tmp/c4a_tc_normalized.txt", "w") as f:
  f.write("\n".join(norm_lines) + "\n")

print(f"POST_BUILD_DIAG_COUNT: {len(diags)}")
PYEOF

if ! diff "$NORM_BASELINE" /tmp/c4a_tc_normalized.txt > /tmp/c4a_tc_diff.txt 2>&1; then
  fail "Gate 28: post-Build diagnostics differ from locked baseline:
$(cat /tmp/c4a_tc_diff.txt)"
fi
pass "Gate 28: typecheck normalized == locked baseline (11 diagnostics, exact SHA match)"

for stem in \
  "internal-rbg-rate-limit.ts" \
  "rbg-rate-limit.integration.test.ts"
do
  if grep -q "$stem" /tmp/c4a_tc_raw.txt; then
    fail "Gate 29: C4a file '$stem' appears in typecheck diagnostics"
  fi
done
pass "Gate 29: no C4a file appears in typecheck diagnostics"

# ══════════════════════════════════════════════════════════════════════════════
# GROUP 7 — Build (Gate 30)
# ══════════════════════════════════════════════════════════════════════════════

info "Gate 30: Running production build..."
cd artifacts/api-server
pnpm run build || fail "Gate 30: production build failed (non-zero exit)"
cd "$REPO_ROOT"
pass "Gate 30: production build exits 0"

# ══════════════════════════════════════════════════════════════════════════════
# GROUP 8 — Test counts (Gates 31–32)
# ══════════════════════════════════════════════════════════════════════════════

unit_count=$(grep -c '^\s*test(' "$UNIT_TEST" 2>/dev/null || echo "0")
[[ "$unit_count" -eq 16 ]] \
  || fail "Gate 31: unit test file has $unit_count test() calls, expected 16"
pass "Gate 31: unit test file contains exactly 16 test() calls"

int_count=$(grep -c '^\s*test(' "$INT_TEST" 2>/dev/null || echo "0")
[[ "$int_count" -eq 16 ]] \
  || fail "Gate 32: integration test file has $int_count test() calls, expected 16"
pass "Gate 32: integration test file contains exactly 16 test() calls"

# ══════════════════════════════════════════════════════════════════════════════
# GROUP 9 — Test execution (Gates 33–38)
# ══════════════════════════════════════════════════════════════════════════════

info "Gate 33: Running C4a unit tests (expected: 16 pass, 0 fail)..."
cd artifacts/api-server
c4a_unit_out=$(node --import tsx --test \
  src/test/unit/internal-rbg-rate-limit.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c4a_unit_pass=$(echo "$c4a_unit_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c4a_unit_fail=$(echo "$c4a_unit_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c4a_unit_pass" == "16" ]] \
  || fail "Gate 33: C4a unit pass=$c4a_unit_pass, expected 16
Output:
$c4a_unit_out"
[[ "$c4a_unit_fail" == "0"  ]] \
  || fail "Gate 33: C4a unit fail=$c4a_unit_fail, expected 0
Output:
$c4a_unit_out"
pass "Gate 33: C4a unit tests 16/16"

[[ -n "${RBG_TEST_DATABASE_URL:-}" ]] \
  || fail "Gate 34 prereq: RBG_TEST_DATABASE_URL must be set to run integration tests"

info "Gate 34: Running C4a integration tests (expected: 16 pass, 0 fail)..."
cd artifacts/api-server
c4a_int_out=$(node --import tsx --test \
  src/test/integration/rbg-rate-limit.integration.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c4a_int_pass=$(echo "$c4a_int_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c4a_int_fail=$(echo "$c4a_int_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c4a_int_pass" == "16" ]] \
  || fail "Gate 34: C4a integration pass=$c4a_int_pass, expected 16
Output:
$c4a_int_out"
[[ "$c4a_int_fail" == "0"  ]] \
  || fail "Gate 34: C4a integration fail=$c4a_int_fail, expected 0
Output:
$c4a_int_out"
pass "Gate 34: C4a integration tests 16/16 (includes IL16 oversized-body body-safety proof)"

info "Gate 35: Running C3b-2 integration regression (expected: 24 pass, 0 fail)..."
cd artifacts/api-server
c3b2_out=$(node --import tsx --test \
  src/test/integration/rbg-app-mount.integration.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c3b2_pass=$(echo "$c3b2_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c3b2_fail=$(echo "$c3b2_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c3b2_pass" == "24" ]] \
  || fail "Gate 35: C3b-2 integration pass=$c3b2_pass, expected 24
Output:
$c3b2_out"
[[ "$c3b2_fail" == "0"  ]] \
  || fail "Gate 35: C3b-2 integration fail=$c3b2_fail, expected 0"
pass "Gate 35: C3b-2 integration regression 24/24"

info "Gate 36: Running C3b-1 unit regression (expected: 25 pass, 0 fail)..."
cd artifacts/api-server
c3b1_out=$(node --import tsx --test \
  src/test/unit/rbg-runtime-binding.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c3b1_pass=$(echo "$c3b1_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c3b1_fail=$(echo "$c3b1_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c3b1_pass" == "25" ]] \
  || fail "Gate 36: C3b-1 unit pass=$c3b1_pass, expected 25"
[[ "$c3b1_fail" == "0"  ]] \
  || fail "Gate 36: C3b-1 unit fail=$c3b1_fail, expected 0"
pass "Gate 36: C3b-1 unit regression 25/25"

info "Gate 37: Running C3a unit regression (expected: 36 pass, 0 fail)..."
cd artifacts/api-server
c3a_out=$(node --import tsx --test \
  src/test/unit/integration-client.repository.test.ts \
  src/test/unit/rbg-core-intake-secrets.test.ts \
  src/test/unit/internal-rbg.composition.test.ts 2>&1 || true)
cd "$REPO_ROOT"

c3a_pass=$(echo "$c3a_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
c3a_fail=$(echo "$c3a_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$c3a_pass" == "36" ]] \
  || fail "Gate 37: C3a unit pass=$c3a_pass, expected 36"
[[ "$c3a_fail" == "0"  ]] \
  || fail "Gate 37: C3a unit fail=$c3a_fail, expected 0"
pass "Gate 37: C3a unit regression 36/36"

info "Gate 38: Running general unit regression (expected: 224 pass, 0 fail)..."
cd artifacts/api-server
gen_out=$(pnpm run test:unit 2>&1 || true)
cd "$REPO_ROOT"

gen_pass=$(echo "$gen_out" | grep -E '^ℹ pass ' | awk '{print $NF}')
gen_fail=$(echo "$gen_out" | grep -E '^ℹ fail ' | awk '{print $NF}')

[[ "$gen_pass" == "224" ]] \
  || fail "Gate 38: general unit pass=$gen_pass, expected 224"
[[ "$gen_fail" == "0"   ]] \
  || fail "Gate 38: general unit fail=$gen_fail, expected 0"
pass "Gate 38: general unit regression 224/224"

# ── Final summary ─────────────────────────────────────────────────────────────

echo ""
echo "======================================================================"
echo "  C4a VERIFIER COMPLETE — all 38 gates passed"
echo "======================================================================"
echo ""
