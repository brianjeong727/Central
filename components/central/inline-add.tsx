"use client"
import { CSSProperties, ReactNode } from "react"
import { Plus } from "lucide-react"

// The two-state add grammar for grouped lists (§11.13, extended):
//   groups exist        → InlineAddRow at the foot of EVERY group, empty or not
//                         (bare row; an empty group adds a compact italic line above)
//   no groups           → the create rides the section rule (ContentActionButton)
//   collection is empty → InlineAddCard (dashed, first-in-empty)
// An add must NAME the list it lands in — "Add a block to Game Day", never a lone
// "Add block" that cannot say which night.
//
// §11.13 rules 3 + 4: the dashed card is a WHOLE-COLLECTION control, never a
// per-group one. At real density a week can be 5-of-7 nights empty, and one dashed
// full-width card per empty night out-weighs the nights that actually have content.
// A group's add must not change SHAPE just because the group is empty.

// APPEND-TO-POPULATED. Bare row, deliberately NOT dashed: it follows real content,
// so it needs no container of its own.
export function InlineAddRow({ label, onClick, icon, disabled, style }: {
  label: string
  onClick?: () => void
  icon?: ReactNode
  disabled?: boolean
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-[var(--muted-text)] enabled:hover:text-[var(--plum)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 2px",
        fontSize: 14,
        fontFamily: "var(--sans)",
        background: "none",
        border: 0,
        textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {icon ?? <Plus style={{ width: 14, height: 14, flexShrink: 0 }} strokeWidth={1.6} />}
      {label}
    </button>
  )
}

// FIRST-IN-EMPTY. Dashed card — the group has nothing in it, so the control has to
// carry its own shape. Sibling to the empty line, never a button inside it (§4.19).
export function InlineAddCard({ label, onClick, icon, disabled, style }: {
  label: string
  onClick?: () => void
  icon?: ReactNode
  disabled?: boolean
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full border-[1.5px] border-dashed border-[var(--dashed)] text-[var(--muted-text)] enabled:hover:border-solid enabled:hover:border-[var(--plum)] enabled:hover:text-[var(--plum)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 14,
        marginTop: 12,
        borderRadius: "var(--r-callout)",
        fontSize: 14,
        fontFamily: "var(--sans)",
        background: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {icon ?? <Plus style={{ width: 14, height: 14, flexShrink: 0 }} strokeWidth={1.6} />}
      {label}
    </button>
  )
}
