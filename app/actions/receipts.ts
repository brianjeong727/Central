"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { computeFinanceCapability } from "./finance-auth"
import { requireTeamMemberOrAdmin, requireSameMinistry } from "./authz"
import { isAdminRole } from "@/lib/roles"

export interface ReceiptLimit {
  id: string
  ministry_id: string
  category: string
  fund: string
  fund_id?: string | null
  max_amount: number
}

export interface Receipt {
  id: string
  ministry_id: string
  team_id: string | null
  category_id: string | null
  reimbursement_form_id: string | null
  submitted_by: string
  submitted_by_name?: string
  event_name: string | null
  category: string
  fund: string
  amount: number
  purchase_date: string
  receipt_image_url: string | null
  receipt_image_urls?: string[] | null
  notes: string | null
  status: string
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  allocations?: ReceiptAllocation[]
}

// One per-source split row. A receipt is now a header; money lives here. Each
// allocation carries its own fund + its own reimbursement lifecycle (the status
// path depends on the fund KIND — see the transition actions below).
export interface ReceiptAllocation {
  id: string
  fund_id: string
  fund_name: string
  fund_kind: "church" | "external"
  amount: number
  status: string
  requested_at: string | null
  reviewed_at: string | null
  signed_off_at: string | null
  decision_reason: string | null
}

// Resolve a fund string/id hint to a finance_funds.id for the ministry. Falls
// back to the ministry's church fund (then any fund) so a receipt is never left
// allocation-less. Uses the admin client (member has no finance read under RLS).
async function resolveFundId(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
  fundHint?: string | null,
): Promise<string | null> {
  const { data: funds } = await admin
    .from("finance_funds")
    .select("id, slug")
    .eq("ministry_id", ministryId)
  const list = (funds ?? []) as { id: string; slug: string }[]
  if (fundHint) {
    const hint = fundHint.toLowerCase()
    const hit = list.find(f => f.id === fundHint || f.slug === hint)
    if (hit) return hit.id
  }
  return list.find(f => f.slug === "church")?.id ?? list[0]?.id ?? null
}

