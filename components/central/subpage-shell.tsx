"use client"

// DESIGN_SYSTEM §4.18 — the canonical triggered-subpage container. A subpage
// consumes the page body+header, stays cream-on-cream, and uses the shell
// breadcrumb as its back. Never a portal/modal.
//
// VERTICAL RHYTHM (§4.18): pass `title` to get the SAME header rhythm as a
// top-level TabPageHeader — InsetHairline · var(--space-8) · 25px serif title ·
// var(--space-8) · InsetHairline — butting the breadcrumb with NO extra top gap.
// Never hand-roll a header inside the body; the gaps will not match other pages.

import { ReactNode, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useChromeSlotRef } from "./mobile-chrome-slot"
import { BackChevron } from "./back-chevron"
import { InsetHairline } from "./hairline"
import { PageTitle } from "./page-title"
import { POCKET_CHROME_PAD_Y, POCKET_CHROME_PAD_X, POCKET_CHROME_TITLE } from "./pocket"
import { useScrollResetOn } from "./scroll-reset"
import { useEdgeSwipeBack } from "./use-edge-swipe-back"
import { useBackIntent } from "@/lib/back-intent"
// eslint-disable-next-line no-restricted-imports -- pre-existing LEAF debt (app/ context hook); flagged Phase 2, refactor pending
import { useSubpageCrumbs } from "@/app/home/breadcrumb-context"
// eslint-disable-next-line no-restricted-imports -- pre-existing LEAF debt (app/ type import); flagged Phase 2, refactor pending
import type { Crumb } from "@/app/home/types"
import { isDesktopViewport } from "@/lib/breakpoints"

// ── Mobile chrome-row action slot ──────────────────────────────────────────────
// mobile_design_system §3 puts a phone-width screen's create (and up to one
// sibling action) in the chrome row itself — the carve-out from desktop
// Convention #15. The controls that belong there are usually rendered DEEP inside
// the subpage body (the event workspace's Roles pane is ~7 levels down) and close
// over live state, so hoisting them through a prop or an effect would either
// require threading or risk a stale closure. Instead the shell publishes a DOM
// slot and the deep child portals into it: the child keeps rendering in its own
// place in the tree with fresh closures, the pixels land in the chrome row.
// Registers into the SHARED mobile chrome registry (mobile-chrome-slot.tsx) so a
// deep child's <MobileChromeActions> lands here too — one mechanism across
// SubpageShell, PocketChrome and PocketHubChrome instead of three.

// Layout effect on the client (runs before paint, so the de-bleed lands in the
// SAME frame the shell mounts — no visible snap from 40px to 20px); plain effect
// on the server to avoid the SSR useLayoutEffect warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * PHONE-WIDTH GUTTER ENFORCEMENT.
 *
 * A SubpageShell is a FULL-BLEED subpage (mobile_design_system §3): it replaces the
 * parent screen, so its own 20px screen padding must be the ONLY horizontal inset —
 * content sits 20px from the mobile container's edge on every subpage, matching the
 * tab roots.
 *
 * That held only by CONVENTION: the host had to remember to mount the shell outside
 * its own padded wrapper (Plan does this for team settings and Receipts, with a
 * comment saying so). The Plan tab's `md:hidden px-5 pb-28` body wrapper broke it
 * for anything opened from INSIDE a team — the event workspace and its spokes
 * rendered at 40px, visibly narrower than the events list they were opened from,
 * with the chrome row doubled to match.
 *
 * So the shell now enforces it instead of trusting the mount site: it measures the
 * horizontal padding its ancestors impose and cancels exactly that much with a
 * negative margin. Mounted correctly (no padded ancestor) the sum is 0 and this is
 * a no-op; mounted inside a padded wrapper it still lands at 20px. Desktop is
 * untouched — the shell's desktop inset is `md:px-14`, and this returns 0 at ≥768px.
 */
function useDeBleed(ref: React.RefObject<HTMLDivElement | null>): number {
  const [bleed, setBleed] = useState(0)
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const compute = () => {
      // Desktop owns its own inset (md:px-14) and is never nested this way.
      if (isDesktopViewport()) { setBleed(0); return }
      let sum = 0
      let cur = el.parentElement
      while (cur && cur !== document.body) {
        const s = getComputedStyle(cur)
        // Only symmetric padding is a "screen gutter". An asymmetric ancestor is
        // doing something deliberate that this must not fight.
        const l = parseFloat(s.paddingLeft) || 0
        const r = parseFloat(s.paddingRight) || 0
        if (l > 0 && l === r) sum += l
        cur = cur.parentElement
      }
      setBleed(sum)
    }
    compute()
    window.addEventListener("resize", compute)
    return () => window.removeEventListener("resize", compute)
  }, [ref])
  return bleed
}

