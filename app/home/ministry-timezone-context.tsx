"use client"

// The ministry's IANA timezone, provided once at the shell root and read by any
// descendant that renders or writes an event time. Event times are stored as
// true instants (`lib/tz.ts`) — turning one into a wall clock requires a zone,
// and that zone is the MINISTRY's, not the viewer's device.
//
// Threading it through would mean ~40 prop chains, so it rides context like the
// member-profile opener does. It is boot data (fetched server-side in
// app/home/page.tsx alongside the ministry name — no extra round trip), never
// cached in localStorage/sessionStorage (Convention #1).
//
// Lives in app/ because components/central is a LEAF and must not import from
// app/ — a shared component that needs the zone takes it as a prop.

import { createContext, useContext, ReactNode } from "react"
import { resolveMinistryTimezone } from "@/lib/tz"

// The no-provider default is the resolver's own fallback, so the "unknown zone"
// answer exists in exactly one place (lib/tz.ts).
const MinistryTimezoneContext = createContext<string>(resolveMinistryTimezone(null))

export function MinistryTimezoneProvider({ timezone, children }: { timezone: string | null | undefined; children: ReactNode }) {
  // A string value — referentially stable by value, so consumers (including
  // memoized rows) never re-render on provider identity churn.
  return (
    <MinistryTimezoneContext.Provider value={resolveMinistryTimezone(timezone)}>
      {children}
    </MinistryTimezoneContext.Provider>
  )
}

/** The ministry's IANA zone. Always a formattable zone — never null, never "". */
export function useMinistryTimezone(): string {
  return useContext(MinistryTimezoneContext)
}
