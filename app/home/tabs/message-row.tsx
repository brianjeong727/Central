"use client"

import { memo, useId, useState, useEffect, useRef, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import dynamic from "next/dynamic"
import { Check, MoreHorizontal, Trash2, CornerUpLeft, Plus, Forward, Pin, FileDown } from "lucide-react"
import { MonogramChip, ConfirmDialog, useSwipeToReply } from "@/components/central"
import { formatMessageTime, REACTION_EMOJIS } from "../utils"
import { useOpenMemberProfile } from "../member-profile-context"
import type { MessageRowProps } from "../types"
import { InviteCard } from "./invite-card"
import { jumboEmojiCount, jumboFontSize } from "@/lib/jumbo-emoji"

// emoji-mart is ~2MB (almost entirely the @emoji-mart/data JSON). Load both the
// Picker component and its data lazily — only when a picker actually opens — so
// nothing emoji-mart ships in the chats chunk until the user reaches for it.
const EmojiMartPicker = dynamic(() => import("@emoji-mart/react"), { ssr: false })

export function LazyEmojiPicker({
  onEmojiSelect,
  theme = "light",
  previewPosition = "none",
  skinTonePosition = "none",
  perLine,
}: {
  onEmojiSelect: (e: { native: string }) => void
  theme?: string
  previewPosition?: string
  skinTonePosition?: string
  /**
   * Emoji columns. emoji-mart derives its WIDTH from this (≈ perLine × 36 + chrome),
   * so it is how the message-row picker fits a narrow phone: at the default 9 the
   * picker is a fixed 352px, wider than the transcript column on a 375 or 320
   * device, and 48px of it hung off the left edge.
   *
   * `dynamicWidth` was the obvious alternative and it does not work here: it makes
   * emoji-mart MEASURE its container, and the container is an absolutely-positioned
   * div whose width arrives a commit later — it latched onto the empty box and
   * rendered a 190px picker inside a 352px wrapper. Deriving the columns ourselves
   * has no measurement race in it.
   */
  perLine?: number
}) {
  const [emojiData, setEmojiData] = useState<unknown>(null)
  useEffect(() => {
    let active = true
    import("@emoji-mart/data").then((m) => { if (active) setEmojiData(m.default) })
    return () => { active = false }
  }, [])
  if (!emojiData) {
    return (
      <div
        style={{
          width: 280, height: 56, display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--cream-panel)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
        }}
      >
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--line)", borderTopColor: "var(--plum)", animation: "spin 0.7s linear infinite" }} />
      </div>
    )
  }
  return (
    <EmojiMartPicker
      data={emojiData}
      onEmojiSelect={onEmojiSelect}
      theme={theme}
      previewPosition={previewPosition}
      skinTonePosition={skinTonePosition}
      {...(perLine ? { perLine } : {})}
    />
  )
}

/**
 * Emoji columns that will fit `maxW`. emoji-mart's own default is 9, which renders
 * a 352px picker — fine at 390 and up, 9px too wide at 375, and 64px too wide at
 * 320. ~36px per emoji button plus ~28px of picker chrome (its padding and the
 * scrollbar gutter); floored at 6 so it stays a grid rather than a column.
 */
function emojiPerLine(maxW: number): number {
  return Math.max(6, Math.min(9, Math.floor((maxW - 28) / 36)))
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const isToday = date.toDateString() === today.toDateString()
  const month = date.toLocaleString("en-US", { month: "long" }).toUpperCase()
  const day = date.getDate()
  return isToday ? `TODAY · ${month} ${day}` : `${date.toLocaleString("en-US", { weekday: "short" }).toUpperCase()} · ${month} ${day}`
}

// "Brian", "Brian and Anna", "Brian, Anna and Josh", and past the cap
// "A, B, … H and 4 more". Capped because the design contract is explicit about not
// designing for unbounded scale — a 60-person room must not render a 60-name tip.
const RX_TIP_MAX_NAMES = 8
function listSentence(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length <= RX_TIP_MAX_NAMES) {
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  }
  const shown = names.slice(0, RX_TIP_MAX_NAMES)
  return `${shown.join(", ")} and ${names.length - RX_TIP_MAX_NAMES} more`
}

function renderMentions(content: string, isOwn: boolean): React.ReactNode {
  const parts = content.split(/(@\S+)/g)
  return <>{parts.map((part, i) =>
    part.startsWith("@")
      ? <span key={i} style={{ fontWeight: 500, color: isOwn ? "var(--mention-own)" : "var(--mention-incoming)" }}>{part}</span>
      : part
  )}</>
}

