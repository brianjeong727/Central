"use client"

// DESIGN_SYSTEM §4.17 — THE canonical modal container. Every modal/dialog in
// Central renders through this component; hand-rolled fixed-overlay panels are
// design debt. The anatomy is the curate-hero (HomeSlideManager) pattern,
// ratified 2026-07-04:
//
//   backdrop  rgba(19,16,26,0.55) ink veil, no blur, fade-in
//   panel     var(--cream-2) surface, radius var(--r-callout), NO border,
//             NO shadow — separation comes from the dark veil, not elevation
//   header    mono eyebrow (optional) over a serif 22/400 title, hairline below,
//             32px ivory circular X top-right
//   body      scrollable, 20px/24px padding
//   footer    optional right-aligned action row above a hairline
//   closes    X · backdrop click · Escape — all three, always
//
// Modals remain for CREATION/CONFIG ONLY — never navigation (§4.17). Callers
// conditionally render: `{open && <CentralModal …>}`.

import { ReactNode, useEffect } from "react"
import { X } from "lucide-react"

export function CentralModal({
  onClose,
  title,
  eyebrow,
  children,
  footer,
  maxWidth = 480,
  z = 200,
  sheet = false,
}: {
  onClose: () => void
  /** Serif panel title. Omit only for bare pickers that carry their own heading. */
  title?: string
  /** Mono eyebrow above the title (e.g. "Home hero"). */
  eyebrow?: string
  children: ReactNode
  /** Right-aligned action row rendered above a top hairline (confirm/submit rows). */
  footer?: ReactNode
  maxWidth?: number
  /** Override only when the modal must stack above another overlay (e.g. confirm-on-modal → 210). */
  z?: number
  /** Bottom-sheet on mobile (rounded top corners, pinned to the bottom edge); centered panel on desktop. */
  sheet?: boolean
}) {
  // Escape closes — standard across every modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className={`animate-backdrop-in ${sheet ? "flex items-end md:items-center" : "flex items-center"} justify-center`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: z,
        background: "rgba(19,16,26,0.55)",
        padding: sheet ? 0 : "0 20px",
      }}
      onClick={onClose}
    >
      <div
        className={sheet ? "animate-dialog-in rounded-t-[var(--r-callout)] md:rounded-[var(--r-callout)]" : "animate-dialog-in"}
        style={{
          background: "var(--cream-2)",
          ...(sheet ? {} : { borderRadius: "var(--r-callout)" }),
          width: "100%",
          maxWidth,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || eyebrow) && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              padding: "20px 24px",
              borderBottom: "1px solid var(--line)",
              flexShrink: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              {eyebrow && (
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted-text)" }}>
                  {eyebrow}
                </div>
              )}
              {title && (
                <h2 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 400, color: "var(--ink)", margin: eyebrow ? "4px 0 0" : 0 }}>
                  {title}
                </h2>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                border: "1px solid var(--line)",
                background: "var(--ivory)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
                color: "var(--ink)",
              }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
        )}

        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1, minHeight: 0 }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 10,
              padding: "14px 24px",
              borderTop: "1px solid var(--line)",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
