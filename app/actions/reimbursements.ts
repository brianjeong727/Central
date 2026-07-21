"use server"

import { createClient } from "@/lib/supabase-server"

export interface BudgetEntry {
  id: string
  ministry_id: string
  entry_date: string
  category: string
  description: string | null
  amount: number
  source: string
  fund: string | null
  receipt_allocation_id: string | null
  reimbursement_form_id: string | null
  created_by: string | null
  created_at: string
}

export async function addBudgetEntry(params: {
  ministryId: string
  category: string
  description: string
  amount: number
  entryDate: string
  fund: string | null
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
      fund: params.fund,
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

  // Resolve fund slug → display name for the Fund column (budget_entries stores
  // the slug, matching ministry_budgets.fund). Legacy rows keep fund null → blank.
  const entries = data as BudgetEntry[]
  const fundSlugs = Array.from(new Set(entries.map(e => e.fund).filter((s): s is string => !!s)))
  const fundNames = new Map<string, string>()
  if (fundSlugs.length > 0) {
    const { data: fundRows } = await supabase
      .from("finance_funds")
      .select("slug, name")
      .eq("ministry_id", ministryId)
      .in("slug", fundSlugs)
    for (const f of (fundRows ?? []) as { slug: string; name: string }[]) fundNames.set(f.slug, f.name)
  }

  const headers = ["Date", "Category", "Fund", "Description", "Amount", "Source"]
  const rows = entries.map(e => [
    e.entry_date, e.category,
    e.fund ? (fundNames.get(e.fund) ?? e.fund) : "",
    (e.description ?? "").replace(/,/g, ";"),
    e.amount, e.source,
  ].join(","))
  return { csv: [headers.join(","), ...rows].join("\n"), error: null }
}
