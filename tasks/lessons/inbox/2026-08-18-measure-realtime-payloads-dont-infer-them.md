## Measure realtime DELETE payloads — the migration file will lie to you (2026-08-18)

Building cache eviction off `group_members` DELETE events, I reasoned: the table has its
own `id` PK, so under default replica identity `payload.old` carries only `{id}` and
`group_id` never arrives. Correct conclusion, wrong reason — and the wrong reason was
about to be written into a comment as fact.

`group_members` IS `REPLICA IDENTITY FULL` (`supabase/multi_tenant_migration.sql:696`,
`supabase/read_receipts_migration.sql:9`). The payload is PK-only anyway. Probing the live
database settled it in about a minute (subscribe → insert a sandbox membership → delete it
→ inspect the event):

```
DELETE payload.old keys: ["id"]
```

Two things to carry forward:

- **A DELETE payload is PK-only regardless of replica identity.** The likely reason is that
  Realtime cannot evaluate RLS against a row that no longer exists — that part is still
  inference and is labelled as such in the code. What is measured is the shape.
- **The filtered subscription still fires.** This is the counter-intuitive half and the
  one the whole eviction path depends on: a channel subscribed with `user_id=eq.<uid>`
  DOES receive the DELETE, even though `user_id` is not in the payload for that filter to
  match against. If it did not, removal-by-an-admin would silently never evict anything.
  Anything depending on this needs an e2e test, because it is a platform behaviour that
  no local reasoning predicts.

Also observed while probing, worth someone's attention but NOT introduced by this work:
an UNFILTERED subscription to `group_members` DELETEs receives them too. The payload is a
bare row `id` with no tenant or user information, so the disclosure is minimal — but it
means DELETE events fan out without RLS, which is worth knowing before anyone subscribes
to a table whose PK is itself meaningful.

General rule: **for realtime payload shapes, probe the live database. Migration files
record intent; the platform decides behaviour, and the two disagreed here.**
