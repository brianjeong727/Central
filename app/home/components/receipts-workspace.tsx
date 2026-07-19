"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR from "swr"
import { Plus, Image as ImageIcon, Settings, Receipt } from "lucide-react"
import { TabPageHeader, PageTitle, PlanSubTabStrip, MonogramChip, SubpageShell, CentralModal, ContentActionButton, PocketChip, PocketFilterChip, PocketKicker, PocketRoundButton, useScrollResetOn } from "@/components/central"
import { EmptyState } from "./shared"
import { MobilePocketHub, PocketHubChrome } from "./mobile-pocket-hub"
import { useIsMobile } from "../use-is-mobile"
import { createClient } from "@/lib/supabase"
import { SubmitReceiptModal, STATUS_META, MobileFactsGrid } from "./finance-workspace"
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
  // null clears the selection back to the mobile Receipts hub (?rteam removed).
  onReceiptsTeamChange: (id: string | null) => void
  // Opens the active team's settings (members + president). Provided only when the
  // current user may manage that team (its president or a governance admin); the
  // gear is hidden otherwise.
  onOpenTeamSettings?: () => void
  // Mobile hub chrome (§2.1): back chevron exits Receipts to the workspace picker;
  // avatar taps through to the profile tab. Desktop ignores all three.
  onExitTeam?: () => void
  avatarUrl?: string | null
  onGoToProfile?: () => void
}

const FUND_OPTIONS = [
  { value: "church", label: "Church" },
  { value: "other", label: "Other" },
] as const

