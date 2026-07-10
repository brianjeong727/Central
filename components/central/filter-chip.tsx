"use client"

import type { ButtonHTMLAttributes, CSSProperties, ReactNode, Ref } from "react"

// ── FilterChip ─────────────────────────────────────────────────────────────
// Shared selectable-pill primitive (DESIGN_SYSTEM §4.4 pill-picker / §4.7
// category pill). A rounded, single-select chip used in filter/segment strips.
//
// ONE selected-state grammar (R4, ratified 2026-07-09): selected = plum-tint
// bg + plum text + plum border; unselected = cream bg + body text + line-2
// border. The `tone` prop is retained for backward compat (no call-site churn)
// but both tones now render this single grammar — the tone fork is retired.
export function FilterChip({
  selected,
  onClick,
  children,
  tone = "plum",
  size = "sm",
  disabled,
  style,
  className,
  buttonRef,
  ...rest
}: {
  selected: boolean
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"]
  children: ReactNode
  /** @deprecated tone fork retired (R4) — both values render the one grammar. Kept for backward compat. */
  tone?: "plum" | "ivory"
  size?: "sm" | "md"
  disabled?: boolean
  style?: CSSProperties
  className?: string
  /** Ref to the underlying <button> (for roving-tabindex focus management). */
  buttonRef?: Ref<HTMLButtonElement>
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "style" | "className">) {
  const toneStyle: CSSProperties = selected
    ? { background: "var(--plum-tint)", color: "var(--plum)", border: "1px solid var(--plum)" }
    : { background: "var(--cream)", color: "var(--body)", border: "1px solid var(--line-2)" }

  return (
    <button
      ref={buttonRef}
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
