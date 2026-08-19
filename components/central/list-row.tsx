import { HTMLAttributes, ReactNode } from "react"

// Extends the plain div attributes so a row that must be KEYBOARD-REACHABLE can
// carry `role="button"` / `tabIndex` / `aria-label` / `onKeyDown` without being an
// actual <button>. That distinction is load-bearing wherever a row holds its own
// nested action (the open-groups Join button): a <button> may not contain another
// <button>, so the row is a div wearing the button role and the nested control
// stays a real focusable button.
interface ListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  last?: boolean
  hover?: boolean
  children: ReactNode
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
  ...rest
}: ListRowProps) {
  return (
    <div
      {...rest}
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
