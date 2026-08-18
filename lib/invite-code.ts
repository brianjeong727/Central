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
