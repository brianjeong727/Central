#!/usr/bin/env bash
# Open a tiled tmux grid over the session-slot pool — one pane per slot plus a
# control pane in the shared main checkout.
#
#   ./scripts/session-grid.sh          # open (or reattach to) the grid
#   ./scripts/session-grid.sh --kill   # tear the grid down
#
# Per-pane behavior, decided from live slot state at launch:
#   free slot → claimed via session.sh --slot <s>: fresh copy of origin/main,
#               dev server on the slot's fixed port, claude running in the pane
#   BUSY slot → plain shell in the slot dir (a live session owns it — never steal)
#   held slot → plain shell in the slot dir showing the unmerged/uncommitted work
#   main pane → session-status.sh + shell in the shared checkout (status/merges only)
#
# Adapted from AI-Engineer-Skool/zen-agentic-engineer-config's 4-pane launcher,
# rebuilt on the slot system so every pane is ISOLATED (own worktree, own port)
# instead of four claudes sharing one directory.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/session-common.sh
source "$HERE/lib/session-common.sh"

command -v tmux >/dev/null 2>&1 || { echo "tmux not found — brew install tmux" >&2; exit 1; }

SESSION="central-grid"

if [ "${1:-}" = "--kill" ]; then
  tmux kill-session -t "$SESSION" 2>/dev/null && echo "killed $SESSION" || echo "no grid session running"
  exit 0
fi

# One grid at a time: reattach instead of stacking a second grid on the same slots.
if tmux has-session -t "$SESSION" 2>/dev/null; then
  if [ -n "${TMUX:-}" ]; then exec tmux switch-client -t "$SESSION"; else exec tmux attach -t "$SESSION"; fi
fi

reap_stale_locks
git -C "$MAIN_WT" fetch origin --quiet 2>/dev/null || true

# Build a slot pane's shell command from its live state. Free slots stagger their
# session.sh claims (sleep) so parallel fetches don't race on the shared git dir.
pane_cmd() {
  local s="$1" delay="$2" dir
  dir="$(slot_dir "$s")"
  if slot_busy "$s"; then
    printf 'cd %q 2>/dev/null; echo "⛔ %s is BUSY — a live session owns it (shell only)"; exec zsh' "$dir" "$s"
  elif slot_dirty "$s" || slot_unmerged "$s"; then
    printf 'cd %q 2>/dev/null; echo "⚠ %s holds unfinished work — merge or release before claiming:"; git status --short; git log --oneline origin/main..HEAD 2>/dev/null | head -5; exec zsh' "$dir" "$s"
  else
    printf 'sleep %d; %q --slot %s; exec zsh' "$delay" "$HERE/session.sh" "$s"
  fi
}

# Control pane first (ends up top-left): status view in the shared checkout.
ctl=$(tmux new-session -d -s "$SESSION" -c "$MAIN_WT" -n grid -P -F '#{pane_id}' \
      "$(printf '%q' "$HERE/session-status.sh"); exec zsh")
tmux select-pane -t "$ctl" -T "main :$(main_port) shared"

delay=0
for s in $(slot_names); do
  cmd="$(pane_cmd "$s" "$delay")"
  p=$(tmux split-window -t "$SESSION:0" -c "$MAIN_WT" -P -F '#{pane_id}' "$cmd")
  tmux select-pane -t "$p" -T "$s :$(slot_port "$s")"
  tmux select-layout -t "$SESSION:0" tiled   # re-tile each split so panes never run out of room
  if slot_available "$s"; then delay=$((delay + 4)); fi
done

tmux select-pane -t "$ctl"
if [ -n "${TMUX:-}" ]; then exec tmux switch-client -t "$SESSION"; else exec tmux attach -t "$SESSION"; fi
