## Committing to a branch whose PR already merged silently orphans the work (2026-08-01)

Hit **twice in one session**, both times unnoticed until an explicit audit:

1. A handoff doc was committed to `fix/signup-existing-email` *after* that branch had merged via
   its PR. The commit sat on neither `main` nor `origin` — a local-only branch, 1 ahead, unpushed.
2. Three e2e fix commits were pushed to `chore/archived-dedup-hardening` *after* PR #257 merged.
   Pushing to a merged branch does **not** reopen the PR, so those commits were on `origin` but
   would never reach `main`.

Both look completely healthy locally: the branch exists, `git log` shows the commits, the push
succeeds. Nothing warns you.

**The audit that finds it** — run before declaring work done, not after:

```sh
git fetch origin --quiet
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  ahead=$(git rev-list --count origin/main..$b 2>/dev/null)
  unpushed=$(git rev-list --count origin/$b..$b 2>/dev/null || echo '?')
  [ "$ahead" != "0" ] && echo "$b ahead-of-main=$ahead unpushed=$unpushed"
done
```

Anything with `ahead-of-main > 0` and no open PR is orphaned. Cross-check with
`gh pr list --state open`.

**Rescue:** branch fresh off current `origin/main` and cherry-pick the orphans onto it, rather
than reopening or force-pushing the merged branch — `main` has usually moved on, and a fresh
branch makes the PR diff honest.

**Prevention:** after a PR merges, treat that branch as dead. Start the next commit on a new
branch off updated `main`. The risk is highest in a long session where a PR gets merged
mid-flight while you keep working in the same worktree.
