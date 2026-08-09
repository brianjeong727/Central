# E2E harness — which Supabase project it writes to

By default the suite runs against the **same Supabase project as production**,
scoped to the E2E sandbox ministry. That is how it has always worked, and
nothing here changes it unless you opt in.

## Why you might want to change it

The suite is not a read-only observer. Every run:

- signs in twice (two real auth round-trips)
- creates chat groups and seeds messages — `chat-keyboard-inset.mobile.spec.ts`
  alone seeds 40 rows per run
- leaves those rows behind, so the sandbox tenant grows run over run

A dozen full-suite runs in an afternoon is a burst of database writes far heavier
than real usage, pointed at the project real users are on.

On **2026-08-08** that contributed to draining the project's **disk IO budget**.
Once that budget is gone the instance drops to baseline throughput (5 MB/s) until
it refills — roughly a day. Supabase Auth stopped answering, and because the app
waits on auth to restore a session before it renders, the **live app hung on
launch for everyone**. Postgres and PostgREST were fine; it presented as "the app
is broken", which cost real time to trace back to test load.

Tests should not be able to do that to production.

## Pointing the harness somewhere else

Add three vars to `.env.local`:

```
E2E_SUPABASE_URL=https://<other-project>.supabase.co
E2E_SUPABASE_ANON_KEY=...
E2E_SUPABASE_SERVICE_ROLE_KEY=...
```

Then start the dev server with the matching target and run the suite as usual:

```bash
scripts/dev-e2e.sh --port 3002          # dev server → E2E target
E2E_PORT=3002 npx playwright test       # harness    → same target
```

`e2e/load-env.ts` applies the same overlay the script does, so the two agree by
construction rather than by you remembering.

## The failure this is built to prevent

**Half-targeting.** Playwright seeds rows through the service key while the
browser reads through the app. Redirect only one and the suite seeds one project
and asserts against another — which surfaces as *"the row I just created isn't
there"*, indistinguishable from a product bug until someone thinks to check.

Both halves refuse to start half-targeted:

- `load-env.ts` throws if `E2E_SUPABASE_URL` is set without both keys
- `dev-e2e.sh` refuses on a missing key, and also refuses if the target is the
  same project as `NEXT_PUBLIC_SUPABASE_URL` (that isolates nothing)

The target is logged on every run — a silent switch is worse than a noisy one.

## What still has to be done by hand

The target project needs the schema and the sandbox fixtures (ministry, the two
test users). A Supabase **branch** inherits migrations, which is the least work;
a throwaway project needs them applied. Either way it is billed as its own
instance, so it is not free to leave running.
