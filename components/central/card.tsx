import { HTMLAttributes, ReactNode } from "react"

type Variant = "standard" | "callout" | "inset"

const variantStyles: Record<Variant, { background: string; border: string }> = {
  standard: { background: "var(--cream)",   border: "1px solid var(--line)" },
  callout:  { background: "var(--ivory)",   border: "1px solid var(--line-2)" },
  inset:    { background: "var(--cream-3)", border: "1px solid var(--line)" },
}

interface CentralCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant
  radius?: string | number
  padding?: string | number
  children: ReactNode
}

export function CentralCard({
  variant = "standard",
  radius = "var(--r-card)",
  padding = 22,
  children,
  style,
  ...props
}: CentralCardProps) {
  const { background, border } = variantStyles[variant]
  return (
    <div
      {...props}
      style={{
        background,
        border,
        borderRadius: radius,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
