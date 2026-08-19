## Audit the database, not the doc — two of three "known gaps" were already fixed (2026-08-19)

CLAUDE.md listed three storage buckets as carrying "unscoped bucket-wide authenticated
INSERT": `chat-attachments`, `bible-study`, `devotionals`. Planning a fix from that list
would have meant writing policies for two buckets that were already correct.

Read live from `pg_policy` on `storage.objects`:
- `chat-attachments` INSERT already required `is_group_member(<first path segment>, auth.uid())`.
- `devotionals` INSERT already required the first folder to equal `auth.uid()`.
- Only `bible-study` was genuinely open — role-gated to admin/leader of ANY ministry.

Both were then PROBED in both directions rather than read: foreign-group upload DENIED
42501, other-user folder DENIED 42501, prefix-collision (`<my-uuid>xyz/`) DENIED 42501.

Two general rules, both of which have now cost time twice in one week (the other was the
`group_members` INSERT policy, where the checked-in SQL file was likewise stale):

1. **`pg_policy` is the schema; `supabase/*.sql` and CLAUDE.md are commentary.** Many
   changes were applied via MCP and never written back, so the files are a partial
   historical record. Before changing any policy, dump the live definition and preserve
   every branch you are not deliberately changing.
2. **A security TODO is a hypothesis, not a finding.** Re-derive it before you act. Fixing
   an already-fixed thing is not harmless: the "fix" is written against an imagined
   predicate and can quietly REMOVE protection that was added later.

Corollary for scoping: prefer the gate that expresses the real rule. `is_group_member`
looked weaker than a `ministry_id` check but is actually correct AND safer here — 15 live
rows have a member whose ministry differs from the group's, and 14 are legitimate
multi-ministry users a tenant check would have locked out.