export async function submitReceipt(params: {
  ministryId: string
  teamId?: string | null
  categoryId?: string | null
  eventName: string
  category: string
  fund: string
  amount: number
  purchaseDate: string
  receiptImageUrl: string | null
  receiptImageUrls?: string[]
  notes: string
}): Promise<{ data: Receipt | null; error: string | null }> {
  // Auth gate. permissions.md: "any team member of that team can submit". A
  // receipt is normally filed under a team → require team membership (or
  // admin-tier). When no team is attached (legacy/finance path), fall back to
  // same-ministry. Both arms assert the team/caller belong to the ministry.
  const authz = params.teamId
    ? await requireTeamMemberOrAdmin(params.teamId)
    : await requireSameMinistry(params.ministryId)
  if (authz.error !== null) return { data: null, error: authz.error }
  // Reject a mismatched client-supplied ministryId even on the team arm.
  if (params.ministryId !== authz.ministryId) return { data: null, error: "Not authorized." }

  const supabase = await createClient()
  const admin = createAdminClient()

  // If a category is supplied it must belong to the target team (and thus this
  // ministry) — blocks tagging a receipt with a foreign category.
  if (params.categoryId) {
    if (!params.teamId) return { data: null, error: "Not authorized." }
    const { data: cat } = await admin
      .from("receipt_categories")
      .select("id")
      .eq("id", params.categoryId)
      .eq("team_id", params.teamId)
      .eq("ministry_id", authz.ministryId)
      .maybeSingle()
    if (!cat) return { data: null, error: "Not authorized." }
  }

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", authz.userId).single()

  // Multi-image: keep receipt_image_url = urls[0] for back-compat (dual-write).
  const urls = params.receiptImageUrls ?? (params.receiptImageUrl ? [params.receiptImageUrl] : [])
  const primaryUrl = urls[0] ?? params.receiptImageUrl ?? null

  const { data, error } = await supabase
    .from("receipts")
    .insert({
      ministry_id: authz.ministryId,
      team_id: params.teamId ?? null,
      category_id: params.categoryId ?? null,
      // submitted_by comes from the verified session, never a client param.
      submitted_by: authz.userId,
      submitted_by_name: (profile as { name?: string } | null)?.name ?? null,
      event_name: params.eventName || null,
      category: params.category,
      fund: params.fund,
      amount: params.amount,
      purchase_date: params.purchaseDate,
      receipt_image_url: primaryUrl,
      receipt_image_urls: urls.length ? urls : null,
      notes: params.notes || null,
      status: "pending",
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  const receipt = data as Receipt

  // The member only *suggests* a fund — the treasurer owns the final split. Create
  // ONE default pending allocation for the full amount via the ADMIN client (the
  // member has no finance permission, so a user-client insert would be RLS-blocked).
  const fundId = await resolveFundId(admin, authz.ministryId, params.fund)
  if (fundId) {
    await admin.from("receipt_fund_allocations").insert({
      receipt_id: receipt.id,
      ministry_id: authz.ministryId,
      fund_id: fundId,
      amount: params.amount,
      status: "pending",
    })
  }

  return { data: receipt, error: null }
}

// Recompute the receipt-level DERIVED rollup from its allocation statuses. Call
// at the end of every allocation write. reimbursed if all reimbursed; else
// rejected if all terminal-negative; else pending if any still in-flight; else a
// mix of reimbursed + terminal → partial.
async function recomputeReceiptStatus(
  admin: ReturnType<typeof createAdminClient>,
  receiptId: string,
  ministryId: string,
): Promise<void> {
  const { data: allocs } = await admin
    .from("receipt_fund_allocations")
    .select("status")
    .eq("receipt_id", receiptId)
    .eq("ministry_id", ministryId)
  const statuses = ((allocs ?? []) as { status: string }[]).map(a => a.status)

  let rollup = "pending"
  if (statuses.length > 0) {
    if (statuses.every(s => s === "reimbursed")) rollup = "reimbursed"
    else if (statuses.every(s => s === "rejected" || s === "declined")) rollup = "rejected"
    else if (statuses.some(s => s === "pending" || s === "approved" || s === "requested")) rollup = "pending"
    else rollup = "partial"
  }

  await admin.from("receipts").update({ status: rollup }).eq("id", receiptId).eq("ministry_id", ministryId)
}

// ── Reimbursement approval inbox + two-step (treasurer → president) workflow ──────
// Status chain: pending → approved (treasurer) → reimbursed (president sign-off),
// with rejected (treasurer) and declined (president) as terminal off-ramps.

export interface InboxReceipt {
  id: string
  submitted_by: string
  submitted_by_name: string | null
  team_id: string | null
  team_name: string | null
  category_id: string | null
  category_name: string | null
  amount: number
  category: string
  fund: string
  purchase_date: string
  receipt_image_url: string | null
  receipt_image_urls: string[] | null
  event_name: string | null
  notes: string | null
  status: string
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  signed_off_by: string | null
  signed_off_at: string | null
  decision_reason: string | null
  allocations: ReceiptAllocation[]
}

// The one processing surface for the two-step workflow. Returns ALL of the
// ministry's standalone submitted receipts (every status; the legacy DG-dinner
// form-linked receipts keep their own flow and are excluded), newest first,
// joined with team + category names. No leak: a caller with neither finance
// capability gets an empty list.
export async function getReimbursementInbox(
  ministryId: string
): Promise<{ items: InboxReceipt[]; canApprove: boolean; canSignOff: boolean; canView: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { items: [], canApprove: false, canSignOff: false, canView: false }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.ministry_id || profile.ministry_id !== ministryId) {
    return { items: [], canApprove: false, canSignOff: false, canView: false }
  }

  const admin = createAdminClient()
  const { canApprove, canSignOff, canView } = await computeFinanceCapability(admin, ministryId, user.id, profile.role ?? "")

  // A read-only auditor (canView) sees the inbox too — actions are gated in the UI.
  if (!canApprove && !canSignOff && !canView) {
    return { items: [], canApprove: false, canSignOff: false, canView: false }
  }

  const { data, error } = await admin
    .from("receipts")
    .select("id, submitted_by, submitted_by_name, team_id, category_id, amount, category, fund, purchase_date, receipt_image_url, receipt_image_urls, event_name, notes, status, submitted_at, reviewed_by, reviewed_at, signed_off_by, signed_off_at, decision_reason")
    .eq("ministry_id", ministryId)
    .is("reimbursement_form_id", null)
    .order("submitted_at", { ascending: false })
  if (error) return { items: [], canApprove, canSignOff, canView }

  const rows = (data ?? []) as Omit<InboxReceipt, "team_name" | "category_name" | "allocations">[]

  // Resolve team names (scoped to this ministry).
  const teamIds = Array.from(new Set(rows.map(r => r.team_id).filter((id): id is string => !!id)))
  const teamNames = new Map<string, string>()
  if (teamIds.length > 0) {
    const { data: teamRows } = await admin.from("teams").select("id, name").in("id", teamIds).eq("ministry_id", ministryId)
    for (const t of (teamRows ?? []) as { id: string; name: string }[]) teamNames.set(t.id, t.name)
  }

  // Resolve category names.
  const categoryIds = Array.from(new Set(rows.map(r => r.category_id).filter((id): id is string => !!id)))
  const categoryNames = new Map<string, string>()
  if (categoryIds.length > 0) {
    const { data: catRows } = await admin.from("receipt_categories").select("id, name").in("id", categoryIds)
    for (const c of (catRows ?? []) as { id: string; name: string }[]) categoryNames.set(c.id, c.name)
  }

  // Fetch the per-source split for every receipt, joined to the fund name + kind.
  const receiptIds = rows.map(r => r.id)
  const allocsByReceipt = new Map<string, ReceiptAllocation[]>()
  if (receiptIds.length > 0) {
    // fund_id is only part of a COMPOSITE FK now, so a PostgREST embed hint
    // (`finance_funds!fund_id(...)`) fails silently — resolve fund name + kind via
    // a separate query + Map, this file's established pattern (cf. teamNames above).
    const { data: allocRows } = await admin
      .from("receipt_fund_allocations")
      .select("id, receipt_id, fund_id, amount, status, requested_at, reviewed_at, signed_off_at, decision_reason")
      .in("receipt_id", receiptIds)
      .eq("ministry_id", ministryId)
      .order("created_at", { ascending: true })
    const allocData = (allocRows ?? []) as Array<{
      id: string; receipt_id: string; fund_id: string; amount: number; status: string
      requested_at: string | null; reviewed_at: string | null; signed_off_at: string | null
      decision_reason: string | null
    }>

    const fundIds = Array.from(new Set(allocData.map(a => a.fund_id)))
    const fundMeta = new Map<string, { name: string; kind: string }>()
    if (fundIds.length > 0) {
      const { data: fundRows } = await admin
        .from("finance_funds")
        .select("id, name, kind")
        .in("id", fundIds)
        .eq("ministry_id", ministryId)
      for (const f of (fundRows ?? []) as { id: string; name: string; kind: string }[]) {
        fundMeta.set(f.id, { name: f.name, kind: f.kind })
      }
    }

    for (const a of allocData) {
      const fund = fundMeta.get(a.fund_id)
      const alloc: ReceiptAllocation = {
        id: a.id,
        fund_id: a.fund_id,
        fund_name: fund?.name ?? "",
        fund_kind: (fund?.kind === "church" ? "church" : "external"),
        amount: Number(a.amount),
        status: a.status,
        requested_at: a.requested_at,
        reviewed_at: a.reviewed_at,
        signed_off_at: a.signed_off_at,
        decision_reason: a.decision_reason,
      }
      const list = allocsByReceipt.get(a.receipt_id) ?? []
      list.push(alloc)
      allocsByReceipt.set(a.receipt_id, list)
    }
  }

  return {
    items: rows.map(r => ({
      ...r,
      team_name: r.team_id ? teamNames.get(r.team_id) ?? null : null,
      category_name: r.category_id ? categoryNames.get(r.category_id) ?? null : null,
      allocations: allocsByReceipt.get(r.id) ?? [],
    })),
    canApprove,
    canSignOff,
    canView,
  }
}

// Shared auth gate for the four transition actions. Re-verifies the caller's
// identity + finance capability server-side, returns the admin client + uid.
async function authorizeFinanceAction(
  ministryId: string,
  need: "approve" | "signoff",
): Promise<{ uid: string; admin: ReturnType<typeof createAdminClient> } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.ministry_id || profile.ministry_id !== ministryId) return { error: "Not authorized" }

  const admin = createAdminClient()
  const cap = await computeFinanceCapability(admin, ministryId, user.id, profile.role ?? "")
  if (need === "approve" && !cap.canApprove) return { error: "Not authorized" }
  if (need === "signoff" && !cap.canSignOff) return { error: "Not authorized" }
  return { uid: user.id, admin }
}

