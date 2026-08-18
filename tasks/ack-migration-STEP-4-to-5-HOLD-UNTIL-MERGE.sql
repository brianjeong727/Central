-- ═══ 4. announcement_views — identity stops being ministry-wide ══════════════
-- Today every member can read every member's view rows and diff them against the
-- Directory to produce "who has not opened this announcement". Both client reads
-- of this table were aggregate-only and are already converted to
-- announcement_view_counts() on the branch.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'announcement_views' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.announcement_views', p.policyname);
  end loop;
end $$;

create policy announcement_views_select_own_or_leader on public.announcement_views
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    auth_is_admin_or_leader()
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_views.announcement_id and a.ministry_id = auth_ministry_id()
    )
  )
);

-- ═══ 5. rsvps — make the DB enforce what the UI already promises ═════════════
-- `announcements.show_attendees` has always been a product switch that RLS did
-- not read, so the promise was cosmetic: any member could read any member's
-- RSVPs regardless. And since an RSVP now writes an acknowledgment, the
-- ack-via-RSVP set was readable here, bypassing the ack table's own-row-only
-- SELECT entirely.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'rsvps' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.rsvps', p.policyname);
  end loop;
end $$;

create policy rsvps_select_visible on public.rsvps
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.announcements a
    where a.id = rsvps.announcement_id
      and a.ministry_id = auth_ministry_id()
      and (a.show_attendees or auth_is_admin_or_leader())
  )
);

comment on policy rsvps_select_visible on public.rsvps is
  'Own row always; everyone else''s only where the author turned show_attendees ON, or to '
  'leader-tier. Same EXISTS caveat as ack_select_own_or_leader: auth_is_admin_or_leader() has '
  'no ministry predicate of its own, so the tenant lock rides on this subquery.';

