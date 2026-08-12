#!/usr/bin/env bash
# Phase D — the full 200-connection burst, driven from the Mac.
#
#   bash scripts/loadtest/run-burst-cloud.sh <VM_IP> [run-id]
#
# SPLIT-BOX design (deliberately different from the original single-box runbook):
#   VM  → fleet.cjs ONLY. The 200 websockets are the only thing that ever needed a
#         datacenter uplink; concentrating them on one residential IP is what broke
#         the 2026-07-21 attempts (home router connection table, not Supabase).
#   Mac → canary + sender + http-burst. Tiny traffic (<=8 msg/s, 5 rps), so the home
#         uplink is nowhere near saturation — and it finally gives CLIENT-side truth
#         from a clean box, which resolves the co-location caveat in README.md.
#         The canary is more honest here too: real students are on residential
#         networks, not in the datacenter next to the fleet.
#
# Kill switch: Ctrl-C. Tears down the VM fleet (SIGINT -> <10s) and all local probes.
set -uo pipefail

VM="${1:-}"
RUN_ID="${2:-burstCloud}"
[ -n "$VM" ] || { echo "usage: bash scripts/loadtest/run-burst-cloud.sh <VM_IP> [run-id]"; exit 1; }

KEY="$HOME/.ssh/loadtest_ed25519"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=15 "root@$VM")

CENTRAL_GID="2c67fabd-b2de-4f00-8698-ec55e4c5bef1"   # Load Test 200 central chat, 202 members

# --- tunables ------------------------------------------------------------------
BASELINE_S="${BASELINE_S:-180}"                       # canary alone, before any load
FLEET_PLAN="${FLEET_PLAN:-50x90,100x90,200x900}"      # reaches 200 at ~T+180s, holds 15min
FLEET_WORKERS="${FLEET_WORKERS:-8}"
FLEET_STAGGER="${FLEET_STAGGER:-55}"
FLEET_OPEN_RATIO="${FLEET_OPEN_RATIO:-0.25}"
# Mobile shape: % of the live fleet that backgrounds+resumes per minute. 15%/min at
# 200 clients ≈ a phone cycling every ~7 min, which is what a service looks like.
# Set CHURN=0 to reproduce the stable-connection shape of the 160-conn baseline.
CHURN="${CHURN:-15}"
RAMP_WAIT_S="${RAMP_WAIT_S:-200}"                     # fleet start -> 200 held (plan 180s + ramp slack)
SEND_LADDER="${SEND_LADDER:-0.5x150,1x150,2x180,4x180,8x150}"   # 810s, fits inside the 900s hold
SEND_SENDERS="${SEND_SENDERS:-10}"
HTTP_RPS="${HTTP_RPS:-5}"
HTTP_DURATION="${HTTP_DURATION:-600}"
HTTP_NEXT_RPS="${HTTP_NEXT_RPS:-1}"
HTTP_AUTH_BURST="${HTTP_AUTH_BURST:-50}"              # sign-ins/min — the campus-NAT shape
MAC_WARM="${MAC_WARM:-20}"                            # local tokens for sender + http-burst
# 1 req/s — measured clean (60 sign-ins, zero 429). The old 350ms was ~2.9/s = 857 per
# 5min, over the 600/5min sign-in ceiling; refreshes (150/5min) blew up 8x faster.
WARM_PACE="${WARM_PACE:-1100}"
# -------------------------------------------------------------------------------

cd "$ROOT"
mkdir -p "$HERE/logs"
CANARY_PID=""; SENDER_PID=""; HTTP_PID=""
STOPPED=0

say() { printf '\n\033[1m[%s] %s\033[0m\n' "$(date +%H:%M:%S)" "$*"; }

teardown() {
  [ "$STOPPED" = 1 ] && return
  STOPPED=1
  say "TEARDOWN — stopping fleet on VM and local probes"
  "${SSH[@]}" "pkill -INT -f 'loadtest/fleet.cjs' || true" 2>/dev/null || true
  for p in "$SENDER_PID" "$HTTP_PID" "$CANARY_PID"; do
    [ -n "$p" ] && kill -INT "$p" 2>/dev/null || true
  done
  sleep 3
  "${SSH[@]}" "pkill -KILL -f 'loadtest/fleet' || true" 2>/dev/null || true
}
trap 'teardown; exit 130' INT TERM

# --- preflight -----------------------------------------------------------------
say "PREFLIGHT"
"${SSH[@]}" 'test -f /root/central/.env.local && test -f /root/central/scripts/loadtest/fleet.cjs' \
  || { echo "VM not bootstrapped — run: bash scripts/loadtest/vm-bootstrap.sh $VM"; exit 1; }

