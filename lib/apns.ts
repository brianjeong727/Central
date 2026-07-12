import { ApnsClient, Notification, ApnsError, Errors, Host, Priority, PushType } from "apns2"

// ── APNs sender (native iOS shell push) ──────────────────────────────────────
// The Capacitor iOS shell stores its APNs device token as a push_subscriptions
// row with platform='ios-native' and endpoint = 'apns:<token>' (see the
// `registration` listener in lib/native-push.ts). The web PushManager can't reach
// those — iOS only delivers native pushes over APNs — so the dispatch route routes
// ios-native rows here while web/ios-pwa rows keep web-push.
//
// Token auth (JWT signed with the .p8 key, ES256 — apns2 handles the signing +
// 55-min rotation internally). Env:
//   APNS_KEY_ID              — the .p8 key's Key ID
//   APNS_TEAM_ID             — Apple Developer team id (JWT `iss`)
//   APNS_BUNDLE_ID           — the app bundle id = the apns-topic (app.joincentral)
//   APNS_PRIVATE_KEY_BASE64  — base64 of the .p8 PEM; decoded HERE at client init
//   APNS_ENV                 — 'sandbox' → Apple's development host; anything else
//                              (or unset) → production. Xcode dev builds register
//                              SANDBOX tokens; TestFlight/App Store builds register
//                              PRODUCTION tokens. A production-host client rejects a
//                              sandbox token with BadDeviceToken (and vice-versa).
//
// SECURITY: the decoded .p8 private key is passed straight into the ApnsClient and
// is NEVER logged, stringified, or returned. Do not add debug output that touches it.

let clientInit = false
let client: ApnsClient | null = null

// Lazy singleton. Returns null when any required env var is absent (dev slots
// without the key) so the route falls back to skipping ios-native rows instead of
// crashing. Init is attempted once; a null result is cached.
function getClient(): ApnsClient | null {
  if (clientInit) return client
  clientInit = true

  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const bundleId = process.env.APNS_BUNDLE_ID
  const keyB64 = process.env.APNS_PRIVATE_KEY_BASE64
  if (!keyId || !teamId || !bundleId || !keyB64) {
    client = null
    return client
  }

  // Decode the .p8 PEM from base64 at use. Never log this value.
  const signingKey = Buffer.from(keyB64, "base64").toString("utf8")
  client = new ApnsClient({
    team: teamId,
    keyId,
    signingKey,
    defaultTopic: bundleId,
    host: process.env.APNS_ENV === "sandbox" ? Host.development : Host.production,
    keepAlive: true,
  })
  return client
}

// True when the APNs client is configured (env present). The route checks this
// before routing native rows; when false it preserves the pre-APNs skip behavior.
export function apnsReady(): boolean {
  return getClient() !== null
}

// ok    = APNs accepted the notification (HTTP 200).
// prune = the token is permanently dead (Unregistered / BadDeviceToken / 410) and
//         its subscription row should be deleted — parity with web-push 404/410.
//         Transient failures (500/503/429/timeout/network) → { ok:false, prune:false }.
export type ApnsSendResult = { ok: boolean; prune: boolean }

// Classify an APNs failure into permanent (prune the token) vs transient (retry-able,
// no prune). Mirrors the web-push 404/410 prune rule.
function isPermanentFailure(err: ApnsError): boolean {
  return (
    err.statusCode === 410 ||
    err.reason === Errors.unregistered ||
    err.reason === Errors.badDeviceToken
  )
}

export async function sendApnsNotification(opts: {
  token: string
  title: string
  body: string
  url: string
  tag: string
}): Promise<ApnsSendResult> {
  const c = getClient()
  if (!c) return { ok: false, prune: false } // caller should gate on apnsReady()

  // Payload: standard `aps` alert + sound; thread-id = tag for coalescing parity with
  // the web service worker's notification `tag`; custom top-level `url` key for
  // deep-linking — lib/native-push.ts's pushNotificationActionPerformed reads
  // `notification.data.url` (Capacitor surfaces top-level custom keys under `data`).
  const notification = new Notification(opts.token, {
    type: PushType.alert,
    priority: Priority.immediate,
    alert: { title: opts.title, body: opts.body },
    sound: "default",
    threadId: opts.tag,
    data: { url: opts.url },
  })

  try {
    await c.send(notification)
    return { ok: true, prune: false }
  } catch (err) {
    if (err instanceof ApnsError) {
      return { ok: false, prune: isPermanentFailure(err) }
    }
    // Network / unexpected error — transient, never prune.
    return { ok: false, prune: false }
  }
}
