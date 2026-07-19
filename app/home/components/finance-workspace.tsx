"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import useSWR from "swr"
import { createClient } from "@/lib/supabase"
import {
  Plus, X,
  Upload, Download, DollarSign, AlertTriangle,
  ImageIcon, Inbox,
} from "lucide-react"
import { Spinner, EYEBROW_STYLE, EmptyState } from "./shared"
import { useIsMobile } from "../use-is-mobile"
import { MonogramChip, FilterDropdown, SubpageShell, CentralModal, PocketRowCard, PocketRow, useScrollResetOn } from "@/components/central"
import {
  submitReceipt, getReceiptLimits,
  getReimbursementInbox,
  approveAllocation, requestAllocation, rejectAllocation,
  signOffAllocation, declineAllocation,
  confirmExternalReimbursed, declineExternalAllocation,
  setReceiptAllocations,
  type InboxReceipt, type ReceiptAllocation,
} from "@/app/actions/receipts"
import { getFinanceFunds, type FinanceFund } from "@/app/actions/finance-funds"
import {
  addBudgetEntry, getBudgetEntries, exportBudgetCSV,
} from "@/app/actions/reimbursements"
import {
  getBudgetAllocations, getCategoryActuals, upsertBudgetAllocation,
  getBudgetCategories, addBudgetCategory, deleteBudgetCategory,
  type BudgetAllocation, type CategoryActual,
} from "@/app/actions/budget-planning"

function currentFiscalYear(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}
import type { Receipt as ReceiptType, ReceiptLimit } from "@/app/actions/receipts"
import type { BudgetEntry } from "@/app/actions/reimbursements"

export type FinanceSection = "reimbursements" | "budget" | "allocation"

interface DynamicCategory {
  value: string
  label: string
  isPermanent: boolean
}

// DG Dinner is the only hardcoded permanent category; all others come from calendar events + custom DB entries
const DG_DINNER_CATEGORY: DynamicCategory = { value: "DG Dinner", label: "DG Dinner", isPermanent: true }

// Status-layer tints — derived from Central's semantic accents via the R10 formula
// (bg = accent 13% on cream, text = accent 65% on ink), never invented traffic-light hexes.
const WARN_BG = "color-mix(in srgb, var(--gold) 13%, var(--cream))"
const WARN_TEXT = "color-mix(in srgb, var(--gold) 65%, var(--ink))"
const WARN_BORDER = "color-mix(in srgb, var(--gold) 30%, var(--cream))"
const DANGER_TINT_BG = "color-mix(in srgb, var(--danger) 13%, var(--cream))"
const DANGER_TINT_BORDER = "color-mix(in srgb, var(--danger) 30%, var(--cream))"
const DANGER_ROW_BG = "var(--cream)"
const DELETE_CONFIRM_BG = "color-mix(in srgb, var(--danger) 8%, transparent)"
const BUDGET_GREEN = "color-mix(in srgb, var(--success) 65%, var(--ink))"
// Reimbursed is a terminal SUCCESS status, not selection/identity — same success-family
// formula as `approved` (R10: bg = accent 13% on cream, text = accent 65% on ink).
const SUCCESS_STATUS_BG = "color-mix(in srgb, var(--success) 13%, var(--cream))"
const SUCCESS_STATUS_TEXT = "color-mix(in srgb, var(--success) 65%, var(--ink))"
// Plum-tint remains the identity/source marker for reimbursement-sourced budget entries.
const REIMBURSED_TINT = "var(--plum-tint)"

export const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending:    { label: "Pending",    bg: "var(--ivory)",  text: "var(--body)" },
  approved:   { label: "Approved",  bg: SUCCESS_STATUS_BG, text: SUCCESS_STATUS_TEXT },
  // In-flight external grant application — gold/warn family (distinct from the
  // success-family approved/reimbursed).
  requested:  { label: "Requested", bg: WARN_BG,         text: WARN_TEXT },
  rejected:   { label: "Rejected",  bg: "color-mix(in srgb, var(--danger) 8%, transparent)", text: "var(--danger)" },
  declined:   { label: "Declined",  bg: "color-mix(in srgb, var(--danger) 8%, transparent)", text: "var(--danger)" },
  reimbursed: { label: "Reimbursed",bg: SUCCESS_STATUS_BG, text: SUCCESS_STATUS_TEXT },
  // Rollup: some sources reimbursed, others terminal — neutral ivory.
  partial:    { label: "Partial",   bg: "var(--ivory)",  text: "var(--body)" },
  flagged:    { label: "Flagged",   bg: WARN_BG,         text: WARN_TEXT },
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid var(--line)",
  borderRadius: "var(--r-input)", fontSize: 13, color: "var(--ink)", background: "var(--cream)",
  outline: "none", boxSizing: "border-box",
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 400, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 5, display: "block",
}

// Fallback category list when the modal is opened outside FinanceWorkspace
// (e.g. a team member submitting a receipt from the Plan tab) and the dynamic
// budget categories aren't available. The treasurer can recategorize in their queue.
const DEFAULT_RECEIPT_CATEGORIES: DynamicCategory[] = [
  { value: "other", label: "Other", isPermanent: true },
  DG_DINNER_CATEGORY,
]

