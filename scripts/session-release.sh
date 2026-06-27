#!/usr/bin/env bash
# Release a session slot back to the pool (remove its lock). By default the dev server
# is LEFT RUNNING so you can keep reviewing it; the next claim of this slot restarts it.
# Pass --stop-dev to also kill the dev server now.
#
#   ./scripts/session-release.sh s1            # release slot s1, leave dev up
#   ./scripts/session-release.sh --here        # release the slot for the current directory
#   ./scripts/session-release.sh s1 --stop-dev # release and stop its dev server
#   ./scripts/session-release.sh --reap        # just clean stale (dead-PID) locks
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/session-common.sh
source "$HERE/lib/session-common.sh"

TARGET="" STOP_DEV=0
while [ $# -gt 0 ]; do
  case "$1" in
    --here) TARGET="$(slot_for_dir "$PWD")"; shift ;;
    --stop-dev) STOP_DEV=1; shift ;;
    --reap) reap_stale_locks; echo "stale locks reaped."; exit 0 ;;
    *) TARGET="$1"; shift ;;
  esac
done

[ -n "$TARGET" ] || { echo "usage: session-release.sh <slot|--here> [--stop-dev]" >&2; exit 1; }
slot_port "$TARGET" >/dev/null || { echo "no such slot: $TARGET" >&2; exit 1; }

port="$(slot_port "$TARGET")"
if [ "$STOP_DEV" = 1 ] && port_listening "$port"; then
  echo "→ stopping dev server on port $port"
  port_pids "$port" | xargs -r kill -9 2>/dev/null || true
fi

rm -f "$(lock_file "$TARGET")"
echo "✓ released $TARGET (dev $( [ "$STOP_DEV" = 1 ] && echo stopped || echo 'left running for review' ))"
