## The DB role set and `lib/roles.ts` drifted, and only a user report caught it (2026-08-19)

Brian reported that on the admin signup path only "Pastor" worked, not Deacon or Elder.
Root cause: `profiles_role_check` allowed `admin, leader, member, visitor, pastor` — no
`deacon`, no `elder`. Meanwhile `permissions.md` (the canonical source of truth) put both in
the Admin tier, `lib/roles.ts` carried them in `ADMIN_ROLES`/`STAFF_ROLES`/`LEADER_ROLES`,
two separate UI pickers offered them, and all four SECURITY DEFINER helpers already gated
on them. **Zero accounts platform-wide had ever held either role.** The tier was decorative.

The failure was ugly in a way that hid it: the signup form accepted the choice (auth
metadata has no such constraint), onboarding ran, the ministry row was INSERTED, and only
then did `profiles.role = 'deacon'` fail with 23514 — after which the duplicate-application
guard blocked the retry. So the person saw a late, opaque error and could not try again.

Three things worth keeping:

**1. A permission tier can be fully wired in the app and still not exist.** Every layer we
normally check agreed with each other — the doc, the constants, the helpers, the policies —
and all of them were downstream of one CHECK nobody re-read. Agreement between layers that
were written from the same assumption is not evidence.

**2. The drift's origin was a migration that asserted a role set** (`supabase/visitor_role_migration.sql`).
Any migration that writes an exhaustive list of a domain becomes a second source of truth
the moment the first one grows. Adding a role to `lib/roles.ts` was never going to be
enough, and nothing said so.

**3. The guard has to be able to fail.** `scripts/check-role-domain.mjs` (blocking in
verify.sh) proves the constraints ACCEPT exactly the seven roles by attempting an insert
with a colliding primary key: `23505` means the CHECK passed, `23514` means it rejected, and
nothing is ever written. It probes BEHAVIOUR rather than parsing `pg_get_constraintdef`,
which would break the moment Postgres renormalised the text. It was tested by injecting
drift in both directions and confirming it fails.

Related: [[probe-the-service-dont-reason-about-it]] — same family. Read what the system
actually does, not what our code implies it must.
