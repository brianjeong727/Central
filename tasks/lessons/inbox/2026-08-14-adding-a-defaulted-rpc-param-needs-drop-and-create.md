## Adding a defaulted param to an RPC needs DROP+CREATE, and CREATE re-grants anon (2026-08-14)

**What happened.** `claim_native_push_token(p_token, p_user_agent)` needed a third
`p_platform` argument so the Android shell could claim an FCM token. Two traps, both
silent, both caught only because the change was probed rather than read.

**Trap 1 — `CREATE OR REPLACE` does not replace; it overloads.** A parameter list is
part of a Postgres function's identity, so `CREATE OR REPLACE FUNCTION f(a,b,c
DEFAULT …)` leaves the original `f(a,b)` in place as a SECOND function. A live iOS
binary then calls `f` with two named args and matches BOTH — the 2-arg exactly, and
the 3-arg via its default — so Postgres raises **`function is not unique`** and push
breaks on every installed iPhone. The fix is `DROP FUNCTION f(text,text)` then
`CREATE`, in ONE transaction so there is no window where it is absent. After that a
2-arg named call resolves unambiguously to the 3-arg form and behaves identically —
which is exactly what the `DEFAULT 'ios-native'` is for.

**Trap 2 — a fresh CREATE re-grants `anon`.** The dropped function's ACL was
`{postgres, authenticated, service_role}`; PUBLIC had been revoked. The recreated one
came back as `{postgres, anon, authenticated, service_role}`. Supabase ships
`ALTER DEFAULT PRIVILEGES` granting EXECUTE on new public functions to
anon/authenticated/service_role, and **`REVOKE … FROM PUBLIC` does not remove a grant
held by a NAMED role** — PUBLIC and `anon` are different grantees. The migration had
a `REVOKE … FROM PUBLIC` in it and still widened access.

**The rule.** A `DROP`+`CREATE` on a SECURITY DEFINER function is an ACL reset.
Capture `proacl` BEFORE the migration and assert the exact string after:

```sql
select proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='<fn>';
```

"Harmless in practice" is not the bar — here `anon` could do nothing (the body raises
on `auth.uid() IS NULL`), but the posture still has to land where it started, because
the next function to get this treatment may not have that guard.

**Also: the constraints know the platform list too.** The FCM insert failed on
`push_subscriptions_keys_check` and `push_subscriptions_platform_check`, both of which
hard-coded `ios-native` as the only native platform. Reading the function told me
nothing about them — a live INSERT probe is what surfaced them. When adding a value
to an enum-ish column, grep `pg_constraint` for the old values, not just the code.

Related: [[rls-changes-are-verified-by-probe-not-by-reading]]
