"use client"

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react"

// ── FilterChip ─────────────────────────────────────────────────────────────
// Shared selectable-pill primitive (DESIGN_SYSTEM §4.4 pill-picker / §4.7
// category pill). A rounded, single-select chip used in filter/segment strips.
//
// tone="plum"  — the established filter look: selected fills plum with cream
//                text. Use where an active filter should read boldly.
// tone="ivory" — a calmer section/segmented selector: selected reads as an
//                ivory fill with a plum outline + plum label.
export function FilterChip({
  selected,
  onClick,
  children,
  tone = "plum",
  size = "sm",
  disabled,
  style,
  className,
  ...rest
}: {
  selected: boolean
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"]
  children: ReactNode
  tone?: "plum" | "ivory"
  size?: "sm" | "md"
  disabled?: boolean
  style?: CSSProperties
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "style" | "className">) {
  const toneStyle: CSSProperties =
    tone === "plum"
      ? selected
        ? { background: "var(--plum)", color: "var(--cream-on-dark)", border: "1px solid var(--plum)" }
        : { background: "var(--cream)", color: "var(--body)", border: "1px solid var(--line-2)" }
      : selected
        ? { background: "var(--ivory)", color: "var(--plum)", border: "1px solid var(--plum)" }
        : { background: "var(--cream)", color: "var(--body)", border: "1px solid var(--line-2)" }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        borderRadius: 999,
        fontFamily: "var(--font-inter)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        padding: size === "sm" ? "6px 14px" : "8px 18px",
        fontSize: size === "sm" ? 12.5 : 13.5,
        transition: "background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
        ...toneStyle,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