export function ReceiptsWorkspace({
  ministryId,
  userId,
  userName,
  teams,
  activeReceiptsTeamId,
  onReceiptsTeamChange,
  onOpenTeamSettings,
  onExitTeam,
  avatarUrl,
  onGoToProfile,
}: ReceiptsWorkspaceProps) {
  const isMobile = useIsMobile()

  // Auto-select the first team when none is chosen yet (e.g. landing via the
  // sidebar "Receipts" entry without an ?rteam param). Desktop only: on mobile
  // the no-selection state IS the hub landing (hub-first, sim ruling 2026-07-15).
  useEffect(() => {
    if (!isMobile && !activeReceiptsTeamId && teams.length > 0) {
      onReceiptsTeamChange(teams[0].id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReceiptsTeamId, teams, isMobile])

  const activeTeam = teams.find(t => t.id === activeReceiptsTeamId) ?? null

  // Mobile hub: per-team category counts for the row subs. Same RLS scope the
  // drilled category list resolves under, so the counts always match what the
  // drill will actually show. Fetched only while the hub is the visible surface.
  const supabaseHub = createClient()
  const atMobileHub = isMobile && !activeReceiptsTeamId && teams.length > 0
  const { data: hubCategoryCounts } = useSWR(
    atMobileHub ? (["receipts-hub-cat-counts", ministryId, teams.map(t => t.id).join(",")] as const) : null,
    async () => {
      const { data } = await supabaseHub
        .from("receipt_categories")
        .select("team_id")
        .eq("ministry_id", ministryId)
        .in("team_id", teams.map(t => t.id))
      const counts: Record<string, number> = {}
      for (const row of ((data ?? []) as { team_id: string }[])) counts[row.team_id] = (counts[row.team_id] ?? 0) + 1
      return counts
    },
  )

  const [categories, setCategories] = useState<ReceiptCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [showAddCategory, setShowAddCategory] = useState(false)
  // Owns the read-only receipt detail subpage (lifted out of CategoryContent so it
  // can render full-bleed, outside the padded content region — no double inset).
  const [detail, setDetail] = useState<{ receipt: ReceiptRow; categoryName: string; teamName: string } | null>(null)

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
  // Land each team/category swap at the top (window scroll on phone width).
  useScrollResetOn([activeReceiptsTeamId, activeCategoryId])
  const stripTabs = categories.map(c => ({ key: c.id, label: c.name }))

  function handleCategoryCreated(cat: ReceiptCategory) {
    setShowAddCategory(false)
    setCategories(prev => [...prev, cat])
    setActiveCategoryId(cat.id)
  }

  return (
    <>
      {/* Desktop header (TabPageHeader is hidden on mobile) — suppressed when a
          detail subpage is open so the subpage consumes the page header (§4.18)
          and the header doesn't add a ~52px sibling that double-scrolls the body. */}
      {!detail && (
      <TabPageHeader>
        {/* Compact workspace header (DESIGN_SYSTEM §3.1): 25px title, no eyebrow. */}
        <PageTitle
          title="Receipts"
          compact
        />
        {/* Zone B (DESIGN_SYSTEM §3.2): manage-the-object action by the title.
            Create ("Add category") lives in the Categories content header below. */}
        {teamId && onOpenTeamSettings && (
          <button
            onClick={onOpenTeamSettings}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg border border-[#E5E0D2] bg-[var(--cream-panel)] hover:bg-[#EFEAE0] transition-colors flex-shrink-0"
            title="Team settings"
          >
            <Settings className="w-4 h-4 text-[var(--body)]" />
          </button>
        )}
      </TabPageHeader>
      )}

      {detail ? (
        <ReceiptDetailOverlay
          receipt={detail.receipt}
          ministryId={ministryId}
          categoryName={detail.categoryName}
          teamName={detail.teamName}
          onClose={() => setDetail(null)}
        />
      ) : atMobileHub ? (
        /* ── Mobile hub landing (hub-first, sim ruling 2026-07-15): "Receipts"
           chrome + one row per team you can file receipts for; drilling a row
           selects that team (?rteam). Replaces the retired team-selector chips.
           px-5: workspace is mounted full-bleed, so it supplies its own inset. */
        <div className="md:hidden px-5" style={{ paddingTop: 12 }}>
          <MobilePocketHub
            teamName="Receipts"
            onBack={onExitTeam}
            avatar={onGoToProfile ? { userName, avatarUrl, onClick: onGoToProfile } : undefined}
            groups={[{
              label: "Your teams",
              rows: teams.map(t => {
                const n = hubCategoryCounts?.[t.id] ?? (hubCategoryCounts ? 0 : null)
                return {
                  leading: <PocketChip letter={t.name.charAt(0).toUpperCase()} />,
                  title: t.name,
                  subtitle: n == null ? "Receipt categories" : `${n} categor${n === 1 ? "y" : "ies"}`,
                  onClick: () => onReceiptsTeamChange(t.id),
                }
              }),
            }]}
          />
        </div>
      ) : (
      <>
      {/* Mobile drilled chrome — the team's name + back chevron to the Receipts
          hub + gear (§2.1 one header per screen). Desktop selects teams from the
          sidebar and never renders this. */}
      {activeTeam && (
        <div className="md:hidden px-5" style={{ paddingTop: 12 }}>
          <PocketHubChrome
            title={activeTeam.name}
            onBack={() => onReceiptsTeamChange(null)}
            onSettings={onOpenTeamSettings}
          />
        </div>
      )}

      {/* Categories content header (DESIGN_SYSTEM §3.2 Zone C): the create action
          for the collection lives by the collection's header, not the page title.
          Renders whenever a team is selected — even with zero categories. */}
      {teamId && (
        <>
          {/* Desktop categories header (serif title + ghost create). */}
          <div className="hidden md:flex items-center justify-between gap-3 px-14 pt-7 pb-3">
            <span style={{ fontFamily: "var(--serif)", fontSize: 19, fontWeight: 500, color: "var(--ink)" }}>Categories</span>
            <ContentActionButton label="Add category" variant="ghost" icon={<Plus style={{ width: 14, height: 14 }} />} onClick={() => setShowAddCategory(true)} />
          </div>
          {/* Mobile categories header: Pocket kicker + plum round create (the one
              plum-filled create on this screen). Top gap comes from the drilled
              chrome row's own bottom margin. */}
          <div className="flex md:hidden items-center justify-between px-5 pb-3">
            <PocketKicker label="Categories" style={{ margin: 0 }} />
            <PocketRoundButton variant="plum" ariaLabel="Add category" onClick={() => setShowAddCategory(true)}>
              <Plus style={{ width: 16, height: 16 }} />
            </PocketRoundButton>
          </div>
        </>
      )}

      {/* Category selector. Desktop: PlanSubTabStrip (convention #16, self-insets
          md:pl-14). Mobile: horizontal PocketFilterChip row (scrolls if >3). */}
      {teamId && categories.length > 0 && (
        <>
          <div className="hidden md:block">
            <PlanSubTabStrip
              tabs={stripTabs}
              active={activeCategoryId ?? ""}
              onChange={setActiveCategoryId}
            />
          </div>
          <div className="flex md:hidden px-5" style={{ gap: 8, overflowX: "auto", paddingBottom: 14, scrollbarWidth: "none" }}>
            {categories.map(c => (
              <PocketFilterChip
                key={c.id}
                label={c.name}
                active={c.id === activeCategoryId}
                onClick={() => setActiveCategoryId(c.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Content region */}
      <div className="px-5 md:px-14 py-7">
        {!teamId ? (
          <EmptyBlock
            title="No teams yet."
            subtitle="Join or govern a team to start tracking receipts."
          />
        ) : categories.length === 0 ? (
          <>
            {/* Desktop: editorial empty hero. */}
            <div className="hidden md:flex flex-col items-center justify-center text-center" style={{ padding: "56px 24px" }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", color: "var(--muted-text)", textTransform: "uppercase", marginBottom: 12 }}>
                No categories yet
              </div>
              <h2 style={{ fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", margin: "0 0 10px" }}>
                Create a category to start adding receipts
              </h2>
              <p style={{ fontSize: 14, color: "var(--body)", maxWidth: 360, lineHeight: 1.6, margin: 0 }}>
                Categories group receipts for {activeTeam?.name ?? "this team"} — like dinners, supplies, or events.
              </p>
            </div>
            {/* Mobile: quiet EmptyState grammar. */}
            <div className="md:hidden">
              <EmptyState
                icon={<Receipt style={{ width: 22, height: 22 }} />}
                title="No categories yet"
                subtitle={`Add a category to start tracking receipts for ${activeTeam?.name ?? "this team"}.`}
              />
            </div>
          </>
        ) : activeCategory ? (
          <CategoryContent
            key={activeCategory.id}
            ministryId={ministryId}
            userId={userId}
            teamId={teamId!}
            category={activeCategory}
            onOpenDetail={(receipt) => setDetail({ receipt, categoryName: activeCategory.name, teamName: activeTeam?.name ?? "" })}
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
  ministryId, userId, teamId, category, onOpenDetail,
}: {
  ministryId: string
  userId: string
  teamId: string
  category: ReceiptCategory
  onOpenDetail: (receipt: ReceiptRow) => void
}) {
  const supabase = createClient()
  const isMobile = useIsMobile()
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showSubmit, setShowSubmit] = useState(false)

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

  const submitButton = (
    <ContentActionButton label="Submit a receipt" icon={<Plus style={{ width: 14, height: 14 }} />} onClick={() => setShowSubmit(true)} />
  )

  const eyebrow = (
    <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-text)", margin: 0 }}>
      {category.name} · {fundLabel(category.fund)}
    </p>
  )

  return (
    <div>
      {/* Content header — submit always lives here, per the receipts workspace's
          canonical header-action pattern (CTA never inside the empty state). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        {eyebrow}
        {submitButton}
      </div>
      {loading ? null : receipts.length === 0 ? (
        <EmptyState
          // Quiet on mobile — dashed is reserved for add-affordances (§3.8).
          variant={isMobile ? "quiet" : "bordered"}
          icon={<Receipt style={{ width: 22, height: 22 }} />}
          title={`No receipts in ${category.name} yet`}
          subtitle="Submit your first receipt with Submit a receipt above."
        />
      ) : (
        <div style={{ border: isMobile ? "none" : "1px solid var(--line)", borderRadius: isMobile ? "var(--r-pocket)" : 14, overflow: "hidden", background: "var(--ivory)" }}>
          {receipts.map((r, i) => (
            <ReceiptOneLine
              key={r.id}
              receipt={r}
              last={i === receipts.length - 1}
              onClick={() => onOpenDetail(r)}
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
  receipt, last, onClick,
}: {
  receipt: ReceiptRow
  last: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="central-list-row"
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        padding: "11px 16px", background: "transparent", border: "none",
        borderBottom: last ? "none" : "1px solid var(--line-3)",
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

// Per-source status path — church signs off; external is grant-filed.
function memberAllocSteps(kind: "church" | "external") {
  return kind === "church"
    ? (["Submitted", "Approved", "Reimbursed"] as const)
    : (["Submitted", "Requested", "Reimbursed"] as const)
}

interface MemberAllocation {
  id: string
  amount: number
  status: string
  decision_reason: string | null
  fund_name: string
  fund_kind: "church" | "external"
}

// A single read-only source row in the member's split view: fund chip · amount ·
// status pill · per-source stepper. Mirrors the treasurer inbox split, no actions.
function MemberAllocationRow({ allocation: a }: { allocation: MemberAllocation }) {
  const isNegative = a.status === "rejected" || a.status === "declined"
  const steps = memberAllocSteps(a.fund_kind)
  const reached = a.status === "reimbursed" ? 2 : (a.status === "approved" || a.status === "requested") ? 1 : 0
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", background: "var(--cream)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", padding: "3px 9px", borderRadius: 999, background: "var(--plum-tint)", color: "var(--plum)", whiteSpace: "nowrap" }}>{a.fund_name}</span>
          <span style={{ fontSize: 14, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>${a.amount.toFixed(2)}</span>
        </div>
        <StatusPill status={a.status} />
      </div>
      {isNegative ? (
        <div style={{ background: "var(--cream)", border: "1px solid color-mix(in srgb, var(--danger) 30%, var(--cream))", borderRadius: 10, padding: "10px 12px" }}>
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
    </div>
  )
}

function ReceiptDetailOverlay({
  receipt, ministryId, categoryName, teamName, onClose,
}: {
  receipt: ReceiptRow
  ministryId: string
  categoryName: string
  teamName: string
  onClose: () => void
}) {
  const isMobile = useIsMobile()
  const supabase = createClient()

  const submitterName = receipt.submitted_by_name ?? "Unknown"
  const initials = (() => {
    const parts = submitterName.trim().split(" ")
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
  })()

  // The per-source split (RLS rfa_select lets the submitter read own-receipt rows).
  // fund_id is only part of a composite FK, so a PostgREST embed hint fails
  // silently — resolve fund name + kind via a separate query + Map.
  const { data: allocations } = useSWR(
    ["receipt-allocations", receipt.id] as const,
    async () => {
      const { data } = await supabase
        .from("receipt_fund_allocations")
        .select("id, fund_id, amount, status, decision_reason")
        .eq("receipt_id", receipt.id)
        .eq("ministry_id", ministryId)
        .order("created_at", { ascending: true })
      const rows = ((data ?? []) as Array<{
        id: string; fund_id: string; amount: number; status: string; decision_reason: string | null
      }>)
      const fundIds = Array.from(new Set(rows.map(r => r.fund_id)))
      const fundMeta = new Map<string, { name: string; kind: string }>()
      if (fundIds.length > 0) {
        const { data: fundRows } = await supabase
          .from("finance_funds")
          .select("id, name, kind")
          .in("id", fundIds)
          .eq("ministry_id", ministryId)
        for (const f of ((fundRows ?? []) as { id: string; name: string; kind: string }[])) {
          fundMeta.set(f.id, { name: f.name, kind: f.kind })
        }
      }
      return rows.map(row => {
        const f = fundMeta.get(row.fund_id)
        return {
          id: row.id,
          amount: Number(row.amount),
          status: row.status,
          decision_reason: row.decision_reason,
          fund_name: f?.name ?? "",
          fund_kind: (f?.kind === "church" ? "church" : "external") as "church" | "external",
        }
      })
    },
  )

  return (
    <SubpageShell crumbs={[{ label: categoryName, onClick: onClose }, { label: receipt.event_name || "Receipt" }]} width="full">
      <div>
        {/* Amount + rollup status */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 22 }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: isMobile ? 22 : 34, fontWeight: 600, color: "var(--ink)", margin: 0, letterSpacing: "-0.02em" }}>
            ${Number(receipt.amount).toFixed(2)}
          </p>
          <div style={{ marginTop: 6 }}><StatusPill status={receipt.status} /></div>
        </div>

        {/* ── Funding split (read-only per-source status) ── */}
        {allocations && allocations.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-text)", margin: "0 0 10px" }}>Funding split</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {allocations.map(a => <MemberAllocationRow key={a.id} allocation={a} />)}
            </div>
          </div>
        )}

        {/* Details */}
        {isMobile ? (
          <MobileFactsGrid facts={[
            { label: "Purchase date", value: new Date(receipt.purchase_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) },
            { label: "Category", value: categoryName || "—" },
            { label: "Team", value: teamName || "—" },
          ]} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 22 }}>
            <DetailRow label="Purchase date" value={new Date(receipt.purchase_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} />
            <DetailRow label="Category" value={categoryName} />
            <DetailRow label="Team" value={teamName || "—"} />
          </div>
        )}

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
    </SubpageShell>
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

  // CentralModal shell (§4.17); the submit stays a full-width plum action in the
  // footer slot.
  return (
    <CentralModal onClose={onClose} title="Add category" maxWidth={420}
      footer={
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{ width: "100%", height: 46, background: "var(--plum)", color: "var(--cream)", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 600, cursor: saving || !name.trim() ? "default" : "pointer", opacity: saving || !name.trim() ? 0.6 : 1 }}
        >
          {saving ? "Adding…" : "Add category"}
        </button>
      }
    >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
    </CentralModal>
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
