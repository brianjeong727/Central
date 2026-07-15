"use client"

import type { CSSProperties, ReactNode } from "react"
import { ArrowLeft, ChevronRight, Plus } from "lucide-react"

// ── Pocket primitives (mobile design system) ──────────────────────────────────
// The shared building blocks of every phone-width (`md:hidden`) surface, per
// mobile_design_system.md ("Pocket Daybreak", ratified July 2026). Pure and
// leaf-safe: this file imports nothing from app/. Chrome-row components that
// need app-side helpers (PocketChrome, PocketHeader) stay in
// app/home/components/pocket-header.tsx and compose these.
//
// Grammar recap:
//   PocketKicker      mono 10px section label (+ optional inline action)
//   PocketCard        tonal --ivory block, radius --r-pocket, no border
//   PocketRowCard     PocketCard at 6px 18px holding PocketRows
//   PocketRow         universal list row (chip · title/sub · right meta)
//   PocketFilterChip  exclusive-filter pill (plum on / ivory off)
//   PocketHeroCard    the ≤1-per-screen plum hero
//   PocketProgress    4px progress bar (ivory or plum colorway)
//   PocketDashedButton dashed add-affordance
//   PocketBackRow     "← Section" return row inside drilled-in screens
//   PocketChip        40px squircle letter monogram
//   PocketRoundButton 34px round chrome action (ghost | plum create)

// Mobile kicker label: 10px mono, +1.4px tracking. Deliberately NOT flattened
// into EYEBROW_STYLE (11px desktop eyebrow) — the pocket scale is one step down.
export const POCKET_KICKER_STYLE: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 10,
  letterSpacing: "1.4px",
  textTransform: "uppercase",
  color: "var(--muted-text)",
}

// Section kicker row: mono label + optional right-aligned action node (a quiet
// "+" create, a "See all ›", a collapse chevron). Margins match the shipped
// rhythm: 4px side inset, 8–10px above the card it introduces.
export function PocketKicker({ label, action, style }: {
  label: string
  action?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 4px 8px", ...style }}>
      <span style={{ ...POCKET_KICKER_STYLE, flex: 1 }}>{label}</span>
      {action}
    </div>
  )
}

// Tonal card — the standard mobile surface. No border, no shadow.
export function PocketCard({ children, padding = 18, onClick, style }: {
  children: ReactNode
  padding?: number | string
  onClick?: () => void
  style?: CSSProperties
}) {
  const base: CSSProperties = {
    background: "var(--ivory)",
    borderRadius: "var(--r-pocket)",
    padding,
    ...style,
  }
  if (onClick) {
    return (
      <button onClick={onClick} style={{ display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer", ...base }}>
        {children}
      </button>
    )
  }
  return <div style={base}>{children}</div>
}

// Tonal card holding PocketRows — the tight vertical padding lets the rows'
// own 13px padding breathe against the card edge.
export function PocketRowCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)", padding: "6px 18px", ...style }}>
      {children}
    </div>
  )
}

// The universal mobile list row: optional leading chip, 15/600 title (+ inline
// accessory icons), 13px muted one-line sub, and a right column that is either
// meta text, a time-over-unread-dot stack, or a drill-in chevron.
export function PocketRow({
  leading, title, titleAccessory, sub, time, showDot = false, meta, chevron = false, isLast = false, onClick,
}: {
  leading?: ReactNode
  title: string
  titleAccessory?: ReactNode
  sub?: string
  time?: string
  showDot?: boolean
  meta?: string
  chevron?: boolean
  isLast?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        background: "none", border: "none", textAlign: "left", cursor: "pointer",
        padding: "13px 0", borderBottom: isLast ? "none" : "1px solid var(--line-3)",
      }}
    >
      {leading}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          {titleAccessory}
        </span>
        {sub && (
          <span style={{ display: "block", fontSize: 13, color: "var(--muted-text)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
        )}
      </span>
      {(time || showDot) ? (
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          {time && <span style={{ fontSize: 11, color: "var(--faint)" }}>{time}</span>}
          {showDot && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--plum)" }} />}
        </span>
      ) : null}
      {meta && <span style={{ fontSize: 12, color: "var(--muted-text)", whiteSpace: "nowrap", flexShrink: 0 }}>{meta}</span>}
      {chevron && <ChevronRight style={{ width: 15, height: 15, color: "var(--faint)", flexShrink: 0 }} />}
    </button>
  )
}

