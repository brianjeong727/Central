"use client"

// Global "start a DM with this person" channel — the exact sibling of
// member-profile-context. home-app provides the opener (wired to the draft-DM
// state that ChatScreen mounts against); any descendant — a member sheet, a
// directory detail panel — calls useOpenDraftDm() to reach it without
// prop-drilling through the overlay/detail chain.
//
// Why a context and not a prop: the two callers that needed it (the member sheet
// and the directory member detail) are mounted several layers below home-app
// through overlays that don't otherwise care about chats. Threading a callback
// down meant three intermediate components gaining a prop they never read.
// Lives in app/ (NOT components/central, which is a LEAF).

import { createContext, useContext, ReactNode } from "react"

export type DraftDmPerson = { id: string; name: string }
type Opener = (person: DraftDmPerson) => void

const DraftDmContext = createContext<Opener | null>(null)

export function DraftDmProvider({ open, children }: { open: Opener; children: ReactNode }) {
  // `open` must be a stable reference (useCallback in home-app) so this provider
  // value never churns — same contract as MemberProfileProvider.
  return <DraftDmContext.Provider value={open}>{children}</DraftDmContext.Provider>
}

// Returns a no-op when no provider is mounted (e.g. an isolated component
// render), so call sites never need a null guard.
export function useOpenDraftDm(): Opener {
  return useContext(DraftDmContext) ?? (() => {})
}
