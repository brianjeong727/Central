"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"

// ── Toast ────────────────────────────────────────────────────────────────────
// Dumb single-instance snackbar. Fixed bottom-center, plum-2 surface, cream-on-dark
// text, radius 12, auto-dismisses after 6s. NO shadow / rgba (design contract).
// The optional action renders as a cream-on-dark 500-weight link (never gold).
// Render at most one at a time; the owner controls visibility by mounting/unmounting.
export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
}: {
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [message, onDismiss])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 28,
        transform: "translateX(-50%)",
        zIndex: 190,
        display: "flex",
        alignItems: "center",
        gap: 18,
        maxWidth: "calc(100vw - 32px)",
        padding: "12px 20px",
        borderRadius: 12,
        background: "var(--plum-2)",
        color: "var(--cream-on-dark)",
        fontSize: 14,
        fontFamily: "var(--sans)",
        animation: "toastIn 0.25s var(--ease-out, ease)",
      }}
    >
      <span style={{ lineHeight: 1.4 }}>{message}</span>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            flexShrink: 0,
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--cream-on-dark)",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: "var(--sans)",
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          {actionLabel}
        </button>
      )}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
    </div>,
    document.body,
  )
}
