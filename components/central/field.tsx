"use client"

import {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
  forwardRef,
} from "react"
import { EYEBROW_STYLE } from "./typography"

// ── Central form-control system (DESIGN_SYSTEM §4.4) ───────────────────────────
// Shared input / select / textarea primitives. Every control forwards `style`
// and `className`, spreads native props, and carries the `central-field` class
// so the global focus rule (border → plum) applies without per-site onFocus
// state. Tokens only — no hardcoded hex.

type FieldSize = "sm" | "md"

const sizeStyles: Record<FieldSize, React.CSSProperties> = {
  sm: { fontSize: 13, padding: "8px 12px" },
  md: { fontSize: 15, padding: "12px 14px" },
}

const baseFieldStyle: React.CSSProperties = {
  border: "1px solid var(--line-2)",
  borderRadius: "var(--r-input)",
  background: "var(--cream)",
  fontFamily: "var(--font-inter)",
  color: "var(--ink)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
}

// ── Text input ─────────────────────────────────────────────────────────────────
interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: FieldSize
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "md", style, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      {...props}
      className={`central-field ${className ?? ""}`}
      style={{ ...baseFieldStyle, ...sizeStyles[size], ...style }}
    />
  )
})

// ── Native select ──────────────────────────────────────────────────────────────
interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: FieldSize
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", style, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      {...props}
      className={`central-field ${className ?? ""}`}
      style={{ ...baseFieldStyle, ...sizeStyles[size], cursor: "pointer", ...style }}
    >
      {children}
    </select>
  )
})

// ── Textarea ────────────────────────────────────────────────────────────────────
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: FieldSize
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { size = "md", style, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`central-field ${className ?? ""}`}
      style={{
        ...baseFieldStyle,
        ...sizeStyles[size],
        resize: "vertical",
        lineHeight: 1.5,
        ...style,
      }}
    />
  )
})

// ── Serif document-style title input ────────────────────────────────────────────
interface SerifInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  fontSize?: number
  // When false, drops the §4.4 borderBottom hairline (fully borderless title).
  // The focus-to-plum class is only applied when underlined, since there is no
  // border to recolor otherwise.
  underline?: boolean
}

export const SerifInput = forwardRef<HTMLInputElement, SerifInputProps>(function SerifInput(
  { fontSize = 26, underline = true, style, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      {...props}
      className={`${underline ? "central-field-serif" : ""} ${className ?? ""}`.trim()}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: underline ? "1px solid var(--line-2)" : "none",
        fontFamily: "var(--font-instrument-serif)",
        fontWeight: 600,
        fontSize,
        letterSpacing: "-0.02em",
        color: "var(--ink)",
        outline: "none",
        padding: "4px 0",
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    />
  )
})

// ── Dashed "+ add" select variant ───────────────────────────────────────────────
export const AddInlineSelect = forwardRef<HTMLSelectElement, SelectProps>(function AddInlineSelect(
  { size = "md", style, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      {...props}
      className={`central-field ${className ?? ""}`}
      style={{
        ...baseFieldStyle,
        ...sizeStyles[size],
        border: "1px dashed var(--dashed)",
        background: "var(--cream-2)",
        color: "var(--body)",
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </select>
  )
})

// ── Labeled field wrapper ────────────────────────────────────────────────────────
interface FormFieldProps {
  label?: ReactNode
  children: ReactNode
  helper?: ReactNode
  error?: ReactNode
}

export function FormField({ label, children, helper, error }: FormFieldProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label != null && <span style={EYEBROW_STYLE}>{label}</span>}
      {children}
      {error != null ? (
        <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span>
      ) : helper != null ? (
        <span style={{ fontSize: 12, color: "var(--muted-text)" }}>{helper}</span>
      ) : null}
    </div>
  )
}
