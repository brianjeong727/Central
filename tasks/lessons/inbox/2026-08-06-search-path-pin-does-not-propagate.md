## `search_path` on SECURITY DEFINER helpers: two traps, one correct form (2026-08-06)

The correct pin for a policy helper in this codebase is:

```sql
set search_path = public, pg_temp
```

Not `''`, and **not bare `public`**. Both of the obvious choices are wrong, for
opposite reasons, and both were hit in one task.

### Trap 1 — `''` does not propagate INTO your callees, it propagates OUT

A new helper was written with the hardening the Supabase linter asks for:

```sql
create function public.auth_can_plan_events() returns boolean
language sql stable security definer
set search_path = ''
as $$ select (select public.auth_is_admin_or_leader()) or exists (...) $$;
```

Body fully qualified, so it looked airtight. It raised
`42P01: relation "profiles" does not exist` **for every caller**.

`auth_is_admin_or_leader()` had NO `search_path` of its own (`proconfig IS NULL`)
and referenced `profiles` unqualified. **A callee without its own pin runs under
the caller's `search_path`** — so the empty path propagated into a function that
had worked for years. All 12 new policies routed through the helper: applying it
would have taken the whole Run Sheet / plan-tab authoring surface offline.

Before pinning a new helper to `''`, check its callees:

```sql
select proname, proconfig from pg_proc where proname in ('the','callees');
-- proconfig IS NULL  => unpinned => it will inherit YOUR path
```

### Trap 2 — bare `public` does NOT close the shadowing vector it exists to close

The obvious correction is `set search_path = public`. **That is still exploitable.**
Postgres searches `pg_temp` **first for relations** unless `pg_temp` is listed
explicitly. Proven live with a planted `pg_temp.profiles` claiming a plain member
is an admin:

| pin | result |
|---|---|
| unpinned | `true` — shadowed |
| `public` | **`true` — still shadowed** |
| `public, pg_temp` | `false` — closed (real leader still `true`) |

All three client roles hold `TEMPORARY` on the database. Listing `pg_temp` LAST is
the entire fix.

**The worst case is not role escalation — it is tenant relocation.** Shadowing
`auth_ministry_id()` (bare `public`, unqualified `profiles`) doesn't make you an
admin, it moves you into another ministry. Any helper that resolves the tenant
boundary is the highest-value target on the list.

### Two more things this cost

- **Test a policy helper inside a real policy evaluation**, not just as
  `select helper()`. Both paths broke here, but a direct call is not proof.
- **Negative controls or it didn't happen.** Five `false` results after a fix look
  identical to a broken probe. The proof only counted because the same session
  showed the attack still working against an unpinned function.

`event_plan_ministry_id()` is the one exception worth keeping at `''`: fully
qualified body, calls nothing. That is the strongest form when you can get it.

### The whole class is now closed — keep it that way

All 48 `SECURITY DEFINER` functions in `public` either list `pg_temp` explicitly
or pin `''` with a fully qualified body. **Any new one must too** — that is the
standing rule this lesson exists to create.

Two things learned while finishing the sweep:

- **A function that was already pinned to bare `public` cannot need `extensions`** —
  bare `public` already excluded it, so a body calling `uuid_generate_*` / `crypt`
  unqualified would already be broken. Only a genuinely UNPINNED function can
  silently lose `extensions` when you pin it. Pin those to
  `public, extensions, pg_temp`.
- **The path you pin is inherited by unpinned triggers your writes fire.**
  `handle_new_user` is fully qualified and needs nothing extra, but its INSERT
  fires `guard_profiles_deleted_at`, an unpinned SECURITY INVOKER trigger that
  runs under whatever path it inherits. Look one level down from the body you are
  reading.

Related: [[update-policy-missing-with-check]].
