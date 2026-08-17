-- APPLIED 2026-08-16 via Supabase MCP as migration
-- `scope_worship_charts_writes_to_ministry`. Recorded here for reference only —
-- do NOT run it by hand (CLAUDE.md: migrations go through the MCP).
--
-- WHAT WAS WRONG
-- `worship_charts_delete` and `worship_charts_upload` were both just
-- `bucket_id = 'worship-charts'` for `authenticated`: ANY signed-in user of ANY
-- ministry could delete or plant ANY other ministry's worship charts. Reproduced
-- live before the fix — a member of one ministry deleted all 8 objects belonging
-- to others through the real Storage-API delete path (rolled back). After the
-- fix the identical statement deletes 0, for a member of every ministry.
--
-- WHY A HELPER AND NOT AN INLINE SUBQUERY
-- Inline, `select 1 from teams …` inside a storage policy runs AS THE CALLER and
-- is filtered by teams' OWN RLS. It would have worked today purely because teams'
-- SELECT predicate happens to be the same `ministry_id = auth_ministry_id()` —
-- an invisible coupling that breaks silently the moment teams' RLS changes.
-- The helper takes the EXTRACTED SEGMENT rather than the path because a pinned
-- search_path cannot resolve `storage.foldername` (42883). pg_temp is listed
-- explicitly: bare `public` does not close the shadowing vector (verified — a
-- planted `pg_temp.teams` AND a planted `pg_temp.auth_ministry_id()` both still
-- return false).
--
-- WHY MINISTRY SCOPE, NOT TEAM MEMBERSHIP
-- `teamAccessLevel` (app/home/governance.ts) grants write to NON-members via
-- governance, so membership scoping would deny legitimate writers. Ministry scope
-- also matches every other bucket here (announcements, home-slides, receipts,
-- chat-avatars).
--
-- WHY SELECT IS UNTOUCHED
-- The bucket is public and chart URLs come from getPublicUrl. It is also what makes
-- the uploader's `INSERT … RETURNING` return a row at all — tightening it would
-- break reads AND uploads.

create or replace function public.auth_owns_team_folder(p_segment text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1
    from public.teams t
    where t.id::text = p_segment
      and t.ministry_id = auth_ministry_id()
  )
$function$;

revoke all on function public.auth_owns_team_folder(text) from public;
revoke all on function public.auth_owns_team_folder(text) from anon;
grant execute on function public.auth_owns_team_folder(text) to authenticated;
grant execute on function public.auth_owns_team_folder(text) to service_role;

-- DROP BY NAME. Permissive policies OR together, so adding a scoped policy beside
-- the bucket-wide ones would have left them decorative.
drop policy if exists "worship_charts_delete" on storage.objects;
drop policy if exists "worship_charts_upload" on storage.objects;

create policy "worship_charts_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'worship-charts'
    and public.auth_owns_team_folder((storage.foldername(name))[1])
  );

create policy "worship_charts_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'worship-charts'
    and public.auth_owns_team_folder((storage.foldername(name))[1])
  );

-- KNOWN, DELIBERATELY NOT CHANGED HERE:
--   • The 8 objects in the bucket are orphans of DELETED teams, so no authenticated
--     user can now delete them (service_role still can). Left in place — cleanup is
--     not a security fix and does not belong in the same change.
--   • There is no UPDATE policy, so `upsert: true` 403s even own-tenant. Pre-existing.
--     A future replace-in-place flow needs one with the predicate on BOTH `USING` and
--     `WITH CHECK`, or renaming into another tenant's folder re-opens the vector.
--   • `.remove()` returns HTTP success with 0 removed on an RLS-filtered delete —
--     a silent no-op. Matters only if a chart-delete UI is ever built.
--   • STILL UNSCOPED, on the record: `chat-attachments`, `bible-study` (the policy is
--     named for "pastor and admin" but its predicate is any authenticated user), and
--     `devotionals_storage_insert` (`auth.uid() IS NOT NULL`).
