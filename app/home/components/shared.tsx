"use client"

import { useState, useEffect, useRef } from "react"

// ── Shared design tokens ──────────────────────────────────────────────────────
// EYEBROW_STYLE / MONO_STYLE are canonically defined in components/central/typography.ts
// (the leaf layer) and re-exported here so existing app-layer importers keep working.
export { EYEBROW_STYLE, MONO_STYLE } from "@/components/central/typography"

// ── Shared brand mark ─────────────────────────────────────────────────────────

export function RingCrossLogo({ size = 32, color = "var(--plum)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <path d="M70 28 A32 32 0 1 0 70 72" stroke={color} strokeWidth="8" strokeLinecap="round" />
      <circle cx="50" cy="50" r="6" fill={color} />
    </svg>
  )
}

// ── UI atoms ──────────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-normal tracking-[0.15em] uppercase text-[var(--muted-text)]">{children}</span>
  )
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 rounded-full border-2 border-[var(--plum)]/20 border-t-[var(--plum)] animate-spin" />
    </div>
  )
}

// Reliable overlay entrance.
// Two bugs kill CSS keyframe/transition animations on React-mounted elements:
//   1. `transition` set simultaneously with value change → browser skips it
//   2. No forced reflow → browser never registers the "from" state
// Fix: always define transition, use offsetHeight to force layout registration,
// then a single RAF to schedule the value change on the next paint cycle.
export function AnimateIn({
  children,
  className = "",
  style,
  animate = true,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  animate?: boolean
}) {
  const [visible, setVisible] = useState(!animate)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!animate) return
    const el = ref.current
    if (!el) return
    // Force the browser to register the initial opacity:0 / translateY state
    // before we schedule the change. Without this, browsers may coalesce
    // the initial render + the state update into a single paint.
    void el.offsetHeight
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [animate])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...(animate
          ? {
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(28px)",
              // Transition must ALWAYS be defined (never conditional) so it is
              // already in place when the value changes on the next RAF tick.
              transition:
                "opacity 350ms cubic-bezier(0.23,1,0.32,1), transform 350ms cubic-bezier(0.23,1,0.32,1)",
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center animate-fade-up">
      <div className="w-14 h-14 rounded-2xl bg-[var(--cream-panel)] border border-[var(--line)] flex items-center justify-center text-[var(--muted-text)]">
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-[var(--ink)]/60">{title}</p>
        <p className="text-[13px] text-[var(--body)]/50 mt-0.5">{subtitle}</p>
      </div>
    </div>
  )
}

const ICON_SVG: Record<string, React.ReactNode> = {
  // emoji keys — legacy teams stored these as icons
  "🎵": <><path d="M9 18V6l11-3v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="15" r="3"/></>,
  "📖": <><path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2zM22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/></>,
  "🏛️": <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  "💻": <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  "👥": <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  // string keys — new teams use these
  "music":     <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></>,
  "book":      <><path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2zM22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/></>,
  "users":     <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  "slides":    <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  "chat":      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
  "plan":      <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  "calendar":  <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></>,
  "globe":     <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  "sparkle":   <><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><path d="m6 6 3 3M15 15l3 3M6 18l3-3M15 9l3-3"/></>,
  "clipboard": <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></>,
  // feature icon keys
  "set":       <><path d="M9 18V6l11-3v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="15" r="3"/></>,
  "sliders":   <><path d="M4 6h11M19 6h1M4 12h5M13 12h7M4 18h13M21 18h-1"/><circle cx="17" cy="6" r="2"/><circle cx="11" cy="12" r="2"/><circle cx="19" cy="18" r="2"/></>,
  "chart":     <><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></>,
  "seedling":  <path d="M7 20s-2-8 5-13c0 0 2 5 6 7l-1 6H7zM12 7s0 4-3 8"/>,
  "dollar":    <><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
}

export function PlanLineIcon({ iconKey, bg = "var(--plum)", fg = "var(--cream-on-dark)", size = 40, radius = 999 }: { iconKey: string; bg?: string; fg?: string; size?: number; radius?: number }) {
  const paths = ICON_SVG[iconKey] ?? ICON_SVG["clipboard"]
  return (
    <div style={{ width: size, height: size, borderRadius: radius, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {paths}
      </svg>
    </div>
  )
}

// Canonical sidebar nav item style — used by DesktopSidebar and all plan sub-navs.
// Keeps active/inactive/danger states consistent across every context panel.
export function sidebarItemStyle(active?: boolean, danger?: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: "var(--r-chip)",
    cursor: "pointer",
    background: active ? "var(--ivory)" : "transparent",
    color: danger ? "var(--danger)" : active ? "var(--ink)" : "var(--body)",
    fontSize: 13,
    fontWeight: active ? 500 : 400,
    border: "none",
    width: "100%",
    textAlign: "left" as const,
    fontFamily: "var(--sans)",
    borderLeftWidth: 2,
    borderLeftStyle: "solid" as const,
    borderLeftColor: active ? "var(--plum)" : "transparent",
    transition: "background 100ms ease",
  }
}

export function PlanSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400, color: "var(--ink)", letterSpacing: "-0.01em" }}>
        {children}
      </span>
      <div className="flex-1 h-px bg-[var(--line)]" />
    </div>
  )
}
