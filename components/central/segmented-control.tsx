"use client"

import type { KeyboardEvent, ReactNode } from "react"
import { useRef } from "react"
import { FilterChip } from "./filter-chip"

// ── SegmentedControl ─────────────────────────────────────────────────────────
// Sanctioned control for exclusive FILTER / mode selection (NOT view navigation
// — views use underline tabs; DESIGN_SYSTEM §4.2). A row of radius-999 pills
// carrying the one selected-state grammar (§4.4) via FilterChip. Radiogroup
// semantics for accessibility.
//
// Examples: Church | My Chats, Cards | Compact.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  className,
  "aria-label": ariaLabel,
}: {
  options: { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
  size?: "sm" | "md"
  className?: string
  "aria-label"?: string
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  // ARIA APG radiogroup: roving tabindex (selected = 0, rest = -1) + arrow-key
  // navigation that moves selection and focus together, wrapping at the ends.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const count = options.length
    if (count === 0) return
    let dir = 0
    if (e.key === "ArrowRight" || e.key === "ArrowDown") dir = 1
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") dir = -1
    else return
    e.preventDefault()
    const current = options.findIndex((o) => o.id === value)
    const from = current === -1 ? 0 : current
    const next = (from + dir + count) % count
    onChange(options[next].id)
    btnRefs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={className}
      onKeyDown={handleKeyDown}
      style={{ display: "flex", alignItems: "center", gap: 6 }}
    >
      {options.map((opt, i) => {
        const selected = opt.id === value
        return (
          <FilterChip
            key={opt.id}
            buttonRef={(el) => { btnRefs.current[i] = el }}
            selected={selected}
            onClick={() => onChange(opt.id)}
            size={size}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
          >
            {opt.label}
          </FilterChip>
        )
      })}
    </div>
  )
}
