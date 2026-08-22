"use client"

// ─── Immersive message menu (long-press) ─────────────────────────────────────
//
// The iMessage/Messenger arrangement: long-press a message and the room recedes
// — everything behind blurs and dims — while the message you pressed lifts out
// of the transcript with reactions above it and actions below it. Nothing else
// is reachable until you choose or dismiss.
//
// WHY AN OVERLAY AND NOT AN ANCHORED MENU. The old menu was absolutely
// positioned inside the message row, which put it inside the transcript's own
// scroll container: it could be clipped by that container, it could not dim what
// was around it, and near the top or bottom of the screen it had nowhere to go
// but off the edge. Lifting the message OUT is what makes the placement problem
// solvable at all — with the bubble free to move, the menu always fits.
//
// THE LIFT IS THE POINT. If the pressed message sits at the bottom of the
// screen there is no room below it for the actions, so the bubble travels UP
// during the entry animation to open that room; at the top it travels DOWN to
// make space for the reaction bar. Both fall out of one clamp
// (`resolveLayout`), which is a pure function so the arithmetic can be reasoned
// about — and tested — without a browser.
//
// The bubble is a DOM CLONE of the real one, not a re-render. A message bubble
// carries reply previews, attachments, link previews and polls; rebuilding that
// tree in a second component would be a second source of truth for what a
// message looks like, and it would drift. The clone is a snapshot and is inert
// by design — the menu is transient, and nothing in it is interactive.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useBackIntent } from "@/lib/back-intent"

/** Space between the bubble and each menu. */
const GAP = 10
/** Breathing room from the top/bottom edges, beyond the safe-area insets. */
const EDGE = 14
/** The bubble may not eat more than this share of the usable height. */
const BUBBLE_MAX_SHARE = 0.45
/** Enter is generous enough to read as a lift; exit gets out of the way. */
const ENTER_MS = 260
const EXIT_MS = 150
/** The house ease-out (same curve PocketSheet uses). Never ease-in. */
const EASE = "cubic-bezier(0.23, 1, 0.32, 1)"

export type MessageMenuAction = {
  key: string
  label: string
  icon: React.ReactNode
  danger?: boolean
  onSelect: () => void
}

export type MenuLayout = {
  /** Where the bubble ends up, in viewport coords. */
  bubbleTop: number
  /** How far it travelled to get there — the entry animates this away. */
  lift: number
  bubbleMaxH: number
  actionsMaxH: number
}

/**
 * Fit reaction bar + bubble + actions into the usable height, moving the bubble
 * as little as possible. Pure: no DOM, no React.
 *
 * Everything is in viewport coordinates. `top`/`bottom` already account for the
 * safe areas and any keyboard inset the caller measured.
 */
export function resolveLayout(input: {
  anchorTop: number
  anchorHeight: number
  barH: number
  actionsH: number
  top: number
  bottom: number
}): MenuLayout {
  const { anchorTop, anchorHeight, barH, top, bottom } = input
  const usable = Math.max(0, bottom - top)

  // The bubble yields first: a very tall message must not squeeze the controls
  // out of the screen, and clipping it is recoverable (you can still read it in
  // the transcript) where losing the actions is not.
  const bubbleMaxH = Math.max(0, Math.min(anchorHeight, usable * BUBBLE_MAX_SHARE))
  // Then the action list takes whatever is left, scrolling inside it.
  const actionsMaxH = Math.max(0, Math.min(input.actionsH, usable - barH - bubbleMaxH - GAP * 2))

  const lowest = top + barH + GAP
  const highest = bottom - actionsMaxH - GAP - bubbleMaxH
  // `highest` can fall below `lowest` only when the three cannot fit at all,
  // which the caps above already prevent; Math.max keeps the clamp well-formed
  // rather than inverting it.
  const bubbleTop = Math.min(Math.max(anchorTop, lowest), Math.max(lowest, highest))

  return { bubbleTop, lift: anchorTop - bubbleTop, bubbleMaxH, actionsMaxH }
}

