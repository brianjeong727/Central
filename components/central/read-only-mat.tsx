import { CSSProperties, ReactNode } from "react"
import { Eye, Lock } from "lucide-react"
import { EYEBROW_STYLE } from "./typography"

/**
 * Read-only status pill — plum-2 mono chip reading
 * "Read-only view · viewing as Admin" with a leading eye glyph.
 *
 * Single source of truth for the read-only signal. The desktop `ReadOnlyMat`
 * mounts it absolutely straddling the mat's top border; mobile renders it
 * inline at the top of the content. Pass a `style` to override positioning.
 */
export function ReadOnlyPill({ style }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
        background: "var(--plum-2)",
        padding: "5px 12px",
        borderRadius: 999,
        ...EYEBROW_STYLE, // fontFamily / fontSize(11) / letterSpacing(1.4px) / uppercase
        color: "var(--cream)", // override EYEBROW_STYLE's muted-text
        ...style,
      }}
    >
      <Eye style={{ width: 13, height: 13, flexShrink: 0 }} />
      <span>Read-only view</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>viewing as Admin</span>
    </div>
  )
}

/**
 * "Matted preview frame" (cdesign 1a) — the read-only (gov-view) workspace
 * treatment. The team content sits inside a plum-hairline mat, like art behind
 * glass: a centered status pill straddles the top border and an explanatory
 * footer is pinned at the bottom (always visible, outside the scroll).
 *
 * Single-scroller contract (CLAUDE.md Conv. #13): the scroll region is
 * byte-equivalent to the old `<div className="flex-1 overflow-y-auto">` it
 * replaces — `flex:1; min-height:0; overflow-y:auto` with NO padding of its own,
 * sitting in a fully-resolved flex column (outer wrapper → mat frame → scroll
 * region, each `flex:1; min-height:0`). A shell-mounted child's `md:h-full`
 * therefore resolves against this region exactly as before and scrolls
 * INTERNALLY (this scroller stays inert); non-shell children overflow and scroll
 * THIS region — same as today. Pill-clearance padding lives on the mat FRAME
 * (a non-scrolling overflow:hidden parent), never on the scroll region, so it
 * cannot perturb children's percentage-height resolution.
 */
export function ReadOnlyMat({ children }: { children: ReactNode }) {
  return (
    // Outer inset wrapper — 22px top reserves just enough room for the pill overhang. It owns
    // the positioning context for the pill (kept OUT of the mat so the mat's
    // overflow:hidden can't clip the pill's outer half).
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: "14px 18px 18px",
      }}
    >
      {/* The mat frame */}
      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          paddingTop: 22,
          border: "1px solid color-mix(in srgb, var(--plum) 42%, var(--cream))",
          borderRadius: "var(--r-callout)",
          background: "var(--cream)",
          boxShadow:
            "inset 0 0 0 4px var(--cream), inset 0 0 0 5px color-mix(in srgb, var(--plum) 12%, var(--cream))",
        }}
      >
        {/* The ONE scroller — byte-equivalent to the pre-mat `flex-1 overflow-y-auto`
            div: no padding of its own (children self-inset), so a shell-mounted
            child's md:h-full resolves against it exactly as before and scrolls
            internally (this scroller stays inert). Pill-clearance padding lives on
            the mat frame above, never here. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>{children}</div>

        {/* Footer — pinned at the bottom of the mat, outside the scroll. */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 14,
            borderTop: "1px solid color-mix(in srgb, var(--plum) 14%, var(--line))",
            // Bottom padding clears the mat's inset plum ring (drawn 5px inside the
            // frame edge) so the frame encloses the footer instead of cutting the text.
            padding: "14px 36px 18px",
          }}
        >
          <Lock style={{ width: 15, height: 15, color: "var(--plum)", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.4 }}>
            You&apos;re viewing this space exactly as an{" "}
            <span style={{ color: "var(--ink)", fontWeight: 500 }}>Admin</span> sees
            it. Nothing here can be changed.
          </span>
        </div>
      </div>

      {/* Status pill — straddles the mat's top border, centered. Positioned
          against the outer wrapper (top:22 = mat top edge) so it renders fully. */}
      <ReadOnlyPill
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 2,
        }}
      />
    </div>
  )
}