// Memoized per-message row. ChatScreen re-renders on every composer keystroke,
// typing broadcast, and realtime event — this memo boundary keeps rows whose
// props didn't change from re-rendering. All callbacks passed in are stable
// (useCallback in ChatScreen or bare setState setters); all open/active state
// arrives as per-row booleans, never shared open-ids.
function MessageRowBase({
  msg,
  isOwn,
  isFirstMessage,
  isFirstInGroup,
  isLastInGroup,
  showDateSep,
  showGroupGap,
  senderDeparted,
  userId,
  ministryId,
  onOpenChat,
  isAdminOrLeader,
  isEmojiPickerOpen,
  isFullPickerOpen,
  isContextMenuOpen,
  isDeleting,
  isEditing,
  isPollMenuOpen,
  isPinned,
  editText,
  reactions,
  linkPreview,
  readReceipts,
  poll,
  pollUserVote,
  pollCounts,
  isChangingVote,
  isLargeRoom,
  isLatestOwn,
  seenByCount,
  seenByOpen,
  seenByList,
  onToggleSeenBy,
  registerMessageRef,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onReact,
  onDeleteMessage,
  onDeletePoll,
  onSaveEdit,
  onScrollToMessage,
  onOpenVoteSheet,
  onShowReactors,
  resolveReactorName,
  setEmojiPickerFor,
  setFullReactionPickerFor,
  setDeletingId,
  setEditingId,
  setEditText,
  setReplyingTo,
  setPollMenuFor,
}: MessageRowProps) {
  // Menu placement — decide above-vs-below by MEASUREMENT so a long-press
  // menu / reaction bar never clips under the chat header when the message is
  // near the top of the scroll viewport. Runs in useLayoutEffect (before
  // paint) so the menu paints in its final position — no visible flicker.
  const menuRef = useRef<HTMLDivElement>(null)
  // Where the open menu goes AND how big it may be. Position alone was not enough:
  // the old effect only asked "does ABOVE clip the top?" and flipped below if so,
  // never checking whether BELOW clips the bottom — so the 435px reaction picker
  // ran 51px off the foot of a 390×844 screen from a mid-transcript message, and
  // 85px behind the keyboard from a message near the top. Measured, not guessed.
  const [menuBox, setMenuBox] = useState<{ below: boolean; maxH: number; maxW: number } | null>(null)
  const placeBelow = menuBox?.below ?? false
  const [confirmDeletePoll, setConfirmDeletePoll] = useState(false)
  // Tap an incoming sender's name/avatar → open their profile (global overlay).
  // Context read bypasses the memo boundary; the opener is stable, so this never
  // forces a row re-render. Bubble press logic (Convention #7/#20) is untouched.
  const openMemberProfile = useOpenMemberProfile()
  const canOpenSenderProfile = !isOwn && !!msg.sender_id && !senderDeparted
  const openSenderProfile = () => { if (canOpenSenderProfile) openMemberProfile(msg.sender_id!) }
  // Swipe right on the bubble → reply. Convention #7's THIRD input, alongside
  // the <400ms tap and the ≥400ms long-press; `onLock` is what stops a slow
  // swipe from also firing the long-press timer those two share.
  //
  // The glyph is driven by a direct DOM write, not React state: this fires on
  // every touchmove, and re-rendering a row inside a ~100-row transcript at
  // touch frequency is a self-inflicted stutter (same reasoning as
  // `subscribeKeyboard` not being a hook, Convention #28).
  const replyGlyphRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useSwipeToReply<HTMLDivElement>(
    msg.deleted ? undefined : () => setReplyingTo(msg),
    {
      onLock: onPointerCancel,
      onProgress: (p) => {
        const g = replyGlyphRef.current
        if (!g) return
        g.style.opacity = String(p)
        g.style.transform = `scale(${0.7 + p * 0.3})`
      },
    },
  )
  // The long-press menu is no longer one of these — it is the portaled overlay,
  // which does its own placement against the VIEWPORT rather than against this
  // scroll container. Only the tap emoji bar and the full picker are placed here.
  const anyMenuOpen = isEmojiPickerOpen || isFullPickerOpen
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measured-placement reset; behavior-frozen (Convention #7), fix deferred
    if (!anyMenuOpen) { setMenuBox(null); return }
    const menuEl = menuRef.current
    const wrapper = menuEl?.parentElement            // the `flex flex-col relative` message wrapper
    if (!menuEl || !wrapper) return
    const measure = () => {
      // Nearest scrollable ancestor = the messages scroll container. Its box IS the
      // budget, on both axes: its top edge is the clip line under the header, and
      // its BOTTOM already rises with the software keyboard (the chat surface is
      // `.kb-lift`, Convention #28), so measuring the container needs no separate
      // keyboard arithmetic — one measurement covers both states.
      let c: HTMLElement | null = wrapper
      while (c) { const oy = getComputedStyle(c).overflowY; if (oy === "auto" || oy === "scroll") break; c = c.parentElement }
      const box = c ? c.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight)
      const w = wrapper.getBoundingClientRect()
      const GAP = 8
      const roomAbove = Math.max(0, w.top - box.top - GAP)
      const roomBelow = Math.max(0, box.bottom - w.bottom - GAP)
      // `scrollHeight` of the CONTENT, never the rendered height: the wrapper below
      // carries the `maxHeight` this computes, so reading its rect would feed the
      // clamp back into its own input and let the two oscillate.
      const natural = menuEl.scrollHeight
      // Prefer ABOVE (iMessage's grammar, and it keeps the message itself in view);
      // fall to BELOW only when above cannot hold it; if neither can, take the
      // roomier side and let the clamp scroll.
      const below = natural <= roomAbove ? false : natural <= roomBelow ? true : roomBelow > roomAbove
      setMenuBox({
        below,
        // The REAL room, with no minimum. A floor was tried (120px) and it is
        // exactly the thing this effect exists to prevent: on a 375×667 with the
        // keyboard up the transcript is ~205px tall, the room above a mid-message
        // is ~88, and the floor pushed the menu 32px off the top of it. A cramped
        // menu that scrolls is strictly better than a roomy one you cannot see.
        maxH: below ? roomBelow : roomAbove,
        // The content column is the horizontal budget. The reaction picker is a
        // fixed 352px wide, which is WIDER than the column on a 320 or 375 device —
        // 48px of it hung off the left edge, and since the transcript clips
        // horizontally it was silently cut rather than merely overflowing.
        maxW: Math.max(0, w.width),
      })
    }
    measure()
    // Re-measure if the menu's height changes after mount (e.g. the lazy full picker
    // finishing load) — AND if the CONTAINER changes, which is what happens when the
    // software keyboard opens or closes under an already-open menu. Without the
    // second observation the menu keeps the verdict it was born with: open the
    // keyboard while a menu is up and the transcript halves beneath it, leaving the
    // menu hanging behind the keys with nothing to correct it.
    const ro = new ResizeObserver(measure)
    ro.observe(menuEl)
    let scroller: HTMLElement | null = wrapper
    while (scroller) { const oy = getComputedStyle(scroller).overflowY; if (oy === "auto" || oy === "scroll") break; scroller = scroller.parentElement }
    if (scroller) ro.observe(scroller)
    return () => ro.disconnect()
    // Depend on WHICH menu is open, not merely whether one is. `anyMenuOpen` stays
    // true across emoji-bar → full-picker (the bar closes as the picker opens), so
    // a boolean dep left this effect un-rerun: menuRef had swapped to the new node
    // while the ResizeObserver was still watching the DETACHED bar, and placeBelow
    // kept the ~44px bar's verdict. The 435px picker then rendered above a message
    // 204px down and 235px of it sat off the top of the screen, unreachable.
  }, [anyMenuOpen, isEmojiPickerOpen, isFullPickerOpen])

  const groupGap = showGroupGap ? "mt-3" : ""

  // Date separator spacing. The 24px above earns its keep BETWEEN days — it
  // separates the previous day's messages from this stamp. At the very top of a
  // thread there is nothing above it to separate from, so that space is unearned
  // and just leaves the first message floating below the header.
  const dateSepClass = showDateSep
    ? `flex justify-center mb-2 ${isFirstMessage ? "mt-1" : "mt-6"}`
    : ""

  const incomingRadius = isFirstInGroup && isLastInGroup
    ? "rounded-[14px] rounded-tl-[4px]"
    : isFirstInGroup
      ? "rounded-[14px] rounded-tl-[4px] rounded-bl-[6px]"
      : isLastInGroup
        ? "rounded-[14px] rounded-tl-[6px]"
        : "rounded-[14px] rounded-l-[6px]"
  const outgoingRadius = isFirstInGroup && isLastInGroup
    ? "rounded-[14px] rounded-tr-[4px]"
    : isFirstInGroup
      ? "rounded-[14px] rounded-tr-[4px] rounded-br-[6px]"
      : isLastInGroup
        ? "rounded-[14px] rounded-tr-[6px]"
        : "rounded-[14px] rounded-r-[6px]"

  // Jumbo emoji (iMessage-style): one or two emoji ALONE render large and bare.
  // Only for a plain text message — a reply, an attachment or a link preview all
  // need the bubble to hold their own chrome, and a deleted row is a tombstone.
  const jumboCount = (!msg.deleted && !msg.reply_to_id && !msg.attachment_url && !linkPreview)
    ? jumboEmojiCount(msg.content)
    : null
  const isJumbo = jumboCount !== null

  // Grouped reactions — derived from this row's reactions slice only
  const rxMap: Record<string, { count: number; userReacted: boolean; userIds: string[] }> = {}
  for (const rx of reactions ?? []) {
    if (!rxMap[rx.emoji]) rxMap[rx.emoji] = { count: 0, userReacted: false, userIds: [] }
    rxMap[rx.emoji].count++
    rxMap[rx.emoji].userIds.push(rx.user_id)
    if (rx.user_id === userId) rxMap[rx.emoji].userReacted = true
  }
  const rxGroups = Object.entries(rxMap).map(([emoji, v]) => ({ emoji, ...v }))

  // ── Reaction-pill interaction ──────────────────────────────────────────────
  // TOUCH: tap toggles, ≥400ms opens the "who reacted" sheet — the same 400ms
  // grammar as Convention #7, but entirely LOCAL to the pill (the pointerdown
  // still stopPropagation()s, so the bubble's own timer never starts).
  //
  // MOUSE: press-and-hold is DELIBERATELY not a gesture here. Nothing else in
  // Central works that way, and arming it meant a slow click silently lost its
  // toggle. A desktop click has exactly one meaning — toggle — and the reactors
  // are revealed by HOVER instead (see the tooltip below). So the whole timer
  // path, and with it the trailing-click suppression, is skipped for a mouse.
  //
  // The trailing `click` after a touch long-press is the trap: without eating it,
  // opening the sheet would ALSO toggle. `suppressClick` is armed the moment the
  // sheet fires (and on cancel/multi-touch) and disarmed at the start of the next
  // fresh press, so a gesture that never emits a click can't leave it poisoned.
  // Keyboard activation (Enter/Space) emits a click with no pointerdown, so it
  // always falls through to the toggle.
  const rxPress = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    pointerId: number | null
    x: number
    y: number
    suppressClick: boolean
  }>({ timer: null, pointerId: null, x: 0, y: 0, suppressClick: false })

  // A row unmounting mid-press (pagination, room switch) must not fire the sheet.
  useEffect(() => {
    const p = rxPress.current
    return () => { if (p.timer) clearTimeout(p.timer) }
  }, [])

  const endRxPress = (suppressClick: boolean) => {
    const p = rxPress.current
    if (p.timer) { clearTimeout(p.timer); p.timer = null }
    p.pointerId = null
    if (suppressClick) p.suppressClick = true
  }

  const handleRxPointerDown = (e: React.PointerEvent<HTMLButtonElement>, emoji: string) => {
    // Keep the bubble's 400ms timer out of this — same guarantee the bare
    // stopPropagation used to give.
    e.stopPropagation()
    // A mouse never long-presses. Desktop reaches the reactors by hovering.
    if (e.pointerType === "mouse") return
    const p = rxPress.current
    if (p.pointerId !== null) {
      // A second finger landed mid-gesture — abandon it entirely and eat the click.
      endRxPress(true)
      return
    }
    p.pointerId = e.pointerId
    p.x = e.clientX
    p.y = e.clientY
    p.suppressClick = false
    p.timer = setTimeout(() => {
      p.timer = null
      p.suppressClick = true
      onShowReactors?.(msg.id, emoji)
    }, 400)
  }

  const handleRxPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const p = rxPress.current
    if (p.pointerId === null || p.pointerId !== e.pointerId) return
    // 12px of slop: a sloppy tap still counts, a drag or a scroll does not (and a
    // drag is not a toggle either, so the click is eaten too).
    if (Math.abs(e.clientX - p.x) > 12 || Math.abs(e.clientY - p.y) > 12) endRxPress(true)
  }

  const handleRxPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    endRxPress(false)
  }

  const handleRxPointerCancel = () => { endRxPress(true) }

  const handleRxClick = (e: React.MouseEvent<HTMLButtonElement>, emoji: string) => {
    e.stopPropagation()
    if (rxPress.current.suppressClick) { rxPress.current.suppressClick = false; return }
    onReact(msg.id, emoji)
  }

  // ── Desktop tooltip: who reacted with THIS emoji ───────────────────────────
  // Slack/Discord vocabulary, and the only non-touch route to the reactor names —
  // click keeps its single meaning. TWO triggers:
  //
  //   • HOVER, gated on `(hover: hover) and (pointer: fine)` so a touch device can
  //     never fire it (its route is the long-press sheet above) and a tablet on the
  //     desktop layout doesn't get a tooltip it cannot dismiss.
  //   • FOCUS-VISIBLE, ungated by pointer type — a keyboard user on ANY device gets
  //     the names by tabbing to the pill. `:focus-visible` (not `:focus`) is the
  //     whole trick: the browser only matches it when it judges focus came from the
  //     keyboard, so click-to-toggle does NOT pop a tooltip at the cursor.
  //
  // Enter/Space still toggle — the tooltip is descriptive, never an action target,
  // which is why it carries `aria-describedby` rather than being focusable itself.
  //
  // Portaled to <body> like ActionMenu (Convention #20's reasoning, not its
  // component): the transcript is an overflow-hidden scroll container, so an
  // absolutely-positioned tip would clip against it. Position is MEASURED after
  // mount — flip below when there is no room above, clamp to the viewport —
  // because the pill sits anywhere in a scrolling column.
  const [rxTip, setRxTip] = useState<{
    emoji: string
    text: string
    /** The pill, in viewport coords. */
    anchor: DOMRect
    /** The TRANSCRIPT column (the pill's nearest scrollable ancestor), in viewport
     *  coords. The tip is clamped to this, not to the window: reaction pills sit near
     *  the left gutter of the message column, and a viewport clamp let the tip run out
     *  past the column and float over the conversation-list panel beside it. */
    bounds: DOMRect
  } | null>(null)
  const [rxTipPos, setRxTipPos] = useState<{ left: number; top: number } | null>(null)
  const rxTipRef = useRef<HTMLDivElement>(null)
  // One id per ROW, pointed at by whichever pill is currently described (only one
  // tooltip can be open at a time). Without it a screen reader announces the pill as
  // just "👍 3" — the names are the whole point of the affordance.
  const rxTipId = useId()

  // Deliberately useEffect, not useLayoutEffect: the tip paints once unpositioned at
  // opacity 0, then lands and fades. A layout effect would flush both before paint —
  // correct position, but no --dur-fast fade, because the browser never sees the 0.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measured placement, same pattern as the menu above
    if (!rxTip) { setRxTipPos(null); return }
    const el = rxTipRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const a = rxTip.anchor
    const b = rxTip.bounds
    const minLeft = b.left + 8
    const maxRight = b.right - 8
    // Centred on the pill by default. When that would cross a column edge, ANCHOR to
    // the pill's own matching edge rather than sliding to a clamped position — an
    // incoming pill sits at the left gutter, so left-aligned keeps the tip visually
    // tied to the thing it describes; own-message pills mirror it on the right.
    let left = a.left + a.width / 2 - r.width / 2
    if (left < minLeft) left = a.left
    if (left + r.width > maxRight) left = a.right - r.width
    // Last resort for a tip wider than its column.
    left = Math.max(minLeft, Math.min(left, maxRight - r.width))
    const above = a.top - r.height - 6
    setRxTipPos({ left, top: above < 8 ? a.bottom + 6 : above })
  }, [rxTip])

  // Any scroll invalidates the measured anchor — close rather than chase it. Escape
  // dismisses it too (WAI-ARIA tooltip practice), for the hovered case as well as
  // the focused one.
  useEffect(() => {
    if (!rxTip) return
    const close = () => setRxTip(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [rxTip])

  // Shared by both triggers. Returns without showing anything if the roster has not
  // resolved — `resolveReactorName` returns null only in that case, and naming live
  // people "Former member" is a false statement, not a neutral placeholder.
  const showRxTip = (anchorEl: HTMLElement, emoji: string, userIds: string[]) => {
    if (!resolveReactorName) return
    const names: string[] = []
    for (const uid of userIds) {
      if (uid === userId) { names.push("You"); continue }
      const n = resolveReactorName(uid)
      if (n === null) return
      names.push(n)
    }
    if (names.length === 0) return
    // Nearest scrollable ancestor = the messages column (same walk the menu-placement
    // effect above does). Its box is the horizontal budget the tip may use.
    let c: HTMLElement | null = anchorEl.parentElement
    while (c) { const oy = getComputedStyle(c).overflowY; if (oy === "auto" || oy === "scroll") break; c = c.parentElement }
    const bounds = c
      ? c.getBoundingClientRect()
      : new DOMRect(0, 0, window.innerWidth, window.innerHeight)
    setRxTip({ emoji, text: `${listSentence(names)} reacted with ${emoji}`, anchor: anchorEl.getBoundingClientRect(), bounds })
  }

  const handleRxHover = (e: React.MouseEvent<HTMLButtonElement>, emoji: string, userIds: string[]) => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    showRxTip(e.currentTarget, emoji, userIds)
  }

  const handleRxFocus = (e: React.FocusEvent<HTMLButtonElement>, emoji: string, userIds: string[]) => {
    // `:focus-visible` is the browser's own keyboard-vs-pointer judgement — the
    // reason this can be wired up at all without a tooltip popping on every click.
    // `matches` throws on an unsupported selector in old engines; that degrades to
    // "no keyboard tooltip", never to a broken pill.
    let keyboard = false
    try { keyboard = e.currentTarget.matches(":focus-visible") } catch { keyboard = false }
    if (!keyboard) return
    showRxTip(e.currentTarget, emoji, userIds)
  }

  // Deleted poll tombstone
  if (msg.message_type === "poll" && msg.deleted) {
    return (
      <div className={`flex justify-center ${groupGap}`}>
        <span style={{ fontStyle: "italic", fontSize: 12, color: "var(--muted-text)", padding: "5px 14px", border: "1px solid var(--line)", borderRadius: 999 }}>
          Poll deleted
        </span>
      </div>
    )
  }

  // Poll message — full-width card with vote buttons
  if (msg.message_type === "poll" && msg.poll_id) {
    const counts = pollCounts ?? []
    const totalVotes = counts.reduce((s, c) => s + c, 0)
    const hasVoted = pollUserVote !== undefined && !isChangingVote

    return (
      <div ref={(el) => { registerMessageRef(msg.id, el) }}>
        {showDateSep && (
          <div className={dateSepClass}>
            <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "13px", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
              {formatDateLabel(msg.created_at)}
            </span>
          </div>
        )}
        <div className="flex flex-col items-center mt-4 mb-1">
          <div className="w-full max-w-[290px] bg-[var(--ivory)] rounded-2xl overflow-hidden">
            {poll ? (
              <>
                {/* Card header */}
                <div className="px-4 pt-4 pb-3 border-b border-[var(--line-3)] flex items-start gap-2">
                  <div className="flex-1 text-center">
                    <p className="text-[15px] font-medium text-[var(--ink)] leading-snug">{poll.question}</p>
                    <p className="text-[11px] text-[var(--muted-text)] mt-0.5">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
                  </div>
                  {/* Delete button — visible to creator or admin/leader */}
                  {(isOwn || isAdminOrLeader) && (
                    <div className="relative flex-shrink-0 -mt-1 -mr-1">
                      <button
                        onClick={e => { e.stopPropagation(); setPollMenuFor(isPollMenuOpen ? null : msg.id) }}
                        className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[var(--line-3)] transition-colors"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5 text-[var(--muted-text)]" />
                      </button>
                      {isPollMenuOpen && (
                        <div className="absolute right-0 top-8 z-[160] bg-[var(--ivory)] rounded-xl overflow-hidden min-w-[130px]">
                          <button
                            onClick={() => { setPollMenuFor(null); setConfirmDeletePoll(true) }}
                            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete poll
                          </button>
                        </div>
                      )}
                      <ConfirmDialog open={confirmDeletePoll} title="Delete this poll?" message="This removes the poll and its votes for everyone." confirmLabel="Delete" onConfirm={() => { setConfirmDeletePoll(false); onDeletePoll(msg.id, msg.poll_id!) }} onClose={() => setConfirmDeletePoll(false)} />
                    </div>
                  )}
                </div>
                {/* Preview — first 3 options, read-only */}
                <div className="px-4 pt-3 pb-2 flex flex-col gap-2.5">
                  {poll.options.slice(0, 3).map((opt, oi) => {
                    const count = counts[oi] ?? 0
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                    const isSelected = pollUserVote === oi
                    return (
                      <div key={oi}>
                        <div className="flex items-center justify-between mb-1">
                          {hasVoted ? (
                            <>
                              <span className={`text-[13px] font-medium ${isSelected ? "text-[var(--plum)]" : "text-[var(--ink)]"}`}>{opt}</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {isSelected && <Check className="w-3 h-3 text-[var(--plum)]" />}
                                <span className={`text-[12px] font-medium ${isSelected ? "text-[var(--plum)]" : "text-[var(--muted-text)]"}`}>{count}</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--dashed)] flex-shrink-0" />
                              <span className="text-[13px] text-[var(--ink)]">{opt}</span>
                            </div>
                          )}
                        </div>
                        {hasVoted && (
                          <div className="h-1.5 w-full rounded-full bg-[var(--line-3)] overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: isSelected ? "var(--plum)" : "var(--dashed)" }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {poll.options.length > 3 && (
                    <p className="text-[12px] text-[var(--muted-text)] mt-0.5">and {poll.options.length - 3} more option{poll.options.length - 3 !== 1 ? "s" : ""}…</p>
                  )}
                </div>
                <div className="px-4 pb-4 pt-1">
                  <button
                    onClick={() => onOpenVoteSheet(msg.poll_id!, hasVoted)}
                    className={`w-full py-2.5 rounded-xl transition-all text-[13px] font-medium ${hasVoted ? "bg-[var(--body-bg)] hover:bg-[var(--line)] text-[var(--body)]" : "bg-[var(--plum)] hover:bg-[var(--plum-2)] text-white"}`}
                  >
                    {hasVoted ? "Change vote" : "Vote"}
                  </button>
                </div>
              </>
            ) : (
              <div className="px-4 py-4 flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-[var(--plum)] border-t-transparent rounded-full animate-spin" />
                <span className="text-[13px] text-[var(--muted-text)]">Loading poll…</span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-[var(--muted-text)] mt-1.5">{formatMessageTime(msg.created_at)}</p>
        </div>
      </div>
    )
  }

  // System message — centered event note, no bubble
  // Invite card — an invitation to an open group. Rendered as a card in the stream
  // (not a bubble): it is an object you act on, not something someone said.
  if (msg.message_type === "invite" && msg.invite_group_id) {
    return (
      <div ref={(el) => { registerMessageRef(msg.id, el) }}>
        {showDateSep && (
          <div className={dateSepClass}>
            <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "13px", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
              {formatDateLabel(msg.created_at)}
            </span>
          </div>
        )}
        <div className={`flex ${isOwn ? "justify-end" : "justify-start"} ${groupGap}`}>
          <InviteCard
            inviteGroupId={msg.invite_group_id}
            userId={userId}
            ministryId={ministryId}
            onOpenChat={onOpenChat ?? (() => {})}
          />
        </div>
      </div>
    )
  }

  if (msg.message_type === "system") {
    const voteGroup = msg._voteGroup
    let displayContent = msg.content
    if (voteGroup && voteGroup.length > 1) {
      if (voteGroup.length <= 3) displayContent = `${voteGroup.join(", ")} voted in the poll`
      else displayContent = `${voteGroup.slice(0, 2).join(", ")} and ${voteGroup.length - 2} others voted in the poll`
    }
    return (
      <div ref={(el) => { registerMessageRef(msg.id, el) }}>
        {showDateSep && (
          <div className={dateSepClass}>
            <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "13px", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
              {formatDateLabel(msg.created_at)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 my-2 px-1">
          <div className="flex-1 h-px bg-[var(--line)]/70" />
          {/* WRAPS. `nowrap` here let any system line longer than the viewport push
              the whole transcript wider, making the chat scroll sideways — the
              maxWidth capped the box, not the text inside it. */}
          <span style={{ fontSize: "12px", color: "var(--muted-text)", fontStyle: "italic", maxWidth: "72%", overflowWrap: "anywhere" }} className="text-center select-none">
            {displayContent}
          </span>
          <div className="flex-1 h-px bg-[var(--line)]/70" />
        </div>
      </div>
    )
  }

  return (
    <div ref={(el) => { registerMessageRef(msg.id, el) }}>
      {/* Date separator */}
      {showDateSep && (
        <div className={dateSepClass}>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "13px", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
            {formatDateLabel(msg.created_at)}
          </span>
        </div>
      )}

      <div className={`flex flex-col relative ${isOwn ? "items-end" : "items-start"} ${groupGap}`}>
        {/* Emoji picker */}
        {isEmojiPickerOpen && (
          <div
            ref={menuRef}
            className={`msg-menu-clamp absolute z-[160] ${placeBelow ? "top-[calc(100%-4px)]" : "bottom-[calc(100%-4px)]"} ${isOwn ? "right-0" : "left-0"}`}
            style={menuBox ? { maxHeight: menuBox.maxH, maxWidth: menuBox.maxW, overflowY: "auto" } : undefined}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--ivory)] rounded-2xl px-3 py-2.5 flex gap-3 items-center">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => { e.stopPropagation(); onReact(msg.id, emoji) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  className="text-[22px] hover:scale-125 active:scale-95 transition-transform"
                >
                  {emoji}
                </button>
              ))}
              <button
                onClick={(e) => { e.stopPropagation(); setEmojiPickerFor(null); setFullReactionPickerFor(msg.id) }}
                onPointerDown={(e) => e.stopPropagation()}
                className="w-9 h-9 rounded-full bg-[var(--line-2)] flex items-center justify-center text-[var(--body)] hover:bg-[var(--line)] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Full reaction picker — independent of entry point (emoji bar or context menu) */}
        {isFullPickerOpen && (
          <div
            ref={menuRef}
            className={`msg-menu-clamp absolute z-[161] ${placeBelow ? "top-[calc(100%+4px)]" : "bottom-[calc(100%+4px)]"} ${isOwn ? "right-0" : "left-0"}`}
            style={menuBox
              ? { maxWidth: menuBox.maxW, maxHeight: menuBox.maxH, overflowY: "auto", borderRadius: 12 }
              : undefined}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Mounted only once the box is measured, so emoji-mart is built with
                the right column count the first time — it sizes itself on mount and
                does not resize afterwards. useLayoutEffect fills `menuBox` before
                paint, so this costs no visible delay. */}
            {menuBox && (
              <LazyEmojiPicker
                perLine={emojiPerLine(menuBox.maxW)}
                onEmojiSelect={(e: { native: string }) => { onReact(msg.id, e.native); setFullReactionPickerFor(null) }}
              />
            )}
          </div>
        )}

        {/* Context menu */}
        {/* The long-press menu is NOT here any more. It lives in the portaled
            MessageMenuOverlay that ChatScreen mounts (components/central), because
            an anchored menu inside this row is inside the transcript's own scroll
            container: it cannot dim what surrounds it, it can be clipped by that
            container, and near the top or bottom of the screen it has nowhere to
            go. `isContextMenuOpen` still arrives as a prop — it is what dims THIS
            row's original bubble while its clone is lifted out (see the bubble's
            `visibility` above). */}

        {/* Pinned indicator */}
        {isPinned && (
          <div className={`flex items-center gap-1 mb-0.5 ${isOwn ? "justify-end pr-1" : "justify-start ml-9"}`}>
            <Pin className="w-3 h-3 text-[var(--gold)]" />
            <span className="text-[11px] text-[var(--gold)] font-medium">Pinned</span>
          </div>
        )}
        {/* Forwarded indicator */}
        {msg.message_type === "forwarded" && (
          <div className={`flex items-center gap-1 mb-0.5 ${isOwn ? "justify-end pr-1" : "justify-start ml-9"}`}>
            <Forward className="w-3 h-3 text-[var(--muted-text)]" />
            <span className="text-[11px] text-[var(--muted-text)]">Forwarded</span>
          </div>
        )}
        {!isOwn && isFirstInGroup && (
          <div className="flex items-baseline gap-1.5 mb-1 ml-9">
            <span
              className={`text-[13px] font-medium text-[var(--ink)]${canOpenSenderProfile ? " cursor-pointer hover:underline" : ""}`}
              onClick={canOpenSenderProfile ? openSenderProfile : undefined}
            >{msg.sender_name || "Former Member"}</span>
            {senderDeparted && (
              <span className="text-[11px] text-[var(--muted-text)] italic">· left the ministry</span>
            )}
            <span className="text-[12px] text-[var(--muted-text)]">{formatMessageTime(msg.created_at)}</span>
          </div>
        )}

        {/* Avatar + bubble row. An OWN bubble is right-aligned and flush to the
            transcript's trailing inset, so answering a RIGHTWARD swipe means
            travelling off the edge — the clip that allows that lives on the
            transcript scroller (`overflow-x-hidden` in chats-tab.tsx), not here,
            because `overflow: hidden` clips at the PADDING box and the scroller's
            padding box is the screen. Clipping on this row instead cuts at its
            CONTENT box, 16px in, which leaves a cream strip beside a hard-sliced
            bubble and reads as a rendering bug (measured: row right edge 374,
            screen 390). `overflow-clip-margin` does not rescue it — with a
            one-axis `clip` it computes to 0px. */}
        <div className={`flex items-end gap-2 w-full ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
          {/* Avatar — shown for every incoming message. Tap opens the sender's
              profile (a sibling of the bubble → does not touch the bubble's
              press/context-menu logic). Wrapper preserves the flex-end align. */}
          {!isOwn && (
            <span
              onClick={canOpenSenderProfile ? openSenderProfile : undefined}
              style={{ display: "inline-flex", alignSelf: "flex-end", cursor: canOpenSenderProfile ? "pointer" : "default" }}
            >
              <MonogramChip
                initials={(msg.sender_name || "?").charAt(0).toUpperCase()}
                avatarUrl={!senderDeparted ? (msg.sender_avatar_url || undefined) : undefined}
                className="w-7 h-7 text-[11px] font-medium"
                style={{ opacity: senderDeparted || !msg.sender_id ? 0.4 : 1 }}
              />
            </span>
          )}

          {/* Bubble wrapper — carries the 75% clamp (moved off the bubble so the
              bubble itself can translate) and anchors the reply glyph. The glyph
              sits AT the bubble's resting left edge, hidden behind it, and is
              uncovered by the swipe: anchoring to the bubble's own box is the
              only placement that works for an incoming bubble (fixed left edge,
              avatar beside it) and an own one (right-aligned, left edge varies
              with content) without measuring anything. */}
          <div className="relative flex max-w-[75%] min-w-0">
            <span
              ref={replyGlyphRef}
              aria-hidden
              style={{
                position: "absolute", left: 8, top: "50%", marginTop: -8,
                opacity: 0, transform: "scale(0.7)", pointerEvents: "none",
                display: "inline-flex",
              }}
            >
              <CornerUpLeft style={{ width: 16, height: 16, color: "var(--muted-text)" }} />
            </span>
          <div
            ref={bubbleRef}
            // The swipe target, and the e2e anchor for it — same role
            // `data-pocket-row` plays for the mobile list gestures.
            data-message-bubble={msg.id}
            title="Swipe right to reply · long-press for reactions"
            onPointerDown={() => onPointerDown(msg)}
            onPointerUp={() => onPointerUp(msg)}
            onPointerLeave={onPointerCancel}
            onPointerCancel={onPointerCancel}
            // pan-y leaves vertical scrolling and pull-to-refresh entirely to the
            // browser — the swipe only ever claims a horizontal drag.
            // While the immersive menu is up, the ORIGINAL is hidden and its clone
            // in the overlay stands in for it. `visibility`, not `display`: the row
            // must keep its height or the transcript reflows underneath the menu and
            // the bubble the user is looking at appears to jump when it closes.
            style={{ touchAction: "pan-y", visibility: isContextMenuOpen ? "hidden" : undefined }}
            className={`relative text-[14px] leading-[1.4] select-none overflow-hidden ${
              isJumbo
                // No surface, no padding, no radius — the emoji IS the message.
                // Same element and same handlers, so Convention #7's tap/long-press
                // timing is untouched; only the skin comes off.
                ? "bg-transparent px-0 py-0.5"
                : msg.deleted
                  ? isOwn
                    ? `bg-[var(--plum-2)]/30 text-[color-mix(in_srgb,var(--cream-on-dark)_50%,transparent)] ${outgoingRadius} px-4 py-2`
                    : `bg-[var(--ivory)] text-[var(--muted-text)] ${incomingRadius} px-4 py-2`
                  : isOwn
                    ? `bg-[var(--plum-2)] text-[var(--cream-on-dark)] ${outgoingRadius}`
                    : `bg-[var(--ivory)] text-[var(--ink)] ${incomingRadius}`
            } ${!isJumbo && !msg.deleted && !msg.reply_to_id && !(msg.attachment_url && msg.attachment_type?.startsWith("image/")) ? "px-4 py-2.5" : ""}`}
          >
            {msg.deleted ? (
              <span className="italic text-[13px]">Message deleted</span>
            ) : (
              <>
                {msg.reply_to_id && msg.reply_to_content && (
                  <div className="px-3 pt-2.5 pb-0">
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onScrollToMessage(msg.reply_to_id!)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg flex flex-col gap-0.5 ${
                        isOwn
                          ? "bg-[var(--cream-panel)]/10 border-l-[2px] border-[var(--cream-on-dark)]/50"
                          : "bg-[var(--line-2)] border-l-[2px] border-[var(--plum)]"
                      }`}
                    >
                      <span className={`text-[11px] font-medium flex items-center gap-1 ${isOwn ? "text-[color-mix(in_srgb,var(--cream-on-dark)_90%,transparent)]" : "text-[var(--plum)]"}`}>
                        <CornerUpLeft className="w-3 h-3" />
                        {msg.reply_to_sender}
                      </span>
                      <span className={`text-[12px] truncate ${isOwn ? "text-[color-mix(in_srgb,var(--cream-on-dark)_70%,transparent)]" : "text-[var(--muted-text)]"}`}>
                        {msg.reply_to_content.slice(0, 80)}
                      </span>
                    </button>
                  </div>
                )}
                {isEditing ? (
                  <div
                    className={msg.reply_to_id ? "px-3 pb-2.5 pt-1.5" : ""}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {/* Ghost text maintains bubble's natural width/height; textarea overlays it */}
                    <div className="relative">
                      <div
                        aria-hidden
                        className="text-[14px] leading-[1.4] invisible select-none whitespace-pre-wrap break-words"
                        style={{ fontFamily: "inherit", wordBreak: "break-word" }}
                      >
                        {editText || " "}
                      </div>
                      <textarea
                        autoFocus
                        value={editText ?? ""}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSaveEdit() } else if (e.key === "Escape") { setEditingId(null) } }}
                        className="absolute inset-0 w-full h-full resize-none bg-transparent text-inherit text-[14px] leading-[1.4] outline-none"
                        style={{ fontFamily: "inherit", border: "none", padding: 0, margin: 0 }}
                      />
                    </div>
                    <div className="flex gap-2 justify-end mt-1.5">
                      <button onClick={() => setEditingId(null)} className={`text-[12px] transition-opacity ${isOwn ? "text-[color-mix(in_srgb,var(--cream-on-dark)_50%,transparent)] hover:text-[color-mix(in_srgb,var(--cream-on-dark)_80%,transparent)]" : "text-[var(--muted-text)] hover:text-[var(--body)]"}`}>Cancel</button>
                      <button onClick={onSaveEdit} className={`text-[12px] font-medium px-2.5 py-0.5 rounded-md transition-colors ${isOwn ? "bg-[var(--cream-panel)]/20 hover:bg-[var(--cream-panel)]/30 text-[var(--cream-on-dark)]" : "bg-[var(--plum)]/10 hover:bg-[var(--plum)]/20 text-[var(--plum)]"}`}>Save</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Image attachment */}
                    {msg.attachment_url && msg.attachment_type?.startsWith("image/") && (
                      <div
                        className={msg.reply_to_id ? "mt-2 mb-0.5" : ""}
                      >
                        {/* The long-press contract (Convention #7) lives on the
                            bubble, but iOS ALSO opens its own Save/Copy/Share
                            sheet on a long-pressed <img>, so both fired at once
                            and the native one won the gesture. Suppressing the
                            callout on the image leaves the bubble's handlers
                            untouched — the timing contract is unchanged.
                            onContextMenu covers Android/desktop, which use a
                            context-menu event rather than the callout. */}
                        <img
                          src={msg.attachment_url}
                          alt="Image"
                          draggable={false}
                          onContextMenu={(e) => e.preventDefault()}
                          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                          className="w-full max-h-[280px] object-cover cursor-pointer"
                        />
                      </div>
                    )}
                    {/* File attachment */}
                    {msg.attachment_url && msg.attachment_type && !msg.attachment_type.startsWith("image/") && (
                      <div
                        className="flex items-center gap-2.5 hover:bg-black/5 transition-colors rounded-xl p-1 cursor-pointer"
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isOwn ? "bg-[var(--cream-panel)]/10" : "bg-[var(--line-2)]"}`}>
                          <FileDown className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate">{msg.attachment_name ?? "File"}</p>
                          {msg.attachment_size != null && (
                            <p className={`text-[11px] ${isOwn ? "text-[color-mix(in_srgb,var(--cream-on-dark)_50%,transparent)]" : "text-[var(--muted-text)]"}`}>{formatFileSize(msg.attachment_size)}</p>
                          )}
                        </div>
                        <FileDown className={`w-4 h-4 flex-shrink-0 ${isOwn ? "text-[color-mix(in_srgb,var(--cream-on-dark)_40%,transparent)]" : "text-[var(--faint)]"}`} />
                      </div>
                    )}
                    {/* Text content */}
                    {msg.content && (
                      <>
                        <div
                          className={(msg.reply_to_id || msg.attachment_url) ? "px-4 pt-1.5 pb-2.5" : ""}
                          style={{
                            whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word",
                            // lineHeight 1.15 keeps a 44px glyph from stacking the
                            // row's height on a 1.4 body ratio meant for 14px text.
                            ...(isJumbo ? { fontSize: jumboFontSize(jumboCount!), lineHeight: 1.15 } : null),
                          }}
                        >
                          {renderMentions(msg.content, isOwn)}
                        </div>
                        {linkPreview && (
                          <a
                            href={linkPreview.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className={`block mx-3 mb-2 rounded-xl overflow-hidden border text-left transition-opacity hover:opacity-90 ${isOwn ? "border-[color-mix(in_srgb,var(--cream-on-dark)_20%,transparent)] bg-[var(--cream-panel)]/10" : "border-[var(--line)] bg-[var(--body-bg)]"}`}
                            style={{ textDecoration: "none" }}
                          >
                            {linkPreview.image && (
                              <img src={linkPreview.image} alt="" className="w-full max-h-[120px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                            )}
                            <div className="px-3 py-2">
                              <p className={`text-[10px] font-medium uppercase tracking-wide mb-0.5 ${isOwn ? "text-[color-mix(in_srgb,var(--cream-on-dark)_50%,transparent)]" : "text-[var(--muted-text)]"}`}>{linkPreview.hostname}</p>
                              {linkPreview.title && <p className={`text-[13px] font-medium leading-snug ${isOwn ? "text-[var(--cream-on-dark)]" : "text-[var(--ink)]"}`}>{linkPreview.title.slice(0, 80)}</p>}
                              {linkPreview.description && <p className={`text-[11px] mt-0.5 line-clamp-2 ${isOwn ? "text-[color-mix(in_srgb,var(--cream-on-dark)_60%,transparent)]" : "text-[var(--body)]"}`}>{linkPreview.description.slice(0, 120)}</p>}
                            </div>
                          </a>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          </div>
        </div>

        {/* Edited label */}
        {msg.is_edited && !msg.deleted && (
          <div className={`mt-0.5 ${isOwn ? "pr-1 text-right" : "pl-9 text-left"}`}>
            <span className="text-[10px]" style={{ color: "var(--muted-text)", fontFamily: "var(--sans)" }}>edited</span>
          </div>
        )}

        {/* Reactions — a badge that DIGS INTO the bubble (the Messenger shape).
            Pulled up by 8px so it overlaps the bubble's bottom edge by roughly a
            third of its own height, and ringed in the chat surface so the overlap
            reads as one chip sitting ON the message rather than a pill fused to
            it. `relative z-10` because the bubble is painted after this in the
            column and would otherwise cover the part that overlaps.
            The ring is a GAP IN THE SURFACE, not a border — the same technique
            (and the same 2px) the avatar cluster uses between overlapping faces,
            which is why it is exempt from the 1px hairline rule. It must stay the
            colour of whatever is BEHIND the bubble, so it disappears into the
            page instead of drawing a second outline. */}
        {!msg.deleted && rxGroups.length > 0 && (
          <div className={`relative z-10 flex flex-wrap gap-1 -mt-2 ${isOwn ? "pr-3" : "pl-11"}`}>
            {rxGroups.map(({ emoji, count, userReacted, userIds }) => (
              <button
                key={emoji}
                onPointerDown={(e) => handleRxPointerDown(e, emoji)}
                onPointerMove={handleRxPointerMove}
                onPointerUp={handleRxPointerUp}
                onPointerCancel={handleRxPointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                onClick={(e) => handleRxClick(e, emoji)}
                onMouseEnter={(e) => handleRxHover(e, emoji, userIds)}
                onMouseLeave={() => setRxTip(null)}
                onFocus={(e) => handleRxFocus(e, emoji, userIds)}
                onBlur={() => setRxTip(null)}
                aria-describedby={rxTip?.emoji === emoji ? rxTipId : undefined}
                style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[12px] transition-all active:scale-95 border-2 border-[var(--cream)] ${
                  userReacted
                    ? "bg-[var(--plum)]"
                    : "bg-[var(--ivory)]"
                }`}
              >
                <span>{emoji}</span>
                <span className={`text-[11px] font-medium ${userReacted ? "text-[var(--cream-on-dark)]" : "text-[var(--muted-text)]"}`}>{count}</span>
              </button>
            ))}
          </div>
        )}
        {rxTip && typeof document !== "undefined" && createPortal(
          <div
            ref={rxTipRef}
            id={rxTipId}
            role="tooltip"
            style={{
              position: "fixed",
              left: rxTipPos?.left ?? 0,
              top: rxTipPos?.top ?? 0,
              zIndex: 200,
              maxWidth: 260,
              padding: "8px 10px",
              background: "var(--cream-panel)",
              border: "1px solid var(--line-2)",
              borderRadius: 10,
              fontSize: 13,
              lineHeight: 1.4,
              color: "var(--body)",
              pointerEvents: "none",
              opacity: rxTipPos ? 1 : 0,
              transition: "opacity var(--dur-fast) ease-out",
            }}
          >
            {rxTip.text}
          </div>,
          document.body,
        )}

        {/* Delete confirmation */}
        {isDeleting && (
          <div
            className={`flex items-center gap-2 mt-1 px-1 ${isOwn ? "justify-end" : "justify-start"}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="text-[12px] text-[var(--body)]">Delete this message?</span>
            <button onClick={() => onDeleteMessage(msg.id)} className="text-[12px] font-medium text-[var(--danger)] hover:text-[color-mix(in_srgb,var(--danger)_80%,var(--ink))] transition-colors">Delete</button>
            <button onClick={() => setDeletingId(null)} className="text-[12px] text-[var(--muted-text)] hover:text-[var(--body)] transition-colors">Cancel</button>
          </div>
        )}

        {/* Read receipts + (own only) the timestamp.
            Receipts hang off ANY message, not just your own: they mark how far
            each person has read, and the last thing somebody read is usually not
            something you sent. They stay right-aligned on both sides — the row
            reads as a margin note about the conversation, not as part of an
            incoming bubble. Incoming messages get no timestamp here (theirs is in
            the group header), so this row is receipts alone for them. */}
        {(isOwn || (readReceipts?.length ?? 0) > 0) && (
          // `w-full` is load-bearing on the incoming side: the column wrapper is
          // `items-start` there, so the row shrinks to its content and
          // `justify-end` has nothing to push against — the chips rendered hard
          // LEFT, under the avatar. Spanning the column first is what puts them
          // on the right, where Messenger keeps them regardless of who sent the
          // message they are marking.
          <div className={`flex items-center gap-1.5 mt-1 pr-1 ${isOwn ? "" : "w-full justify-end"}`}>
            {(readReceipts?.length ?? 0) > 0 && (
              <div className="flex items-center">
                {readReceipts!.map(({ name, avatarUrl }, idx) => (
                  <MonogramChip
                    key={`${name}-${idx}`}
                    initials={name.charAt(0).toUpperCase()}
                    avatarUrl={avatarUrl || undefined}
                    title={`Read by ${name}`}
                    className={`w-4 h-4 border border-[var(--line-3)] text-[6px] font-medium${idx > 0 ? " -ml-1" : ""}`}
                  />
                ))}
              </div>
            )}
            {isOwn && <span className="text-[11px] text-[var(--muted-text)]">{formatMessageTime(msg.created_at)}</span>}
          </div>
        )}

        {/* Large-room aggregated read receipt — on-demand "Seen by N",
            rendered only under the user's own most-recent message. */}
        {isLargeRoom && isOwn && isLatestOwn && seenByCount !== null && seenByCount > 0 && (
          <div className="flex flex-col items-end gap-1 mt-1 pr-1" onPointerDown={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSeenBy?.() }}
              className="text-[11px] text-[var(--muted-text)] hover:text-[var(--body)] transition-colors"
              style={{ padding: "4px 10px", borderRadius: 999, background: "var(--ivory)" }}
            >
              Seen by {seenByCount}
            </button>
            {seenByOpen && seenByList && (
              <div
                className="flex flex-col gap-1.5 items-end"
                style={{ padding: "8px 10px", borderRadius: 12, background: "var(--ivory)", maxWidth: 220 }}
              >
                {seenByList.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--body)] truncate">{r.name}</span>
                    <MonogramChip
                      initials={r.name.charAt(0).toUpperCase()}
                      avatarUrl={r.avatarUrl || undefined}
                      className="w-5 h-5 text-[8px] font-medium"
                    />
                  </div>
                ))}
                {seenByCount > seenByList.length && (
                  <span className="text-[11px] text-[var(--muted-text)]">+{seenByCount - seenByList.length} more</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const MessageRow = memo(MessageRowBase)
