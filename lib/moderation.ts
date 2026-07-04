// Chat moderation — pure TypeScript, imported by BOTH client (ChatScreen send
// path, settings UI) and server (the moderation server action). No side effects,
// no imports; safe to run in either environment.

export type ModBehavior = "asterisk_first" | "asterisk_all" | "block"
export type ModStrictness = "lenient" | "moderate" | "strict"
export type ModScope = "all" | "church" | "personal" | "ministry"

export interface ModerationSettings {
  enabled: boolean
  behavior: ModBehavior
  strictness: ModStrictness
  scope: ModScope
  photo_enabled: boolean
}

export const MODERATION_DEFAULTS: ModerationSettings = {
  enabled: false,
  behavior: "asterisk_first",
  strictness: "moderate",
  scope: "all",
  photo_enabled: false,
}

// Curated built-in tiers (lowercase base forms + the most common inflections).
// Deliberately NOT exhaustive — a reasonable standard set. Whole-word matching
// (see moderateText) means only these exact normalized tokens trip the filter.

// SEVERE — slurs / hate terms.
export const SEVERE: string[] = [
  "nigger", "nigga", "faggot", "fag", "dyke", "chink", "spic", "kike",
  "wetback", "gook", "coon", "retard", "tranny", "beaner",
]

// STRONG — common strong profanity.
export const STRONG: string[] = [
  "fuck", "fucking", "fucker", "fucked", "motherfucker", "shit", "shitty",
  "bullshit", "bitch", "bitches", "cunt", "cock", "dick", "dickhead",
  "pussy", "bastard", "piss", "prick", "whore", "slut",
]

// MILD — borderline / crude.
// NOTE: words with legitimate scriptural/theological meaning are deliberately
// EXCLUDED so Bible/theology chat can never be flagged in a ministry app —
// "hell", "damn"/"damned"/"damnation", and standalone "ass" (KJV "Balaam's ass").
// Vulgar compounds like "jackass"/"dumbass" are kept (whole-word match only).
export const MILD: string[] = [
  "asshole", "crap", "douche", "douchebag",
  "jackass", "dumbass", "bollocks", "bugger", "bloody",
]

export function wordsFor(strictness: ModStrictness): string[] {
  if (strictness === "lenient") return SEVERE
  if (strictness === "moderate") return [...SEVERE, ...STRONG]
  return [...SEVERE, ...STRONG, ...MILD]
}

// Leet → letter, for matching only (never mutates the surviving text).
const LEET_MAP: Record<string, string> = {
  "@": "a", "$": "s", "0": "o", "1": "i", "3": "e", "!": "i",
}

function normalizeToken(token: string): string {
  let out = ""
  for (const ch of token.toLowerCase()) out += LEET_MAP[ch] ?? ch
  return out
}

// Maximal runs of letters, digits, and the leet symbols we normalize. Because a
// token is a MAXIMAL run and we only match a normalized token against the set by
// exact equality, this can never match a substring of an innocent word:
// "class" is one token → normalizes to "class" → not in the set. Only "@ss"/"ass"
// as their OWN word tokens trip "ass".
const TOKEN_RE = /[a-zA-Z0-9@$!]+/g

export function moderateText(
  text: string,
  opts: { strictness: ModStrictness; behavior: ModBehavior },
): { cleaned: string; flaggedCount: number } {
  const wordSet = new Set(wordsFor(opts.strictness))
  let flaggedCount = 0

  const cleaned = text.replace(TOKEN_RE, (token) => {
    const norm = normalizeToken(token)
    if (!wordSet.has(norm)) return token
    flaggedCount++
    if (opts.behavior === "block") return token // leave text untouched; just count
    if (opts.behavior === "asterisk_all") return "*".repeat(token.length)
    // asterisk_first — keep original first char, star the rest
    return token[0] + "*".repeat(Math.max(0, token.length - 1))
  })

  return { cleaned, flaggedCount }
}

export function scopeApplies(
  scope: ModScope,
  ctx: { isChurch: boolean; isPersonal: boolean; isMinistryDefault: boolean },
): boolean {
  if (scope === "all") return true
  if (scope === "church") return ctx.isChurch
  if (scope === "personal") return ctx.isPersonal
  return ctx.isMinistryDefault // "ministry"
}
