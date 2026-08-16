"use client"

import { Fragment, useEffect } from "react"
import type { CSSProperties, ReactNode } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react"
import { useBackIntent } from "@/lib/back-intent"

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

// ── THE chrome-row box (Convention #27) ───────────────────────────────────────
// Every phone-width screen opens with ONE chrome row, and every one of them sits
// at the same height: 12px above the title, 10px below, 20px in from the edge.
// This was four hand-typed copies and they drifted — Home sat at 14, the workspace
// hub inherited its parent's 24, and Directory shipped `pt-14` (56px), so drilling
// between screens visibly bounced the title up and down. One constant now, consumed
// by PocketChrome, PocketHeader, PocketHubChrome and SubpageShell's mobile row.
//
// PAD_Y is the part that must never vary — it is the vertical rhythm Brian ratified
// (2026-08-05, "the Welcome Week view has less space above it, I like that better").
// PAD_X is separate because a chrome row nested inside an already-inset wrapper
// (PocketHubChrome, PocketHeader) must NOT re-apply the horizontal gutter — see
// Convention #26.
export const POCKET_CHROME_PAD_Y = { paddingTop: 12, paddingBottom: 10 } as const
export const POCKET_CHROME_PAD_X = 20

// The chrome row's TITLE type. PAD_Y pinned where the row sits; nothing pinned how
// the title looks, so five chromes drifted apart: tab roots at 22, the announcements
// row and SubpageShell at 20, PocketHubChrome silently dropping 22→20 whenever it
// carried an action, and the SubpageShell back-label at 15 in PLUM — which read as a
// small link where every sibling screen has a header (ratified 22/600 ink, 2026-08-08).
//
// A back-label consumes this TOO. "‹ Directory" is the same header as the Directory
// root's, not a lesser thing: the chrome names the SECTION you came from while the
// body names the page (an announcement's date kicker + headline, a member's identity
// card). That is what keeps the two grammars from ever duplicating words — and why
// the fix is one type ramp, not one title source.
export const POCKET_CHROME_TITLE = {
  fontFamily: "var(--serif)",
  fontSize: 22,
  fontWeight: 600,
  letterSpacing: "-0.02em",
  lineHeight: 1.1,
  color: "var(--ink)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const

// Top padding for a chrome row inside a SHELL-ESCAPING overlay (`fixed inset-0`:
// ChatScreen, chat settings, the create-chat screen). The app shell root owns
// `env(safe-area-inset-top)` for everything mounted inside it — an overlay pinned
// to the viewport escapes that, so it must add the inset itself, then the SAME
// 12px the chrome row gets everywhere else.
//
// This shipped as three hand-typed copies of `max(env(safe-area-inset-top),48px)`.
// The 48px FLOOR was the bug: wherever the inset reports 0 (browser, simulator, a
// notchless device) chat opened 36px lower than every other screen, which is the
// one place the app visibly broke its own chrome rhythm (Convention #27).
// A Tailwind class rather than an inline style so per-site `md:` overrides still win.
//
// Use this when the element IS the chrome row (ChatScreen's own header).
export const POCKET_OVERLAY_PAD_TOP_CLS = "pt-[calc(env(safe-area-inset-top)+12px)]"

// Use this when the overlay HOSTS a chrome component that already owns its 12px
// (a `SubpageShell` / `PocketChrome` inside a `fixed inset-0` wrapper). Adding the
// full pad at both levels stacks them — chat settings landed at 24-30px instead of
// 12-19 — which is Convention #26's double-gutter bug in the vertical direction.
// The wrapper contributes the safe-area inset ONLY; the chrome row contributes the 12.
export const POCKET_OVERLAY_INSET_CLS = "pt-[env(safe-area-inset-top)]"

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
    // overflow:hidden so a child that bleeds to the card edge (a swiped row's
    // action panel, SwipeActionRow) is clipped BY the radius instead of squaring
    // off the corner. Menus are unaffected — ActionMenu portals to body precisely
    // so an overflow-hidden ancestor can never clip it (Convention #20).
    <div style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)", overflow: "hidden", padding: "6px 18px", ...style }}>
      {children}
    </div>
  )
}

