---
description: Catch this session worktree up to the latest integrated main. Fetches origin, verifies the current work is merged or clean (never clobbers unmerged/uncommitted work), switches to a fresh detached origin/main, restarts the slot's dev server, and confirms a route returns 200. Run after your branch merges (or to resync) so you're working on the latest main.
---

Bring the CURRENT session worktree up to the latest integrated `main`. Follow the session-worktree model (CLAUDE.md §Session worktrees: slots land on `origin/main`; work propagates only by merging to main). This command NEVER pushes or merges — it only moves the local worktree forward.

Steps:

1. **Refuse in the shared checkout.** If the worktree directory basename is `central` (the shared main checkout, port 3000), STOP — catchup is for session slots (`central-s1/2/3`) only. Say so in one line.

2. **Fetch:** `git fetch origin` (quiet).

3. **Assess state:** current branch (or detached), `ahead = git rev-list --count origin/main..HEAD`, `behind = git rev-list --count HEAD..origin/main`, and `git status --porcelain`.

4. **Guard — never clobber work:**
   - **Uncommitted changes** (`git status --porcelain` non-empty, ignoring untracked stray files you can identify): STOP and surface them. Let Brian decide (commit / stash / discard). Do not reset.
   - **Unmerged local commits** (`ahead > 0`) AND the current branch is NOT already merged into `origin/main`: STOP and surface it — those commits would be lost. Offer to push/PR them first, or discard only on explicit confirmation. (Check merged-ness with `git branch --merged origin/main` or by confirming the branch's work is in `origin/main`.)
   - **Already merged** (its work is in `origin/main`, so `ahead = 0`): proceed — being `behind` is expected and safe.
   - **Already up to date** (`ahead = 0 && behind = 0`): say "already up to date", just confirm dev health (steps 7–8), and skip the switch.

5. **Stop the slot's dev server FIRST** (before any checkout/build) to avoid the `next build`/`next dev` `.next` livelock and a stale server. Derive the slot's port by matching the worktree directory basename against `.claude/session-slots.json` (`slots[].dir` → `port`, e.g. `central-s1` → 3001). Kill it: `lsof -ti:<port> | xargs kill -9` (ignore "no process").

6. **Switch to latest main:** `git checkout --detach origin/main`. Land DETACHED at the latest integrated main (the slot's clean landing state). When the next task is named, branch off it with `git checkout -b feat/<slug>` before committing.

7. **Refresh deps if needed:** quick-check a known dep resolves (`node -e "require.resolve('next')"`). If it fails — or `package.json` changed versus the previous HEAD — run `npm install --legacy-peer-deps` (local installs here need `--legacy-peer-deps`; a brand-new dep added to main is the usual cause of a missing module after catchup).

8. **Restart dev** on the slot's port in the background: `npm run dev -- -p <port>` (this wipes `.next`). ALWAYS the `-p` flag — `next dev` ignores the `PORT` env var, so an env-var or bare launch binds default port 3000, collides with the shared checkout's server, and wedges port-less while holding the slot's `.next` (this exact failure took s3 down on 2026-07-14). Write its log to the slot's devlog if convenient.

9. **Verify health BEFORE reporting:** poll until `curl -s -o /dev/null -w '%{http_code}' http://localhost:<port>/` returns `200`, and confirm a real app route (`/home`) returns `200` or a `3xx` auth redirect — NOT `500`. Don't hand back until a rendered route is healthy.

10. **Report** in one or two plain sentences: the new HEAD (the `origin/main` commit it landed on), whether the old branch was already merged, and that dev is healthy on the slot's port. Mention the old merged branch can be deleted if Brian wants (don't delete it unless asked).
