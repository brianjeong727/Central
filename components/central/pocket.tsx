"use client"

import { Fragment, useEffect } from "react"
import type { CSSProperties, ReactNode } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, ChevronRight, Plus, Search, X } from "lucide-react"

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
    <span style={{ flex: 1, height: 4, borderRadius: 999, overflow: "hidden", background: onPlum ? "color-mix(in srgb, var(--cream) 20%, transparent)" : "var(--pocket-track)" }}>
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
        width: size, height: size, borderRadius: "var(--r-callout)", flexShrink: 0,
        display: "grid", placeItems: "center",
        fontFamily: "var(--serif)", fontSize: 13, fontWeight: 600,
        background: solid ? "var(--plum)" : "var(--pocket-track)",
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

// ── Net-new Pocket primitives (Daybreak v2, §4) ───────────────────────────────
// These extend the Pocket family for the phase-1 mobile redesign. Same leaf
// contract: no imports from app/. Consumed by nothing yet — screen migrations
// land in later phases.
//
//   PocketSheet         portaled bottom sheet (creation/config only)
//   PocketButton        pill button — primary / quiet / destructiveOutline
//   PocketFactsGrid     2-col mono-key / value grid (event & member detail)
//   PocketStatCard      ivory stat block (kicker · serif number · sub)
//   PocketSwitch        46×28 settings toggle
//   PocketSearchField   ivory search pill
//   PocketTag           mono 9px uppercase tag (default / role / outline)
//   PocketFilterChipRow horizontal chip rail wrapper for PocketFilterChip

// Portaled bottom sheet for creation/config flows (poll composer, new-event
// picker). Ink veil + cream panel with rounded top corners, a drag pill, a
// 21/600 title and a 34px ivory close circle. Sits on the modal tier (z 200;
// pass `zIndex` to stack over an already-open modal). Closes on Escape and
// veil tap. Body content via children.
export function PocketSheet({ title, onClose, children, zIndex = 200 }: {
  title: string
  onClose: () => void
  children: ReactNode
  zIndex?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      className="pocket-sheet-veil"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex,
        background: "var(--veil)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="pocket-sheet-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 430,
          background: "var(--cream)",
          borderTopLeftRadius: "var(--r-pocket)", borderTopRightRadius: "var(--r-pocket)",
          padding: "10px 20px calc(20px + env(safe-area-inset-bottom))",
          maxHeight: "88vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: 10 }}>
          <span style={{ width: 40, height: 4, borderRadius: 999, background: "var(--line-2)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <span style={{ fontFamily: "var(--serif)", fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)" }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, display: "grid", placeItems: "center", border: "none", background: "var(--ivory)", color: "var(--ink)", cursor: "pointer" }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        {children}
      </div>
      <style>{`
        @keyframes pocketSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes pocketSheetVeilIn{from{opacity:0}to{opacity:1}}
        .pocket-sheet-veil{animation:pocketSheetVeilIn 180ms ease-out}
        .pocket-sheet-panel{animation:pocketSheetUp 240ms cubic-bezier(0.23,1,0.32,1)}
        @media (prefers-reduced-motion: reduce){
          .pocket-sheet-veil,.pocket-sheet-panel{animation:none}
        }
      `}</style>
    </div>,
    document.body,
  )
}

// Pill button. `primary` = plum/cream (disabled → 45% opacity plum, never a
// washed-lilac secondary). `quiet` = plum text on a tonal fill — cream on a
// card, ivory on the page (`surface`). `destructiveOutline` = danger border +
// text on transparent, NEVER a filled red. Compact (36px) for the chrome row.
export function PocketButton({
  children, onClick, variant = "primary", compact = false, surface = "page", disabled = false, type = "button", style,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "primary" | "quiet" | "destructiveOutline"
  compact?: boolean
  surface?: "card" | "page"
  disabled?: boolean
  type?: "button" | "submit"
  style?: CSSProperties
}) {
  const base: CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 999, minHeight: compact ? 36 : 42, padding: "0 18px",
    fontFamily: "var(--serif)", fontSize: 13.5, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer", border: "none",
    transition: "background var(--dur-fast), opacity var(--dur-fast)",
  }
  let variantStyle: CSSProperties
  if (variant === "quiet") {
    variantStyle = { background: surface === "card" ? "var(--cream)" : "var(--ivory)", color: "var(--plum)" }
  } else if (variant === "destructiveOutline") {
    variantStyle = { background: "transparent", border: "1.5px solid var(--danger)", color: "var(--danger)" }
  } else {
    variantStyle = { background: "var(--plum)", color: "var(--cream-on-dark)", opacity: disabled ? 0.45 : 1 }
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variantStyle, ...style }}>
      {children}
    </button>
  )
}

