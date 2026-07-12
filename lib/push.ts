import { createClient } from "@/lib/supabase"

// Web Push v1 — browser-side subscribe / unsubscribe / state helpers.
// Subscriptions are stored in `push_subscriptions` (upsert keyed on endpoint) with
// the owner's user_id + ministry_id (RLS: owner-only, INSERT check ministry match).

export type PushPermission = "default" | "granted" | "denied" | "unsupported"

export interface PushState {
  supported: boolean
  permission: PushPermission
  subscribed: boolean
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

// iOS home-screen PWA vs ordinary web. iOS only delivers Web Push to installed PWAs,
// so the platform is worth recording per subscription.
function detectPlatform(): "web" | "ios-pwa" {
  if (typeof window === "undefined") return "web"
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const standalone =
    nav.standalone === true ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches)
  const ua = navigator.userAgent || ""
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  return standalone && isIOS ? "ios-pwa" : "web"
}

// VAPID public key (base64url) → BufferSource for pushManager.subscribe.
function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const output = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  // PWARegister only registers in production; register here too so the subscribe
  // flow works in dev / e2e. register() is idempotent.
  await navigator.serviceWorker.register("/sw.js").catch(() => {})
  return navigator.serviceWorker.ready
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) {
    return { supported: false, permission: "unsupported", subscribed: false }
  }
  const permission = Notification.permission as PushPermission
  let subscribed = false
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js")
    if (reg) {
      const sub = await reg.pushManager.getSubscription()
      subscribed = !!sub
    }
  } catch {
    subscribed = false
  }
  return { supported: true, permission, subscribed }
}

// Discriminated result — a failure ALWAYS carries a reason so callers can reset
// their pending UI and branch (denied → settings hint; anything else → retry).
// `reason: "denied"` is the only non-transient failure.
export type SubscribeResult = { ok: true } | { ok: false; reason: string }

// ministry_id + user_id are stamped server-side by claim_push_endpoint, so the
// caller no longer needs to pass a ministry id.
//
// EVERY failure path is caught (permission denied mid-flow, pushManager.subscribe
// rejection — which happens in headless/incognito Chromium, crbug.com/41124656 —
// and rpc errors). A rejection must never leave the caller's `await` hanging, or
// the subscribe UI stays stuck on its "Turning on…" pending state forever.
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: "unsupported" }
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) return { ok: false, reason: "missing-vapid-key" }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") return { ok: false, reason: permission } // "denied" | "default"

    const reg = await ensureRegistration()
    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      }))

    const json = sub.toJSON()
    if (!json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "subscription-missing-keys" }
    }

    const supabase = createClient()
    // SECURITY DEFINER RPC (not a direct upsert): deletes any OTHER user's row on
    // this endpoint before upserting the caller's, and stamps user_id/ministry_id
    // server-side. Owner-only RLS would otherwise block a second user on a shared
    // device from displacing the first — their upsert throws and the old user keeps
    // receiving pushes on this device.
    const { error } = await supabase.rpc("claim_push_endpoint", {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_platform: detectPlatform(),
      p_user_agent: navigator.userAgent,
    })
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "subscribe-failed"
    // If the browser itself now reports push as blocked, treat it as denied
    // (settings hint), not a transient error. Otherwise it's retryable.
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return { ok: false, reason: "denied" }
    }
    return { ok: false, reason: msg }
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: "unsupported" }
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js")
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (!sub) return { ok: true }
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    const supabase = createClient()
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unsubscribe-failed" }
  }
}
