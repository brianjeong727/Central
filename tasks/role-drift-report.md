# Role-drift fix — app-side follow-ups to the `profiles_role_check` extension

Engineer · 2026-08-19 · branch `fix/admin-signup-roles`
Scope: app code + build gate only. **No SQL was written and the database was not modified.**
(The one live interaction was read-only introspection plus the new guard's always-failing
probe inserts — see §3. Verified afterwards that they left no rows behind.)

---

## Files touched

| File | Change |
|---|---|
| `app/actions/ministry.ts` | `updateMemberRole` mirrors to `user_ministries`; `elevateToLeader` mirrors to `user_ministries`; `submitMinistryApplication` unwinds a partially-created ministry and lets a stranded owner retry |
| `app/actions/super.ts` | `switchMinistryRole` + `resetToSuper` mirror to `user_ministries` |
| `scripts/check-role-domain.mjs` | **new** — the drift guard (static code-parity half + live constraint probe) |
| `scripts/verify.sh` | new BLOCKING gate `(c6)` running the guard; `roles` line in the summary; added to the FAIL rollup |
| `.github/workflows/ci.yml` | `Role domain` step in the `core` job, with the service key from secrets |

---

## 1. `profiles.role` ↔ `user_ministries.role` — every writer, enumerated

`profiles.role` is what every gate reads. `user_ministries.role` is what
`setCurrentMinistry` and a return-join *restore it from*. A writer that moves one and
not the other silently reverts the change on the user's next ministry switch.

| # | Writer | Before | Action |
|---|---|---|---|
| 1 | `joinMinistryByCode` (ministry.ts:142) | upserts both | unchanged — this is the reference shape |
| 2 | `joinMinistryById` (ministry.ts:255) | upserts both | unchanged |
| 3 | `submitMinistryApplication` (ministry.ts:~430) | upserts both | unchanged in the happy path; failure path rewritten (§2) |
| 4 | **`updateMemberRole`** (ministry.ts:~1010) | **profiles only** | **FIXED** — upserts `user_ministries` |
| 5 | **`elevateToLeader`** (ministry.ts:~1400) | **profiles only** | **FIXED** — upserts the rows it actually elevated |
| 6 | **`switchMinistryRole`** (super.ts:44) | **profiles only** | **FIXED** — updates the membership row for the same (sandbox) ministry |
| 7 | **`resetToSuper`** (super.ts:168) | **profiles only** | **FIXED** — resets the membership row to `HOME_ROLE` |
| 8 | `removeMember` (ministry.ts:993) | profiles + **deletes** the membership row | correct as-is |
| 9 | `excommunicateMember` (ministry.ts:1144) | profiles + deletes | correct as-is |
| 10 | `selfLeaveMinistry` (ministry.ts:1172) | profiles + deletes | correct as-is |
| 11 | `setCurrentMinistry` (ministry.ts:1239) | *reads* `user_ministries` → writes profiles | correct as-is (it is the restore path) |
| 12 | `deleteMyAccount` (delete-account.ts, `PROFILE_SCRUB.role = "member"`) | scrubs profiles, and `user_ministries` is in `TABLES_TO_PURGE` | correct as-is |
| 13 | `handle_new_user()` (DB trigger, hardcodes `'member'`) | no membership row exists yet (`ministry_id` is NULL) | correct as-is |

Non-writers checked and cleared: `app/home/page.tsx:182` (fallback object, not a write),
`app/home/tabs/settings-tab.tsx:688` (optimistic local state), the e2e helpers.

### Consistency choices worth flagging

- **`updateMemberRole` and `elevateToLeader` UPSERT, they do not UPDATE.** A member whose
  `profiles.ministry_id` points at this ministry *is* a member; if a legacy path never wrote
  them a membership row, an UPDATE would match 0 rows and the drift would survive the fix.
  Same `onConflict: "user_id,ministry_id"` as the two join paths.
- **`updateMemberRole` compensates on mirror failure.** It reads the target's prior role,
  writes `profiles`, then upserts `user_ministries`; if the upsert errors it puts `profiles`
  back and returns the error. Two tables, no transaction — so the choice is which drift to
  risk, and the answer is *neither*: half-applied is exactly the bug being fixed.
