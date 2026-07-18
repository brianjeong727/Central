"use server"

// Run Sheet P3b — day-of live mode for event_blocks.
//   setBlockStatusAction — a block's OWNER (or a leader) marks it active/done/skipped;
//                          stamps actual_start/actual_end. event_blocks UPDATE RLS is
//                          leader-only, so the owner path needs this admin-client action.
//   shiftBlocksAction     — "running late": shift a block + all downstream blocks (same day,
//                          sort_order >=) by N minutes, reformatting time_label from start_time.
//
// Pattern (Convention #2/#6/#8): session authz guard → createAdminClient() → ministry-rescoped.

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember, type AuthzContext } from "@/app/actions/authz"
import { isLeaderRole } from "@/lib/roles"

type AdminClient = ReturnType<typeof createAdminClient>
type BlockStatus = "pending" | "active" | "done" | "skipped"

async function canPlanEvents(admin: AdminClient, ctx: AuthzContext): Promise<boolean> {
  if (isLeaderRole(ctx.role)) return true
  const { data } = await admin.from("team_members").select("id, team_roles!role_id(permissions)").eq("user_id", ctx.userId)
  return ((data ?? []) as { team_roles: { permissions?: string[] } | null }[]).some(
    (m) => (m.team_roles?.permissions ?? []).includes("can_plan_events"),
  )
}

// Load the block, verify same ministry (via its plan), and return it + whether the caller may act.
async function loadBlock(admin: AdminClient, ctx: AuthzContext, blockId: string) {
  const { data: block } = await admin
    .from("event_blocks")
    .select("id, ministry_id, event_plan_id, day_index, sort_order, owner_id, start_time, time_label")
    .eq("id", blockId)
    .maybeSingle()
  if (!block || block.ministry_id !== ctx.ministryId) return { block: null, canManage: false, isOwner: false }
  const canManage = await canPlanEvents(admin, ctx)
  return { block, canManage, isOwner: block.owner_id === ctx.userId }
}

export async function setBlockStatusAction(
  blockId: string,
  status: BlockStatus,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }
  const admin = createAdminClient()
  const { block, canManage, isOwner } = await loadBlock(admin, ctx, blockId)
  if (!block) return { error: "Not found." }
  if (!canManage && !isOwner) return { error: "Not authorized." }

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = { status }
  if (status === "active") patch.actual_start = nowIso
  if (status === "done") patch.actual_end = nowIso
  const { error } = await admin.from("event_blocks").update(patch).eq("id", blockId).eq("ministry_id", ctx.ministryId)
  return error ? { error: error.message } : { ok: true }
}

// Ripple after a block's time is edited: push every LATER block on the same day by `minutes`
// (the edited block already carries its own new time). start_time is authoritative; time_label
// is re-derived (12h) for the ones we can shift; free-text-only blocks are skipped.
export async function shiftBlocksAction(
  blockId: string,
  minutes: number,
): Promise<{ shifted: number } | { error: string }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }
  const admin = createAdminClient()
  const { block, canManage } = await loadBlock(admin, ctx, blockId)
  if (!block) return { error: "Not found." }
  if (!canManage) return { error: "Not authorized." }

  // Strictly-downstream: same plan + day, sort_order > this block's, with a parseable start_time.
  const { data: rows } = await admin
    .from("event_blocks")
    .select("id, start_time, sort_order")
    .eq("event_plan_id", block.event_plan_id)
    .eq("day_index", block.day_index)
    .gt("sort_order", block.sort_order)
    .order("sort_order", { ascending: true })

  let shifted = 0
  for (const r of (rows ?? []) as { id: string; start_time: string | null }[]) {
    if (!r.start_time) continue // free-text-only blocks can't ripple
    const [h, m] = r.start_time.split(":").map(Number)
    const total = (h * 60 + m + minutes + 1440) % 1440
    const nh = Math.floor(total / 60), nm = total % 60
    const newTime = `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`
    const label = fmt12h(nh, nm)
    const { error } = await admin.from("event_blocks").update({ start_time: newTime, time_label: label })
      .eq("id", r.id).eq("ministry_id", ctx.ministryId)
    if (!error) shifted++
  }
  return { shifted }
}

function fmt12h(h: number, m: number): string {
  const ampm = h < 12 ? "AM" : "PM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}
