"use server"

// Run Sheet P1 — tap-to-confirm server actions.
//
// Two leader-triggered actions that create/reset event_confirmations and IMMEDIATELY
// ping the assigned role-holders (so a leader sees delivery now, not at the next 9am
// tick). Both mirror the SQL tick's claim-then-post idempotency: claim a notification_
// ledger offset (INSERT ... ON CONFLICT DO NOTHING) and only POST the dispatch route if
// the claim was fresh — so a later tick's §3b loop, keyed on the same offset, never
// double-sends.
//
// Pattern (Convention #2/#6/#8): authz guard (session) → createAdminClient() (bypasses
// RLS) → ministry-rescoped writes. Actor/created_by is ALWAYS the authz userId, never a
// caller-supplied id. Role gates go through lib/roles.ts predicates.

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember, type AuthzContext } from "@/app/actions/authz"
import { isLeaderRole } from "@/lib/roles"

type AdminClient = ReturnType<typeof createAdminClient>

// Authorize a caller against a specific event plan. Mirrors the event_confirmations INSERT
// RLS: same ministry AND (admin-tier/leader OR holds can_plan_events on any team role).
async function authorizePlan(
  eventPlanId: string,
): Promise<{ ctx: AuthzContext; ministryId: string } | { error: string }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }

  const admin = createAdminClient()
  const { data: plan } = await admin
    .from("event_plans")
    .select("id, ministry_id")
    .eq("id", eventPlanId)
    .maybeSingle()
  if (!plan || plan.ministry_id !== ctx.ministryId) return { error: "Not authorized." }

  if (isLeaderRole(ctx.role)) return { ctx, ministryId: plan.ministry_id }

  // can_plan_events on any of the caller's team roles (verbatim mirror of the write RLS,
  // which is not plan-scoped — the same-ministry check above provides tenant isolation).
  const { data: memberships } = await admin
    .from("team_members")
    .select("id, team_roles!role_id(permissions)")
    .eq("user_id", ctx.userId)
  const canPlan = ((memberships ?? []) as { team_roles: { permissions?: string[] } | null }[]).some(
    (m) => (m.team_roles?.permissions ?? []).includes("can_plan_events"),
  )
  if (canPlan) return { ctx, ministryId: plan.ministry_id }

  return { error: "Not authorized." }
}

// Claim a ledger offset; returns true only if the row was freshly inserted (not a conflict).
// ignoreDuplicates → ON CONFLICT DO NOTHING, so .select() yields the row ONLY on a fresh claim.
async function claimLedger(admin: AdminClient, subjectId: string, offsetKey: string): Promise<boolean> {
  const { data } = await admin
    .from("notification_ledger")
    .upsert(
      { subject_type: "event_confirmation", subject_id: subjectId, offset_key: offsetKey },
      { onConflict: "subject_type,subject_id,offset_key", ignoreDuplicates: true },
    )
    .select("id")
  return (data?.length ?? 0) > 0
}