// 2-col facts grid (auto/1fr): mono uppercase keys, 14/500 ink values. Unset
// values render an em dash in --faint. Replaces loose label/value rows on the
// event- and member-detail screens.
export function PocketFactsGrid({ items, style }: {
  items: { key: string; value?: string | null }[]
  style?: CSSProperties
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 16, rowGap: 12, alignItems: "baseline", ...style }}>
      {items.map((item, i) => (
        <Fragment key={i}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "1px", textTransform: "uppercase", color: "var(--muted-text)", whiteSpace: "nowrap" }}>{item.key}</span>
          <span style={{ fontSize: 14, fontWeight: 500, color: item.value ? "var(--ink)" : "var(--faint)" }}>{item.value || "—"}</span>
        </Fragment>
      ))}
    </div>
  )
}

// Ivory stat block: mono kicker, serif 22/600 number (mobile numeric weight),
// optional muted sub-line.
export function PocketStatCard({ kicker, value, sub, style }: {
  kicker: string
  value: ReactNode
  sub?: string
  style?: CSSProperties
}) {
  return (
    <div style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket-sm)", padding: 16, ...style }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: "var(--muted-text)" }}>{kicker}</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--muted-text)", marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// 46×28 settings toggle: --pocket-track off → plum on, 22px cream thumb. The
// button carries a ≥44px hit box (native button = Enter/Space operable).
export function PocketSwitch({ checked, onChange, ariaLabel }: {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      style={{ display: "grid", placeItems: "center", width: 46, minHeight: 44, border: "none", background: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}
    >
      <span style={{ position: "relative", width: 46, height: 28, borderRadius: 999, background: checked ? "var(--plum)" : "var(--pocket-track)", transition: "background var(--dur-fast)" }}>
        <span style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: "var(--cream)", transition: "left var(--dur-fast)" }} />
      </span>
    </button>
  )
}

// Ivory search pill: leading search glyph + borderless input, faint placeholder.
export function PocketSearchField({ value, onChange, placeholder = "Search", style }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  style?: CSSProperties
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--ivory)", borderRadius: "var(--r-pocket-sm)", padding: "12px 16px", ...style }}>
      <Search style={{ width: 16, height: 16, color: "var(--faint)", flexShrink: 0 }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pocket-search-input"
        style={{ flex: 1, minWidth: 0, border: "none", background: "none", outline: "none", fontFamily: "var(--serif)", fontSize: 15.5, color: "var(--ink)" }}
      />
      <style>{`.pocket-search-input::placeholder{color:var(--faint)}`}</style>
    </div>
  )
}

// Mono 9px uppercase tag pill. `default` = tonal; `role` = plum/cream (ADMIN,
// LEADER); `outline` = hairline outline for VISITOR.
export function PocketTag({ label, variant = "default" }: {
  label: string
  variant?: "default" | "role" | "outline"
}) {
  const byVariant: Record<string, CSSProperties> = {
    default: { background: "var(--pocket-track)", color: "var(--body)" },
    role: { background: "var(--plum)", color: "var(--cream-on-dark)" },
    outline: { background: "transparent", border: "1px solid var(--line-2)", color: "var(--body)" },
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", borderRadius: 999,
      padding: "3px 8px", fontFamily: "var(--mono)", fontSize: 9,
      letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1,
      ...byVariant[variant],
    }}>
      {label}
    </span>
  )
}

// Horizontal chip rail wrapping PocketFilterChip children — reuses the shipped
// `.pocket-chiprow` class (gap 8, hidden scrollbar; the -20px/+20px edge cancel
// lets chips scroll edge-to-edge inside a 20px-padded screen).
export function PocketFilterChipRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="pocket-chiprow" style={style}>
      {children}
    </div>
  )
}
