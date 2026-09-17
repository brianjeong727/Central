## A rule check inferred the RLS policy from the app query — and a spec had frozen the same wrong inference (2026-09-15)

The truth-fixes enforcer sweep raised a **block**: "a member can still open a draft
announcement by deep link… the feed filters drafts in the *query* for non-leaders, which is
the evidence RLS doesn't." A follow-up task was opened to write an announcements policy.

`pg_policy` said otherwise. The live SELECT policy already reads
`status IS NULL OR status = 'published' OR created_by = auth.uid() OR auth_is_admin_or_leader()`.
The DB was never open; the app filter was belt-and-braces. Worse, an e2e test
(`announcements-p4-shots.mobile.spec.ts`, "RLS still returns the draft to a member") had
encoded the same inference as an *assertion* — and it had been silently failing on a
Node websocket-constructor error for long enough that nobody noticed it no longer described
the database.

Meanwhile the thing the 09-14 lesson called "leader-tier INSERT" on `audit_logs` was, live,
**no tier at all** — any member could self-attribute any audit action. Reading the lesson
instead of the catalog understated the real hole and overstated the imaginary one.

**Rule:** an app-side filter is not evidence about the policy in either direction. A finding
about RLS is not a finding until it quotes `pg_get_expr(polqual/polwithcheck)` from the live
DB. Same for a spec: a test that asserts what a policy *permits* must be re-run whenever a
policy changes, and a test that can't construct its client is not a passing test.
