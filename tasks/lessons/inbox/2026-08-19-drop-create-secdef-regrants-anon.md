## DROP + CREATE of a SECURITY DEFINER function silently re-grants EXECUTE to `anon` and `PUBLIC` (2026-08-19)

Changing a `RETURNS TABLE` shape forces `drop function` + `create function` — `CREATE OR REPLACE`
cannot change a return type. That drop+create is NOT ACL-neutral, even when you carefully restore
the grants you saw in `proacl`.

Supabase ships a `pg_default_acl` entry for functions in schema `public` that grants `anon=X`. A
**newly created** function therefore starts with `{=X/postgres, anon=X, …}` — `PUBLIC` and `anon`
both hold EXECUTE — before your `grant` line ever runs. Restoring `authenticated` + `service_role`
looks correct and reads correct in a diff, but the function has quietly become anon-executable.

Hit while widening `get_chat_list` / `get_chat_previews` with reaction columns. Both are
SECURITY DEFINER and both had been deliberately hardened at some earlier point — 2 of the 25
SECDEF functions whose `anon` grant was revoked. The migration would have reversed that hardening
invisibly. Caught by the rls-reviewer's BEFORE pass, which proved it by creating a throwaway
function, granting it exactly the way the migration did, and reading the resulting ACL.

**The rule:** any migration that drops and recreates a function in `public` must follow every
`grant execute` with an explicit

```sql
revoke execute on function public.<fn>(<argtypes>) from public, anon;
```

and the AFTER pass must assert `has_function_privilege('anon', oid, 'execute') = false`, not just
eyeball `proacl`.

Data impact in this instance was nil — `auth.uid()` is NULL for `anon`, so the body returns zero
rows, and that was probed rather than assumed. **That is exactly why it is dangerous**: the class
of bug is silent, and the next SECDEF function to get a column added may not have a
`select auth.uid()` gate carrying the whole load.

Related: [[search-path-pin-does-not-propagate]] — the other way a SECURITY DEFINER migration looks
right and isn't.
