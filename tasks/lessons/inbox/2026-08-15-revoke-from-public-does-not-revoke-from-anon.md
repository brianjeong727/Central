## `revoke … from public` does NOT remove anon's grant — Supabase grants it DIRECTLY (2026-08-15)

Supabase ships this in every project:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
```

So **every new function in `public` is born with DIRECT grants** to those three roles, on top
of the `=X` PUBLIC entry. `revoke all on function … from public` removes only the PUBLIC entry
and silently leaves `anon=X/postgres` in place. It raises no error — a revoke that removes
nothing succeeds.

This bit twice in one session:

1. A reviewed, sanctioned migration used `revoke … from public; grant execute … to authenticated;`
   for a new function. Its own post-assertion then returned
   `has_function_privilege('anon', …) = true`, with
   `proacl = {postgres=X, anon=X, authenticated=X, service_role=X}`. **Only running the assertion
   caught it** — the SQL looked correct and applied cleanly.
2. Auditing outward from that, **13 arg-taking `SECURITY DEFINER` functions in `public` were
   anon-executable**, same root cause. Twelve are read-only but answer authorisation questions
   for an arbitrary UUID with only the publishable key and no session —
   `is_group_member(group_id, user_id)`, `is_ministry_member(user_id, ministry_id)`,
   `group_ministry_id(group_id)`: an unauthenticated cross-tenant membership oracle.
   The thirteenth, `create_ministry_auto_chats(uuid, text, uuid)`, is DEFINER + **VOLATILE** and
   INSERTs into `groups` while taking the TENANT as an argument — an unauthenticated
   cross-tenant write primitive. It had zero callers in code and zero references from other
   function bodies; it was pure attack surface. Revoked (`{postgres, service_role}`).

**Rule: harden a new function by revoking the NAMED roles, then ASSERT the ACL.**

```sql
create function public.f() ... ;
revoke all on function public.f() from public, anon, authenticated, service_role;
grant execute on function public.f() to authenticated;   -- only what a call site needs
-- then PROVE it, in the same migration:
--   select has_function_privilege('anon','public.f()','execute');  -- must be false
--   select proacl from pg_proc ...                                  -- eyeball the final set
```

Corollaries:

- **A revoke that removes nothing raises no error.** There is no feedback signal, so the
  assertion is not belt-and-braces — it is the only evidence.
- **`SECURITY DEFINER` + an argument naming the tenant is the dangerous shape.** DEFINER bypasses
  RLS, and a tenant-id parameter hands the caller the choice of tenant. `auth.uid()`-derived
  identity with no such parameter is the safe form (that is why the DM-tombstone helper takes no
  arguments and is `SECURITY INVOKER`).
- **Grant to the narrowest role a real call site needs.** An INVOKER function keyed on
  `auth.uid()` is useless to `service_role` (no JWT), so granting it converts a loud `42501`
  into a silent empty result.
- **Check the ACL of a NEARBY working function to learn the target shape.** `get_chat_list` sat
  at `{postgres, authenticated, service_role}` with no `anon` — the correct answer was visible
  one row away in `pg_proc`.

Outstanding: the 12 read-only DEFINER helpers are still anon-executable. They are invoked inside
RLS policies, so some may genuinely need `anon` for public surfaces (`/ministries` discovery,
`/api/calendar/`) — a blanket revoke could break those. Needs its own task with an rls-reviewer
pass, not a bulk revoke.

Related: [[2026-08-06-search-path-pin-does-not-propagate]]
