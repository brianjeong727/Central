import { ReactNode, CSSProperties } from "react"

interface CardTitleProps {
  children: ReactNode
  size?: number
  italic?: boolean
  style?: CSSProperties
}

export function CardTitle({ children, size = 20, italic = false, style }: CardTitleProps) {
  return (
    <div
      style={{
        fontFamily: "var(--serif)",
        fontSize: size,
        fontWeight: 400,
        lineHeight: 1.2,
        letterSpacing: "-0.2px",
        color: "var(--ink)",
        ...(italic && { fontStyle: "italic" }),
        ...style,
      }}
    >
      {children}
    </div>
  )
}
