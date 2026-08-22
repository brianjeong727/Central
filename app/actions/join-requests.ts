"use server"

// ─── Custom join codes + request-to-join ─────────────────────────────────────
//
// A ministry may swap its generated code for a memorable one. That trade is only
// safe because the code stops being a KEY and becomes an ADDRESS: typing a custom
// code opens a REQUEST, and an admin turns it into membership. See lib/invite-code.ts
// for why (the missing rate limiter is justified by 32^10, and a word anyone can
// guess does not carry 32^10).
//
// EVERYTHING HERE IS SERVICE-ROLE, and that is not laziness — it is forced twice over:
//   • A requester is BY DEFINITION outside the ministry, so they cannot read
//     `ministries` to resolve the code they typed, and an admin reading the queue
//     through RLS gets rows whose embedded profile is NULL (profiles SELECT is
//     ministry-scoped). Both surfaces would render as faceless uuids.
//   • The live `ministries` UPDATE policy is `created_by = auth.uid()` with no WITH
//     CHECK, so an admin who did not found the ministry cannot change its code from
//     a client at all.
// The RLS policies on ministry_join_requests are therefore defense in depth, not the
// effective boundary — every gate below is `requireMinistryAdmin` or an explicit
// ownership check, in the shape app/actions/authz.ts documents.

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryAdmin } from "./authz"
import { autoAddUserToChats } from "./auto-chats"
import { admitUserToMinistry } from "@/lib/ministry-membership"
import { moderateText, SEVERE } from "@/lib/moderation"
import { customCodeProblem, normalizeCustomCode, lookupVariants } from "@/lib/invite-code"

/** Requests one person may file at one ministry, ever. The partial unique index caps
 *  PENDING at one; without this, decline → re-request → decline grows unboundedly and
 *  every cycle pings an admin. */
const MAX_REQUESTS_PER_MINISTRY = 5

export type JoinRequestRow = {
  id: string
  userId: string
  name: string | null
  email: string | null
  avatarUrl: string | null
  createdAt: string
}

// ─── Admin: claim a custom code ──────────────────────────────────────────────
export async function setCustomInviteCode(
  ministryId: string,
  rawCode: string,
): Promise<{ code: string | null; error: string | null }> {
  const ctx = await requireMinistryAdmin(ministryId)
  if (ctx.error !== null) return { code: null, error: ctx.error }

  const code = normalizeCustomCode(rawCode)

  // Shape, length and the reserved list — everything decidable from the string alone.
  const problem = customCodeProblem(code)
  if (problem) return { code: null, error: problem }

  // Profanity, in TWO passes, because a code is not prose and the shared filter is
  // built for prose. Deliberately uses the strict list rather than the ministry's own
  // moderation settings: a join code is read by people OUTSIDE the ministry, on a
  // poster, so a ministry does not get to lower the bar on everyone else's behalf.
  //
  //  1. Whole-word, via the shared filter — catches a code that IS a slur, including
  //     the leet spellings normalizeToken folds (a code is exactly the shape someone
  //     reaches for leet to sneak past a filter).
  //  2. SUBSTRING, and only against the SEVERE tier. A code has no spaces, so
  //     "GR4CEXXSLUR" is one token and pass 1 never sees the word inside it. Limited
  //     to SEVERE on purpose: substring matching over-blocks (GRASSROOTS contains a
  //     mild word), and refusing a church its actual name is a worse failure than
  //     letting a mild word through — but not for the words in SEVERE.
  const strict = { strictness: "strict" as const, behavior: "block" as const }
  const severeHit = SEVERE.some((w) => w.length >= 4 && code.toLowerCase().includes(w))
  if (severeHit || moderateText(code, strict).flaggedCount > 0) {
    return { code: null, error: "That code isn't available." }
  }

  const admin = createAdminClient()

  // Collision, checked across BOTH columns and across EVERY variant the code could be
  // matched by — not just an exact duplicate.
  //
  // The UNIQUE index cannot see this case: "GLORIA" and "G10R1A" are different strings
  // and both storable, but Crockford folding makes a typed "GLORIA" match either. If
  // two ministries hold one each, `.in(column, variants).maybeSingle()` matches TWO
  // rows, returns null, and BOTH ministries' join links die with "No ministry found".
  const variants = lookupVariants(code)
  const { data: clash } = await admin
    .from("ministries")
    .select("id")
    .or(`invite_code.in.(${variants.join(",")}),staff_invite_code.in.(${variants.join(",")})`)
    .neq("id", ministryId)
    .limit(1)
  if (clash && clash.length > 0) return { code: null, error: "That code is already taken." }

  const { error } = await admin
    .from("ministries")
    .update({ invite_code: code, invite_code_is_custom: true })
    .eq("id", ministryId)

  if (error) {
    // The UNIQUE index is still the backstop for an exact race between two admins.
    if (error.code === "23505") return { code: null, error: "That code is already taken." }
    return { code: null, error: error.message }
  }
  return { code, error: null }
}

