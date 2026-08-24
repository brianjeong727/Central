// ─── "You may already have an account here" — the check at the join door ─────
//
// NOT a "use server" file, and for the same reason as lib/ministry-membership.ts:
// an exported async function in a "use server" module is a callable endpoint, and
// this one takes a userId and returns a (masked) identity. It is imported BY the
// join actions and only ever runs on a caller who has already been authenticated
// and has already cleared that path's own gates.
//
// WHY IT EXISTS: people sign in with a personal address one term and a school
// address the next, and end up as two members of the same ministry. Both halves
// then look real — messages under one, RSVPs under the other — and the mess is
// unfixable from inside the product.
//
// WHAT IT DELIBERATELY DOES NOT DO: it never merges, and it never replaces. We
// cannot prove the person clicking is the person who owns the existing account —
// two real David Kims in one college ministry is not a hypothetical — and
// "replace" would mean silently moving someone else's messages, team roles and
// giving history with no undo. So this is an INTERSTITIAL, not a wall: it shows
// what we found, tells them the likely fix (sign in as that account), and lets
// them say "that isn't me" and carry on.

import type { SupabaseClient } from "@supabase/supabase-js"

/** Sentinel returned by the join actions when a same-name account already exists. */
export const DUPLICATE_ACCOUNT = "DUPLICATE_ACCOUNT"

export interface DuplicateCandidate {
  name: string
  /** Masked — never the real address. See maskEmail. */
  maskedEmail: string
  avatarUrl: string | null
  graduationYear: number | null
  /** "active" = still a member of this ministry. "past" = left or was removed. */
  status: "active" | "past"
}

/**
 * Fold a display name to the form two spellings of the same person share.
 *
 * Lowercase, strip accents, drop everything that isn't a letter/digit/space,
 * collapse runs of whitespace. Deliberately NOT fuzzy — no nickname table, no
 * edit distance, no first-name-plus-initial. A false positive here interrupts a
 * real person's join with an accusation that they already exist, which is worse
 * than letting a genuine duplicate through to be cleaned up by hand.
 *
 * The folding has to match the alphabet of what is ALREADY STORED, not an
 * idealised one: names in the table arrive from Google profiles and from typed
 * signup forms, so they carry stray double spaces, trailing spaces and accents.
 */
export function normalizeName(name: string | null | undefined): string {
  if (!name) return ""
  return name
    .normalize("NFKD")
    // Combining marks, so "José" and "Jose" fold together. Written as escapes:
    // a literal combining-mark range in the source is invisible and does not
    // survive a copy/paste or a reformat.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * `bjj46@pitt.edu` → `b•••@pitt.edu`.
 *
 * The DOMAIN is the part that makes someone go "oh — my school address", and it
 * is the part that is safe to show: it identifies an institution, not a person.
 * The local part is the identifying half, so only its first character survives.
 * Never return the raw address: the viewer here is someone who is NOT yet in this
 * ministry, and a full address would make this a member-enumeration endpoint.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return ""
  const at = email.lastIndexOf("@")
  if (at <= 0) return "•••"
  const local = email.slice(0, at)
  const domain = email.slice(at)
  return `${local[0]}•••${domain}`
}

/**
 * Is there already an account with this person's name in this ministry?
 *
 * Matches on the CALLER'S OWN name against current and past members of the target
 * ministry. That framing is what keeps it from being a probe: a person can only
 * ever ask about the one name their own profile carries, so nobody can walk the
 * roster by guessing names.
 *
 * Tombstones are skipped — a deleted account is not a duplicate, there is nothing
 * left to sign back into.
 *
 * `admin` is a service-role client: this has to see profiles in a ministry the
 * caller is not yet a member of, which RLS correctly forbids. That is exactly why
 * the return value is masked rather than a row.
 */
export async function findDuplicateInMinistry(
  admin: SupabaseClient,
  userId: string,
  ministryId: string,
): Promise<DuplicateCandidate | null> {
  const { data: me } = await admin
    .from("profiles").select("name").eq("id", userId).maybeSingle()
  const mine = normalizeName(me?.name)
  // No name yet (a profile mid-onboarding) means nothing to match on. Never treat
  // an empty fold as matching every other empty one.
  if (!mine) return null

  // Current members of the target ministry…
  const { data: actives } = await admin
    .from("profiles")
    .select("id, name, email, avatar_url, graduation_year")
    .eq("ministry_id", ministryId)
    .is("deleted_at", null)

  const hit = (actives ?? []).find(
    (p: { id: string; name: string | null }) => p.id !== userId && normalizeName(p.name) === mine,
  ) as { name: string | null; email: string | null; avatar_url: string | null; graduation_year: number | null } | undefined

  if (hit) {
    return {
      name: hit.name ?? "",
      maskedEmail: maskEmail(hit.email),
      avatarUrl: hit.avatar_url ?? null,
      graduationYear: hit.graduation_year ?? null,
      status: "active",
    }
  }

  // …then people who were here and left. Surfacing these is the more USEFUL half:
  // a returning student who signs up fresh loses their whole history, and this is
  // the one moment we can tell them the account they already have is the one to
  // come back on.
  const { data: departures } = await admin
    .from("ministry_departures").select("user_id").eq("ministry_id", ministryId)
  const pastIds = (departures ?? []).map((d: { user_id: string }) => d.user_id).filter((id) => id !== userId)
  if (pastIds.length === 0) return null

  const { data: pasts } = await admin
    .from("profiles")
    .select("id, name, email, avatar_url, graduation_year")
    .in("id", pastIds)
    .is("deleted_at", null)

  const pastHit = (pasts ?? []).find(
    (p: { name: string | null }) => normalizeName(p.name) === mine,
  ) as { name: string | null; email: string | null; avatar_url: string | null; graduation_year: number | null } | undefined

  if (!pastHit) return null
  return {
    name: pastHit.name ?? "",
    maskedEmail: maskEmail(pastHit.email),
    avatarUrl: pastHit.avatar_url ?? null,
    graduationYear: pastHit.graduation_year ?? null,
    status: "past",
  }
}
