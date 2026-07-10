"use client"

import { ButtonHTMLAttributes, ReactNode } from "react"

// ── Central button system ────────────────────────────────────────────────────
// Buttons are assigned by SEMANTIC ROLE, not by ad-hoc color. There is exactly
// ONE loud (primary) button per view. Color follows role; size follows context;
// icons follow the fixed verb→icon map (see DESIGN_SYSTEM §4.3).
//
// Canonical roles:
//   primary       — the single most important action in a view (plum fill)
//   secondary     — supporting action beside primary (outline)
//   quiet         — low-stakes inline/text action (plum text, no chrome)
//   create        — "+ New X" actions (soft ivory)
//   destructive   — delete / archive default affordance (danger outline)
//   danger-solid  — the CONFIRM step of a destructive action only (danger fill)
//
// No near-black fills anywhere. The only dark-on-light case is the hero-invert
// (a cream button on a plum hero), handled at the call site.
type Variant =
  | "primary"
  | "secondary"
  | "quiet"
  | "create"
  | "destructive"
  | "danger-solid"
  // ── legacy (kept compiling during migration; map onto the roles above) ──
  | "plum-outline" // → secondary or quiet
  | "ghost" // → quiet
  | "soft-pill" // → pill/badge, not a button role

type Size = "sm" | "md"

const sizes: Record<Size, React.CSSProperties> = {
  sm: { padding: "8px 14px", fontSize: 13 },
  md: { padding: "11px 20px", fontSize: 14 },
}

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--plum)", color: "var(--cream)", border: "none", fontWeight: 500 },
  secondary: { background: "transparent", color: "var(--body)", border: "1px solid var(--line-2)", fontWeight: 500 },
  quiet: { background: "none", color: "var(--plum)", border: "none", fontWeight: 500, padding: "0" },
  create: { background: "var(--ivory)", color: "var(--ink)", border: "1px solid var(--line)", fontWeight: 500 },
  destructive: { background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", fontWeight: 500 },
  "danger-solid": { background: "var(--danger)", color: "var(--cream)", border: "none", fontWeight: 500 },
  // legacy
  "plum-outline": { background: "transparent", color: "var(--plum)", border: "1px solid var(--plum)", fontWeight: 500 },
  ghost: { background: "none", border: "none", color: "var(--muted-text)", padding: "0", fontSize: 12 },
  "soft-pill": { background: "var(--ivory)", color: "var(--plum-2)", border: "1px solid var(--line-2)", borderRadius: "999px", padding: "5px 12px", fontSize: 12, fontWeight: 500 },
}

interface CentralButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export function CentralButton({
  variant = "primary",
  size = "md",
  children,
  style,
  disabled,
  ...props
}: CentralButtonProps) {
  return (
    <button
      {...props}
      data-variant={variant}
      className={`central-btn ${props.className ?? ""}`}
      disabled={disabled}
      style={{
        fontFamily: "var(--sans)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        whiteSpace: "nowrap",
        borderRadius: "var(--r-input)",
        opacity: disabled ? 0.5 : 1,
        ...sizes[size],
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ── Icon-only button ─────────────────────────────────────────────────────────
// Square, chromeless, muted icon → ivory on hover. For gear / kebab / edit /
// close affordances. Pass the lucide icon as the child; default 28px square.
interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  dim?: number
  active?: boolean
}

export function IconButton({ children, dim = 28, active = false, style, disabled, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      className={`central-icon-btn ${props.className ?? ""}`}
      disabled={disabled}
      style={{
        width: dim,
        height: dim,
        borderRadius: "var(--r-chip)",
        background: active ? "var(--ivory)" : "transparent",
        border: "none",
        color: "var(--muted-text)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  )
}