export function MessageMenuOverlay({
  anchorEl,
  align,
  reactions,
  onReact,
  onMoreReactions,
  actions,
  onClose,
}: {
  /** The live bubble being pressed. Measured and cloned; never mutated. */
  anchorEl: HTMLElement
  align: "left" | "right"
  reactions: string[]
  onReact: (emoji: string) => void
  onMoreReactions?: () => void
  actions: MessageMenuAction[]
  onClose: () => void
}) {
  const cloneHostRef = useRef<HTMLDivElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const actionsRef = useRef<HTMLDivElement | null>(null)
  const [rect] = useState(() => anchorEl.getBoundingClientRect())
  const [layout, setLayout] = useState<MenuLayout | null>(null)
  const [shown, setShown] = useState(false)
  const [closing, setClosing] = useState(false)

  const dismiss = useCallback(() => {
    if (closing) return
    setClosing(true)
    // Let the exit play before the caller unmounts us. Shorter than the enter:
    // the user has already decided, and the system should get out of the way.
    setTimeout(onClose, EXIT_MS)
  }, [closing, onClose])

  useBackIntent(dismiss)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dismiss])

  // ── Clone the bubble ───────────────────────────────────────────────────────
  // A CALLBACK REF, not an effect. The host only exists once `layout` is
  // resolved, so a mount effect ran while it was still null, returned early, and
  // never ran again — the menu rendered with reactions and actions around
  // NOTHING. A callback ref fires exactly when the node appears, whenever that is.
  const attachClone = useCallback((host: HTMLDivElement | null) => {
    cloneHostRef.current = host
    if (!host || host.childElementCount > 0) return
    const copy = anchorEl.cloneNode(true) as HTMLElement
    copy.removeAttribute("data-message-bubble")
    copy.style.margin = "0"
    // The ORIGINAL is hidden while this is up (message-row sets visibility on the
    // bubble), and cloneNode copies the style attribute with it — so the clone
    // arrives invisible unless this is undone. Nothing renders, no error, and the
    // menu appears to have lost its message.
    copy.style.visibility = "visible"
    copy.style.maxWidth = "100%"
    // Inert: it is a picture of a message, and a stray tap inside it must not
    // reach anything that looked interactive in the original.
    copy.style.pointerEvents = "none"
    copy.setAttribute("aria-hidden", "true")
    host.appendChild(copy)
  }, [anchorEl])

  // ── Place everything, then reveal ──────────────────────────────────────────
  useLayoutEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null
    const viewportH = vv?.height ?? window.innerHeight
    // There is no --safe-top variable in this app (the shell applies
    // `env(safe-area-inset-top)` directly), so measure it: a throwaway element
    // whose padding IS the inset is the only reading that is right on a notched
    // phone AND on a browser where the inset is 0. Guessing a floor here is what
    // put the chat header 36px too low once already (Convention #27's overlay note).
    const probe = document.createElement("div")
    probe.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)"
    document.body.appendChild(probe)
    const probeStyle = getComputedStyle(probe)
    const safeTop = parseFloat(probeStyle.paddingTop) || 0
    const safeBottom = parseFloat(probeStyle.paddingBottom) || 0
    probe.remove()
    const kb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb-inset") || "0") || 0
    const barH = barRef.current?.offsetHeight ?? 52
    const actionsH = actionsRef.current?.scrollHeight ?? 200
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measure-then-place: the menus' heights are the INPUT to where everything goes, and they only exist once painted
    setLayout(resolveLayout({
      anchorTop: rect.top,
      anchorHeight: rect.height,
      barH,
      actionsH,
      top: safeTop + EDGE,
      bottom: viewportH - kb - safeBottom - EDGE,
    }))
    // Two frames: the first paints the menus at their resolved position with the
    // bubble still translated to where it really is, the second flips `shown` so
    // the transition has something to animate FROM. One frame is not reliably
    // enough — the browser can coalesce the style write with the initial paint,
    // and the lift is then instant.
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(r2)
    })
    return () => cancelAnimationFrame(r1)
  }, [rect])

  if (typeof document === "undefined") return null

  const open = shown && !closing
  const width = Math.min(rect.width, window.innerWidth - EDGE * 2)
  // Anchored to the side the bubble already sits on, then pulled back inside the
  // screen. A menu that hugs the message reads as belonging to it.
  const leftEdge = Math.max(EDGE, Math.min(rect.left, window.innerWidth - EDGE - width))
  const rightEdge = Math.max(EDGE, window.innerWidth - rect.right)

  const surface: React.CSSProperties = {
    background: "var(--ivory)",
    borderRadius: 16,
    overflow: "hidden",
  }
  // Both menus grow FROM the bubble — scaling from the middle of the screen
  // would read as a modal arriving, not as this message opening up.
  const pop = (originY: "top" | "bottom"): React.CSSProperties => ({
    transformOrigin: `${align === "right" ? "right" : "left"} ${originY}`,
    transform: open ? "scale(1)" : "scale(0.94)",
    opacity: open ? 1 : 0,
    transition: `transform ${open ? ENTER_MS : EXIT_MS}ms ${EASE}, opacity ${open ? ENTER_MS : EXIT_MS}ms ${EASE}`,
  })

  return createPortal(
    <div
      className="msg-menu-root"
      style={{ position: "fixed", inset: 0, zIndex: 170 }}
      onPointerDown={(e) => { e.stopPropagation(); dismiss() }}
    >
      {/* The room recedes. Blur is what makes it read as depth rather than as a
          dark sheet; kept modest because it is expensive, Safari especially. */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          background: "var(--veil-soft)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          opacity: open ? 1 : 0,
          transition: `opacity ${open ? ENTER_MS : EXIT_MS}ms ${EASE}`,
        }}
      />

      {/* Mounted BEFORE `layout` exists, deliberately. The action list's own height
          is an INPUT to the placement, so gating this on `layout` made the
          measurement circular: the effect measured a list that had not rendered,
          fell back to a 200px guess, and capped a five-item menu at four — Delete
          was simply missing from your own messages. They start invisible (`open`
          is false until the layout lands), so nothing flashes. */}
      <>
          {/* Reactions — ABOVE the message. */}
          <div
            ref={barRef}
            // Markers, not styling — the two menus are anonymous positioned divs,
            // and "did anything run off the screen?" is the whole contract here.
            data-msg-menu="reactions"
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              [align === "right" ? "right" : "left"]: align === "right" ? rightEdge : leftEdge,
              top: (layout?.bubbleTop ?? rect.top) - GAP,
              // POSITIONING ONLY. The pop lives on the child, because a single
              // element cannot hold both — `transform: scale()` from the animation
              // silently replaced this `translateY(-100%)` and the bar rendered ON
              // TOP of the message instead of above it.
              transform: "translateY(-100%)",
            } as React.CSSProperties}
          >
            <div style={{ ...surface, display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", ...pop("bottom") }}>
              {reactions.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => { e.stopPropagation(); onReact(emoji); dismiss() }}
                  className="msg-menu-emoji"
                  style={{ fontSize: 24, background: "none", border: "none", cursor: "pointer", lineHeight: 1, padding: 0 }}
                >
                  {emoji}
                </button>
              ))}
              {onMoreReactions && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMoreReactions(); dismiss() }}
                  aria-label="More reactions"
                  className="msg-menu-emoji"
                  style={{
                    width: 30, height: 30, borderRadius: 999, border: "none", cursor: "pointer",
                    background: "var(--line-2)", color: "var(--body)", fontSize: 17, lineHeight: 1,
                  }}
                >
                  +
                </button>
              )}
            </div>
          </div>

          {/* The message itself, lifted out of the transcript. */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            data-msg-menu="bubble"
            style={{
              position: "absolute",
              left: leftEdge, width,
              top: layout?.bubbleTop ?? rect.top,
              maxHeight: layout?.bubbleMaxH ?? rect.height,
              overflow: "hidden",
              display: "flex",
              justifyContent: align === "right" ? "flex-end" : "flex-start",
              transform: open ? "translateY(0)" : `translateY(${layout?.lift ?? 0}px)`,
              transition: `transform ${open ? ENTER_MS : EXIT_MS}ms ${EASE}`,
            }}
          >
            <div ref={attachClone} data-msg-clone />
          </div>

          {/* Actions — BELOW the message. */}
          <div
            ref={actionsRef}
            data-msg-menu="actions"
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              [align === "right" ? "right" : "left"]: align === "right" ? rightEdge : leftEdge,
              top: (layout?.bubbleTop ?? rect.top) + (layout?.bubbleMaxH ?? rect.height) + GAP,
              // No cap until measured — otherwise scrollHeight reports the cap
              // back to the effect that set it.
              maxHeight: layout?.actionsMaxH,
              overflowY: "auto",
              minWidth: 184,
            } as React.CSSProperties}
          >
            <div style={{ ...surface, ...pop("top") }}>
              {actions.map((a, i) => (
                <button
                  key={a.key}
                  onClick={(e) => { e.stopPropagation(); a.onSelect(); dismiss() }}
                  className="msg-menu-action"
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "13px 16px", background: "none", border: "none", cursor: "pointer",
                    textAlign: "left", fontSize: 14,
                    color: a.danger ? "var(--danger)" : "var(--ink)",
                    borderBottom: i < actions.length - 1 ? "1px solid var(--line-3)" : "none",
                    // Stagger: short enough to read as one gesture, long enough
                    // to cascade. Decorative only — every row is clickable at once.
                    transitionDelay: open ? `${Math.min(i * 28, 140)}ms` : "0ms",
                    opacity: open ? 1 : 0,
                    transform: open ? "translateY(0)" : "translateY(-4px)",
                    transition: `opacity ${open ? ENTER_MS : EXIT_MS}ms ${EASE}, transform ${open ? ENTER_MS : EXIT_MS}ms ${EASE}`,
                  }}
                >
                  <span style={{ display: "grid", placeItems: "center", color: a.danger ? "var(--danger)" : "var(--body)" }}>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </>

      <style>{`
        .msg-menu-emoji { transition: transform 140ms ${EASE}; }
        .msg-menu-emoji:active { transform: scale(0.9); }
        @media (hover: hover) and (pointer: fine) {
          .msg-menu-emoji:hover { transform: scale(1.18); }
          .msg-menu-action:hover { background: var(--line-3); }
        }
        .msg-menu-action:active { background: var(--line-2); }
        @media (prefers-reduced-motion: reduce) {
          /* Keep the fades — they explain what appeared. Drop the movement. */
          .msg-menu-root * { transition-duration: 120ms !important; transition-delay: 0ms !important; }
          .msg-menu-root [style*="translateY"] { transform: none !important; }
        }
      `}</style>
    </div>,
    document.body,
  )
}