# Count only UNEXPIRED tokens — a stale store looks full but yields PGRST303 mid-run.
VM_TOKENS=$("${SSH[@]}" 'node -e "try{const t=require(\"/root/central/scripts/loadtest/.tokens.json\");const n=Math.floor(Date.now()/1000);console.log(Object.entries(t).filter(([k,v])=>k.startsWith(\"fleet\")&&v.expires_at>n+120).length)}catch(e){console.log(0)}"' 2>/dev/null || echo 0)
echo "VM fresh fleet tokens: $VM_TOKENS"
if [ "${VM_TOKENS:-0}" -lt 198 ]; then
  say "warming 200 sessions from the VM's IP"
  "${SSH[@]}" "cd /root/central && ulimit -n 65535 && node scripts/loadtest/warm-sessions.cjs --count 200 --pace $WARM_PACE --signin-only" || { echo "VM warm failed"; exit 1; }
fi

say "warming $MAC_WARM local sessions (sender + http-burst identities)"
node scripts/loadtest/warm-sessions.cjs --count "$MAC_WARM" --pace "$WARM_PACE" --signin-only || { echo "local warm failed"; exit 1; }

# --- run -----------------------------------------------------------------------
say "CANARY baseline — ${BASELINE_S}s alone (real-tenant, residential network)"
node scripts/loadtest/canary.cjs --run-id "$RUN_ID" > "$HERE/logs/$RUN_ID-canary.out" 2>&1 &
CANARY_PID=$!
sleep "$BASELINE_S"

say "FLEET on $VM — plan $FLEET_PLAN"
"${SSH[@]}" "cd /root/central && ulimit -n 65535 && nohup node scripts/loadtest/fleet.cjs \
  --run-id '$RUN_ID' --plan '$FLEET_PLAN' --workers $FLEET_WORKERS \
  --open-ratio $FLEET_OPEN_RATIO --stagger $FLEET_STAGGER --churn $CHURN \
  > /root/central/fleet.out 2>&1 & echo started" || { teardown; exit 1; }

say "ramping — waiting ${RAMP_WAIT_S}s for the fleet to hold at 200"
for i in $(seq 1 $((RAMP_WAIT_S / 20))); do
  sleep 20
  "${SSH[@]}" "tail -n 2 /root/central/fleet.out" 2>/dev/null | sed 's/^/  vm| /'
  "${SSH[@]}" "pgrep -f 'loadtest/fleet.cjs' >/dev/null" 2>/dev/null || { say "FLEET DIED during ramp — see VM log"; "${SSH[@]}" 'tail -n 40 /root/central/fleet.out'; teardown; exit 1; }
done

say "SENDER (ladder $SEND_LADDER) + HTTP-BURST — from the Mac"
node scripts/loadtest/sender.cjs --run-id "$RUN_ID" --group "$CENTRAL_GID" \
  --ladder "$SEND_LADDER" --senders "$SEND_SENDERS" > "$HERE/logs/$RUN_ID-sender.out" 2>&1 &
SENDER_PID=$!
node scripts/loadtest/http-burst.cjs --run-id "$RUN_ID" --rps "$HTTP_RPS" \
  --duration "$HTTP_DURATION" --next-rps "$HTTP_NEXT_RPS" --auth-burst "$HTTP_AUTH_BURST" \
  > "$HERE/logs/$RUN_ID-http.out" 2>&1 &
HTTP_PID=$!

say "HOLDING — sample the DB from another window via Supabase MCP (pg_stat_activity vs 60, pg_stat_statements)"
while "${SSH[@]}" "pgrep -f 'loadtest/fleet.cjs' >/dev/null" 2>/dev/null; do
  sleep 30
  "${SSH[@]}" "tail -n 1 /root/central/fleet.out" 2>/dev/null | sed 's/^/  vm| /'
  tail -n 1 "$HERE/logs/$RUN_ID-canary.out" 2>/dev/null | sed 's/^/  canary| /'
done

say "fleet finished — stopping local probes"
STOPPED=1
for p in "$SENDER_PID" "$HTTP_PID" "$CANARY_PID"; do kill -INT "$p" 2>/dev/null || true; done
sleep 2

# --- collect + verdict ---------------------------------------------------------
say "pulling VM logs into $HERE/logs/"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new \
  "root@$VM:/root/central/scripts/loadtest/logs/$RUN_ID-*.ndjson" "$HERE/logs/" 2>/dev/null || true
scp -i "$KEY" -o StrictHostKeyChecking=accept-new \
  "root@$VM:/root/central/fleet.out" "$HERE/logs/$RUN_ID-fleet.out" 2>/dev/null || true

say "SUMMARY"
node scripts/loadtest/summarize.cjs --run-id "$RUN_ID"
