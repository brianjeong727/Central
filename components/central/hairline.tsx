import { CSSProperties } from "react"

interface InsetHairlineProps {
  className?: string
  style?: CSSProperties
}

/**
 * Inset, faint hairline divider — floats with horizontal margin,
 * matching the Central design system's whisper-weight rules.
 * Use wherever a section break is needed without a hard edge-to-edge line.
 */
export function InsetHairline({ className = "mx-14", style }: InsetHairlineProps) {
  return (
    <div
      className={className}
      style={{
        height: 1,
        background: "var(--line)",
        opacity: 0.65,
        ...style,
      }}
    />
  )
}