- **The super switcher DOES mirror** (a judgement call). Not mirroring would have meant a
  ministry switch silently resets the acted-as POV — harmless in itself, but it would leave
  `profiles.role == user_ministries.role` merely *usually* true, and the value of that
  invariant is that it holds without exceptions. Both super writes are plain `UPDATE`, never
  upsert, so they can never invent a membership the super doesn't hold, and both are already
  hard-gated on the super UUID + a sandbox ministry. `resetToSuper` restores both halves.

---

## 2. `submitMinistryApplication` — the stranded pending ministry

**What I did: both halves — forward cleanup AND a retry-safe duplicate guard. Here is why
neither alone is enough.**

Reordering the writes (the other option) is not available: `profiles.ministry_id` is an FK to
`ministries.id`, so the founder cannot be attached before the ministry row exists.

**Forward cleanup.** After the insert, every failure until *both* link writes land now unwinds
the ministry row:

- profile update errors, or matches 0 rows → delete the pending ministry, return the error;
- membership upsert errors → put the profile back to its prior `ministry_id`/`role` **first**
  (it references the row about to be deleted), then delete the ministry, return the error.

That is the whole of the reported failure: the CHECK rejected `deacon`, so the profile update
errored and the user was left with a pending ministry they weren't in.

**Why the guard also had to change.** Cleanup only runs if the process is still alive. A crash,
a timeout, or a lambda eviction between the insert and the link writes still strands a row, and
the duplicate guard would still block the retry forever. So the guard now distinguishes a real
pending registration from a stranded one, and the test is precise rather than heuristic:

> **stranded ⇔ neither link exists** — the caller's profile does not point at it **and** it has
> no `user_ministries` row.

A genuinely-pending registration always leaves at least one. The case that made a looser test
unsafe: a founder who registers ministry B (pending) and then joins ministry C by code — their
profile no longer points at B, so "profile not linked" alone would have deleted a legitimate
application. The membership row for B survives that move, which is what makes the two-part test
correct. Stranded → the row is deleted (nothing references it; chats and workspaces are only
created after the link succeeds) and the submission proceeds with the data the user just typed,
rather than adopting a stale row.

One extra repair while we're there: if the profile *is* linked but the membership row is the
missing half, the guard writes it before returning "you already have a pending registration" —
otherwise that founder hits bug #1 the moment they switch ministries.

**Zero rows affected today** — there are no pending ministries platform-wide (reviewer §1).

---

## 3. The drift guard — `scripts/check-role-domain.mjs`

**It reaches the live DB, and it can fail. I proved both directions before shipping it** (see
"Proof" below). It is wired into `verify.sh` as a BLOCKING gate `(c6)` and into the CI `core`
job.

### Half A — static, always runs

Parses the five tier arrays out of `lib/roles.ts` and asserts the union equals the two
hardcoded role enums elsewhere in the codebase — `MINISTRY_ROLES`
(`app/actions/super-constants.ts`) and `updateMemberRole`'s `newRole` parameter union. These
are two of the documented "UI role-picker enum" nonconformers of Convention #2, and they are
the code-side of the same drift class.

### Half B — live, runs whenever `SUPABASE_SERVICE_ROLE_KEY` is present

It asks the constraints what they **accept** rather than reading their text:

```
INSERT INTO <table> (…, role) VALUES (…, '<candidate>')   -- with a PK that already exists
```

Postgres evaluates CHECK constraints in `ExecConstraints`, *before* the tuple reaches the
unique index, so:

| outcome | meaning |
|---|---|
| `23505` unique_violation | the CHECK **accepted** the value; the PK collided |
| `23514` check_violation | the CHECK **rejected** the value |

Every probe is a failed statement in its own PostgREST transaction, so **no row is ever
written and no AFTER trigger (`notify_role_change` included) ever fires**. Confirmed empirically
after the run: no probe profile, no probe membership row.

