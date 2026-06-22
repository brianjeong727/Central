import { ReactNode, CSSProperties } from "react"
import { InsetHairline } from "./hairline"

interface TabPageHeaderProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export function TabPageHeader({ children, className, style }: TabPageHeaderProps) {
  return (
    <>
      <div className="hidden md:block"><InsetHairline /></div>
      <div
        className={`hidden md:flex items-center px-14 ${className ?? ""}`}
        style={{ paddingTop: "var(--space-8)", paddingBottom: "var(--space-8)", ...style }}
      >
        {children}
      </div>
      <div className="hidden md:block"><InsetHairline /></div>
    </>
  )
}
