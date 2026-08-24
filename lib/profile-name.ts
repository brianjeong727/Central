// ─── Display-name policy for OAuth accounts ───────────────────────────────────
// handle_new_user() sets profiles.name to
//   COALESCE(raw_user_meta_data->>'name', split_part(email,'@',1))
// so an OAuth mint that carries no name metadata lands with the EMAIL PREFIX as
// the name its whole ministry sees — "captkidjr", or the opaque "ygcvnyy625" for
// an Apple private-relay address. Apple is the usual cause: it returns a name
// only on the FIRST authorization, and never inside the identity token, so
// Supabase has nothing to store. Google always carries `name`/`full_name`, but a
// user who signed up with Apple first keeps the prefix forever — later Google
// metadata updates auth.users and never touches the profile row.
//
// Two halves, deliberately in ONE file so the rule cannot fork:
//   • providerFullName()    — dig a real name out of provider metadata.
//   • nameIsEmailDerived()  — is the stored name that fallback prefix?
//   • reconcileProfileName() — repair the profile row; run at every OAuth entry.
//
// Whatever this can't repair is collected from the user on /complete-profile,
// whose name-needed test is this same predicate (as is proxy.ts's gate).
//
// Type-only supabase imports — this module must stay runtime-dependency-free so
// proxy.ts (middleware) can import the predicate.

import type { SupabaseClient, User } from "@supabase/supabase-js"
import { isYoungAdult } from "./cohort"
import { isMemberTier } from "./roles"

type Meta = Record<string, unknown> | null | undefined

function str(meta: Meta, key: string): string {
  const v = meta?.[key]
  return typeof v === "string" ? v.trim() : ""
}

/**
 * The best real name the provider handed us, or null.
 * Google/Apple-with-name populate `full_name`/`name`; the composed branch covers
 * providers (and the native Apple sheet) that only give the parts.
 */
export function providerFullName(meta: Meta): string | null {
  const direct = str(meta, "full_name") || str(meta, "name")
  if (direct) return direct
  const composed = [
    str(meta, "given_name") || str(meta, "first_name"),
    str(meta, "family_name") || str(meta, "last_name"),
  ].filter(Boolean).join(" ").trim()
  return composed || null
}

/**
 * True when `name` is the handle_new_user fallback rather than something a
 * person typed — i.e. blank, or a SINGLE token exactly equal to the email's
 * local part.
 *
 * The whitespace clause is what makes the general rule safe. The gate used to be
 * scoped to @privaterelay.appleid.com precisely because "name === email local
 * part" would also re-gate long-standing users; requiring the name to be a lone
 * token means every real full name ("Brian Jeong") is untouched, and the only
 * false positive left is a mononym that happens to equal its own email prefix —
 * a person we want a full name from anyway.
 */
export function nameIsEmailDerived(name: string | null | undefined, email: string | null | undefined): boolean {
  const nm = (name ?? "").trim()
  if (nm === "") return true
  if (/\s/.test(nm)) return false
  const local = (email ?? "").split("@")[0].trim()
  return local !== "" && nm.toLowerCase() === local.toLowerCase()
}

/**
 * Copy the provider's real name onto the profile row when the stored one is the
 * email-prefix fallback. Idempotent, best-effort, and NEVER overwrites a name
 * the user owns — both the stored name and the candidate are run through
 * nameIsEmailDerived first.
 *
 * Called from both OAuth entry points (the web /auth/callback exchange and the
 * native verifyNativeOAuthSession action) so it also repairs accounts minted
 * before this existed, on their next sign-in.
 */
export async function reconcileProfileName(admin: SupabaseClient, user: User): Promise<void> {
  const candidate = providerFullName(user.user_metadata as Meta)
  if (!candidate) return

  const { data: prof, error } = await admin
    .from("profiles").select("name, email").eq("id", user.id).maybeSingle()
  if (error || !prof) return

  const email = prof.email ?? user.email ?? null
  // The stored name is the user's own — leave it alone.
  if (!nameIsEmailDerived(prof.name, email)) return
  // The provider handed back the same prefix (some IdPs echo the local part as
  // `name`) — writing it would just launder the fallback into a "real" name and
  // silence the /complete-profile ask.
  if (nameIsEmailDerived(candidate, email)) return

  const { error: updErr } = await admin.from("profiles").update({ name: candidate }).eq("id", user.id)
  if (updErr) console.error("[profile-name] failed to backfill name for", user.id, updErr)
}

// ── Profile completeness ─────────────────────────────────────────────────────
//
// THE one predicate for "does this member still owe us signup details". Three
// places must agree on it — the proxy gate that diverts people to
// /complete-profile, the page itself (which bounces back out if it decides the
// profile is already complete), and anything that caches the answer. When they
// disagree the result is not a wrong pixel, it is a REDIRECT LOOP or a dead end.
//
// The young-adult clause is why this is shared rather than inlined. A young adult
// has NO graduation year by design (lib/cohort.ts), so a gate that demands one
// traps them on a form that cannot be satisfied: the year is the only thing
// missing, the form's only year control is a class-year picker, and the submit
// button stays disabled forever. That shipped — it is what sent a manually
// signed-up young adult to /complete-profile with "Enter a valid graduation
// year." and no way past.
//
// The ROLE check lives here rather than at each caller. It used to sit in proxy.ts
// alone (`isMemberTier(role) && memberProfileIncomplete(...)`), which meant the page
// had no idea the rule existed: anyone reaching /complete-profile directly was shown
// a class-year picker and told "Enter a valid graduation year", pastor or not. Only
// member/visitor owe a cohort — Central is a college ministry and the cohort exists
// to seat a student in their class chat; a pastor has no graduating class, and asking
// for one is the same dead end the young-adult clause below was written to fix.
export function memberProfileIncomplete(p: {
  role: string | null | undefined
  gender: string | null | undefined
  graduation_year: number | null | undefined
  grade: string | null | undefined
  name: string | null | undefined
  email: string | null | undefined
}): boolean {
  if (!isMemberTier(p.role)) return false
  if (!p.gender) return true
  // A cohort is required, but a young adult satisfies it WITHOUT a year.
  if (p.graduation_year == null && !isYoungAdult(p.grade)) return true
  return nameIsEmailDerived(p.name, p.email)
}