// POST the dispatch route (machine auth via x-push-secret). A POST failure eats one ping —
// acceptable and matches the SQL tick (the ledger is already claimed, so nothing retries).
async function postDispatch(recordId: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_SITE_URL
  const secret = process.env.PUSH_WEBHOOK_SECRET
  if (!base || !secret) return
  try {
    await fetch(`${base}/api/push/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-push-secret": secret },
      body: JSON.stringify({ table: "event_confirmations", record_id: recordId, event: "confirm_request" }),
    })
  } catch {
    // swallow — see note above
  }
}

async function claimAndPost(admin: AdminClient, confirmationId: string, round: number): Promise<void> {
  const fresh = await claimLedger(admin, confirmationId, `confirm_request:${round}`)
  if (fresh) await postDispatch(confirmationId)
}

// Request confirmations for every assigned role of a plan. Idempotent: upsert DO NOTHING on
// (subject_type,subject_id,user_id) so re-running never duplicates a live confirmation. Each
// resulting 'requested' row is claim-then-posted (ledger dedups against the T-2 auto-create tick).
export async function requestConfirmationsAction(
  eventPlanId: string,
): Promise<{ requested: number } | { error: string }> {
  const auth = await authorizePlan(eventPlanId)
  if ("error" in auth) return { error: auth.error }
  const { ministryId } = auth

  const admin = createAdminClient()

  const { data: roles } = await admin
    .from("event_roles")
    .select("id, assigned_to")
    .eq("event_plan_id", eventPlanId)
    .not("assigned_to", "is", null)
  const assigned = (roles ?? []) as { id: string; assigned_to: string }[]

  if (assigned.length > 0) {
    const now = new Date().toISOString()
    const rows = assigned.map((r) => ({
      ministry_id: ministryId,
      event_plan_id: eventPlanId,
      subject_type: "role" as const,
      subject_id: r.id,
      user_id: r.assigned_to,
      status: "requested" as const,
      round: 1,
      requested_at: now,
    }))
    await admin
      .from("event_confirmations")
      .upsert(rows, { onConflict: "subject_type,subject_id,user_id", ignoreDuplicates: true })
  }

  // Ping every live 'requested' role-confirmation for this plan (fresh + lingering); the ledger
  // makes ones already pinged this round a no-op, so this never re-nags.
  const { data: reqs } = await admin
    .from("event_confirmations")
    .select("id, round")
    .eq("event_plan_id", eventPlanId)
    .eq("ministry_id", ministryId)
    .eq("subject_type", "role")
    .eq("status", "requested")
  const requested = (reqs ?? []) as { id: string; round: number }[]

  for (const c of requested) await claimAndPost(admin, c.id, c.round)

  return { requested: requested.length }
}

// Re-request a single confirmation: bump the round, reset to 'requested', clear the response,
// then claim-then-post the new round's offset. This is the ONLY sanctioned path back to
// 'requested' (the own-row UPDATE RLS forbids a member from writing that status).
export async function reRequestConfirmationAction(
  confirmationId: string,
): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient()

  const { data: conf } = await admin
    .from("event_confirmations")
    .select("id, ministry_id, event_plan_id, round")
    .eq("id", confirmationId)
    .maybeSingle()
  if (!conf) return { error: "Confirmation not found." }

  const auth = await authorizePlan(conf.event_plan_id)
  if ("error" in auth) return { error: auth.error }
  if (conf.ministry_id !== auth.ministryId) return { error: "Not authorized." }

  const newRound = (conf.round ?? 1) + 1
  const { error: updErr } = await admin
    .from("event_confirmations")
    .update({
      status: "requested",
      round: newRound,
      requested_at: new Date().toISOString(),
      responded_at: null,
      note: null,
    })
    .eq("id", confirmationId)
    .eq("ministry_id", auth.ministryId)
  if (updErr) return { error: updErr.message }

  await claimAndPost(admin, confirmationId, newRound)

  return { ok: true }
}

// Mark a task complete/incomplete. event_tasks UPDATE RLS is admin-leader/can_plan_events
// only, so a regular member assignee cannot toggle their own task via a client write —
// this action bridges that: authorized if the caller is the task's assignee OR passes the
// plan-level authz (leader/can_plan_events). Runs the write under the admin client.
export async function completeTaskAction(
  taskId: string,
  completed: boolean,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }

  const admin = createAdminClient()
  const { data: task } = await admin
    .from("event_tasks")
    .select("id, assigned_to, event_plan_id")
    .eq("id", taskId)
    .maybeSingle()
  if (!task) return { error: "Task not found." }

  // Tenant isolation: the task's plan must belong to the caller's ministry.
  const { data: plan } = await admin
    .from("event_plans")
    .select("ministry_id")
    .eq("id", task.event_plan_id)
    .maybeSingle()
  if (!plan || plan.ministry_id !== ctx.ministryId) return { error: "Not authorized." }

  // Authorized if the assignee OR a leader/can_plan_events holder on the plan.
  let authorized = task.assigned_to === ctx.userId
  if (!authorized) {
    const auth = await authorizePlan(task.event_plan_id)
    authorized = !("error" in auth)
  }
  if (!authorized) return { error: "Not authorized." }

  const { error } = await admin
    .from("event_tasks")
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq("id", taskId)
  if (error) return { error: error.message }

  return { ok: true }
}
