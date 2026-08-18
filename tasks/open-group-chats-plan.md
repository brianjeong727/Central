# Open group chats — ratified plan (paused 2026-08-19, awaiting DB access)

> Status (2026-08-19): **migration APPLIED and verified live. App layer NOT built yet.**
> The security fix below is CLOSED in production. The schema, the two helpers, the guard
> trigger and both discovery RPCs are live. What remains is the four UI surfaces.
>
> Verified by impersonated probe (all changes rolled back, nothing persisted):
> private self-join `DENIED(42501)` · messages of a private chat visible to a non-member `0`
> · `open_group_card` on a private chat `0 rows` (no name oracle) · cross-tenant
> `0 rows` · self-join into an OPEN chat `ALLOWED` · `list_open_groups` `1 row`
> · a non-creator member flipping `is_open` `BLOCKED(42501)` · a non-member publishing
> `0 rows changed`. Creator publishing works.
>
> Working branch: `feat/open-group-chats`. The full pre-build security review lives at
> `.claude/task-context/open-group-chats/review-design.md` on that branch (gitignored dir —
> read it there, or re-derive from §Findings below).

## ⚠️ READ FIRST — a LIVE privacy hole this plan fixes

**Any ministry member can insert themselves into any group chat whose id they know, and
then read its full history.** Confirmed live by probe: a plain member self-joined a private
`my` chat it had never been in, read a message posted *before* the join, and read the roster.

`supabase/security_fixes_migration.sql:90-103`:
```sql
AND ( auth_is_admin_or_leader()
   OR (SELECT created_by FROM groups WHERE id = group_id) = auth.uid()
   OR user_id = auth.uid() )      -- ← no type check, no invite check
```
The migration's own header claims it "prevents self-joining arbitrary groups". It does not.
The clause comment says "self-join via invite" — but no invite mechanism ever existed, so it
is unconditional.

**Why it is reachable, not theoretical:** `groups` SELECT requires membership, so ids are not
enumerable *there* — but `small_groups.chat_group_id` sits on a ministry-wide-readable table
(`supabase/small_groups_migration.sql:75-77`), so **every DG chat's id is one query away**.
One query plus one insert = reading any discipleship group's chat. Anyone removed from any
chat also retains its id and can silently rejoin.

Block 3 of the migration below closes it. It is separable and can ship alone.

**CORRECTION (verified against the LIVE policy, 2026-08-19):** the checked-in
`supabase/security_fixes_migration.sql` is **STALE** — it does not match production. The live
policy already carried a fourth branch, `is_group_member(group_id, auth.uid()) AND type <>
'church'`, so a non-creator member adding a friend to a group chat DOES work today. CLAUDE.md
was RIGHT about that and the FILE is wrong. There was no second app-facing bug.
**Lesson: read `pg_policy`, never the SQL files, before touching a policy** — the files under
`supabase/` are a partial historical record, not the schema.

The live policy's admin/leader branch was also tighter than the file (it additionally requires
church-chat membership). Both live nuances were preserved verbatim in block 3; only the
self-join branch changed. Block 3 additionally narrows that fourth branch from `type <>
'church'` to `group_is_my()`, which stops either participant of a DM inserting a third person
into it — the UI never offered that, so RLS had been strictly wider than the app gate.

## The feature

A chat carries **`is_open`** = "anyone in this ministry may join". One flag, four surfaces.
It is a property of the CHAT, not a message type; the invite card is one rendering of it.

Motivation: migrating ~12 Messenger interest-groups (a chat per sport, board games, per
apartment building, gaming) without hand-adding everyone. Deliberately NOT Slack/Discord
channels — the objection is to a permanent sidebar of rooms with unread badges, not to
discovery. So discovery is somewhere you go on purpose, never persistent nav.

