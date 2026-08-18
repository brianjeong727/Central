// ── Cohort: which class chat a person belongs to, and what to call it ─────────
//
// A member belongs to exactly one COHORT: a graduating class ("Class of 2029"),
// or Young Adults for anyone past school or who never had a graduation year to
// give. This module is the ONE place that decides which, names the chat, and
// labels it in the UI.
//
// It exists because the split had already gone wrong once. `grade` could be set
// to "young_adult" by the graduation flow, which then tried to move the person
// out of a chat called "Senior Chat" and into one called "Young Adult Chat" —
// neither of which anything ever creates (class chats are "Class of {year}").
// Every graduating senior therefore stayed in their old class chat forever, and
// nothing failed loudly. One name, derived in one function, is what prevents a
// second spelling of the same idea.
//
// Dependency-free and framework-free so the signup form, the server actions, the
// directory and the leaf components can all consume the same answer.

/** `profiles.grade` value marking someone as past (or outside) a graduating class. */
export const YOUNG_ADULT = "young_adult"

/** The church chat every young adult belongs to. Ratified by Brian 2026-08-19. */
export const YOUNG_ADULTS_CHAT = "Young Adults"

/** Prefix of a graduating-class chat. `Class of 2029`. */
export const classChatName = (graduationYear: number) => `Class of ${graduationYear}`

export function isYoungAdult(grade: string | null | undefined): boolean {
  return grade === YOUNG_ADULT
}

/**
 * The church chat this person's cohort maps to, or null when they have given us
 * neither a graduation year nor young-adult status (we do not guess).
 *
 * Young adult wins over a graduation year if both are somehow present: `grade`
 * is the explicit, later statement — it is what the graduation flow sets, and
 * what someone picks by hand in their profile.
 */
export function cohortChatName(
  grade: string | null | undefined,
  graduationYear: number | null | undefined,
): string | null {
  if (isYoungAdult(grade)) return YOUNG_ADULTS_CHAT
  if (graduationYear) return classChatName(graduationYear)
  return null
}

/**
 * How the cohort reads in the UI — the directory row, the profile card, the
 * member sheet. Null when unknown, so callers keep omitting the line entirely
 * rather than rendering "Class of null".
 */
export function cohortLabel(
  grade: string | null | undefined,
  graduationYear: number | null | undefined,
): string | null {
  if (isYoungAdult(grade)) return "Young Adult"
  if (graduationYear) return `Class of ${graduationYear}`
  return null
}

/** The compact form used in dense rows — `'29` for a class, `YA` for a young adult. */
export function cohortShortLabel(
  grade: string | null | undefined,
  graduationYear: number | null | undefined,
): string {
  if (isYoungAdult(grade)) return "YA"
  if (graduationYear) return `'${String(graduationYear).slice(2)}`
  return ""
}
