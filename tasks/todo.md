# Custom join codes + request-to-join

Branch: `feat/custom-invite-code` (off `main` @ 11e470a)
Decided with Brian 2026-08-21: **fully custom code + request to join**, block
profane/impersonating codes, surface the regenerated join link alongside the code.

## Why the join flow has to change at the same time

`lib/invite-code.ts` states it outright: the member code is the access secret, `/j/<CODE>`
is an unauthenticated valid/invalid oracle over the whole keyspace, and the reason there is
deliberately **no rate limiter** is that 10 Crockford chars (32^10 ≈ 1.13e15) make guessing
worthless. Typing a valid code today grants immediate membership — and membership is what
RLS keys every chat, roster and announcement on.

A memorable code is memorable because it is guessable. So a custom code stops being a key
and becomes an address: it opens a REQUEST, and an admin turns it into membership.

## Design calls I made (flag if either is wrong)

1. **Only ministries that set a custom code switch to request-to-join.** A ministry still on
   its random 10-char code keeps instant join — that code is still a real secret, and
   changing behaviour for every existing tenant is not what was asked for.
2. **The staff code stays random and stays instant.** It grants pastor/deacon/elder, so it
   is the one code that must never become guessable.
3. **Custom codes cannot go through Crockford folding.** `normalizeCode` folds I/L→1 and
   O→0, which turns `GLORIA` into `G10R1A`. Lookup therefore tries BOTH normalizations —
   folded (random codes) and plain-uppercase (custom codes).

## Schema

- [ ] `ministries.invite_code_is_custom boolean not null default false`
      Explicit, not derived — a custom code could coincidentally look random.
- [ ] `ministry_join_requests`: `id`, `ministry_id`, `user_id`, `status`
      (`pending`/`approved`/`declined`), `created_at`, `decided_at`, `decided_by`.
      Partial unique index on `(ministry_id, user_id) where status = 'pending'`.
- [ ] RLS: requester reads own rows; ministry admins read + update theirs; all writes go
      through service-role actions (a non-member cannot read `ministries` to resolve a code).
- [ ] `rls-reviewer` BEFORE (SQL design) and AFTER (live probes) — mandatory, both passes.

## Server actions

- [ ] `setCustomInviteCode(code)` — admin-gated. Validates charset/length, runs
      `moderateText`, rejects reserved words, checks uniqueness against BOTH `invite_code`
      and `staff_invite_code` across all ministries, sets the code + `invite_code_is_custom`.
- [ ] `requestToJoinMinistry(code)` — resolves the code, refuses banned users and non-active
      ministries (mirrors `joinMinistryByCode`'s guards), inserts a pending request.
- [ ] `listJoinRequests()` / `decideJoinRequest(id, approve)` — admin-gated. Approve runs the
      SAME membership write `joinMinistryByCode` does, so the two paths cannot drift.

## UI

- [ ] Church Settings → invite section: editable code + the regenerated `/j/<CODE>` link,
      copy control for both.
- [ ] Church Settings → Join requests list, approve/decline, pending count.
- [ ] `/j/[code]` + `/ministries` code entry: a custom-code ministry shows "Request to join"
      and a sent/pending state instead of dropping the user into `/home`.

## Gates

- [ ] `npm run build`
- [ ] e2e: custom code set → link works → stranger requests → admin approves → member is in.
- [ ] e2e: a random-code ministry still joins instantly (no regression).
- [ ] Seed + self-test in Brian's Sandbox, leave fixtures, hand back a "How to test it yourself".

## Review

_(filled in at the end)_
