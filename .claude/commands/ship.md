---
description: FINAL SHIP — merge the current feature branch to main. Brian-only, manual-trigger. Assumes visual sign-off is already given; executes immediately, no confirmation. Typing it IS the approval. Prefers a server-side GitHub PR merge; never touches the local main worktree. Never invoked by the loop.
---

This is a FINAL SHIP. Brian typed this himself — he has already reviewed and approved the branch under review. Execute immediately. No confirmation prompt, no re-running the loop.

**This repo runs every session in its own git worktree, and `main` lives in its own separate worktree.** So a local `git checkout main` + fast-forward + `git push` is slow and lock-prone (fast-forwarding a stale main worktree across many commits times out and leaves stale `*.lock` files). DO NOT do that. Update `main` only via a GitHub PR merge (primary) or a direct ref push (fallback) — never by checking out or fast-forwarding the local main worktree.

Steps:

1. **Identify the branch to ship** = the current branch (`git branch --show-current`). Then `git fetch origin --quiet` and guard:
   - If it is `main`/`master` → STOP in one line: "on main, nothing to ship."
   - If `git rev-list --count origin/main..HEAD` is `0` → STOP in one line: "branch has nothing ahead of main (already merged, or you're in the wrong worktree) — not shipping." This is the safety net against shipping a stale/shared branch by mistake.

2. **Commit uncommitted changes** on this branch first, with a clear message — never silently drop them. Touch only this worktree; leave other worktrees alone.

3. **Build guard:** run `npm run build` ONCE (skip only if the diff is docs/markdown-only with zero code/config change). If it FAILS → STOP; never merge a red build. This is the only quality gate that halts the command.

4. **Push the branch** so the remote tip is exactly what you built: `git push -u origin HEAD`.

5. **Merge to main — PRIMARY path (GitHub PR, no sentinel needed):**
   - Find the PR for this branch: `gh pr view --json number,state,mergeStateStatus` (or `gh pr list --head "$(git branch --show-current)" --json number,state,mergeStateStatus`).
   - If no open PR exists yet, create one: `gh pr create --base main --fill`.
   - Merge it: `gh pr merge <n> --merge` (this repo uses merge commits). `mergeStateStatus: UNSTABLE` (non-blocking checks still pending) is fine to merge. `BLOCKED` (conflicts or a required check failing) → STOP and report why. Do NOT create the sentinel on this path — it isn't used.

6. **Merge to main — FALLBACK only if there is no GitHub remote / `gh` is unavailable:** authorize one protected push and update the remote ref directly, WITHOUT checking out main:
   - Drop the single-use sentinel the main-branch-guard consumes. `$CLAUDE_PROJECT_DIR` may be unset, so derive the path and cover both:
     `touch "$(git rev-parse --show-toplevel)/.claude/.ship-authorized"; [ -n "$CLAUDE_PROJECT_DIR" ] && touch "$CLAUDE_PROJECT_DIR/.claude/.ship-authorized"`
   - `git push origin HEAD:main` (fast-forwards the remote ref; no local main worktree, no slow checkout). If rejected as non-fast-forward, main has diverged → STOP and report (do not force).
   - Delete the sentinel(s) immediately after: `rm -f "$(git rev-parse --show-toplevel)/.claude/.ship-authorized" "${CLAUDE_PROJECT_DIR:-/dev/null}/.claude/.ship-authorized"`.

7. **Verify + report:** confirm `origin/main` advanced (`git ls-remote origin -h refs/heads/main`), and on the PR path confirm the PR is `MERGED`. Report in one human sentence what shipped and that main is updated. If other feature branches / PRs from this session are still open, mention them in one line so Brian can ship those too.

Never leave a sentinel behind. Never create the sentinel on the PR path. Never fast-forward or check out the local main worktree. Never re-verify visual correctness (Brian already signed off).
