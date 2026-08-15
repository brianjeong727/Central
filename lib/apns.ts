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
//
// SECURITY: never log an ApnsError object itself, and never log `notification`.
// ApnsError carries `.notification` (apns2's errors.js), and a Notification holds
// the DEVICE TOKEN — so the most natural debugging reflex, `console.error("apns
// failed", err)`, would serialize a live device token into the Vercel logs. Tokens
// are a capability here: claim_native_push_token() hands a device's notifications
// to whoever presents its token. Log `err.reason` / `err.statusCode` ONLY (that is
// what ApnsSendResult.reason carries, and why it carries a string rather than the
// error).

// ── Both hosts, not one ──────────────────────────────────────────────────────
// ONE deployment serves BOTH kinds of token at once, so a single host is always
// wrong for somebody:
//   • an Xcode/`/sim` dev install registers a SANDBOX token
//   • a TestFlight/App Store install registers a PRODUCTION token
// and both hit the same production backend. Whichever host APNS_ENV names, the
// other population's tokens come back BadDeviceToken.
//
// That is not hypothetical — it is the bug this file was changed to fix. A DM to
// a TestFlight user resolved the recipient correctly, failed the send, and the
// route PRUNED the row, so the next message found no subscription at all and
// reported `sent:0, failed:0` — silence with no error anywhere. Reopening the app
// re-registered the token and the cycle repeated.
//
// So: try the host APNS_ENV names, and on BadDeviceToken try the other one. The
// same .p8 key signs for both — only the host differs.
type HostName = "production" | "development"

let clientsInit = false
let clients: Record<HostName, ApnsClient> | null = null

function primaryHost(): HostName {
  return process.env.APNS_ENV === "sandbox" ? "development" : "production"
}

// Lazy singletons. Returns null when any required env var is absent (dev slots
// without the key) so the route falls back to skipping ios-native rows instead of
// crashing. Init is attempted once; a null result is cached.
function getClients(): Record<HostName, ApnsClient> | null {
  if (clientsInit) return clients
  clientsInit = true

  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const bundleId = process.env.APNS_BUNDLE_ID
  const keyB64 = process.env.APNS_PRIVATE_KEY_BASE64
  if (!keyId || !teamId || !bundleId || !keyB64) {
    clients = null
    return clients
  }

  // Decode the .p8 PEM from base64 at use. Never log this value.
  const signingKey = Buffer.from(keyB64, "base64").toString("utf8")
  const base = { team: teamId, keyId, signingKey, defaultTopic: bundleId, keepAlive: true }
  clients = {
    production: new ApnsClient({ ...base, host: Host.production }),
    development: new ApnsClient({ ...base, host: Host.development }),
  }
  return clients
}

// True when the APNs client is configured (env present). The route checks this
// before routing native rows; when false it preserves the pre-APNs skip behavior.
export function apnsReady(): boolean {
  return getClients() !== null
}

// ok     = APNs accepted the notification (HTTP 200).
// prune  = the token is genuinely dead and its row should be deleted.
// reason = APNs `reason` (or a synthetic tag) for logging. NEVER contains the token.
// host   = which host accepted/last rejected it, so a mismatch is visible in logs.
export type ApnsSendResult = { ok: boolean; prune: boolean; reason?: string; host?: HostName }

// Prune ONLY on a token the DEVICE has invalidated — Unregistered (app deleted) or
// 410 (gone). Mirrors the web-push 404/410 rule.
//
// BadDeviceToken is deliberately NOT here. It means "this token is not valid for
// the host/topic you asked", which is overwhelmingly a SERVER-side mismatch
// (wrong APNs host for that build, or a bundle-id/topic mismatch) rather than a
// dead device. Pruning on it deletes a perfectly live registration on a config
// error, and — because the app re-registers on next launch — produces an endless
// register→prune→register loop that reports `sent:0, failed:0` and looks like
// "push just doesn't work". Leaving the row costs one failed send per message;
// deleting it costs every notification the user will ever get.
function isPermanentFailure(err: ApnsError): boolean {
  return err.statusCode === 410 || err.reason === Errors.unregistered
}

export async function sendApnsNotification(opts: {
  token: string
  title: string
  body: string
  url: string
  tag: string
}): Promise<ApnsSendResult> {
  const cs = getClients()
  if (!cs) return { ok: false, prune: false, reason: "not-configured" } // caller gates on apnsReady()

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

  const first = primaryHost()
  const second: HostName = first === "production" ? "development" : "production"

  const attempt = async (host: HostName): Promise<ApnsSendResult> => {
    try {
      await cs[host].send(notification)
      return { ok: true, prune: false, host }
    } catch (err) {
      if (err instanceof ApnsError) {
        return { ok: false, prune: isPermanentFailure(err), reason: err.reason, host }
      }
      // Network / unexpected error — transient, never prune.
      return { ok: false, prune: false, reason: "network", host }
    }
  }

  const primary = await attempt(first)
  if (primary.ok || !primary.reason) return primary

  // Only a host mismatch is worth a second call. Unregistered/410 is the device's
  // verdict and is the same on both hosts; a transient error should not be
  // doubled into a second request.
  const mismatch = primary.reason === Errors.badDeviceToken
  if (!mismatch) return primary

  const fallback = await attempt(second)
  if (fallback.ok) {
    // Worth surfacing: every token from this build population is paying two
    // round-trips per notification, and APNS_ENV is pointed at the wrong host
    // for them. No token or key material in this line.
    console.warn(
      `[push][apns] token accepted on '${second}' after '${first}' returned BadDeviceToken — ` +
        `APNS_ENV names the wrong host for this build (sandbox = Xcode/dev install, production = TestFlight/App Store)`,
    )
    return fallback
  }
  // Rejected by BOTH hosts → not a host mismatch. Most likely an apns-topic /
  // bundle-id mismatch, still a config problem, so still no prune.
  return { ok: false, prune: false, reason: `badDeviceToken-both-hosts`, host: second }
}
