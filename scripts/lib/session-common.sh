#!/usr/bin/env bash
# Shared helpers for the session-worktree slot system.
# Sourced by scripts/session.sh, scripts/session-status.sh, scripts/session-release.sh,
# and the SessionStart/SessionEnd hooks. No side effects on source.
#
# Model: a FIXED pool of worktree directories (central-s1..s3), each bound to a fixed
# dev port. A session claims a free slot, branches, works, releases on exit. Slots are
# REUSED — never create a new worktree per session. Live state lives in the shared git
# common dir so every worktree sees the same locks.

set -euo pipefail

# --- locate the main worktree, the parent dir, the registry, and the shared lock dir ---
# Works from any worktree: the first `git worktree list` entry is always the main checkout.
_git() { git "$@" 2>/dev/null; }

MAIN_WT="$(_git worktree list --porcelain | awk '/^worktree /{sub(/^worktree /, ""); print; exit}')"
PARENT_DIR="$(dirname "$MAIN_WT")"
REGISTRY="$MAIN_WT/.claude/session-slots.json"
# Shared across all worktrees (one .git common dir): no commit, no gitignore needed.
_COMMON="$(cd "$(_git rev-parse --git-common-dir)" && pwd)"
LOCK_DIR="$_COMMON/session-locks"
mkdir -p "$LOCK_DIR"

# --- registry accessors (jq required) ---
slot_names()  { jq -r '.slots[].slot' "$REGISTRY"; }
slot_port()   { jq -r --arg s "$1" '.slots[] | select(.slot==$s) | .port' "$REGISTRY"; }
slot_subdir() { jq -r --arg s "$1" '.slots[] | select(.slot==$s) | .dir'  "$REGISTRY"; }
slot_dir()    { echo "$PARENT_DIR/$(slot_subdir "$1")"; }
main_port()   { jq -r '.mainPort' "$REGISTRY"; }

# Map an absolute path (a session's cwd) back to a slot name, or "" if it's not a slot.
slot_for_dir() {
  local target; target="$(cd "$1" 2>/dev/null && pwd)" || return 0
  local s d
  for s in $(slot_names); do
    d="$(cd "$(slot_dir "$s")" 2>/dev/null && pwd)" || continue
    [ "$target" = "$d" ] && { echo "$s"; return 0; }
  done
  echo ""
}

lock_file() { echo "$LOCK_DIR/$1.lock"; }
devlog()    { echo "$LOCK_DIR/$1.devlog"; }

# Read one field out of a slot's lock file (key=value lines).
lock_field() {
  local f; f="$(lock_file "$1")"
  [ -f "$f" ] || return 0
  awk -F= -v k="$2" '$1==k{print substr($0, index($0,"=")+1)}' "$f"
}

# A slot is BUSY iff its lock exists AND the owning session PID is still alive.
# Removing the lock (SessionEnd) frees it even if a dev server lingers for review.
# A lock whose session PID is dead is stale → treated as free (and cleaned by callers).
slot_busy() {
  local f pid; f="$(lock_file "$1")"
  [ -f "$f" ] || return 1
  pid="$(lock_field "$1" session_pid)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# A slot has local work that must not be clobbered: uncommitted changes, or commits on
# HEAD not yet in origin/main. (Run `git fetch` first so origin/main is current.)
slot_dirty() {
  local d; d="$(slot_dir "$1")"
  [ -d "$d" ] && [ -n "$(git -C "$d" status --porcelain 2>/dev/null)" ]
}
slot_unmerged() {
  local d n; d="$(slot_dir "$1")"
  [ -d "$d" ] || return 1
  n="$(git -C "$d" rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
  [ "${n:-0}" != "0" ]
}
# Claimable by auto-pick: no live lock, clean tree, nothing unmerged on HEAD.
slot_available() {
  slot_busy "$1"     && return 1
  slot_dirty "$1"    && return 1
  slot_unmerged "$1" && return 1
  return 0
}

# Remove locks whose owning session PID is dead (housekeeping).
reap_stale_locks() {
  local s pid
  for s in $(slot_names); do
    [ -f "$(lock_file "$s")" ] || continue
    pid="$(lock_field "$s" session_pid)"
    if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$(lock_file "$s")"
    fi
  done
}

# Is something currently listening on a TCP port?
port_listening() { lsof -ti tcp:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
port_pids()      { lsof -ti tcp:"$1" -sTCP:LISTEN 2>/dev/null; }
