import { classifyTeam } from "./team-type"
import { BOARD_ROLE_RESOURCES } from "./event-presets-data.mjs"

// ─── Workspace presets — single source of truth ──────────────────────────────
//
// Central does NOT support custom team creation. Every workspace is created from
// one of these fixed presets, in exactly three places that must agree:
//   1. Onboarding (admin selects which workspaces the ministry needs)
//   2. Approval (approveMinistry auto-creates the selected workspaces, empty)
//   3. In-app "Add workspace" (admin adds a preset they don't have yet)
//
// This module is plain TS (no "use server", no client-only imports) so it can be
// imported by the client onboarding page, the server actions, AND plan-tab.
//
// `id` doubles as the stable key persisted in `ministries.onboarding_workspaces`.
// `emoji` is written to `teams.icon`; `iconKey` is the SVG glyph used by the
// onboarding/picker line-icon renderer. `roles` are seeded verbatim on creation —
// the role flagged `is_president` is the one an admin assigns later.

export type WorkspacePresetRole = {
  name: string
  is_president?: boolean
  permissions: string[]
  // Optional Resources-tab starter content (summary + responsibilities) seeded
  // into team_role_descriptions when the workspace is created — real role
  // guides (the board's come from CCSF's transition notes, see CCSF_CONTEXT.md).
  resources?: { summary: string; responsibilities: string[] }
}

export type WorkspacePreset = {
  id: string
  name: string
  emoji: string
  iconKey: string
  description: string
  teamType: "standard" | "finance" | "dg_praise" | "one_time"
  comingSoon: boolean
  roles: WorkspacePresetRole[]
}