// ── Per-allocation transition engine ─────────────────────────────────────────
// Each transition: re-verify capability, fetch the allocation + its fund KIND,
// enforce the kind matches the action, status-guard the UPDATE with .eq(status,
// <from>), then recompute the receipt-level rollup. The status path depends on
// the fund kind:
//   church:   pending → approved (treasurer) → reimbursed (president sign-off)
//   external: pending → requested (treasurer files grant) → reimbursed (treasurer confirms)
// Off-ramps: rejected (treasurer, from pending) / declined (from approved|requested).

type AllocRow = {
  id: string
  receipt_id: string
  ministry_id: string
  fund_id: string
  status: string
}

async function transitionAllocation(params: {
  allocationId: string
  ministryId: string
  need: "approve" | "signoff"
  requireKind: "church" | "external" | "any"
  from: string
  patch: (uid: string) => Record<string, unknown>
}): Promise<{ error: string | null }> {
  const auth = await authorizeFinanceAction(params.ministryId, params.need)
  if ("error" in auth) return { error: auth.error }
  const { admin, uid } = auth

  const { data: alloc } = await admin
    .from("receipt_fund_allocations")
    .select("id, receipt_id, ministry_id, fund_id, status")
    .eq("id", params.allocationId)
    .eq("ministry_id", params.ministryId)
    .maybeSingle<AllocRow>()
  if (!alloc) return { error: "Allocation not found." }

  // Read the fund kind directly (plain column filter — no embed; fund_id is only
  // part of a composite FK, so PostgREST embed hints fail silently).
  const { data: fundRow } = await admin
    .from("finance_funds")
    .select("kind")
    .eq("id", alloc.fund_id)
    .eq("ministry_id", params.ministryId)
    .maybeSingle<{ kind: string }>()
  const kind = fundRow?.kind === "church" ? "church" : "external"
  if (params.requireKind !== "any" && kind !== params.requireKind) {
    return { error: "Wrong action for this fund." }
  }

  const { data, error } = await admin
    .from("receipt_fund_allocations")
    .update(params.patch(uid))
    .eq("id", params.allocationId)
    .eq("ministry_id", params.ministryId)
    .eq("status", params.from)
    .select("id")
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: "This allocation is no longer in the expected state." }

  await recomputeReceiptStatus(admin, alloc.receipt_id, params.ministryId)
  return { error: null }
}

