#!/usr/bin/env bash
#
# dev-e2e.sh — start this slot's dev server against the E2E Supabase target
# instead of production.
#
# The harness half of this lives in e2e/load-env.ts (E2E_SUPABASE_* overlay).
# BOTH halves are required and they must agree: Playwright seeds rows through the
# service key while the browser reads through the app, so if only one is
# redirected the suite seeds one project and asserts against another. That reads
# as "the data I just created isn't there" — a product bug, for as long as it
# takes to notice it isn't one.
#
# Why bother: the suite writes a lot. Every run signs in twice, creates chat
# groups and seeds messages (one spec seeds 40 rows per run). A dozen runs in an
# afternoon is a burst far heavier than real usage. On 2026-08-08 that helped
# drain the project's disk IO budget; the instance fell to baseline throughput,
# Supabase Auth stopped answering, and the live app hung on launch for everyone —
# it waits on auth before it can render. Tests should not be able to do that to
# production.
#
# Usage:
#   scripts/dev-e2e.sh              # port derived from the worktree slot
#   scripts/dev-e2e.sh --port 3002
#
# Requires in .env.local:
#   E2E_SUPABASE_URL
#   E2E_SUPABASE_ANON_KEY
#   E2E_SUPABASE_SERVICE_ROLE_KEY
#
# Then run the suite against the same port as usual:
#   E2E_PORT=<port> npx playwright test
# load-env.ts applies the same overlay, so the two agree by construction.

set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

PORT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:?--port needs a value}"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "dev-e2e.sh: unknown arg '$1'" >&2; exit 2 ;;
  esac
done

# Same derivation as playwright.config.ts and verify.sh: the port belongs to the
# WORKTREE DIRECTORY, so running this from another slot can't hijack a sibling's
# server.
if [ -z "$PORT" ]; then
  PORT="$(node -e '
    const fs = require("fs"), path = require("path");
    const slots = JSON.parse(fs.readFileSync(".claude/session-slots.json", "utf8"));
    const dir = path.basename(process.cwd());
    const hit = (slots.slots || []).find(s => s.dir === dir);
    process.stdout.write(String(hit ? hit.port : (slots.mainPort || 3000)));
  ' 2>/dev/null)"
fi
[ -z "$PORT" ] && { echo "dev-e2e.sh: could not resolve a port" >&2; exit 1; }

# Read the three vars out of .env.local without sourcing it (values may contain
# characters the shell would mangle, and sourcing runs arbitrary content).
read_env() {
  node -e '
    const fs = require("fs");
    let raw = "";
    try { raw = fs.readFileSync(".env.local", "utf8"); } catch { process.exit(0); }
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      if (t.slice(0, i).trim() !== process.argv[1]) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'"'"'") && v.endsWith("'"'"'"))) v = v.slice(1, -1);
      process.stdout.write(v);
      break;
    }
  ' "$1" 2>/dev/null
}

E2E_URL="$(read_env E2E_SUPABASE_URL)"
E2E_ANON="$(read_env E2E_SUPABASE_ANON_KEY)"
E2E_SERVICE="$(read_env E2E_SUPABASE_SERVICE_ROLE_KEY)"

if [ -z "$E2E_URL" ]; then
  cat >&2 <<'MSG'
dev-e2e.sh: E2E_SUPABASE_URL is not set in .env.local.

Nothing to point at, and starting anyway would silently run against production —
exactly what this script exists to prevent. Add these three, then re-run:

  E2E_SUPABASE_URL=https://<project>.supabase.co
  E2E_SUPABASE_ANON_KEY=...
  E2E_SUPABASE_SERVICE_ROLE_KEY=...
MSG
  exit 1
fi

MISSING=""
[ -z "$E2E_ANON" ] && MISSING="E2E_SUPABASE_ANON_KEY"
[ -z "$E2E_SERVICE" ] && MISSING="${MISSING:+$MISSING and }E2E_SUPABASE_SERVICE_ROLE_KEY"
if [ -n "$MISSING" ]; then
  echo "dev-e2e.sh: E2E_SUPABASE_URL is set but $MISSING is missing — refusing to start half-targeted." >&2
  exit 1
fi

PROD_URL="$(read_env NEXT_PUBLIC_SUPABASE_URL)"
if [ -n "$PROD_URL" ] && [ "$E2E_URL" = "$PROD_URL" ]; then
  echo "dev-e2e.sh: E2E_SUPABASE_URL is the SAME project as NEXT_PUBLIC_SUPABASE_URL — that isolates nothing." >&2
  exit 1
fi

# Next's env loader does not overwrite variables already present in the
# environment, so exporting here wins over .env.local for this process only.
export NEXT_PUBLIC_SUPABASE_URL="$E2E_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$E2E_ANON"
export SUPABASE_SERVICE_ROLE_KEY="$E2E_SERVICE"

HOST="$(printf '%s' "$E2E_URL" | sed -E 's#^https?://##; s#/.*##')"
echo "▶ dev server on :$PORT → Supabase $HOST  (E2E target, NOT production)"
echo "▶ run the suite with: E2E_PORT=$PORT npx playwright test"

exec npm run dev -- -p "$PORT"
