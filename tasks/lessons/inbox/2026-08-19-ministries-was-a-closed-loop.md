## /ministries was a closed loop, and "has a ministry" has two different answers (2026-08-19)

**The trap.** `proxy.ts` routes every non-public path to `/ministries` while
`profiles.ministry_id` is null, and *separately* bounces a logged-in user off
`/login` and `/signup` to `/home` — which redirects right back to `/ministries`.
The page shipped with no sign-out and a back chevron gated on already having a
ministry, so a user who signed up but hadn't joined anything had no exit at all.
In the Capacitor shell it is total: `/` is intercepted to `/home` for a signed-in
user, so the marketing page (which does carry a sign-out) is unreachable. Clearing
cookies was the only way off the screen. Reported from the field, not caught here.

**The rule this generalises to:** every screen the middleware can PARK a user on
must carry a sign-out. `/pending`, `/complete-profile` and `/pick-ministry` all had
one; `/ministries` was the one that didn't, and it is the one a brand-new signup
actually lands on. When adding a middleware redirect target, ask what the user does
if the condition never resolves — "go back" is not an answer when back is a loop.

**The second, sharper trap — two different truths for "has a ministry".**
- `proxy.ts` routes on `profiles.ministry_id`.
- `getUserMinistries()` (app/actions/ministry.ts) reads `user_ministries` ONLY, then
  filters to `status = 'active'`.

These disagree. A user with `profiles.ministry_id` set but no `user_ministries` row
(the E2E sandbox admin is exactly this) reads as **zero ministries** while `/home`
opens fine for them. The first cut of this fix gated the "Back to home" link on
`myMinistries.length > 0` and silently hid it from those users — a new dead end
introduced while closing the old one. It was caught only because a regression test
covered the *non*-trapped case too.

**How to apply:** deciding "will `/home` work for this user" means reading
`profiles.ministry_id`, the same column the middleware reads. Never infer routing
state from a list built for display. And when a fix flips an affordance off for one
cohort, test the cohort it stays ON for — asserting only the bug case would have
called this a pass.