// church: pending → approved (treasurer).
export async function approveAllocation(allocationId: string, ministryId: string): Promise<{ error: string | null }> {
  return transitionAllocation({
    allocationId, ministryId, need: "approve", requireKind: "church", from: "pending",
    patch: (uid) => ({ status: "approved", reviewed_by: uid, reviewed_at: new Date().toISOString() }),
  })
}

// external: pending → requested (treasurer files the grant application).
export async function requestAllocation(allocationId: string, ministryId: string): Promise<{ error: string | null }> {
  return transitionAllocation({
    allocationId, ministryId, need: "approve", requireKind: "external", from: "pending",
    patch: (uid) => ({ status: "requested", requested_at: new Date().toISOString(), reviewed_by: uid, reviewed_at: new Date().toISOString() }),
  })
}

// any: pending → rejected (treasurer, terminal).
export async function rejectAllocation(allocationId: string, ministryId: string, reason?: string): Promise<{ error: string | null }> {
  return transitionAllocation({
    allocationId, ministryId, need: "approve", requireKind: "any", from: "pending",
    patch: (uid) => ({ status: "rejected", reviewed_by: uid, reviewed_at: new Date().toISOString(), decision_reason: reason?.trim() || null }),
  })
}

// church: approved → reimbursed (president sign-off).
export async function signOffAllocation(allocationId: string, ministryId: string): Promise<{ error: string | null }> {
  return transitionAllocation({
    allocationId, ministryId, need: "signoff", requireKind: "church", from: "approved",
    patch: (uid) => ({ status: "reimbursed", signed_off_by: uid, signed_off_at: new Date().toISOString() }),
  })
}

