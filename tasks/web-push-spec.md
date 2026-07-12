# Web Push v1 — architecture + ratified taxonomy

## Ratified notification taxonomy (Brian, 2026-07-12)
- **Tier 1 (push, default ON, web+mobile):** DMs; @mentions; replies to your message; published announcements (ALWAYS ON — official channel); task/role assignments; DGL week assignment; receipt decision to submitter; role changes. (Assignments/DGL/receipts/role-change = v2 senders; schema supports from day 1.)
- **Tier 2 group chats: SMART default** — all messages in chats with <30 members; mentions-only at ≥30 (same threshold as read receipts). Per-chat mute (#140 `group_members` mute) is a hard override. User pref can force all/mentions/off.
- **Tier 3 desk-work (web ON, mobile daily digest):** form responses (leader), receipt submitted (treasurer), sign-off needed (president), new member joined (admins), pulse responses (pastor), moderation threshold (admins). — v2 senders + digest cron; prefs schema supports now.
- **Tier 4 never push:** reactions, poll votes, views/RSVP counts, pins, journal/streaks, edits, meeting notes. Pulse QUESTIONS to members = Tier 1 (rare, weighty).
- No quiet-hours engine in v1.

## v1 scope (this build)
Senders: messages INSERT (DM / mention / reply / group-smart) + announcements INSERT/UPDATE-to-published. Everything else = schema + prefs only.

## Pipeline
browser insert → Postgres AFTER-INSERT trigger → `pg_net.http_post` → `POST {SITE_URL}/api/push/dispatch` (shared-secret header `x-push-secret`) → route handler (service-role client) resolves recipients/prefs/mutes/threshold → `web-push` (npm) sends to each `push_subscriptions` endpoint → 404/410 responses prune dead subscriptions.
- Trigger passes only `{table, record_id}`; the route re-reads the row server-side (never trust payload contents).
- Local dev/e2e: call the route directly on localhost (trigger URL points at prod).
- `app_config` (see migration) holds `site_url` + `push_secret` so the trigger works across environments without hardcoding.

## Env (append .env.local + Vercel — Brian adds Vercel)
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET` (same value as app_config.push_secret), `VAPID_SUBJECT=mailto:brianjeong13@gmail.com`.

## Schema (migration.sql in this dir — rls-reviewer gates it)
- `push_subscriptions`: id uuid pk, user_id → auth.users, ministry_id, endpoint text UNIQUE, p256dh, auth, platform text ('web'|'ios-pwa'), user_agent, created_at, last_seen_at. RLS: owner-only select/insert/update/delete (`user_id = auth.uid()`); INSERT check also `ministry_id = auth_ministry_id()`. Service role bypasses for sends/pruning.
- `profiles.notification_settings` jsonb DEFAULT '{}' — shape `{dms, mentions, replies, announcements, group_mode:'smart'|'all'|'mentions'|'off', desk_web, desk_digest}`; absent key = default ON/smart.
- Triggers: `notify_new_message` AFTER INSERT ON messages (skip `message_type='system'`), `notify_new_announcement` AFTER INSERT OR UPDATE OF status ON announcements WHEN status='published' (fire once — guard on OLD.status IS DISTINCT FROM 'published').

## Client
- `public/sw.js`: add `push` (showNotification: title/body/icon `/icon-192x192.png`, tag per chat for coalescing, `data.url`) + `notificationclick` (focus existing client & navigate, else openWindow) handlers. Keep existing cache logic untouched.
- `lib/push.ts`: `subscribeToPush()` (registration.pushManager.subscribe w/ VAPID public key → upsert row via browser client), `unsubscribeFromPush()`, `getPushState()`.
- Prompt UX: NEVER on load. A dismissible DESIGN_SYSTEM-compliant card ("Get notified about messages and announcements") on the Chats tab + a toggle row in Profile → notification preferences section. Permission request fires only from explicit tap.
- Prefs UI: staged-save per the settings idiom (pending state + Save/Cancel — lessons.md §Settings).

## Notification content (reverent, minimal)
- DM: title = sender name, body = message preview (truncate 120).
- Group: title = "Sender · Group name", body = preview. Mention: title = "Sender mentioned you · Group".
- Announcement: title = announcement title, body = first line. URL deep-links `?tab=announcements&announcement=id` / `?tab=chats&chat=id`.
- No emoji injection, no "🔥 streak" anything.

## e2e verification (tester)
Chromium `grantPermissions(['notifications'])`: subscribe flow creates a `push_subscriptions` row (sandbox tenant); POST `/api/push/dispatch` with secret + seeded message id returns per-subscription send results; wrong secret → 401; muted chat / ≥30-member mentions-only logic unit-verifiable via route's dry-run mode (`?dryRun=1` returns recipient list without sending).
