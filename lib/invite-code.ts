// ─── Invite code format — the SINGLE source of truth ─────────────────────────
//
// Ministry join codes (`ministries.invite_code` and `ministries.staff_invite_code`)
// are 10 characters of Crockford Base32, drawn from a CSPRNG.
//
// WHY THIS MODULE EXISTS: the member code is now semi-public by design — it rides in
// a scannable link (`/j/<CODE>`), on a poster, in a group chat, in a screenshot. That
// makes `/j/` an unauthenticated valid/invalid oracle over the whole keyspace, so the
// keyspace has to be big enough that the oracle is worthless. At the old 6 chars of
// `Math.random().toString(36)` (~2.2e9) one live code cost roughly three hours of
// distributed requests. At 10 Crockford chars (32^10 = 1.13e15) it costs ~178 years
// at the same rate, and stays worthless three orders of magnitude past Central's
// current size. That is why there is no rate limiter: a throttle guarding a 50-bit
// secret is ceremony, and its worst false positive — a mistyped poster producing 200
// failures from one campus NAT — would lock out an entire room at exactly the moment
// this feature is meant to feel effortless.
//
// WHY CROCKFORD BASE32 rather than an ad-hoc "drop the confusing letters" set: it
// excludes I, L, O and U from the ALPHABET *and* defines a correct decode for them on
// INPUT. A student who hears "oh" and types `O`, or reads a poster's `I` as a one,
// still joins — `normalizeCode` folds them rather than rejecting them.
//
// WHY THREE CONSUMERS IMPORT IT: `/j/[code]`, `app/auth/callback/route.ts` and
// `joinMinistryByCode` each validate a code. Three validators agreeing by import is
// the point; three agreeing by coincidence is how the next length change breaks one
// surface silently. `INVITE_CODE_LEN` is ALSO the `maxLength` of the two typed-code
// inputs in `app/ministries/page.tsx` — a longer code with a stale `maxLength` would
// truncate on entry and make every manual join fail with "No ministry found".
//
// Dependency-free on purpose: `proxy.ts` (middleware), server actions, route handlers
// and client components all import it.

/** Length of a ministry invite code. Also the `maxLength` of every typed-code input. */
export const INVITE_CODE_LEN = 10

/** The invite route prefix. One definition, so no caller hand-slices `"/j/".length`. */
export const INVITE_PATH_PREFIX = "/j/"

/** Crockford Base32 alphabet — no I, L, O, or U. */
export const INVITE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/** Matches a code that has already been through `normalizeCode`. */
export const INVITE_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/

/**
 * Fold a human-entered or URL-borne code into canonical form: uppercase, then
 * Crockford's input rules — I and L read as 1, O reads as 0. Does NOT validate;
 * pair with `isValidInviteCode`.
 */
export function normalizeCode(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
}

/** True when `raw` normalizes to a well-formed code. */
export function isValidInviteCode(raw: string | null | undefined): boolean {
  return INVITE_CODE_RE.test(normalizeCode(raw))
}

// ─── CUSTOM (vanity) codes ───────────────────────────────────────────────────
//
// A ministry may replace its generated code with a memorable one ("CENTRALPGH").
// That code is NOT a secret and is not treated as one: a ministry running a custom
// code switches from instant join to REQUEST-to-join, because the entropy argument
// at the top of this file — the thing that makes the missing rate limiter defensible
// — does not survive a word anyone can guess. The flag lives on the ministry
// (`invite_code_is_custom`); this module only owns the FORMAT.
//
// CROCKFORD FOLDING MUST NOT BE APPLIED TO THESE. `normalizeCode` reads I and L as 1
// and O as 0, which is exactly right for a random code read off a poster and exactly
// wrong for a word: it turns GLORIA into G10R1A. Custom codes normalize by case only.
//
// The two formats OVERLAP — "CENTRAL123" is a well-formed custom code AND folds to a
// well-formed 10-char random one — so nothing may assume a string is one or the
// other. `lookupVariants` below is the single answer to that: try every form the
// input could have been stored as, and let the database decide which exists.

