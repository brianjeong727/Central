"use client"

import { createContext, useContext, useState, useEffect, useLayoutEffect, ReactNode } from "react"
import type { Crumb } from "./types"

// Layout effect on the client (runs before paint, so a host page can suppress its
// own header in the SAME commit the subpage mounts — no header flash); plain effect
// on the server to avoid the SSR useLayoutEffect warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

type Ctx = { extra: Crumb[]; setExtra: (c: Crumb[]) => void }

const C = createContext<Ctx | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [extra, setExtra] = useState<Crumb[]>([])
  return <C.Provider value={{ extra, setExtra }}>{children}</C.Provider>
}

export function useBreadcrumbExtra(): Crumb[] {
  return useContext(C)?.extra ?? []
}

// Subpage registers its trail; clears on unmount. Keyed by labels so identity
// churn (new onClick closures every render) doesn't thrash the effect.
export function useSubpageCrumbs(crumbs: Crumb[]) {
  const ctx = useContext(C)
  const key = crumbs.map(c => c.label).join("›")
  useIsoLayoutEffect(() => {
    ctx?.setExtra(crumbs)
    return () => ctx?.setExtra([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
