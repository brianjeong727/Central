// Single source of truth for "what kind of team is this?".
//
// Behavior used to be decided by duplicated, fragile flags scattered across
// plan-tab.tsx and home-app.tsx — a mix of team_type checks, name regexes, and
// permission probes. The permission probes were the source of bugs: e.g. a
// Finance team carries `can_view_finances`, which falsely matched the Student
// Org Board detector, and gov-view (non-member) entry has EMPTY perms so
// perm-based detection silently fell through to the calendar fallback.
//
// This classifier intentionally uses ONLY team_type and name. No permission
// checks. team_type is authoritative for the preset structural types; named
// preset teams (Praise, Tech, Student Org Board, Small Group Leaders) are
// matched by name. Anything unrecognized is "standard" (ministry calendar).
//
// Precedence mirrors the dispatch cascade that historically rendered the
// workspaces (team_type first; then name in tech → praise → studentOrg → dgl
// order) so that any name matching two patterns resolves to the same workspace
// it did before.

export type TeamKind =
  | "finance"
  | "dgPraise"
  | "oneTime"
  | "studentOrg"
  | "dgl"
  | "praise"
  | "tech"
  | "standard"

// Canonical name patterns (operate on the lowercased team name).
const STUDENT_ORG_RE = /\b(student org|board|leadership|officer)\b/
const DGL_RE = /\b(dgl|small group|discipleship|sg)\b/
const TECH_RE = /\btech\b/
const PRAISE_RE = /\b(praise|worship)\b/

export function classifyTeam(
  team: { team_type?: string | null; name?: string | null } | null | undefined,
): TeamKind {
  if (!team) return "standard"

  // Structural team_type wins outright.
  if (team.team_type === "finance") return "finance"
  if (team.team_type === "dg_praise") return "dgPraise"
  if (team.team_type === "one_time") return "oneTime"

  // Named preset teams (standard team_type). Order matches the historical
  // dispatch cascade: tech before praise, praise before studentOrg.
  const name = (team.name ?? "").toLowerCase()
  if (TECH_RE.test(name)) return "tech"
  if (PRAISE_RE.test(name)) return "praise"
  if (STUDENT_ORG_RE.test(name)) return "studentOrg"
  if (DGL_RE.test(name)) return "dgl"

  return "standard"
}