export function SubmitReceiptModal({
  ministryId, limits: limitsProp, categories: categoriesProp, funds: fundsProp, teamId,
  categoryId, categoryName, categoryFund, onClose, onSubmitted,
}: {
  ministryId: string; limits?: ReceiptLimit[];
  categories?: DynamicCategory[];
  funds?: FinanceFund[];
  teamId?: string | null;
  // Category mode: when categoryId is provided the category + fund pickers are
  // hidden and the receipt is filed under the given category (with its inherited
  // fund). Used by the Receipts workspace, where the active category is fixed.
  categoryId?: string;
  categoryName?: string;
  categoryFund?: string;
  onClose: () => void; onSubmitted: (r: ReceiptType) => void
}) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const categoryMode = !!categoryId
  // When not supplied (called outside FinanceWorkspace), self-fetch limits + funds
  // and fall back to a default category list.
  const [fetchedLimits, setFetchedLimits] = useState<ReceiptLimit[]>([])
  const [fetchedFunds, setFetchedFunds] = useState<FinanceFund[]>([])
  const limits = limitsProp ?? fetchedLimits
  const funds = fundsProp ?? fetchedFunds
  const categories = categoriesProp ?? DEFAULT_RECEIPT_CATEGORIES
  useEffect(() => {
    if (limitsProp) return
    let active = true
    getReceiptLimits(ministryId).then(res => { if (active) setFetchedLimits(res.data) })
    return () => { active = false }
  }, [limitsProp, ministryId])
  useEffect(() => {
    if (fundsProp) return
    let active = true
    getFinanceFunds(ministryId).then(res => { if (active) setFetchedFunds(res.data) })
    return () => { active = false }
  }, [fundsProp, ministryId])
  const [category, setCategory] = useState(() => categoryName ?? categories[0]?.value ?? "DG Dinner")
  const [fund, setFund] = useState(categoryFund ?? "church")
  // Once funds load, snap the fund selection to a real active fund if the current
  // one isn't in the list (and no category-fixed fund was supplied).
  useEffect(() => {
    if (categoryMode || funds.length === 0) return
    setFund(prev => (funds.some(f => f.slug === prev) ? prev : funds[0].slug))
  }, [funds, categoryMode])
  const [amount, setAmount] = useState("")
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0])
  const [eventName, setEventName] = useState("")
  const [notes, setNotes] = useState("")
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numAmount = parseFloat(amount) || 0
  const limit = limits.find(l => l.category === category && l.fund === fund)
  const overLimit = limit && numAmount > 0 && numAmount > limit.max_amount
  const fundLabelFor = (slug: string) => funds.find(f => f.slug === slug)?.name ?? slug

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); if (!files.length) return
    setUploading(true)
    for (const file of files) {
      let uploadFile: File | Blob = file
      let uploadName = file.name
      // HEIC/HEIF won't render in <img> — convert to JPEG client-side before upload.
      const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
      if (isHeic) {
        try {
          const heic2any = (await import("heic2any")).default
          const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 })
          uploadFile = Array.isArray(converted) ? converted[0] : converted
          uploadName = file.name.replace(/\.(heic|heif)$/i, ".jpg")
        } catch { /* fall back to the original file */ }
      }
      const ext = uploadName.split(".").pop() ?? "jpg"
      const path = `receipts/${ministryId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await supabase.storage.from("announcement-images").upload(path, uploadFile, { upsert: false })
      if (!error && data) {
        const { data: { publicUrl } } = supabase.storage.from("announcement-images").getPublicUrl(data.path)
        setImageUrls(prev => [...prev, publicUrl])
      }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleSubmit() {
    if (!amount || numAmount <= 0) { setError("Please enter a valid amount."); return }
    setSubmitting(true); setError(null)
    const { data, error: err } = await submitReceipt({ ministryId, teamId: teamId ?? null, categoryId: categoryId ?? null, eventName, category: categoryMode ? (categoryName ?? category) : category, fund: categoryMode ? (categoryFund ?? fund) : fund, amount: numAmount, purchaseDate, receiptImageUrl: imageUrls[0] ?? null, receiptImageUrls: imageUrls, notes })
    if (err) { setError(err); setSubmitting(false); return }
    if (data) onSubmitted(data)
    onClose()
  }

  // CentralModal shell (§4.17): bottom sheet on mobile, centered panel on desktop.
  return (
    <CentralModal onClose={onClose} title="Submit a receipt" maxWidth={480} sheet
      footer={
        <button onClick={handleSubmit} disabled={submitting || !amount} style={{ width: "100%", height: 46, background: "var(--plum)", color: "var(--cream)", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 500, cursor: "pointer", opacity: submitting || !amount ? 0.6 : 1 }}>
          {submitting ? "Submitting…" : "Submit receipt"}
        </button>
      }
    >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {categoryMode ? (
            <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
              {categoryName} · {fundLabelFor(categoryFund ?? "")}
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={labelStyle}>Category</label><select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>{categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              <div><label style={labelStyle}>Suggested fund</label><select value={fund} onChange={e => setFund(e.target.value)} style={inputStyle}>{funds.map(f => <option key={f.id} value={f.slug}>{f.name}</option>)}</select></div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Amount ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Purchase date</label><input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={inputStyle} /></div>
          </div>
          {overLimit && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: WARN_BG, border: `1px solid ${WARN_BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
              <AlertTriangle size={14} color={WARN_TEXT} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, color: WARN_TEXT, lineHeight: 1.5 }}>This exceeds the ${limit!.max_amount} limit for {categories.find(c => c.value === category)?.label ?? category}. You can still submit.</p>
            </div>
          )}
          <div><label style={labelStyle}>Event name (optional)</label><input type="text" placeholder="e.g. Week 3 DG Dinner" value={eventName} onChange={e => setEventName(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Notes (optional)</label><textarea placeholder="What was purchased?" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} /></div>
          <div>
            <label style={labelStyle}>Receipt images (optional)</label>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif,application/pdf" multiple className="hidden" onChange={handleFileUpload} />
            {imageUrls.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {imageUrls.map((url, i) => (
                  <div key={url} style={{ position: "relative", width: 64, height: 64, borderRadius: 10, overflow: "hidden", border: "1px solid var(--line)" }}>
                    <img src={url} alt={`Receipt ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      onClick={() => setImageUrls(prev => prev.filter(u => u !== url))}
                      style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 999, background: "var(--veil)", border: "none", color: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
                      aria-label="Remove image"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", border: "1px dashed var(--dashed)", borderRadius: 10, background: "transparent", color: "var(--body)", fontSize: 13, cursor: "pointer", width: "100%" }}>
              <Upload size={14} />{uploading ? "Uploading…" : imageUrls.length > 0 ? "Add another image" : "Upload images"}
            </button>
          </div>
          {error && <p style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>}
        </div>
    </CentralModal>
  )
}

// ── Reimbursement inbox ──────────────────────────────────────────────────────────
// The one processing surface for the two-step treasurer → president workflow:
//   pending → approved (treasurer) → reimbursed (president), with rejected /
//   declined as terminal off-ramps. A Needs-action / All toggle over one
//   chronological list of compact one-line rows; clicking a row opens an immersive
//   detail with role-gated actions. Under gov-view (readOnly) the list renders but
//   no action buttons show.

const FUND_LABELS: Record<string, string> = { church: "Church", cmu: "CMU", pitt: "Pitt", other: "Other" }
function fundLabel(f?: string) { return f ? (FUND_LABELS[f.toLowerCase()] ?? f) : "" }

// Does this allocation need the current caller's action, given their capability?
//   canApprove → church-pending / external-pending / external-requested
//   canSignOff → church-approved
function allocNeedsAction(a: ReceiptAllocation, canApprove: boolean, canSignOff: boolean): boolean {
  if (canApprove) {
    if (a.fund_kind === "church" && a.status === "pending") return true
    if (a.fund_kind === "external" && (a.status === "pending" || a.status === "requested")) return true
  }
  if (canSignOff && a.fund_kind === "church" && a.status === "approved") return true
  return false
}
function receiptNeedsAction(r: InboxReceipt, canApprove: boolean, canSignOff: boolean): boolean {
  return r.allocations.some(a => allocNeedsAction(a, canApprove, canSignOff))
}

function FinanceStatusPill({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      padding: "3px 9px", borderRadius: 999, background: m.bg, color: m.text,
      fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {m.label}
    </span>
  )
}

// Mobile-only §4 facts grid: 2-col auto/1fr, mono 9.5 keys, 14/500 values, unset
// "—" rendered faint. Shared by both detail overlays (finance + receipts).
export function MobileFactsGrid({ facts }: { facts: { label: string; value: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 16, rowGap: 12, marginBottom: 22 }}>
      {facts.map(f => {
        const unset = !f.value || f.value === "—"
        return (
          <div key={f.label} style={{ display: "contents" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", alignSelf: "center" }}>{f.label}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: unset ? "var(--faint)" : "var(--ink)", textAlign: "right" }}>{unset ? "—" : f.value}</span>
          </div>
        )
      })}
    </div>
  )
}

// Mobile-only data row: 15/600 title, 13 muted sub, right-aligned 15/600 value —
// the phone presentation of a desktop ledger / allocation grid row.
function MobileDataRow({ title, sub, right, rightColor = "var(--ink)", isLast }: {
  title: string; sub?: string; right: string; rightColor?: string; isLast: boolean
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: isLast ? "none" : "1px solid var(--line-3)" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 13, color: "var(--muted-text)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
      </span>
      <span style={{ fontSize: 15, fontWeight: 600, color: rightColor, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{right}</span>
    </div>
  )
}

function InboxRow({ receipt: r, first, onClick }: { receipt: InboxReceipt; first: boolean; onClick: () => void }) {
  const meta = [r.team_name, r.category_name ?? r.category].filter(Boolean).join(" · ")
  return (
    <button
      onClick={onClick}
      className="hover:bg-[var(--body-bg)] transition-colors"
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "11px 16px", background: "transparent", border: "none",
        borderTop: first ? "none" : "1px solid var(--line)", cursor: "pointer", textAlign: "left",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.submitted_by_name ?? "Unknown"}
        </span>
        {meta && (
          <span style={{ fontSize: 12.5, color: "var(--muted-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meta}
          </span>
        )}
      </div>
      <span style={{ fontSize: 13, color: "var(--body)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        ${Number(r.amount).toFixed(2)}
      </span>
      <FinanceStatusPill status={r.status} />
    </button>
  )
}

function InboxEmpty({ title, subtitle }: { title: string; subtitle: string }) {
  // Mobile keeps the quiet EmptyState grammar — dashed borders are reserved for
  // add-affordances on phone width (mobile_design_system §3.8). Desktop unchanged.
  const isMobile = useIsMobile()
  return <EmptyState variant={isMobile ? "quiet" : "bordered"} icon={<Inbox className="w-7 h-7" />} title={title} subtitle={subtitle} />
}

type InboxFilter = "needs" | "all"

function ReimbursementInbox({
  ministryId, items, funds, loading, canApprove, canSignOff, readOnly, onRefetch, onDetailOpenChange,
}: {
  ministryId: string
  items: InboxReceipt[]
  funds: FinanceFund[]
  loading: boolean
  canApprove: boolean
  canSignOff: boolean
  readOnly: boolean
  onRefetch: () => void
  onDetailOpenChange?: (open: boolean) => void
}) {
  const [filter, setFilter] = useState<InboxFilter>("needs")
  const [detail, setDetail] = useState<InboxReceipt | null>(null)
  const isMobile = useIsMobile()

  // Keep the open detail in sync with refetched items (statuses change after actions).
  const detailLive = detail ? items.find(r => r.id === detail.id) ?? null : null

  // Notify the mobile parent whether the detail subpage owns the screen (§2.2b),
  // and always release the flag on unmount (section switch) so the back-row returns.
  useEffect(() => {
    onDetailOpenChange?.(detail !== null)
    return () => onDetailOpenChange?.(false)
  }, [detail, onDetailOpenChange])

  // Action capabilities the UI actually exposes — gov-view suppresses every action.
  const uiCanApprove = canApprove && !readOnly
  const uiCanSignOff = canSignOff && !readOnly

  const needsAction = items.filter(r => receiptNeedsAction(r, uiCanApprove, uiCanSignOff))
  const shown = filter === "needs" ? needsAction : items

  // Detail consumes the surface as an in-content subpage (replaces the inbox list).
  // Rendered FULL-BLEED (no px wrapper) so SubpageShell's px-5 md:px-14 is the only
  // horizontal inset — the surrounding non-detail views supply their own inset below.
  if (detailLive) {
    return (
      <InboxDetailOverlay
        receipt={detailLive}
        ministryId={ministryId}
        funds={funds}
        canApprove={uiCanApprove}
        canSignOff={uiCanSignOff}
        canView={readOnly || (!uiCanApprove && !uiCanSignOff)}
        onClose={() => setDetail(null)}
        onActed={onRefetch}
      />
    )
  }

  return (
    <div className="px-5 md:px-14 py-7">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 500, letterSpacing: -0.2, color: "var(--ink)", margin: 0 }}>
          Reimbursements inbox
          <span style={{ color: "var(--muted-text)", fontWeight: 400 }}>{` · ${items.length}`}</span>
        </h2>
        <FilterDropdown
          options={[
            { id: "needs", label: `Needs action${needsAction.length ? ` · ${needsAction.length}` : ""}` },
            { id: "all", label: "All" },
          ]}
          value={filter}
          onSelect={(id) => setFilter(id as InboxFilter)}
          align="right"
        />
      </div>

      {loading ? <Spinner /> : shown.length === 0 ? (
        <InboxEmpty
          title={filter === "needs" ? "Nothing needs your action" : "No receipts yet"}
          subtitle={filter === "needs" ? "You're all caught up." : "Submitted receipts will appear here."}
        />
      ) : isMobile ? (
        <PocketRowCard>
          {shown.map((r, i) => {
            const meta = [r.team_name, r.category_name ?? r.category].filter(Boolean).join(" · ")
            return (
              <PocketRow
                key={r.id}
                title={r.submitted_by_name ?? "Unknown"}
                titleAccessory={<FinanceStatusPill status={r.status} />}
                sub={meta || undefined}
                meta={`$${Number(r.amount).toFixed(2)}`}
                isLast={i === shown.length - 1}
                onClick={() => setDetail(r)}
              />
            )
          })}
        </PocketRowCard>
      ) : (
        <div style={{ borderRadius: 12, border: "1px solid var(--line)", overflow: "hidden", background: "var(--cream)" }}>
          {shown.map((r, i) => (
            <InboxRow key={r.id} receipt={r} first={i === 0} onClick={() => setDetail(r)} />
          ))}
        </div>
      )}
    </div>
  )
}

function InboxDetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 14, color: "var(--ink)", margin: 0, lineHeight: 1.5 }}>{value}</p>
    </div>
  )
}

// The per-source status path — church signs off; external is grant-filed.
function allocSteps(kind: "church" | "external") {
  return kind === "church"
    ? (["Submitted", "Approved", "Reimbursed"] as const)
    : (["Submitted", "Requested", "Reimbursed"] as const)
}
function allocReachedIndex(a: ReceiptAllocation): number {
  if (a.status === "reimbursed") return 2
  if (a.status === "approved" || a.status === "requested") return 1
  return 0
}

// One funding-source row inside the split: fund chip · amount · status stepper,
// plus the per-allocation actions this caller may take (gated by fund kind +
// status + capability). Optimistic-ish: parent refetches on every completed action.
function AllocationRow({
  allocation: a, ministryId, canApprove, canSignOff, onActed,
}: {
  allocation: ReceiptAllocation
  ministryId: string
  canApprove: boolean
  canSignOff: boolean
  onActed: () => void
}) {
  const isMobile = useIsMobile()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<"idle" | "reason">("idle")
  const [reasonAction, setReasonAction] = useState<null | (() => Promise<{ error: string | null }>)>(null)
  const [reasonLabel, setReasonLabel] = useState("")
  const [reason, setReason] = useState("")

  const church = a.fund_kind === "church"
  const isNegative = a.status === "rejected" || a.status === "declined"

  // Which primary / secondary (destructive) actions this state exposes.
  const showApprove = canApprove && church && a.status === "pending"
  const showRequest = canApprove && !church && a.status === "pending"
  const showSignOff = canSignOff && church && a.status === "approved"
  const showConfirm = canApprove && !church && a.status === "requested"
  const hasActions = showApprove || showRequest || showSignOff || showConfirm

  async function run(fn: () => Promise<{ error: string | null }>) {
    setBusy(true); setError(null)
    const { error: err } = await fn()
    if (err) { setError(err); setBusy(false); return }
    setBusy(false); setMode("idle"); setReason("")
    onActed()
  }
  function startReason(label: string, fn: (reason: string) => Promise<{ error: string | null }>) {
    setReasonLabel(label)
    setReasonAction(() => () => fn(reason))
    setMode("reason")
  }

  const primaryBtn: React.CSSProperties = {
    flex: 1, height: 40, background: "var(--plum)", color: "var(--cream)", borderRadius: isMobile ? 999 : 10,
    border: "none", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "var(--sans)",
  }
  const secondaryBtn: React.CSSProperties = {
    flex: 1, height: 40, background: "var(--ivory)", color: "var(--danger)", borderRadius: isMobile ? 999 : 10,
    border: "1px solid var(--line)", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "var(--sans)",
  }

  const steps = allocSteps(a.fund_kind)
  const reached = allocReachedIndex(a)

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", background: "var(--cream)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", padding: "3px 9px", borderRadius: 999, background: "var(--plum-tint)", color: "var(--plum)", whiteSpace: "nowrap" }}>
            {a.fund_name}
          </span>
          <span style={{ fontSize: 14, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>${a.amount.toFixed(2)}</span>
        </div>
        <FinanceStatusPill status={a.status} />
      </div>

      {/* Per-source status path */}
      {isNegative ? (
        <div style={{ background: DANGER_ROW_BG, border: `1px solid ${DANGER_TINT_BORDER}`, borderRadius: 10, padding: "10px 12px" }}>
          <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--danger)", margin: 0 }}>{STATUS_META[a.status]?.label ?? "Declined"}</p>
          {a.decision_reason && <p style={{ fontSize: 12.5, color: "var(--body)", margin: "5px 0 0", lineHeight: 1.5 }}>{a.decision_reason}</p>}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {steps.map((step, i) => {
            const done = i <= reached
            return (
              <div key={step} style={{ display: "flex", alignItems: "center", gap: 8, flex: i < steps.length - 1 ? 1 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: done ? "var(--plum)" : "var(--line-2)", flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, fontWeight: done ? 500 : 400, color: done ? "var(--ink)" : "var(--muted-text)", whiteSpace: "nowrap" }}>{step}</span>
                </div>
                {i < steps.length - 1 && <span style={{ flex: 1, height: 1, background: i < reached ? "var(--plum)" : "var(--line)" }} />}
              </div>
            )
          })}
        </div>
      )}

      {/* Actions */}
      {hasActions && (
        <div style={{ marginTop: 12 }}>
          {error && <p style={{ fontSize: 12, color: "var(--danger)", margin: "0 0 8px" }}>{error}</p>}
          {mode === "reason" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea autoFocus placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setMode("idle"); setReason("") }} disabled={busy} style={{ flex: 1, height: 40, background: "var(--ivory)", color: "var(--body)", borderRadius: isMobile ? 999 : 10, border: "1px solid var(--line)", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "var(--sans)" }}>Cancel</button>
                <button onClick={() => reasonAction && run(reasonAction)} disabled={busy} style={{ ...secondaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : reasonLabel}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              {showApprove && (
                <>
                  <button onClick={() => startReason("Reject", (rsn) => rejectAllocation(a.id, ministryId, rsn))} disabled={busy} style={secondaryBtn}>Reject</button>
                  <button onClick={() => run(() => approveAllocation(a.id, ministryId))} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Approving…" : "Approve"}</button>
                </>
              )}
              {showRequest && (
                <>
                  <button onClick={() => startReason("Reject", (rsn) => rejectAllocation(a.id, ministryId, rsn))} disabled={busy} style={secondaryBtn}>Reject</button>
                  <button onClick={() => run(() => requestAllocation(a.id, ministryId))} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Filing…" : "File grant request"}</button>
                </>
              )}
              {showSignOff && (
                <>
                  <button onClick={() => startReason("Decline", (rsn) => declineAllocation(a.id, ministryId, rsn))} disabled={busy} style={secondaryBtn}>Decline</button>
                  <button onClick={() => run(() => signOffAllocation(a.id, ministryId))} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Signing off…" : "Sign off"}</button>
                </>
              )}
              {showConfirm && (
                <>
                  <button onClick={() => startReason("Decline", (rsn) => declineExternalAllocation(a.id, ministryId, rsn))} disabled={busy} style={secondaryBtn}>Decline</button>
                  <button onClick={() => run(() => confirmExternalReimbursed(a.id, ministryId))} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Confirming…" : "Confirm reimbursed"}</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Compact split editor (treasurer-owned): fund + amount rows, live sum vs total.
// Only rendered when every allocation is still pending.
function SplitEditor({
  receiptId, ministryId, total, funds, current, onCancel, onSaved,
}: {
  receiptId: string
  ministryId: string
  total: number
  funds: FinanceFund[]
  current: ReceiptAllocation[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [rows, setRows] = useState<{ fundId: string; amount: string }[]>(() =>
    current.length > 0
      ? current.map(a => ({ fundId: a.fund_id, amount: String(a.amount) }))
      : [{ fundId: funds[0]?.id ?? "", amount: String(total) }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sum = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const balanced = Math.abs(sum - total) < 0.01

  function setRow(i: number, patch: Partial<{ fundId: string; amount: string }>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  async function save() {
    if (!balanced) { setError("The split must add up to the receipt total."); return }
    setSaving(true); setError(null)
    const { error: err } = await setReceiptAllocations(receiptId, ministryId, rows.map(r => ({ fundId: r.fundId, amount: parseFloat(r.amount) || 0 })))
    if (err) { setError(err); setSaving(false); return }
    setSaving(false); onSaved()
  }

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, background: "var(--cream)", display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px 28px", gap: 8, alignItems: "center" }}>
          <select value={r.fundId} onChange={e => setRow(i, { fundId: e.target.value })} style={inputStyle}>
            {funds.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={r.amount} onChange={e => setRow(i, { amount: e.target.value })} style={inputStyle} />
          <button
            onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))}
            disabled={rows.length === 1}
            style={{ background: "none", border: "none", cursor: rows.length === 1 ? "default" : "pointer", color: rows.length === 1 ? "var(--line-2)" : "var(--dashed)", display: "flex", alignItems: "center", justifyContent: "center" }}
            aria-label="Remove source"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => setRows(prev => [...prev, { fundId: funds[0]?.id ?? "", amount: "" }])}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", border: "1px dashed var(--dashed)", borderRadius: 10, background: "transparent", color: "var(--muted-text)", fontSize: 12.5, cursor: "pointer", alignSelf: "flex-start", fontFamily: "var(--sans)" }}
      >
        <Plus size={12} /> Add funding source
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5 }}>
        <span style={{ color: "var(--muted-text)" }}>Split total</span>
        <span style={{ color: balanced ? "var(--ink)" : "var(--danger)", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
          ${sum.toFixed(2)} / ${total.toFixed(2)}
        </span>
      </div>
      {error && <p style={{ fontSize: 12.5, color: "var(--danger)", margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onCancel} disabled={saving} style={{ flex: 1, height: 40, background: "var(--ivory)", color: "var(--body)", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "var(--sans)" }}>Cancel</button>
        <button onClick={save} disabled={saving || !balanced} style={{ flex: 1, height: 40, background: "var(--plum)", color: "var(--cream)", borderRadius: 10, border: "none", fontSize: 13.5, fontWeight: 500, cursor: "pointer", opacity: saving || !balanced ? 0.6 : 1, fontFamily: "var(--sans)" }}>{saving ? "Saving…" : "Save split"}</button>
      </div>
    </div>
  )
}

function InboxDetailOverlay({
  receipt: r, ministryId, funds, canApprove, canSignOff, canView, onClose, onActed,
}: {
  receipt: InboxReceipt
  ministryId: string
  funds: FinanceFund[]
  canApprove: boolean
  canSignOff: boolean
  canView: boolean
  onClose: () => void
  onActed: () => void
}) {
  const isMobile = useIsMobile()
  const [editSplit, setEditSplit] = useState(false)

  const submitterName = r.submitted_by_name ?? "Unknown"
  const initials = (() => {
    const parts = submitterName.trim().split(" ")
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
  })()

  // The split locks once any source has left `pending`.
  const allPending = r.allocations.length > 0 && r.allocations.every(a => a.status === "pending")
  const canEditSplit = canApprove && !canView && allPending && funds.length > 0

  const images = (r.receipt_image_urls && r.receipt_image_urls.length > 0)
    ? r.receipt_image_urls
    : (r.receipt_image_url ? [r.receipt_image_url] : [])

  return (
    <SubpageShell crumbs={[{ label: "Reimbursements", onClick: onClose }, { label: r.event_name || r.category_name || r.category || "Receipt" }]} width="full">
      <div>
        {/* Amount + receipt-level rollup status */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 22 }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: isMobile ? 22 : 34, fontWeight: 600, color: "var(--ink)", margin: 0, letterSpacing: "-0.02em" }}>
            ${Number(r.amount).toFixed(2)}
          </p>
          <div style={{ marginTop: 6 }}><FinanceStatusPill status={r.status} /></div>
        </div>

        {/* ── Funding split ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
            <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>Funding split</p>
            {canEditSplit && !editSplit && (
              <button onClick={() => setEditSplit(true)} style={{ fontSize: 12.5, color: "var(--plum)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)" }}>Edit split</button>
            )}
          </div>
          {editSplit ? (
            <SplitEditor
              receiptId={r.id}
              ministryId={ministryId}
              total={Number(r.amount)}
              funds={funds}
              current={r.allocations}
              onCancel={() => setEditSplit(false)}
              onSaved={() => { setEditSplit(false); onActed() }}
            />
          ) : r.allocations.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", border: "1px dashed var(--dashed)", borderRadius: 12, color: "var(--muted-text)" }}>
              <span style={{ fontSize: 13 }}>No funding sources yet.</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {r.allocations.map(a => (
                <AllocationRow
                  key={a.id}
                  allocation={a}
                  ministryId={ministryId}
                  canApprove={canApprove && !canView}
                  canSignOff={canSignOff && !canView}
                  onActed={onActed}
                />
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        {isMobile ? (
          <MobileFactsGrid facts={[
            { label: "Purchase date", value: r.purchase_date ? new Date(r.purchase_date + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—" },
            { label: "Category", value: r.category_name ?? r.category ?? "—" },
            { label: "Team", value: r.team_name || "—" },
          ]} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
            <InboxDetailRow label="Purchase date" value={r.purchase_date ? new Date(r.purchase_date + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"} />
            <InboxDetailRow label="Category" value={r.category_name ?? r.category ?? "—"} />
            <InboxDetailRow label="Team" value={r.team_name || "—"} />
          </div>
        )}

        <div style={{ marginBottom: 22 }}>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 6px" }}>Submitted by</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MonogramChip initials={initials} style={{ width: 24, height: 24, fontSize: 9, fontWeight: 500 }} />
            <span style={{ fontSize: 14, color: "var(--ink)" }}>{submitterName}</span>
          </div>
        </div>

        {r.notes && (
          <div style={{ marginBottom: 22 }}>
            <InboxDetailRow label="Notes" value={r.notes} />
          </div>
        )}

        {/* Receipt images */}
        <div>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 8px" }}>
            {images.length > 1 ? "Receipt images" : "Receipt image"}
          </p>
          {images.length > 0 ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {images.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block", borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", width: 180 }}>
                  <img src={url} alt={`Receipt ${i + 1}`} style={{ width: "100%", display: "block", objectFit: "cover" }} />
                </a>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", border: "1px dashed var(--dashed)", borderRadius: 12, color: "var(--muted-text)" }}>
              <ImageIcon size={16} />
              <span style={{ fontSize: 13 }}>No image attached</span>
            </div>
          )}
        </div>
      </div>
    </SubpageShell>
  )
}

// ── FinanceWorkspace ────────────────────────────────────────────────────────────
// Back-office finance content (reimbursements / budget / allocation). Rendered both
// inside the standalone Finance tab (GivingTab) and the Finance Plan-team workspace.
// The parent owns the section sub-tab strip and passes `section` / `onSectionChange`.

interface FinanceWorkspaceProps {
  ministryId: string
  userId: string
  userName: string
  userRole: string
  section: FinanceSection
  onSectionChange: (s: FinanceSection) => void
  /** Finance write access — treasurer/admin (tab) or finance-team member / gov-write (team). */
  canEditBudget: boolean
  /** Reimbursements section access — DGL/treasurer/admin (tab) or finance-team / gov (team). */
  canAccessReimbursements: boolean
  /** Governance view-only: render all sections but disable every mutation control. */
  readOnly: boolean
  /** Fires when the reimbursement-detail subpage opens/closes — lets a mobile
      parent (plan-tab) drop its section back-row so the detail's own SubpageShell
      chrome is the only header (§2.2b full-bleed subpages consume the screen). */
  onDetailOpenChange?: (open: boolean) => void
}

export function FinanceWorkspace({
  ministryId, userId,
  section, onSectionChange,
  canEditBudget, canAccessReimbursements, readOnly,
  onDetailOpenChange,
}: FinanceWorkspaceProps) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  // Land each finance section swap at the top (window scroll on phone width).
  useScrollResetOn([section])

  const [loading, setLoading] = useState(true)

  // Per-ministry fund list — single source for the inbox split editor + allocation
  // grid columns (replaces the old hardcoded church/cmu/pitt array).
  const { data: fundsRes } = useSWR(["finance-funds", ministryId] as const, () => getFinanceFunds(ministryId))
  const funds = fundsRes?.data ?? []

  // Receipt limits (consumed by SubmitReceiptModal callers)
  const [limits, setLimits] = useState<ReceiptLimit[]>([])

  // Reimbursement inbox — all standalone submitted receipts + this caller's
  // finance capability (treasurer can approve, president can sign off).
  const [inboxItems, setInboxItems] = useState<InboxReceipt[]>([])
  const [inboxCanApprove, setInboxCanApprove] = useState(false)
  const [inboxCanSignOff, setInboxCanSignOff] = useState(false)
  const [inboxLoading, setInboxLoading] = useState(false)

  // Dynamic categories (DG Dinner permanent + calendar events + custom)
  const [calEventCategories, setCalEventCategories] = useState<string[]>([])
  const [customCategories, setCustomCategories] = useState<{ id: string; name: string }[]>([])

  const dynamicCategories: DynamicCategory[] = [
    DG_DINNER_CATEGORY,
    ...calEventCategories.map(t => ({ value: t, label: t, isPermanent: true })),
    ...customCategories.map(c => ({ value: c.name, label: c.name, isPermanent: false })),
  ]

  async function handleAddCategory(name: string) {
    const trimmed = name.trim()
    if (!trimmed || dynamicCategories.some(c => c.label.toLowerCase() === trimmed.toLowerCase())) return
    const { data, error } = await addBudgetCategory(ministryId, trimmed, userId)
    if (!error && data) setCustomCategories(prev => [...prev, { id: data.id, name: data.name }])
  }

  async function handleDeleteCategory(categoryName: string) {
    await deleteBudgetCategory(ministryId, categoryName)
    setCustomCategories(prev => prev.filter(c => c.name !== categoryName))
  }

  // Budget
  const [budgetEntries, setBudgetEntries] = useState<BudgetEntry[]>([])
  const [budgetLoading, setBudgetLoading] = useState(false)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
  const [entryCategory, setEntryCategory] = useState("DG Dinner")
  const [entryDescription, setEntryDescription] = useState("")
  const [entryAmount, setEntryAmount] = useState("")
  const [addingEntry, setAddingEntry] = useState(false)
  const [budgetExporting, setBudgetExporting] = useState(false)

  // Access vs. edit. Gov-view (readOnly) may VIEW any section but mutates nothing.
  const reimbAccess = canAccessReimbursements || readOnly
  const budgetAccess = canEditBudget || readOnly
  const canManage = canEditBudget && !readOnly

  useEffect(() => {
    async function load() {
      const [limitsRes, eventsRes, customCatRes] = await Promise.all([
        getReceiptLimits(ministryId),
        supabase.from("calendar_events").select("title").eq("ministry_id", ministryId).order("start_date"),
        getBudgetCategories(ministryId),
      ])
      setLimits(limitsRes.data)
      // Dedupe calendar event titles (exclude "DG Dinner" — it's already permanent)
      const seen = new Set<string>(["DG Dinner"])
      const uniqueTitles: string[] = []
      for (const e of ((eventsRes.data ?? []) as { title: string }[])) {
        if (!seen.has(e.title)) { seen.add(e.title); uniqueTitles.push(e.title) }
      }
      setCalEventCategories(uniqueTitles)
      setCustomCategories(customCatRes.data.map(c => ({ id: c.id, name: c.name })))
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  // Inbox visible to the treasurer (canManage) and to gov-view (readOnly) read-only.
  // The server re-derives the real finance capability; this only gates the fetch.
  const canSeeReceiptQueue = canManage || readOnly

  const loadInbox = useCallback(async () => {
    if (!canSeeReceiptQueue) return
    setInboxLoading(true)
    const { items, canApprove, canSignOff } = await getReimbursementInbox(ministryId)
    setInboxItems(items)
    setInboxCanApprove(canApprove)
    setInboxCanSignOff(canSignOff)
    setInboxLoading(false)
  }, [ministryId, canSeeReceiptQueue])

  useEffect(() => {
    if (section === "reimbursements") loadInbox()
    else if (section === "budget") loadBudget()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  // Defense-in-depth: never render a blank workspace. If the active section isn't
  // accessible to this user, fall back to the first section they can actually open.
  useEffect(() => {
    if ((section === "budget" || section === "allocation") && !budgetAccess && reimbAccess) {
      onSectionChange("reimbursements")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, budgetAccess, reimbAccess])

  async function loadBudget() {
    setBudgetLoading(true)
    const { data } = await getBudgetEntries(ministryId)
    setBudgetEntries(data)
    setBudgetLoading(false)
  }

  async function handleAddBudgetEntry() {
    const amt = parseFloat(entryAmount); if (!amt || amt <= 0) return
    setAddingEntry(true)
    const { data } = await addBudgetEntry({ ministryId, category: entryCategory, description: entryDescription.trim(), amount: amt, entryDate })
    if (data) setBudgetEntries(prev => [data, ...prev])
    setEntryDate(new Date().toISOString().split("T")[0]); setEntryCategory("other"); setEntryDescription(""); setEntryAmount("")
    setShowAddEntry(false); setAddingEntry(false)
  }

  async function handleExportBudget() {
    setBudgetExporting(true)
    const { csv } = await exportBudgetCSV(ministryId)
    if (csv) {
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "budget.csv"; a.click()
      URL.revokeObjectURL(url)
    }
    setBudgetExporting(false)
  }

  // Build category summary from dynamic categories + any orphaned categories in actual entries
  const allEntryCategories = Array.from(new Set(budgetEntries.map(e => e.category)))
  const orphanedCategories = allEntryCategories
    .filter(c => !dynamicCategories.some(d => d.value === c))
    .map(c => ({ value: c, label: c, isPermanent: false }))
  const summaryCategories = [...dynamicCategories, ...orphanedCategories]
  const categorySummary = summaryCategories.map(cat => ({
    ...cat,
    total: budgetEntries.filter(e => e.category === cat.value).reduce((sum, e) => sum + Number(e.amount), 0),
  })).filter(c => c.total > 0)

  if (loading) return <Spinner />

  return (
    <>
      {/* ── Reimbursements ── */}
      {section === "reimbursements" && reimbAccess && (
        <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
          {/* REIMBURSEMENT INBOX — treasurer/president (read-only under gov-view) */}
          {canSeeReceiptQueue && (
            <ReimbursementInbox
              ministryId={ministryId}
              items={inboxItems}
              funds={funds}
              loading={inboxLoading}
              canApprove={inboxCanApprove}
              canSignOff={inboxCanSignOff}
              readOnly={readOnly}
              onRefetch={loadInbox}
              onDetailOpenChange={onDetailOpenChange}
            />
          )}
        </div>
      )}

      {/* ── Allocation ── */}
      {/* Non-detail views own their inset (workspace is mounted full-bleed). */}
      {section === "allocation" && budgetAccess && (
        <div className="px-5 md:px-14 py-7">
          <AllocationSection
            ministryId={ministryId}
            canEdit={canManage}
            funds={funds}
            categories={dynamicCategories}
            onAddCategory={handleAddCategory}
            onDeleteCategory={handleDeleteCategory}
          />
        </div>
      )}

      {/* ── Budget ── */}
      {section === "budget" && budgetAccess && (
        <div className="px-5 md:px-14 py-7">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>Expense ledger</p>
            {canManage && (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleExportBudget} disabled={budgetExporting} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "1px solid var(--line)", borderRadius: 9, background: "var(--ivory)", color: "var(--body)", fontSize: 13, fontWeight: 500, cursor: budgetExporting ? "default" : "pointer", fontFamily: "var(--sans)", opacity: budgetExporting ? 0.5 : 1 }}>
                  <Download style={{ width: 13, height: 13 }} />{budgetExporting ? "…" : "Export"}
                </button>
                <button onClick={() => setShowAddEntry(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "none", background: showAddEntry ? "var(--ivory)" : "var(--plum)", color: showAddEntry ? "var(--ink)" : "var(--cream)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "var(--sans)" }}>
                  <Plus style={{ width: 14, height: 14 }} />Add entry
                </button>
              </div>
            )}
          </div>

          {canManage && showAddEntry && (
            <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>New manual entry</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><label style={labelStyle}>Date</label><input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Category</label><select value={entryCategory} onChange={e => setEntryCategory(e.target.value)} style={inputStyle}>{dynamicCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                <div><label style={labelStyle}>Description</label><input type="text" placeholder="What was this expense for?" value={entryDescription} onChange={e => setEntryDescription(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Amount ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={entryAmount} onChange={e => setEntryAmount(e.target.value)} style={inputStyle} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowAddEntry(false)} style={{ padding: "8px 16px", background: "transparent", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, color: "var(--body)", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleAddBudgetEntry} disabled={addingEntry || !entryAmount} style={{ padding: "8px 18px", background: "var(--plum)", color: "var(--cream)", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: addingEntry || !entryAmount ? 0.6 : 1 }}>
                  {addingEntry ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {categorySummary.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {categorySummary.map(c => (
                <div key={c.value} style={{ padding: "6px 12px", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 999, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--body)" }}>{c.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>${c.total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {budgetLoading ? <Spinner /> : budgetEntries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted-text)", background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 12 }}>
              <DollarSign size={24} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
              <p style={{ fontSize: 14 }}>No budget entries yet</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>Submitted reimbursement forms are logged automatically.</p>
            </div>
          ) : isMobile ? (
            <PocketRowCard>
              {budgetEntries.map((e, i) => (
                <MobileDataRow
                  key={e.id}
                  title={e.description || "—"}
                  sub={`${new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${e.category}`}
                  right={`$${Number(e.amount).toFixed(2)}`}
                  isLast={i === budgetEntries.length - 1}
                />
              ))}
            </PocketRowCard>
          ) : (
            <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 130px 90px 80px", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--line)", background: "var(--cream)" }}>
                {["Date", "Description", "Category", "Amount", "Source"].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)" }}>{h}</span>
                ))}
              </div>
              {budgetEntries.map((e, i) => (
                <div key={e.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 130px 90px 80px", gap: 8, padding: "12px 16px", borderTop: i > 0 ? "1px solid var(--line-3)" : "none", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: "var(--body)" }}>{new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <span style={{ fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description ?? "—"}</span>
                  <span style={{ fontSize: 12.5, color: "var(--body)" }}>{e.category}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>${Number(e.amount).toFixed(2)}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", padding: "3px 7px", borderRadius: 999, textTransform: "uppercase", background: e.source === "reimbursement" ? REIMBURSED_TINT : "var(--ivory)", color: e.source === "reimbursement" ? "var(--plum)" : "var(--body)", display: "inline-block" }}>
                    {e.source === "reimbursement" ? "Auto" : "Manual"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── AllocationSection ──────────────────────────────────────────────────────────

function generateYearOptions(): string[] {
  const fy = currentFiscalYear()
  const [startYear] = fy.split("-").map(Number)
  return [
    `${startYear}-${startYear + 1}`,
    `${startYear + 1}-${startYear + 2}`,
    `${startYear + 2}-${startYear + 3}`,
  ]
}

function AllocationSection({
  ministryId,
  canEdit: canEditProp,
  funds,
  categories,
  onAddCategory,
  onDeleteCategory,
}: {
  ministryId: string
  canEdit: boolean
  funds: FinanceFund[]
  categories: DynamicCategory[]
  onAddCategory: (name: string) => Promise<void>
  onDeleteCategory: (name: string) => Promise<void>
}) {
  // Dynamic fund columns (slug = the value stored on budget_allocations.fund).
  // Fall back to a single Church column so the grid still renders pre-seed.
  const fundCols = funds.length > 0
    ? funds.map(f => ({ value: f.slug, label: f.name }))
    : [{ value: "church", label: "Church" }]
  const allocGridCols = `minmax(120px, 1.4fr) ${fundCols.map(() => "minmax(70px, 1fr)").join(" ")} 84px 78px 90px 28px`
  // Mobile-only Daybreak restyle (ruling B-2): the summary stat cards adopt the
  // 16px --r-pocket-sm radius on mobile via viewport branch; desktop byte-identical.
  const isMobile = useIsMobile()
  const [fiscalYear, setFiscalYear] = useState<string>(currentFiscalYear)
  const [allocations, setAllocations] = useState<BudgetAllocation[]>([])
  const [actuals, setActuals] = useState<CategoryActual[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [savingCell, setSavingCell] = useState<string | null>(null)

  // Draft edits: key = `${category}::${fund}`, value = string input
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  // Add custom category
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [savingCategory, setSavingCategory] = useState(false)
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null)
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null)

  const yearOptions = generateYearOptions()
  const canEdit = canEditProp

  // Include any orphaned categories that have allocations but aren't in the dynamic list
  const allocatedCategories = Array.from(new Set(allocations.map(a => a.category)))
  const orphanedCategories: DynamicCategory[] = allocatedCategories
    .filter(c => !categories.some(d => d.value === c))
    .map(c => ({ value: c, label: c, isPermanent: false }))
  const allCategories = [...categories, ...orphanedCategories]

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: allocs }, { data: acts }] = await Promise.all([
        getBudgetAllocations(ministryId, fiscalYear),
        getCategoryActuals(ministryId, fiscalYear),
      ])
      setAllocations(allocs)
      setActuals(acts)
      setLoading(false)
    }
    load()
  }, [ministryId, fiscalYear])

  // Build lookup: category → fund → amount
  function getAllocAmount(category: string, fund: string): number {
    return allocations.find(a => a.category === category && a.fund === fund)?.allocated_amount ?? 0
  }

  function getAllocNotes(category: string): string {
    return allocations.find(a => a.category === category)?.notes ?? ""
  }

  function getActual(category: string): number {
    return actuals.find(a => a.category === category)?.total_spent ?? 0
  }

  function getDraftKey(category: string, fund: string) {
    return `${category}::${fund}`
  }

  function getDraftValue(category: string, fund: string): string {
    const key = getDraftKey(category, fund)
    if (key in drafts) return drafts[key]
    const amt = getAllocAmount(category, fund)
    return amt > 0 ? String(amt) : ""
  }

  async function handleCellBlur(category: string, fund: string) {
    const key = getDraftKey(category, fund)
    if (!(key in drafts)) return
    const raw = drafts[key].trim()
    const amount = raw === "" ? 0 : parseFloat(raw)
    if (isNaN(amount) || amount < 0) {
      // Revert
      setDrafts(prev => { const n = { ...prev }; delete n[key]; return n })
      return
    }
    setSavingCell(key)
    const { error } = await upsertBudgetAllocation({ ministryId, fiscalYear, category, fund, amount })
    if (!error) {
      setAllocations(prev => {
        const existing = prev.find(a => a.category === category && a.fund === fund)
        if (existing) return prev.map(a => a.category === category && a.fund === fund ? { ...a, allocated_amount: amount } : a)
        return [...prev, { id: "", ministry_id: ministryId, fiscal_year: fiscalYear, category, fund, allocated_amount: amount, notes: null }]
      })
    }
    setDrafts(prev => { const n = { ...prev }; delete n[key]; return n })
    setSavingCell(null)
  }

  async function handleNotesBlur(category: string, notes: string) {
    // Save notes to the first fund row for this category (or church by default)
    const fund = allocations.find(a => a.category === category)?.fund ?? "church"
    await upsertBudgetAllocation({ ministryId, fiscalYear, category, fund, amount: getAllocAmount(category, fund), notes })
    setAllocations(prev => prev.map(a => a.category === category ? { ...a, notes } : a))
  }

  // Totals
  const totalAllocated = allCategories.reduce((sum, cat) => {
    return sum + fundCols.reduce((s, f) => s + getAllocAmount(cat.value, f.value), 0)
  }, 0)
  const totalSpent = allCategories.reduce((sum, cat) => sum + getActual(cat.value), 0)
  const totalRemaining = totalAllocated - totalSpent
  const pct = totalAllocated > 0 ? Math.min(100, (totalSpent / totalAllocated) * 100) : 0
  const overBudget = totalRemaining < 0

  const monoLabel: React.CSSProperties = {
    fontFamily: "var(--mono)",
    fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--faint)",
  }
  const cellInput: React.CSSProperties = {
    background: "transparent", border: "none", outline: "none",
    fontSize: 14, fontFamily: "var(--sans)", color: "var(--ink)",
    width: "100%", padding: 0,
    borderBottom: "1px solid var(--plum)",
  }

  return (
    <div>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 21, fontWeight: 500, color: "var(--ink)", margin: 0, letterSpacing: -0.2 }}>
          Annual Allocation
        </h2>
        <FilterDropdown
          options={yearOptions.map(y => ({ id: y, label: y }))}
          value={fiscalYear}
          onSelect={setFiscalYear}
          align="right"
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted-text)", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* Summary stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }} className="max-md:!grid-cols-1">
            {[
              { label: "Total Budgeted", value: totalAllocated, sub: "across all funds" },
              { label: "Total Spent", value: totalSpent, sub: "this fiscal year" },
              { label: "Remaining", value: totalRemaining, sub: overBudget ? "over budget" : "available", danger: overBudget },
            ].map(card => (
              <div
                key={card.label}
                style={{
                  padding: 16, borderRadius: isMobile ? "var(--r-pocket-sm)" : 14,
                  background: card.danger ? DANGER_TINT_BG : (isMobile ? "var(--ivory)" : "var(--cream)"),
                  border: `1px solid ${card.danger ? DANGER_TINT_BORDER : (isMobile ? "transparent" : "var(--line)")}`,
                }}
              >
                <p style={{ fontFamily: "var(--mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
                  {card.label}
                </p>
                <p style={{ fontFamily: "var(--serif)", fontSize: 27, letterSpacing: -0.4, color: card.danger ? "var(--danger)" : "var(--ink)", margin: "8px 0 0" }}>
                  ${Math.abs(card.value).toFixed(2)}
                </p>
                <p style={{ fontSize: 13, color: card.danger ? "var(--danger)" : "var(--muted-text)", marginTop: 4 }}>
                  {card.danger && card.value < 0 ? `$${Math.abs(card.value).toFixed(2)} over · ` : ""}{card.sub}
                </p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {totalAllocated > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ height: 4, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: overBudget ? "var(--danger)" : "var(--plum)", transition: "width 0.3s" }} />
              </div>
              <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 6 }}>
                {pct.toFixed(0)}% of budget used{overBudget ? " — over budget" : ""}
              </p>
            </div>
          )}

          {/* Allocation editing is desktop-only for now — the editable 8-col grid,
              per-cell inputs, and custom-category management render only at ≥md.
              Mobile shows a read-only per-category summary list below. */}
          <div className="hidden md:block">
          {/* Allocation table */}
          <div style={{ border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: allocGridCols, gap: 0, padding: "10px 16px", borderBottom: "1px solid var(--line)", background: "var(--cream-2)" }}>
              {["Category", ...fundCols.map(f => f.label), "Total", "Spent", "Remaining", ""].map((h, i) => (
                <span key={i} style={{ ...monoLabel, display: "block" }}>{h}</span>
              ))}
            </div>

            {/* Category rows */}
            {allCategories.map((cat, catIdx) => {
              const catTotal = fundCols.reduce((s, f) => s + getAllocAmount(cat.value, f.value), 0)
              const spent = getActual(cat.value)
              const remaining = catTotal - spent
              const rowOver = remaining < 0 && catTotal > 0
              const notesExpanded = expandedNotes.has(cat.value)
              const notes = getAllocNotes(cat.value)

              return (
                <div key={cat.value}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: allocGridCols,
                      gap: 0,
                      padding: "13px 16px",
                      borderTop: catIdx > 0 ? "1px solid var(--line-3)" : "none",
                      borderLeft: rowOver ? "3px solid var(--danger)" : "3px solid transparent",
                      alignItems: "center",
                      background: rowOver ? DANGER_ROW_BG : "transparent",
                    }}
                  >
                    {/* Category label + delete for custom */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, color: "var(--ink)" }}>{cat.label}</span>
                      {!cat.isPermanent && canEdit && (
                        confirmDeleteCategory === cat.value ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <button
                              onClick={async () => {
                                setDeletingCategory(cat.value)
                                setConfirmDeleteCategory(null)
                                await onDeleteCategory(cat.value)
                                // Also purge from local allocations state so orphanedCategories
                                // doesn't immediately re-add it before the next full fetch
                                setAllocations(prev => prev.filter(a => a.category !== cat.value))
                                setDeletingCategory(null)
                              }}
                              disabled={deletingCategory === cat.value}
                              style={{ fontSize: 11, fontWeight: 500, color: "var(--danger)", background: DELETE_CONFIRM_BG, border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap", opacity: deletingCategory === cat.value ? 0.5 : 1 }}
                            >
                              {deletingCategory === cat.value ? "Deleting…" : "Delete"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteCategory(null)}
                              style={{ fontSize: 11, color: "var(--muted-text)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteCategory(cat.value)}
                            title="Remove custom category"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dashed)", padding: 0, display: "flex", alignItems: "center" }}
                          >
                            <X size={13} />
                          </button>
                        )
                      )}
                    </div>

                    {/* Fund cells */}
                    {fundCols.map(fund => {
                      const cellKey = getDraftKey(cat.value, fund.value)
                      const isSaving = savingCell === cellKey
                      const draftVal = getDraftValue(cat.value, fund.value)
                      const displayAmt = getAllocAmount(cat.value, fund.value)

                      return (
                        <div
                          key={fund.value}
                          style={{ padding: "2px 8px 2px 0" }}
                          title={`Click to edit ${fund.label} allocation for ${cat.label}`}
                        >
                          {canEdit ? (
                            <div style={{ position: "relative" }}>
                              <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--faint)", pointerEvents: "none", lineHeight: 1 }}>
                                {draftVal !== "" || (cellKey in drafts) ? "$" : ""}
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={cellKey in drafts ? draftVal : (displayAmt > 0 ? String(displayAmt) : "")}
                                onChange={e => setDrafts(prev => ({ ...prev, [cellKey]: e.target.value }))}
                                onFocus={e => {
                                  if (!(cellKey in drafts)) setDrafts(prev => ({ ...prev, [cellKey]: displayAmt > 0 ? String(displayAmt) : "" }))
                                  e.target.select()
                                }}
                                onBlur={() => handleCellBlur(cat.value, fund.value)}
                                placeholder="—"
                                disabled={isSaving}
                                style={{
                                  ...cellInput,
                                  paddingLeft: draftVal || displayAmt > 0 ? 14 : 0,
                                  opacity: isSaving ? 0.5 : 1,
                                }}
                              />
                            </div>
                          ) : (
                            <span style={{ fontSize: 14, color: displayAmt > 0 ? "var(--ink)" : "var(--faint)" }}>
                              {displayAmt > 0 ? `$${displayAmt.toFixed(2)}` : "—"}
                            </span>
                          )}
                        </div>
                      )
                    })}

                    {/* Total */}
                    <span style={{ fontSize: 14, color: "var(--ink)", fontWeight: catTotal > 0 ? 500 : 400 }}>
                      {catTotal > 0 ? `$${catTotal.toFixed(2)}` : "—"}
                    </span>

                    {/* Spent */}
                    <span style={{ fontSize: 14, color: spent > 0 ? "var(--ink)" : "var(--faint)" }}>
                      {spent > 0 ? `$${spent.toFixed(2)}` : "—"}
                    </span>

                    {/* Remaining */}
                    <span style={{ fontSize: 14, color: rowOver ? "var(--danger)" : remaining > 0 ? BUDGET_GREEN : "var(--faint)", fontWeight: rowOver ? 500 : 400 }}>
                      {catTotal > 0 ? (remaining < 0 ? `-$${Math.abs(remaining).toFixed(2)}` : `$${remaining.toFixed(2)}`) : "—"}
                    </span>

                    {/* Notes toggle */}
                    <button
                      onClick={() => setExpandedNotes(prev => {
                        const n = new Set(prev)
                        n.has(cat.value) ? n.delete(cat.value) : n.add(cat.value)
                        return n
                      })}
                      style={{ background: "none", border: "none", cursor: "pointer", color: notes ? "var(--plum)" : "var(--dashed)", fontSize: 13, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                      title="Notes"
                    >
                      {notesExpanded ? "▴" : "▾"}
                    </button>
                  </div>

                  {/* Notes row */}
                  {notesExpanded && (
                    <div style={{ padding: "8px 16px 12px 19px", borderTop: "1px dashed var(--line)", background: "var(--cream)" }}>
                      {canEdit ? (
                        <textarea
                          defaultValue={notes}
                          placeholder="Add context for this category (e.g. 'Church provides full retreat budget, CMU covers supplies')"
                          onBlur={e => handleNotesBlur(cat.value, e.target.value)}
                          rows={2}
                          style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "vertical", fontSize: 13, fontFamily: "var(--sans)", fontStyle: notes ? "normal" : "italic", color: "var(--body)", lineHeight: 1.5, boxSizing: "border-box" }}
                        />
                      ) : (
                        <p style={{ fontSize: 13, color: notes ? "var(--body)" : "var(--faint)", fontStyle: !notes ? "italic" : "normal", margin: 0 }}>
                          {notes || "No notes for this category."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Footer totals row */}
            <div style={{ display: "grid", gridTemplateColumns: allocGridCols, gap: 0, padding: "12px 16px", borderTop: "1px solid var(--line)", background: "var(--cream-2)" }}>
              <span style={{ ...monoLabel, fontSize: "11px", color: "var(--body)" }}>Total</span>
              {fundCols.map(fund => {
                const fundTotal = allCategories.reduce((s, cat) => s + getAllocAmount(cat.value, fund.value), 0)
                return (
                  <span key={fund.value} style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                    {fundTotal > 0 ? `$${fundTotal.toFixed(2)}` : "—"}
                  </span>
                )
              })}
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                {totalAllocated > 0 ? `$${totalAllocated.toFixed(2)}` : "—"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: totalSpent > 0 ? "var(--ink)" : "var(--faint)" }}>
                {totalSpent > 0 ? `$${totalSpent.toFixed(2)}` : "—"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: overBudget ? "var(--danger)" : totalRemaining > 0 ? BUDGET_GREEN : "var(--faint)" }}>
                {totalAllocated > 0 ? (totalRemaining < 0 ? `-$${Math.abs(totalRemaining).toFixed(2)}` : `$${totalRemaining.toFixed(2)}`) : "—"}
              </span>
              <span />
            </div>
          </div>

          {/* Add custom category */}
          {canEdit && (
            <div style={{ marginTop: 12 }}>
              {addingCategory ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Category name…"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === "Enter" && newCategoryName.trim()) {
                        setSavingCategory(true)
                        await onAddCategory(newCategoryName)
                        setNewCategoryName("")
                        setAddingCategory(false)
                        setSavingCategory(false)
                      } else if (e.key === "Escape") {
                        setNewCategoryName(""); setAddingCategory(false)
                      }
                    }}
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 10, fontSize: 13, color: "var(--ink)", background: "var(--cream)", outline: "none" }}
                  />
                  <button
                    onClick={async () => {
                      if (!newCategoryName.trim()) return
                      setSavingCategory(true)
                      await onAddCategory(newCategoryName)
                      setNewCategoryName("")
                      setAddingCategory(false)
                      setSavingCategory(false)
                    }}
                    disabled={savingCategory || !newCategoryName.trim()}
                    style={{ padding: "8px 14px", background: "var(--plum)", color: "var(--cream)", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: savingCategory || !newCategoryName.trim() ? 0.5 : 1 }}
                  >
                    {savingCategory ? "Adding…" : "Add"}
                  </button>
                  <button
                    onClick={() => { setNewCategoryName(""); setAddingCategory(false) }}
                    style={{ padding: "8px 12px", background: "var(--ivory)", color: "var(--body)", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingCategory(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "transparent", border: "1px dashed var(--dashed)", borderRadius: 10, color: "var(--muted-text)", fontSize: 13, cursor: "pointer", fontFamily: "var(--sans)" }}
                >
                  <Plus size={13} />
                  Add custom category
                </button>
              )}
            </div>
          )}

          {/* Empty state hint */}
          {totalAllocated === 0 && (
            <p style={{ textAlign: "center", fontSize: 13, color: "var(--muted-text)", marginTop: 20, fontStyle: "italic" }}>
              No budget set for {fiscalYear} yet. Click any fund cell to start allocating.
            </p>
          )}
          </div>

          {/* Mobile: read-only per-category summary (editing is desktop-only). */}
          <div className="md:hidden">
            {allCategories.length === 0 ? (
              <p style={{ textAlign: "center", fontSize: 13, color: "var(--muted-text)", padding: "24px 0", fontStyle: "italic" }}>
                No categories to allocate yet.
              </p>
            ) : (
              <PocketRowCard>
                {allCategories.map((cat, i) => {
                  const catTotal = fundCols.reduce((s, f) => s + getAllocAmount(cat.value, f.value), 0)
                  const spent = getActual(cat.value)
                  const remaining = catTotal - spent
                  const rowOver = remaining < 0 && catTotal > 0
                  return (
                    <MobileDataRow
                      key={cat.value}
                      title={cat.label}
                      sub={catTotal > 0 ? `Spent $${spent.toFixed(2)} of $${catTotal.toFixed(2)}` : "Not budgeted"}
                      right={catTotal > 0 ? (remaining < 0 ? `-$${Math.abs(remaining).toFixed(2)}` : `$${remaining.toFixed(2)}`) : "—"}
                      rightColor={rowOver ? "var(--danger)" : catTotal > 0 && remaining > 0 ? BUDGET_GREEN : "var(--faint)"}
                      isLast={i === allCategories.length - 1}
                    />
                  )
                })}
              </PocketRowCard>
            )}
          </div>
        </>
      )}
    </div>
  )
}
