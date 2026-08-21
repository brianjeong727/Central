// ─── /j/<CODE> — the one-scan invite landing ─────────────────────────────────
//
// A ministry's member invite code, rendered as a link (and a QR of that link), so a
// student goes from scanning to being inside the ministry without typing anything.
//
// WHY THE JOIN HAPPENS HERE AND NOWHERE ELSE: auth's only job in this flow is to bring
// the user BACK to this URL. Threading the code through each auth method instead would
// mean five paths (email OTP, web Google, web Apple, native Google, native Apple), two
// of which never touch /auth/callback at all — see lib/invite-code.ts `inviteReturnPath`.
//
// WHY THIS PAGE NEVER JOINS ON LOAD: `joinMinistryByCode` OVERWRITES profiles.ministry_id
// and resets role to "member" (app/actions/ministry.ts). Joining on mount would mean that
// merely OPENING a link — from a text, an email, a QR sticker placed over a real one —
// relocates an existing member to another ministry, demotes them, enrolls them in that
// ministry's chats and strands them as an "Unknown" member of their old one. The existing
// /ministries code-join is safe from that only because the code must be TYPED. So every
// signed-in state here renders a landing and waits for an explicit tap; the "switch
// churches" case names both ministries before it will do anything.
//
// STAFF CODES CANNOT COME THROUGH HERE. The lookup queries `invite_code` only, so a staff
// code simply does not resolve, and it lands on the same generic invalid state as a typo —
// the page must never confirm that a given string is a real staff code. `joinMinistryByCode`
// is called with ONE argument from this surface, so no role can be attached.

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { INVITE_CODE_RE, isValidCustomCode, lookupVariants } from "@/lib/invite-code"
import { InviteLanding, InviteInvalid } from "./invite-client"

export const dynamic = "force-dynamic"

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  // Next has already percent-decoded the route param. Decoding a second time throws
  // on a stray "%", which would make malformed input the one class that answers
  // differently from every other invalid code — so it is not done.
  // Every form the input could have been STORED as — Crockford-folded (a generated
  // code), plain-uppercase (a custom code, and the legacy base36 ones whose I/L/O do
  // not survive folding), or both where the formats overlap. The database decides
  // which exists; this page does not try to classify the string itself.
  const variants = lookupVariants(raw ?? "")

  // Malformed codes never reach the database.
  if (!variants.some((v) => INVITE_CODE_RE.test(v) || isValidCustomCode(v))) return <InviteInvalid />

  // invite_code is column-revoked from authenticated/anon, so the lookup runs on the
  // admin client. It selects ONLY the member column — a staff code cannot match.
  const admin = createAdminClient()
  const { data: ministry } = await admin
    .from("ministries")
    .select("id, name, status, invite_code, invite_code_is_custom")
    .in("invite_code", variants)
    .maybeSingle()

  // Unknown code, staff code, and a ministry that is pending/rejected/archived all
  // render identically — no oracle.
  if (!ministry || ministry.status !== "active") return <InviteInvalid />

  // Hand the landing the STORED code, not the typed one. The lookup matched on one of
  // several variants, and only the stored form is guaranteed to match again when the
  // landing submits it — a user who typed a generated code's O where a 0 lives would
  // otherwise be handed back their own typo to re-submit.
  const code: string = ministry.invite_code

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Signed out — the landing invites them to make an account, and carries the code so
  // whichever auth path they take returns them here.
  if (!user) {
    return <InviteLanding code={code} ministryName={ministry.name} state="signed-out" />
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id")
    .eq("id", user.id)
    .maybeSingle()

  // Already a member of THIS ministry — never call join (it would be a no-op, but the
  // point is that a link should not be able to trigger a write at all).
  if (profile?.ministry_id === ministry.id) redirect("/home")

  // In a DIFFERENT ministry — the landing has to name both sides before it will switch.
  let currentMinistryName: string | null = null
  if (profile?.ministry_id) {
    const { data: current } = await admin
      .from("ministries")
      .select("name")
      .eq("id", profile.ministry_id)
      .maybeSingle()
    currentMinistryName = current?.name ?? null
  }

  return (
    <InviteLanding
      code={code}
      ministryName={ministry.name}
      state={currentMinistryName ? "switching" : "signed-in"}
      currentMinistryName={currentMinistryName}
    />
  )
}