// church: approved → declined (president, terminal).
export async function declineAllocation(allocationId: string, ministryId: string, reason?: string): Promise<{ error: string | null }> {
  return transitionAllocation({
    allocationId, ministryId, need: "signoff", requireKind: "church", from: "approved",
    patch: (uid) => ({ status: "declined", signed_off_by: uid, signed_off_at: new Date().toISOString(), decision_reason: reason?.trim() || null }),
  })
}

// external: requested → reimbursed (treasurer confirms the grant paid out).
export async function confirmExternalReimbursed(allocationId: string, ministryId: string): Promise<{ error: string | null }> {
  return transitionAllocation({
    allocationId, ministryId, need: "approve", requireKind: "external", from: "requested",
    patch: (uid) => ({ status: "reimbursed", signed_off_by: uid, signed_off_at: new Date().toISOString() }),
  })
}

// external: requested → declined (grant denied, terminal).
export async function declineExternalAllocation(allocationId: string, ministryId: string, reason?: string): Promise<{ error: string | null }> {
  return transitionAllocation({
    allocationId, ministryId, need: "approve", requireKind: "external", from: "requested",
    patch: (uid) => ({ status: "declined", decision_reason: reason?.trim() || null }),
  })
}

// ── Split editing (treasurer-owned) ──────────────────────────────────────────
// Replace the receipt's pending allocations with a new set. Locks once any
// allocation has left `pending` (review has started). Σ amounts must equal the
// receipt total; every fund must belong to the ministry.
export async function setReceiptAllocations(
  receiptId: string,
  ministryId: string,
  rows: { fundId: string; amount: number }[],
): Promise<{ error: string | null }> {
  const auth = await authorizeFinanceAction(ministryId, "approve")
  if ("error" in auth) return { error: auth.error }
  const { admin } = auth

  const { data: receipt } = await admin
    .from("receipts")
    .select("id, amount")
    .eq("id", receiptId)
    .eq("ministry_id", ministryId)
    .maybeSingle()
  if (!receipt) return { error: "Receipt not found." }

  const { data: current } = await admin
    .from("receipt_fund_allocations")
    .select("id, status")
    .eq("receipt_id", receiptId)
    .eq("ministry_id", ministryId)
  const currentRows = (current ?? []) as { id: string; status: string }[]
  if (currentRows.some(a => a.status !== "pending")) {
    return { error: "The split can't be changed after review has started." }
  }

  if (rows.length === 0) return { error: "Add at least one funding source." }
  const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  if (Math.abs(sum - Number((receipt as { amount: number }).amount)) > 0.01) {
    return { error: "The split must add up to the receipt total." }
  }

  // Validate every fund belongs to the ministry.
  const { data: funds } = await admin
    .from("finance_funds")
    .select("id")
    .eq("ministry_id", ministryId)
  const validFundIds = new Set((funds ?? []).map((f: { id: string }) => f.id))
  if (rows.some(r => !validFundIds.has(r.fundId))) return { error: "Unknown funding source." }

  // Replace the pending set atomically-enough: delete then insert (all pending).
  const { error: delErr } = await admin
    .from("receipt_fund_allocations")
    .delete()
    .eq("receipt_id", receiptId)
    .eq("ministry_id", ministryId)
  if (delErr) return { error: delErr.message }

  const { error: insErr } = await admin
    .from("receipt_fund_allocations")
    .insert(rows.map(r => ({
      receipt_id: receiptId,
      ministry_id: ministryId,
      fund_id: r.fundId,
      amount: Number(r.amount),
      status: "pending",
    })))
  if (insErr) return { error: insErr.message }

  await recomputeReceiptStatus(admin, receiptId, ministryId)
  return { error: null }
}

