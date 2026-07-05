// Super-account constants — shared between the server actions (app/actions/super.ts)
// and the client switcher chip (components/central/super-switcher.tsx).
// Kept out of the "use server" file because those may only export async functions.

// The one super account (brianjeong727) that can "become" any ministry role inside
// the Central sandbox to test permissions. Everything is hard-gated on this exact
// UUID — server-side identity is the only authority, never the role.
export const SUPER_UUID = "54080bf6-22b3-46fd-b6ce-51736f42a59d"
export const CENTRAL_MINISTRY_ID = "20f8790e-0cb0-411b-8374-41621c6bd78a"
export const HOME_ROLE = "pastor"
export const MINISTRY_ROLES = ["visitor", "member", "leader", "admin", "deacon", "elder", "pastor"] as const

export type MinistryRole = (typeof MINISTRY_ROLES)[number]

// Display-label alias for the super account. Its real profiles.role stays "pastor"
// (all gates/access unchanged); this only aliases the VISIBLE label. Only the super
// account in its home role ("pastor") shows "Super"; the super acting-as any other
// tier shows that tier's name; everyone else shows their role, capitalized.
export function roleLabel(role: string | null | undefined, userId?: string | null): string {
  const r = (role ?? "").toString().trim()
  if (!r) return ""
  if (userId === SUPER_UUID && r.toLowerCase() === HOME_ROLE) return "Super"
  return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase()
}
