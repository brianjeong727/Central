"use client"

// ── MessageBanner — the in-app notification banner ───────────────────────────
// What iOS refuses to show you. The OS suppresses its own banner while the app
// is foregrounded (lib/native-push.ts), so before this existed a message in any
// room other than the one on screen simply never announced itself — you found
// out by going back to the Chats tab. iMessage and Messenger both drop a card
// from the top instead; this is that card.
//
// It is DUMB — it renders what it is handed and reports two events (opened,
// dismissed). Whether a message deserves a banner at all is decided upstream in
// lib/chat-notification.ts, which the push route uses too, so the banner and the
// lock-screen notification can never disagree about what "muted" means.
//
// Grammar is the push payload's, deliberately: WHO on the first line, WHERE on
// the second, the message on the third (Brian, 2026-08-22). A DM has no "where"
// worth saying, so it renders two lines. Seeing the same three lines in-app and
// on the lock screen is the point — it is one notification, shown by whichever
// layer is in a position to show it.
//
// Surface: an --ivory card at --r-pocket, carrying --shadow-nav. It floats over
// arbitrary content — the same problem the nav pill solves, and --shadow-nav is
// the one ambient shadow the mobile contract allows for it. Cream-on-cream with
// no shadow would dissolve into the chat screen it most often appears over.
// Plum is spent on the monogram inside it, never on the card.

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChatAvatar, type ChatAvatarMember } from "./chat-avatar"

/** How long a banner stays before it retires itself. iOS is ~5s; long enough to
 *  read three lines, short enough that it is gone before it becomes furniture. */
const DWELL_MS = 5000
const OUT_MS = 200
/** An upward drag that dismisses. Small — the banner is a 60px target near the
 *  top edge and a flick is the whole gesture. */
const DISMISS_PX = 28

export interface MessageBannerContent {
  /** The chat this message landed in — the banner opens it. */
  groupId: string
  groupName: string
  /** Line 1 — who sent it. */
  title: string
  /** Line 2 — where it happened. Absent for a DM, which needs no "where". */
  subtitle?: string
  /** Line 3 — the message itself, already previewed/labelled by the caller. */
  body: string
  avatarUrl?: string | null
  members?: ChatAvatarMember[]
  otherCount?: number
  isCentral?: boolean
  /** A DM's chip falls back to the person's INITIALS, not one letter. */
  isDM?: boolean
  /** Changes for every banner, including a second one from the SAME chat — it is
   *  what re-arms the dwell timer and restarts the entrance. */
  key: string
}

export function MessageBanner({
  content, onOpen, onDismiss,
}: {
  content: MessageBannerContent
  onOpen: () => void
  onDismiss: () => void
}) {
  const [leaving, setLeaving] = useState(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  // Held in a ref so the dwell timer never re-arms just because the parent
  // re-rendered with a new closure — only a new `content.key` restarts it.
  const onDismissRef = useRef(onDismiss)
  useEffect(() => { onDismissRef.current = onDismiss })

  const close = useCallback(() => {
    setLeaving(true)
    window.setTimeout(() => onDismissRef.current(), OUT_MS)
  }, [])

  // Dwell — mount-scoped, deliberately. The owner renders this with
  // `key={content.key}`, so a second message REMOUNTS the banner: the clock and
  // the entrance animation both restart, and `leaving` is false again, with no
  // state reset inside an effect (which is a cascading render, and lint says so).
  useEffect(() => {
    const t = window.setTimeout(() => {
      setLeaving(true)
      window.setTimeout(() => onDismissRef.current(), OUT_MS)
    }, DWELL_MS)
    return () => window.clearTimeout(t)
  }, [])

  // Swipe UP to dismiss — the gesture every notification banner has. Coarse
  // pointer only, and vertical-dominant only, so it can neither exist on desktop
  // nor contest the left-edge back swipe (Convention #22) that starts in the
  // same corner of the screen.
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    if (typeof window === "undefined" || !window.matchMedia?.("(pointer: coarse)").matches) return
    let y0 = 0, x0 = 0, dragging = false
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      y0 = t.clientY; x0 = t.clientX; dragging = true
    }
    const onMove = (e: TouchEvent) => {
      if (!dragging) return
      const t = e.touches[0]
      if (!t) return
      const dy = t.clientY - y0
      const dx = t.clientX - x0
      if (Math.abs(dx) > Math.abs(dy)) { dragging = false; return }
      // Follow the finger upward only; downward does nothing (there is nothing
      // below the banner to pull it toward).
      el.style.transition = "none"
      el.style.transform = `translateY(${Math.min(0, dy)}px)`
      if (dy < -DISMISS_PX) { dragging = false; close() }
    }
    const onEnd = () => {
      if (!dragging) return
      dragging = false
      el.style.transition = ""
      el.style.transform = ""
    }
    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: true })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
    }
  }, [close])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      // `top` lives in .msg-banner (globals.css): at phone width it has to clear
      // the safe-area notch, and an inline value would outrank the desktop reset
      // exactly the way an inline .toast-bottom would.
      className={`msg-banner${leaving ? " msg-banner-out" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div
        ref={cardRef}
        className="msg-banner-card"
        role="button"
        tabIndex={0}
        onClick={() => { setLeaving(true); onOpen() }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLeaving(true); onOpen() } }}
        aria-label={`${content.title}${content.subtitle ? ` ${content.subtitle}` : ""}: ${content.body}. Open chat`}
      >
        <ChatAvatar
          size={40}
          title={content.groupName}
          avatarUrl={content.avatarUrl}
          members={content.members}
          otherCount={content.otherCount}
          isCentral={content.isCentral}
          isDM={content.isDM}
          // The ring between clustered circles is a hole in whatever is behind
          // them, so it has to be the CARD's fill, not the page's.
          surface="var(--ivory)"
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "var(--serif)", fontSize: 14.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {content.title}
          </div>
          {content.subtitle && (
            <div style={{ fontSize: 12.5, color: "var(--muted-text)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {content.subtitle}
            </div>
          )}
          {/* Two lines, then ellipsis — a banner is a summons, not the message. */}
          <div
            style={{
              fontSize: 13.5, color: "var(--body)", lineHeight: 1.35, marginTop: 3,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {content.body}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
