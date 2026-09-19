#!/usr/bin/env bash
# Start a Claude Code session in a reusable worktree slot.
#
#   ./scripts/session.sh                 # claim first free slot, leave it on main
#   ./scripts/session.sh "fix login bug" # also create branch feat/fix-login-bug
#   ./scripts/session.sh --slot s2 ...    # request a specific slot
#   ./scripts/session.sh --no-launch ...  # claim + boot dev, but DON'T exec claude
#   ./scripts/session.sh --dry-run        # just show which slot would be claimed
#
# It: picks a free slot from .claude/session-slots.json, ensures its worktree +
# node_modules + .env.local exist, resets it to a fresh `main`, (optionally) branches,
# boots the dev server on the slot's fixed port, writes a lock, and execs `claude`
# inside the slot directory. Slots are REUSED — this never grows the worktree pool.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/session-common.sh
source "$HERE/lib/session-common.sh"

TASK="" WANT_SLOT="" LAUNCH=1 DRY=0 FORCE=0 BASE_REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --slot) WANT_SLOT="$2"; shift 2 ;;
    --base) BASE_REF="$2"; shift 2 ;;   # start from another ref/branch instead of origin/main
    --no-launch) LAUNCH=0; shift ;;
    --dry-run) DRY=1; shift ;;
    --force) FORCE=1; shift ;;
    --) shift; break ;;
    -*) echo "unknown flag: $1" >&2; exit 1 ;;
    *) TASK="$1"; shift ;;
  esac
done

reap_stale_locks
git -C "$MAIN_WT" fetch origin --quiet 2>/dev/null || true   # current origin/main for availability checks

# --- pick a slot ---
pick=""
if [ -n "$WANT_SLOT" ]; then
  slot_port "$WANT_SLOT" >/dev/null || { echo "no such slot: $WANT_SLOT" >&2; exit 1; }
  slot_busy "$WANT_SLOT" && { echo "slot $WANT_SLOT is busy" >&2; "$HERE/session-status.sh"; exit 1; }
  pick="$WANT_SLOT"   # explicit slot: the uncommitted/unmerged guards below still apply
else
  # auto-pick: first slot with no lock, clean tree, and nothing unmerged (skips active work)
  for s in $(slot_names); do slot_available "$s" && { pick="$s"; break; }; done
fi
[ -n "$pick" ] || { echo "no free slots (all busy or holding unmerged work)." >&2; "$HERE/session-status.sh"; exit 1; }

port="$(slot_port "$pick")"; dir="$(slot_dir "$pick")"; subdir="$(slot_subdir "$pick")"

if [ "$DRY" = 1 ]; then
  echo "would claim: $pick  dir=$dir  port=$port  task='${TASK:-—}'"
  exit 0
fi

# --- ensure the worktree exists (create once; reused forever after) ---
if [ ! -d "$dir/.git" ] && [ ! -f "$dir/.git" ]; then
  echo "→ creating worktree $subdir (first time)"
  git -C "$MAIN_WT" worktree add "$dir" main >/dev/null
fi

# --- reset the slot to a fresh main (refuse to clobber uncommitted OR unmerged work) ---
if [ -n "$(git -C "$dir" status --porcelain)" ]; then
  echo "✗ $subdir has uncommitted changes — not resetting. Commit/stash there first:" >&2
  git -C "$dir" status --short >&2
  exit 1
fi
git -C "$dir" fetch origin --quiet 2>/dev/null || true
ahead="$(git -C "$dir" rev-list --count origin/main..HEAD 2>/dev/null || echo 0)"
if [ "$ahead" != "0" ] && [ "$FORCE" != 1 ]; then
  here="$(git -C "$dir" branch --show-current 2>/dev/null)"; here="${here:-detached HEAD}"
  echo "✗ $subdir ($here) has $ahead commit(s) not in origin/main — refusing to reclaim" >&2
  echo "  (protects active or unpushed work). Push/merge it, pick another slot, or use --force." >&2
  exit 1
