/**
 * Canonical role tiers — the single CODE encoding of permissions.md.
 *
 * `permissions.md` is the SEMANTIC source of truth for who-can-do-what across
 * every feature. This module is its one code encoding: the four permission
 * tiers from CLAUDE.md Convention #2 plus visitor parity (Convention #3).
 *
 * Change role membership HERE only — never re-inline a role array at a call
 * site. Every predicate lowercases its input and is null-safe.
 *
 * This is a plain constants module (no "use server" directive), so both client
 * files and "use server" action files may import it freely.
 */

// Admin-tier gates: settings, ministry config, giving editor, member roles, etc.
export const ADMIN_ROLES = ["admin", "deacon", "elder", "pastor"] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

// Staff roles = the staff-invite-code roles (permissions.md §Join Codes:
// "Pastors, deacons, elders"). This is admin-tier MINUS "admin" — used for
// staff-only gates (staff auto-chat, founder-role validation), NOT a general
// admin gate. For admin-tier authorization use ADMIN_ROLES / isAdminRole.
export const STAFF_ROLES = ["pastor", "deacon", "elder"] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

// Leader+admin gates: announcement create/edit, home hero curation, etc.
export const LEADER_ROLES = ["leader", "admin", "deacon", "elder", "pastor"] as const
export type LeaderRole = (typeof LEADER_ROLES)[number]

// Chat management / pins. `pastor` is INTENTIONALLY EXCLUDED here — per
// permissions.md, pastor is a spiritual-oversight role, not a chat moderator.
// Do not add "pastor" to this tier (CLAUDE.md Convention #2).
export const CHAT_MANAGE_ROLES = ["admin", "leader", "deacon", "elder"] as const
export type ChatManageRole = (typeof CHAT_MANAGE_ROLES)[number]

// Member-tier: read-only plus personal chats and RSVPs. Visitor has parity
// with member (Convention #3) — keep both together.
export const MEMBER_TIER = ["member", "visitor"] as const
export type MemberTierRole = (typeof MEMBER_TIER)[number]

function has(list: readonly string[], role?: string | null): boolean {
  return !!role && list.includes(role.toLowerCase())
}

export const isAdminRole = (role?: string | null): boolean => has(ADMIN_ROLES, role)
export const isStaffRole = (role?: string | null): boolean => has(STAFF_ROLES, role)
export const isLeaderRole = (role?: string | null): boolean => has(LEADER_ROLES, role)
export const isChatManageRole = (role?: string | null): boolean => has(CHAT_MANAGE_ROLES, role)
export const isMemberTier = (role?: string | null): boolean => has(MEMBER_TIER, role)
