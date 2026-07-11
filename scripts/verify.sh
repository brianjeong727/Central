#!/usr/bin/env bash
#
# verify.sh — the single deterministic verification gate for Central.
#
# Replaces ad-hoc "kill the port, rebuild, poll, maybe test" choreography with one
# ordered pass: free the port → build → lint → restart the slot dev server →
# wait for ready → (optionally) run the Playwright e2e suite → print PASS/FAIL.
#
# Safe to run from any worktree: it resolves its own top-level and slot log dir.
#
# Usage:
#   scripts/verify.sh [--port N] [--e2e] [--skip-build]
#     --port N       target port (default 3001); maps 3000→main 3001→s1 3002→s2 3003→s3
#     --e2e          also run `E2E_PORT=N npx playwright test`
#     --skip-build   skip `npm run build` (still lints, restarts, polls)

set -uo pipefail

PORT=3001
RUN_E2E=0
SKIP_BUILD=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:?--port needs a value}"; shift 2 ;;
    --e2e) RUN_E2E=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "verify.sh: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "verify.sh: not a git repo" >&2; exit 2; }
cd "$ROOT" || exit 2

BUILD_STATUS="skipped"
LINT_STATUS="n/a"
HEX_STATUS="n/a"
SERVER_STATUS="fail"
E2E_STATUS="n/a"

# ── (a) free the port ────────────────────────────────────────────────────────
echo "▶ freeing port $PORT"
lsof -ti "tcp:$PORT" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
pkill -f "next dev.*-p $PORT" 2>/dev/null || true
pkill -f "next-server.*:$PORT" 2>/dev/null || true
sleep 1

# ── (b) build ────────────────────────────────────────────────────────────────
if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "▶ npm run build"
  BUILD_LOG="$(mktemp)"
  if npm run build >"$BUILD_LOG" 2>&1; then
    BUILD_STATUS="pass"
  else
    BUILD_STATUS="fail"
    echo "── build FAILED (tail) ──────────────────────────────"
    tail -n 40 "$BUILD_LOG"
    echo "─────────────────────────────────────────────────────"
    echo "════════ VERIFY RESULT: FAIL (build) ════════"
    exit 1
  fi
fi

# ── (c) lint (errors BLOCK; warnings reported, non-fatal) ────────────────────
echo "▶ npm run lint"
LINT_LOG="$(mktemp)"
if npm run lint >"$LINT_LOG" 2>&1; then
  # eslint exits 0 when only warnings remain — surface a count but don't fail.
  if grep -qiE '[0-9]+ warning' "$LINT_LOG"; then
    LINT_STATUS="pass ($(grep -oiE '[0-9]+ warning' "$LINT_LOG" | tail -n1))"
  else
    LINT_STATUS="pass"
  fi
else
  LINT_STATUS="fail"
  echo "── lint ERRORS (BLOCKING) ───────────────────────────"
  tail -n 40 "$LINT_LOG"
  echo "─────────────────────────────────────────────────────"
  echo "════════ VERIFY RESULT: FAIL (lint) ════════"
  exit 1
fi

# ── (c2) hex ratchet (BLOCKING) ──────────────────────────────────────────────
echo "▶ scripts/check-hex.sh"
HEX_LOG="$(mktemp)"
if bash scripts/check-hex.sh >"$HEX_LOG" 2>&1; then
  HEX_STATUS="pass"
  tail -n 2 "$HEX_LOG"
else
  HEX_STATUS="fail"
  echo "── hex ratchet FAILED (BLOCKING) ────────────────────"
  cat "$HEX_LOG"
  echo "─────────────────────────────────────────────────────"
  echo "════════ VERIFY RESULT: FAIL (hex) ════════"
  exit 1
fi

# ── (d) restart dev server ───────────────────────────────────────────────────
case "$PORT" in
  3000) SLOT="main" ;;
  3001) SLOT="s1" ;;
  3002) SLOT="s2" ;;
  3003) SLOT="s3" ;;
  *) SLOT="" ;;
esac

if [[ -n "$SLOT" ]]; then
  LOCK_DIR="$(git rev-parse --git-common-dir)/session-locks"
  mkdir -p "$LOCK_DIR"
  DEVLOG="$LOCK_DIR/$SLOT.devlog"
else
  DEVLOG="$ROOT/e2e-dev.log"
fi

echo "▶ starting dev server on :$PORT → $DEVLOG"
nohup npm run dev -- -p "$PORT" >"$DEVLOG" 2>&1 &

# ── (e) poll until ready (max ~120s) ─────────────────────────────────────────
echo "▶ waiting for http://localhost:$PORT"
for _ in $(seq 1 120); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT" 2>/dev/null || echo 000)"
  case "$code" in
    200|301|302|307|308) SERVER_STATUS="pass"; break ;;
  esac
  sleep 1
done

if [[ "$SERVER_STATUS" != "pass" ]]; then
  echo "── dev server never became ready (tail) ─────────────"
  tail -n 30 "$DEVLOG" 2>/dev/null || true
  echo "─────────────────────────────────────────────────────"
fi

# ── (f) e2e ──────────────────────────────────────────────────────────────────
if [[ $RUN_E2E -eq 1 ]]; then
  if [[ "$SERVER_STATUS" == "pass" ]]; then
    echo "▶ E2E_PORT=$PORT npx playwright test"
    if E2E_PORT="$PORT" npx playwright test; then
      E2E_STATUS="pass"
    else
      E2E_STATUS="fail"
    fi
  else
    E2E_STATUS="skipped (server down)"
  fi
fi

# ── summary ──────────────────────────────────────────────────────────────────
echo ""
echo "════════════ VERIFY SUMMARY ════════════"
printf '  %-8s %s\n' "build"  "$BUILD_STATUS"
printf '  %-8s %s\n' "lint"   "$LINT_STATUS"
printf '  %-8s %s\n' "hex"    "$HEX_STATUS"
printf '  %-8s %s (:%s)\n' "server" "$SERVER_STATUS" "$PORT"
printf '  %-8s %s\n' "e2e"    "$E2E_STATUS"
echo "════════════════════════════════════════"

# build / lint / hex already hard-exit above; these are belt-and-suspenders.
FAIL=0
[[ "$BUILD_STATUS" == "fail" ]] && FAIL=1
[[ "$LINT_STATUS" == "fail" ]] && FAIL=1
[[ "$HEX_STATUS" == "fail" ]] && FAIL=1
[[ "$SERVER_STATUS" != "pass" ]] && FAIL=1
[[ "$E2E_STATUS" == "fail" ]] && FAIL=1

if [[ $FAIL -eq 0 ]]; then
  echo "════════ VERIFY RESULT: PASS ════════"
  exit 0
else
  echo "════════ VERIFY RESULT: FAIL ════════"
  exit 1
fi
