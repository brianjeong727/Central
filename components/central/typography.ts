// ── Canonical mono micro-label tokens ─────────────────────────────────────────
// This file is the canonical home for the two shared mono label constants.
// `app/home/components/shared.tsx` re-exports these so every app-layer importer
// keeps working unchanged. components/central is a leaf layer — it must never
// import from app/, so these tokens live here and app/ depends on central, not
// the other way around.
//
// Pure constants only — this module must import nothing (no cycles).

export const MONO_STYLE: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: "10px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--muted-text)",
}

// Canonical "eyebrow" micro-label: 11px / 1.4px tracking / uppercase mono.
// Distinct from MONO_STYLE (10px / 0.06em) — do not flatten the two together.
export const EYEBROW_STYLE: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: "11px",
  letterSpacing: "1.4px",
  textTransform: "uppercase",
  color: "var(--muted-text)",
}

// Desktop icon-rail nav label (R9): 9px mono uppercase. Color is applied per state
// by the consumer (active = full-opacity var(--cream-on-dark); inactive = muted) —
// this const carries only the type treatment. The old 7–8px rail labels are retired.
export const RAIL_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: "9px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  lineHeight: 1,
}
