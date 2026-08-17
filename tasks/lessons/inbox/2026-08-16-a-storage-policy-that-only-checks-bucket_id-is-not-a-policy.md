## A storage policy whose only predicate is `bucket_id` is not a policy — it's an ACL of "anyone logged in" (2026-08-16)

`worship_charts_delete` read, in full:

```sql
USING (bucket_id = 'worship-charts')  -- TO authenticated
```

That is not a tenant boundary. Any signed-in user of any ministry could delete every other
ministry's worship charts — proven, not theorised: a member of one ministry deleted all 8
objects in the bucket through the real Storage-API delete path (rolled back). The upload
policy was identically shaped, so the plant vector — delete then re-insert at the same
path — was open too.

It reads as safe because the bucket name is right there in the predicate. Scanning it, you
see the bucket being checked and move on. **`bucket_id` is a namespace selector, not an
authorization check** — every policy on `storage.objects` needs it, and it never says
anything about who.

Three things worth carrying, none of which I'd have got right unaided:

1. **Permissive policies OR.** Adding a correctly scoped policy alongside a bucket-wide one
   leaves the bucket-wide one live and the new one decorative. The fix must `DROP POLICY`
   the old one BY NAME.
2. **An inline subquery in a storage policy runs as the CALLER**, so it is filtered by the
   referenced table's own RLS. `exists (select 1 from teams where …)` would have worked here
   only because `teams`' SELECT predicate happens to be the same `ministry_id =
   auth_ministry_id()`. That is an invisible coupling that breaks silently the day teams' RLS
   changes — and it fails CLOSED for legitimate users, which is the confusing direction. Put
   the predicate in a `SECURITY DEFINER` helper.
3. **A helper for a storage policy must take the EXTRACTED SEGMENT, not the path.** A pinned
   `search_path` cannot resolve `storage.foldername` → `42883` at call time. Extract in the
   policy, pass text to the helper. And pin `public, pg_temp` explicitly — verified by
   planting both a `pg_temp.teams` and a `pg_temp.auth_ministry_id()` and confirming the
   helper still returned false.

**Where to look next — these are still open**, found in passing while probing this one:
`chat-attachments` (already flagged in CLAUDE.md), `bible-study` (the policy is *named* for
"pastor and admin" while its predicate is any authenticated user — the name actively
misleads), and `devotionals_storage_insert` (`auth.uid() IS NOT NULL`). A bucket whose
policy predicate does not mention `auth_ministry_id()` or an ownership lookup is worth
opening every time.

Related: [[oauth-name-lands-once-and-never-refreshes]] — same shape of failure, where the
thing that looks like a check isn't one.
