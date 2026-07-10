import { ReactNode, CSSProperties } from "react"
import { EYEBROW_STYLE } from "./typography"

interface PageTitleProps {
  // Omit to suppress the eyebrow entirely — title top-spacing tightens automatically.
  eyebrow?: string
  title: ReactNode
  // Explicit size override; defaults to 44 (landing) or 25 (compact). Only two
  // title tiers exist (R1, ratified 2026-07-09) — the former 36px tier is retired.
  titleSize?: number
  // Planning/work/detail pages: no eyebrow + 25px title. Independent from eyebrow.
  compact?: boolean
  children?: ReactNode
  style?: CSSProperties
}

export function PageTitle({ eyebrow, title, titleSize, compact = false, children, style }: PageTitleProps) {
  const resolvedSize = titleSize ?? (compact ? 25 : 44)
  const showEyebrow = !!eyebrow

  return (
    <div style={style}>
      {showEyebrow && (
        <div style={EYEBROW_STYLE}>{eyebrow}</div>
      )}
      <h1
        style={{
          fontFamily: "var(--serif)",
          fontSize: resolvedSize,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--ink)",
          lineHeight: 1.05,
          margin: showEyebrow ? "12px 0 0" : 0,
        }}
      >
        {title}
      </h1>
      {children}
    </div>
  )
}
