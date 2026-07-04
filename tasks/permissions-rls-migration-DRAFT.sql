-- ============================================================================
-- Permissions hardening — RLS/DB migration
-- Decisions (Brian, 2026-07-04): Q1 Full governance · Q2 Scoped action + narrow
--   SELECT · Q3 Hard-block last admin (shipped, app-layer) · Q4 Second-admin archive.
--
-- STATUS:
--   ✅ SAFE SUBSET — ALREADY APPLIED to prod 2026-07-04 (migration
--      `permissions_hardening_safe_subset`): auth_is_admin / auth_is_governance_admin
--      / auth_can_manage_team helpers (defined, inert until policies use them),
--      ministry_giving edit → admin-only, is_team_president → is_president flag,
--      ministries.archive_requested_by/_at columns. Non-breaking on current main.
--
--   ⏳ BREAKING PART — BELOW, NOT YET APPLIED. Apply AT MERGE of
--      feat/permissions-hardening → main (paired UI must be live first, or admins
--      hit RLS rejections on team management). Needs Brian's prod-deploy approval.
-- ============================================================================

begin;

-- ── Q1 FULL GOVERNANCE — new default + team-management policies ───────────────
-- New teams default to 'write' so the creating gov-admin can seed roles/members
-- (memberless + 'view' would deadlock creation). Existing teams stay 'view'
-- (intended: admins manage them only after flipping the matrix to 'write').
alter table public.teams alter column admin_access set default 'write';

-- teams: create = governance admin (aligns with the UI create-gate; closes the
--   curated-roster dead-end where a non-roster admin creates a team they can't
--   configure). update/delete = can-manage-team (drops leader/admin blanket).
alter policy "Admins and leaders can create teams" on public.teams
  with check (ministry_id = auth_ministry_id() and auth_is_governance_admin(ministry_id, auth.uid()));
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

-- ── Q1 max-one-president-per-team (unless allow_co_presidency) ────────────────
create or replace function public.enforce_max_one_president()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_allow boolean; v_is_pres boolean; v_existing int;
begin
  select tm.team_id into v_team from team_members tm where tm.id = new.id;
  select tr.is_president into v_is_pres from team_roles tr where tr.id = new.role_id;
  if not coalesce(v_is_pres,false) then return new; end if;
  select coalesce(allow_co_presidency,false) into v_allow from teams where id = v_team;
  if v_allow then return new; end if;
  select count(*) into v_existing from team_members tm join team_roles tr on tr.id=tm.role_id
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

-- ── Q2 invite-code exposure — narrow SELECT + revoke code columns ─────────────
-- PAIRED (already built on branch): settings-tab now reads codes via the
-- getMinistryCodes() service-role admin action, not the browser client.
drop policy if exists "Anyone can view ministries" on public.ministries;
create policy "Members can view their ministries" on public.ministries
  for select using (
    id = auth_ministry_id()
    or exists (select 1 from user_ministries um where um.user_id = auth.uid() and um.ministry_id = ministries.id)
  );
revoke select (invite_code, staff_invite_code) on public.ministries from authenticated, anon;

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION (read-only, must all pass):
--   1. Each current team president / can_manage_team member → auth_can_manage_team = true.
--   2. A plain leader (non-member, non-gov-write) → false (leader god-mode closed).
--   3. AddWorkspace end-to-end works for an admin (new team defaults 'write').
--   4. settings-tab code display works via getMinistryCodes (not a client read).
--   5. /ministries, /join, /pick-ministry still load (narrowed SELECT didn't break them).
--   6. 2nd president on a non-co-presidency team raises the trigger error.
-- ============================================================================
