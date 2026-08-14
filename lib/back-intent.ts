// ─── The ONE back-intent layer ───────────────────────────────────────────────
//
// Convention #22 already settled the shape of "go up one level": the chrome
// chevron and the left-edge swipe are the SAME action, resolved ONCE per surface
// and handed to both inputs. `SubpageShell` is the canonical site —
//
//   const back = [...crumbs].reverse().find(c => c.onClick)
//   const swipeRef = useEdgeSwipeBack<HTMLDivElement>(back?.onClick)
//
// Android's hardware/gesture back is a THIRD INPUT for that same action, not a
// new concept. So it registers against the same handler, one line next to the
// existing useEdgeSwipeBack call, and every surface that already has a chevron
// gets it for free. Anything else — a per-screen `backButton` listener, or a
// switch on the active tab living in the bridge — reintroduces exactly the
// duplication #22 exists to prevent.
//
// LIFO, because "up one level" means the MOST RECENTLY opened surface. Mount
// order gives that for free: a modal opened on top of a subpage registers after
// it, so it sits above it on the stack and closes first.
//
// The top handler is CALLED, never popped here. A handler's job is to unmount
// its surface, and that unmount runs the cleanup that removes it — popping too
// would drop the entry underneath it as well. A handler that unmounts nothing
// (a confirm dialog that stays put) correctly makes back a no-op rather than
// silently dismissing something the user didn't aim at.
//
// This module is a LEAF (React only, no @/ imports) so `components/central/*`
// may consume it — the same rule that lets lib/tz.ts be a leaf dependency.
//
// iOS is unaffected by construction: `backButton` is an Android-only Capacitor
// event, so on iOS nothing ever calls runBackIntent() and the stack is inert.

import { useEffect, useRef } from "react"

type BackHandler = () => void

const stack: Array<{ run: BackHandler }> = []

/**
 * Register a back handler. Returns its unregister function.
 * Prefer the `useBackIntent` hook — this is the imperative escape hatch.
 */
export function pushBackIntent(run: BackHandler): () => void {
  const entry = { run }
  stack.push(entry)
  return () => {
    const i = stack.lastIndexOf(entry)
    if (i !== -1) stack.splice(i, 1)
  }
}

/**
 * Run the topmost back handler. Returns false when nothing is registered, which
 * is the bridge's signal to fall through to the OS (minimize the app).
 */
export function runBackIntent(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.run()
  return true
}

/** Registered depth — for diagnostics and tests. */
export function backIntentDepth(): number {
  return stack.length
}

/**
 * Register `handler` as this surface's "up one level" action for as long as the
 * component is mounted. Pass the SAME handler the chrome chevron fires.
 *
 * The handler is held in a ref and the registration effect keyed only on whether
 * one EXISTS — so a new closure every render (the normal case for a crumb's
 * onClick) updates the behavior without re-ordering the stack. Re-registering on
 * identity change would float a background surface above a modal opened over it.
 */
export function useBackIntent(handler: BackHandler | undefined, enabled: boolean = true): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })

  const active = enabled && !!handler
  useEffect(() => {
    if (!active) return
    return pushBackIntent(() => ref.current?.())
  }, [active])
}