// ─── Anyone signed in: ask to join ───────────────────────────────────────────
export async function requestToJoinMinistry(
  rawCode: string,
): Promise<{ ministryName: string | null; state: "requested" | "already-pending" | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ministryName: null, state: null, error: "Not authenticated." }

  const admin = createAdminClient()
  const { data: ministry } = await admin
    .from("ministries")
    .select("id, name, status, invite_code_is_custom")
    .in("invite_code", lookupVariants(rawCode))
    .maybeSingle()

  // Unknown code, staff code, and a non-active ministry answer identically — no
  // oracle beyond the one this feature deliberately accepts.
  if (!ministry || ministry.status !== "active") {
    return { ministryName: null, state: null, error: "No ministry found with that code." }
  }
  // A generated code still grants membership outright; it never reaches this action.
  if (!ministry.invite_code_is_custom) {
    return { ministryName: null, state: null, error: "No ministry found with that code." }
  }

  // Bans are checked HERE as well as at approval. joinMinistryByCode refuses a banned
  // user, and a banned user must not be able to fill an admin's queue either.
  const { data: ban } = await admin
    .from("ministry_bans")
    .select("id")
    .eq("ministry_id", ministry.id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (ban) return { ministryName: null, state: null, error: "You are not permitted to join this ministry." }

  const { data: profile } = await admin
    .from("profiles").select("ministry_id").eq("id", user.id).maybeSingle()
  if (profile?.ministry_id === ministry.id) {
    return { ministryName: ministry.name, state: null, error: "You're already in this ministry." }
  }

  const { count } = await admin
    .from("ministry_join_requests")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", ministry.id)
    .eq("user_id", user.id)
  if ((count ?? 0) >= MAX_REQUESTS_PER_MINISTRY) {
    return { ministryName: ministry.name, state: null, error: "You've already asked to join this ministry." }
  }

  // INSERT, never upsert. The pending-uniqueness is a PARTIAL index, and ON CONFLICT
  // can only infer one if the index predicate is restated — supabase-js emits the
  // columns only, so `.upsert({onConflict:"ministry_id,user_id"})` fails 42P10 every
  // time. 23505 here means the person double-tapped or retried, which is success.
  const { error } = await admin
    .from("ministry_join_requests")
    .insert({ ministry_id: ministry.id, user_id: user.id })
  if (error) {
    if (error.code === "23505") return { ministryName: ministry.name, state: "already-pending", error: null }
    return { ministryName: null, state: null, error: error.message }
  }
  return { ministryName: ministry.name, state: "requested", error: null }
}

// ─── Requester: what am I waiting on? ────────────────────────────────────────
// A service-role read, because a requester can read their own request row under RLS
// but cannot resolve its ministry_id to a NAME — `ministries` SELECT is own-ministry
// or public-and-active, and they are in neither.
export async function myPendingJoinRequest(): Promise<{ ministryName: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ministryName: null, error: null }

  const admin = createAdminClient()
  const { data } = await admin
    .from("ministry_join_requests")
    .select("ministry_id, ministries!inner(name)")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const m = data?.ministries as { name?: string } | { name?: string }[] | undefined
  const name = Array.isArray(m) ? m[0]?.name : m?.name
  return { ministryName: name ?? null, error: null }
}

