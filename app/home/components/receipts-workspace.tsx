"use client"

import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { X, ArrowLeft, Plus, Image as ImageIcon } from "lucide-react"
import { TabPageHeader, PageTitle, PlanSubTabStrip, MonogramChip } from "@/components/central"
import { HeaderActionButton } from "./shared"
import { createClient } from "@/lib/supabase"
import { SubmitReceiptModal, STATUS_META } from "./finance-workspace"
import {
  listReceiptCategories,
  createReceiptCategory,
  type ReceiptCategory,
} from "@/app/actions/receipt-categories"

export interface ReceiptsTeamRef {
  id: string
  name: string
}

interface ReceiptsWorkspaceProps {
  ministryId: string
  userId: string
  userName: string
  teams: ReceiptsTeamRef[]
  activeReceiptsTeamId: string | null
  onReceiptsTeamChange: (id: string) => void
}

const FUND_OPTIONS = [
  { value: "church", label: "Church" },
  { value: "other", label: "Other" },
] as const

export function ReceiptsWorkspace({
  ministryId,
  userId,
  teams,
  activeReceiptsTeamId,
  onReceiptsTeamChange,
}: ReceiptsWorkspaceProps) {
  // Auto-select the first team when none is chosen yet (e.g. landing via the
  // sidebar "Receipts" entry without an ?rteam param).
  useEffect(() => {
    if (!activeReceiptsTeamId && teams.length > 0) {
      onReceiptsTeamChange(teams[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReceiptsTeamId, teams])

  const activeTeam = teams.find(t => t.id === activeReceiptsTeamId) ?? null

  const [categories, setCategories] = useState<ReceiptCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [showAddCategory, setShowAddCategory] = useState(false)

  const teamId = activeTeam?.id ?? null

  const refreshCategories = useCallback(async () => {
    if (!teamId) { setCategories([]); return }
    const { data } = await listReceiptCategories(ministryId, teamId)
    setCategories(data)
    setActiveCategoryId(prev => {
      if (prev && data.some(c => c.id === prev)) return prev
      return data[0]?.id ?? null
    })
  }, [ministryId, teamId])

  useEffect(() => { refreshCategories() }, [refreshCategories])

  const activeCategory = categories.find(c => c.id === activeCategoryId) ?? null
  const stripTabs = categories.map(c => ({ key: c.id, label: c.name }))

  function handleCategoryCreated(cat: ReceiptCategory) {
    setShowAddCategory(false)
    setCategories(prev => [...prev, cat])
    setActiveCategoryId(cat.id)
  }

  return (
    <>
      {/* Desktop header (TabPageHeader is hidden on mobile) */}
      <TabPageHeader>
        <PageTitle
          eyebrow={activeTeam ? `RECEIPTS · ${activeTeam.name.toUpperCase()}` : "RECEIPTS"}
          title="Receipts"
        />
        {teamId && (
          <HeaderActionButton label="Add category" onClick={() => setShowAddCategory(true)} />
        )}
      </TabPageHeader>

      {/* Mobile team selector — desktop selects teams from the sidebar */}
      {teams.length > 0 && (
        <div className="md:hidden" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 14, scrollbarWidth: "none" }}>
          {teams.map(t => {
            const isActive = t.id === activeReceiptsTeamId
            return (
              <button
                key={t.id}
                onClick={() => onReceiptsTeamChange(t.id)}
                style={{
                  flexShrink: 0,
                  padding: "7px 14px",
                  borderRadius: "var(--r-pill)",
                  border: `1px solid ${isActive ? "var(--plum)" : "var(--line)"}`,
                  background: isActive ? "var(--plum)" : "var(--ivory)",
                  color: isActive ? "var(--cream)" : "var(--body)",
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  fontFamily: "var(--sans)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Category strip — at component root per convention #16 (self-insets md:pl-14) */}
      {teamId && categories.length > 0 && (
        <PlanSubTabStrip
          tabs={stripTabs}
          active={activeCategoryId ?? ""}
          onChange={setActiveCategoryId}
        />
      )}

      {/* Content region */}
      <div className="md:px-14 py-7">
        {!teamId ? (
          <EmptyBlock
            title="No teams yet."
            subtitle="Join or govern a team to start tracking receipts."
          />
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center" style={{ padding: "56px 24px" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--muted-text)", textTransform: "uppercase", marginBottom: 12 }}>
              No categories yet
            </div>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: "0 0 10px" }}>
              Create a category to start adding receipts
            </h2>
            <p style={{ fontSize: 14, color: "var(--body)", maxWidth: 360, lineHeight: 1.6, margin: "0 0 24px" }}>
              Categories group receipts for {activeTeam?.name ?? "this team"} — like dinners, supplies, or events.
            </p>
            <HeaderActionButton label="Add category" onClick={() => setShowAddCategory(true)} />
          </div>
        ) : activeCategory ? (
          <CategoryContent
            key={activeCategory.id}
            ministryId={ministryId}
            userId={userId}
            teamId={teamId!}
            teamName={activeTeam?.name ?? ""}
            category={activeCategory}
          />
        ) : null}
      </div>

      {showAddCategory && teamId && (
        <AddCategoryModal
          ministryId={ministryId}
          teamId={teamId}
          onClose={() => setShowAddCategory(false)}
          onCreated={handleCategoryCreated}
        />
      )}
    </>
  )
}

// ── A single category's body: submit affordance + the current user's own
//    receipts for this category as compact one-line rows, plus the immersive
//    read-only detail overlay. ────────────────────────────────────────────────

interface ReceiptRow {
  id: string
  event_name: string | null
  amount: number
  fund: string
  category: string | null
  purchase_date: string
  receipt_image_url: string | null
  notes: string | null
  submitted_by_name: string | null
  submitted_at: string
  status: string
  decision_reason: string | null
}

const RECEIPT_SELECT =
  "id, event_name, amount, fund, category, purchase_date, receipt_image_url, notes, submitted_by_name, submitted_at, status, decision_reason"

function fundLabel(fund?: string) {
  return FUND_OPTIONS.find(f => f.value === fund)?.label ?? fund ?? ""
}

function CategoryContent({
  ministryId, userId, teamId, teamName, category,
}: {
  ministryId: string
  userId: string
  teamId: string
  teamName: string
  category: ReceiptCategory
}) {
  const supabase = createClient()
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showSubmit, setShowSubmit] = useState(false)
  const [detail, setDetail] = useState<ReceiptRow | null>(null)

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("receipts")
      .select(RECEIPT_SELECT)
      .eq("category_id", category.id)
      .eq("submitted_by", userId)
      .order("submitted_at", { ascending: false })
    setReceipts((data as ReceiptRow[] | null) ?? [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id, userId])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div>
      {/* Category eyebrow + submit affordance */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
          {category.name} · {fundLabel(category.fund)}
        </p>
        <button
          onClick={() => setShowSubmit(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            height: 36, padding: "0 14px", borderRadius: "var(--r-pill)",
            background: "var(--plum)", color: "var(--cream)", border: "none",
            fontSize: 13, fontWeight: 500, fontFamily: "var(--sans)", cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Plus size={14} />
          Submit a receipt
        </button>
      </div>

      {/* Entries */}
      {loading ? null : receipts.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--muted-text)", margin: 0 }}>
          No receipts in {category.name} yet.
        </p>
      ) : (
        <div style={{ border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", background: "var(--ivory)" }}>
          {receipts.map((r, i) => (
            <ReceiptOneLine
              key={r.id}
              receipt={r}
              first={i === 0}
              onClick={() => setDetail(r)}
            />
          ))}
        </div>
      )}

      {showSubmit && (
        <SubmitReceiptModal
          ministryId={ministryId}
          teamId={teamId}
          categoryId={category.id}
          categoryName={category.name}
          categoryFund={category.fund}
          onClose={() => setShowSubmit(false)}
          onSubmitted={() => { setShowSubmit(false); refresh() }}
        />
      )}

      {detail && (
        <ReceiptDetailOverlay
          receipt={detail}
          categoryName={category.name}
          teamName={teamName}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
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

function ReceiptOneLine({
  receipt, first, onClick,
}: {
  receipt: ReceiptRow
  first: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="hover:bg-[#F4F1E8] transition-colors"
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "11px 16px", background: "transparent", border: "none",
        borderTop: first ? "none" : "1px solid var(--line)",
        cursor: "pointer", textAlign: "left",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
        {receipt.event_name || "Receipt"}
      </span>
      <span style={{ fontSize: 13, color: "var(--body)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
        ${Number(receipt.amount).toFixed(2)}
      </span>
      <StatusPill status={receipt.status} />
    </button>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 14, color: "var(--ink)", margin: 0, lineHeight: 1.5 }}>{value}</p>
    </div>
  )
}

const STATUS_STEPS = ["Submitted", "Approved", "Reimbursed"] as const

function ReceiptDetailOverlay({
  receipt, categoryName, teamName, onClose,
}: {
  receipt: ReceiptRow
  categoryName: string
  teamName: string
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isNegative = receipt.status === "rejected" || receipt.status === "declined"
  // Where the receipt sits on the Submitted → Approved → Reimbursed path.
  const reachedIndex = receipt.status === "reimbursed" ? 2 : receipt.status === "approved" ? 1 : 0

  const submitterName = receipt.submitted_by_name ?? "Unknown"
  const initials = (() => {
    const parts = submitterName.trim().split(" ")
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
  })()

  const overlay = (
    <div className="team-overlay-desktop fixed inset-0 z-[70] flex flex-col bg-[#FBF8F2] max-w-[390px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-12 md:pt-5 pb-3.5 border-b border-[var(--line)]">
        <button
          onClick={onClose}
          className="hover:bg-[#F2EDE0] transition-colors"
          style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--ivory)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <ArrowLeft size={16} color="var(--ink)" />
        </button>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>Receipt</p>
          <p style={{ fontFamily: "var(--serif)", fontSize: 19, color: "var(--ink)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {receipt.event_name || "Receipt"}
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 20px 40px" }}>
        {/* Amount + status */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 22 }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: 34, fontWeight: 600, color: "var(--ink)", margin: 0, letterSpacing: "-0.02em" }}>
            ${Number(receipt.amount).toFixed(2)}
          </p>
          <div style={{ marginTop: 6 }}><StatusPill status={receipt.status} /></div>
        </div>

        {/* Status path */}
        {isNegative ? (
          <div style={{ background: "#FDF9F9", border: "1px solid #E8C5C5", borderRadius: 12, padding: "14px 16px", marginBottom: 24 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--danger)", margin: 0 }}>
              {STATUS_META[receipt.status]?.label ?? "Declined"}
            </p>
            {receipt.decision_reason && (
              <p style={{ fontSize: 13, color: "var(--body)", margin: "6px 0 0", lineHeight: 1.5 }}>{receipt.decision_reason}</p>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            {STATUS_STEPS.map((step, i) => {
              const done = i <= reachedIndex
              return (
                <div key={step} style={{ display: "flex", alignItems: "center", gap: 8, flex: i < STATUS_STEPS.length - 1 ? 1 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: done ? "var(--plum)" : "var(--line-2)", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: done ? 500 : 400, color: done ? "var(--ink)" : "var(--muted-text)", whiteSpace: "nowrap" }}>{step}</span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <span style={{ flex: 1, height: 1, background: i < reachedIndex ? "var(--plum)" : "var(--line)" }} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Details */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
          <DetailRow label="Fund" value={fundLabel(receipt.fund)} />
          <DetailRow label="Purchase date" value={new Date(receipt.purchase_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
          <DetailRow label="Category" value={categoryName} />
          <DetailRow label="Team" value={teamName || "—"} />
        </div>

        <div style={{ marginBottom: 22 }}>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 6px" }}>Submitted by</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MonogramChip initials={initials} style={{ width: 24, height: 24, fontSize: 9, fontWeight: 600 }} />
            <span style={{ fontSize: 14, color: "var(--ink)" }}>{submitterName}</span>
          </div>
        </div>

        {receipt.notes && (
          <div style={{ marginBottom: 22 }}>
            <DetailRow label="Notes" value={receipt.notes} />
          </div>
        )}

        {/* Receipt image */}
        <div>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 8px" }}>Receipt image</p>
          {receipt.receipt_image_url ? (
            <a href={receipt.receipt_image_url} target="_blank" rel="noopener noreferrer" style={{ display: "block", borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", maxWidth: 280 }}>
              <img src={receipt.receipt_image_url} alt="Receipt" style={{ width: "100%", display: "block", objectFit: "cover" }} />
            </a>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", border: "1px dashed var(--dashed)", borderRadius: 12, color: "var(--muted-text)" }}>
              <ImageIcon size={16} />
              <span style={{ fontSize: 13 }}>No image attached</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (!mounted) return null
  return createPortal(overlay, document.body)
}

function EmptyBlock({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ padding: "56px 24px" }}>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
        {title}
      </h2>
      <p style={{ fontSize: 14, color: "var(--body)", maxWidth: 340, lineHeight: 1.6, margin: 0 }}>
        {subtitle}
      </p>
    </div>
  )
}

function AddCategoryModal({
  ministryId, teamId, onClose, onCreated,
}: {
  ministryId: string
  teamId: string
  onClose: () => void
  onCreated: (cat: ReceiptCategory) => void
}) {
  const [name, setName] = useState("")
  const [fund, setFund] = useState<string>("church")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) { setError("Please enter a category name."); return }
    setSaving(true); setError(null)
    const { data, error: err } = await createReceiptCategory({ ministryId, teamId, name, fund })
    if (err || !data) { setError(err ?? "Could not create category."); setSaving(false); return }
    onCreated(data)
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(19,16,26,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: "var(--cream)", borderRadius: 20, width: "100%", maxWidth: 420, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid var(--line)" }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: 20, color: "var(--ink)" }}>Add category</p>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--ivory)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} color="var(--body)" />
          </button>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input
              autoFocus
              type="text"
              placeholder="e.g. DG Dinners"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave() }}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Fund</label>
            <select value={fund} onChange={e => setFund(e.target.value)} style={inputStyle}>
              {FUND_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          {error && <p style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>}
        </div>
        <div style={{ padding: "12px 20px 20px", borderTop: "1px solid var(--line)" }}>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{ width: "100%", height: 46, background: "var(--plum)", color: "var(--cream)", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 600, cursor: saving || !name.trim() ? "default" : "pointer", opacity: saving || !name.trim() ? 0.6 : 1 }}
          >
            {saving ? "Adding…" : "Add category"}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--mono)",
  fontSize: 10,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted-text)",
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "var(--ivory)",
  color: "var(--ink)",
  fontSize: 14,
  fontFamily: "var(--sans)",
  outline: "none",
}
