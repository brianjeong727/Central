import { RingCrossLogo } from "./ring-cross-logo"

// ── PendingVeil ──────────────────────────────────────────────────────────────
// Full-screen "something is happening" cover for the waits that have no button
// to spin: the OAuth round trip, the window.location.assign handoff afterwards,
// signing out, and switching ministries — each of which can run for seconds with
// a completely inert screen.
//
// Mounted while pending and NEVER cleared on success — the page is navigating,
// and clearing it would flash the old screen back for the last frame.
//
// It was born in `app/(auth)/shared.tsx` as `AuthPendingVeil`; it is app-wide UI
// now, so it lives in the LEAF layer. That file re-exports it under the old name
// so login / signup / complete-profile are untouched.
export function PendingVeil({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" style={{
      position: "fixed", inset: 0, zIndex: 300, background: "var(--cream)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28,
    }}>
      <RingCrossLogo size={48} color="var(--plum)" />
      {/* Spinner and label read as ONE status line under the mark — stacked as
          three evenly-spaced items they float apart. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="animate-spin" style={{
          width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
          border: "2px solid var(--line-2)", borderTopColor: "var(--plum)",
        }} />
        <div style={{ fontFamily: "var(--serif)", fontSize: 15, color: "var(--body)" }}>{label}</div>
      </div>
    </div>
  )
}