// The universal mobile list row: optional leading chip, 15/600 title (+ inline
// accessory icons), 13px muted one-line sub, and a right column that is either
// meta text, a time-over-unread-dot stack, or a drill-in chevron.
//
// `titleDim` de-emphasises the TITLE for a row that is still real and still
// tappable but no longer live (today: a DM whose counterpart deleted their
// account). It drops to `--muted-text`, the tertiary TEXT token — never opacity
// (which crushes contrast below AA) and never `--faint` (a non-text token for
// placeholders/arrows). Size, weight and every other part of the row are
// unchanged: de-prioritised, not disabled.
export function PocketRow({
  leading, title, titleAccessory, titleDim = false, sub, time, showDot = false, meta, chevron = false, isLast = false, onClick,
}: {
  leading?: ReactNode
  title: string
  titleAccessory?: ReactNode
  titleDim?: boolean
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
      // `data-pocket-row` is how e2e/mobile-screen-sweep DISCOVERS screens. This is
      // the one drill-in primitive on phone width, so walking every row reachable
      // from a hub reaches every hub-and-spoke screen — the sweep never has to keep
      // a hand-written list of screen names in sync with the app, and a NEW section
      // is covered by the margin rules the day it ships.
      data-pocket-row={title}
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%",
        background: "none", border: "none", textAlign: "left", cursor: "pointer",
        padding: "13px 0", borderBottom: isLast ? "none" : "1px solid var(--line-3)",
      }}
    >
      {leading}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: titleDim ? "var(--muted-text)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
          {titleAccessory}
        </span>
        {sub && (
          <span style={{ display: "block", fontSize: 13, color: "var(--muted-text)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
        )}
      </span>
      {(time || showDot) ? (
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          {time && <span style={{ fontSize: 11, color: "var(--muted-text)" }}>{time}</span>}
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
    <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px 0 6px", marginBottom: 18, background: "transparent", border: "none", color: "var(--body)", fontFamily: "var(--serif)", fontSize: 15, fontWeight: 600, cursor: "pointer", ...style }}>
      <ChevronLeft style={{ width: 18, height: 18 }} strokeWidth={1.7} /> {label}
    </button>
  )
}

// 40px squircle chip (mockup `.chip`): --pocket-track tonal holding a plum
// letter OR a plum stroked icon (§4 Row contract — "plum stroke icon or
// initial"); `solid` inverts to a plum fill with cream content (ministry-wide
// chat). `icon` wins over `letter` when both are passed.
export function PocketChip({ letter, icon, solid = false, size = 40 }: { letter?: string; icon?: ReactNode; solid?: boolean; size?: number }) {
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
      {icon ?? letter}
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
  // Android hardware/gesture back dismisses the sheet, same as Escape and the
  // backdrop. Topmost-wins comes free from the LIFO stack.
  useBackIntent(onClose)

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
export function PocketSearchField({ value, onChange, placeholder = "Search", style, onFocus, trailing, autoFocus }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  style?: CSSProperties
  /** Fired on focus — search surfaces use it to enter their search mode. */
  onFocus?: () => void
  /** Optional right-slot node (a clear/close control while searching). */
  trailing?: ReactNode
  autoFocus?: boolean
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--ivory)", borderRadius: "var(--r-pocket-sm)", padding: "12px 16px", ...style }}>
      <Search style={{ width: 16, height: 16, color: "var(--faint)", flexShrink: 0 }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="pocket-search-input"
        style={{ flex: 1, minWidth: 0, border: "none", background: "none", outline: "none", fontFamily: "var(--serif)", fontSize: 15.5, color: "var(--ink)" }}
      />
      {trailing}
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
