## Supabase silently substitutes the Site URL for an unrecognised redirect_to — and our guard turned that into deleted accounts (2026-08-20)

**What happened.** Web OAuth signup was broken for every real user from launch and
nobody could see it, because it failed as a *deletion* rather than an error.

`joincentral.app` 307s every visitor to `www.joincentral.app` (www is the canonical
host on Vercel). The Supabase Auth redirect allowlist held only the **apex**. GoTrue
does not error on a redirect_to it does not recognise — it **silently substitutes the
bare Site URL**. Probed directly 2026-08-20:

| requested redirect_to | what GoTrue actually used |
|---|---|
| `https://evil.example.com/x` | `https://joincentral.app` |
| `https://www.joincentral.app/auth/callback?flow=signup&…` | `https://joincentral.app` |
| `https://joincentral.app/auth/callback?flow=signup&…` | preserved intact |

Our own host was treated identically to an attacker's. Every round trip came back to
`/?code=…` with `flow=signup` gone. `proxy.ts`'s stranded-code recovery stamped
`flow=signin`, and `enforceOAuthAccountPolicy` did exactly what signin-strict is meant
to do to an unknown fresh mint: **deleted it**. The user was returned to
"no account — create one", pressed Google again, and it repeated. Reported as *"I'm
trying to create an account with Google but it just brings me back to the create an
account page."* The loop was us.

Confirmed end-to-end in one production session: `user_signedup` (google) 13:57:53Z →
`DELETE /admin/users/<id>` 13:57:56Z → an email account 55 seconds later. 19 of 22
OAuth starts in 24h took this path. Every Google identity in the database had attached
to an account that **already existed by email** — the only case the guard admits — so
the aggregate looked like "people prefer email", not "Google is broken".

**Lesson 1 — a redirect allowlist is CONFIG that silently disagrees with CODE, so
prove the agreement rather than assuming it.** Nothing in the repo is wrong. The bug
lives in the gap between the canonical host the CDN serves and the host the auth
provider trusts, and neither side can see the other. The probe that settles it in
30 seconds: hit `/auth/v1/authorize` with your redirect_to and read GoTrue's own
`referer` field in `auth_logs` — that field is **the redirect it validated down to**,
not the HTTP Referer header (a `curl` with no Referer still logs one). Compare it to
what you sent. If they differ, the allowlist rejected you.

**Lesson 2 — never let a MISSING signal authorise a destructive action.** The guard
read "no `flow` marker" as "this was a sign-in" and deleted on it. Absence of a signal
is our bug, never a statement by the user. Only an *explicit* sign-in asserts "I
already have an account", so only an explicit sign-in may now tear a mint down. The
asymmetry is what makes this general: an extra admitted mint costs nothing (the guard
is a UX gate, not a boundary — RLS is what protects tenant data), while a wrong
teardown unlinks the provider **permanently**, so that address can never Sign in with
Google again even after re-registering by email.

**Lesson 3 — a destructive fallback with no error path is invisible in aggregate.**
There was no error rate to alarm on: the callback returned 302, GoTrue returned 200,
the delete returned 200. The only visible trace was a *shape* in the data — 44 email
signups and zero new Google ones — which reads as a preference until you check whether
the alternative can succeed at all. **When a funnel branch shows near-zero conversion,
first prove the branch is capable of succeeding.**

**Lesson 4 — the terminal redirect is part of the flow.** A successful brand-new OAuth
signup with no invite landed on `/landing`, whose primary CTA is "Get started" →
`/signup`. Even the working path deposited people on a create-an-account page. Fixed
to `/ministries`, matching what the native path already answered.

**Lesson 5 — when you reverse a rule, hunt the argument FOR it, not just the code.**
The reversal was explained carefully in the guard itself, and the call site in
`app/auth/callback/route.ts` still carried a five-line paragraph arguing the strict
default was necessary against a hand-crafted code-bearing redirect. A reader arriving
at the call site first would have come away believing the old rule and "fixing" it
back. A comment that argues for the behaviour you just removed is a loaded gun.

**Lesson 6 — a best-effort write that a destructive branch later reads is not
best-effort.** The `central_signup` stamp failure was logged and swallowed, admitting
the account UNMARKED — and an unmarked account inside 24h with no ministry is exactly
what the strict branch deletes. Harmless while only deliberate signups went through
that branch; not harmless once nearly every OAuth start did. It now retries once and
screams if it still fails.

**Lesson 7 — a log label that partitions branches has to be re-checked when the
branches move.** `flowLabel = flow === "signup" ? "signup" : "signin"` was a correct
two-way partition while everything non-signup was strict. After the reversal it
reported the permissive branch as `flow=signin`, collapsing "genuine returning user"
and "unknown flow we admitted" into one line — in the exact log this incident was
reconstructed from.
