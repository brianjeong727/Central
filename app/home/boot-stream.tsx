"use client"

import { createContext, use, useContext, type ReactNode } from "react"
import type { BootStream } from "./types"

// ── The STREAMED half of the /home boot ──────────────────────────────────────
//
// app/home/page.tsx blocks on the minimum a redirect decision needs (the user,
// the profile + its ministry row, the user's team memberships) and hands the
// REST of the boot down as an unresolved PROMISE. React serializes that promise
// into the RSC payload, so the shell's HTML flushes while these queries are
// still in flight and their markup arrives in a later chunk of the SAME
// response — still server-rendered, just not blocking the first byte of body.
//
// Consumed two ways, deliberately:
//
//   useBootStream()        SUSPENDS (React `use`). This is the RENDER path: a
//                          component that calls it must sit inside a <Suspense>
//                          with a real skeleton. Because it suspends, the server
//                          and the hydrating client render the SAME thing at the
//                          same moment (fallback, then data) — which is what
//                          keeps this markup in the document instead of
//                          appearing a beat after hydration.
//
//   useBootStreamPromise() does NOT suspend. This is the HANDOFF path: home-app
//                          seeds its local state from it once, after hydration,
//                          so every existing imperative update (realtime
//                          previews, unread recounts, refetch-on-chat-close)
//                          keeps operating on plain state exactly as before.
//
// Why both: the streamed values feed state that the shell mutates all session
// long. Reading them ONLY through `use()` would mean rewriting that machinery;
// reading them ONLY in an effect would pull the chat list back out of the
// server HTML (the regression PR #311 exists to prevent). The pair keeps the
// markup server-rendered AND the state machinery untouched.
// The SHAPE lives in ./types (page.tsx is a Server Component and cannot read a
// value exported from a "use client" module — it would get a client reference).
export type { BootStream }

const EMPTY_BOOT_STREAM: BootStream = {
  recentChats: [],
  chatList: [],
  activeQuestion: null,
  hasResponded: false,
  teamMemberCounts: {},
}

// Module-level so the default context value is a STABLE already-resolved
// promise: `use()` on it never suspends, and it never re-triggers the handoff
// effect. Covers any mount without a provider (tests, storybook-style renders).
const RESOLVED_EMPTY: Promise<BootStream> = Promise.resolve(EMPTY_BOOT_STREAM)

const BootStreamContext = createContext<Promise<BootStream>>(RESOLVED_EMPTY)

export function BootStreamProvider({
  value,
  children,
}: {
  value?: Promise<BootStream>
  children: ReactNode
}) {
  return <BootStreamContext.Provider value={value ?? RESOLVED_EMPTY}>{children}</BootStreamContext.Provider>
}

/**
 * SUSPENDS until the streamed boot chunk lands. Only call this inside a
 * <Suspense> boundary that has a real skeleton fallback.
 */
export function useBootStream(): BootStream {
  return use(useContext(BootStreamContext))
}

/** The raw promise — does NOT suspend. For the post-hydration state handoff. */
export function useBootStreamPromise(): Promise<BootStream> {
  return useContext(BootStreamContext)
}
