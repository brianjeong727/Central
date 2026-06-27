#!/usr/bin/env bash
# SessionEnd hook. Frees the slot owned by this session (removes its lock) so the next
# session can claim it. The dev server is intentionally LEFT RUNNING so the work stays
# reviewable until the slot is reclaimed (the next claim restarts it). Output is ignored
# by Claude Code; this is cleanup only. Never fails the shell.
INPUT="$(cat 2>/dev/null)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v jq >/dev/null 2>&1 || exit 0
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)"
[ -n "$CWD" ] || CWD="$PWD"

# shellcheck source=../../scripts/lib/session-common.sh
source "$HERE/../../scripts/lib/session-common.sh" 2>/dev/null || exit 0
set +e

SLOT="$(slot_for_dir "$CWD" 2>/dev/null)"
[ -n "$SLOT" ] && rm -f "$(lock_file "$SLOT")"
reap_stale_locks 2>/dev/null
exit 0