export interface SubmittedReceipt {
  id: string
  submitted_by: string
  submitted_by_name: string | null
  team_id: string | null
  team_name: string | null
  amount: number
  category: string
  fund: string
  purchase_date: string
  receipt_image_url: string | null
  event_name: string | null
  notes: string | null
  status: string
  submitted_at: string
}

// Treasurer-side queue of standalone receipts (no linked reimbursement form)
// submitted by any team member. RLS gates SELECT to admin-tier/leaders only, so a
// finance-team treasurer who is not admin/leader would be blocked — hence we fetch
// via the admin client behind an explicit finance-authorization check. Authorized:
// admin-tier (covers governance admins, who are a subset) OR a member of any team
// in the ministry whose role grants `can_view_finances`.
export async function getSubmittedReceipts(
  ministryId: string
): Promise<{ data: SubmittedReceipt[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.ministry_id || profile.ministry_id !== ministryId) {
    return { data: [], error: "Not authorized" }
  }

  const admin = createAdminClient()

  // Admin-tier (and thus any governance admin) is always authorized.
  let canViewFinances = isAdminRole(profile.role)

  // Otherwise the caller must be a member of a team whose role grants can_view_finances.
  if (!canViewFinances) {
    const { data: teams } = await admin.from("teams").select("id").eq("ministry_id", ministryId)
    const teamIds = (teams ?? []).map((t: { id: string }) => t.id)
    if (teamIds.length > 0) {
      const { data: memberRows } = await admin
        .from("team_members")
        .select("user_id, team_roles!role_id(permissions)")
        .in("team_id", teamIds)
        .eq("user_id", user.id)
      for (const row of (memberRows ?? []) as { team_roles: { permissions?: string[] } | null }[]) {
        if ((row.team_roles?.permissions ?? []).includes("can_view_finances")) { canViewFinances = true; break }
      }
    }
  }

  if (!canViewFinances) return { data: [], error: "Not authorized" }

  const { data, error } = await admin
    .from("receipts")
    .select("id, submitted_by, submitted_by_name, team_id, amount, category, fund, purchase_date, receipt_image_url, event_name, notes, status, submitted_at")
    .eq("ministry_id", ministryId)
    .is("reimbursement_form_id", null)
    .order("submitted_at", { ascending: false })
  if (error) return { data: [], error: error.message }

  const rows = (data ?? []) as Omit<SubmittedReceipt, "team_name">[]

  // Resolve submitting team names (separate query — mirrors how DGL names are resolved).
  const teamIds = Array.from(new Set(rows.map(r => r.team_id).filter((id): id is string => !!id)))
  const teamNames = new Map<string, string>()
  if (teamIds.length > 0) {
    const { data: teamRows } = await admin.from("teams").select("id, name").in("id", teamIds).eq("ministry_id", ministryId)
    for (const t of (teamRows ?? []) as { id: string; name: string }[]) teamNames.set(t.id, t.name)
  }

  return {
    data: rows.map(r => ({ ...r, team_name: r.team_id ? teamNames.get(r.team_id) ?? null : null })),
    error: null,
  }
}

