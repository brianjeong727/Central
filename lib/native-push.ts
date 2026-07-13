import { createClient } from "@/lib/supabase"
import {
  subscribeToPush,
  getPushState,
  type PushState,
  type SubscribeResult,
} from "@/lib/push"

// ── Native (Capacitor iOS shell) push bridge ─────────────────────────────────
// This runs inside the DEPLOYED web app (https://joincentral.app). When that page is
// loaded inside the Capacitor iOS shell, the browser Push API is unavailable — iOS
// only delivers native pushes through APNs. So here we route the same subscribe /
// state calls to Capacitor's PushNotifications plugin instead of the web PushManager.
//
// Every Capacitor import is DYNAMIC (`await import(...)`) so the web bundle never
// hard-depends on @capacitor/* at module top — on plain web the modules are simply
// never imported and the code falls through to the identical web path. Web behavior
// is byte-for-byte unchanged when not in the shell.

let nativeChecked = false
let nativeIsShell = false

// Detect the Capacitor native container once, then cache. Any import/throw → web.
async function detectNative(): Promise<boolean> {
  if (nativeChecked) return nativeIsShell
  nativeChecked = true
  try {
    const { Capacitor } = await import("@capacitor/core")
    nativeIsShell = Capacitor.isNativePlatform()
  } catch {
    nativeIsShell = false
  }
  return nativeIsShell
}

// Set up the native push listeners exactly once per page. Idempotent: the flag guards
// against a second wiring when both the subscribe prompt and the settings section mount.
let listenersReady = false
async function ensureNativeListeners(): Promise<void> {
  if (listenersReady) return
  listenersReady = true
  const { PushNotifications } = await import("@capacitor/push-notifications")

  // APNs device token → store as a subscription row. Mirrors claim_push_endpoint: the
  // SECURITY DEFINER RPC stamps user_id/ministry_id and writes endpoint = 'apns:'||token,
  // platform = 'ios-native'. The dispatch route skips these until the APNs sender ships.
  await PushNotifications.addListener("registration", async (token) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc("claim_native_push_token", {
        p_token: token.value,
        p_user_agent: navigator.userAgent,
      })
      // Loud on failure (inspector-visible) — a silently swallowed claim error cost
      // a device-debugging session on 2026-07-12. Still never throws into the app.
      if (error) console.error("[push] native token claim failed:", error.message)
    } catch (e) {
      console.error("[push] native token claim threw:", e)
    }
  })

  await PushNotifications.addListener("registrationError", () => {
    // Non-fatal: permission may be granted later or APNs may be unreachable in the sim.
  })

  // Foreground receipt — iOS suppresses the banner while the app is open; the in-app
  // realtime channels already surface new content, so nothing to do here.
  await PushNotifications.addListener("pushNotificationReceived", () => {})

  // Tap on a notification → deep-link. The APNs payload carries the SAME `url` param the
  // web service worker uses (e.g. /home?tab=chats&chat=<id>), so we just navigate the
  // shell's WebView to it.
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const data = action?.notification?.data as { url?: string } | undefined
    const url = data?.url
    if (typeof url === "string" && url) {
      try {
        window.location.assign(url)
      } catch {
        // ignore navigation failures
      }
    }
  })
}

// Native subscribe: request permission, wire listeners, register with APNs. The APNs
// token arrives ASYNC via the 'registration' listener above, which performs the RPC —
// so a resolved { ok: true } here means "registration kicked off", not "token stored".
async function subscribeToNativePush(): Promise<SubscribeResult> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== "granted") {
      // 'denied' (settings hint) or 'prompt' (dismissed) — mirror the web reason shape.
      return { ok: false, reason: perm.receive === "denied" ? "denied" : "default" }
    }
    await ensureNativeListeners()
    await PushNotifications.register()
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "native-subscribe-failed" }
  }
}

// Native permission state, shaped like the web PushState. We treat "permission granted"
// as "subscribed" — the shell can't cheaply introspect an existing APNs registration,
// and granting always triggers register(). Also (re)wires listeners so a notification
// tapped while the app was backgrounded deep-links once the notifications UI mounts.
async function getNativePushState(): Promise<PushState> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    await ensureNativeListeners()
    const perm = await PushNotifications.checkPermissions()
    if (perm.receive === "granted") {
      // Re-register on EVERY state check while granted (≈ every app launch — Apple's
      // guidance: tokens rotate). Idempotent + cheap; also the retry path for a failed
      // or raced first registration, which otherwise had none.
      PushNotifications.register().catch(() => {})
      return { supported: true, permission: "granted", subscribed: true }
    }
    if (perm.receive === "denied") {
      return { supported: true, permission: "denied", subscribed: false }
    }
    return { supported: true, permission: "default", subscribed: false }
  } catch {
    return { supported: false, permission: "unsupported", subscribed: false }
  }
}

// ── Unified entry points used by notifications.tsx ───────────────────────────
// In the native shell → route to APNs. Otherwise → the untouched web path.

export async function subscribeToPushUnified(): Promise<SubscribeResult> {
  if (await detectNative()) return subscribeToNativePush()
  return subscribeToPush()
}

export async function getPushStateUnified(): Promise<PushState> {
  if (await detectNative()) return getNativePushState()
  return getPushState()
}

// Exposed for callers that want to know the container (e.g. to hide a web-only "turn
// off" affordance the native OS owns instead). Not required for the basic flow.
export async function isNativeShell(): Promise<boolean> {
  return detectNative()
}

// SYNCHRONOUS best-effort heuristic for render-time gating (the async detectNative()
// above is authoritative but can't run before first paint). Capacitor injects a global
// `window.Capacitor` into the WebView, so its mere presence means "very likely the
// native shell" — enough to withhold the marketing splash for a beat while the async
// check confirms. On plain web `window.Capacitor` is undefined → false → web renders
// immediately with no delay. SSR-safe (guards `window`).
export function isLikelyNativeShell(): boolean {
  return typeof window !== "undefined" && !!(window as { Capacitor?: unknown }).Capacitor
}
