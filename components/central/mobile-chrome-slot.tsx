"use client"

// ── The mobile chrome ACTION SLOT ─────────────────────────────────────────────
//
// mobile_design_system §3: a phone-width screen has ONE chrome row, and the
// screen's controls live IN it. Anything that opens a second row under the header
// — a lone create button, a year picker, a filter — is a violation: it reads as a
// stray floating row and it pushes the content down by its own height.
//
// The rule kept being broken because obeying it was hard. The control usually
// lives deep inside the screen body (the event Roles pane is ~7 levels down; the
// Allocation year picker is inside FinanceWorkspace, a different component from
// the chrome entirely), so putting it in the header meant threading a ReactNode
// up through every intermediate — and people reasonably rendered it where it was
// instead.
//
// So the slot is a REGISTRY, not a prop and not a context provider:
//
//   · every shared mobile chrome registers its own action <div> on mount
//   · `MobileChromeActions` portals its children into the top-most VISIBLE one
//
// There is nothing to wire at the call site and no provider to forget — which is
// the point. A deep child writes `<MobileChromeActions>` and the pixels land in
// the header, wherever that header happens to be built.
//
// A module-level stack (not context) because the chrome and the body are usually
// SIBLINGS, not ancestor and descendant — a provider would have to wrap the whole
// screen, which is exactly the boilerplate that gets skipped.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/** Mounted chrome slots, most recently mounted last. */
let slots: HTMLElement[] = []
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

/** The slot that should receive actions: the LAST mounted one that is visible. */
function activeSlot(): HTMLElement | null {
  for (let i = slots.length - 1; i >= 0; i--) {
    const el = slots[i]
    // Desktop and mobile trees are co-mounted (Tailwind hides one via CSS rather
    // than unmounting), so "mounted" is not "on screen" — offsetParent is.
    if (el.offsetParent !== null) return el
  }
  return null
}

/**
 * For a CHROME component: attach the returned ref to the row's trailing action
 * container. Registering is all it takes to become the target for
 * `MobileChromeActions`.
 */
export function useChromeSlotRef() {
  return useCallback((node: HTMLElement | null) => {
    if (node) {
      slots.push(node)
      notify()
    } else {
      // Cleanup runs with null when the chrome unmounts; drop any node no longer
      // in the document so a swapped screen can't keep the slot.
      slots = slots.filter((el) => el.isConnected)
      notify()
    }
  }, [])
}

/**
 * Render controls into the current mobile chrome row. Renders nothing when no
 * mobile chrome is on screen — so a component that is shared between widths can
 * use it unconditionally and it simply no-ops on desktop.
 */
export function MobileChromeActions({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [fromVisibleTree, setFromVisibleTree] = useState(false)
  const markerRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const sync = () => {
      setHost(activeSlot())
      // A component shared across widths is MOUNTED TWICE — the desktop and mobile
      // trees are both in the DOM, with one hidden by CSS. Without this check both
      // instances portal into the same slot and you get the control twice (this
      // shipped exactly that: two year pickers in the Allocation header, squeezing
      // the title to "Al…"). The marker sits where this instance actually lives, so
      // its offsetParent tells us whether THIS copy is the visible one.
      setFromVisibleTree(markerRef.current?.offsetParent != null)
    }
    sync()
    listeners.add(sync)
    // The active slot and the visible tree can both change without a registration
    // (a co-mounted branch becoming visible on resize), so re-resolve then too.
    window.addEventListener("resize", sync)
    return () => { listeners.delete(sync); window.removeEventListener("resize", sync) }
  }, [])

  return (
    <>
      {/* Zero-size but LAID OUT — `display:none` would null its own offsetParent
          and make every instance look hidden. */}
      <span ref={markerRef} aria-hidden style={{ width: 0, height: 0, overflow: "hidden" }} />
      {fromVisibleTree && host ? createPortal(children, host) : null}
    </>
  )
}
