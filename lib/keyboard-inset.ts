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
// amount is real and layout has to subtract it.
//
// Those are two different WORLDS, not one expression that happens to cover both.
// `innerHeight - visualViewport.height` does settle to 0 under a resized WebView,
// but only at REST: mid-animation the two properties update on different frames,
// and the transient reads a full keyboard height — which the layout then applies
// on top of the resize that already happened. So the shell PINS the inset to 0
// (nativeManagesResize) and only measures where nothing else is resizing.
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

import { useEffect } from "react"
import type { RefObject } from "react"

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

// Set once the native Keyboard plugin is confirmed to be managing resize. From
// then on the inset is PINNED to 0 rather than measured — see measure().
let nativeManagesResize = false

// ── Visual-viewport tracking (web only — see why it must not run natively) ────
function measure() {
  // In the shell, iOS resizes the WKWebView itself, so the occluded amount is 0
  // by construction. It is NOT enough to let the measurement arrive at 0 on its
  // own: `window.innerHeight` and `visualViewport.height` do not update on the
  // same frame during the keyboard animation. In the window where innerHeight
  // still reports the full screen but vv.height has already shrunk, this
  // computes a full keyboard height — and .kb-lift then lifts the chat by that
  // much AGAIN, on top of a WebView iOS already shrank by exactly that much.
  // The composer is shoved a keyboard's height below the screen and snaps back
  // when innerHeight catches up, which reads as the composer taking a second or
  // two to "load in". Measuring is only correct where nothing else is resizing.
  if (nativeManagesResize) { setInset(0); return }

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

    // Hand the inset over to the native resize BEFORE any keyboard can appear.
    // Set only after the plugin import resolves, so an older shell binary without
    // it keeps the measured path (there nothing resizes, so measuring is right).
    nativeManagesResize = true
    setInset(0)

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

/**
 * React to the keyboard. Deliberately a subscription and NOT a hook: on the web path
 * the inset lands over several visual-viewport events as the keyboard slides, so a
 * component reading this through `useSyncExternalStore` re-renders once per event,
 * mid-animation — a self-inflicted stutter in the one moment the frame budget is
 * already spoken for. ChatScreen (this module's only JS consumer) just needs to
 * re-pin its scroll, which is a side effect, not a render.
 *
 * Anything that only needs to LOOK different should read `var(--kb-inset)` /
 * `html[data-kb-open]` in CSS and not subscribe at all.
 */
export function subscribeKeyboard(cb: (state: { inset: number; open: boolean }) => void): () => void {
  const wrapped = () => cb({ inset, open })
  listeners.add(wrapped)
  return () => { listeners.delete(wrapped) }
}

/** Dismiss the keyboard by blurring whatever text field currently owns it. */
export function dismissKeyboard(): void {
  const el = document.activeElement as HTMLElement | null
  if (!el) return
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) el.blur()
}

// A keyboard dismiss must not fire on the flick that STARTS a scroll up through
// history, so it takes a deliberate drag — further than a scroll nudge, and
// clearly vertical.
const SWIPE_DOWN_PX = 44
const SWIPE_SLOP_PX = 30

/**
 * Swipe DOWN to dismiss the keyboard (iMessage/Messenger). Pass the ref of a surface
 * that sits against the keyboard.
 *
 * `whenScrolledToBottom` is the disambiguator for a scroller: inside a transcript a
 * downward drag already MEANS "scroll toward older messages", so the gesture is only
 * claimed when there is nothing further to reveal — which is exactly where the view
 * sits after the keyboard opens (it re-pins to the newest message). On a non-scroller
 * like the composer bar there is no competing meaning, so it is claimed anywhere.
 *
 * Deliberately NOT iOS's interactive `keyboardDismissMode`, where the keyboard tracks
 * the finger: that lives on the WebView's OWN scroll view, and the transcript here is
 * an inner overflow div the WebView knows nothing about. This blurs on intent and lets
 * the keyboard play its normal dismiss animation.
 *
 * Takes the ref rather than returning one so it can ride an element that already has
 * one (the transcript's `scrollContainerRef`) without merging two refs onto a node.
 */
export function useSwipeDownToDismissKeyboard<T extends HTMLElement>(
  ref: RefObject<T | null>,
  opts: { whenScrolledToBottom?: boolean } = {},
): void {
  const { whenScrolledToBottom = false } = opts

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Coarse pointer only — a trackpad drag is not a keyboard gesture.
    if (!window.matchMedia("(pointer: coarse)").matches) return

    let startX = 0
    let startY = 0
    let armed = false
    let fired = false

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1 || !open) { armed = false; return }
      const node = ref.current
      if (!node) { armed = false; return }
      if (whenScrolledToBottom && node.scrollHeight - node.scrollTop - node.clientHeight > 8) {
        armed = false
        return
      }
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      armed = true
      fired = false
    }

    function onMove(e: TouchEvent) {
      if (!armed || fired || e.touches.length !== 1) return
      const dy = e.touches[0].clientY - startY
      const dx = Math.abs(e.touches[0].clientX - startX)
      if (dy > SWIPE_DOWN_PX && dx < SWIPE_SLOP_PX) {
        fired = true
        armed = false
        dismissKeyboard()
      }
    }

    function onEnd() { armed = false }

    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: true })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [ref, whenScrolledToBottom])
}
