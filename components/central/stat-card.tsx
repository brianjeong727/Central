import { CSSProperties } from "react"

const EYEBROW: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: "1.4px",
  color: "var(--muted-text)",
  textTransform: "uppercase",
}

interface StatCardProps {
  eyebrow: string
  value: string | number
  sub?: string
  valueSize?: number
  style?: CSSProperties
}

export function StatCard({ eyebrow, value, sub, valueSize = 36, style }: StatCardProps) {
  return (
    <div
      style={{
        padding: "18px 22px",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-callout)",
        background: "var(--cream)",
        ...style,
      }}
    >
      <div style={EYEBROW}>{eyebrow}</div>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: valueSize,
          marginTop: 8,
          color: "var(--ink)",
          letterSpacing: "-0.5px",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  )
}
