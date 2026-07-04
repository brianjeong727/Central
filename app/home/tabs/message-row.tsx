"use client"

import { memo, useState, useEffect, useRef, useLayoutEffect } from "react"
import dynamic from "next/dynamic"
import { Check, MoreHorizontal, Trash2, CornerUpLeft, Plus, Pencil, Forward, Pin, FileDown } from "lucide-react"
import { MonogramChip } from "@/components/central"
import { formatMessageTime, REACTION_EMOJIS } from "../utils"
import type { MessageRowProps } from "../types"

// emoji-mart is ~2MB (almost entirely the @emoji-mart/data JSON). Load both the
// Picker component and its data lazily — only when a picker actually opens — so
// nothing emoji-mart ships in the chats chunk until the user reaches for it.
const EmojiMartPicker = dynamic(() => import("@emoji-mart/react"), { ssr: false })

export function LazyEmojiPicker({
  onEmojiSelect,
  theme = "light",
  previewPosition = "none",
  skinTonePosition = "none",
}: {
  onEmojiSelect: (e: { native: string }) => void
  theme?: string
  previewPosition?: string
  skinTonePosition?: string
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
          background: "var(--cream)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
          boxShadow: "0 8px 30px color-mix(in srgb, var(--ink) 12%, transparent)",
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
    />
  )
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

function renderMentions(content: string, isOwn: boolean): React.ReactNode {
  const parts = content.split(/(@\S+)/g)
  return <>{parts.map((part, i) =>
    part.startsWith("@")
      ? <span key={i} style={{ fontWeight: 700, color: isOwn ? "#F6C96A" : "#8B5E1A" }}>{part}</span>
      : part
  )}</>
}

function highlightText(text: string, query: string, isCurrent: boolean): React.ReactNode {
  const q = query.toLowerCase().trim()
  if (!q) return text
  const lower = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let i = 0
  let key = 0
  while (i < text.length) {
    const idx = lower.indexOf(q, i)
    if (idx === -1) { parts.push(text.slice(i)); break }
    if (idx > i) parts.push(text.slice(i, idx))
    parts.push(
      <mark key={key++} style={{ background: isCurrent ? "var(--gold)" : "rgba(212,164,92,0.45)", color: "var(--ink)", borderRadius: 2, padding: "0 1px" }}>
        {text.slice(idx, idx + q.length)}
      </mark>
    )
    i = idx + q.length
  }
  return <>{parts}</>
}

// Memoized per-message row. ChatScreen re-renders on every composer keystroke,
// typing broadcast, and realtime event — this memo boundary keeps rows whose
// props didn't change from re-rendering. All callbacks passed in are stable
// (useCallback in ChatScreen or bare setState setters); all open/active state
// arrives as per-row booleans, never shared open-ids.
function MessageRowBase({
  msg,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  showDateSep,
  showGroupGap,
  senderDeparted,
  userId,
  canPin,
  isAdminOrLeader,
  isEmojiPickerOpen,
  isFullPickerOpen,
  isContextMenuOpen,
  isDeleting,
  isEditing,
  isPollMenuOpen,
  isPinned,
  editText,
  highlightQuery,
  isActiveSearchMatch,
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
  onStartEdit,
  onForward,
  onPin,
  onUnpin,
  onScrollToMessage,
  onOpenVoteSheet,
  setEmojiPickerFor,
  setFullReactionPickerFor,
  setContextMenuFor,
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
  const [placeBelow, setPlaceBelow] = useState(false)
  const anyMenuOpen = isEmojiPickerOpen || isFullPickerOpen || isContextMenuOpen
  useLayoutEffect(() => {
    if (!anyMenuOpen) { setPlaceBelow(false); return }
    const menuEl = menuRef.current
    const wrapper = menuEl?.parentElement            // the `flex flex-col relative` message wrapper
    if (!menuEl || !wrapper) return
    const measure = () => {
      // nearest scrollable ancestor = the messages scroll container (its top edge is the clip line under the header)
      let c: HTMLElement | null = wrapper
      while (c) { const oy = getComputedStyle(c).overflowY; if (oy === "auto" || oy === "scroll") break; c = c.parentElement }
      const containerTop = c ? c.getBoundingClientRect().top : 0
      const wrapperTop = wrapper.getBoundingClientRect().top
      const menuHeight = menuEl.getBoundingClientRect().height
      // Placement-INDEPENDENT test (uses height + message top, NOT the menu's own top, so it can't oscillate):
      // above-placement puts the menu top at ~ wrapperTop - 4 - menuHeight. Flip below if that clips the container top.
      setPlaceBelow((wrapperTop - 4 - menuHeight) < (containerTop + 8))
    }
    measure()
    // Re-measure if the menu's height changes after mount (e.g. the lazy full picker finishing load).
    const ro = new ResizeObserver(measure)
    ro.observe(menuEl)
    return () => ro.disconnect()
  }, [anyMenuOpen])

  const groupGap = showGroupGap ? "mt-3" : ""

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

  // Grouped reactions — derived from this row's reactions slice only
  const rxMap: Record<string, { count: number; userReacted: boolean }> = {}
  for (const rx of reactions ?? []) {
    if (!rxMap[rx.emoji]) rxMap[rx.emoji] = { count: 0, userReacted: false }
    rxMap[rx.emoji].count++
    if (rx.user_id === userId) rxMap[rx.emoji].userReacted = true
  }
  const rxGroups = Object.entries(rxMap).map(([emoji, v]) => ({ emoji, ...v }))

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
          <div className="flex justify-center my-6">
            <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "13px", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
              {formatDateLabel(msg.created_at)}
            </span>
          </div>
        )}
        <div className="flex flex-col items-center mt-4 mb-1">
          <div className="w-full max-w-[290px] bg-[var(--cream-panel)] border border-[var(--line)] rounded-2xl overflow-hidden shadow-sm">
            {poll ? (
              <>
                {/* Card header */}
                <div className="px-4 pt-4 pb-3 border-b border-[#F0EDE6] flex items-start gap-2">
                  <div className="flex-1 text-center">
                    <p className="text-[15px] font-bold text-[var(--ink)] leading-snug">{poll.question}</p>
                    <p className="text-[11px] text-[var(--muted-text)] mt-0.5">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
                  </div>
                  {/* Delete button — visible to creator or admin/leader */}
                  {(isOwn || isAdminOrLeader) && (
                    <div className="relative flex-shrink-0 -mt-1 -mr-1">
                      <button
                        onClick={e => { e.stopPropagation(); setPollMenuFor(isPollMenuOpen ? null : msg.id) }}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#F0EDE6] transition-colors"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5 text-[var(--muted-text)]" />
                      </button>
                      {isPollMenuOpen && (
                        <div className="absolute right-0 top-8 z-[160] bg-[var(--cream-panel)] rounded-xl border border-[var(--line)] shadow-lg overflow-hidden min-w-[130px]">
                          <button
                            onClick={() => onDeletePoll(msg.id, msg.poll_id!)}
                            className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium text-red-500 hover:bg-[#FEF2F2] transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete poll
                          </button>
                        </div>
                      )}
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
                              <span className={`text-[13px] font-semibold ${isSelected ? "text-[var(--plum)]" : "text-[var(--ink)]"}`}>{opt}</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {isSelected && <Check className="w-3 h-3 text-[var(--plum)]" />}
                                <span className={`text-[12px] font-semibold ${isSelected ? "text-[var(--plum)]" : "text-[var(--muted-text)]"}`}>{count}</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-3.5 h-3.5 rounded-full border-2 border-[#D8D3C8] flex-shrink-0" />
                              <span className="text-[13px] text-[var(--ink)]">{opt}</span>
                            </div>
                          )}
                        </div>
                        {hasVoted && (
                          <div className="h-1.5 w-full rounded-full bg-[#F0EDE6] overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: isSelected ? "var(--plum)" : "#C4BDB8" }} />
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
                    className={`w-full py-2.5 rounded-xl transition-all text-[13px] font-semibold ${hasVoted ? "bg-[var(--body-bg)] hover:bg-[var(--line)] text-[var(--body)]" : "bg-[var(--plum)] hover:bg-[var(--plum-2)] text-white"}`}
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
          <p className="text-[11px] text-[#B0A9A0] mt-1.5">{formatMessageTime(msg.created_at)}</p>
        </div>
      </div>
    )
  }

  // System message — centered event note, no bubble
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
          <div className="flex justify-center my-6">
            <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "13px", color: "var(--muted-text)", whiteSpace: "nowrap" }}>
              {formatDateLabel(msg.created_at)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-3 my-2 px-1">
          <div className="flex-1 h-px bg-[var(--line)]/70" />
          <span style={{ fontSize: "12px", color: "var(--muted-text)", fontStyle: "italic", whiteSpace: "nowrap", maxWidth: "72%" }} className="text-center select-none">
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
        <div className="flex justify-center my-6">
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
            className={`absolute z-[160] ${placeBelow ? "top-[calc(100%-4px)]" : "bottom-[calc(100%-4px)]"} ${isOwn ? "right-0" : "left-0"}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--cream-panel)] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-[#EFEFEF] px-3 py-2.5 flex gap-3 items-center">
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
                className="w-7 h-7 rounded-full bg-[var(--body-bg)] flex items-center justify-center text-[var(--body)] hover:bg-[var(--line)] transition-colors"
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
            className={`absolute z-[161] ${placeBelow ? "top-[calc(100%+4px)]" : "bottom-[calc(100%+4px)]"} ${isOwn ? "right-0" : "left-0"}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <LazyEmojiPicker onEmojiSelect={(e: { native: string }) => { onReact(msg.id, e.native); setFullReactionPickerFor(null) }} />
          </div>
        )}

        {/* Context menu */}
        {isContextMenuOpen && (
          <div
            ref={menuRef}
            className={`absolute z-[160] ${placeBelow ? "top-[calc(100%+4px)]" : "bottom-[calc(100%+4px)]"} ${isOwn ? "right-0" : "left-0"}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="bg-[var(--cream-panel)] rounded-2xl shadow-lg border border-[#EFEFEF] overflow-hidden min-w-[160px]">
              {!msg.deleted && (
                <div className="flex gap-3 items-center px-3 py-2.5 border-b border-[#F3EDE6]">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onReact(msg.id, emoji); setContextMenuFor(null) }}
                      className="text-[20px] hover:scale-125 active:scale-95 transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); setContextMenuFor(null); setFullReactionPickerFor(msg.id) }}
                    className="w-7 h-7 rounded-full bg-[var(--body-bg)] flex items-center justify-center text-[var(--body)] hover:bg-[var(--line)] transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setContextMenuFor(null); setReplyingTo(msg) }}
                className="w-full text-left px-4 py-3 text-[14px] text-[var(--ink)] flex items-center gap-2.5 hover:bg-[var(--cream-panel)] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
              >
                <CornerUpLeft className="w-4 h-4 text-[var(--body)]" />
                Reply
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onForward(msg) }}
                className="w-full text-left px-4 py-3 text-[14px] text-[var(--ink)] flex items-center gap-2.5 hover:bg-[var(--cream-panel)] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
              >
                <Forward className="w-4 h-4 text-[var(--body)]" />
                Forward
              </button>
              {!msg.deleted && canPin && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); isPinned ? onUnpin() : onPin(msg.id) }}
                  className="w-full text-left px-4 py-3 text-[14px] text-[var(--ink)] flex items-center gap-2.5 hover:bg-[var(--cream-panel)] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
                >
                  <Pin className="w-4 h-4 text-[var(--body)]" />
                  {isPinned ? "Unpin" : "Pin"}
                </button>
              )}
              {isOwn && !msg.deleted && msg.content && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onStartEdit(msg) }}
                  className="w-full text-left px-4 py-3 text-[14px] text-[var(--ink)] flex items-center gap-2.5 hover:bg-[var(--cream-panel)] active:bg-[#F3EDE6] transition-colors border-b border-[#F3EDE6]"
                >
                  <Pencil className="w-4 h-4 text-[var(--body)]" />
                  Edit
                </button>
              )}
              {isOwn && !msg.deleted && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setContextMenuFor(null); setDeletingId(msg.id) }}
                  className="w-full text-left px-4 py-3 text-[14px] text-red-500 flex items-center gap-2.5 hover:bg-red-50 active:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          </div>
        )}

        {/* Pinned indicator */}
        {isPinned && (
          <div className={`flex items-center gap-1 mb-0.5 ${isOwn ? "justify-end pr-1" : "justify-start ml-9"}`}>
            <Pin className="w-3 h-3 text-[#C9A34B]" />
            <span className="text-[11px] text-[#C9A34B] font-medium">Pinned</span>
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
            <span className="text-[13px] font-semibold text-[var(--ink)]">{msg.sender_name || "Former Member"}</span>
            {senderDeparted && (
              <span className="text-[11px] text-[var(--faint)] italic">· left the ministry</span>
            )}
            <span className="text-[12px] text-[var(--muted-text)]">{formatMessageTime(msg.created_at)}</span>
          </div>
        )}

        {/* Avatar + bubble row */}
        <div className={`flex items-end gap-2 w-full ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
          {/* Avatar — shown for every incoming message */}
          {!isOwn && (
            <MonogramChip
              initials={(msg.sender_name || "?").charAt(0).toUpperCase()}
              avatarUrl={!senderDeparted ? (msg.sender_avatar_url || undefined) : undefined}
              className="w-7 h-7 text-[11px] font-bold"
              style={{ alignSelf: "flex-end", opacity: senderDeparted || !msg.sender_id ? 0.4 : 1 }}
            />
          )}

          <div
            title="Long-press for reply and reactions"
            onPointerDown={() => onPointerDown(msg)}
            onPointerUp={() => onPointerUp(msg)}
            onPointerLeave={onPointerCancel}
            onPointerCancel={onPointerCancel}
            className={`max-w-[75%] text-[14px] leading-[1.4] select-none overflow-hidden ${
              msg.deleted
                ? isOwn
                  ? `bg-[var(--plum-2)]/30 text-white/50 ${outgoingRadius} px-4 py-2`
                  : `bg-[var(--cream-panel)] border border-[var(--line)] text-[var(--muted-text)] ${incomingRadius} px-4 py-2`
                : isOwn
                  ? `bg-[var(--plum-2)] text-[var(--cream-on-dark)] ${outgoingRadius}`
                  : `bg-[var(--cream-panel)] border border-[var(--line)] text-[var(--ink)] ${incomingRadius}`
            } ${!msg.deleted && !msg.reply_to_id && !(msg.attachment_url && msg.attachment_type?.startsWith("image/")) ? "px-4 py-2.5" : ""}`}
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
                          : "bg-[var(--ivory)] border-l-[2px] border-[var(--plum)]"
                      }`}
                    >
                      <span className={`text-[11px] font-semibold flex items-center gap-1 ${isOwn ? "text-white/90" : "text-[var(--plum)]"}`}>
                        <CornerUpLeft className="w-3 h-3" />
                        {msg.reply_to_sender}
                      </span>
                      <span className={`text-[12px] truncate ${isOwn ? "text-white/70" : "text-[var(--muted-text)]"}`}>
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
                      <button onClick={() => setEditingId(null)} className={`text-[12px] transition-opacity ${isOwn ? "text-white/50 hover:text-white/80" : "text-[var(--muted-text)] hover:text-[var(--body)]"}`}>Cancel</button>
                      <button onClick={onSaveEdit} className={`text-[12px] font-semibold px-2.5 py-0.5 rounded-md transition-colors ${isOwn ? "bg-[var(--cream-panel)]/20 hover:bg-[var(--cream-panel)]/30 text-white" : "bg-[var(--plum)]/10 hover:bg-[var(--plum)]/20 text-[var(--plum)]"}`}>Save</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Image attachment */}
                    {msg.attachment_url && msg.attachment_type?.startsWith("image/") && (
                      <div
                        className={msg.reply_to_id ? "mt-2 mb-0.5" : ""}
                      >
                        <img
                          src={msg.attachment_url}
                          alt="Image"
                          className="w-full max-h-[280px] object-cover cursor-pointer"
                        />
                      </div>
                    )}
                    {/* File attachment */}
                    {msg.attachment_url && msg.attachment_type && !msg.attachment_type.startsWith("image/") && (
                      <div
                        className="flex items-center gap-2.5 hover:bg-black/5 transition-colors rounded-xl p-1 cursor-pointer"
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isOwn ? "bg-[var(--cream-panel)]/10" : "bg-[var(--ivory)]"}`}>
                          <FileDown className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate">{msg.attachment_name ?? "File"}</p>
                          {msg.attachment_size != null && (
                            <p className={`text-[11px] ${isOwn ? "text-white/50" : "text-[var(--muted-text)]"}`}>{formatFileSize(msg.attachment_size)}</p>
                          )}
                        </div>
                        <FileDown className={`w-4 h-4 flex-shrink-0 ${isOwn ? "text-white/40" : "text-[var(--faint)]"}`} />
                      </div>
                    )}
                    {/* Text content */}
                    {msg.content && (
                      <>
                        <div
                          className={(msg.reply_to_id || msg.attachment_url) ? "px-4 pt-1.5 pb-2.5" : ""}
                          style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "break-word" }}
                        >
                          {highlightQuery
                            ? highlightText(msg.content, highlightQuery, isActiveSearchMatch)
                            : renderMentions(msg.content, isOwn)}
                        </div>
                        {linkPreview && (
                          <a
                            href={linkPreview.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className={`block mx-3 mb-2 rounded-xl overflow-hidden border text-left transition-opacity hover:opacity-90 ${isOwn ? "border-white/20 bg-[var(--cream-panel)]/10" : "border-[var(--line)] bg-[var(--body-bg)]"}`}
                            style={{ textDecoration: "none" }}
                          >
                            {linkPreview.image && (
                              <img src={linkPreview.image} alt="" className="w-full max-h-[120px] object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none" }} />
                            )}
                            <div className="px-3 py-2">
                              <p className={`text-[10px] font-medium uppercase tracking-wide mb-0.5 ${isOwn ? "text-white/50" : "text-[var(--muted-text)]"}`}>{linkPreview.hostname}</p>
                              {linkPreview.title && <p className={`text-[13px] font-semibold leading-snug ${isOwn ? "text-white" : "text-[var(--ink)]"}`}>{linkPreview.title.slice(0, 80)}</p>}
                              {linkPreview.description && <p className={`text-[11px] mt-0.5 line-clamp-2 ${isOwn ? "text-white/60" : "text-[var(--body)]"}`}>{linkPreview.description.slice(0, 120)}</p>}
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

        {/* Edited label */}
        {msg.is_edited && !msg.deleted && (
          <div className={`mt-0.5 ${isOwn ? "pr-1 text-right" : "pl-9 text-left"}`}>
            <span className="text-[10px]" style={{ color: "var(--muted-text)", fontFamily: "var(--sans)" }}>edited</span>
          </div>
        )}

        {/* Reactions */}
        {!msg.deleted && rxGroups.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "pr-1" : "pl-9"}`}>
            {rxGroups.map(({ emoji, count, userReacted }) => (
              <button
                key={emoji}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onReact(msg.id, emoji)}
                className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[12px] border transition-all active:scale-95 ${
                  userReacted
                    ? "bg-[var(--plum)] border-[var(--plum)]"
                    : "bg-[var(--cream-panel)] border-[var(--line)]"
                }`}
              >
                <span>{emoji}</span>
                <span className={`text-[11px] font-medium ${userReacted ? "text-[var(--cream-on-dark)]" : "text-[var(--muted-text)]"}`}>{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Delete confirmation */}
        {isDeleting && (
          <div
            className={`flex items-center gap-2 mt-1 px-1 ${isOwn ? "justify-end" : "justify-start"}`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="text-[12px] text-[var(--body)]">Delete this message?</span>
            <button onClick={() => onDeleteMessage(msg.id)} className="text-[12px] font-semibold text-red-500 hover:text-red-600 transition-colors">Delete</button>
            <button onClick={() => setDeletingId(null)} className="text-[12px] text-[var(--muted-text)] hover:text-[var(--body)] transition-colors">Cancel</button>
          </div>
        )}

        {/* Timestamp + read receipts (own messages: every message; incoming: skip since time is in header) */}
        {isOwn && (
          <div className="flex items-center gap-1.5 mt-1 pr-1">
            {(readReceipts?.length ?? 0) > 0 && (
              <div className="flex items-center">
                {readReceipts!.map(({ name, avatarUrl }, idx) => (
                  <MonogramChip
                    key={`${name}-${idx}`}
                    initials={name.charAt(0).toUpperCase()}
                    avatarUrl={avatarUrl || undefined}
                    title={`Read by ${name}`}
                    className={`w-4 h-4 border border-[#F1EDE6] text-[6px] font-bold${idx > 0 ? " -ml-1" : ""}`}
                  />
                ))}
              </div>
            )}
            <span className="text-[11px] text-[#B0A9A0]">{formatMessageTime(msg.created_at)}</span>
          </div>
        )}

        {/* Large-room aggregated read receipt — on-demand "Seen by N",
            rendered only under the user's own most-recent message. */}
        {isLargeRoom && isOwn && isLatestOwn && seenByCount !== null && seenByCount > 0 && (
          <div className="flex flex-col items-end gap-1 mt-1 pr-1" onPointerDown={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSeenBy?.() }}
              className="text-[11px] text-[var(--muted-text)] hover:text-[var(--body)] transition-colors"
              style={{ padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 999, background: "var(--cream-panel)" }}
            >
              Seen by {seenByCount}
            </button>
            {seenByOpen && seenByList && (
              <div
                className="flex flex-col gap-1.5 items-end"
                style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--cream-panel)", maxWidth: 220 }}
              >
                {seenByList.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--body)] truncate">{r.name}</span>
                    <MonogramChip
                      initials={r.name.charAt(0).toUpperCase()}
                      avatarUrl={r.avatarUrl || undefined}
                      className="w-5 h-5 text-[8px] font-bold"
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
