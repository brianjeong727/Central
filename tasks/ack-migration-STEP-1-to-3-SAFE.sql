-- Announcement acknowledgment loop — the migration, as amended by rls-review-design.md.
--
-- ⚠️ NOT APPLIED. The engineer session had NO Supabase MCP tool in its toolset and
-- the Management-API fallback was blocked by the permission classifier. This file
-- exists so the session that HOLDS the MCP can apply it verbatim — it is NOT a
-- migration file for Brian to run by hand (CLAUDE.md §Database Migrations).
--
-- Apply in this order. Steps 4 and 5 (the tightenings) MUST come after the count
-- functions in step 3 and after the app is on the branch that consumes them, or
-- member-facing view/RSVP counts silently collapse to 0-or-1.

-- ═══ 1. announcements.requires_ack ═══════════════════════════════════════════
-- Add with DEFAULT FALSE (so all 156 existing rows are backfilled false — nobody
-- wants 156 retroactive asks piling onto Home), then flip the default to TRUE so
-- every NEW announcement asks unless the author opts out.
alter table public.announcements
  add column if not exists requires_ack boolean not null default false;

-- Explicit backfill. Redundant after the ADD above and deliberately so: the
-- ratified default is TRUE, and this is the statement that says out loud that no
-- historical announcement inherits it.
update public.announcements set requires_ack = false;

alter table public.announcements alter column requires_ack set default true;

-- ═══ 2. announcement_acknowledgements ════════════════════════════════════════
-- INSERT-ONLY. No ministry_id column: mirrors `rsvps`, which scopes purely
-- through its announcement (the ONE sanctioned exception shape to Convention #8,
-- verified live by the reviewer — do not invent a third pattern).
create table public.announcement_acknowledgements (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id)      on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- The composite PK indexes announcement_id only. The account-deletion purge and
-- any "what have I acked" read go the other way.
create index announcement_acknowledgements_user_id_idx
  on public.announcement_acknowledgements (user_id);

alter table public.announcement_acknowledgements enable row level security;

-- A member may insert only their OWN row, only on an announcement in their own
-- ministry. No status predicate is needed: the subquery is evaluated with the
-- CALLER's row security, so the announcements SELECT policy already hides drafts
-- from members (proven live on the identical rsvps predicate).
create policy ack_insert_own on public.announcement_acknowledgements
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.announcements a
    where a.id = announcement_id and a.ministry_id = auth_ministry_id()
  )
);

-- Own row, or every row of your own ministry's announcements if you are
-- leader-tier (the non-acknowledger roster).
create policy ack_select_own_or_leader on public.announcement_acknowledgements
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    auth_is_admin_or_leader()
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_id and a.ministry_id = auth_ministry_id()
    )
  )
);

comment on policy ack_select_own_or_leader on public.announcement_acknowledgements is
  'DO NOT optimise the EXISTS away. auth_is_admin_or_leader() contains NO ministry predicate '
  '(it returns true for an admin of ANY ministry), so in the leader branch the tenant lock is '
  'carried ENTIRELY by this subquery. Removing it for per-row subquery cost would let every '
  'leader on the platform read every ministry''s acknowledgments.';

-- There is intentionally NO UPDATE and NO DELETE policy: acknowledgment is
-- insert-only, because you cannot un-see something. The REVOKEs below are the
-- SECOND, independent lock — Supabase grants table-level ALL to anon and
-- authenticated on new public tables, so without them the absence of a policy is
-- the only thing standing between `authenticated` and a DELETE, and a later
-- FOR ALL policy would turn deletes on with nothing in the diff that says
-- "acknowledgments became reversible".
revoke all on table public.announcement_acknowledgements from anon;
revoke all on table public.announcement_acknowledgements from authenticated;
grant select, insert on table public.announcement_acknowledgements to authenticated;

-- ═══ 3. Public aggregate counts (SECURITY DEFINER, batch) ════════════════════
-- The count is public by ratified decision; the identity behind it is not. Batch
-- (uuid[]) because the feed renders counts for a whole page — one RPC per card
-- would be an N+1 on the main tab.
--
-- The ministry predicate is re-applied PER ROW, not hoisted: a batch function is
-- the classic place a tenant predicate gets lost. A caller in another tenant
-- simply gets no row (indistinguishable from "real announcement, nobody acked").
--
-- Output column is `cnt`, not `count` — an OUT parameter named `count` shadows
-- the aggregate inside a SQL-language body.
create or replace function public.announcement_ack_counts(p_ids uuid[])
returns table (announcement_id uuid, cnt integer)
language sql security definer set search_path = public, pg_temp stable as $$
  select a.id, count(ack.user_id)::int
  from public.announcements a
  left join public.announcement_acknowledgements ack on ack.announcement_id = a.id
  where a.id = any(p_ids) and a.ministry_id = auth_ministry_id()
  group by a.id;
$$;

create or replace function public.announcement_view_counts(p_ids uuid[])
returns table (announcement_id uuid, cnt integer)
language sql security definer set search_path = public, pg_temp stable as $$
  select a.id, count(v.user_id)::int
  from public.announcements a
  left join public.announcement_views v on v.announcement_id = a.id
  where a.id = any(p_ids) and a.ministry_id = auth_ministry_id()
  group by a.id;
$$;

create or replace function public.announcement_rsvp_counts(p_ids uuid[])
returns table (announcement_id uuid, cnt integer)
language sql security definer set search_path = public, pg_temp stable as $$
  select a.id, count(r.user_id)::int
  from public.announcements a
  left join public.rsvps r on r.announcement_id = a.id
  where a.id = any(p_ids) and a.ministry_id = auth_ministry_id()
  group by a.id;
$$;

-- `revoke ... from public` alone is a no-op: Supabase grants EXECUTE DIRECTLY to
-- anon/authenticated, so anon must be named.
revoke all on function public.announcement_ack_counts(uuid[])   from public, anon;
revoke all on function public.announcement_view_counts(uuid[])  from public, anon;
revoke all on function public.announcement_rsvp_counts(uuid[])  from public, anon;
grant execute on function public.announcement_ack_counts(uuid[])   to authenticated;
grant execute on function public.announcement_view_counts(uuid[])  to authenticated;
grant execute on function public.announcement_rsvp_counts(uuid[])  to authenticated;

