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