// SIX, not four. The code stops being a secret when it becomes custom, but it does
// not stop being an ORACLE: `/j/<CODE>` names the ministry to a signed-out visitor,
// and a 4-char [A-Z0-9] space is 1.6M — walkable. Six is 2.2e9, which puts bulk
// enumeration of every church's name out of reach while still fitting GRACE1,
// PITTCCM and CENTRAL. The request path adds the other half (ban checks and a
// per-ministry request cap) since there is no rate limiter to lean on.
export const CUSTOM_CODE_MIN_LEN = 6
export const CUSTOM_CODE_MAX_LEN = 20

/** A–Z, 0–9 and internal hyphens; never leading, trailing or doubled. */
export const CUSTOM_CODE_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/

/**
 * Codes a ministry may not claim, because they read as Central itself or as a
 * privileged surface rather than as one church among many. Compared AFTER
 * normalization. Kept here rather than in the action so the rule travels with the
 * format — a second validator that forgets this list is how "admin" gets taken.
 */
export const RESERVED_CODES: readonly string[] = [
  "ADMIN", "ADMINISTRATOR", "CENTRAL", "JOINCENTRAL", "STAFF", "SUPPORT", "HELP",
  "SETTINGS", "LOGIN", "SIGNUP", "SIGNIN", "ONBOARDING", "MINISTRIES", "HOME",
  "API", "AUTH", "SUPER", "OWNER", "ROOT", "TEST", "NULL", "UNDEFINED",
]

/** Case-fold and trim ONLY — never Crockford-fold. See the note above. */
export function normalizeCustomCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase()
}

/**
 * Why a custom code is unacceptable, or null when it is fine. Returns the REASON so
 * one wording serves the form, the action and the tests.
 *
 * Deliberately does NOT check uniqueness or profanity: uniqueness needs the database
 * and profanity needs the ministry's moderation list, so both belong to the action.
 * This is the part that can be decided from the string alone.
 */
export function customCodeProblem(raw: string | null | undefined): string | null {
  const code = normalizeCustomCode(raw)
  if (!code) return "Enter a code."
  if (code.length < CUSTOM_CODE_MIN_LEN) return `Codes are at least ${CUSTOM_CODE_MIN_LEN} characters.`
  if (code.length > CUSTOM_CODE_MAX_LEN) return `Codes are at most ${CUSTOM_CODE_MAX_LEN} characters.`
  if (!CUSTOM_CODE_RE.test(code)) return "Use letters, numbers and hyphens only."
  if (RESERVED_CODES.includes(code)) return "That code is reserved."
  return null
}

/** True when `raw` is a well-formed custom code. */
export function isValidCustomCode(raw: string | null | undefined): boolean {
  return customCodeProblem(raw) === null
}

/**
 * True when `raw` is a shape `/j/` will look up AT ALL — generated OR custom.
 *
 * Every display gate that used to ask `isValidInviteCode` means THIS: "is this a
 * code we can build a working link for". Asking the generated-only predicate now
 * hides the share button for exactly the ministries that chose a custom code.
 */
export function isLinkableCode(raw: string | null | undefined): boolean {
  return isValidInviteCode(raw) || isValidCustomCode(raw)
}

/** The longest string any code input should accept. Custom codes are the longer of
 *  the two formats, so this — never INVITE_CODE_LEN — is the `maxLength` of a field
 *  a user types a code into. A stale maxLength silently TRUNCATES on entry and every
 *  join then fails with "No ministry found"; the module has been bitten by exactly
 *  that before (see the note on INVITE_CODE_LEN above). */
export const CODE_INPUT_MAX_LEN = CUSTOM_CODE_MAX_LEN

/**
 * Every stored form the input could match, most-specific first, de-duplicated.
 *
 * There are three ways a typed code can relate to what is stored: Crockford-folded
 * (a current random code), plain-uppercase (a custom code — and also the pre-rotation
 * legacy base36 codes, whose I/L/O do not survive folding), or both when the formats
 * overlap. Callers try these in order against the database instead of deciding the
 * format themselves, which is what stops a fourth caller inventing a fourth rule.
 */
