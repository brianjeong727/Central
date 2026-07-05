"use client"

// Reusable destructive-confirmation dialog. A thin wrapper over CentralModal
// (§4.17) that generalizes the confirm-on-modal pattern used in chats-tab
// (confirmAction) and plan-tab's team-delete flow: a portaled CentralModal with
// a secondary Cancel + a confirm button (danger-solid when destructive).
//
// Callers render it unconditionally with an `open` flag; it returns null when
// closed. Delete/archive affordances should route through this instead of firing
// the mutation directly.

import { ReactNode } from "react"
import { createPortal } from "react-dom"
import { CentralModal } from "./central-modal"
import { CentralButton } from "./button"

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  danger = true,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  // SSR-safe: `open` is always false during server render (callers init their
  // confirm-state to null/false), and createPortal needs document.body.
  if (!open || typeof document === "undefined") return null

  return createPortal(
    <CentralModal
      onClose={() => { if (!loading) onClose() }}
      eyebrow={danger ? "Danger zone" : "Confirm"}
      title={title}
      maxWidth={420}
      z={220}
      footer={
        <>
          <CentralButton variant="secondary" size="md" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </CentralButton>
          <CentralButton
            variant={danger ? "danger-solid" : "primary"}
            size="md"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "…" : confirmLabel}
          </CentralButton>
        </>
      }
    >
      <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.5, margin: 0 }}>
        {message ?? "This can't be undone."}
      </p>
    </CentralModal>,
    document.body
  )
}
