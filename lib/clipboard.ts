/**
 * The one way to put text on the clipboard.
 *
 * `navigator.clipboard` is unavailable on insecure origins and inside some
 * in-app webviews, and it rejects (rather than throws) when the document is not
 * focused — so every call site that used it raw either swallowed a rejection or
 * showed a success state for a copy that never happened. This resolves a
 * BOOLEAN so the caller can only claim success when it's true.
 *
 * The fallback is the legacy `execCommand("copy")` over an off-screen textarea:
 * deprecated, but it is the only thing that works where the async API doesn't,
 * and it is synchronous so it stays inside the user gesture.
 *
 * Pre-existing ad-hoc `navigator.clipboard.writeText` sites are not migrated
 * here yet (settings, invite share, give, ministries, pending, getting-started)
 * — new code uses this; don't add a seventh hand-rolled copy.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path — a rejection here is usually "document
    // not focused" or a permissions policy, both of which execCommand survives.
  }

  try {
    if (typeof document === "undefined") return false
    const ta = document.createElement("textarea")
    ta.value = text
    // Off-screen but focusable: `display:none` / `hidden` are not selectable, and
    // a visible textarea would scroll the page when it takes focus.
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.top = "0"
    ta.style.left = "-9999px"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand("copy")
    ta.remove()
    return ok
  } catch {
    return false
  }
}
