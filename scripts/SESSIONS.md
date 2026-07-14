# Session worktree slots

Every Claude Code session runs in its **own git worktree on its own dev port**, so you can
run several sessions at once and compare each against `main` side-by-side. The worktrees are
a **fixed, reusable pool** — sessions claim a free slot and hand it back; we never create a
new worktree per session (no `central-s3000`).

## The pool

Defined in [`.claude/session-slots.json`](../.claude/session-slots.json):

| Slot | Worktree dir   | Dev port |
|------|----------------|----------|
| main | `central`      | 3000 (shared — don't do feature work here) |
| s1   | `central-s1`   | 3001 |
| s2   | `central-s2`   | 3002 |
| s3   | `central-s3`   | 3003 |

Each slot directory has its own real `node_modules` and a symlinked `.env.local`. Live state
(which slots are claimed) lives in `.git/session-locks/` — shared across all worktrees, never
committed.

## Start a session

```bash
./scripts/session.sh                 # claim the first free slot, leave it on main
./scripts/session.sh "fix login bug" # also create branch feat/fix-login-bug
./scripts/session.sh --slot s2       # request a specific slot
./scripts/session.sh --dry-run       # show which slot would be claimed, do nothing
```

It claims a free slot, resets it to a fresh `main`, (optionally) branches, boots the dev
server on the slot's port, writes a lock, and launches `claude` inside the slot. The session
is *born* in the right directory with its server already up.

A slot is **refused** (without `--force`) if it has uncommitted changes or sits on a branch
with commits not yet in `origin/main` — this protects active/unpushed work.

## Grid view (tmux)

```bash
./scripts/session-grid.sh          # open (or reattach to) the grid — `cgrid` alias
./scripts/session-grid.sh --kill   # tear it down
```

Opens one tiled tmux window over the whole pool: a control pane in the shared `central`
checkout (running `session-status.sh`, for status/merges) plus one pane per slot. Free
slots are claimed via `session.sh --slot` — own worktree, own port, `claude` running in
the pane. Busy/held slots open a plain shell in the slot dir instead; the grid never
steals or resets anything `session.sh` itself would refuse. Running it while a grid
already exists just reattaches (one grid at a time).

Requires `tmux` (`brew install tmux`). Pane titles/borders and mouse-copy come from
`~/.tmux.conf` (a dotfile, not part of this repo).

## During a session

The `SessionStart` hook reminds you which slot/port you're in. If you ever launch a bare
`claude` from the shared `central` checkout, the hook warns you and lists free slots. Branch
your task off `main` before editing — the `main-branch-guard` blocks edits on `main`.

## End a session

The `SessionEnd` hook frees the slot's lock automatically. The **dev server is left running**
so the work stays reviewable; the next claim of that slot restarts it. To free a slot
manually:

```bash
./scripts/session-release.sh s1            # free s1's lock, leave dev up for review
./scripts/session-release.sh --here        # free the slot for the current directory
./scripts/session-release.sh s1 --stop-dev # free and stop the dev server now
./scripts/session-release.sh --reap        # clean stale (dead-PID) locks
```

## Check status

```bash
./scripts/session-status.sh
```
Shows each slot's port, free/busy state, checked-out branch, and whether a dev server is up.

## Notes

- **Reuse, never grow.** The same `central-s1..s3` directories are reused forever; a session
  just checks out a different branch into a free one.
- **Ports are bound to the directory**, not the session — slot s1 is always 3001.
- **Migration:** sessions that predate this system have no lock yet. They auto-adopt a lock on
  their next `SessionStart` (start/resume/clear); until then the unmerged-work guard still
  protects them from being reclaimed.
