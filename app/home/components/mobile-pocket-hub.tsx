"use client"

// ── Mobile workspace hub (Daybreak, ruling B-1/B-3) ─────────────────────────
// The shared phone-width landing for EVERY Plan workspace: a team-name chrome
// row (back chevron → picker, optional gear/avatar), an optional plum up-next
// hero, and grouped row cards that drill into the workspace's EXISTING mobile
// section surfaces. Row icons are PlanLineIcon stroked glyphs (ruling #7),
// never unicode; a row may instead supply a custom `leading` node (e.g. the
// Receipts hub's PocketChip team monograms). Extracted from plan-tab.tsx so
// ReceiptsWorkspace (app/home/components) can reuse it without an import cycle.

import type { ReactNode } from "react"
import { Settings } from "lucide-react"
import {
  IconButton, MonogramChip, PocketHeroCard, PocketKicker, PocketRow, PocketRowCard, BackChevron,
  POCKET_CHROME_PAD_Y, useChromeSlotRef,
} from "@/components/central"
import { PlanLineIcon } from "./shared"
import { getInitials } from "../utils"

export type HubRow = {
  iconKey?: string
  leading?: ReactNode
  title: string
  subtitle: string
  meta?: string
  onClick: () => void
}

export type HubAvatar = { userName: string; avatarUrl?: string | null; onClick: () => void }

// Single chrome row (mobile_design_system §2.1): back chevron exits the
// workspace to the picker; no separate "← All workspaces" pill, no PocketChrome
// "Workspace" row above — this IS the workspace's one header. Also reused
// standalone for drilled-in screens that carry a title + back in one row.
export function PocketHubChrome({ title, onBack, onSettings, avatar, action }: {
  title: string
  onBack?: () => void
  onSettings?: () => void
  avatar?: HubAvatar
  // Optional trailing action (a section-screen create — plum round "+" or a
  // primary pill). When present the title shrinks to 20 (§2, two-content row).
  action?: ReactNode
}) {
  // Deep children can also drop controls in here via <MobileChromeActions>, which
  // is how a control that lives inside the screen BODY (the Allocation year picker,
  // several levels down inside FinanceWorkspace) reaches the header without being
  // threaded through as a prop. See components/central/mobile-chrome-slot.tsx.
  const slotRef = useChromeSlotRef()
  return (
    // Owns its own chrome rhythm (Convention #27) rather than inheriting whatever
    // paddingTop the host wrapper happens to carry — the workspace hub used to sit
    // at 24px because StudentOrgTeamHome's content wrapper supplied it, so the title
    // jumped when you drilled into an event (12px) and back. `marginBottom` keeps
    // the existing 18px gap to the first section, minus the 10px this now owns.
    // No horizontal padding: the host wrapper supplies the gutter (Convention #26).
    <div style={{ display: "flex", alignItems: "center", gap: 10, ...POCKET_CHROME_PAD_Y, marginBottom: 8 }}>
      {onBack && (
        <BackChevron onClick={onBack} />
      )}
      <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontSize: action ? 20 : 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      {action}
      {/* Portal target — empty (zero-width) until a child renders into it. */}
      <div ref={slotRef} style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }} />
      {onSettings && (
        <IconButton dim={34} onClick={onSettings} title="Team settings"><Settings className="w-4 h-4" /></IconButton>
      )}
      {avatar && (
        <button onClick={avatar.onClick} aria-label="Your profile" style={{ flexShrink: 0, border: "none", background: "none", padding: 0, cursor: "pointer" }}>
          <MonogramChip initials={getInitials(avatar.userName)} avatarUrl={avatar.avatarUrl} style={{ width: 34, height: 34, fontFamily: "var(--sans)", fontWeight: 600, fontSize: 11 }} />
        </button>
      )}
    </div>
  )
}

export function MobilePocketHub({ teamName, onBack, onSettings, avatar, hero, groups }: {
  teamName: string
  onBack?: () => void
  onSettings?: () => void
  avatar?: HubAvatar
  hero?: { eyebrow: string; title: string; meta: string; progress?: { done: number; total: number } | null; onClick: () => void } | null
  groups: { label: string; rows: HubRow[] }[]
}) {
  return (
    <div>
      <PocketHubChrome title={teamName} onBack={onBack} onSettings={onSettings} avatar={avatar} />

      {hero && (
        <PocketHeroCard
          eyebrow={hero.eyebrow}
          title={hero.title}
          meta={hero.meta}
          progress={hero.progress}
          onClick={hero.onClick}
        />
      )}

      {groups.map((g, gi) => (
        <div key={g.label}>
          <PocketKicker label={g.label} style={{ margin: (gi === 0 && !hero) ? "6px 4px 10px" : "26px 4px 10px" }} />
          <PocketRowCard>
            {g.rows.map((r, ri) => (
              <PocketRow
                key={r.title}
                leading={r.leading ?? <PlanLineIcon iconKey={r.iconKey ?? "clipboard"} size={40} radius={14} bg="var(--line-2)" fg="var(--plum)" />}
                title={r.title}
                sub={r.subtitle}
                meta={r.meta}
                chevron
                isLast={ri === g.rows.length - 1}
                onClick={r.onClick}
              />
            ))}
          </PocketRowCard>
        </div>
      ))}
    </div>
  )
}
