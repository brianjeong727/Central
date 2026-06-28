"use client"

import { useState, useEffect, useCallback } from "react"
import { X } from "lucide-react"
import { TabPageHeader, PageTitle, PlanSubTabStrip } from "@/components/central"
import { HeaderActionButton } from "./shared"
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
        ) : (
          /* Placeholder content region for the active category. Submit + entries +
             detail land in B2 — this just lays out the region. */
          <div
            style={{
              background: "var(--ivory)",
              border: "1px solid var(--line)",
              borderRadius: 16,
              padding: "40px 28px",
              textAlign: "center",
            }}
          >
            <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 8px" }}>
              {activeCategory?.name ?? ""} · {FUND_OPTIONS.find(f => f.value === activeCategory?.fund)?.label ?? activeCategory?.fund}
            </p>
            <p style={{ fontSize: 14, color: "var(--muted-text)", margin: 0 }}>
              No receipts yet.
            </p>
          </div>
        )}
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
