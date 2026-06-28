import type { GovernanceSettings } from "./types"

// Governance model (see CLAUDE.md / finance-plan-team restructure):
//   - Domain write = team membership (handled elsewhere).
//   - Governance = an admin power. WHO governs = the roster (all admins, or a subset).
//   - WHAT they get per team = the matrix (teams.admin_access: none | view | write).
// This module holds the pure composition helpers used to derive those answers.

// WHO governs: by default every admin-tier user governs; if all_admins is false,
// only the explicitly listed admin ids govern.
export function isGovernanceAdmin(
  userId: string,
  isAdmin: boolean,
  gov: GovernanceSettings,
): boolean {
  return gov.all_admins ? isAdmin : gov.roster_ids.includes(userId)
}

// Effective access a user has to a given team.
//   member    → on the team (full domain access; unchanged by governance)
//   gov-write → not a member, but governs and the team grants write
//   gov-view  → not a member, but governs and the team grants view
//   none      → no access
export type TeamAccess = "member" | "gov-write" | "gov-view" | "none"

export function teamAccessLevel(opts: {
  isMember: boolean
  isGovernanceAdmin: boolean
  adminAccess: "none" | "view" | "write"
}): TeamAccess {
  if (opts.isMember) return "member"
  if (opts.isGovernanceAdmin && opts.adminAccess === "write") return "gov-write"
  if (opts.isGovernanceAdmin && opts.adminAccess === "view") return "gov-view"
  return "none"
}
