## Proving a call actually connects — the recipe, and the two traps (2026-09-13)

Calling shipped 2026-08-25 (voice, video, screen share, iOS 1.1.0 (9)) and for
three weeks every row in `calls` was `ended/cancelled` — eight rings, zero
answers. "Implemented" and "a real answered call has run in production" were
different facts, and only the DB could tell them apart. The first real
connected call was 2026-09-13: Brian on the iOS binary, a Playwright browser as
the other end. Both directions of audio confirmed, hang-up closed out clean. A VIDEO call the
other way (browser rings the phone, `node call-driver.mjs call video`) connected
and ended clean the same way — the fake camera shows as a moving test pattern.

**The recipe (works without a second human):**
- Other end = `tapprofile@sandbox.test` ("Tap Tester", admin in Brian's Sandbox).
  It is the ONE sandbox cast member with a real `auth.users` row — the rest
  (Alex Kim, Grace Park, …) are GHOST profiles and cannot log in. Its password
  was set via the auth admin API for this test.
- A DM between Brian and Tap Tester exists in the sandbox
  (`groups` 038c6d5a-d21f-489a-b825-7e91cd4a8b5e). `get_or_create_dm` REFUSES
  it (Brian's active `profiles.ministry_id` is Central, and the RPC checks the
  target's active ministry) — insert the group + both `group_members` rows via
  service role with `dm_key = least:greatest` instead.
- Drive Chromium with `--use-fake-device-for-media-stream` +
  `--use-fake-ui-for-media-stream` at a 390px viewport; log in (mobile login
  needs "Continue with email" tapped after hydration, and the placeholders
  match a hidden desktop copy too — filter `visible=true`); deep-link
  `/home?tab=chats&chat=<dm>`; wait for the `Answer` button; then read the
  overlay (`[aria-label^="Call with"]`) — the elapsed timer appearing is
  "connected", "Brian is speaking" is his audio arriving. Poll
  `calls` + `call_participants` alongside so the DB story is in the same log.
- Brian's phone must be switched to Brian's Sandbox first; the ring rides the
  chat topics of the ACTIVE ministry.

**Trap 1 — the slot's `.env.local` holds PLACEHOLDER LiveKit keys**
(`wss://placeholder.livekit.cloud`). The ring, answer and `calls` rows all
work locally (Supabase is shared with prod), so the failure looks like a media
bug: LiveKit 401, `connecting -> disconnected`, the callee flips to `left`
while the caller sits in an "active" call alone. It is config. `vercel env
pull` returns the LiveKit values EMPTY, so the fix is not to fetch them — run
the browser end against `https://joincentral.app` (same DB, same account, real
keys). The first failed attempt still proved the cleanup path: the caller's
hang-up ended the row `completed` with no stuck call.

**Trap 2 — the fake mic is a steady beep.** Brian's first question was "are we
calling? I only hear beeping." Say up front that the tone IS the other end.

Seen in passing: the production `/login` page logs a React #418 hydration
mismatch on load (text content differs server vs client). No visible effect;
not chased.