fi
# Each session LANDS as a copy of the latest integrated main (origin/main), never as
# `main` itself (git forbids the same branch in two worktrees, and the central checkout
# holds main). With a task we cut feat/<slug> off it; without one we land DETACHED at
# origin/main — a working tree identical to main, not an isolated branch — and you branch
# (`git checkout -b feat/<task>`) before committing. --base <ref> starts from another
# branch instead (e.g. to build on another session's not-yet-merged work).
git -C "$dir" fetch origin --quiet
BASE="${BASE_REF:-origin/main}"
git -C "$dir" rev-parse --verify "$BASE" >/dev/null 2>&1 || { echo "✗ base ref not found: $BASE" >&2; exit 1; }
if [ -n "$TASK" ]; then
  slug="$(echo "$TASK" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-' | sed 's/--*/-/g; s/^-//; s/-$//')"
  branch="feat/$slug"
  git -C "$dir" checkout -B "$branch" "$BASE" --quiet
  echo "→ $subdir on $branch (a copy of $BASE)"
else
  git -C "$dir" checkout --detach "$BASE" --quiet
  branch="(detached@$BASE)"
  echo "→ $subdir is a detached copy of $BASE — branch (git checkout -b feat/<task>) before committing"
fi

# --- free the slot's port BEFORE touching deps ---
# Ordering matters: this used to run AFTER the install, which left a leftover `next dev`
# from an earlier session watching this worktree's node_modules for the whole install.
# npm's reify RETIRES and moves hundreds of directories under node_modules; a live watcher
# (plus iCloud's FileProvider, which syncs the Desktop these worktrees live in) turns that
# into a failed rename — and arborist then CRASHES inside its own rollback
# (rollbackMoveBackRetiredUnchanged), leaving node_modules half-retired. Kill first.
if port_listening "$port"; then
  echo "→ clearing leftover process on port $port"
  port_pids "$port" | xargs -r kill -9 2>/dev/null || true
fi

# --- deps install: serialized, logged, time-boxed ---
DEPS_TIMEOUT="${DEPS_TIMEOUT:-900}"   # seconds — a wedged install must fail loudly, never hang a pane
installlog() { echo "$LOCK_DIR/$1.install.log"; }

# Serialize installs across slots. `cgrid` claims every free slot at once and npm's
# ~/.npm/_cacache is SHARED, so concurrent reifies race on it. mkdir is the only atomic
# lock primitive available here (macOS ships no flock). A lock older than the install
# budget is stale and gets reaped.
npm_lock_acquire() {
  local lock="$LOCK_DIR/npm-install.lock" waited=0 announced=0
  while ! mkdir "$lock" 2>/dev/null; do
    if [ -n "$(find "$lock" -maxdepth 0 -mmin "+$(( DEPS_TIMEOUT / 60 + 2 ))" 2>/dev/null)" ]; then
      echo "→ reaping stale npm-install lock"
      rm -rf "$lock" 2>/dev/null || true
      continue
    fi
    [ "$announced" = 0 ] && { echo "→ another slot is installing deps — waiting"; announced=1; }
    sleep 5; waited=$(( waited + 5 ))
    [ "$waited" -ge "$(( DEPS_TIMEOUT + 120 ))" ] && { echo "✗ timed out waiting for the npm-install lock" >&2; return 1; }
  done
  echo "$$" >"$lock/owner"
}
npm_lock_release() { rm -rf "$LOCK_DIR/npm-install.lock" 2>/dev/null || true; }

