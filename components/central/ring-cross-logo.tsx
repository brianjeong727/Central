// ── RingCrossLogo — the Central brand mark ───────────────────────────────────
// Lives in the design-system LEAF because `components/central` may not import
// from `app/` (CLAUDE.md, Key Files) and PendingVeil needs it. It is a pure SVG
// with no app dependencies, so this is its natural home.
// `app/home/components/shared.tsx` RE-EXPORTS it, so every existing importer
// keeps its old path with zero edits. One source only — never copy the paths.

export function RingCrossLogo({ size = 32, color = "var(--plum)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
      <path d="M70 28 A32 32 0 1 0 70 72" stroke={color} strokeWidth="8" strokeLinecap="round" />
      <circle cx="50" cy="50" r="6" fill={color} />
    </svg>
  )
}