// Exclusive-filter pill (mockup `.fchip`): ivory off / solid plum on. ≤3 short
// options per row; 4+ options should become screens or stacked sections.
export function PocketFilterChip({ label, active, onClick }: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: "none", borderRadius: 999, padding: "9px 16px",
        fontFamily: "var(--serif)", fontSize: 13,
        background: active ? "var(--plum)" : "var(--ivory)",
        color: active ? "var(--cream-on-dark)" : "var(--body)",
        fontWeight: active ? 600 : 500, cursor: "pointer", flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

// 4px pill progress bar. `onPlum` flips to the cream-on-plum colorway for use
// inside PocketHeroCard.
export function PocketProgress({ done, total, onPlum = false }: { done: number; total: number; onPlum?: boolean }) {
  const pct = total > 0 ? `${Math.round((done / total) * 100)}%` : "0%"
  return (
    <span style={{ flex: 1, height: 4, borderRadius: 999, overflow: "hidden", background: onPlum ? "color-mix(in srgb, var(--cream) 20%, transparent)" : "var(--line-2)" }}>
      <span style={{ display: "block", height: "100%", borderRadius: 999, width: pct, background: onPlum ? "var(--cream)" : "var(--plum)" }} />
    </span>
  )
}

// The one plum surface a screen may carry (≤1 per screen): dim-cream eyebrow,
// 21/600 headline, 13px meta, optional progress row. Whole card is the tap.
export function PocketHeroCard({ eyebrow, title, meta, progress, onClick }: {
  eyebrow: string
  title: string
  meta?: string
  progress?: { done: number; total: number } | null
  onClick: () => void
}) {
  const dimCream = "color-mix(in srgb, var(--cream) 62%, transparent)"
  return (
    <button onClick={onClick} style={{ textAlign: "left", width: "100%", background: "var(--plum)", color: "var(--cream-on-dark)", borderRadius: "var(--r-pocket)", padding: 20, border: "none", cursor: "pointer" }}>
      <div style={{ ...POCKET_KICKER_STYLE, color: dimCream }}>{eyebrow}</div>
      <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15, marginTop: 8 }}>{title}</div>
      {meta && <div style={{ fontSize: 13, color: "color-mix(in srgb, var(--cream) 68%, transparent)", marginTop: 5 }}>{meta}</div>}
      {progress && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
          <PocketProgress done={progress.done} total={progress.total} onPlum />
          <span style={{ whiteSpace: "nowrap", fontSize: 12, color: "color-mix(in srgb, var(--cream) 68%, transparent)" }}>{progress.done}/{progress.total} done</span>
        </div>
      )}
    </button>
  )
}

// Dashed add-affordance ("Add workspace", attachment slots).
export function PocketDashedButton({ label, onClick, icon }: { label: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: 18, background: "var(--ivory)", border: "1px dashed var(--dashed)", borderRadius: "var(--r-pocket)", color: "var(--plum)", cursor: "pointer", fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600 }}>
      {icon ?? <Plus style={{ width: 16, height: 16 }} strokeWidth={2.2} />} {label}
    </button>
  )
}

// "← Section" return row for screens drilled into from a hub — sits above the
// section content when the chrome row can't carry the back (single-file swaps).
export function PocketBackRow({ label, onBack, style }: { label: string; onBack: () => void; style?: CSSProperties }) {
  return (
    <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px 0 6px", marginBottom: 18, background: "transparent", border: "none", color: "var(--plum)", fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, cursor: "pointer", ...style }}>
      <ArrowLeft style={{ width: 18, height: 18 }} /> {label}
    </button>
  )
}

// 40px squircle monogram chip (mockup `.chip`): --line-2 tonal with a plum
// letter; `solid` inverts to a plum fill with a cream letter (ministry-wide chat).
export function PocketChip({ letter, solid = false, size = 40 }: { letter: string; solid?: boolean; size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 14, flexShrink: 0,
        display: "grid", placeItems: "center",
        fontFamily: "var(--serif)", fontSize: 13, fontWeight: 600,
        background: solid ? "var(--plum)" : "var(--line-2)",
        color: solid ? "var(--cream-on-dark)" : "var(--plum)",
      }}
    >
      {letter}
    </span>
  )
}

// 34px round chrome action button. `plum` = filled plum primary (the screen's
// single create); `ghost` = tonal --ivory. Icon supplied as children.
export function PocketRoundButton({
  variant = "ghost", onClick, ariaLabel, children,
}: {
  variant?: "plum" | "ghost"
  onClick: () => void
  ariaLabel: string
  children: ReactNode
}) {
  const plum = variant === "plum"
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 34, height: 34, borderRadius: 999, flexShrink: 0,
        display: "grid", placeItems: "center", border: "none", cursor: "pointer",
        background: plum ? "var(--plum)" : "var(--ivory)",
        color: plum ? "var(--cream-on-dark)" : "var(--body)",
        transition: "background var(--dur-fast)",
      }}
    >
      {children}
    </button>
  )
}
