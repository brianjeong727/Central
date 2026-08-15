"use client"

// The gap a pull-to-refresh gesture opens above the content, with the spinner
// centred in it. Pair with usePullToRefresh: the hook owns the gesture and sizes
// this element, and this owns the pixels.
//
// This is the GAP, not a floating badge. The content translates down and this
// element's height grows to match, so the ring is revealed in the space rather
// than painted over the content — the iOS/Instagram grammar.
//
// It sits `fixed` under the safe-area inset, OUTSIDE the translated content:
// the content is the thing being pulled, so a spinner within it would travel
// with the content instead of sitting still in the opened space.
//
// Height/opacity/rotation are written imperatively by the hook (a drag emits a
// touchmove per frame; see the note in use-pull-to-refresh.ts), so this renders
// once at rest and is not re-rendered during the gesture.

const RING = "w-6 h-6 rounded-full border-2 border-[var(--plum)]/20 border-t-[var(--plum)]"

export function PullToRefreshIndicator({
  indicatorRef,
}: {
  indicatorRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={indicatorRef}
      aria-hidden
      // The spec asserts on this element's measured height + opacity — presence
      // alone means nothing now that it is always mounted (the hook needs a
      // stable node to paint, and mounting per-drag would cost a frame).
      data-pull-refresh
      className="fixed left-0 right-0 z-40 md:hidden pointer-events-none overflow-hidden grid place-items-center"
      style={{
        top: "env(safe-area-inset-top)",
        // At rest the gap is closed. The hook grows it in step with the content.
        height: 0,
        opacity: 0,
      }}
    >
      <div className={RING} />
    </div>
  )
}
