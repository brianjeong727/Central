## The Google sign-in → sign-up handoff stranded a real user, and the failure left no logs (2026-08-19)

**What happened.** A launch-day signup pressed *Sign in* with Google for an account
that did not exist. That is working as designed — `lib/oauth-account-guard.ts` deletes
the freshly minted auth user and rejects, because signing in must never create an
account. The damage was in the recovery, and it took two forms.

**1. The rejection threw away what the user was doing.** `app/auth/callback/route.ts`
redirected to a BARE `/login?error=no-account`, dropping `intent` and `invite`. The
banner's "Create an account" CTA rebuilds its href from THAT url, so a user who had
arrived through `/j/<CODE>` was deposited on a context-free `/signup` — the "How are
you joining?" chooser, invite gone. Every retry returned them to something that looked
like the start, which is exactly how they described it: *"it just brings me back to the
create an account page."* A rejection redirect is still part of the flow it rejected —
it has to carry the flow's context forward, or it is a reset button.

**2. Silent failure is indistinguishable from a broken button.** Both Google handlers
in `app/(auth)/signup/page.tsx` messaged only `failed` and `unavailable` and returned
silently otherwise. `no-account` is reachable on a SIGNUP flow even though a signup is
never guard-rejected, because `signInWithGoogleNative` maps EVERY failed verification
onto it — including `no-server-session`, a session that had not propagated yet. The
Apple handlers had already been fixed for this exact bug (their comment even says
*"previously no-account/canceled returned silently — the 'frozen' bug"*); the Google
ones were never brought along. **When you fix a failure-handling bug, fix every sibling
that shares the shape, or the next report is the same bug wearing a different provider.**

**3. The most important diagnostic fact: a failed `signInWithOAuth` produces NO server
trace at all.** No `/auth/callback` line, no `[oauth-guard] timing` line — nothing. So
"the logs show the user never tried" and "the button silently did nothing" look
IDENTICAL from the server. That ambiguity cost most of the investigation. Every
client-side auth entry point now checks the returned error and says something.

**How to investigate this class.** `/auth/callback` logs `[auth/callback] invoked {...}`
and the native path logs `[oauth-guard] timing flow=… outcome=…` on every exit — absence
of BOTH means no round trip ever started. Query Vercel runtime logs scoped to a
`deploymentId` and a window under ~30 minutes; anything wider times out. And do not read
per-path request counts naively: bursts of identical same-second GETs to `/login`,
`/signup` and `/` are Next.js Link **prefetches**, not navigations. They made one user's
session look like 27 visits to the signup page.
