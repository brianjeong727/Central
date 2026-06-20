import { CSSProperties } from "react"

interface InsetHairlineProps {
  style?: CSSProperties
}

/**
 * Inset, faint hairline divider — floats with horizontal margin,
 * matching the Central design system's whisper-weight rules.
 * Use wherever a section break is needed without a hard edge-to-edge line.
 */
export function InsetHairline({ style }: InsetHairlineProps) {
  return (
    <div
      style={{
        height: 1,
        background: "var(--line)",
        opacity: 0.65,
        margin: "0 56px",
        ...style,
      }}
    />
  )
}
