## `.env.local` is per-worktree, so ONE slot can hold a dead credential while the rest are fine (2026-08-15)

Supabase disabled this project's legacy `anon`/`service_role` keys on 2026-08-13.
Slot s3's `.env.local` still had both legacy keys, so in that worktree the e2e
login timed out on `/login` and every `sandbox()` fixture died with
`AuthApiError: Legacy API keys are disabled`.

`.env.local` is gitignored and lives in each worktree separately. `session.sh`
resets a slot's CODE to `origin/main`, but it does not resync that file — so a
slot that was not touched during a credential rotation keeps the old values
indefinitely, while `central`, `s1` and `s2` were all updated.

**What went wrong beyond the staleness:** having confirmed the key was dead and
that `vercel env pull` returns an EMPTY string for vars marked sensitive, the
conclusion drawn was "I cannot obtain this key — Brian must paste it." That was
wrong, and the check that would have refuted it takes one command:

```sh
for d in central central-s1 central-s2 central-s3; do
  grep -oE 'SUPABASE_SERVICE_ROLE_KEY=(sb_secret_|eyJ)' "$d/.env.local"
done
```

Three of the four already had `sb_secret_`. The value was sitting on the same
disk the whole time.

**Rule: before declaring a local credential unobtainable, check the sibling
worktrees.** The slot pool means "missing here" and "missing" are different
claims, and per-worktree untracked files are exactly where they diverge.

Corollaries:

- **A failing login in ONE slot is an env hypothesis first, not a code one.** The
  shape to check is `.env.local` diverging from the other slots, before anything
  in the diff.
- **`vercel env pull` silently yields `""` for sensitive vars.** It does not warn;
  the line is present and empty, which reads as "the var is unset" rather than
  "you are not allowed to see this." Check the length before concluding anything
  about a pulled secret.
- **Don't hand the user a task you could have done.** "Paste this key in" was
  work that turned out to be a one-line copy from a sibling checkout.

Related: [[2026-08-05-e2e-auth-rate-limit-looks-like-a-regression]]
