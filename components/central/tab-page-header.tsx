import { ReactNode, CSSProperties } from "react"
import { InsetHairline } from "./hairline"

interface TabPageHeaderProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  // Suppress the trailing InsetHairline. Use when a PlanSubTabStrip immediately
  // follows on the same breakpoint — the strip's own rule IS the terminator, so
  // there must be only one (R1, ratified 2026-07-09). Default keeps the hairline.
  noBottomHairline?: boolean
}

export function TabPageHeader({ children, className, style, noBottomHairline = false }: TabPageHeaderProps) {
  return (
    <>
      <div className="hidden md:block"><InsetHairline /></div>
      <div
        className={`hidden md:flex items-center px-14 ${className ?? ""}`}
        style={{ paddingTop: "var(--space-8)", paddingBottom: "var(--space-8)", ...style }}
      >
        {children}
      </div>
      {!noBottomHairline && <div className="hidden md:block"><InsetHairline /></div>}
    </>
  )
}
