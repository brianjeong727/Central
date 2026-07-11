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
  // Desktop uses the shell breadcrumb as the back. Mobile has no breadcrumb,
  // so the shell renders a back row derived from the nearest parent crumb
  // (the last crumb that carries an onClick). One affordance, defined once.
  const back = [...crumbs].reverse().find(c => c.onClick)
  return (
    <div className="md:flex md:flex-col md:h-full md:overflow-hidden" style={{ background: "var(--cream)" }}>
      {back && (
        <button
          type="button"
          onClick={back.onClick}
          // md:hidden must win on desktop — keep `display` in the class, NOT inline
          // (an inline `display` would override md:hidden and leak onto desktop).
          className="md:hidden inline-flex items-center"
          style={{ alignSelf: "flex-start", gap: 6, height: 36, padding: "0 14px", margin: "12px 0 4px 18px", background: "transparent", border: "1px solid var(--line)", borderRadius: "var(--r-chip)", color: "var(--muted-text)", fontSize: 13, cursor: "pointer" }}
        >
          <ArrowLeft style={{ width: 13, height: 13 }} /> {back.label}
        </button>
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
      <div className="md:flex-1 md:overflow-y-auto" style={{ paddingTop: title ? 0 : 28, paddingBottom: 56 }}>
        {width === "centered"
          ? <div className="mx-auto w-full px-5" style={{ maxWidth }}>{children}</div>
          : <div className="w-full px-5 md:px-14">{children}</div>}
      </div>
    </div>
  )
}
