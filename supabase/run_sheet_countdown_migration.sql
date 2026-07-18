-- Run Sheet — Countdown (planning T-minus timeline)
-- APPLIED to prod (project wgqpnilaokfipocsugqo) via MCP execute_sql on 2026-07-16.
-- rls-reviewer: APPROVED (BEFORE design review + AFTER live impersonation probe).
--
-- member_open_counts: per-member open-task + pending-confirm load for a team.
-- Powers the Countdown right-rail "Load this month" card and the reassign-by-load popover.
-- SECURITY INVOKER: aggregates run under the caller's RLS, so anything the caller
-- cannot already read simply never reaches the aggregate (no cross-tenant leak).
-- Enumerates the full team roster via LEFT JOIN so 0-load members still appear.

create or replace function public.member_open_counts(p_team_id uuid)
returns table (
  user_id uuid,
  open_tasks bigint,
  pending_confirms bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  with team_roster as (
    select tm.user_id
    from team_members tm
    where tm.team_id = p_team_id
  ),
  team_plans as (
    select ep.id as plan_id
    from event_plans ep
    join calendar_events ce on ce.id = ep.calendar_event_id
    where ce.team_id = p_team_id
  ),
  open_t as (
    select et.assigned_to as uid, count(*)::bigint as c
    from event_tasks et
    join team_plans tp on tp.plan_id = et.event_plan_id
    where et.completed = false
      and et.assigned_to is not null
    group by et.assigned_to
  ),
  pend_c as (
    select ec.user_id as uid, count(*)::bigint as c
    from event_confirmations ec
    join team_plans tp on tp.plan_id = ec.event_plan_id
    where ec.status in ('requested', 'escalated')
    group by ec.user_id
  )
  select
    r.user_id,
    coalesce(o.c, 0) as open_tasks,
    coalesce(p.c, 0) as pending_confirms
  from team_roster r
  left join open_t o on o.uid = r.user_id
  left join pend_c p on p.uid = r.user_id;
$$;

grant execute on function public.member_open_counts(uuid) to authenticated;
-- Defense-in-depth (rls-reviewer AFTER-pass hardening): drop the implicit PUBLIC grant
-- so only authenticated may call. RLS already returns 0 rows to anon, but this matches intent.
revoke execute on function public.member_open_counts(uuid) from public, anon;


-- notification_ledger SELECT policy (rls-reviewer APPROVE-WITH-CHANGES → uses auth_ministry_id()).
-- notification_ledger had RLS enabled with ZERO policies, so the Countdown "fired" badge
-- (browser reads event_task ledger rows) always returned 0. This exposes only
-- (subject_id, offset_key, fired_at) for event_task rows whose event is in the caller's
-- ministry — i.e. "a nudge fired for this task". Cross-tenant isolation proven (own → seeded
-- rows, foreign → 0). Applied to prod via MCP execute_sql on 2026-07-16.
create policy notification_ledger_select_own_ministry on public.notification_ledger
for select to authenticated
using (
  notification_ledger.subject_type = 'event_task'
  and exists (
    select 1
    from public.event_tasks et
    join public.event_plans ep on ep.id = et.event_plan_id
    join public.calendar_events ce on ce.id = ep.calendar_event_id
    where et.id = notification_ledger.subject_id
      and ce.ministry_id = auth_ministry_id()
  )
);