export function lookupVariants(raw: string | null | undefined): string[] {
  const folded = normalizeCode(raw)
  const plain = normalizeCustomCode(raw)
  const out: string[] = []
  for (const v of [folded, plain]) if (v && !out.includes(v)) out.push(v)
  return out
}

/**
 * The post-auth return path for an invite.
 *
 * Auth's only job in the invite flow is to bring the user BACK to `/j/<CODE>`, where
 * the join actually happens — that is what keeps the join logic in one place instead
 * of threading a code through five different auth methods (email OTP, web Google, web
 * Apple, native Google, native Apple), two of which never touch `/auth/callback` at
 * all. Every post-auth landing decision calls this and falls back to `/ministries`.
 *
 * Returns null for anything malformed, so a caller-supplied param can never be
 * concatenated into a redirect unvalidated (no `//evil.com`, no `../`, no CRLF).
 */
export function inviteReturnPath(raw: string | null | undefined): string | null {
  // A CUSTOM code is checked first and carried UNFOLDED. Folding is lossy, so a
  // round trip through the folded form would deliver GLORIA back as G10R1A and the
  // invite would die on the way home from Google — the same shape of bug as the
  // signup handoff that dropped `intent` and `invite` (2026-08-19). The lookup tries
  // both forms anyway (`lookupVariants`), so preserving the input costs nothing and
  // losing a character costs the whole invite.
  const plain = normalizeCustomCode(raw)
  if (isValidCustomCode(plain)) return `${INVITE_PATH_PREFIX}${plain}`
  const code = normalizeCode(raw)
  return INVITE_CODE_RE.test(code) ? `${INVITE_PATH_PREFIX}${code}` : null
}

/** The code back out of a path produced by `inviteReturnPath`. */
export function codeFromReturnPath(path: string): string {
  return path.startsWith(INVITE_PATH_PREFIX) ? path.slice(INVITE_PATH_PREFIX.length) : path
}

/**
 * A ministry's public invite link.
 *
 * Lives here rather than in the share modal so the route shape has exactly one
 * definition — the thing that builds the link and the thing that parses it can never
 * disagree about the prefix.
 */
export function inviteLinkFor(code: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "https://www.joincentral.app")
  return `${base}${INVITE_PATH_PREFIX}${code}`
}

/**
 * LEGACY BRIDGE — delete once every stored code has been rotated to the 10-char format.
 *
 * Codes minted before the CSPRNG change came from `Math.random().toString(36)`, whose
 * base36 alphabet uses ALL 26 letters — including I, L and O, which `normalizeCode`
 * folds to 1, 1 and 0. So a stored legacy code like `MERCYO2`, typed correctly by the
 * user, normalizes to `MERCY02` and no longer matches its own row: ~40.7% of six-char
 * base36 codes contain at least one of those letters (1 - (33/36)^6). This returns the
 * plain-uppercase form to retry with, or null when folding changed nothing.
 */
export function legacyLookupVariant(raw: string | null | undefined): string | null {
  const plain = (raw ?? "").trim().toUpperCase()
  return plain && plain !== normalizeCode(raw) ? plain : null
}

/**
 * A fresh code from a cryptographic RNG, rejection-sampled so the alphabet stays
 * uniform (a plain `% 32` over a byte would bias the first 8 symbols).
 *
 * Uses Web Crypto, which is present in Node 18+, the edge runtime and the browser —
 * so this one implementation covers every caller.
 */
export function generateInviteCode(length: number = INVITE_CODE_LEN): string {
  const n = INVITE_CODE_ALPHABET.length // 32 — a byte holds exactly 8 unbiased draws
  const max = Math.floor(256 / n) * n   // 256; no byte is ever discarded at n=32
  let out = ""
  const buf = new Uint8Array(length)
  while (out.length < length) {
    crypto.getRandomValues(buf)
    for (let i = 0; i < buf.length && out.length < length; i++) {
      if (buf[i] < max) out += INVITE_CODE_ALPHABET[buf[i] % n]
    }
  }
  return out
}
