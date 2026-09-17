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

import { createContext, useCallback, useContext, useState, ReactNode } from "react"
import { resolveMinistryTimezone } from "@/lib/tz"

// The no-provider default is the resolver's own fallback, so the "unknown zone"
// answer exists in exactly one place (lib/tz.ts).
const MinistryTimezoneContext = createContext<string>(resolveMinistryTimezone(null))
// The setter lives in its OWN context so that reading the zone (hundreds of
// consumers) and writing it (one: Church Settings) never share a value object —
// a `{ timezone, setTimezone }` value would re-render every event surface on
// every provider render.
const SetMinistryTimezoneContext = createContext<(tz: string) => void>(() => {})

export function MinistryTimezoneProvider({ timezone, children }: { timezone: string | null | undefined; children: ReactNode }) {
  // Boot data seeds the zone; an admin saving a new zone in Church Settings
  // overrides it for the rest of the session (no reload). Until that happens the
  // server value still wins, so a fresh boot is never stale.
  const [override, setOverride] = useState<string | null>(null)
  const setTimezone = useCallback((tz: string) => setOverride(resolveMinistryTimezone(tz)), [])
  // A string value — referentially stable by value, so consumers (including
  // memoized rows) never re-render on provider identity churn.
  return (
    <SetMinistryTimezoneContext.Provider value={setTimezone}>
      <MinistryTimezoneContext.Provider value={override ?? resolveMinistryTimezone(timezone)}>
        {children}
      </MinistryTimezoneContext.Provider>
    </SetMinistryTimezoneContext.Provider>
  )
}

/** The ministry's IANA zone. Always a formattable zone — never null, never "". */
export function useMinistryTimezone(): string {
  return useContext(MinistryTimezoneContext)
}

/**
 * Publish a newly SAVED ministry zone to every consumer without a reload.
 * Call it only after the write succeeds — this is a mirror of the DB, not a draft.
 */
export function useSetMinistryTimezone(): (tz: string) => void {
  return useContext(SetMinistryTimezoneContext)
}
