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

// Called from publishDGLRotationAction — admin client, no auth check needed
export async function upsertDGDinnerForms(params: {
  ministryId: string
  forms: {
    fridayDate: string
    assignedDglIds: string[]
    treasurerName: string
    expensePurpose: string
  }[]
}): Promise<{ error?: string }> {
  const admin = createAdminClient()

  for (const f of params.forms) {
    const { error } = await admin
      .from("reimbursement_forms")
      .upsert(
        {
          ministry_id: params.ministryId,
          category: "dg_dinner",
          friday_date: f.fridayDate,
          assigned_dgl_ids: f.assignedDglIds,
          treasurer_name: f.treasurerName,
          expense_purpose: f.expensePurpose,
          status: "not_started",
        },
        { onConflict: "ministry_id,friday_date", ignoreDuplicates: false }
      )
    if (error) return { error: error.message }
  }
  return {}
}

export async function getDGDinnerForms(
  ministryId: string
): Promise<{ data: ReimbursementForm[]; error: string | null }> {
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
