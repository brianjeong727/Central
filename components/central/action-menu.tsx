"use client"

import { ReactNode, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MoreHorizontal } from "lucide-react"
import { IconButton } from "./button"

// ── ActionMenu ───────────────────────────────────────────────────────────────
// Flip-aware, portal-based kebab / overflow action menu. Replaces the recurring
// hand-rolled `absolute top-8 right-0` dropdown that (a) clips off-screen at the
// viewport bottom and (b) gets cut off by any `overflow-hidden` card ancestor.
//
// Positioning: the panel is portaled to <body> at `position: fixed`, anchored
// from the trigger's getBoundingClientRect(). The panel measures its OWN height
// in useLayoutEffect (rendered invisible for the first frame) and flips ABOVE the
// trigger when placing below would clip the viewport bottom. Horizontal position
// is clamped inside the viewport. Approach mirrors the chat context-menu flip in
// app/home/tabs/message-row.tsx — reused here, not shared from there.
//
// Close on: outside click, Escape, scroll, resize (scroll-close matches the
// legacy DesktopActionMenu — simpler than live repositioning).
//
// components/central is a LEAF: no imports from app/.

export interface ActionMenuItem {
  key: string
  label: string
  icon?: ReactNode
  tone?: "default" | "danger"
  onSelect: () => void
}

interface ActionMenuProps {
  /** Flat item list. Ignored when `children` is provided. */
  items?: ActionMenuItem[]
  /** Custom menu body — receives `close` so callers can dismiss after acting.
   *  Use for menus that need section labels, radios, or dividers (e.g. Set role). */
  children?: (close: () => void) => ReactNode
  /** Align the panel's right edge (default) or left edge to the trigger. */
  align?: "right" | "left"
  /** Panel min-width (px). Defaults to 176 (legacy DesktopActionMenu width). */
  minWidth?: number
  /** Custom trigger. Falls back to the standard kebab IconButton. */
  renderTrigger?: (args: { open: boolean; toggle: (e: React.MouseEvent) => void }) => ReactNode
  /** Accessible label for the default kebab trigger. */
  triggerLabel?: string
}

const GAP = 4
const MARGIN = 8

// Row style — matches the legacy DesktopActionMenu item exactly.
const ITEM_CLASS =
  "w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors text-left"

export function ActionMenu({
  items,
  children,
  align = "right",
  minWidth = 176,
  renderTrigger,
  triggerLabel = "More actions",
}: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Reset pos here (not in the effect) so a reopened panel starts with pos===null
  // and renders invisible for one measure frame — avoids setState-in-effect.
  const close = () => {
    setOpen(false)
    setPos(null)
  }
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) close()
    else setOpen(true)
  }

  // Measure before paint: render the panel invisible, read its height, then flip
  // above when below would clip; clamp horizontally inside the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const menu = menuRef.current
    if (!anchor || !menu) return
    const compute = () => {
      const r = anchor.getBoundingClientRect()
      const mh = menu.offsetHeight
      const mw = menu.offsetWidth
      // Vertical: below unless it clips the viewport bottom → flip above.
      let top = r.bottom + GAP
      if (r.bottom + GAP + mh > window.innerHeight - MARGIN) {
        const above = r.top - GAP - mh
        top = above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - MARGIN - mh)
      }
      // Horizontal: hug the requested edge, then clamp into the viewport.
      let left = align === "right" ? r.right - mw : r.left
      left = Math.min(left, window.innerWidth - MARGIN - mw)
      left = Math.max(MARGIN, left)
      setPos({ top, left })
    }
    compute()
    // Re-measure if the panel's height changes after mount.
    const ro = new ResizeObserver(compute)
    ro.observe(menu)
    return () => ro.disconnect()
  }, [open, align])

  // Dismiss on outside click / Escape / scroll / resize.
  useLayoutEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const onScroll = () => close()
    const onResize = () => close()
    document.addEventListener("mousedown", onPointerDown, true)
    document.addEventListener("keydown", onKey)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onResize)
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true)
      document.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onResize)
    }
  }, [open])

  return (
    <span ref={anchorRef} style={{ display: "inline-flex" }}>
      {renderTrigger ? (
        renderTrigger({ open, toggle })
      ) : (
        <IconButton onClick={toggle} active={open} aria-label={triggerLabel}>
          <MoreHorizontal size={16} />
        </IconButton>
      )}
      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            data-testid="action-menu"
            className="bg-[var(--cream-panel)] rounded-xl border border-[var(--line)] py-1 z-[200]"
            style={{
              position: "fixed",
              top: pos ? pos.top : 0,
              left: pos ? pos.left : 0,
              minWidth,
              visibility: pos ? "visible" : "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {children
              ? children(close)
              : items?.map((it) => (
                  <button
                    key={it.key}
                    onClick={(e) => {
                      e.stopPropagation()
                      close()
                      it.onSelect()
                    }}
                    className={
                      it.tone === "danger"
                        ? `${ITEM_CLASS} text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]`
                        : `${ITEM_CLASS} text-[var(--ink)] hover:bg-[var(--cream-2)]`
                    }
                  >
                    {it.icon}
                    {it.label}
                  </button>
                ))}
          </div>,
          document.body,
        )}
    </span>
  )
}
