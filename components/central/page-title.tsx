import { ReactNode, CSSProperties } from "react"

interface PageTitleProps {
  eyebrow: string
  title: string
  titleSize?: number
  children?: ReactNode
  style?: CSSProperties
}

export function PageTitle({ eyebrow, title, titleSize = 52, children, style }: PageTitleProps) {
  return (
    <div style={style}>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "1.4px",
          color: "var(--muted-text)",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </div>
      <h1
        style={{
          fontFamily: "var(--serif)",
          fontSize: titleSize,
          fontWeight: 400,
          letterSpacing: titleSize >= 44 ? "-0.6px" : "-0.4px",
          color: "var(--ink)",
          lineHeight: 1.05,
          margin: "12px 0 0",
        }}
      >
        {title}
      </h1>
      {children}
    </div>
  )
}
