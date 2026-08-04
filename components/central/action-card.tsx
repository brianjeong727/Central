"use client"
import { CSSProperties, ReactNode } from "react"
import { ArrowRight } from "lucide-react"

// CARD-AS-BUTTON — a single prominent action that belongs to the list it sits at
// the foot of, deliberately NOT promoted to the page corner (Conv #15: the object
// header carries object config only). Icon chip + title + subtitle + drill arrow.
export function ActionCard({ icon, title, subtitle, onClick, disabled, trailing, style }: {
  icon: ReactNode
  title: string
  subtitle?: ReactNode
  onClick?: () => void
  disabled?: boolean
  // Replaces the default drill-in arrow when the card leads somewhere else.
  trailing?: ReactNode
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full border border-[var(--line-2)] enabled:hover:border-[var(--plum)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 18,
        background: "var(--cream)",
        borderRadius: "var(--r-card)",
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: "var(--r-input)",
          background: "var(--ivory)",
          color: "var(--plum)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>

      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>{title}</span>
        {subtitle !== undefined && subtitle !== null && subtitle !== false && (
          <span style={{ display: "block", fontSize: 13, color: "var(--muted-text)", marginTop: 4 }}>{subtitle}</span>
        )}
      </span>

      {trailing ?? <ArrowRight style={{ width: 16, height: 16, color: "var(--faint)", flexShrink: 0 }} strokeWidth={1.6} />}
    </button>
  )
}
