"use client"

// Global "open this member's profile" channel. home-app provides the opener
// (wired to the ?person= overlay state); any descendant — a chat message sender,
// an RSVP chip, a settings/team roster row — calls useOpenMemberProfile() to open
// the profile overlay without prop-drilling. Lives in app/ (NOT components/central,
// which is a LEAF); only app/ surfaces consume it.

import { createContext, useContext, ReactNode } from "react"

type Opener = (userId: string) => void

const MemberProfileContext = createContext<Opener | null>(null)

export function MemberProfileProvider({ open, children }: { open: Opener; children: ReactNode }) {
  // `open` must be a stable reference (useCallback in home-app) so this provider
  // value never churns — context consumers (incl. memoized chat message rows)
  // re-render whenever the value identity changes.
  return <MemberProfileContext.Provider value={open}>{children}</MemberProfileContext.Provider>
}

// Returns a no-op when no provider is mounted (e.g. isolated component render),
// so call sites never need a null guard.
export function useOpenMemberProfile(): Opener {
  return useContext(MemberProfileContext) ?? (() => {})
}
