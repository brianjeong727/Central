-- Member sharing of the join code. DESIGN DRAFT — not yet applied.
--
-- Default TRUE: the common case is that a member inviting a friend is doing the
-- ministry a favour, and a church that wants invites narrowed to leaders is the
-- exception. The flag matters most for a GENERATED code, where the code IS
-- membership; a ministry on a CUSTOM code is safe either way, because sharing it
-- only ever produces a request an admin approves.
alter table public.ministries
  add column if not exists member_can_invite boolean not null default true;

-- `ministries` has NO table-level SELECT grant (per-column only), so a new column
-- lands UNGRANTED and PostgREST 403s the ENTIRE query that names it.
grant select (member_can_invite) on public.ministries to authenticated;
