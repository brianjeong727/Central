"use client"

import { ReactNode } from "react"

// Body-scale action button (DESIGN_SYSTEM §3.2) — height 36, sized to live in a
// ContentHeader's action slot in the body (not a compact page header). THE canonical
// body action button. `primary` (plum fill) = create actions; `ghost` (hairline
// outline) = object actions. Tokens only.
export function ContentActionButton({ label, onClick, icon, variant = "primary", disabled, title }: {
  label: string
  onClick?: () => void
  icon?: ReactNode
  variant?: "primary" | "ghost"
  disabled?: boolean
  title?: string
}) {
  const primary = variant === "primary"
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: 36,
        padding: "0 18px",
        fontSize: 14,
        fontWeight: 500,
        fontFamily: "var(--font-inter)",
        borderRadius: "var(--r-chip)",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        background: primary ? "var(--plum)" : "transparent",
        color: primary ? "var(--cream)" : "var(--body)",
        border: primary ? "none" : "1px solid var(--line)",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {icon}
      {label}
    </button>
  )
}
