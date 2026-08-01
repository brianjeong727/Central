# Email OTP + Resend SMTP — DONE; launch blockers that remain

> Status as of 2026-07-31 (early morning). Signup verification now sends a **6-digit code**
> instead of a link, and Supabase mail goes through **Resend** on a verified domain instead
> of Supabase's shared 2/hour sender. Three code fixes shipped to `main`. The one thing
> NOT yet confirmed: **no verification email has been observed arriving end-to-end.**

---

## TL;DR — where we are

- **Email OTP works** — template, OTP length, and subject are live in Supabase auth config.
- **Resend is live** — `joincentral.app` verified (DKIM + SPF + bounce MX), Supabase SMTP
  points at it, sending as `Central <team@joincentral.app>`.
- **Shipped to main:** PR #246 (native splash), #247 (ministry discovery), #248 (duplicate email).
- **Unverified:** nobody has watched a signup code land in an inbox yet. Config reads correct
  and the domain verified, but that is not the same as delivery. **Do a fresh signup first.**
- **Still a launch blocker:** Resend free = **100 emails/day**. A 200-person launch day
  overruns it.

---

## What was wrong and what fixed it

### 1. Verification sent a link, not a code (FIXED — config only, no code change)

The app was always correct: `supabase.auth.verifyOtp({ email, token, type: "signup" })` at
`app/(auth)/signup/page.tsx`. The problem was entirely Supabase auth config. Three settings
had to agree:

| Setting | Was | Now |
|---|---|---|
| `mailer_templates_confirmation_content` | stock default w/ `{{ .ConfirmationURL }}` | branded HTML w/ `{{ .Token }}` |
| `mailer_otp_length` | **8** | **6** |
| `mailer_subjects_confirmation` | "Confirm Your Signup" | "Your Central verification code" |

The `otp_length` mismatch is the subtle one — the UI hard-validates six digits, so fixing
only the template would have produced "the code is always wrong."

**Management API gotcha:** the subject key is `mailer_subjects_confirmation`, NOT the
`mailer_templates_confirmation_*` prefix the content key uses. An unknown key is **accepted
and silently ignored with a 200** — always re-GET and assert the field actually changed.
`smtp_port` must be a **string** (`"465"`), not a number, or the PATCH 400s.

### 2. Signing up with an existing email = infinite dead end (FIXED — PR #248)

Supabase's email-enumeration protection returns HTTP 200 with a **synthetic user** and sends
nothing. `identities: []` is the only usable signal — `confirmation_sent_at` is populated on
the fake user even though no mail was sent. Without the check the form advanced to the
verify-code screen and waited forever. This is what made the OTP switch look broken.

Deliberate tradeoff recorded in the PR: telling the user "this email is taken" re-opens email
enumeration. Accepted knowingly; swap to neutral copy if that posture is wrong.

### 3. Native splash hung forever on most routes (FIXED — PR #246)

`launchAutoHide: false` + `SplashScreen.hide()` mounted only on `/home` and `/login` meant any
cold launch into `/ministries`, `/complete-profile`, `/pending`, `/pick-ministry`, `/onboarding`,
`/admin` hung on the static splash. The stranded routes are the **new-user** paths.
Fix: `components/native-splash-release.tsx` in the root layout + 6s unconditional backstop.

### 4. Test ministries visible in public discovery (FIXED — PR #247)

`getPublicMinistries` runs on the **service-role client**, so RLS is not a backstop — its
filter IS the boundary. It filtered on `status = 'active'` alone. `hidden_from_discovery`
already existed AND was already populated correctly; **nothing read it**.
Gate on `hidden_from_discovery`, NOT `is_sandbox` (Central is `is_sandbox=true` and is a REAL
ministry that must stay discoverable).

---

## Resend setup — as configured

- Vercel Marketplace integration on project `central727`, **free plan**, region `us-east-1`.
- Domain `joincentral.app`, id `0a79a70c-e829-4a21-b9a1-68a1a3beab08`, status **verified**.
- DNS at **Namecheap** (`dns1.registrar-servers.com`), records added on the `send` subdomain
  so the root Google Workspace MX for `team@joincentral.app` is untouched:

