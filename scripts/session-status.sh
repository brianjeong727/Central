#!/usr/bin/env bash
# Show the session-slot pool: each slot's port, free/busy state, owning branch, and
# whether a dev server is currently listening. Read-only — safe to run anytime.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/session-common.sh
source "$HERE/lib/session-common.sh"

reap_stale_locks
git -C "$MAIN_WT" fetch origin --quiet 2>/dev/null || true

printf '%-5s %-6s %-8s %-28s %s\n' SLOT PORT STATE BRANCH DEV
printf '%-5s %-6s %-8s %-28s %s\n' "----" "----" "-----" "--------------------------" "---"

mp="$(main_port)"
printf '%-5s %-6s %-8s %-28s %s\n' "main" "$mp" "shared" "$(cd "$MAIN_WT" && git branch --show-current 2>/dev/null)" \
  "$(port_listening "$mp" && echo up || echo —)"

for s in $(slot_names); do
  port="$(slot_port "$s")"; dir="$(slot_dir "$s")"
  if   slot_busy "$s";                          then state="BUSY"   # live session holds the lock
  elif slot_dirty "$s" || slot_unmerged "$s";   then state="held"   # no lock, but unmerged/uncommitted work
  else                                               state="free"   # clean at main, ready to claim
  fi
  branch="—"
  if [ -d "$dir" ]; then
    branch="$(git -C "$dir" branch --show-current 2>/dev/null)"
    [ -z "$branch" ] && branch="detached@$(git -C "$dir" rev-parse --short HEAD 2>/dev/null)"
  fi
  dev="—"; port_listening "$port" && dev="up:$port"
  printf '%-5s %-6s %-8s %-28s %s\n' "$s" "$port" "$state" "${branch:-—}" "$dev"
done

echo
echo "lock dir: $LOCK_DIR"
echo "claimable now: $(for s in $(slot_names); do slot_available "$s" && echo -n "$s "; done)"
