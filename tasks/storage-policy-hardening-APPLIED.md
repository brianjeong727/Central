# Scope the last three unscoped storage INSERT policies (APPLIED to prod)

**Applied:** 2026-08-16 to Central prod (`wgqpnilaokfipocsugqo`), migration
`storage_policy_hardening_chat_devotionals_biblestudy`.
**Branch:** `fix/storage-policy-hardening`.
**Origin:** audit of every policy on `storage.objects` after #315 fixed the
`worship-charts` cross-tenant delete. `rls-reviewer` gated both ends (pre-apply design
review, post-apply live probes).

## The class of bug

`bucket_id = '<name>'` is a **namespace selector, not an authorization check**. Every
policy on `storage.objects` carries one; alone it says nothing about *who*. That is what
made the worship-charts hole read as safe, and it is what these three shared.

## What was wrong, and what shipped

### 1. `chat-attachments` INSERT — unscoped
`WITH CHECK (bucket_id = 'chat-attachments')` TO `authenticated`. Any signed-in user of
any ministry could write to any path — proved with an arbitrary-path upload returning
**200**. (No DELETE/UPDATE policy exists for this bucket, so it never had the
worship-charts *delete* hole: cross-user delete returns 403 and is denied by default.)

Now requires membership of the group named by the first path segment. Path convention is
`<group_id>/<filename>`; the single writer is `app/home/tabs/chats-tab.tsx` (upsert:false),
and the `messages` INSERT policy already required the identical predicate — so the bucket
cannot be tighter than a working send.

```sql
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND is_group_member(
        (CASE WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-…-[0-9a-fA-F]{12}$'
              THEN (storage.foldername(name))[1] END)::uuid,
        auth.uid())
)
```

**`CASE`, not `regex AND cast`.** The first draft guarded the cast with an AND-chained
regex. Postgres does **not** define `AND` evaluation order, and the reviewer proved the
cast raises `22P02: invalid input syntax for type uuid` when reached — a **500 where a
403 belongs**. `CASE` evaluates the guard before the cast by construction.

### 2. `devotionals` INSERT — unscoped
`auth.uid() IS NOT NULL`, while the same bucket's DELETE and UPDATE were already scoped
to `(auth.uid())::text = (storage.foldername(name))[1]`. The write half was simply looser
than the delete half; now they agree.

### 3. `bible-study` INSERT — the name lied
Named `"pastor and admin can upload bible study pdfs"`, predicate
`auth.role() = 'authenticated'` — **any member could upload**. A policy whose NAME asserts
an authorization rule it does not implement is exactly how the worship-charts hole
survived review, so the **name was corrected to the behaviour**, not the reverse:
`bible_study_admin_leader_insert`, gated on `auth_is_admin_or_leader()` (its body includes
`pastor`, and it mirrors the effective write gate on `bible_study_sheets`).

**Plus the missing UPDATE half.** `app/actions/bible-study.ts` uploads with `upsert: true`
and the bucket had **no UPDATE policy at all** — re-finalizing an existing sheet was
already RLS-denied in production. `bible_study_admin_leader_update` mirrors the INSERT
gate. This was a pre-existing bug neither the audit nor the draft was looking for.

## Verified post-apply (27/27, real Storage API, zero residue)

- **chat-attachments** — member into own group **200** (no regression); other ministry's
  group **403**; `not-a-uuid/x.png`, bucket-root `x.png`, `/x.png`, near-miss segment all
  **403 with an RLS violation, not 500**; cross-user delete and upsert still denied.
- **The draft-DM flow end-to-end as a plain member** — `get_or_create_dm` → upload into the
  just-created group → `messages.insert({attachment_url})`, all 200. This was the failure
  mode most likely to lock users out, and it does not exist: `get_or_create_dm` inserts
  both `group_members` rows before returning.
- **devotionals** — own folder 200, other user's folder 403, bucket root 403, own
  upsert/delete 200, cross-user delete denied.
- **bible-study** — member insert **403** (the behaviour change is real), admin insert
  **200**, admin re-upsert **200** with `updated_at` moving and `created_at` holding (the
  new UPDATE half genuinely works; it was denied before), member upsert over an admin's
  PDF 403. Finalize end-to-end: admin updates `bible_study_sheets` → 1 row; member → 0
  rows. Storage and table now share one gate, so no member ever had a working finalize to
  lose.
  *Probing note:* this bucket rejects non-PDF mime with **415 before RLS runs** — a PNG
  probe here proves nothing.
- **Integrity** — 19 → 20 policies, the +1 being exactly `bible_study_admin_leader_update`;
  no duplicates, no restrictive policies, every policy still carries a `bucket_id`
  predicate, RLS enabled, owner and grants unchanged, helper `search_path` pins intact.

## Remaining storage gaps — NOT fixed here (Brian's call)

1. **Isolation (real):** `bible-study` has **no ministry scoping at all** — objects at
   bucket root (`<sheetId>.pdf`), and its SELECT policy `ministry members can read bible
   study pdfs` has predicate `bucket_id = 'bible-study'` TO `public` — the same
   name-lies-about-predicate shape just fixed on the INSERT. Every ministry's study PDFs
   share one flat namespace. Fixing needs a path migration + object move + `pdf_url`
   rewrite, so it is its own change.
2. **Exposure, not isolation:** `chat-attachments`, `devotionals` and `bible-study` are
   **public buckets** — RLS is not in the read path, so anyone holding a URL reads DM
   images, journal photos and study PDFs, permanently. Deleting a message or journal entry
   removes nothing from storage (no DELETE policy, and no `.remove()` call anywhere).
   Needs a deliberate private-bucket + signed-URL decision.
3. **Latent traps (not gaps today):** `worship-charts` has no UPDATE policy — safe only
   while all three call sites stay `upsert:false`. `announcement_images_select` is
   bucket-wide to `authenticated`, so any authenticated user of any ministry can read
   another ministry's receipt images through the authenticated API.
4. **Same class, non-storage:** policy `chat_topic_members_read` on `public.messages` uses
   the unguarded `regex AND cast` shape abandoned above — worth converting so it is not
   copied forward.
5. **Housekeeping:** 6 orphaned `chat-attachments` objects and 2 orphaned `bible-study`
   PDFs from the pre-reseed era, referenced by zero rows. (Notably **0 of 9,366 messages
   carry an `attachment_url`**, so the chat-attachments tightening had no live data to
   disturb.)
