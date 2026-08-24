## The completeness gate wrote the cohort and left the chat behind (2026-08-24)

**What happened.** Abraham Noh (Central, Google signup 2026-06-28) was asked for
gender + graduation year long after creating his account, filled it in, and ended
up with "Class of 2027" on his profile and no seat in the Class of 2027 chat.

**Why.** Cohort chat placement happens at MINISTRY-JOIN time
(`autoAddUserToChats`, from `joinMinistryByCode` / application approval), reading
`profiles.graduation_year` as it stands at that instant. OAuth signup collects no
cohort, so anyone who joined a ministry before the `/complete-profile` gate shipped
(2026-07-15, commit `f5c82ab`) joined with a NULL cohort and got the central chat
and nothing else. When the gate later collected the year, `/complete-profile` wrote
the column and — on the class-year branch — called nothing. Only the young-adult
branch moved the chat (`persistYoungAdult`), and its own comment said "the cohort
label and the CHAT have to move together". Half the form obeyed that; half did not.

**Why nothing healed it.** The profile-tab prompt that moves the class chat
(`changeClassChat`) only fires when the year CHANGES. Re-picking the same year is a
no-op, so the member has no self-service way out, and no reconciler exists anywhere
between `profiles.graduation_year` and `group_members`.

**Still reachable after the fix?** New OAuth signups were never affected: proxy.ts
runs the gate BEFORE the no-ministry branch and `/ministries` is not gate-exempt, so
they complete first and are placed at join. Still live before this fix: anyone
demoted out of admin-tier (admin-tier is gate-exempt, so an OAuth admin/leader can
carry a null cohort indefinitely and gets gated the moment they become a member).

**Fix.** `/complete-profile` now calls `changeClassChat({ previousYear: null,
keepPrevious: true })` on the class-year branch — the same best-effort shape the
young-adult branch already used. It is self-only, derives the destination from the
profile ALREADY SAVED, and only creates a room where `auto_grade_chats` is on.

**Rule.** Any surface that writes `profiles.graduation_year` or `profiles.grade`
must move the cohort chat in the same action. There are now four such writers
(signup, `/complete-profile`, profile-tab edit, the graduation flow); three of them
learned this the hard way, one at a time.

**Test trap this exposed.** The existing `complete-profile-gate` spec asserted only
the persisted COLUMNS, which is exactly what let this ship. The membership assertion
added with the fix was ALSO vacuous at first: the shared sandbox member was already
seated in every class chat the suite has ever used, so it passed against an unfixed
build. It only became a guard once the arrange step EVICTS the member first. Prove a
new assertion fails on the unfixed code before believing it.

**And a dev-server trap underneath that.** Reverting the source file and re-running
Playwright against the already-running `next dev` kept serving the OLD (fixed)
client bundle — the revert produced a false PASS twice. Kill the dev server, `rm -rf
.next`, restart, and only then run the "does it fail without the fix?" check.

**Data.** Two real Central members are in this state today (Abraham Noh, Alex Kang —
both graduation_year 2027, neither in the room). Fixing the code does not move them;
they need a repair.
