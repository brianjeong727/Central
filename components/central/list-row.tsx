import { CSSProperties, MouseEventHandler, ReactNode } from "react"

interface ListRowProps {
  last?: boolean
  hover?: boolean
  onClick?: MouseEventHandler<HTMLDivElement>
  children: ReactNode
  style?: CSSProperties
  className?: string
}

// §8.3 table-row pattern: a bottom hairline divider (--line-3), chip-radius
// hover highlight, and an optional --cream-2 hover background. The row imposes
// NO layout — callers pass their own grid/flex via `style`.
export function ListRow({
  last = false,
  hover = true,
  onClick,
  children,
  style,
  className,
}: ListRowProps) {
  return (
    <div
      onClick={onClick}
      className={[hover ? "central-list-row" : "", className].filter(Boolean).join(" ")}
      style={{
        borderBottom: last ? "none" : "1px solid var(--line-3)",
        borderRadius: "var(--r-chip)",
        ...style,
      }}
    >
      {children}
    </div>
  )
}
