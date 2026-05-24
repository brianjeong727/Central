"use server"

import { createClient } from "@/lib/supabase-server"

export interface ReimbursementFormItem {
  id?: string
  item_date: string | null
  description: string
  cost: number
  order_index: number
}

export interface ReimbursementForm {
  id: string
  ministry_id: string
  submitted_by: string
  submitted_by_name?: string
  form_date: string
  expense_purpose: string | null
  notes: string | null
  status: string
  approved_by: string | null
  approved_by_name?: string
  approved_at: string | null
  created_at: string
  items: ReimbursementFormItem[]
  linked_receipt_ids: string[]
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

export async function createReimbursementForm(params: {
  ministryId: string
  formDate: string
  expensePurpose: string
  notes: string
  items: Omit<ReimbursementFormItem, "id">[]
  receiptIds: string[]
}): Promise<{ data: ReimbursementForm | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const { data: form, error: formError } = await supabase
    .from("reimbursement_forms")
    .insert({
      ministry_id: params.ministryId,
      submitted_by: user.id,
      form_date: params.formDate,
      expense_purpose: params.expensePurpose || null,
      notes: params.notes || null,
      status: "pending",
    })
    .select()
    .single()

  if (formError || !form) return { data: null, error: formError?.message ?? "Failed to create form" }

  if (params.items.length > 0) {
    await supabase.from("reimbursement_form_items").insert(
      params.items.map((item, i) => ({
        form_id: form.id,
        item_date: item.item_date || null,
        description: item.description,
        cost: item.cost,
        order_index: i,
      }))
    )
  }

  if (params.receiptIds.length > 0) {
    await supabase.from("reimbursement_form_receipts").insert(
      params.receiptIds.map(rid => ({ form_id: form.id, receipt_id: rid }))
    )
  }

  return { data: { ...form as ReimbursementForm, items: params.items as ReimbursementFormItem[], linked_receipt_ids: params.receiptIds }, error: null }
}

export async function updateFormStatus(params: {
  formId: string
  ministryId: string
  status: "approved" | "rejected"
  expensePurpose?: string
  totalAmount?: number
  category?: string
}): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("reimbursement_forms")
    .update({ status: params.status, approved_by: user.id, approved_at: new Date().toISOString() })
    .eq("id", params.formId)

  if (error) return { error: error.message }

  // Auto-create budget entry on approval
  if (params.status === "approved" && params.totalAmount && params.totalAmount > 0) {
    await supabase.from("budget_entries").insert({
      ministry_id: params.ministryId,
      entry_date: new Date().toISOString().split("T")[0],
      category: params.category ?? "other",
      description: params.expensePurpose ?? "Reimbursement",
      amount: params.totalAmount,
      source: "reimbursement",
      reimbursement_form_id: params.formId,
      created_by: user.id,
    })
  }

  return { error: null }
}

export async function getReimbursementForms(
  ministryId: string,
  viewAll: boolean
): Promise<{ data: ReimbursementForm[]; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], error: "Not authenticated" }

  let query = supabase
    .from("reimbursement_forms")
    .select("*, profiles!submitted_by(name), approver:profiles!approved_by(name)")
    .eq("ministry_id", ministryId)
    .order("created_at", { ascending: false })

  if (!viewAll) {
    query = query.eq("submitted_by", user.id)
  }

  const { data: forms, error } = await query
  if (error) return { data: [], error: error.message }

  const formIds = (forms ?? []).map((f: Record<string, unknown>) => f.id as string)
  if (formIds.length === 0) return { data: [], error: null }

  const [{ data: items }, { data: links }] = await Promise.all([
    supabase.from("reimbursement_form_items").select("*").in("form_id", formIds).order("order_index"),
    supabase.from("reimbursement_form_receipts").select("form_id, receipt_id").in("form_id", formIds),
  ])

  return {
    data: (forms ?? []).map((f: Record<string, unknown>) => {
      const profile = f.profiles as { name?: string } | null
      const approver = f.approver as { name?: string } | null
      return {
        ...(f as unknown as ReimbursementForm),
        submitted_by_name: profile?.name,
        approved_by_name: approver?.name,
        items: (items ?? []).filter((i: { form_id: string }) => i.form_id === f.id) as ReimbursementFormItem[],
        linked_receipt_ids: (links ?? []).filter((l: { form_id: string }) => l.form_id === f.id).map((l: { receipt_id: string }) => l.receipt_id),
      }
    }),
    error: null,
  }
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
    e.entry_date,
    e.category,
    (e.description ?? "").replace(/,/g, ";"),
    e.amount,
    e.source,
  ].join(","))

  return { csv: [headers.join(","), ...rows].join("\n"), error: null }
}
