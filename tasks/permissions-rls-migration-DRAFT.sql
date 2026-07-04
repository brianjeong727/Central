-- ============================================================================
-- Permissions hardening — RLS/DB migration (FINALIZED from Brian's answers)
-- Prepared 2026-07-04. PR #102 = the app-layer half.
-- Decisions: Q1 Full governance · Q2 Scoped action + narrow SELECT ·
--            Q3 Hard-block last admin (already shipped, app-layer) ·
--            Q4 Second-admin archive confirm.
--
-- ⚠️  APPLY ONLY: (1) with Brian's explicit prod-deploy approval, AND
--                 (2) COORDINATED with the app PR merging to main (shared prod
--                     DB — early application breaks main's live team-mgmt flows).
--     Several sections REQUIRE paired app/UI changes to land first/together
--     (marked "PAIRS WITH"). Apply via Supabase MCP apply_migration once ratified.
--
-- Live-data facts that shaped this (as of 2026-07-04): 6 teams all admin_access
-- = 'view'; both ministries governance_settings = {all_admins:true, roster_ids:[]};
-- 4 team managers (president/can_manage_team). Roles present: admin/leader/
-- member/pastor/visitor. IMPLICATION: under Full governance, with every team at
-- 'view', team MANAGEMENT resolves to team presidents / can_manage_team members
-- ONLY — an admin must set a team's matrix to 'write' (governance UI) to manage
-- it without being a member. The UI MUST gate team-management the same way or
-- admins hit RLS rejections. (PAIRS WITH the Full-gov UI change.)
-- ============================================================================

begin;

-- ── Helper: admin-tier ──────────────────────────────────────────────────────
create or replace function public.auth_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles
    where id = auth.uid() and lower(role) in ('admin','deacon','elder','pastor'))
$$;

-- ── SAFE RECONCILIATIONS (no decision, no UI dependency) ─────────────────────

-- (A) ministry_giving: permissions.md = "Edit Give: admin only"; policies include leader.
alter policy "giving_insert_admins" on public.ministry_giving
  with check (ministry_id = auth_ministry_id() and auth_is_admin());
alter policy "giving_update_admins" on public.ministry_giving
  using (ministry_id = auth_ministry_id() and auth_is_admin());

-- (B) is_team_president: use the is_president flag, not the name (data-verified no-op today).
create or replace function public.is_team_president(p_team_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members tm join team_roles tr on tr.id = tm.role_id
    where tm.team_id = p_team_id and tm.user_id = p_user_id and tr.is_president = true)
$$;

-- ── Q1 FULL GOVERNANCE — team management RLS  (PAIRS WITH the Full-gov UI change) ──
-- Mirrors app/home/governance.ts exactly:
--   isGovernanceAdmin = all_admins ? admin-tier : roster_ids contains uid
--   can-manage-team   = team president OR can_manage_team member OR (gov-admin AND admin_access='write')
create or replace function public.auth_is_governance_admin(p_ministry_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when coalesce((select (governance_settings->>'all_admins')::boolean from ministries where id = p_ministry_id), true)
      then exists (select 1 from profiles where id = p_user_id and ministry_id = p_ministry_id
                   and lower(role) in ('admin','deacon','elder','pastor'))
    else coalesce((select governance_settings->'roster_ids' from ministries where id = p_ministry_id), '[]'::jsonb)
           ? p_user_id::text
  end
$$;

create or replace function public.auth_can_manage_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from teams t
    where t.id = p_team_id and t.ministry_id = auth_ministry_id()
      and ( user_can_manage_team(p_team_id, auth.uid())
         or is_team_president(p_team_id, auth.uid())
         or (t.admin_access = 'write' and auth_is_governance_admin(t.ministry_id, auth.uid())) ))
$$;

-- teams: create stays admin-tier (add-workspace is an admin action — VERIFY the UI);
--        update/delete require can-manage-team (drops blanket leader/admin bypass).
alter policy "Admins and leaders can create teams" on public.teams
  with check (ministry_id = auth_ministry_id() and auth_is_admin());
alter policy "Admins and leaders can update teams" on public.teams
  using (ministry_id = auth_ministry_id() and auth_can_manage_team(id));
alter policy "Admins, leaders, and team presidents can delete teams" on public.teams
  using (ministry_id = auth_ministry_id() and auth_can_manage_team(id));

-- team_roles: manage = can-manage-team
alter policy "Team managers can create team roles" on public.team_roles
  with check (auth_can_manage_team(team_id));
alter policy "Team managers can update team roles" on public.team_roles
  using (auth_can_manage_team(team_id));
alter policy "Team managers can delete team roles" on public.team_roles
  using (auth_can_manage_team(team_id));

-- team_members: add = managers only; remove = managers or self-leave
alter policy "Team members or admins can add team members" on public.team_members
  with check (auth_can_manage_team(team_id));
alter policy "Team members can leave or be removed" on public.team_members
  using (user_id = auth.uid() or auth_can_manage_team(team_id));

-- ── Q1 max-president-per-team trigger (permissions.md deferred item) ──────────
create or replace function public.enforce_max_one_president()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_allow boolean; v_is_pres boolean; v_existing int;
begin
  select tm.team_id into v_team from team_members tm where tm.id = new.id;
  select tr.is_president into v_is_pres from team_roles tr where tr.id = new.role_id;
  if not coalesce(v_is_pres, false) then return new; end if;
  select coalesce(allow_co_presidency, false) into v_allow from teams where id = v_team;
  if v_allow then return new; end if;
  select count(*) into v_existing from team_members tm join team_roles tr on tr.id = tm.role_id
    where tm.team_id = v_team and tr.is_president = true and tm.id <> new.id;
  if v_existing >= 1 then
    raise exception 'This team already has a president (co-presidency not enabled).';
  end if;
  return new;
end $$;
drop trigger if exists trg_enforce_max_one_president on public.team_members;
create trigger trg_enforce_max_one_president
  before insert or update of role_id on public.team_members
  for each row execute function public.enforce_max_one_president();

-- ── Q2 invite-code exposure — narrow SELECT + hide code columns ──────────────
-- (PAIRS WITH a scoped server action that reads codes for admins-of-that-ministry
--  via service-role for the settings-tab display/copy/regenerate UI.)
-- Replace the blanket "Anyone can view ministries" (USING auth.uid() IS NOT NULL)
-- with: current ministry OR any ministry the user is a member of (pick-ministry)
-- OR public+active discovery (the existing "Public ministries readable" policy stays).
drop policy if exists "Anyone can view ministries" on public.ministries;
create policy "Members can view their ministries" on public.ministries
  for select using (
    id = auth_ministry_id()
    or exists (select 1 from user_ministries um where um.user_id = auth.uid() and um.ministry_id = ministries.id)
  );
-- Hide the codes from the row entirely for normal clients (RLS is row-level, not
-- column-level) — only the service-role scoped action can read them:
revoke select (invite_code, staff_invite_code) on public.ministries from authenticated, anon;
--   NOTE: settings-tab currently reads codes via the browser client (settings-tab
--   ~line 247) — that read MUST move to the new scoped server action, or it breaks.
--   VERIFY /ministries discovery + /pick-ministry + /join still resolve after this.

-- ── Q4 second-admin archive: columns (flow lives in ministry.ts, PAIRS WITH app) ──
alter table public.ministries
  add column if not exists archive_requested_by uuid references public.profiles(id) on delete set null,
  add column if not exists archive_requested_at timestamptz;

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION (run read-only, must all pass):
--   1. Every current team president / can_manage_team member returns true from
--      auth_can_manage_team(their team) — no legit manager locked out.
--   2. A plain leader (non-member, non-gov-write) returns false — hole closed.
--   3. settings-tab code display works via the new scoped action (not the client read).
--   4. /ministries, /join, /pick-ministry all still load (narrowed SELECT didn't break them).
--   5. Assigning a 2nd president to a non-co-presidency team raises the trigger error.
-- ============================================================================