# Run npm install with its output CAPTURED (not discarded) and a watchdog. The old form
# was `( cd "$dir" && npm install … ) >/dev/null 2>&1` under `set -e`: a failed install
# killed the script having printed NOTHING, so a cgrid pane just dropped to a bare prompt
# with no clue why. Everything here exists to make that failure legible.
install_deps() {
  local d="$1" sub="$2" why="$3" stamp="$4" hash="$5"
  local log; log="$(installlog "$pick")"
  echo "→ $why — installing deps in $sub"
  echo "  install log: $log"
  npm_lock_acquire || return 1

  rm -f "$log.timeout"
  ( cd "$d" && exec npm install --legacy-peer-deps ) >"$log" 2>&1 &
  local pid=$! rc=0
  # Watchdog: no `timeout`/`gtimeout` on this box, so poll-and-kill. Children first — the
  # npm wrapper spawns lifecycle installs that would otherwise outlive it.
  ( sleep "$DEPS_TIMEOUT"
    if kill -0 "$pid" 2>/dev/null; then
      : >"$log.timeout"
      pkill -9 -P "$pid" 2>/dev/null || true
      kill -9 "$pid" 2>/dev/null || true
    fi ) >/dev/null 2>&1 &
  local watchdog=$!
  # Group-redirect stderr: when the watchdog SIGKILLs the install, bash otherwise prints
  # its own "Killed: 9" job notice ahead of our message.
  { wait "$pid"; rc=$?; } 2>/dev/null
  # Reap the watchdog quietly (its sleep first, so no stray process lingers). The
  # redirect swallows bash's "Terminated: 15" job notice on the success path.
  { pkill -P "$watchdog" 2>/dev/null || true
    kill "$watchdog" 2>/dev/null || true
    wait "$watchdog" 2>/dev/null || true; } 2>/dev/null
  npm_lock_release

  if [ "$rc" != 0 ]; then
    if [ -e "$log.timeout" ]; then
      echo "✗ npm install in $sub exceeded ${DEPS_TIMEOUT}s and was killed" >&2
    else
      echo "✗ npm install failed in $sub (exit $rc)" >&2
    fi
    echo "  ── last 25 lines of $log ──" >&2
    tail -25 "$log" >&2
    echo "  ───────────────────────────" >&2
    echo "  Slot NOT started. If node_modules looks gutted (a crashed reify leaves it" >&2
    echo "  half-retired): rm -rf '$d/node_modules' and re-run this script." >&2
    return 1
  fi
  echo "$hash" >"$stamp"
}

# Stamp lives inside node_modules so wiping deps also wipes the stamp. Hash package.json
# (not a lockfile — pnpm-lock.yaml is the authoritative one Vercel installs from, and
# package-lock.json is now gitignored/local-only because it silently drifted while
# tracked; package.json stays the true dep-change signal either way).
pkg_hash="$(git -C "$dir" hash-object package.json)"
deps_stamp="$dir/node_modules/.package-json-hash"
if [ ! -e "$dir/node_modules" ]; then
  install_deps "$dir" "$subdir" "first time" "$deps_stamp" "$pkg_hash" || exit 1
elif [ "$(cat "$deps_stamp" 2>/dev/null || true)" != "$pkg_hash" ]; then
  install_deps "$dir" "$subdir" "package.json changed since last install" "$deps_stamp" "$pkg_hash" || exit 1
fi
for f in .env.local .env; do
  [ -e "$MAIN_WT/$f" ] && [ ! -e "$dir/$f" ] && ln -s "$MAIN_WT/$f" "$dir/$f"
done

# --- boot the dev server on the slot's fixed port ---
echo "→ starting dev server on http://localhost:$port"
( cd "$dir" && exec npm run dev -- -p "$port" ) >"$(devlog "$pick")" 2>&1 &
DEV_PID=$!

# --- write the lock (session_pid becomes claude's PID after exec) ---
cat >"$(lock_file "$pick")" <<LOCK
slot=$pick
port=$port
dir=$dir
branch=$branch
dev_pid=$DEV_PID
session_pid=$$
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
LOCK

echo "✓ slot $pick ready — dir=$subdir  port=$port  branch=$branch"
echo "  dev log: $(devlog "$pick")"

if [ "$LAUNCH" = 1 ]; then
  cd "$dir"
  exec claude "$@"     # PID preserved → lock's session_pid tracks this claude session
else
  echo "  (--no-launch) cd $dir && claude"
fi
