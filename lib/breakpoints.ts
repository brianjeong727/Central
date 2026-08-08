// ── The ONE definition of "desktop" ──────────────────────────────────────────
//
// This used to be a pure width test (`min-width: 768px`), duplicated as Tailwind's
// `md:` variant plus six hand-written matchMedia strings. A phone in landscape is
// 874–956px wide, so rotating the iOS app tripped every one of them and rendered
// the full desktop shell — rail, context panel, breadcrumb — into a 402px-tall
// phone screen.
//
// Width alone cannot tell a phone from a laptop. The rule is now:
//
//     desktop  =  wide enough  AND  (has a real pointer  OR  genuinely large)
//
//   • `hover: hover` is the mouse/trackpad signal. Laptops (including touchscreen
//     ones, whose PRIMARY pointer is still the trackpad) match; phones and tablets
//     do not.
//   • The 1024px arm keeps tablets on the desktop layout, which is the behaviour
//     they have today. No iPhone reaches it — the widest (Pro Max) is 956px
//     landscape — so a phone can never fall through to desktop, at any rotation.
//
// Tailwind's `md:` / `max-md:` variants are overridden to these exact queries in
// app/globals.css, so CSS and JS can never disagree. Change them together or not
// at all: a mismatch means a component whose layout says mobile and whose logic
// says desktop.
//
// This module has NO imports on purpose — `components/central` is a LEAF and must
// be able to consume it (same rule as lib/tz.ts).

/** True when the desktop layout should render. Mirrors the `md:` variant. */
export const DESKTOP_QUERY =
  "(min-width: 768px) and ((hover: hover) or (min-width: 1024px))"

/** The exact complement — mirrors the `max-md:` variant. */
export const MOBILE_QUERY = `not all and ${DESKTOP_QUERY}`

/** SSR-safe read. Returns false on the server (matching useIsMobile's snapshot). */
export function isDesktopViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia(DESKTOP_QUERY).matches
}

/** SSR-safe read of the mobile side. Not `!isDesktopViewport()` on the server —
 *  both are false there, which is what keeps hydration stable. */
export function isMobileViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia(MOBILE_QUERY).matches
}
