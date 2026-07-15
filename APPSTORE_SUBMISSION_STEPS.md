# App Store Submission — Manual Steps (Brian)

> Throwaway checklist — delete when done. Code side is already merged to main.
> Claude can help with: generating the Supabase client secret (needs your `.p8`),
> and the iPhone-only + encryption-exempt commit (just ask).

---

## Step 2A — Apple Developer portal (~10 min)

At [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles**:

1. **App ID capability**
   Identifiers → click `app.joincentral` → Capabilities → check **Sign In with Apple** → Save.
   (Keep "Enable as a primary App ID".)

2. **Services ID** (the "client" for the web flow)
   Identifiers → **+** → **Services IDs** → description `Central Web`, identifier **`app.joincentral.web`** → Register.
   Then click it → check **Sign In with Apple** → **Configure**:
   - Primary App ID: `app.joincentral`
   - Domains: `wgqpnilaokfipocsugqo.supabase.co`
   - Return URL: `https://wgqpnilaokfipocsugqo.supabase.co/auth/v1/callback`
   - Save.

3. **Key**
   Keys → **+** → name `Central SIWA` → check **Sign In with Apple** → Configure → primary App ID `app.joincentral` → Register → **Download the `.p8`** (ONE download only — keep it safe).
   Note the **Key ID** (shown on the key page) and your **Team ID** (top-right of the portal).

## Step 2B — Supabase (~5 min)

Dashboard → project `wgqpnilaokfipocsugqo` → **Authentication → Providers → Apple** → Enable:

- **Client IDs:** `app.joincentral.web,app.joincentral`
  (Services ID first = web flow; bundle ID = native `signInWithIdToken` audience.)
- **Secret Key:** a JWT signed with the `.p8` — NOT the file contents.
  → Easiest: give Claude the `.p8` path + Key ID + Team ID and it will generate the secret.
  ⚠️ Apple caps client secrets at **6 months** — set a calendar reminder to rotate.

## Step 2C — Test Sign in with Apple (~10 min)

1. Simulator → Settings → sign in with your Apple ID (SIWA needs a signed-in account; a real device is even more reliable).
2. Run **`/sim`** in a Claude session (rebuilds the shell against the slot's dev server).
3. Login screen → **Continue with Apple** → native sheet → complete.
   - A brand-new Apple ID from the LOGIN screen should bounce with "create an account first" — that's the mint guard working. Use the SIGNUP screen to create.
4. Web check: joincentral.app/login → Continue with Apple → completes in the browser.

## Step 3 — App Store Connect (~30 min)

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → My Apps → **+ New App**:
iOS · Bundle ID `app.joincentral` · SKU `central-ios`.
The public name "Central" is likely taken — fallback: **"Central — Ministry Home"** (the icon label stays "Central"; that comes from the app bundle).

Left-rail sections:

- **App Information:** category Lifestyle (secondary Social Networking).
  **Age Rating** questionnaire: UGC = yes (with moderation/reporting), no unrestricted web → lands ~13+; accept.
- **App Privacy:** policy URL `https://www.joincentral.app/privacy`.
  Declare collected + linked to identity: **Name, Email, Phone Number, Photos/Videos, Other User Content (messages), Sensitive Info (religious content — don't skip)**.
  Answer **No** to all tracking questions.
- **Pricing:** Free.
- **Version page:** 3–5 screenshots from the iPhone 16 Pro Max simulator (⌘S saves at the right resolution) — home, chats, an announcement, a workspace. Description + keywords. Support URL `https://www.joincentral.app/support`.
- **App Review Information:** demo account `demo.reviewer@joincentral.app` + password (in central-s2 `.env.local` as `DEMO_PASSWORD`). Notes — paste:

  > Central is a private, invite-based communication app for church ministries — content
  > lives inside each ministry's private tenant, so please use the demo account (admin
  > role, full feature access). User-generated content is covered by a profanity filter
  > (on by default), in-app reporting with 24-hour response, user blocking, and admin
  > removal/ban tools. Account deletion is self-serve under Profile → Danger Zone.
  > Donations are not processed in the app.

**Decision before archiving:** the Xcode project currently targets iPad too → iPad screenshots required + reviewers test iPad layouts. For v1, go **iPhone-only** (Xcode → App target → General → uncheck iPad) — or ask Claude to commit that plus `ITSAppUsesNonExemptEncryption=false` (skips the export-compliance question every upload).

## Step 4 — Archive, verify, upload (~15 min + Apple processing)

1. Pull latest `main` in the shared `central` checkout, `npm install`, open `ios/App/App.xcodeproj`.
2. Target → General: **Version 1.0.0, Build 1**.
   Signing & Capabilities: automatic signing, your team — **Sign in with Apple** and **Push Notifications** must show without red errors (red = portal step 2A didn't take).
3. Destination **Any iOS Device (arm64)** → Product → **Archive**.
4. Organizer → Distribute App → App Store Connect → on the **review summary before upload, check entitlements: `aps-environment` must say `production`** (development = STOP, ask Claude).
5. Upload → wait ~15 min processing → attach the build on the version page → Submit for Review.

---

### Already done (for reference)
- SIWA code (native + web), /terms + signup agreement, Give hidden in shell, moderation default ON, offline fallback, dark status bar — merged to main.
- Demo tenant live in prod: Crossroads College Ministry, seeded via `scripts/seed-demo.mjs` (idempotent).
- Account deletion verified end-to-end against the live DB.
