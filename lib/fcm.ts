import { createSign } from "crypto"

// ── FCM sender (native Android shell push) ───────────────────────────────────
// The Capacitor Android shell stores its FCM registration token as a
// push_subscriptions row with platform='android-native' and endpoint =
// 'fcm:<token>' (see the `registration` listener in lib/native-push.ts). The
// Android System WebView implements Service Workers but NOT the Push API, so the
// web PushManager can't reach those rows — the dispatch route routes them here,
// exactly as it routes ios-native rows to lib/apns.ts.
//
// This is the FCM HTTP v1 API (the legacy /fcm/send server key was retired), which
// is plain HTTPS + JSON. Unlike APNs — which needs HTTP/2 with connection reuse,
// hence the apns2 dependency — this needs nothing but fetch and a service-account
// JWT, so it is written against Node's crypto with NO new dependency.
//
// Env (all four required, else fcmReady() is false and the lane is skipped):
//   FCM_PROJECT_ID           — Firebase project id (the {parent} in the send URL)
//   FCM_CLIENT_EMAIL         — service account email (JWT `iss`/`sub`)
//   FCM_PRIVATE_KEY_BASE64   — base64 of the service account's PEM private key
//   FCM_ENV                  — unused today; reserved so a future staging project
//                              can be selected without another env-shape change.
//
// SECURITY: the decoded PEM is passed straight into the signer and is NEVER
// logged, stringified, or returned. Do not add debug output that touches it.

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
// Refresh the access token this many seconds before it actually expires, so a
// send never rides an about-to-expire credential (same skew idea as proxy.ts).
const EXP_SKEW_SECONDS = 60

type Config = { projectId: string; clientEmail: string; privateKey: string }

let configInit = false
let config: Config | null = null

// Lazy singleton. Returns null when any required env var is absent (dev slots
// without the credentials) so the route skips android-native rows instead of
// crashing — identical degradation to getClient() in lib/apns.ts.
function getConfig(): Config | null {
  if (configInit) return config
  configInit = true

  const projectId = process.env.FCM_PROJECT_ID
  const clientEmail = process.env.FCM_CLIENT_EMAIL
  const keyB64 = process.env.FCM_PRIVATE_KEY_BASE64
  if (!projectId || !clientEmail || !keyB64) {
    config = null
    return config
  }

  // Decode the PEM from base64 at init. Base64 (rather than the raw PEM) because
  // the key is multi-line and every env-var transport mangles newlines
  // differently — the same reason APNS_PRIVATE_KEY_BASE64 is shaped this way.
  const privateKey = Buffer.from(keyB64, "base64").toString("utf8")
  config = { projectId, clientEmail, privateKey }
  return config
}

/**
 * True when the FCM credentials are configured. The route checks this before
 * routing android-native rows; when false those rows are skipped and logged,
 * never failed loudly — mirrors apnsReady().
 */
export function fcmReady(): boolean {
  return getConfig() !== null
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// ── OAuth2 access token (service-account JWT bearer flow) ────────────────────
// Google issues a 1-hour access token in exchange for a self-signed RS256 JWT.
// Cached across invocations; a warm Fluid Compute instance reuses it rather than
// paying a token round trip per notification.
let cachedToken: { value: string; expiresAt: number } | null = null
let inFlight: Promise<string | null> | null = null

async function mintAccessToken(cfg: Config): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = b64url(
    JSON.stringify({
      iss: cfg.clientEmail,
      sub: cfg.clientEmail,
      aud: TOKEN_URL,
      scope: SCOPE,
      iat: now,
      exp: now + 3600,
    }),
  )

  let signature: string
  try {
    const signer = createSign("RSA-SHA256")
    signer.update(`${header}.${claims}`)
    signer.end()
    signature = b64url(signer.sign(cfg.privateKey))
  } catch {
    // A malformed PEM must not throw into the dispatch route.
    return null
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claims}.${signature}`,
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!json.access_token) return null
    cachedToken = {
      value: json.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
    }
    return cachedToken.value
  } catch {
    return null
  }
}

async function getAccessToken(cfg: Config): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt - now > EXP_SKEW_SECONDS) return cachedToken.value
  // Collapse a concurrent fan-out onto ONE token mint. Without this a broadcast to
  // N Android devices on a cold instance fires N identical token requests.
  if (!inFlight) {
    inFlight = mintAccessToken(cfg).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

// ok    = FCM accepted the message (HTTP 200).
// prune = the token is permanently dead and its subscription row should be
//         deleted — parity with web-push 404/410 and the APNs Unregistered rule.
//         Transient failures (500/503/429/network) → { ok:false, prune:false }.
export type FcmSendResult = { ok: boolean; prune: boolean }

// FCM v1 permanent-failure classification. UNREGISTERED means the app was
// uninstalled or the token rotated; INVALID_ARGUMENT on a send means the token is
// malformed; SENDER_ID_MISMATCH means it belongs to a different Firebase project.
// All three are permanent for THIS row. Everything else (UNAVAILABLE, INTERNAL,
// QUOTA_EXCEEDED, network) is retryable and must never prune a live device.
function isPermanentFailure(status: number, errorStatus: string | undefined): boolean {
  if (status === 404) return true
  if (status === 403 && errorStatus === "SENDER_ID_MISMATCH") return true
  if (status === 400 && errorStatus === "INVALID_ARGUMENT") return true
  return errorStatus === "UNREGISTERED"
}

export async function sendFcmNotification(opts: {
  token: string
  title: string
  body: string
  url: string
  tag: string
}): Promise<FcmSendResult> {
  const cfg = getConfig()
  if (!cfg) return { ok: false, prune: false } // caller should gate on fcmReady()

  const accessToken = await getAccessToken(cfg)
  if (!accessToken) return { ok: false, prune: false }

  // `data.url` is the deep link — lib/native-push.ts's pushNotificationActionPerformed
  // reads notification.data.url, the SAME key the web service worker and the APNs
  // payload use. FCM data values must be strings.
  //
  // android.notification.tag coalesces repeat notifications for one subject, matching
  // the web SW's notification `tag` and the APNs threadId.
  const message = {
    message: {
      token: opts.token,
      notification: { title: opts.title, body: opts.body },
      data: { url: opts.url },
      android: {
        priority: "HIGH",
        notification: {
          tag: opts.tag,
          // Cream/plum brand accent on the small icon, matching the shell chrome.
          color: "#3E1540",
          default_sound: true,
          // Tapping opens the app and delivers the data payload to the listener
          // rather than silently dismissing.
          click_action: "FCM_PLUGIN_ACTIVITY",
        },
      },
    },
  }

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(message),
      },
    )

    if (res.ok) return { ok: true, prune: false }

    let errorStatus: string | undefined
    try {
      const json = (await res.json()) as { error?: { status?: string } }
      errorStatus = json.error?.status
    } catch {
      // Non-JSON error body — fall back to the status code alone.
    }
    return { ok: false, prune: isPermanentFailure(res.status, errorStatus) }
  } catch {
    // Network / unexpected error — transient, never prune.
    return { ok: false, prune: false }
  }
}