It asserts, on **both** `profiles` and `user_ministries`: every role in the `lib/roles.ts` union
is accepted, and three clearly-invalid controls (`__role_domain_probe__`, `owner`, `superadmin`)
are rejected. The control half is what catches a dropped or replaced constraint — with no CHECK
at all, the controls come back `23505` and the guard fails. Any SQLSTATE other than those two is
reported as **INCONCLUSIVE and fails**; a probe that cannot tell the two apart must never pass
quietly.

### Why behavioural rather than parsing `pg_get_constraintdef`

Two reasons, and the first is decisive: **with only the service-role key there is no read path
to the definition at all.** PostgREST exposes `public`, not `pg_catalog`; there is no
SQL-exec RPC in this project (the eight RPCs in use are all feature functions); there is no
`DATABASE_URL` in `.env.local` and no `psql` on this machine; and the Management API needs a
personal access token nobody has in CI. Second, asking the constraint what it accepts is
*immune* to how Postgres has normalised it — the `ANY (ARRAY[…])` shape, the `::text` casts, the
whitespace and the ordering are all irrelevant to a probe, whereas a parser has to be taught
each of them.

### The limit, stated plainly

The probe proves every role in `lib/roles.ts` is accepted and that unknown values are rejected.
It **cannot enumerate an extra value the constraint might also allow** beyond the controls it
tries — set equality is proven in one direction plus a spot-check in the other. That has never
been the failure mode: the DB has always been the narrow side. Related, deliberately untested:
whether the CHECK is case-sensitive. The controls are non-role strings on purpose, so the guard
passes under either formulation rather than encoding an assumption I can't read back.

Without the service key (fork PRs, a bare checkout) the live half prints
`! role-domain [live]: SKIPPED … The DB constraint was NOT checked on this run` and `verify.sh`
reports `roles  pass (static only — live probe skipped)`. Half A still runs and can still fail,
so the gate is never a no-op.

### Proof it fails

| Injected drift | Result |
|---|---|
| `bishop` added to `ADMIN_ROLES` only | `✗ MINISTRY_ROLES != lib/roles.ts union` — exit 1 |
| `bishop` added to all three code enums (code self-consistent, DB narrower) | `✗ [live] profiles.role REJECTS "bishop"` + same for `user_ministries.role` — exit 1 |
| clean tree | `✓ [static] 7 roles … ✓ [live] … accept exactly the 7 roles (3 controls rejected on each)` — exit 0 |

The clean-tree pass is also an independent confirmation that your DB fix landed on **both**
tables.

---

## 4. Noted, not acted on (as instructed)

`supabase/visitor_role_migration.sql:13-18` still asserts the old four-role set
(`admin, leader, member, visitor`). It is a historical migration record and was **not edited**.
It is where the drift originated: `pastor` was added live and never written back, deacon/elder
never at all. Worth knowing that the new guard makes the file harmless — the authority on the
role domain is now the live constraint, probed on every verify run, not any `supabase/*.sql`
file.

---

## Verification

- `npx tsc --noEmit` → clean.
- `npm run lint` → 0 errors (162 pre-existing warnings, none in the touched files).
- `node scripts/check-role-domain.mjs` → both halves pass; fails correctly on injected drift.
- `bash -n scripts/verify.sh` → syntax clean.
- Full `npm run build` deliberately left to the tester's `verify.sh` pass (it is the slowest
  step in the loop and the new gate now runs inside it).

## Uncertain / for your call

1. **The live probe hits the production database on every `verify.sh` run** (14 always-failing
   INSERTs). Nothing is ever written, but it is a real network round-trip to prod from a build
   gate. If you'd rather it only ran in CI, moving it out of `verify.sh` is a two-line change.
2. **The super-switcher mirror** (§1) is the one judgement call rather than a straight bug fix.
   If you prefer the POV lens to stay profile-only and reset on a ministry switch, revert the
   two `app/actions/super.ts` hunks; nothing else depends on them.
3. The `deacon` staff-code join now reaches the `auto_staff_chat` branch for the first time for
   a non-pastor (reviewer §5). Untested by me — worth one pass in the sandbox.
