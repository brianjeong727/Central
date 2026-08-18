"use server"

// Announcement acknowledgment — the leader-side nudge.
//
// ONE action: "Remind the N who haven't." Deliberately NOT per-person selection —
// picking individuals turns a reach tool into micro-management and makes the
// leader responsible for who they singled out.
//
// HARD CAP: at most 2 reminders per announcement, at least 24h apart, enforced
// SERVER-side via the existing notification_ledger claim-then-post idempotency
// (the same shape the Run Sheet tick and event-confirmations use). Client-side
// throttling is not a cap; without a real one this becomes harassment and people
// mute the announcements channel permanently, which costs the whole product.
//
// Pattern: authz guard (session) → createAdminClient() (bypasses RLS) →
// ministry-rescoped reads. Role gates go through lib/roles.ts predicates via
// authz.ts — never an inline role array.

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryLeader } from "@/app/actions/authz"
import { audienceScope } from "@/lib/announcement-audience"

type AdminClient = ReturnType<typeof createAdminClient>

const MAX_ROUNDS = 2
const MIN_GAP_MS = 24 * 60 * 60 * 1000

// Claim a ledger offset; true only if the row was freshly inserted (not a
// conflict). ignoreDuplicates → ON CONFLICT DO NOTHING, so .select() yields a row
// ONLY on a fresh claim. Mirrors event-confirmations.ts:claimLedger.
async function claimLedger(admin: AdminClient, announcementId: string, round: number): Promise<boolean> {
  const { data } = await admin
    .from("notification_ledger")
    .upsert(
      { subject_type: "announcement", subject_id: announcementId, offset_key: `announcement_nudge:${round}` },
      { onConflict: "subject_type,subject_id,offset_key", ignoreDuplicates: true },
    )
    .select("id")
  return (data?.length ?? 0) > 0
}

// POST the dispatch route (machine auth via x-push-secret). A POST failure eats
// one ping — acceptable and matches the SQL tick (the ledger is already claimed,
// so nothing retries).
async function postDispatch(announcementId: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SITE_URL
  const secret = process.env.PUSH_WEBHOOK_SECRET
  if (!base || !secret) return
  try {
    await fetch(`${base}/api/push/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-push-secret": secret },
      body: JSON.stringify({ table: "announcements", record_id: announcementId, event: "announcement_nudge" }),
    })
  } catch {
    // swallow — see note above
  }
}

export async function remindUnacknowledgedAction(
  announcementId: string,
): Promise<{ sent: number; round: number; remaining: number } | { error: string }> {
  let admin: AdminClient
  try {
    admin = createAdminClient()
  } catch {
    return { error: "Server configuration error." }
  }

  const { data: ann } = await admin
    .from("announcements")
    .select("id, ministry_id, audience, status, requires_ack, created_by")
    .eq("id", announcementId)
    .maybeSingle()
  if (!ann) return { error: "Announcement not found." }

  // Leader-tier AND same ministry. (Inherited breadth, noted deliberately: the
  // gate is ministry-wide, so any leader may nudge any announcement's
  // non-acknowledgers, not only their own — same breadth as the roster's RLS.)
  const authz = await requireMinistryLeader(ann.ministry_id)
  if (authz.error !== null) return { error: authz.error }

  if (ann.status !== "published") return { error: "This announcement isn't published yet." }
  if (!ann.requires_ack) return { error: "This announcement doesn't ask for acknowledgment." }

  // Who still hasn't. Recomputed server-side — never trusted from the client.
  let audienceQuery = admin
    .from("profiles")
    .select("id")
    .eq("ministry_id", ann.ministry_id)
    .is("deleted_at", null) // a tombstoned account is nobody: never counted, never pushed
  const scope = audienceScope(ann.audience)
  if (scope.kind === "grad_year") audienceQuery = audienceQuery.eq("graduation_year", scope.gradYear)

  const [{ data: audience }, { data: ackRows }] = await Promise.all([
    audienceQuery,
    admin.from("announcement_acknowledgements").select("user_id").eq("announcement_id", ann.id),
  ])
  const acked = new Set((ackRows ?? []).map((r: { user_id: string }) => r.user_id))
  const pending = (audience ?? []).filter(
    (p: { id: string }) => p.id !== ann.created_by && !acked.has(p.id),
  )
  if (pending.length === 0) return { error: "Everyone has acknowledged this." }

  // Which round is this? The ledger is the authority (it survives restarts,
  // parallel leaders and a reload), not any client state.
  const { data: fired } = await admin
    .from("notification_ledger")
    .select("offset_key, fired_at")
    .eq("subject_type", "announcement")
    .eq("subject_id", ann.id)
    .like("offset_key", "announcement_nudge:%")
    .order("fired_at", { ascending: false })

  const rounds = fired ?? []
  if (rounds.length >= MAX_ROUNDS) {
    return { error: "You've already sent two reminders for this announcement." }
  }
  if (rounds.length > 0) {
    const last = Date.parse(rounds[0].fired_at)
    if (Number.isFinite(last) && Date.now() - last < MIN_GAP_MS) {
      const hours = Math.max(1, Math.ceil((MIN_GAP_MS - (Date.now() - last)) / 3_600_000))
      return { error: `You can send the next reminder in ${hours}h.` }
    }
  }

  const round = rounds.length + 1
  // The claim is the cap: two leaders tapping at once claim the same offset and
  // exactly one wins, so the second is refused rather than double-sending.
  const fresh = await claimLedger(admin, ann.id, round)
  if (!fresh) return { error: "A reminder for this announcement was just sent." }

  await postDispatch(ann.id)
  return { sent: pending.length, round, remaining: MAX_ROUNDS - round }
}