export const WORKSPACE_PRESETS: WorkspacePreset[] = [
  {
    id: "dgl",
    name: "Small Group Leaders",
    emoji: "📖",
    iconKey: "book",
    description: "Discipleship and Bible study",
    teamType: "standard",
    comingSoon: false,
    roles: [
      { name: "DGL President", is_president: true, permissions: ["can_create_dgs", "can_view_dgs", "can_generate_bible_study", "can_track_attendance", "can_manage_team"] },
      { name: "Leader", permissions: ["can_create_dgs", "can_view_dgs", "can_generate_bible_study", "can_track_attendance"] },
    ],
  },
  {
    id: "board",
    name: "Student Org Board",
    emoji: "🏛️",
    iconKey: "users",
    description: "Ministry operations and administration",
    teamType: "standard",
    comingSoon: false,
    roles: [
      { name: "President", is_president: true, permissions: ["can_plan_events", "can_view_finances", "can_manage_members", "can_track_attendance", "can_manage_team"], resources: BOARD_ROLE_RESOURCES["President"] },
      { name: "Secretary", permissions: ["can_plan_events", "can_manage_members", "can_track_attendance"], resources: BOARD_ROLE_RESOURCES["Secretary"] },
      { name: "Treasurer", permissions: ["can_view_finances", "can_plan_events"], resources: BOARD_ROLE_RESOURCES["Treasurer"] },
      { name: "Event Coordinator", permissions: ["can_plan_events", "can_track_attendance"], resources: BOARD_ROLE_RESOURCES["Event Coordinator"] },
    ],
  },
  {
    id: "finance",
    name: "Finance",
    emoji: "💰",
    iconKey: "dollar",
    description: "Budget, allocation, and reimbursements",
    teamType: "finance",
    comingSoon: false,
    roles: [
      // Finance has only President + Member. President (the finance deacon) signs off;
      // Members (the treasurers + any overseeing admins) operate the workspace and
      // approve. No other roles by design.
      { name: "President", is_president: true, permissions: ["can_view_finances"] },
      { name: "Member", is_president: false, permissions: ["can_view_finances"] },
    ],
  },
  {
    id: "praise",
    name: "Praise Team",
    emoji: "🎵",
    iconKey: "music",
    description: "Worship and music ministry",
    teamType: "standard",
    comingSoon: true,
    roles: [
      { name: "President", is_president: true, permissions: ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_team", "can_manage_schedule"] },
      { name: "Worship Leader", permissions: ["can_manage_worship_set", "can_view_worship_set", "can_generate_slides", "can_manage_team"] },
      { name: "Member", permissions: ["can_view_worship_set", "can_generate_slides"] },
    ],
  },
  {
    id: "tech",
    name: "Tech Team",
    emoji: "💻",
    iconKey: "slides",
    description: "Technical support and media",
    teamType: "standard",
    comingSoon: true,
    roles: [
      { name: "President", is_president: true, permissions: ["can_view_worship_set", "can_generate_slides", "can_manage_team"] },
      { name: "Member", permissions: ["can_view_worship_set", "can_generate_slides"] },
    ],
  },
  {
    id: "slides",
    name: "Slides",
    emoji: "📽️",
    iconKey: "slides",
    description: "Sunday slides and lyric decks",
    teamType: "standard",
    comingSoon: true,
    roles: [
      { name: "President", is_president: true, permissions: ["can_generate_slides", "can_view_worship_set", "can_manage_team"] },
      { name: "Member", permissions: ["can_generate_slides", "can_view_worship_set"] },
    ],
  },
  {
    id: "dg_praise",
    name: "DG Praise Team",
    emoji: "🎵",
    iconKey: "music",
    description: "Discipleship group praise and worship",
    teamType: "dg_praise",
    comingSoon: true,
    roles: [
      { name: "President", is_president: true, permissions: ["can_manage_worship_set", "can_view_worship_set", "can_manage_team"] },
      { name: "Leader", permissions: ["can_manage_worship_set", "can_view_worship_set"] },
      { name: "Member", permissions: ["can_view_worship_set"] },
    ],
  },
  {
    id: "one_time",
    name: "One-Time Event",
    emoji: "⭐",
    iconKey: "music",
    description: "Praise team for a one-time event (SSO, Welcome Week, etc.)",
    teamType: "one_time",
    comingSoon: true,
    roles: [
      { name: "President", is_president: true, permissions: ["can_manage_worship_set", "can_view_worship_set", "can_manage_team"] },
      { name: "Leader", permissions: ["can_manage_worship_set", "can_view_worship_set"] },
      { name: "Member", permissions: ["can_view_worship_set"] },
    ],
  },
]

// The presets an admin can actually pick today. Everything else is "coming soon".
export const AVAILABLE_PRESETS = WORKSPACE_PRESETS.filter((p) => !p.comingSoon)

export function presetById(id: string): WorkspacePreset | undefined {
  return WORKSPACE_PRESETS.find((p) => p.id === id)
}

// Map an existing team back to the preset id it represents, using the same
// structural classifier the rest of the app uses (team_type first, then name).
// finance → 'finance'; dgl/studentOrg kinds → 'dgl'/'board'; praise → 'praise'.
export function presetIdForTeam(team: { team_type?: string | null; name?: string | null }): string | null {
  const kind = classifyTeam(team)
  switch (kind) {
    case "finance": return "finance"
    case "dgl": return "dgl"
    case "studentOrg": return "board"
    case "praise": return "praise"
    case "tech": return "tech"
    case "dgPraise": return "dg_praise"
    case "oneTime": return "one_time"
    default: return null
  }
}

// The design-system line-icon key for a team = its preset's `iconKey`. ALWAYS
// render team icons via `<PlanLineIcon iconKey={teamIconKey(team)} />` — NEVER the
// raw `teams.icon` value, which is legacy emoji (and some rows even store an
// iconKey string, e.g. "users"), and is inconsistent with the established
// PlanLineIcon glyph system. Falls back to "clipboard".
export function teamIconKey(team: { team_type?: string | null; name?: string | null }): string {
  const id = presetIdForTeam(team)
  return (id ? presetById(id)?.iconKey : undefined) ?? "clipboard"
}

// Which preset ids a ministry already has, given its current teams. Used by the
// "Add workspace" flow to offer only the presets the ministry is missing.
export function ownedPresetKeys(teams: Array<{ team_type?: string | null; name?: string | null }>): Set<string> {
  const owned = new Set<string>()
  for (const t of teams) {
    const id = presetIdForTeam(t)
    if (id) owned.add(id)
  }
  return owned
}
