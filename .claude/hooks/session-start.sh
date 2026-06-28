#!/usr/bin/env bash
# SessionStart hook. Reads the session JSON on stdin and injects context telling the
# session whether it's correctly inside a worktree slot (and on which port) or sitting in
# the shared main checkout (where it must NOT do feature work / run dev). Output is a JSON
# object with hookSpecificOutput.additionalContext. Always exits 0; never blocks.
INPUT="$(cat)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

emit() { jq -n --arg c "$1" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'; exit 0; }

command -v jq >/dev/null 2>&1 || { echo '{}'; exit 0; }
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"
[ -n "$CWD" ] || CWD="$PWD"

# shellcheck source=../../scripts/lib/session-common.sh
if ! source "$HERE/../../scripts/lib/session-common.sh" 2>/dev/null; then
  emit "Session-slot system not resolvable here; proceeding without slot context."
fi
set +e   # never let a helper failure abort the hook before it emits JSON
reap_stale_locks 2>/dev/null

SLOT="$(slot_for_dir "$CWD" 2>/dev/null)"
free_list="$(for s in $(slot_names); do slot_busy "$s" 2>/dev/null || printf '%s(:%s) ' "$s" "$(slot_port "$s")"; done)"

if [ -n "$SLOT" ]; then
  PORT="$(slot_port "$SLOT")"
  # Adopt the slot if it has no lock yet (started via bare `claude`, not the launcher).
  if [ ! -f "$(lock_file "$SLOT")" ]; then
    { echo "slot=$SLOT"; echo "port=$PORT"; echo "dir=$CWD"; echo "branch=$(git -C "$CWD" branch --show-current 2>/dev/null)"; echo "session_pid=$PPID"; echo "started=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; } >"$(lock_file "$SLOT")" 2>/dev/null
  fi
  emit "WORKTREE SESSION — you are in slot ${SLOT} (worktree $(basename "$CWD")), dev port ${PORT} (http://localhost:${PORT}). Do all work here. Branch your task off main as feat/<task> before editing — the main-branch-guard blocks edits on main. Your dev server runs on port ${PORT}; never reuse another slot's port. Slot pool & ports: .claude/session-slots.json."
fi

if [ "$CWD" = "$MAIN_WT" ]; then
  emit "⚠ SHARED MAIN CHECKOUT (port $(main_port)). This repo runs every session in its own reusable worktree slot — do NOT run the dev server, build, or do feature work in this directory. Claim a slot instead: run ./scripts/session.sh (boots a worktree + dev server + Claude in a free slot), or cd into a free slot and work there. Free slots now: ${free_list:-none — all busy}. Reuse the fixed pool (s1–s3); never create ad-hoc worktrees. See CLAUDE.md §Session worktrees."
fi

emit "Note: this directory ($(basename "$CWD")) is not a registered session slot. Registered slots: $(slot_names | tr '\n' ' '). If you meant to run a session, use ./scripts/session.sh; otherwise proceeding as-is."
