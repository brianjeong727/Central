## Read `pg_policy`, never the files in `supabase/` (2026-08-19)

Closing the group self-join hole meant rewriting the `group_members` INSERT policy. The
checked-in `supabase/security_fixes_migration.sql` was the obvious source of truth for what
that policy currently said. It was **wrong**.

The live policy had a fourth branch the file did not (`is_group_member(...) AND type <>
'church'`, which is what lets a member add a friend to a group chat), and its admin/leader
branch carried an extra church-membership condition the file also lacked. Had I rewritten
from the file, I would have silently REMOVED a fix someone had already applied — a
regression introduced by a security fix, which is the worst possible shape.

It also meant a finding was backwards: I had recorded "the UI offers an add the DB refuses,
and CLAUDE.md is wrong about this policy". In fact CLAUDE.md described the LIVE policy
correctly and the FILE was stale. I nearly "corrected" a correct doc.

**Rule:** before altering ANY policy, function, or trigger, dump the live definition first —
`pg_policy` / `pg_get_expr(polwithcheck, polrelid)`, `pg_proc.prosrc`, `pg_trigger`. Diff the
live text against what you intend, and preserve every branch you are not deliberately
changing. The files under `supabase/` are a partial historical record of migrations that were
run, not a description of the schema; plenty of changes were applied via MCP and never written
back. The same is true of `groups`' own policies, which match no file in the tree at all.

Corollary: when a doc and a file disagree, the DATABASE breaks the tie — not the file, and not
the doc.
