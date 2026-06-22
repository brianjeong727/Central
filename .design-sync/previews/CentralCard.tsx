import { CentralCard, CardTitle } from "central"

export function StandardCard() {
  return (
    <div style={{ padding: 24, background: "#F1ECDE", maxWidth: 390 }}>
      <CentralCard variant="standard">
        <CardTitle>Friday Night Worship</CardTitle>
        <p style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--body)", marginTop: 10, lineHeight: 1.55 }}>
          This Friday at 7 PM — Founders Hall. Doors open at 6:30.
        </p>
      </CentralCard>
    </div>
  )
}

export function CardVariants() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 24, background: "#F1ECDE", maxWidth: 390 }}>
      <CentralCard variant="standard" padding={18}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", color: "var(--muted-text)", textTransform: "uppercase", marginBottom: 8 }}>Standard</div>
        <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)" }}>Default cream surface with solid border</div>
      </CentralCard>
      <CentralCard variant="callout" padding={18}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", color: "var(--muted-text)", textTransform: "uppercase", marginBottom: 8 }}>Callout</div>
        <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)" }}>Ivory surface — elevated, slightly warmer</div>
      </CentralCard>
      <CentralCard variant="inset" padding={18}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "1.4px", color: "var(--muted-text)", textTransform: "uppercase", marginBottom: 8 }}>Inset</div>
        <div style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--ink)" }}>Cream-3 surface — recessed, quieter</div>
      </CentralCard>
    </div>
  )
}
