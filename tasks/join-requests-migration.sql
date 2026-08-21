-- Custom invite codes + request-to-join.  DESIGN DRAFT — not yet applied.
-- Reviewed by rls-reviewer BEFORE apply; live probes AFTER.

-- ── 1. Mark a ministry as running a CUSTOM (i.e. guessable) invite code ──────
-- Explicit column, NOT derived from the code's shape: a custom code could
-- coincidentally look like a generated one, and this flag decides whether typing
-- the code grants membership or opens a request. It must never be a guess.
alter table public.ministries
  add column if not exists invite_code_is_custom boolean not null default false;

-- `ministries` has NO table-level SELECT grant, so a new column lands UNGRANTED
-- and PostgREST 403s the ENTIRE query that names it (the `timezone` trap,
-- CLAUDE.md Schema §ministries).
grant select (invite_code_is_custom) on public.ministries to authenticated;

-- ── 2. Join requests ────────────────────────────────────────────────────────
create table if not exists public.ministry_join_requests (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references public.ministries(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','approved','declined')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles(id) on delete set null
);

-- One OPEN request per person per ministry. Decided rows accumulate as history,
-- so a declined person can be re-requested later without tripping the index.
create unique index if not exists ministry_join_requests_pending_uniq
  on public.ministry_join_requests (ministry_id, user_id) where status = 'pending';

create index if not exists ministry_join_requests_ministry_status_idx
  on public.ministry_join_requests (ministry_id, status, created_at desc);

alter table public.ministry_join_requests enable row level security;

-- READS ONLY, and only two of them.
--
-- Every WRITE goes through a service-role server action, because the requester is
-- BY DEFINITION not a member of the ministry yet: they cannot read `ministries` to
-- resolve the code they typed, so no client-side insert could ever name the right
-- ministry_id under RLS. Same shape as notification_ledger — RLS on, zero write
-- policies — rather than a permissive insert policy nobody can satisfy.
create policy mjr_select_own on public.ministry_join_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy mjr_select_admin on public.ministry_join_requests
  for select to authenticated
  using (ministry_id = auth_ministry_id() and auth_is_admin());

-- Belt and braces against pg_default_acl handing writes to a role that RLS would
-- then have to be the only thing stopping (the 2026-08-19 anon-EXECUTE lesson).
revoke insert, update, delete on public.ministry_join_requests from authenticated;
revoke all on public.ministry_join_requests from anon;
