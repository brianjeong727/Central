import { ReactNode, CSSProperties } from "react"
import { EYEBROW_STYLE } from "./typography"

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  titleSize?: number
  action?: ReactNode
  style?: CSSProperties
  // Mobile-only opt-in (mobile design system §1): drop the serif title on phone
  // width so a section is labelled by its eyebrow-as-kicker + action, never a
  // 20px title that restates the drilled-in Pocket chrome. `md:` restores the
  // title → DESKTOP RENDERING IS BYTE-IDENTICAL. Used only by settings subpages.
  hideTitleOnMobile?: boolean
}

export function SectionHeader({ eyebrow, title, titleSize = 28, action, style, hideTitleOnMobile = false }: SectionHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", ...style }}>
      <div>
        {eyebrow && <div style={EYEBROW_STYLE}>{eyebrow}</div>}
        <h2
          className={hideTitleOnMobile ? "hidden md:block" : undefined}
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
