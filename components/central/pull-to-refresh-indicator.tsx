"use client"

// The spinner that rides a pull-to-refresh gesture. Pair with usePullToRefresh:
// the hook owns the gesture and the async state, this owns the pixels.
//
// Positioned `fixed` under the safe-area inset rather than inside the scroller,
// because the shell's scroll region is also the thing being pulled — an indicator
// inside it would travel with the content and never sit still under the chrome.
//
// Below the commit threshold the ring is a static arc that ROTATES with travel,
// so the pull reads as winding it up; past the threshold and while refreshing it
// spins on its own. Same 2px plum-on-tint ring as <Spinner> so it belongs to the
// same family rather than being a second spinner grammar.

const RING = "w-6 h-6 rounded-full border-2 border-[var(--plum)]/20 border-t-[var(--plum)]"

export function PullToRefreshIndicator({
  pull,
  refreshing,
  armed,
}: {
  /** Travel in px from usePullToRefresh. */
  pull: number
  /** Refresh in flight — spin continuously. */
  refreshing: boolean
  /** Past the commit point. */
  armed: boolean
}) {
  const visible = pull > 0 || refreshing
  if (!visible) return null

  // Fade in over the first stretch so a tiny accidental drag shows almost nothing.
  const opacity = refreshing ? 1 : Math.min(1, pull / 40)

  return (
    <div
      aria-hidden
      // Presence IS the contract the gesture spec asserts on (it must not appear
      // mid-page); the ring is otherwise styled entirely by utility classes.
      data-pull-refresh
      className="fixed left-1/2 z-40 md:hidden pointer-events-none"
      style={{
        // Travel is the pull itself, so the ring stays glued to the finger.
        top: `calc(env(safe-area-inset-top) + ${Math.round(pull * 0.6)}px)`,
        transform: "translateX(-50%)",
        opacity,
        // No transition while dragging — direct manipulation must not lag. The
        // release settle is handled by the hook zeroing `pull`, and a transition
        // here would fight the finger on the way down.
        transition: refreshing ? "opacity 150ms linear" : "none",
      }}
    >
      <div
        className={`${RING} ${refreshing || armed ? "animate-spin" : ""}`}
        style={
          refreshing || armed
            ? undefined
            // Winds up with the drag: a full turn by the time it commits.
            : { transform: `rotate(${Math.round((pull / 64) * 360)}deg)` }
        }
      />
    </div>
  )
}
