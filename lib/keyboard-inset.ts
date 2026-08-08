// ─── The ONE on-screen-keyboard layer ────────────────────────────────────────
//
// Central runs the same bundle in two containers, and the software keyboard
// behaves differently in each. Everything that needs to react to the keyboard
// reads the two values this module publishes — never a raw listener of its own:
//
//   --kb-inset  (CSS var, px)  how much of the LAYOUT VIEWPORT the keyboard
//                              occludes. 0 when no keyboard, and 0 in the native
//                              shell (see below — the WebView itself shrinks
//                              there, so nothing is occluded).
//   [data-kb-open]  (html attr) whether a keyboard is showing AT ALL, in either
//                              container. This is NOT `--kb-inset > 0`.
//
// Why two values and not one: in the Capacitor shell the Keyboard plugin runs
// `resize: "native"`, so iOS shrinks the WKWebView frame to the region above the
// keyboard. The web layer's viewport IS the visible area — `fixed inset-0`
// already lands exactly on top of the keyboard, and the occluded amount is
// genuinely zero. In mobile Safari nothing resizes: the layout viewport keeps
// its full height and the keyboard sits OVER the bottom of it, so the occluded
// amount is real and layout has to subtract it. One var covers both because
// `innerHeight - visualViewport.height` naturally reports 0 under a resized
// WebView and the true height under an overlaid one — same expression, no fork.
//
// `data-kb-open` exists because things other than height depend on the keyboard:
// `env(safe-area-inset-bottom)` must collapse (the home indicator is behind the
// keyboard, so reserving 34px for it leaves a dead band), and floating chrome
// (the super-switcher) has to get out of the way. Those are true in BOTH
// containers, including the one where the inset is 0.
//
// The native side additionally kills the iOS form-assistant bar — the
// `^ v Done` strip that iMessage and Messenger don't show. That is native-only
// surface; there is no web equivalent and no web fallback.

import { useSyncExternalStore } from "react"

// A keyboard is hundreds of px. Anything smaller is browser chrome settling
// (the mobile-Safari URL bar collapsing on scroll moves the visual viewport by
// ~60px), and treating that as a keyboard makes the composer jitter mid-scroll.
const KEYBOARD_MIN_PX = 120

let inset = 0
let open = false
let started = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function setInset(next: number) {
  const rounded = Math.round(next)
  if (rounded === inset) return
  inset = rounded
  document.documentElement.style.setProperty("--kb-inset", `${rounded}px`)
  emit()
}

function setOpen(next: boolean) {
  if (next === open) return
  open = next
  if (next) document.documentElement.setAttribute("data-kb-open", "")
  else document.documentElement.removeAttribute("data-kb-open")
  emit()
}

// ── Visual-viewport tracking (web; inert-but-harmless in the native shell) ────
function measure() {
  const vv = window.visualViewport
  if (!vv) return
  // offsetTop is how far the visual viewport has been scrolled down inside the
  // layout viewport — iOS adds it when it scrolls a focused field into view.
  // Counting it keeps the measurement "how much is hidden at the bottom",
  // which is what layout actually needs.
  const occluded = window.innerHeight - vv.height - vv.offsetTop
  setInset(occluded > KEYBOARD_MIN_PX ? occluded : 0)
}

// ── Native shell ─────────────────────────────────────────────────────────────
// Every Capacitor import is dynamic so the web bundle never pulls the plugin in,
// and a shell binary built BEFORE this plugin existed throws UNIMPLEMENTED
// rather than crashing — it just falls back to the visual-viewport path above.
async function startNative() {
  try {
    const { Capacitor } = await import("@capacitor/core")
    if (!Capacitor.isNativePlatform()) return
    const { Keyboard } = await import("@capacitor/keyboard")

    // The `^ v Done` accessory bar. Purely native chrome — this is the only way
    // to remove it, and it is why the composer looked wrong even when the
    // heights were right.
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {})

    // willShow/willHide (not didShow/didHide) so the layout change rides the
    // SAME animation frame budget as the keyboard's own slide — waiting for
    // `did` lands the composer a visible beat after the keys.
    Keyboard.addListener("keyboardWillShow", () => setOpen(true)).catch(() => {})
    Keyboard.addListener("keyboardWillHide", () => setOpen(false)).catch(() => {})
  } catch {
    // Not native, or an older shell without the plugin. The web path covers it.
  }
}

/** Idempotent global init. Mounted once from the root layout. */
export function startKeyboardInset(): void {
  if (started || typeof window === "undefined") return
  started = true

  const vv = window.visualViewport
  if (vv) {
    measure()
    vv.addEventListener("resize", measure)
    vv.addEventListener("scroll", measure)
  }

  // Focus/blur is the container-agnostic signal for "a keyboard is coming".
  // On web it also beats visualViewport to the punch by an animation frame, so
  // `data-kb-open` flips before the height lands and the safe-area collapse and
  // the height change happen together instead of in two steps.
  const isTextEntry = (el: EventTarget | null) => {
    const node = el as HTMLElement | null
    if (!node) return false
    const tag = node.tagName
    return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable === true
  }
  document.addEventListener("focusin", e => { if (isTextEntry(e.target)) setOpen(true) })
  document.addEventListener("focusout", e => {
    if (!isTextEntry(e.target)) return
    // Deferred: tapping straight from the composer into a mention row fires
    // focusout before the next focusin, and closing on that intermediate frame
    // drops the composer to the floor and snaps it back.
    setTimeout(() => { if (!isTextEntry(document.activeElement)) setOpen(false) }, 60)
  })

  void startNative()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/**
 * Keyboard state for components that need it in JS (scroll-to-bottom on open,
 * hiding floating chrome). Pure-CSS consumers should read `var(--kb-inset)` /
 * `html[data-kb-open]` instead and skip the re-render entirely.
 */
export function useKeyboardInset(): { inset: number; open: boolean } {
  const snapshotInset = useSyncExternalStore(subscribe, () => inset, () => 0)
  const snapshotOpen = useSyncExternalStore(subscribe, () => open, () => false)
  return { inset: snapshotInset, open: snapshotOpen }
}
