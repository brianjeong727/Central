-- Young Adults cohort backfill — APPLIED 2026-08-19 via Supabase MCP.
--
-- WHY. Between shipping the young-adult signup option and fixing the join path,
-- a young adult who joined a ministry was placed in the central chat and nowhere
-- else: resolveSignupGrade returned null meaning "nothing to write" (the
-- handle_new_user trigger had already copied `grade` from signup metadata), and
-- that null was passed on as the COHORT, so cohortChatName had nothing to resolve.
-- See fix(join) — app/actions/ministry.ts, and e2e/young-adult-join.spec.ts which
-- now covers signup → join → chats.
--
-- The code fix repairs every future join. This repairs the ones already stranded.
--
-- RESULT when applied: 1 chat created (Central), 2 members added
-- (bj.jihoon.19059@gmail.com, jchoi@centralpgh.org). Verified afterwards:
-- 2 young adults with a ministry, 2 in the chat, 0 missing.
--
-- Idempotent and re-runnable: creates a chat only where a ministry has a young
-- adult and no chat, and adds only memberships that are missing. Safe to run
-- again if another stranded cohort is ever discovered.

with needing as (
  select distinct p.ministry_id
  from public.profiles p
  left join public.groups g
    on g.ministry_id = p.ministry_id and g.name = 'Young Adults' and g.type = 'church'
   and (g.archived is null or g.archived = false)
  where p.grade = 'young_adult' and p.ministry_id is not null and p.deleted_at is null
    and g.id is null
),
created as (
  -- Same shape autoAddUserToChats creates, so a backfilled chat is
  -- indistinguishable from one the app made.
  insert into public.groups (name, type, category, ministry_id, created_by)
  select 'Young Adults', 'church', 'general', n.ministry_id, m.created_by
  from needing n join public.ministries m on m.id = n.ministry_id
  returning id, ministry_id
),
all_ya_chats as (
  select id, ministry_id from created
  union
  select g.id, g.ministry_id from public.groups g
  where g.name = 'Young Adults' and g.type = 'church'
    and (g.archived is null or g.archived = false)
)
insert into public.group_members (group_id, user_id)
select c.id, p.id
from public.profiles p
join all_ya_chats c on c.ministry_id = p.ministry_id
where p.grade = 'young_adult' and p.ministry_id is not null and p.deleted_at is null
on conflict (group_id, user_id) do nothing;

-- Verification (expect still_missing = 0):
-- select count(*) filter (where gm.user_id is null) as still_missing
-- from public.profiles p
-- left join public.groups g on g.ministry_id = p.ministry_id
--   and g.name = 'Young Adults' and g.type = 'church'
--   and (g.archived is null or g.archived = false)
-- left join public.group_members gm on gm.group_id = g.id and gm.user_id = p.id
-- where p.grade = 'young_adult' and p.ministry_id is not null and p.deleted_at is null;
