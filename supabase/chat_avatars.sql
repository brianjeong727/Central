-- APPLIED 2026-08-16 via Supabase MCP, in two migrations:
--   1. chat_avatars_group_photo_and_dm_partner
--   2. chat_list_rpcs_drop_p_user_id_fallback   (RLS review finding A1)
-- Recorded here for reference only — do NOT run by hand (CLAUDE.md: migrations
-- go through the MCP). The current function bodies are the source of truth.
--
-- ── WHAT ────────────────────────────────────────────────────────────────────
-- A group chat (church / my) gets an uploaded photo; a DM renders the OTHER
-- participant's profile photo instead. `groups.avatar_url` holds the former.
--
-- ── WHY THE RPCs HAD TO CHANGE TOO ──────────────────────────────────────────
-- The chat list and the Home strip are served ENTIRELY by two SECURITY DEFINER
-- RPCs (`get_chat_list`, `get_chat_previews`) whose `RETURNS TABLE` is fixed.
-- `ALTER TABLE groups ADD COLUMN` alone renders nothing — the column is simply
-- invisible to the app. `CREATE OR REPLACE` cannot change a return signature
-- (42P13), so both needed DROP + CREATE.
--
-- ⚠️ THE TRAP: **DROP DISCARDS THE FUNCTION ACL.** The ACL was
--   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- and the ABSENCE of a PUBLIC entry was the only thing stopping the anon key
-- from calling either function with an arbitrary p_user_id and reading ANY
-- user's chat list (they resolved the caller as `coalesce(auth.uid(), p_user_id)`).
-- A bare CREATE restores EXECUTE to PUBLIC by default. Every recreate is
-- therefore followed by an explicit REVOKE FROM PUBLIC + FROM anon and a GRANT
-- to exactly the prior grantees. Verified after applying: ACLs byte-identical,
-- and the anon key gets 42501 / HTTP 401 on both.
--
-- Migration 2 then removed the `p_user_id` fallback entirely (`select auth.uid()`),
-- so the property is STRUCTURAL rather than a grant a future DROP could discard.
-- `p_user_id` stays in the signature — every client passes it — but is ignored.
-- Checked before applying: the only callers (chat-list.ts, home-app.tsx,
-- page.tsx) all use user-session clients, none the service-role client.
--
-- ── THE DM COLUMN IS WRITABLE BUT MUST NEVER BE READ ────────────────────────
-- The `groups` UPDATE policy splits on `type = 'church'` vs everything else, so a
-- DM lands in the second branch and EITHER participant can write
-- `groups.avatar_url` through the API — even though no UI offers it and
-- chatCapabilities() returns canManage:false for a DM. RLS is strictly WIDER than
-- the app gate. That value is inert ONLY because `chatChipAvatar()`
-- (app/home/chat-avatar.ts) returns the partner unconditionally for a DM and
-- never falls through to the group column. Enforced twice:
-- scripts/check-chat-avatar.sh (build) and e2e/chat-avatars.mobile.spec.ts, which
-- plants a group photo on a DM row and asserts the UI still shows the partner.

alter table public.groups add column if not exists avatar_url text;

-- Storage: mirrors home_slides_photo_insert / receipts_photo_insert exactly. The
-- bucket-wide announcement_images_select policy already exists and is REQUIRED —
-- uploads are INSERT…RETURNING, and RETURNING is subject to SELECT.
drop policy if exists chat_avatars_photo_insert on storage.objects;
create policy chat_avatars_photo_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'announcement-images'
    and (storage.foldername(name))[1] = 'chat-avatars'
    and (storage.foldername(name))[2] = (auth_ministry_id())::text
  );

-- NOTE: `announcement-images` has NO storage UPDATE policy, so a stable-name +
-- `upsert: true` write (the profile-images pattern) succeeds on the FIRST photo
-- and is RLS-denied on every replacement — a silent write trap. The uploader uses
-- a unique name + `upsert: false`, matching the bucket's two other writers.
--
-- The get_chat_list / get_chat_previews bodies are NOT reproduced here; read them
-- from the database. What matters when either is next touched is above: DROP
-- discards the ACL, so the REVOKE/GRANT pair must accompany every recreate.