| Type | Host | Value | Prio |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGf…XwIDAQAB` (218 chars) | — |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 |

Namecheap quirks hit on the way: MX records live in a **separate MAIL SETTINGS section**, not
in the Host Records type dropdown; the Host field takes the subdomain only; `_domainkey` needs
its leading underscore (a `resend.domainkey` typo cost a round trip).

Supabase SMTP now: `smtp.resend.com:465`, user `resend`, sender `team@joincentral.app`,
name `Central`, `rate_limit_email_sent` 2 → 100.

---

## NEXT STEPS

1. **Do a fresh signup and confirm the code arrives.** Nothing else is proof. If it does not
   arrive, pull Resend's delivery log (`GET https://api.resend.com/emails`, `RESEND_API_KEY`
   is in `.env.local`) — it distinguishes "Supabase never handed off" from "Resend rejected."
2. **Resend free caps at 100/day.** The 2/hour wall is gone but the daily cap still breaks a
   200-person launch day. `vercel integration update` to Pro ($20/mo) — no re-verification needed.
3. **Root SPF is missing.** `joincentral.app` has only a `google-site-verification` TXT, so
   mail from `team@` is unauthenticated. Add TXT `@` = `v=spf1 include:_spf.google.com ~all`.
   Only one `v=spf1` record per domain is allowed — merge, never duplicate.
4. **`DEMO_PASSWORD` rotation** — currently `Crossroads-Review-6cc687a0`, verified working
   against `demo.reviewer@joincentral.app`. It is in App Store Connect review notes in plain
   text; if rotated, update both.

---

## INCIDENT — `vercel env pull` destroyed the shared `.env.local` (recovered)

`vercel integration add` runs an **implicit env pull** with no prompt (`"envPulled": true`).
`.env.local` in s1/s2 is a **symlink to `../central/.env.local`**, so it overwrote the shared
file for every slot at once — 16 keys replaced by the 5 in Vercel's *development* env.
**Pass `--no-env-pull` on any `vercel integration add` from a slot.**

**Vercel is NOT a secret backup.** Anything `type: sensitive` returns `""` to both the CLI and
the dashboard — that was 12 of 16 keys. Recovery came from elsewhere:

| Source | Recovered |
|---|---|
| `central-s3/.env.local` (real file, not a symlink) | VAPID, Anthropic, E2E lane-1 |
| Supabase Management API `/api-keys` | authoritative anon + service_role |
| Live DB (`E2E Sandbox 2` + `e2e2.*` users) | the three `*_LANE2` values |
| `app_config` table, key `push_secret` | `PUSH_WEBHOOK_SECRET` |
| Repo (`project.pbxproj`, `capacitor.config.ts`) | `APNS_TEAM_ID`, `APNS_BUNDLE_ID` |
| Apple Developer → Keys | `APNS_KEY_ID` = `4Y343H289A` ("Central Push") |
| App Store Connect review notes | `DEMO_PASSWORD` |

All 21 keys restored and verified. **Keep at least one slot's `.env.local` as a real file, not
a symlink** — `central-s3`'s independent copy is what made recovery possible.

Diagnostic trap worth remembering: `grep -o "^[A-Z_]*="` silently misses any key containing a
digit, which hid every `E2E_*` and `*_LANE2` var and made the loss look smaller than it was.
Use `[A-Z_0-9]*`.

---

## Open PRs at handoff (all pre-dating this work, all Brian's)

| PR | State | What |
|---|---|---|
| #244 | UNSTABLE | auth: middleware redirecting native OAuth guard Server Action |
| #241 | **DIRTY** | chats: departed members show as "Unknown" — real user-visible bug, unmerged since Jul 27 |
| #237 | UNSTABLE | countdown: overdue signal |
| #236 | **DIRTY** | ministries: discovery + mobile back arrow — discovery half made redundant by #247 |

**#236 is the cautionary one:** it already contained the exact discovery fix, sitting unmerged
since Jul 27. That is why setting `hidden_from_discovery` "didn't work" — the flags were set,
the code that read them was never merged. **Check open PRs before rebuilding anything the user
says they already fixed.**

---

## Regression guards added

- `e2e/native-splash-release.spec.ts` — every entry route releases the splash in a simulated shell
- `e2e/ministry-discovery-sandbox.spec.ts` — asserts **both** directions (test tenants absent, ACF + Central present)
- `e2e/signup-existing-email.spec.ts` — uses `E2E_ADMIN_EMAIL` because it is already **confirmed**,
  so it sends no mail and can never consume the send budget
