// The ONE encoding of "who does this announcement reach".
//
// Same reasoning as lib/roles.ts and lib/tz.ts: this rule was duplicated THREE
// times (announcements-tab's feed filter, home-tab's feed filter, and the push
// dispatcher's resolveAnnouncement), and the acknowledgment denominator would
// have been a fourth. "142 of 180" is worthless if the 180 is computed
// differently from the set that was actually notified.
//
// The rule: `null` / `"all"` / `"group"` → the whole ministry; a 4-digit string
// → only that graduation_year. The AUTHOR is excluded from the recipient set
// (they just published it), and `created_by` is nullable — an author who deletes
// their account is reattributed to NULL, which must exclude nobody.
//
// Dependency-free on purpose: consumed by client components (tabs), a server
// route (push dispatch) and server actions. No supabase import, no React.

/** A `graduation_year`-shaped audience is exactly four digits. */
const GRAD_YEAR_AUDIENCE = /^\d{4}$/

export type AudienceScope =
  | { kind: "ministry" }
  | { kind: "grad_year"; gradYear: number }

/** Structured "who does this reach", derived from the stored `audience` value. */
export function audienceScope(audience: string | null | undefined): AudienceScope {
  if (audience && GRAD_YEAR_AUDIENCE.test(audience)) {
    return { kind: "grad_year", gradYear: parseInt(audience, 10) }
  }
  return { kind: "ministry" }
}

/**
 * The PostgREST `.or()` filter a MEMBER's announcement feed needs: everything
 * addressed to the whole church, plus their own graduating class.
 *
 * Leaders are not filtered at all (they see every audience) — that gate lives at
 * the call site, because it is a role decision, not an audience one.
 */
export function audienceOrFilter(gradYear: number | null | undefined): string {
  return gradYear
    ? `audience.is.null,audience.eq.all,audience.eq.${gradYear},audience.eq.group`
    : `audience.is.null,audience.eq.all,audience.eq.group`
}

/** Does this audience value reach a member graduating in `gradYear`? */
export function audienceIncludesGradYear(
  audience: string | null | undefined,
  gradYear: number | null | undefined,
): boolean {
  const scope = audienceScope(audience)
  if (scope.kind === "ministry") return true
  return gradYear != null && scope.gradYear === gradYear
}

/**
 * Is this person in the announcement's recipient set?
 *
 * The one place the author exclusion lives. `createdBy` NULL (author deleted,
 * reattributed to the ministry) excludes nobody; a tombstoned profile
 * (`deleted_at` set) is nobody — it must never be counted in a denominator nor
 * listed in a roster nor pushed to.
 */
export function isAnnouncementRecipient(
  person: { id: string; graduation_year?: number | null; deleted_at?: string | null },
  ann: { audience: string | null | undefined; created_by?: string | null },
): boolean {
  if (person.deleted_at) return false
  if (ann.created_by && person.id === ann.created_by) return false
  return audienceIncludesGradYear(ann.audience, person.graduation_year)
}
