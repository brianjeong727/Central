## A `search_path` pin does NOT propagate to the functions you call (2026-08-06)

Writing a new policy helper, I did the correct hardening:

```sql
create function public.auth_can_plan_events() returns boolean
language sql stable security definer
set search_path = ''          -- the Supabase linter asks for this
as $$ select (select public.auth_is_admin_or_leader()) or exists (...) $$;
```

Body fully qualified, so it looked airtight. It raised
`42P01: relation "profiles" does not exist` **for every caller**.

**Why:** `auth_is_admin_or_leader()` has NO `search_path` setting of its own
(`proconfig IS NULL`) and references `profiles` unqualified. A callee without its
own pin executes under the **caller's** `search_path`. My empty path therefore
propagated into it and broke a function that has worked for years. All 12 new
policies routed through the helper, so applying it would have taken the entire
Run Sheet / plan-tab authoring surface offline. It failed closed and loudly, but
it was still a hard outage — caught only by the mandatory before-apply review.

**The rule:** `set search_path = ''` is only safe if EVERY function you call is
also pinned. Before pinning a new helper to `''`, check its callees:

```sql
select proname, proconfig from pg_proc
where proname in ('the','callees','you','use');   -- proconfig NULL = unpinned
```

If any callee is unpinned, pin the new helper to `public` instead — which is what
`auth_ministry_id`, `group_ministry_id` and `is_group_member` all already do.
Fully qualifying your own body is necessary but NOT sufficient.

**Corollary — test a policy helper inside an actual policy evaluation, not just
as a direct `select helper()`.** Both paths hit this one, but a direct call is
not proof that the policy path works.

**Left open deliberately:** `auth_is_admin_or_leader()` is still unpinned, so the
next correctly-pinned helper hits this again. It is called by **104 policies
across 44 tables** — the widest blast radius in the codebase — so pinning it is
its own migration with its own review, never a drive-by. Not exploitable today
(neither `authenticated` nor `anon` can CREATE in `public`/`auth`/`extensions`,
so there is no shadowing vector); this is hardening, not a live hole.

Related: [[update-policy-missing-with-check]].
