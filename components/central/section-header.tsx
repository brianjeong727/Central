import { ReactNode, CSSProperties } from "react"

const EYEBROW: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: "1.4px",
  color: "var(--muted-text)",
  textTransform: "uppercase",
}

interface SectionHeaderProps {
  eyebrow: string
  title: string
  titleSize?: number
  action?: ReactNode
  style?: CSSProperties
}

export function SectionHeader({ eyebrow, title, titleSize = 28, action, style }: SectionHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", ...style }}>
      <div>
        <div style={EYEBROW}>{eyebrow}</div>
        <h2
          style={{
            fontFamily: "var(--serif)",
            fontSize: titleSize,
            fontWeight: 400,
            margin: "4px 0 0",
            letterSpacing: "-0.3px",
            color: "var(--ink)",
            lineHeight: 1.1,
          }}
        >
          {title}
        </h2>
      </div>
      {action}
    </div>
  )
}
