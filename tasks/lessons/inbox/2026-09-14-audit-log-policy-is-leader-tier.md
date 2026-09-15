## The audit_logs policy is leader-tier, the Audit Log tab is admin-only in JSX only (2026-09-14)

Found by the RLS review of the settings-audit work (feat/truth-fixes). `audit_logs` INSERT requires leader-tier + own ministry + `actor_id = self` (append-only, unforgeable actor, cross-tenant denied) — good — but that is one tier looser than the surface implies: a **leader** can insert `settings.*` rows for changes only an admin can make, and can **SELECT the whole Audit Log** while the tab is gated `isAdmin` in the React tree alone. Neither is exploitable for data loss (the log is append-only and the settings writes themselves are admin-gated server-side), but the log's SELECT is a read of admin-only history by leader-tier.

Also: any write path that is NOT admin-gated (Funds admits `can_view_finances` team members) must write its audit row **server-side** — a browser-side `logAudit` from a member is refused by the policy and, before today, swallowed silently.

**Follow-up (needs a migration + rls-reviewer twice):** tighten `audit_logs` SELECT to admin-tier of the same ministry, and INSERT to admin-tier (or move all audit writes server-side and drop the client INSERT policy entirely — the cleaner end state). Not done in the truth-fixes pass because it is a policy change, and that pass was scoped to app-layer readouts.

**Closed 2026-09-15** (migration `audit_logs_admin_read_tier_bound_insert`, rls-reviewer before + after).
Live, the INSERT policy had been *no tier at all* — any member could self-attribute any action — not
"leader-tier" as this entry said from the SQL files. Now: SELECT = admin-tier of own ministry (plus a
leader's own `announcement.*` rows, so INSERT…RETURNING keeps working); INSERT = own ministry + self as
actor + (admin-tier, or leader-tier for `announcement.*` only); UPDATE/DELETE/MAINTAIN revoked from
`authenticated`, everything revoked from `anon`. See `2026-09-15-a-rule-check-inferred-the-policy-from-the-app-query.md`.
