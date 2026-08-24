// ─── Taking a notification back down once you've seen the thing ──────────────
//
// A push is a claim: "there is something here you haven't seen." The moment you
// HAVE seen it, that claim is false, and a notification sitting in the tray for a
// message you already read is the app lying to you.
//
// Tapping the notification already clears it — both platforms do that themselves.
// The broken case is the common one: you glance at the banner, open the app the
// normal way, read the message, and the notification is STILL there afterwards,
// so you tap it later and land on a chat with nothing new in it.
//
// Both platforms already stamp every push with the same `tag` (dispatch route →
// `chat-<groupId>`, `announcement-<id>`, …): the web service worker sets it as the
// Notification `tag`, and APNs carries it as `thread-id` plus a `tag` key in the
// payload data. That shared key is what makes one dismissal function possible
// instead of two.
//
// EVERY path here is best-effort and silent. A notification that fails to clear is
// a small annoyance; an exception thrown into a chat's open path is a broken
// screen, and this runs on open.

/** True inside the Capacitor shell. Cached — the dynamic import is not free. */
let nativeChecked = false
let nativeIsShell = false
async function isNative(): Promise<boolean> {
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

/**
 * Pull down every delivered notification carrying `tag`.
 *
 * Call it when the user has actually SEEN the thing the notification was about —
 * on opening a chat, on reading it, on returning to the app with it already open.
 * Safe to call repeatedly and safe to call when there is nothing to clear; it is
 * a no-op without notification permission, without a service worker, and on any
 * platform that does not implement the APIs.
 */
export async function dismissDelivered(tag: string): Promise<void> {
  if (!tag) return
  try {
    if (await isNative()) {
      await dismissNative(tag)
    } else {
      await dismissWeb(tag)
    }
  } catch {
    // Never surfaces. See the header note.
  }
}

async function dismissWeb(tag: string): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  // getRegistration(), NOT `ready`: `ready` never settles when no worker is
  // registered (permission refused, an unsupported browser, a hard reload before
  // registration), and awaiting it here would hang the caller forever.
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg || typeof reg.getNotifications !== "function") return
  // The tag filter is the whole point — never getNotifications() unfiltered and
  // close everything, or reading one chat silently clears every other chat's
  // unread notice too.
  const shown = await reg.getNotifications({ tag })
  for (const n of shown) n.close()
}

async function dismissNative(tag: string): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications")
  const delivered = await PushNotifications.getDeliveredNotifications()
  const list = delivered?.notifications ?? []
  if (list.length === 0) return

  // `PushNotificationSchema.tag` is ANDROID-ONLY, so iOS has to be matched through
  // the payload. The dispatch route puts `tag` in the APNs data for exactly this,
  // and the `url` check is the fallback that keeps notifications already sitting
  // in someone's tray — sent by a build that predates the `tag` key — dismissable
  // too. A web deploy reaches every installed binary at once but it cannot reach
  // a push that was delivered yesterday.
  const match = list.filter((n) => {
    const data = (n.data ?? {}) as { tag?: string; url?: string }
    if (n.tag === tag) return true
    if (data.tag === tag) return true
    return typeof data.url === "string" && urlMatchesTag(data.url, tag)
  })
  if (match.length === 0) return
  await PushNotifications.removeDeliveredNotifications({ notifications: match })
}

/**
 * Does this deep-link URL belong to `tag`?
 *
 * Only the shapes the dispatch route actually emits, and only where the id in the
 * tag appears in the URL — never a loose `includes`, which would make `chat-1`
 * match a URL for chat `12`.
 */
function urlMatchesTag(url: string, tag: string): boolean {
  const dash = tag.indexOf("-")
  if (dash < 0) return false
  const kind = tag.slice(0, dash)
  const id = tag.slice(dash + 1)
  if (!id) return false
  if (kind === "chat") return url.includes(`chat=${id}`)
  if (kind === "announcement") return url.includes(`announcement=${id}`) || url.includes(`/announcements/${id}`)
  return false
}