// ─── Admin: the queue ────────────────────────────────────────────────────────
export async function listJoinRequests(
  ministryId: string,
): Promise<{ requests: JoinRequestRow[]; error: string | null }> {
  const ctx = await requireMinistryAdmin(ministryId)
  if (ctx.error !== null) return { requests: [], error: ctx.error }

  // The profile join runs admin-side ON PURPOSE. Through RLS it returns rows whose
  // embedded profile is NULL — 200 OK, no error, a queue of faceless uuids — because
  // the requester is outside the ministry that `profiles` SELECT is scoped to. Only
  // the four identity fields are returned; this is not a general profile read.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ministry_join_requests")
    .select("id, user_id, created_at, profiles!ministry_join_requests_user_id_fkey(name, email, avatar_url)")
    .eq("ministry_id", ministryId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })

  if (error) return { requests: [], error: error.message }

  const requests: JoinRequestRow[] = (data ?? []).map((r) => {
    const p = r.profiles as { name?: string; email?: string; avatar_url?: string } | null
    return {
      id: r.id as string,
      userId: r.user_id as string,
      name: p?.name ?? null,
      email: p?.email ?? null,
      avatarUrl: p?.avatar_url ?? null,
      createdAt: r.created_at as string,
    }
  })
  return { requests, error: null }
}

// ─── Admin: decide ───────────────────────────────────────────────────────────
export async function decideJoinRequest(
  ministryId: string,
  requestId: string,
  approve: boolean,
): Promise<{ error: string | null }> {
  const ctx = await requireMinistryAdmin(ministryId)
  if (ctx.error !== null) return { error: ctx.error }

  const admin = createAdminClient()

  // Claim the row FIRST, scoped to this ministry and to `pending`. That is both the
  // authorization check (a request belonging to another ministry cannot be decided
  // from here) and the double-decide guard — zero rows affected means someone else
  // already handled it, which is not an error worth showing.
  const { data: claimed, error: claimErr } = await admin
    .from("ministry_join_requests")
    .update({
      status: approve ? "approved" : "declined",
      decided_at: new Date().toISOString(),
      decided_by: ctx.userId,
    })
    .eq("id", requestId)
    .eq("ministry_id", ministryId)
    .eq("status", "pending")
    .select("user_id")

  if (claimErr) return { error: claimErr.message }
  if (!claimed || claimed.length === 0) return { error: null }

  if (!approve) return { error: null }

  const requesterId = claimed[0].user_id as string

  // Re-check the ban at APPROVAL. A person can be banned between requesting and being
  // decided on, and the request row carries no memory of that.
  const { data: ban } = await admin
    .from("ministry_bans")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("user_id", requesterId)
    .maybeSingle()
  if (ban) return { error: "That person is not permitted to join this ministry." }

  // The SAME write the instant-join path runs — role resolution, user_ministries, and
  // the auto-chat assignment that decides between a class chat and Young Adults.
  // Reimplementing it here is how one path produces a member in no chats.
  const { error } = await admitUserToMinistry(admin, requesterId, ministryId, {
    addToChats: (grade, role, gradYear) =>
      autoAddUserToChats(requesterId, ministryId, gradYear, role, grade),
  })
  return { error }
}

// ─── Admin: how many are waiting ─────────────────────────────────────────────
// Powers the Church Settings nav badge. An admin who never opens Settings would
// otherwise never learn anyone is waiting, and a queue nobody looks at is the whole
// failure mode of request-to-join — the requester's side cannot resolve until this
// side acts, so this is the load-bearing half of "tell someone".
//
// Returns 0 rather than an error for a non-admin: this feeds a badge on a nav item
// every member's shell renders, so a failure here must be invisible, never a thrown
// action or an error toast on someone else's screen.
export async function getPendingJoinRequestCount(ministryId: string): Promise<{ count: number }> {
  const ctx = await requireMinistryAdmin(ministryId)
  if (ctx.error !== null) return { count: 0 }

  const admin = createAdminClient()
  const { count } = await admin
    .from("ministry_join_requests")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", ministryId)
    .eq("status", "pending")
  return { count: count ?? 0 }
}
