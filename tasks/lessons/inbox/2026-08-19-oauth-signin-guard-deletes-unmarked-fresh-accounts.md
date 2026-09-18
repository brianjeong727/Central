## The OAuth sign-in guard deletes a real account whose signup marker failed to write (2026-08-19)

**What happened.** During the church's first onboarding wave (2026-08-18, ~21:14–21:20 UTC) the
Supabase instance returned 504 across auth and REST for four minutes. Twelve people signed up in
that window; five ended with `ministry_id IS NULL`. Two of them (both OAuth) later re-clicked the
invite link, and their accounts were **silently deleted and re-created** — a new `auth.users` row,
a new id, the old row gone. Brian confirmed with both of them directly that from their side they
"re-clicked the join link and it worked fine," which is what made the DB evidence confusing.

**Mechanism.** `lib/oauth-account-guard.ts` (`enforceOAuthAccountPolicy`) enforces "sign in must
never create an account." On any flow that is not `signup`, it accepts a user as legitimate only
if ONE of these holds:

1. `user_metadata.central_signup === true`
2. account older than 24h
3. a `user_ministries` row
4. a `profiles` row **with a non-null `ministry_id`**

Otherwise it calls `admin.auth.admin.deleteUser(user.id)` and deletes the profile.

A user who signs up via OAuth and does not immediately join a ministry satisfies NONE of 2–4 for
the first 24 hours. Their only protection is proof #1 — and for OAuth that marker is written by a
SEPARATE network call after the mint:

```ts
const { error: stampErr } = await admin.auth.admin.updateUserById(user.id, {
  user_metadata: { ...existingMeta, central_signup: true },
})
if (stampErr) console.error("[oauth-guard] failed to stamp central_signup marker for", user.id, stampErr)
```

The failure is **logged and swallowed**. Signup still returns success. So an auth outage during
signup — exactly when the marker write is most likely to fail — produces an account that looks
fine to the user and is one sign-in away from being erased. Email signup is immune: it carries the
marker inline via `signUp options.data`, so there is no second write to fail.

Verified on the live rows: of the five still-stranded accounts, the two Apple ones had
`raw_user_meta_data->>'central_signup'` NULL while all three email/Google ones had `"true"`.

**The lesson.** *A durability marker must be written in the same operation as the thing it
attests.* A marker whose write can fail independently of the event it records is not a marker —
it is a second chance to lose the record, and it fails hardest exactly when the system is already
degraded. The guard's own comment says the marker was chosen over a "60s age heuristic" because
the heuristic let retries through; the marker is the better design, but only if it cannot go
missing while the account it protects still exists.

Two narrower traps this exposed:

- **A swallowed error on a write that gates a later DELETE is a landmine.** `stampErr` is logged
  and execution continues, so the account is created without its only proof of legitimacy. If a
  write's absence causes destruction later, its failure must fail the operation loudly (or the
  destructive path must be conservative when the marker is *absent*, rather than treating absence
  as guilt).
- **A self-clearing bug is an unnoticed bug.** The 24h grandfather means this window closes on its
  own every time, so it never produced a durable symptom to investigate — it only bites during a
  burst of new signups, which is precisely launch day.

**Investigation lesson (separate, and the more expensive one).** I asserted three different causes
to Brian before finding the real one — first CPU exhaustion, then a broken OAuth join path, then
"they deleted their own accounts" — each stated with more confidence than the evidence carried.
The third was contradicted by Brian simply asking the two users what they did. Cheap ground truth
(ask the affected human, read the guard) existed the whole time and beat every inference drawn
from aggregate logs. When user-visible behavior and telemetry disagree, the user is describing
what happened; the telemetry is describing what was recorded.
