# A column-level REVOKE is a silent no-op when a table-level grant exists

**What happened.** To stop a non-finance planner rewriting `event_plans.budget_category_id`
I ran the obvious statement:

```sql
REVOKE UPDATE (budget_category_id) ON public.event_plans FROM authenticated, anon;
```

It applied successfully and changed **nothing**. The verification query caught it —
`has_column_privilege('authenticated','public.event_plans','budget_category_id','UPDATE')`
still returned `true`. Cause: `event_plans` carries a **TABLE-level** UPDATE grant to
`authenticated` and `anon` (the Supabase project default), and a column-level REVOKE can only
remove column-level grants. It cannot subtract from a table-level one.

**Why it matters.** The failure is silent in both directions: the statement reports success,
and the surface keeps working, so nothing looks wrong. I had also written the same broken
statement into a deploy-time file for a *different* column (`budget_allocated`) — it would
have been run at deploy, reported success, and left the column writable while the commit
message claimed "Treasurer only" was now enforced at the database level.

Same family as the earlier lesson about `REVOKE ALL ON FUNCTION … FROM PUBLIC` leaving
`authenticated`'s **direct** EXECUTE grant intact (Supabase's default privileges grant
functions directly to the roles, not via PUBLIC). Both are "the revoke I wrote does not target
the grant that actually exists."

**How to apply.**
1. Before revoking any column, check what kind of grant exists:
   ```sql
   select grantee, privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name='<t>' and grantee in ('authenticated','anon');
   ```
2. If UPDATE appears there, a column REVOKE will not work. Use **revoke-then-regrant**:
   ```sql
   REVOKE UPDATE ON public.<t> FROM authenticated, anon;
   GRANT UPDATE (<every column that should stay writable>) ON public.<t> TO authenticated;
   ```
   The omitted columns are the protected ones. **Any column added to the table later must be
   added to that GRANT list** or it silently becomes unwritable by clients — the inverse
   failure, equally silent.
3. **Always verify a grant change with `has_column_privilege`, never trust the statement
   succeeding.** DDL that "worked" is not evidence the privilege moved. This is now the second
   grant-shaped thing in one session that applied cleanly and did nothing.

Related: CLAUDE.md already documents the `ministries.timezone` incident (a new column on a
table whose table-level grant was revoked lands UNGRANTED and PostgREST 403s the whole query).
That is the same mechanism seen from the opposite side — worth reading the two together, since
the mental model that explains one explains the other.
