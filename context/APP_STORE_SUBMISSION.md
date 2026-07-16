# Central — App Store Submission & Compliance (context)

> Living record of the iOS App Store submission for Central. Captures the demo
> account, the build config, every App Store Connect field value, the compliance
> work already shipped, and the exact status/blockers as of the last update.
> **Last updated: 2026-07-16.**

---

## 0. TL;DR status

- **Code side: DONE and merged to `main`** (PR #188, commit `22cfa42`, 2026-07-16).
- **Build uploaded:** Build `1`, version `1.0`, attached to the ASC version page.
- **Demo tenant:** live in prod, seeded and screenshot-ready.
- **Remaining before hitting "Add for Review"** (all in App Store Connect UI, Brian's side):
  1. ⚠️ **App Review → Sign-In credentials are EMPTY** — must fill (most common fast-rejection cause).
  2. **App Information → Category** = Lifestyle (was unset).
  3. **App Information → Content Rights** = "does not use third-party content."
  4. **App Privacy** — edits made, must be **Published**.
  5. (optional) Pricing → uncheck Apple Silicon Mac + Apple Vision Pro availability.
- **DSA** trader declaration: done → **"not a trader"** (EU excluded; 175 countries available).

Review timeline expectation: earliest same-day/overnight, typically **24–48h**.

---

## 1. Demo / App Review account

Apple Guideline 2.1 requires working demo credentials (an auth-walled app is
otherwise unreviewable, and risks a 4.2 "repackaged website" flag).

| Field | Value |
|---|---|
| **Sign-In username** | `demo.reviewer@joincentral.app` |
| **Sign-In password** | `Crossroads-Review-6cc687a0` (also in each slot's `.env.local` as `DEMO_PASSWORD`) |
| Role | `admin` (full feature surface: settings, member mgmt, announcement CRUD, chat mgmt) |
| Ministry | "Crossroads College Ministry" (id `349ff940-0f62-4fd3-83ae-0cb5a72800ad`) |
| Invite code | `CROSSROADS-DEMO` |

The tenant is `is_sandbox = true`, `is_public = false` (never listed in discovery),
moderation ON (`asterisk_first`, moderate, all scope).

Seeded demo users (password = `DEMO_PASSWORD` for all):

| Email | Name | Role |
|---|---|---|
| demo.reviewer@joincentral.app | Alex Morgan | admin |
| demo.sarah@joincentral.app | Sarah Kim | leader |
| demo.james@joincentral.app | James Park | member |
| demo.emily@joincentral.app | Emily Chen | member |
| demo.daniel@joincentral.app | Daniel Rivera | visitor |

### Re-seeding / upkeep
- Script: `scripts/seed-demo.mjs` — **idempotent**, safe to re-run.
- Run: `node --env-file=.env.local scripts/seed-demo.mjs`
- Needs in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_PASSWORD`.
- To rotate the reviewer password, change `DEMO_PASSWORD` and re-run (updates all demo users).

### What the seed populates (for good screenshots)
- **Announcements:** pinned "Welcome to Crossroads!", "Friday Night Worship" (event, RSVPs), "Small groups start next week".
- **Chats:** the auto ministry-wide chat (6 messages), a "Leaders" chat, a Sarah Kim DM.
- **Team:** "Leadership Team" — NAME matters: `classifyTeam()` (`app/home/team-type.ts`, regex `/\b(student org|board|leadership|officer)\b/`) routes it to the rich six-section **`StudentOrgTeamHome`** mobile hub. A plain name would fall back to the thin calendar hub.
- **Calendar events:** Friday Night Worship, New Student Welcome Dinner, Sunday Service (re-anchored to the current week each run).
- **Workspace sections** (added 2026-07-16 so every mobile hub row reads as lived-in — commit `505d6ef`):
  - Event plan on Friday Night Worship + 8 tasks (3 done) → drives the hub "Up next" progress ring.
  - 3 meeting notes (Semester Kickoff Planning, Small Group Placements, Weekly Leadership Sync).
  - President + Member role guides (Resources section).
  - "Fall 2026 Small Groups" — 2 groups, 5 people (Groups section).
  - "Fall 2026" rotation semester — 7 Sunday-prayer slots, 3 assigned (Rotations section).

> ⚠️ The hub "Up next" progress ring is tied to **Friday Night Worship** (the next
> upcoming event). If screenshotting after that Friday passes, the ring may not
> appear (other next events have no plan). Re-seeding won't move events (idempotent
> by title) — capture that hero before Friday, or delete+reseed events if needed.

---

## 2. Build configuration

| Item | Value |
|---|---|
| Bundle ID | `app.joincentral` |
| Version (`MARKETING_VERSION`) | `1.0.0` (ASC shows `1.0`) |
| Build (`CURRENT_PROJECT_VERSION`) | `1` |
| SKU | `central-ios` |
| Apple ID (ASC) | 6791196078 |
| ASC app name | "Central — Church OS" |
| Device family | **iPhone only** (`TARGETED_DEVICE_FAMILY = 1`) |
| Encryption | `ITSAppUsesNonExemptEncryption = false` (Info.plist) — skips export-compliance prompt |
| Prod server URL | `https://www.joincentral.app` (baked via Capacitor `server.url`) |

### Capacitor / native shell facts
- The app is a **Capacitor WebView shell** pointing at the remote prod URL
  (`capacitor.config.ts` → `server.url`). Web assets in `capacitor-shell/` are
  offline fallback only.
- **DEV OVERLAY FOOTGUN:** `/sim` rewrites `capacitor.config.ts` `server.url` to
  `http://localhost:<slot port>` (+ `cleartext`, + `localhost` in allowNavigation).
  This is a **local dev overlay, never committed**. Before ANY archive:
  `git checkout -- capacitor.config.ts` → confirm it reads `https://www.joincentral.app`
  → `npx cap sync ios` → verify `ios/App/App/capacitor.config.json` shows the prod URL.
- Node ≥22 required for `npx cap …`; default shell node is v20. Prefix with
  `PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$PATH"`.
- DerivedData is symlinked out of the iCloud-synced tree (per-worktree) to avoid
  CodeSign "resource fork / Finder info" failures.

### Xcode archive & upload (Brian's manual steps)
Full guide lives at `~/Desktop/CENTRAL_XCODE_BUILD_STEPS.md`. Summary:
1. Open `ios/App/App.xcodeproj` (build from the shared `central` checkout on latest `main`).
2. Confirm `capacitor.config.json` = prod URL (NOT the `config`/config.xml file).
3. Target → General: Version 1.0.0 / Build 1.
4. Signing & Capabilities: automatic signing; **Sign in with Apple** + **Push Notifications** with no red errors.
5. Destination → **Any iOS Device (arm64)** → Product → **Archive**.
6. Organizer → Distribute App → App Store Connect → Upload. On the review summary,
   confirm **`aps-environment = production`** (development = stop).
7. Wait ~15 min processing → attach build on the version page.

> **Re-uploads must bump the Build number** (1 → 2 → …); ASC rejects duplicate build numbers.
> Dismiss the "Xcode Cloud" prompt (not needed) and CANCEL the "Update to recommended
> settings" nudge (its User Script Sandboxing option can break Capacitor build scripts).

---

## 3. App Store Connect — version page field values

Paste-ready copy that was drafted for this submission.

**Promotional Text** (170 max):
> The private home for your college ministry — announcements, events, group chats, and team planning in one warm, focused space. Invite your community and stay connected.

**Description** (~2,742 chars, under 4,000):
> Central is the private, all-in-one home for college and church ministries. Bring your announcements, events, group chats, and behind-the-scenes planning into one calm, focused space — instead of scattering them across group texts, spreadsheets, and social apps.
>
> Built for the way ministries actually work:
>
> ANNOUNCEMENTS & EVENTS
> Share what's happening, post events, and let people RSVP in a tap. Pin the important things so nobody misses them.
>
> MESSAGING
> Real-time group chats for your whole ministry, your teams, and one-on-one conversations — with reactions, replies, mentions, and photo sharing.
>
> TEAM & EVENT PLANNING
> Give each team its own workspace: plan events with task checklists, keep meeting notes, organize small groups, manage rotations, and share role guides.
>
> MADE FOR MINISTRY
> Warm, distraction-free design. Role-based access so leaders and members each see what they need. Every ministry is its own private, invite-only space.
>
> SAFE BY DESIGN
> Built-in message filtering, in-app reporting, user blocking, and admin moderation tools keep conversations healthy. You control who's in your ministry.
>
> Central is invite-based — you join a ministry with a code or by request. Create a free account to get started, then connect with your community.

**Keywords** (94/100 chars):
> `church,ministry,college,campus,faith,christian,community,group,bible,prayer,worship,fellowship`

| Field | Value |
|---|---|
| Support URL | `https://www.joincentral.app/support` |
| Marketing URL | `https://www.joincentral.app` |
| Privacy Policy URL | `https://www.joincentral.app/privacy` |
| Version | `1.0` |
| Copyright | `2026 Central` (year + rights owner; no © symbol — Apple adds it) |
| Category | Primary **Lifestyle**, Secondary **Social Networking** |
| Content Rights | "Does NOT use third-party content" |
| Routing App Coverage / App Clip / iMessage App | leave empty (N/A) |

**Screenshots:** 5 at **1242 × 2688** (iPhone 6.5" Display slot) in `~/Desktop/appstore-screenshots/`.
- These were upscaled ~2× from ~700px window captures → dimensionally valid but soft.
  For crisp shots, recapture natively in the simulator with **⌘S** (saves at exact device res).
- Accepted portrait sizes: 1242×2688 or 1284×2778 (and their landscape variants).
- Do NOT put screenshots in the iMessage App slot (it accepts the same dims — confusing).

**App Review Information → Notes:**
> Central is a private, invite-based communication app for church and college ministries — all content lives inside each ministry's private tenant, so please use the demo account (admin role, full feature access) to see the full app. After signing in, open the Plan tab → Leadership Team to see team/event planning.
>
> User-generated content is protected by a profanity filter (on by default), in-app reporting with a 24-hour response commitment, user blocking, and admin removal/ban tools. Account deletion is self-serve under Profile → Danger Zone. Donations are not processed in the app.

**Contact Information:** Brian Jeong / 4842521541 / brianjeong13@gmail.com.
**Release:** "Automatically release after approval" (chosen).

---

## 4. App Privacy declaration (target end-state)

Principles for Central: account-based ⇒ everything is **Linked to You**; no ad/analytics
tracking ⇒ every purpose is **App Functionality**. Answer **No** to all tracking questions.

| Data type | Linked | Purpose | Notes |
|---|---|---|---|
| Name | Yes | App Functionality | (was mistakenly "Analytics" — fixed) |
| Email Address | Yes | App Functionality | auth/account |
| Phone Number | Yes | App Functionality | profile field |
| Photos or Videos | Yes | App Functionality | chat photos, profile pics (Info.plist requests camera/library) |
| Other User Content | Yes | App Functionality | chat messages, journal/prayer entries |
| Sensitive Info | Yes | App Functionality | religious content (prayers, testimonies, verses) — DON'T skip |
| User ID | Yes | App Functionality | Identifiers group |

- **Remove** "Other User Contact Info" (not accurate — was set to "Other Purposes").
- Set **Privacy Policy URL** = `https://www.joincentral.app/privacy`.
- **Publish** the App Privacy page (won't submit until published).

---

## 5. App Information / Business settings

- **Category:** Lifestyle (primary) + Social Networking (secondary).
- **Content Rights:** "does not contain, show, or access third-party content."
- **Age Rating:** completed → ~13+ (UGC = yes with moderation/reporting; no unrestricted web). ✅
- **Encryption docs:** none needed (plist flag handles it). ✅
- **Digital Services Act (DSA):** declared **"not a trader"** → app excluded from EU,
  home address NOT published, **175 countries available**. (Trader path would publish
  name/address/phone/email + enable EU.)
- **Agreements:** **Free Apps Agreement = Active** ✅. Paid Apps Agreement NOT needed
  (free app, no IAP).
- **Pricing:** Free, base US, all territories (EU auto-dropped by DSA). Tax category
  "App Store software". Distribution "Public".
- **Recommended:** uncheck "Make available on Apple Silicon Macs" + "Apple Vision Pro"
  (untested platforms for a mobile webview → reduces review surface).

---

## 6. Compliance work already shipped (code side)

All merged to `main`. Key pieces and their guideline drivers:

| Guideline | What was built | Where |
|---|---|---|
| 4.8 (SIWA) | **Sign in with Apple** — native sheet in shell, web OAuth elsewhere | `lib/native-auth.ts`; commit `bf1f2d7` |
| 1.2 (UGC) | Terms of Service page + signup agreement | `/terms`; commit `a2eb629` |
| 1.2 | Chat **moderation defaults ON** for tenants | `lib/moderation.ts`; commit `b099925` |
| 1.2 / 5.1.1 | In-app **reporting** (24h response), **user blocking**, admin removal/ban | commit `b8968bb` (PR #170) |
| 5.1.1 | In-app **account deletion** (tombstone design), Profile → Danger Zone | commit `8a0f07c` |
| 3.2.2(iv) | **Give (Zelle) hidden in the native shell** (donations not in-app) | commit `fa6ede7` |
| 2.1 | Demo tenant seed | `scripts/seed-demo.mjs`; commit `37c1258` |
| 2.1 stability | Offline fallback page (`offline.html`) + dark status bar | — |
| — | iPhone-only + encryption-exempt | Info.plist / pbxproj; commit `0ccf3db` |

Relevant PRs: #170 (appstore-compliance), #182 (appstore-readiness), #188 (native-auth
fixes + iPhone-only/encryption + demo section seed).

---

## 7. Apple Developer portal / Supabase config (SIWA)

Reference — the portal + Supabase steps that back the native/web Sign in with Apple flow.
Full detail in the throwaway `APPSTORE_SUBMISSION_STEPS 2.md` on Brian's Desktop.

- **App ID** `app.joincentral` → enable **Sign In with Apple** capability.
- **Services ID** `app.joincentral.web` (web flow client) → SIWA configured:
  - Primary App ID `app.joincentral`
  - Domain `wgqpnilaokfipocsugqo.supabase.co`
  - Return URL `https://wgqpnilaokfipocsugqo.supabase.co/auth/v1/callback`
- **Key** (SIWA `.p8`) — note Key ID + Team ID; Apple caps the client secret at **6 months** (set a rotation reminder).
- **Supabase → Auth → Providers → Apple:** Client IDs `app.joincentral.web,app.joincentral`; Secret = JWT signed from the `.p8` (not the file contents).

### Pending (not yet configured) — native Google sign-in
Google can't do web OAuth in the WebView, so the shell needs the native Google sheet.
Code is merged but hidden until configured:
1. Google Cloud console → Credentials → create **OAuth client ID (type: iOS)**, bundle `app.joincentral`.
2. Give Claude the iOS client ID → it adds the reversed-ID URL scheme to Info.plist,
   sets `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and names the Vercel env var to add.
3. Supabase → Auth → Providers → Google → add the iOS client ID to Authorized Client IDs.
Until done, the shell shows Apple + email only (web keeps all three).

---

## 8. Environment / infra facts

- Supabase project: `wgqpnilaokfipocsugqo`.
- Prod URL / `NEXT_PUBLIC_SITE_URL`: `https://joincentral.app` (site) / `https://www.joincentral.app` (shell target).
- Vercel deploy lag: ~75s after push before live on joincentral.app.
- Push notifications: full system live in prod (v1 #146 + v2a #147 + v2b #149); mobile
  gated on Apple push entitlement (`aps-environment = production` in the archived build).

---

## 9. Review timeline expectations

- **Statuses:** Waiting for Review → In Review → Approved / Rejected (email at each).
- **Earliest:** same-day / overnight (median review < 24h).
- **Typical:** 24–48h.
- First submissions + UGC apps may draw extra scrutiny, but the reporting/blocking/
  moderation/deletion + demo account cover the usual questions.
- If they have a question it comes back via **Resolution Center** (often "Metadata
  Rejected") — respond there; usually re-reviewed same day.
- **#1 avoidable rejection:** a reviewer who can't sign in → always fill the demo
  Sign-In credentials before submitting.
