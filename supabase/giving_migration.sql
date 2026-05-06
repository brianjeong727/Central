-- Ministry giving configuration
create table if not exists ministry_giving (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references ministries(id) on delete cascade,
  zelle_info   text not null,
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz not null default now(),
  unique (ministry_id)
);

-- RLS
alter table ministry_giving enable row level security;

-- All ministry members can read their ministry's giving info
create policy "giving_select_members"
  on ministry_giving for select
  using (
    ministry_id = auth_ministry_id()
  );

-- Only admins/leaders can insert
create policy "giving_insert_admins"
  on ministry_giving for insert
  with check (
    ministry_id = auth_ministry_id()
    and auth_is_admin_or_leader()
  );

-- Only admins/leaders can update
create policy "giving_update_admins"
  on ministry_giving for update
  using (
    ministry_id = auth_ministry_id()
    and auth_is_admin_or_leader()
  );