/** @deprecated Use `MobileChromeActions` — it works with every mobile chrome, not
 *  just SubpageShell. Kept as an alias so existing call sites keep working. */
export { MobileChromeActions as SubpageChromeActions } from "./mobile-chrome-slot"

export function SubpageShell({ crumbs, title, mobileTitle, mobileMeta, titleScale = "compact", titleMeta, titleAction, width = "full", maxWidth = 820, children }: {
  crumbs: Crumb[]
  /** Optional page title — renders the canonical TabPageHeader rhythm at the top. */
  title?: string
  /**
   * DESKTOP title tier. `compact` (default, 25px) is what every SubpageShell —
   * announcement detail, member sheet, chat settings, meeting notes, receipts,
   * plan drills — renders; do NOT change that default. `display` opts into the
   * EXISTING 44px landing tier (§1.3 R1 — only two tiers exist) and is used by the
   * event-detail workspace, whose L1 identity block is the page. Opt-in and
   * additive: the MOBILE chrome row (serif 20/600) is untouched by this.
   */
  titleScale?: "compact" | "display"
  /**
   * Optional metadata line rendered directly under the desktop title (the event
   * workspace's `EventMetaLine`). Desktop-only, like the title itself.
   */
  titleMeta?: ReactNode
  /**
   * Optional OBJECT-level action in the header's right slot — Zone B, §3.1's
   * labeled-action carve-out ("Edit event"). Never a create (Conv #15): those live
   * in the body collection's own content header. Desktop-only.
   */
  titleAction?: ReactNode
  /**
   * Optional override for the MOBILE chrome-row title only (`md:hidden`). When
   * set, the phone-width chrome shows this instead of `title` — used where the
   * desktop header must stay the parent object's name but the mobile drilled-in
   * screen wants its own title (event-plan spokes → the spoke label; team
   * settings → "Team settings"). Desktop (`title` / PageTitle) is untouched.
   */
  mobileTitle?: string
  /**
   * Optional meta line under the MOBILE chrome title (13px muted) — e.g. a
   * collection's count on a drilled-in list screen. Mobile-only; the desktop
   * header is untouched. Still ONE header row, so §1's no-two-header-screens
   * rule holds.
   */
  mobileMeta?: string
  /**
   * `full` (default) — body spans the content area at the standard `md:px-14`
   * inset. `centered` — body is a `maxWidth` column centred in the content area
   * (§7.0: cap a measure only if you then CENTER it). On `centered` the desktop
   * HEADER rides that same column: title, meta, action and both hairlines share
   * the body's left edge, so the header can never be stranded at the page inset
   * above a column that starts hundreds of pixels further in.
   */
  width?: "full" | "centered"
  maxWidth?: number
  children: ReactNode
}) {
  useSubpageCrumbs(crumbs)
  // Land at the top on mount and whenever the deepest crumb changes — covers
  // member detail, team settings, event-workspace section drills, and
  // receipts/finance detail swaps that keep the same SubpageShell mounted.
  useScrollResetOn([crumbs[crumbs.length - 1]?.label])
  // Desktop uses the shell breadcrumb as the back. Mobile has no breadcrumb,
  // so the shell renders ONE Pocket chrome row (mobile_design_system §2.1)
  // derived from the nearest parent crumb (the last crumb with an onClick):
  // 34px plum chevron + the subpage title (serif 20/600). When no title is
  // passed, the row falls back to the PocketBackRow grammar ("← Parent").
  const back = [...crumbs].reverse().find(c => c.onClick)
  // Mobile: edge-swipe from the left mirrors the chrome chevron (§0.3). Inert on
  // desktop (coarse-pointer gated inside the hook).
  const swipeRef = useEdgeSwipeBack<HTMLDivElement>(back?.onClick)
  // Android hardware/gesture back is the THIRD input for that same one-level-up
  // action (Convention #22) — same handler, so every SubpageShell spoke inherits it
  // exactly as it inherits the swipe. Inert on web and iOS.
  useBackIntent(back?.onClick)
  // Mobile chrome uses the override when supplied; desktop always uses `title`.
  //
  // Deliberately NOT derived from the terminal crumb. Tried that — it removes the
  // titleless chrome row, but the five subpages that pass no title (member sheet,
  // both receipt details, meeting-note detail, announcement detail) HEADLINE
  // THEMSELVES in the body: the announcement is an editorial article with a date
  // kicker and a large serif headline, the member sheet leads with an avatar +
  // name identity card. Adding a chrome title there renders the same words twice,
  // stacked. The "← Parent" grammar is the correct chrome for a screen whose body
  // already names it — there the chrome's only job is navigation.
  const chromeTitle = mobileTitle ?? title
  // State (not a plain ref) so the one re-render that publishes the slot happens
  // after it is in the DOM — a ref would leave the first portal render with null.
  const chromeSlotRef = useChromeSlotRef()
  // Phone-width gutter enforcement (see useDeBleed). The root carries BOTH refs:
  // the swipe hook's (it animates this element) and our own for measuring.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node
    swipeRef.current = node
  }, [swipeRef])
  const bleed = useDeBleed(rootRef)
  return (
    <div
      ref={setRoot}
      className="md:flex md:flex-col md:h-full md:overflow-hidden"
      style={{ background: "var(--cream)", marginLeft: -bleed, marginRight: -bleed }}
    >
      {(back || chromeTitle) && (
        // md:hidden must win on desktop — keep `display` in the class, NOT inline
        // (an inline `display` would override md:hidden and leak onto desktop).
        <div className="md:hidden flex items-center" style={{ gap: 8, ...POCKET_CHROME_PAD_Y, paddingLeft: POCKET_CHROME_PAD_X, paddingRight: POCKET_CHROME_PAD_X }}>
          {back && <BackChevron onClick={back.onClick} label={`Back to ${back.label}`} />}
          {chromeTitle ? (
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", ...POCKET_CHROME_TITLE }}>
                {chromeTitle}
              </span>
              {mobileMeta && (
                <span style={{ display: "block", fontSize: 13, color: "var(--muted-text)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {mobileMeta}
                </span>
              )}
            </span>
          ) : back ? (
            <button
              type="button"
              onClick={back.onClick}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", flex: 1, minWidth: 0, display: "block", ...POCKET_CHROME_TITLE }}
            >
              {back.label}
            </button>
          ) : null}
          {/* Action slot. `marginLeft: auto` (not the title's flex:1) does the
              pushing, so actions still sit hard right on the titleless fallback
              row. Empty when nothing portals in — a zero-width flex item. */}
          <div
            ref={chromeSlotRef}
            style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}
          />
        </div>
      )}
      {/* Canonical page header — identical rhythm to TabPageHeader, butting the
          breadcrumb (desktop-only, like every page header). Body below starts at
          paddingTop 0 so the first child (a strip's own 12px, or a body's own
          paddingTop) defines the next gap.

          THE HEADER RIDES THE BODY'S COLUMN. On `width="centered"` the body is a
          capped, centred column, so the header must sit in that SAME column —
          title, meta, action and both hairlines share the body's left edge. It
          did not, and the result was a title stranded at the page inset with its
          own content starting 156px (720 col) / 240px (820 col) further in, under
          a rule that spanned the whole content area: the header read as belonging
          to a different page than the card beneath it. Both centered consumers
          (open groups 720, "New workspace" 820) had it, so this is the shell's
          flaw, not a surface's. §4.11 decides the hairline width too — a rule is
          sized to what it separates, and here that is the column, not the page.
          `width="full"` is untouched: same elements, same `px-14`, same
          `InsetHairline` default `mx-14`. */}
      {title && (
        <div className="hidden md:flex md:flex-col flex-shrink-0">
          {width === "centered" ? (
            // Same wrapper the body uses (mx-auto + px-5 + maxWidth), so the two
            // can never drift apart. The hairlines go INSIDE it, which is what
            // makes them span the column rather than the content area.
            <div className="mx-auto w-full px-5" style={{ maxWidth }}>
              <InsetHairline className="" />
              <div style={{ paddingTop: "var(--space-8)", paddingBottom: "var(--space-8)" }}>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
                  <div style={{ minWidth: 0 }}>
                    <PageTitle title={title} compact={titleScale === "compact"} />
                    {titleMeta}
                  </div>
                  {titleAction && <div style={{ flexShrink: 0 }}>{titleAction}</div>}
                </div>
              </div>
              <InsetHairline className="" />
            </div>
          ) : (
            <>
              <InsetHairline />
              <div className="px-14" style={{ paddingTop: "var(--space-8)", paddingBottom: "var(--space-8)" }}>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24 }}>
                  <div style={{ minWidth: 0 }}>
                    <PageTitle title={title} compact={titleScale === "compact"} />
                    {titleMeta}
                  </div>
                  {titleAction && <div style={{ flexShrink: 0 }}>{titleAction}</div>}
                </div>
              </div>
              <InsetHairline />
            </>
          )}
        </div>
      )}
      {/* Mobile bottom pad clears the floating pill nav (§2.1: ~110px + safe
          area); desktop keeps the original 56px. Mobile top gap is tighter (16px)
          under the pocket chrome row. */}
      <div
        className={`md:flex-1 md:overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+110px)] md:pb-14 ${title ? "pt-0" : "pt-4 md:pt-7"}`}
      >
          {width === "centered"
            ? <div className="mx-auto w-full px-5" style={{ maxWidth }}>{children}</div>
            : <div className="w-full px-5 md:px-14">{children}</div>}
      </div>
    </div>
  )
}
