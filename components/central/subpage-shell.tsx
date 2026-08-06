"use client"

// DESIGN_SYSTEM §4.18 — the canonical triggered-subpage container. A subpage
// consumes the page body+header, stays cream-on-cream, and uses the shell
// breadcrumb as its back. Never a portal/modal.
//
// VERTICAL RHYTHM (§4.18): pass `title` to get the SAME header rhythm as a
// top-level TabPageHeader — InsetHairline · var(--space-8) · 25px serif title ·
// var(--space-8) · InsetHairline — butting the breadcrumb with NO extra top gap.
// Never hand-roll a header inside the body; the gaps will not match other pages.

import { ReactNode } from "react"
import { BackChevron } from "./back-chevron"
import { InsetHairline } from "./hairline"
import { PageTitle } from "./page-title"
import { useScrollResetOn } from "./scroll-reset"
import { useEdgeSwipeBack } from "./use-edge-swipe-back"
// eslint-disable-next-line no-restricted-imports -- pre-existing LEAF debt (app/ context hook); flagged Phase 2, refactor pending
import { useSubpageCrumbs } from "@/app/home/breadcrumb-context"
// eslint-disable-next-line no-restricted-imports -- pre-existing LEAF debt (app/ type import); flagged Phase 2, refactor pending
import type { Crumb } from "@/app/home/types"

export function SubpageShell({ crumbs, title, mobileTitle, mobileMeta, mobileAction, titleScale = "compact", titleMeta, titleAction, width = "full", maxWidth = 820, children }: {
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
   * Optional action in the MOBILE chrome row's right slot (§3's "chrome row:
   * (chevron) title … 0–2 actions"). Mobile-only. Per §3 the chrome-row "+"
   * create is an explicit mobile carve-out from desktop Convention #15.
   */
  mobileAction?: ReactNode
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
  // Mobile chrome uses the override when supplied; desktop always uses `title`.
  const chromeTitle = mobileTitle ?? title
  return (
    <div ref={swipeRef} className="md:flex md:flex-col md:h-full md:overflow-hidden" style={{ background: "var(--cream)" }}>
      {(back || chromeTitle) && (
        // md:hidden must win on desktop — keep `display` in the class, NOT inline
        // (an inline `display` would override md:hidden and leak onto desktop).
        <div className="md:hidden flex items-center" style={{ gap: 8, padding: "12px 20px 10px" }}>
          {back && <BackChevron onClick={back.onClick} label={`Back to ${back.label}`} />}
          {chromeTitle ? (
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
              style={{ background: "none", border: "none", padding: 0, marginLeft: -2, color: "var(--plum)", fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
            >
              {back.label}
            </button>
          ) : null}
          {mobileAction && <span style={{ flexShrink: 0, display: "inline-flex" }}>{mobileAction}</span>}
        </div>
      )}
      {/* Canonical page header — identical rhythm to TabPageHeader, butting the
          breadcrumb (desktop-only, like every page header). Body below starts at
          paddingTop 0 so the first child (a strip's own 12px, or a body's own
          paddingTop) defines the next gap. */}
      {title && (
        <div className="hidden md:flex md:flex-col flex-shrink-0">
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