1. **Toggle** — chat settings, `my` chats only, staged behind Save (Convention #21), plus a
   `ConfirmDialog` naming the consequence ("everyone in the ministry will be able to join and
   read this chat's full history") and a system message posted into the chat so existing
   participants see it happened.
2. **Browse open groups** — ONE row at the top of the chat list → a `SubpageShell` listing the
   ministry's open chats with member counts + Join. The only discovery surface.
3. **Invite card** — `message_type = 'invite'` + `messages.invite_group_id`, postable into any
   chat from the composer "+" menu. Tap joins; card flips to "Joined" with an undo.
4. **Home card** — "find your people", dismissible, for a member in few/no groups. The
   migration lever: 12 taps on one screen beats 12 messages to scroll back for. Follow the
   `getting-started-card.tsx` + `setup-checklist.ts` pattern.

### Decisions already ratified — do not re-litigate
- Open applies to `type='my'` only. Never church chats (auto-managed) and never DMs (a DM is
  a pair, not a room — `tasks/lessons/inbox/2026-08-08-a-dm-is-a-pair-not-a-room.md`).
- **Notification defaults are LEFT ALONE.** The existing T2 smart default (all messages under
  30 members, mentions-only at 30+) is already correct: a sports group's whole point is the
  ping. Do not mute open joins.
- Joining shows full history — `messages` RLS is membership-based, and that matches every
  group-chat product.
- Only the **creator or a leader** may flip `is_open` (enforced by trigger, block 4).

### New-message-type contract — all four or it renders blank/raw
`app/home/tabs/message-row.tsx` (~:244) the card · the chat-list last-message preview
(`app/home/tabs/chats-tab.tsx` ~:2247, currently skips system/poll) · the push body
(`app/api/push/dispatch/route.ts` ~:105) · the union in `app/home/types.ts:246`.

### Client rules from the review
- **Join must be `.insert()`** (or `upsert` with `ignoreDuplicates: true`), NEVER
  `.upsert({ onConflict })` — probed `42501 permission denied for table group_members`,
  because clients hold column-level UPDATE grants only. Treat `23505` as success.
- Browser-client insert under RLS is correct; no server action needed. Bans are handled
  structurally (a ban nulls `ministry_id`); `archived` is folded into `group_is_open`.
- Name + member count for a group you are NOT in come ONLY from the two RPCs below. Never
  widen `groups` SELECT (it would make `groups` a second answer to "what rooms exist") and
  never widen `group_members` SELECT (the member LIST is who-is-friends-with-whom for the
  whole tenant; and a `count()` under RLS returns visible rows only, i.e. 0, so the count
  forces a definer function anyway).
- **Verify Convention #18 holds for large `my` rooms:** `isLargeRoom = memberCount >= 30`
  must key off the roster count regardless of type, or an open room past 30 members fans out
  read receipts O(N²).

## The migration — apply verbatim via Supabase MCP, in order

Every statement was prescribed by the security review. Do not improvise or reorder. Capture
the existing `group_members` INSERT policy from `pg_policy` before dropping it.

-- ═══════════════════════════════════════════════════════════════════════════
-- Open group chats — schema, helpers, policy fix, discovery RPCs
--
-- Every statement below is prescribed verbatim by the pre-build security review
-- (.claude/task-context/open-group-chats/review-design.md). Do not improvise.
-- Apply in order. Each numbered block is independently verifiable.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Schema ──────────────────────────────────────────────────────────────
alter table public.groups
  add column if not exists is_open boolean not null default false;

-- A church chat or a DM can never be open. Holds under the one type-mutation
-- path that exists (an admin/leader creator may flip type -> 'church').
alter table public.groups drop constraint if exists groups_is_open_my_only;
alter table public.groups
  add constraint groups_is_open_my_only check (not is_open or type = 'my');

-- Invite cards. SET NULL, never CASCADE: deleting a group must not silently
-- delete other people's messages — the card renders a tombstone instead.
alter table public.messages
  add column if not exists invite_group_id uuid references public.groups(id) on delete set null;

create index if not exists groups_open_idx on public.groups (ministry_id) where is_open;

-- ── 2. Helpers (SECURITY DEFINER, pinned search_path) ──────────────────────
-- `public, pg_temp` is the standing convention: listing pg_temp explicitly
-- (last) stops it being searched FIRST for relations. '' is NOT used — it
-- propagates into any callee added later and 42P01s every caller.

create or replace function public.group_is_open(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select g.is_open and g.type = 'my' and not coalesce(g.archived, false)
       from public.groups g where g.id = p_group_id),
    false);
$$;
revoke all on function public.group_is_open(uuid) from public, anon;
grant execute on function public.group_is_open(uuid) to authenticated;

-- Deliberately NOT group_is_personal(): that is type IN ('my','dm'), and using
-- it in the INSERT policy would let either DM participant add a third person
-- into that DM. A DM is a pair, not a room.
create or replace function public.group_is_my(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((select g.type = 'my' from public.groups g where g.id = p_group_id), false);
$$;
revoke all on function public.group_is_my(uuid) from public, anon;
grant execute on function public.group_is_my(uuid) to authenticated;

-- ── 3. THE SECURITY FIX: scope self-join to open rooms ─────────────────────
-- Before: `OR user_id = auth.uid()` with no type or invite check, so anyone
-- holding a group's uuid could insert themselves into it and read its full
-- history. Verified live. Also fixes the UI/RLS mismatch where a non-creator
-- member of a 'my' chat is offered "add member" and gets a raw 42501.
drop policy if exists "Authorized users can add group members" on public.group_members;
create policy "Authorized users can add group members"
on public.group_members for insert
with check (
  group_ministry_id(group_id) = auth_ministry_id()
  and is_ministry_member(user_id, auth_ministry_id())
  and (
    auth_is_admin_or_leader()
    or (select created_by from public.groups where id = group_id) = auth.uid()
    or (user_id = auth.uid() and public.group_is_open(group_id))
    or (public.group_is_my(group_id) and is_group_member(group_id, auth.uid()))
  )
);

-- ── 4. Guard who may PUBLISH a chat ────────────────────────────────────────
-- The groups UPDATE gate is a ROW gate with no notion of which column changed,
-- so without this any participant could flip is_open and hand a private chat's
-- entire history to the ministry. RLS cannot express "only the creator may
-- change THIS column" (USING sees OLD, WITH CHECK sees NEW, neither sees both).
create or replace function public.guard_group_is_open() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Service-role/cron paths run as postgres with a NULL auth.uid(); they are
  -- trusted and must not be blocked.
  if auth.uid() is null then return new; end if;
  if new.is_open is distinct from old.is_open
     and not (old.created_by = auth.uid() or auth_is_admin_or_leader()) then
    raise exception 'Only the chat creator or a leader can change who may join'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists groups_guard_is_open on public.groups;
create trigger groups_guard_is_open before update on public.groups
  for each row execute function public.guard_group_is_open();

-- ── 5. Discovery RPCs ──────────────────────────────────────────────────────
-- `groups` SELECT requires membership, so a non-member can read neither the
-- name nor the roster — and a count() under RLS returns only VISIBLE rows (0
-- for a non-member), so the count forces a definer function regardless. Put the
-- name there too and widen NOTHING. Never add a p_user_id parameter: derive the
-- caller from auth.uid() only.

drop function if exists public.list_open_groups(int);
create function public.list_open_groups(p_limit int default 50)
returns table (id uuid, name text, avatar_url text, member_count int,
               is_member boolean, last_message_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select g.id, g.name, g.avatar_url,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         exists (select 1 from public.group_members m2
                  where m2.group_id = g.id and m2.user_id = auth.uid()),
         (select max(msg.created_at) from public.messages msg where msg.group_id = g.id)
    from public.groups g
   where g.ministry_id = public.auth_ministry_id()
     and g.is_open and g.type = 'my' and not coalesce(g.archived, false)
   order by 6 desc nulls last
   limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;
revoke all on function public.list_open_groups(int) from public, anon;
grant execute on function public.list_open_groups(int) to authenticated;

-- Resolves ONE id through the SAME gate. Returns ZERO rows for anything that is
-- not open — messages.invite_group_id is attacker-supplied (the messages INSERT
-- policy checks only the DESTINATION group), so a fallback to a plain groups
-- read would turn the invite card into a name-and-headcount oracle for every
-- private chat in the ministry.
drop function if exists public.open_group_card(uuid);
create function public.open_group_card(p_group_id uuid)
returns table (id uuid, name text, avatar_url text, member_count int, is_member boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select g.id, g.name, g.avatar_url,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         exists (select 1 from public.group_members m2
                  where m2.group_id = g.id and m2.user_id = auth.uid())
    from public.groups g
   where g.id = p_group_id
     and g.ministry_id = public.auth_ministry_id()
     and g.is_open and g.type = 'my' and not coalesce(g.archived, false);
$$;
revoke all on function public.open_group_card(uuid) from public, anon;
grant execute on function public.open_group_card(uuid) to authenticated;

## Post-apply verification (all must pass)

1. `is_open` and `invite_group_id` exist with the right defaults.
2. Every new function shows `prosecdef = true` AND `proconfig = {search_path=public\, pg_temp}`.
   (Bare `public` does NOT close the pg_temp shadowing vector; `''` propagates into callees
   and 42P01s — see CLAUDE.md §Multi-tenant model.)
3. The new `group_members` WITH CHECK contains `group_is_open` and `group_is_my`.
4. `has_function_privilege('anon', …)` is **false** for all three new functions. A bare
   `CREATE` restores EXECUTE to PUBLIC, and `DROP FUNCTION` discards the ACL — every recreate
   must re-run the REVOKE/GRANT.
5. Trigger `groups_guard_is_open` exists and is enabled.
6. `messages.message_type` has no CHECK/enum that would reject `'invite'` (check before
   inserting one; extend it if present).
7. Re-probe the hole: as a plain member, self-join into a NON-open private chat must now be
   DENIED, and self-join into an open one must be ALLOWED.

## Then: the build loop
Orchestrated lane. `rls-reviewer` runs again post-apply (Mode 2 live verification, probe list
in its review). Tester does a functional click-through of all four surfaces at 1440 and 390.
Tier-2 enforcer because this touches permission semantics.
