"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"

export interface BudgetAllocation {
  id: string
  ministry_id: string
  fiscal_year: string
  category: string
  fund: string
  allocated_amount: number
  notes: string | null
}

export interface CategoryActual {
  category: string
  total_spent: number
}

function currentFiscalYear(): string {
  const now = new Date()
  const y = now.getFullYear()
  // Academic year: Aug–Jul. Month >= 7 (0-indexed Aug) → current/next year
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

function fiscalYearToDateRange(fiscalYear: string): { start: string; end: string } {
  const [startYear, endYear] = fiscalYear.split("-").map(Number)
  return {
    start: `${startYear}-08-01`,
    end:   `${endYear}-07-31`,
  }
}

export async function getBudgetAllocations(
  ministryId: string,
  fiscalYear: string,
): Promise<{ data: BudgetAllocation[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ministry_budgets")
    .select("*")
    .eq("ministry_id", ministryId)
    .eq("fiscal_year", fiscalYear)
    .order("category")
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as BudgetAllocation[], error: null }
}

export async function upsertBudgetAllocation(params: {
  ministryId: string
  fiscalYear: string
  category: string
  fund: string
  amount: number
  notes?: string
}): Promise<{ error: string | null }> {
  const admin = createAdminClient()

  // Verify caller is authenticated (additional safety layer)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await admin
    .from("ministry_budgets")
    .upsert(
      {
        ministry_id:      params.ministryId,
        fiscal_year:      params.fiscalYear,
        category:         params.category,
        fund:             params.fund,
        allocated_amount: params.amount,
        notes:            params.notes ?? null,
        updated_by:       user.id,
        updated_at:       new Date().toISOString(),
        created_by:       user.id,
      },
      { onConflict: "ministry_id,fiscal_year,category,fund" },
    )
  if (error) return { error: error.message }
  return { error: null }
}

export async function getCategoryActuals(
  ministryId: string,
  fiscalYear: string,
): Promise<{ data: CategoryActual[]; error: string | null }> {
  const supabase = await createClient()
  const { start, end } = fiscalYearToDateRange(fiscalYear)

  const { data, error } = await supabase
    .from("budget_entries")
    .select("category, amount")
    .eq("ministry_id", ministryId)
    .gte("entry_date", start)
    .lte("entry_date", end)

  if (error) return { data: [], error: error.message }

  // Aggregate by category client-side (Supabase JS doesn't expose GROUP BY cleanly)
  const totals = new Map<string, number>()
  for (const row of (data ?? []) as { category: string; amount: number }[]) {
    totals.set(row.category, (totals.get(row.category) ?? 0) + Number(row.amount))
  }

  return {
    data: Array.from(totals.entries()).map(([category, total_spent]) => ({ category, total_spent })),
    error: null,
  }
}

export interface BudgetCategory {
  id: string
  name: string
  created_at: string
}

export async function getBudgetCategories(
  ministryId: string,
): Promise<{ data: BudgetCategory[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("budget_categories")
    .select("id, name, created_at")
    .eq("ministry_id", ministryId)
    .order("created_at", { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as BudgetCategory[], error: null }
}

export async function addBudgetCategory(
  ministryId: string,
  name: string,
  userId: string,
): Promise<{ data: BudgetCategory | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("budget_categories")
    .insert({ ministry_id: ministryId, name: name.trim(), created_by: userId })
    .select("id, name, created_at")
    .single()
  if (error) return { data: null, error: error.message }
  return { data: data as BudgetCategory, error: null }
}

export async function deleteBudgetCategory(
  ministryId: string,
  categoryName: string,
): Promise<{ error: string | null }> {
  const admin = createAdminClient()
  // Delete allocations first (uses admin to bypass RLS on ministry_budgets)
  await admin
    .from("ministry_budgets")
    .delete()
    .eq("ministry_id", ministryId)
    .eq("category", categoryName)
  // Delete the category row (RLS policy allows leader/admin)
  const supabase = await createClient()
  const { error } = await supabase
    .from("budget_categories")
    .delete()
    .eq("ministry_id", ministryId)
    .eq("name", categoryName)
  if (error) return { error: error.message }
  return { error: null }
}

export async function getCategoryBudgetAllocation(
  ministryId: string,
  category: string,
  fiscalYear: string,
): Promise<{ data: { total: number; byFund: Record<string, number> } | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("ministry_budgets")
    .select("fund, allocated_amount")
    .eq("ministry_id", ministryId)
    .eq("fiscal_year", fiscalYear)
    .eq("category", category)

  if (error) return { data: null, error: error.message }
  if (!data?.length) return { data: null, error: null }

  const byFund: Record<string, number> = {}
  let total = 0
  for (const row of data as { fund: string; allocated_amount: number }[]) {
    const amt = Number(row.allocated_amount)
    if (amt > 0) {
      byFund[row.fund] = amt
      total += amt
    }
  }

  if (total === 0) return { data: null, error: null }
  return { data: { total, byFund }, error: null }
}
