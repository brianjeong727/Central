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
import { ArrowLeft } from "lucide-react"
import { InsetHairline } from "./hairline"
import { PageTitle } from "./page-title"
import { useScrollResetOn } from "./scroll-reset"
// eslint-disable-next-line no-restricted-imports -- pre-existing LEAF debt (app/ context hook); flagged Phase 2, refactor pending
import { useSubpageCrumbs } from "@/app/home/breadcrumb-context"
// eslint-disable-next-line no-restricted-imports -- pre-existing LEAF debt (app/ type import); flagged Phase 2, refactor pending
import type { Crumb } from "@/app/home/types"

export function SubpageShell({ crumbs, title, width = "full", maxWidth = 820, children }: {
  crumbs: Crumb[]
  /** Optional page title — renders the canonical TabPageHeader rhythm at the top. */
  title?: string
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
  return (
    <div className="md:flex md:flex-col md:h-full md:overflow-hidden" style={{ background: "var(--cream)" }}>
      {(back || title) && (
        // md:hidden must win on desktop — keep `display` in the class, NOT inline
        // (an inline `display` would override md:hidden and leak onto desktop).
        <div className="md:hidden flex items-center" style={{ gap: 8, padding: "12px 20px 10px" }}>
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              aria-label={`Back to ${back.label}`}
              style={{ width: 34, height: 34, marginLeft: -8, flexShrink: 0, display: "grid", placeItems: "center", background: "none", border: "none", color: "var(--plum)", cursor: "pointer" }}
            >
              <ArrowLeft style={{ width: 20, height: 20 }} />
            </button>
          )}
          {title ? (
            <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {title}
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
            <PageTitle title={title} compact />
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
