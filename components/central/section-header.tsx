import { ReactNode, CSSProperties } from "react"
import { EYEBROW_STYLE } from "@/app/home/components/shared"

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
        <div style={EYEBROW_STYLE}>{eyebrow}</div>
        <h2
          style={{
            fontFamily: "var(--serif)",
            fontSize: titleSize,
            fontWeight: 600,
            margin: "4px 0 0",
            letterSpacing: "-0.02em",
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
