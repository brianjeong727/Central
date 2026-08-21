// ── Jumbo emoji ──────────────────────────────────────────────────────────────
//
// A message that is NOTHING but one or two emoji renders large and bare — no
// bubble — the way iMessage does it. Three or more, or a single character of text
// alongside, and it is an ordinary message again.
//
// The whole difficulty is counting. An emoji is not a character: 👨‍👩‍👧‍👦 is
// seven code points joined by zero-width joiners, 👍🏽 is a base plus a skin-tone
// modifier, 🇰🇷 is two regional indicators, 1️⃣ is a digit plus a variation
// selector plus a combining keycap, and ❤️ is a heart plus a variation selector.
// `str.length` counts UTF-16 units, `[...str]` counts code points, and BOTH
// overcount every one of those — a family would read as seven emoji and never
// qualify, while a keycap would read as two. Grapheme segmentation is the only
// thing that counts what a person sees, so `Intl.Segmenter` does the splitting.
//
// Dependency-free and framework-free: the renderer, any test, and any future
// composer preview all need the same answer.

/** Combining Enclosing Keycap — the tail of `1️⃣`, `#️⃣`. */
const KEYCAP = "⃣"
/** Regional indicators A–Z; a flag is exactly two of them. */
const REGIONAL = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u

/**
 * Is this ONE grapheme cluster an emoji (as opposed to a letter, digit, or
 * punctuation)?
 *
 * The letter/digit rejection has to come AFTER the keycap and flag checks:
 * `1️⃣` contains the digit 1 and 🇰🇷 is built from letter-like code points, so a
 * naive "contains a digit ⇒ not emoji" test would throw both away.
 */
function isEmojiCluster(cluster: string): boolean {
  if (cluster.length === 0) return false
  if (cluster.includes(KEYCAP)) return true
  if (REGIONAL.test(cluster)) return true
  // Text that merely SITS BESIDE a pictograph doesn't make the cluster an emoji.
  if (/[\p{L}\p{N}]/u.test(cluster)) return false
  return /\p{Extended_Pictographic}/u.test(cluster)
}

function graphemes(text: string): string[] {
  // Intl.Segmenter is the only correct splitter; where it is missing (older
  // Safari) fall back to code points, which overcounts multi-part emoji. That
  // errs toward NOT jumbo-ing — a normal bubble, never a mangled one.
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter
  if (!Seg) return [...text]
  return [...new Seg(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment)
}

/** Above this many emoji it is an ordinary message again (Brian, 2026-08-19). */
export const JUMBO_MAX = 2

/**
 * How many emoji to render large, or null for an ordinary bubble.
 *
 * null for: any text alongside, three or more emoji, or nothing at all.
 * Whitespace BETWEEN emoji is ignored, so "👍 🎉" is two, not three-with-text —
 * people space them out and iMessage still jumbos that.
 */
export function jumboEmojiCount(content: string | null | undefined): number | null {
  if (!content) return null
  const trimmed = content.trim()
  if (!trimmed) return null

  // Cheap reject before segmenting: the overwhelmingly common case is ordinary
  // text, and this skips building a segmenter for every message in the thread.
  // KEYCAP has to be named here — `1️⃣` is a digit, a variation selector and a
  // combining keycap, NONE of which is Extended_Pictographic, so a pictograph-only
  // pre-check silently drops it before the real test ever runs.
  if (!/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u.test(trimmed) && !trimmed.includes(KEYCAP)) return null

  let count = 0
  for (const cluster of graphemes(trimmed)) {
    if (/^\s+$/u.test(cluster)) continue
    if (!isEmojiCluster(cluster)) return null
    count++
    if (count > JUMBO_MAX) return null
  }
  return count > 0 ? count : null
}

/** Font size for a jumbo message. One emoji is the hero; two step down. */
export function jumboFontSize(count: number): number {
  return count === 1 ? 44 : 34
}
