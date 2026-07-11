"use client"

import { useEffect, useRef, useState } from "react"
import { SlidersHorizontal, ChevronDown, Check } from "lucide-react"

// ── Filter dropdown ───────────────────────────────────────────────────────────
// Single trigger that surfaces the active option's label; opens an anchored
// popover of the options. Dismisses on outside-click + Escape. Subtle
// scale/opacity entrance per emil-design-eng. `align` controls the menu's
// horizontal anchor so it can sit under a left- or right-aligned control.
export function FilterDropdown({
  options,
  value,
  onSelect,
  align = "left",
  minWidth = 168,
}: {
  options: { id: string; label: string }[]
  value: string
  onSelect: (id: string) => void
  align?: "left" | "right"
  minWidth?: number
}) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const activeLabel = options.find((o) => o.id === value)?.label ?? options[0]?.label ?? ""

  // Reset the enter-animation flag in the CLOSE handlers (not synchronously in
  // the effect) so the effect body sets no state — mirrors the ActionMenu
  // close()/toggle() pattern. Exit was instant before; still is.
  const close = () => { setOpen(false); setShown(false) }

  useEffect(() => {
    if (!open) return
    const raf = requestAnimationFrame(() => setShown(true))
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDown)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDown)
    }
  }, [open])

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => { if (open) close(); else setOpen(true) }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2"
        style={{
          padding: "7px 12px",
          borderRadius: "var(--r-input)",
          fontSize: 12,
          fontWeight: 500,
          border: "1px solid var(--line)",
          background: open ? "var(--cream-2)" : "transparent",
          color: "var(--ink)",
          cursor: "pointer",
          transition: "background var(--dur-fast) var(--ease-out)",
        }}
      >
        <SlidersHorizontal style={{ width: 14, height: 14, color: "var(--body)" }} />
        <span>{activeLabel}</span>
        <ChevronDown
          style={{
            width: 14, height: 14, color: "var(--body)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform var(--dur-fast) var(--ease-out)",
          }}
        />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            zIndex: 20,
            minWidth,
            background: "var(--cream)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-card)",
            padding: 4,
            transformOrigin: align === "right" ? "top right" : "top left",
            transform: shown ? "scale(1)" : "scale(0.96)",
            opacity: shown ? 1 : 0,
            transition: "opacity 160ms var(--ease-out), transform 160ms var(--ease-out)",
          }}
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={value === o.id}
              onClick={() => { onSelect(o.id); setOpen(false) }}
              className="w-full flex items-center justify-between gap-6 text-left hover:bg-[var(--cream-2)]"
              style={{
                padding: "8px 12px",
                borderRadius: "var(--r-pill)",
                fontSize: 13,
                fontWeight: value === o.id ? 500 : 400,
                color: "var(--ink)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                transition: "background var(--dur-fast) var(--ease-out)",
              }}
            >
              <span>{o.label}</span>
              {value === o.id && <Check style={{ width: 14, height: 14, color: "var(--plum)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
