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
import { ArrowLeft, Settings } from "lucide-react"
import {
  IconButton, MonogramChip, PocketHeroCard, PocketKicker, PocketRow, PocketRowCard,
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
export function PocketHubChrome({ title, onBack, onSettings, avatar }: {
  title: string
  onBack?: () => void
  onSettings?: () => void
  avatar?: HubAvatar
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      {onBack && (
        <button onClick={onBack} aria-label="Back" style={{ width: 34, height: 34, marginLeft: -8, flexShrink: 0, display: "grid", placeItems: "center", background: "none", border: "none", color: "var(--plum)", cursor: "pointer" }}>
          <ArrowLeft style={{ width: 20, height: 20 }} />
        </button>
      )}
      <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
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
