"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"

export interface ItemizedExpense {
  date: string | null
  description: string
  cost: number
}

export interface ReimbursementForm {
  id: string
  ministry_id: string
  category: "dg_dinner" | "other"
  friday_date: string | null
  assigned_dgl_ids: string[]
  treasurer_name: string | null
  expense_purpose: string | null
  itemized_expenses: ItemizedExpense[]
  total_amount: number
  notes: string | null
  signature: string | null
  signature_saved: boolean
  status: "not_started" | "in_progress" | "complete"
  dismissal_reason: string | null
  dismissed_at: string | null
  dismissed_by: string | null
  created_at: string
}

export interface BudgetEntry {
  id: string
  ministry_id: string
  entry_date: string
  category: string
  description: string | null
  amount: number
  source: string
  reimbursement_form_id: string | null
  created_by: string | null
  created_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fridayFromSunday(sundayStr: string): string {
  const [y, m, d] = sundayStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 2)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

function formatFridayLabel(fridayDate: string): string {
  const [y, m, d] = fridayDate.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// ── Sync action ───────────────────────────────────────────────────────────────
// Idempotent — safe to call on every page load. Creates missing DG dinner forms
// from published friday_sg assignments. Called from:
//  1. publishDGLRotationAction (on publish)
//  2. getDGDinnerForms (so already-published rotations auto-populate forms)
export async function syncDGDinnerFormsForMinistry(ministryId: string): Promise<{ error?: string }> {
  const admin = createAdminClient()

  // 1. All teams in the ministry
  const { data: teams } = await admin.from("teams").select("id").eq("ministry_id", ministryId)
  const teamIds = (teams ?? []).map((t: { id: string }) => t.id)
  if (teamIds.length === 0) return {}

  // 2. Published friday_sg assignments (any team in this ministry)
  const { data: assignments } = await admin
    .from("dgl_assignments")
    .select("user_id, week_date")
    .in("team_id", teamIds)
    .eq("slot", "friday_sg")
    .eq("published", true)
  if (!assignments?.length) return {}

  // 3. Group by anchor Sunday → list of DGL IDs per week
  const byWeek = new Map<string, string[]>()
  for (const row of assignments as { user_id: string; week_date: string }[]) {
    const list = byWeek.get(row.week_date) ?? []
    list.push(row.user_id)
    byWeek.set(row.week_date, list)
  }

  // 4. Compute actual Friday dates
  const fridayEntries: { fridayDate: string; dglIds: string[] }[] = Array.from(byWeek.entries()).map(
    ([sunday, dglIds]) => ({ fridayDate: fridayFromSunday(sunday), dglIds })
  )

  // 5. Existing DG dinner forms for this ministry
  const { data: existingForms } = await admin
    .from("reimbursement_forms")
    .select("id, friday_date, status")
    .eq("ministry_id", ministryId)
    .eq("category", "dg_dinner")
  const existingByDate = new Map<string, { id: string; status: string }>()
  for (const f of (existingForms ?? []) as { id: string; friday_date: string; status: string }[]) {
    if (f.friday_date) existingByDate.set(f.friday_date, { id: f.id, status: f.status })
  }

  // 6. Treasurer name (first person in any ministry team with can_view_finances)
  let treasurerName = "Treasurer"
  const { data: memberRows } = await admin
    .from("team_members")
    .select("user_id, team_roles!role_id(permissions)")
    .in("team_id", teamIds)
  let treasurerId: string | null = null
  for (const row of (memberRows ?? []) as { user_id: string; team_roles: { permissions?: string[] } | null }[]) {
    if ((row.team_roles?.permissions ?? []).includes("can_view_finances")) {
      treasurerId = row.user_id; break
    }
  }
  if (treasurerId) {
    const { data: profile } = await admin.from("profiles").select("name").eq("id", treasurerId).single()
    treasurerName = (profile as { name?: string } | null)?.name ?? "Treasurer"
  }

  // 7. Insert missing forms; update dgl pair on not_started forms if rotation changed
  for (const { fridayDate, dglIds } of fridayEntries) {
    const expensePurpose = `DG Dinner – ${formatFridayLabel(fridayDate)}`
    const existing = existingByDate.get(fridayDate)
    if (!existing) {
      await admin.from("reimbursement_forms").insert({
        ministry_id: ministryId, category: "dg_dinner", friday_date: fridayDate,
        assigned_dgl_ids: dglIds, treasurer_name: treasurerName,
        expense_purpose: expensePurpose, status: "not_started",
      })
    } else if (existing.status === "not_started") {
      await admin.from("reimbursement_forms")
        .update({ assigned_dgl_ids: dglIds, treasurer_name: treasurerName })
        .eq("id", existing.id)
    }
  }
  return {}
}

export async function getDGDinnerForms(
  ministryId: string
): Promise<{ data: ReimbursementForm[]; error: string | null }> {
  // Sync first — idempotent, creates any missing forms from published rotation
  await syncDGDinnerFormsForMinistry(ministryId)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reimbursement_forms")
    .select("*")
    .eq("ministry_id", ministryId)
    .eq("category", "dg_dinner")
    .order("friday_date", { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as ReimbursementForm[], error: null }
}

export async function getOtherForms(
  ministryId: string
): Promise<{ data: ReimbursementForm[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reimbursement_forms")
    .select("*")
    .eq("ministry_id", ministryId)
    .eq("category", "other")
    .order("created_at", { ascending: false })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as ReimbursementForm[], error: null }
}

export async function createOtherForm(params: {
  ministryId: string
  expensePurpose: string
}): Promise<{ data: ReimbursementForm | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single()

  const { data, error } = await supabase
    .from("reimbursement_forms")
    .insert({
      ministry_id: params.ministryId,
      category: "other",
      treasurer_name: profile?.name ?? null,
      expense_purpose: params.expensePurpose || null,
      status: "not_started",
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as ReimbursementForm, error: null }
}

export async function saveFormDraft(params: {
  formId: string
  expensePurpose: string
  itemizedExpenses: ItemizedExpense[]
  totalAmount: number
  notes: string
  signature: string
  signatureSaved: boolean
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const updates: Record<string, unknown> = {
    expense_purpose: params.expensePurpose || null,
    itemized_expenses: params.itemizedExpenses,
    total_amount: params.totalAmount,
    notes: params.notes || null,
    signature: params.signature || null,
    signature_saved: params.signatureSaved,
    status: "in_progress",
  }

  const { error } = await supabase
    .from("reimbursement_forms")
    .update(updates)
    .eq("id", params.formId)

  if (error) return { error: error.message }

  if (params.signatureSaved && params.signature) {
    await supabase
      .from("profiles")
      .update({ saved_signature: params.signature })
      .eq("id", user.id)
  }

  return { error: null }
}

export async function submitReimbursementForm(params: {
  formId: string
  ministryId: string
  expensePurpose: string
  itemizedExpenses: ItemizedExpense[]
  totalAmount: number
  notes: string
  signature: string
  signatureSaved: boolean
  category: string
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("reimbursement_forms")
    .update({
      expense_purpose: params.expensePurpose || null,
      itemized_expenses: params.itemizedExpenses,
      total_amount: params.totalAmount,
      notes: params.notes || null,
      signature: params.signature || null,
      signature_saved: params.signatureSaved,
      status: "complete",
    })
    .eq("id", params.formId)

  if (error) return { error: error.message }

  if (params.signatureSaved && params.signature) {
    await supabase
      .from("profiles")
      .update({ saved_signature: params.signature })
      .eq("id", user.id)
  }

  // Auto-log to budget entries when form is submitted
  if (params.totalAmount > 0) {
    await supabase.from("budget_entries").insert({
      ministry_id: params.ministryId,
      entry_date: new Date().toISOString().split("T")[0],
      category: params.category === "dg_dinner" ? "dg_dinner" : "other",
      description: params.expensePurpose || "Reimbursement",
      amount: params.totalAmount,
      source: "reimbursement",
      reimbursement_form_id: params.formId,
      created_by: user.id,
    })
  }

  return { error: null }
}

export async function dismissForm(params: {
  formId: string
  reason: string
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("reimbursement_forms")
    .update({
      dismissal_reason: params.reason,
      dismissed_at: new Date().toISOString(),
      dismissed_by: user.id,
    })
    .eq("id", params.formId)

  return { error: error?.message ?? null }
}

export async function undismissForm(formId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("reimbursement_forms")
    .update({ dismissal_reason: null, dismissed_at: null, dismissed_by: null })
    .eq("id", formId)
  return { error: error?.message ?? null }
}

export async function submitReceiptForForm(params: {
  ministryId: string
  formId: string
  receiptImageUrl: string | null
  amount: number
}): Promise<{ data: { id: string; receipt_image_url: string | null; amount: number; submitted_by_name: string | null; submitted_at: string } | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single()

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("receipts")
    .insert({
      ministry_id: params.ministryId,
      submitted_by: user.id,
      submitted_by_name: profile?.name ?? null,
      reimbursement_form_id: params.formId,
      category: "dg_dinner",
      fund: "church",
      amount: params.amount,
      purchase_date: new Date().toISOString().split("T")[0],
      receipt_image_url: params.receiptImageUrl,
      status: "pending",
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return {
    data: {
      id: (data as Record<string, unknown>).id as string,
      receipt_image_url: params.receiptImageUrl,
      amount: params.amount,
      submitted_by_name: profile?.name ?? null,
      submitted_at: now,
    },
    error: null,
  }
}

export async function getReceiptForForm(
  formId: string
): Promise<{ data: { id: string; receipt_image_url: string | null; amount: number; submitted_by_name: string | null; submitted_at: string } | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("receipts")
    .select("id, receipt_image_url, amount, submitted_by_name, submitted_at")
    .eq("reimbursement_form_id", formId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data as { id: string; receipt_image_url: string | null; amount: number; submitted_by_name: string | null; submitted_at: string } | null, error: null }
}

export async function getUserSavedSignature(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from("profiles")
    .select("saved_signature")
    .eq("id", user.id)
    .single()
  return (data as { saved_signature?: string | null } | null)?.saved_signature ?? null
}

export async function addBudgetEntry(params: {
  ministryId: string
  category: string
  description: string
  amount: number
  entryDate: string
}): Promise<{ data: BudgetEntry | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const { data, error } = await supabase
    .from("budget_entries")
    .insert({
      ministry_id: params.ministryId,
      entry_date: params.entryDate,
      category: params.category,
      description: params.description || null,
      amount: params.amount,
      source: "manual",
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as BudgetEntry, error: null }
}

export async function getBudgetEntries(ministryId: string): Promise<{ data: BudgetEntry[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("budget_entries")
    .select("*")
    .eq("ministry_id", ministryId)
    .order("entry_date", { ascending: false })
  return { data: (data as BudgetEntry[]) ?? [], error: error?.message ?? null }
}

export async function exportBudgetCSV(ministryId: string): Promise<{ csv: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("budget_entries")
    .select("*")
    .eq("ministry_id", ministryId)
    .order("entry_date", { ascending: false })
  if (error) return { csv: null, error: error.message }
  if (!data?.length) return { csv: "", error: null }
  const headers = ["Date", "Category", "Description", "Amount", "Source"]
  const rows = (data as BudgetEntry[]).map(e => [
    e.entry_date, e.category,
    (e.description ?? "").replace(/,/g, ";"),
    e.amount, e.source,
  ].join(","))
  return { csv: [headers.join(","), ...rows].join("\n"), error: null }
}
