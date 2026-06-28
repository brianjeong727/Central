"use client"

import { EYEBROW_STYLE } from "../components/shared"
import { TabPageHeader, PageTitle, PlanSubTabStrip } from "@/components/central"
import { FinanceWorkspace } from "../components/finance-workspace"

interface Props {
  ministryId: string
  userId: string
  userName: string
  userRole: string
  isAdmin: boolean
  isTreasurer: boolean
  isDGL: boolean
  activeSection: "reimbursements" | "budget" | "allocation"
  onSectionChange: (s: "reimbursements" | "budget" | "allocation") => void
}

export function GivingTab({ ministryId, userId, userName, userRole, isAdmin, isTreasurer, isDGL, activeSection, onSectionChange }: Props) {
  const canAccessReimbursements = isDGL || isTreasurer || isAdmin
  const canAccessBudget = isTreasurer || isAdmin

  const visibleSections: { id: "reimbursements" | "budget" | "allocation"; label: string }[] = [
    ...(canAccessReimbursements ? [{ id: "reimbursements" as const, label: "Reimbursements" }] : []),
    ...(canAccessBudget ? [{ id: "budget" as const, label: "Budget" }] : []),
    ...(canAccessBudget ? [{ id: "allocation" as const, label: "Allocation" }] : []),
  ]

  const sectionLabel = activeSection === "reimbursements" ? "Reimbursements" : "Budget"
  const sectionSubtitle = activeSection === "reimbursements" ? "Submit receipts and track reimbursement forms for ministry expenses." : "Track expenses, reimbursements, and per-fund spending targets."
  const monoStyle = EYEBROW_STYLE

  return (
    <div className="pb-28 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile header */}
      <div className="md:hidden px-5 pt-14 pb-5">
        <p style={monoStyle}>Finance · 2 Corinthians 9:7</p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, color: "var(--ink)", lineHeight: 1.05, margin: "14px 0 0", fontWeight: 400 }}>{sectionLabel}</h1>
        <p style={{ fontSize: 14, color: "var(--body)", marginTop: 8 }}>{sectionSubtitle}</p>
      </div>

      {/* Desktop header */}
      <TabPageHeader>
        <PageTitle title={sectionLabel} compact />
      </TabPageHeader>

      {/* Budget / Allocation sub-tab strip — desktop only, outside padded content div */}
      {(activeSection === "budget" || activeSection === "allocation") && canAccessBudget && (
        <div className="hidden md:block">
          <PlanSubTabStrip
            tabs={[
              { key: "budget", label: "Expenses" },
              { key: "allocation", label: "Allocation" },
            ]}
            active={activeSection}
            onChange={k => onSectionChange(k as "budget" | "allocation")}
          />
        </div>
      )}

      <div className="px-5 md:px-14 pt-6 md:pt-5 max-w-[740px] md:max-w-none md:flex-1 md:overflow-y-auto">

        {/* Mobile section tab strip */}
        {visibleSections.length > 1 && (
          <div className="flex gap-2 mb-6 md:hidden flex-wrap">
            {visibleSections.map(s => (
              <button key={s.id} onClick={() => onSectionChange(s.id)} style={{ padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500, border: activeSection === s.id ? "none" : "1px solid var(--line)", background: activeSection === s.id ? "var(--plum)" : "var(--cream)", color: activeSection === s.id ? "var(--cream)" : "var(--body)", cursor: "pointer" }}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Budget / Allocation sub-tab strip — mobile only */}
        {(activeSection === "budget" || activeSection === "allocation") && canAccessBudget && (
          <div className="md:hidden" style={{ marginBottom: 16 }}>
            <PlanSubTabStrip
              tabs={[
                { key: "budget", label: "Expenses" },
                { key: "allocation", label: "Allocation" },
              ]}
              active={activeSection}
              onChange={k => onSectionChange(k as "budget" | "allocation")}
            />
          </div>
        )}

        <FinanceWorkspace
          ministryId={ministryId}
          userId={userId}
          userName={userName}
          userRole={userRole}
          section={activeSection}
          onSectionChange={onSectionChange}
          canEditBudget={canAccessBudget}
          canAccessReimbursements={canAccessReimbursements}
          readOnly={false}
        />
      </div>
    </div>
  )
}
