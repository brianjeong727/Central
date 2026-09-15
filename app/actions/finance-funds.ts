"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { computeFinanceCapability } from "./finance-auth"
// Type-only: erased at compile time, so the browser Supabase client that
// lib/audit.ts constructs never reaches this server module.
import type { AuditChange } from "@/lib/audit"

// ─── Per-ministry configurable fund list ─────────────────────────────────────
// Replaces the hardcoded church/cmu/pitt array. A fund is a funding source a
// reimbursement can be split across: `church` (internal — president sign-off) or
// `external` (a university grant — the grant body is the approver). Reads are
// ministry-member scoped (the submit modal needs them); writes are gated on the
// finance-capability approve check via the service-role admin client, mirroring
// receipts.ts's authorize pattern (a non-admin treasurer can't write under RLS).

export type FundKind = "church" | "external"

export interface FinanceFund {
  id: string
  ministry_id: string
  name: string
  slug: string
  kind: FundKind
  order_index: number
  is_active: boolean
}

const FUND_SELECT = "id, ministry_id, name, slug, kind, order_index, is_active"

// Any ministry member may read the fund list (RLS finance_funds_select = ministry
// member). Default returns only active funds ordered by order_index.
export async function getFinanceFunds(
  ministryId: string,
  opts?: { includeInactive?: boolean },
): Promise<{ data: FinanceFund[]; error: string | null }> {
  const supabase = await createClient()
  let query = supabase
    .from("finance_funds")
    .select(FUND_SELECT)
    .eq("ministry_id", ministryId)
    .order("order_index", { ascending: true })
  if (!opts?.includeInactive) query = query.eq("is_active", true)
  const { data, error } = await query
  return { data: (data as FinanceFund[]) ?? [], error: error?.message ?? null }
}

// Shared write gate: re-verify caller identity + finance approve capability
// server-side, return the admin client. Mirrors receipts.ts authorizeFinanceAction.
async function authorizeFundWrite(
  ministryId: string,
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
  if (!cap.canApprove) return { error: "Not authorized" }
  return { uid: user.id, admin }
}

function kebab(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "fund"
}

export async function createFinanceFund(params: {
  ministryId: string
  name: string
  kind: FundKind
}): Promise<{ data: FinanceFund | null; error: string | null }> {
  const auth = await authorizeFundWrite(params.ministryId)
  if ("error" in auth) return { data: null, error: auth.error }
  const { admin, uid } = auth

  const name = params.name.trim()
  if (!name) return { data: null, error: "Please enter a fund name." }
  const kind: FundKind = params.kind === "church" ? "church" : "external"

  // Resolve a slug that is unique per ministry (UNIQUE(ministry_id, slug)).
  const base = kebab(name)
  const { data: existing } = await admin
    .from("finance_funds")
    .select("slug, order_index")
    .eq("ministry_id", params.ministryId)
  const usedSlugs = new Set((existing ?? []).map((f: { slug: string }) => f.slug))
  let slug = base
  let n = 2
  while (usedSlugs.has(slug)) { slug = `${base}-${n}`; n++ }

  const maxOrder = (existing ?? []).reduce(
    (m: number, f: { order_index: number }) => Math.max(m, f.order_index ?? 0), -1)

  const { data, error } = await admin
    .from("finance_funds")
    .insert({
      ministry_id: params.ministryId,
      name,
      slug,
      kind,
      order_index: maxOrder + 1,
      is_active: true,
      created_by: uid,
    })
    .select(FUND_SELECT)
    .single()
  if (error) return { data: null, error: error.message }
  return { data: data as FinanceFund, error: null }
}

export async function updateFinanceFund(params: {
  id: string
  ministryId: string
  name?: string
  kind?: FundKind
  orderIndex?: number
  isActive?: boolean
}): Promise<{ error: string | null }> {
  const auth = await authorizeFundWrite(params.ministryId)
  if ("error" in auth) return { error: auth.error }
  const { admin } = auth

  // Never change `slug` (stable key referenced by dual-written fund strings).
  const patch: Record<string, unknown> = {}
  if (params.name !== undefined) {
    const nm = params.name.trim()
    if (!nm) return { error: "Fund name can't be empty." }
    patch.name = nm
  }
  if (params.kind !== undefined) patch.kind = params.kind === "church" ? "church" : "external"
  if (params.orderIndex !== undefined) patch.order_index = params.orderIndex
  if (params.isActive !== undefined) patch.is_active = params.isActive
  if (Object.keys(patch).length === 0) return { error: null }

  const { error } = await admin
    .from("finance_funds")
    .update(patch)
    .eq("id", params.id)
    .eq("ministry_id", params.ministryId)
  return { error: error?.message ?? null }
}

/**
 * Record one Funds settings commit in the audit log.
 *
 * Funds is the ONE audited settings section whose write is not admin-gated:
 * `authorizeFundWrite` admits any finance-capable member, while the `audit_logs`
 * INSERT policy is leader-tier. So the browser-side audit insert was refused for
 * exactly the callers who were allowed to make the change — a real, permitted
 * settings change with no record and no error. The row is written here instead,
 * on the service-role client, behind the SAME gate that authorizes the fund
 * writes themselves, with the actor read from the caller's own profile (never
 * from the client). Called once per Save with the whole diff, so the log still
 * reads one row per commit like every other section.
 */
export async function logFundsAudit(params: {
  ministryId: string
  changes: AuditChange[]
}): Promise<{ error: string | null }> {
  if (params.changes.length === 0) return { error: null }
  const auth = await authorizeFundWrite(params.ministryId)
  if ("error" in auth) return { error: auth.error }
  const { admin, uid } = auth

  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", uid)
    .eq("ministry_id", params.ministryId)
    .maybeSingle()

  const { error } = await admin.from("audit_logs").insert({
    ministry_id: params.ministryId,
    actor_id: uid,
    actor_name: (profile?.name as string | undefined) ?? "Unknown",
    action: "settings.funds_edit",
    entity_type: "ministry",
    entity_id: params.ministryId,
    entity_label: "Funds",
    metadata: { changes: params.changes },
  })
  if (error) console.warn(`[audit] settings.funds_edit was not recorded: ${error.message}`)
  return { error: error?.message ?? null }
}

// SOFT delete only — funds in use are FK-referenced by allocations and must never
// vanish. Archive = is_active=false so it drops out of pickers but history holds.
export async function removeFinanceFund(params: {
  id: string
  ministryId: string
}): Promise<{ error: string | null }> {
  const auth = await authorizeFundWrite(params.ministryId)
  if ("error" in auth) return { error: auth.error }
  const { admin } = auth

  const { error } = await admin
    .from("finance_funds")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("ministry_id", params.ministryId)
  return { error: error?.message ?? null }
}
