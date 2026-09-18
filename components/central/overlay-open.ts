// ── Overlay registry ──────────────────────────────────────────────────────────
// N8 (ratified 2026-09-17): a mobile overlay or sheet hides the pill nav. The
// rule used to live in prose and in one component's hide condition (composer /
// chat only), so every CentralModal and PocketSheet floated the nav over its
// veil. Now the two overlay primitives register here and the nav reads ONE
// attribute: `html[data-overlay-open]` (see `.kb-hide` in app/globals.css).
// Ref-counted so a confirm stacked on a modal keeps the nav hidden until the
// LAST overlay unmounts.
let open = 0

export function markOverlayOpen(): () => void {
  if (typeof document === "undefined") return () => {}
  open += 1
  document.documentElement.dataset.overlayOpen = "1"
  let released = false
  return () => {
    if (released) return
    released = true
    open = Math.max(0, open - 1)
    if (open === 0) delete document.documentElement.dataset.overlayOpen
  }
}