// One row PER ALLOCATION (mirrors the master sheet — a receipt split across funds
// yields one row per funding source). Receipts with no allocation still emit a
// single row with a blank fund. Gated on finance capability (admin-tier OR a team
// role granting can_view_finances / audit — same gate as getSubmittedReceipts),
// fetched via the admin client; fund names resolved via a Map (no embed — fund_id
// is only part of a composite FK, so PostgREST embed hints fail silently).
export async function exportReceiptsCSV(ministryId: string): Promise<{ csv: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { csv: null, error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.ministry_id || profile.ministry_id !== ministryId) return { csv: null, error: "Not authorized" }

  const admin = createAdminClient()
  const { canView } = await computeFinanceCapability(admin, ministryId, user.id, profile.role ?? "")
  if (!canView) return { csv: null, error: "Not authorized" }

  const { data, error } = await admin
    .from("receipts")
    .select("id, purchase_date, submitted_by_name, event_name, category, amount, notes, status")
    .eq("ministry_id", ministryId)
    .order("submitted_at", { ascending: false })
  if (error) return { csv: null, error: error.message }
  if (!data?.length) return { csv: "", error: null }

  const receiptRows = data as Array<{ id: string; purchase_date: string; submitted_by_name: string | null; event_name: string | null; category: string; amount: number; notes: string | null; status: string }>

  // Allocations for all receipts + fund names via separate queries + Maps.
  const receiptIds = receiptRows.map(r => r.id)
  const { data: allocRows } = await admin
    .from("receipt_fund_allocations")
    .select("receipt_id, fund_id, amount, status")
    .in("receipt_id", receiptIds)
    .eq("ministry_id", ministryId)
    .order("created_at", { ascending: true })
  const allocs = (allocRows ?? []) as Array<{ receipt_id: string; fund_id: string; amount: number; status: string }>

  const fundIds = Array.from(new Set(allocs.map(a => a.fund_id)))
  const fundNames = new Map<string, string>()
  if (fundIds.length > 0) {
    const { data: fundRows } = await admin.from("finance_funds").select("id, name").in("id", fundIds).eq("ministry_id", ministryId)
    for (const f of (fundRows ?? []) as { id: string; name: string }[]) fundNames.set(f.id, f.name)
  }
  const allocsByReceipt = new Map<string, typeof allocs>()
  for (const a of allocs) {
    const list = allocsByReceipt.get(a.receipt_id) ?? []
    list.push(a)
    allocsByReceipt.set(a.receipt_id, list)
  }

  const esc = (v: unknown) => (v ?? "").toString().replace(/,/g, ";")
  const headers = ["Date","Submitted By","Event","Category","Fund","Fund Amount","Allocation Status","Receipt Status","Notes"]
  const rows: string[] = []
  for (const r of receiptRows) {
    const rAllocs = allocsByReceipt.get(r.id) ?? []
    const base = [r.purchase_date, esc(r.submitted_by_name), esc(r.event_name), esc(r.category)]
    if (rAllocs.length === 0) {
      rows.push([...base, "", r.amount, "", r.status, esc(r.notes)].join(","))
    } else {
      for (const a of rAllocs) {
        rows.push([...base, esc(fundNames.get(a.fund_id)), a.amount, a.status, r.status, esc(r.notes)].join(","))
      }
    }
  }

  return { csv: [headers.join(","), ...rows].join("\n"), error: null }
}

export async function getReceiptLimits(ministryId: string): Promise<{ data: ReceiptLimit[]; error: string | null }> {
  // Read gate: caller must belong to this ministry. Empty array on deny.
  const authz = await requireSameMinistry(ministryId)
  if (authz.error !== null) return { data: [], error: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("receipt_limits")
    .select("*")
    .eq("ministry_id", ministryId)
    .order("category")

  return { data: (data as ReceiptLimit[]) ?? [], error: error?.message ?? null }
}

export async function upsertReceiptLimit(params: {
  ministryId: string
  category: string
  fund: string
  maxAmount: number
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!isAdminRole(profile.role)) return { error: "Only admins can manage receipt limits." }
  if (profile.ministry_id !== params.ministryId) return { error: "Ministry mismatch." }

  // Dual-write fund_id alongside the legacy fund string (resolve slug → id).
  const { data: fund } = await supabase
    .from("finance_funds")
    .select("id")
    .eq("ministry_id", params.ministryId)
    .eq("slug", params.fund.toLowerCase())
    .maybeSingle()

  const { error } = await supabase
    .from("receipt_limits")
    .upsert(
      { ministry_id: params.ministryId, category: params.category, fund: params.fund, fund_id: (fund as { id: string } | null)?.id ?? null, max_amount: params.maxAmount },
      { onConflict: "ministry_id,category,fund" }
    )
  return { error: error?.message ?? null }
}

export async function deleteReceiptLimit(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile?.ministry_id) return { error: "No ministry found." }
  if (!isAdminRole(profile.role)) return { error: "Only admins can manage receipt limits." }

  const { error } = await supabase
    .from("receipt_limits")
    .delete()
    .eq("id", id)
    .eq("ministry_id", profile.ministry_id)

  return { error: error?.message ?? null }
}
