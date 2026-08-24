## Headless Chromium refuses the Notifications API, whatever you pass to Playwright (2026-08-24)

Trying to prove "a push comes down once you read the message", I seeded real
notifications through the service worker. Three escalating attempts, all wrong:

1. `context.grantPermissions(["notifications"])` — resolves happily,
   `showNotification()` still throws *"No notification permission has been granted
   for this origin."*
2. Same with `{ origin: baseURL }` — identical failure.
3. `browser.newContext({ permissions: ["notifications"] })` — identical failure.

`page.evaluate(() => Notification.permission)` reads **"denied"** in every one of
them. Headless Chromium simply does not implement it; no Playwright option turns
it on.

**What to do instead.** Ask what actually needs proving. It was never "does the
browser render a notification" — it was the WIRING: does opening a chat ask the
service worker to close *that chat's* notifications, and only that chat's. An
`addInitScript` that replaces `navigator.serviceWorker` with a recorder proves
exactly that, in ~1s, and it also proves the SCOPING (every lookup tag-filtered),
which a real notification would not have shown any more clearly.

Also relevant: `navigator.serviceWorker.ready` NEVER settles when nothing is
registered, so awaiting it in a test (or in app code) hangs forever rather than
failing. Use `getRegistration()` and handle null — which is what
`lib/notification-dismiss.ts` does for the same reason.

**And the meta-lesson:** two failed attempts on the same point is the signal to
change approach, not to try a third variant of the same idea. The third attempt
cost as much as the rewrite did.
