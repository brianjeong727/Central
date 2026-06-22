import { StatCard } from "central"

export function MinistryStats() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 24, background: "#F1ECDE", maxWidth: 390 }}>
      <StatCard eyebrow="Members" value={47} sub="active this semester" />
      <StatCard eyebrow="Attendance" value="82%" sub="avg last 4 weeks" />
    </div>
  )
}

export function FinanceStats() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 24, background: "#F1ECDE", maxWidth: 390 }}>
      <StatCard eyebrow="Budget" value="$4,200" sub="allocated this month" />
      <StatCard eyebrow="Spent" value="$1,850" sub="72 days remaining" />
    </div>
  )
}

export function ZeroState() {
  return (
    <div style={{ padding: 24, background: "#F1ECDE", maxWidth: 390 }}>
      <StatCard eyebrow="Responses" value={0} sub="No responses yet" />
    </div>
  )
}
