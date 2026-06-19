"use client"

import { ButtonHTMLAttributes, ReactNode } from "react"

type Variant = "primary" | "secondary" | "plum-outline" | "destructive" | "ghost" | "soft-pill"

const variants: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "var(--plum-2)",
    color: "var(--cream)",
    border: "none",
    borderRadius: "var(--r-input)",
    padding: "11px 22px",
    fontSize: 14,
    fontWeight: 500,
  },
  secondary: {
    background: "transparent",
    color: "var(--body)",
    border: "1px solid var(--line-2)",
    borderRadius: "var(--r-input)",
    padding: "10px 16px",
    fontSize: 13,
  },
  "plum-outline": {
    background: "transparent",
    color: "var(--plum)",
    border: "1px solid var(--plum)",
    borderRadius: "var(--r-input)",
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 500,
  },
  destructive: {
    background: "transparent",
    color: "var(--danger)",
    border: "1px solid var(--danger)",
    borderRadius: "var(--r-input)",
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 500,
  },
  ghost: {
    background: "none",
    border: "none",
    color: "var(--muted-text)",
    padding: "0",
    fontSize: 12,
  },
  "soft-pill": {
    background: "var(--ivory)",
    color: "var(--plum-2)",
    border: "1px solid var(--line-2)",
    borderRadius: "999px",
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 500,
  },
}

interface CentralButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

export function CentralButton({
  variant = "primary",
  children,
  style,
  disabled,
  ...props
}: CentralButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        fontFamily: "var(--sans)",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        whiteSpace: "nowrap",
        opacity: disabled ? 0.5 : 1,
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  )
}
