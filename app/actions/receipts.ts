"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"

export interface ReceiptLimit {
  id: string
  ministry_id: string
  category: string
  fund: string
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
  notes: string | null
  status: string
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
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
  notes: string
}): Promise<{ data: Receipt | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).single()

  const { data, error } = await supabase
    .from("receipts")
    .insert({
      ministry_id: params.ministryId,
      team_id: params.teamId ?? null,
      category_id: params.categoryId ?? null,
      submitted_by: user.id,
      submitted_by_name: (profile as { name?: string } | null)?.name ?? null,
      event_name: params.eventName || null,
      category: params.category,
      fund: params.fund,
      amount: params.amount,
      purchase_date: params.purchaseDate,
      receipt_image_url: params.receiptImageUrl,
      notes: params.notes || null,
      status: "pending",
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as Receipt, error: null }
}

export async function updateReceiptStatus(params: {
  receiptId: string
  status: string
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("receipts")
    .update({ status: params.status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", params.receiptId)

  return { error: error?.message ?? null }
}

// ── Reimbursement approval inbox + two-step (treasurer → president) workflow ──────
// Status chain: pending → approved (treasurer) → reimbursed (president sign-off),
// with rejected (treasurer) and declined (president) as terminal off-ramps.

const ADMIN_TIER = ["admin", "deacon", "elder", "pastor"]

interface FinanceCapability {
  canApprove: boolean
  canSignOff: boolean
}

// canApprove = member of a team_type='finance' team whose role permissions include
// `can_view_finances`, OR admin-tier (fallback so it's testable before a Finance
// team exists). canSignOff = `is_president` on a finance team, OR admin-tier.
async function computeFinanceCapability(
  admin: ReturnType<typeof createAdminClient>,
  ministryId: string,
  userId: string,
  role: string,
): Promise<FinanceCapability> {
  if (ADMIN_TIER.includes((role ?? "").toLowerCase())) {
    return { canApprove: true, canSignOff: true }
  }

  let canApprove = false
  let canSignOff = false

  const { data: financeTeams } = await admin
    .from("teams")
    .select("id")
    .eq("ministry_id", ministryId)
    .eq("team_type", "finance")
  const financeTeamIds = (financeTeams ?? []).map((t: { id: string }) => t.id)

  if (financeTeamIds.length > 0) {
    const { data: memberRows } = await admin
      .from("team_members")
      .select("team_id, team_roles!role_id(permissions, is_president)")
      .in("team_id", financeTeamIds)
      .eq("user_id", userId)
    for (const row of (memberRows ?? []) as { team_roles: { permissions?: string[]; is_president?: boolean } | null }[]) {
      if ((row.team_roles?.permissions ?? []).includes("can_view_finances")) canApprove = true
      if (row.team_roles?.is_president) canSignOff = true
    }
  }

  return { canApprove, canSignOff }
}

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
  event_name: string | null
  notes: string | null
  status: string
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  signed_off_by: string | null
  signed_off_at: string | null
  decision_reason: string | null
}

// The one processing surface for the two-step workflow. Returns ALL of the
// ministry's standalone submitted receipts (every status; the legacy DG-dinner
// form-linked receipts keep their own flow and are excluded), newest first,
// joined with team + category names. No leak: a caller with neither finance
// capability gets an empty list.
export async function getReimbursementInbox(
  ministryId: string
): Promise<{ items: InboxReceipt[]; canApprove: boolean; canSignOff: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { items: [], canApprove: false, canSignOff: false }

  const { data: profile } = await supabase
    .from("profiles")
    .select("ministry_id, role")
    .eq("id", user.id)
    .maybeSingle()
  if (!profile?.ministry_id || profile.ministry_id !== ministryId) {
    return { items: [], canApprove: false, canSignOff: false }
  }

  const admin = createAdminClient()
  const { canApprove, canSignOff } = await computeFinanceCapability(admin, ministryId, user.id, profile.role ?? "")

  if (!canApprove && !canSignOff) {
    return { items: [], canApprove: false, canSignOff: false }
  }

  const { data, error } = await admin
    .from("receipts")
    .select("id, submitted_by, submitted_by_name, team_id, category_id, amount, category, fund, purchase_date, receipt_image_url, event_name, notes, status, submitted_at, reviewed_by, reviewed_at, signed_off_by, signed_off_at, decision_reason")
    .eq("ministry_id", ministryId)
    .is("reimbursement_form_id", null)
    .order("submitted_at", { ascending: false })
  if (error) return { items: [], canApprove, canSignOff }

  const rows = (data ?? []) as Omit<InboxReceipt, "team_name" | "category_name">[]

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

  return {
    items: rows.map(r => ({
      ...r,
      team_name: r.team_id ? teamNames.get(r.team_id) ?? null : null,
      category_name: r.category_id ? categoryNames.get(r.category_id) ?? null : null,
    })),
    canApprove,
    canSignOff,
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

// Treasurer: pending → approved.
export async function approveReceipt(receiptId: string, ministryId: string): Promise<{ error: string | null }> {
  const auth = await authorizeFinanceAction(ministryId, "approve")
  if ("error" in auth) return { error: auth.error }
  const { data, error } = await auth.admin
    .from("receipts")
    .update({ status: "approved", reviewed_by: auth.uid, reviewed_at: new Date().toISOString() })
    .eq("id", receiptId)
    .eq("ministry_id", ministryId)
    .eq("status", "pending")
    .select("id")
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: "This receipt is no longer pending." }
  return { error: null }
}

// Treasurer: pending → rejected (terminal).
export async function rejectReceipt(receiptId: string, ministryId: string, reason?: string): Promise<{ error: string | null }> {
  const auth = await authorizeFinanceAction(ministryId, "approve")
  if ("error" in auth) return { error: auth.error }
  const { data, error } = await auth.admin
    .from("receipts")
    .update({ status: "rejected", reviewed_by: auth.uid, reviewed_at: new Date().toISOString(), decision_reason: reason?.trim() || null })
    .eq("id", receiptId)
    .eq("ministry_id", ministryId)
    .eq("status", "pending")
    .select("id")
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: "This receipt is no longer pending." }
  return { error: null }
}

// President: approved → reimbursed (sign-off).
export async function signOffReceipt(receiptId: string, ministryId: string): Promise<{ error: string | null }> {
  const auth = await authorizeFinanceAction(ministryId, "signoff")
  if ("error" in auth) return { error: auth.error }
  const { data, error } = await auth.admin
    .from("receipts")
    .update({ status: "reimbursed", signed_off_by: auth.uid, signed_off_at: new Date().toISOString() })
    .eq("id", receiptId)
    .eq("ministry_id", ministryId)
    .eq("status", "approved")
    .select("id")
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: "This receipt is not awaiting sign-off." }
  return { error: null }
}

// President: approved → declined (terminal).
export async function declineReceipt(receiptId: string, ministryId: string, reason?: string): Promise<{ error: string | null }> {
  const auth = await authorizeFinanceAction(ministryId, "signoff")
  if ("error" in auth) return { error: auth.error }
  const { data, error } = await auth.admin
    .from("receipts")
    .update({ status: "declined", signed_off_by: auth.uid, signed_off_at: new Date().toISOString(), decision_reason: reason?.trim() || null })
    .eq("id", receiptId)
    .eq("ministry_id", ministryId)
    .eq("status", "approved")
    .select("id")
  if (error) return { error: error.message }
  if (!data || data.length === 0) return { error: "This receipt is not awaiting sign-off." }
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
  let canViewFinances = ["admin", "deacon", "elder", "pastor"].includes((profile.role ?? "").toLowerCase())

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

export async function exportReceiptsCSV(ministryId: string): Promise<{ csv: string | null; error: string | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("receipts")
    .select("*, profiles!submitted_by(name)")
    .eq("ministry_id", ministryId)
    .order("submitted_at", { ascending: false })

  if (error) return { csv: null, error: error.message }
  if (!data?.length) return { csv: "", error: null }

  const headers = ["Date","Submitted By","Event","Category","Fund","Amount","Status","Notes","Receipt URL"]
  const rows = data.map((r: Record<string, unknown>) => {
    const profile = r.profiles as { name?: string } | null
    return [
      r.purchase_date,
      profile?.name ?? "",
      r.event_name ?? "",
      r.category,
      r.fund,
      r.amount,
      r.status,
      (r.notes ?? "").toString().replace(/,/g, ";"),
      r.receipt_image_url ?? "",
    ].join(",")
  })

  return { csv: [headers.join(","), ...rows].join("\n"), error: null }
}

export async function getReceiptLimits(ministryId: string): Promise<{ data: ReceiptLimit[]; error: string | null }> {
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
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { error: "Only admins can manage receipt limits." }
  if (profile.ministry_id !== params.ministryId) return { error: "Ministry mismatch." }

  const { error } = await supabase
    .from("receipt_limits")
    .upsert(
      { ministry_id: params.ministryId, category: params.category, fund: params.fund, max_amount: params.maxAmount },
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
  if (!["admin", "deacon", "elder", "pastor"].includes(profile.role.toLowerCase())) return { error: "Only admins can manage receipt limits." }

  const { error } = await supabase
    .from("receipt_limits")
    .delete()
    .eq("id", id)
    .eq("ministry_id", profile.ministry_id)

  return { error: error?.message ?? null }
}
