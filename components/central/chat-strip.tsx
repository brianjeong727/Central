"use client"

import { CSSProperties } from "react"
import { EYEBROW_STYLE } from "./typography"
import { MonogramChip } from "./MonogramChip"

// Lives here rather than in app/home/types.ts: components/central is a LEAF and
// must not import from app/. ChatStrip is this type's live consumer — it moved
// here when the retired ChatsSection (its original home) was deleted.
export interface ChatPreview {
  id: string
  groupName: string
  lastMessage: string
  lastMessageSender: string
  unreadCount: number
  initials: string
  time: string
  // Group category — drives the Messages church/my subtab when opening from here.
  type?: string
  // Per-user chat prefs. `muted` suppresses the unread badge (same rule as the
  // chat list). `pinned` is carried for symmetry but unused here — the Home strip
  // is a recency feed and never reorders by pinned.
  muted?: boolean
  pinned?: boolean
  /** Raw last-message instant. `time` above is a RELATIVE label derived from it,
   *  so it goes stale as time passes and not only as data changes — the app layer
   *  re-derives the label from this on a timer (home-app.tsx). Kept on the type
   *  rather than local to the mapper because that re-derivation needs it. */
  _ts?: string
}

interface ChatStripProps {
  chats: ChatPreview[]
  totalUnread: number
  onOpenChat: (id: string, name: string, type?: string) => void
  onSeeAll: () => void
  style?: CSSProperties
}

export function ChatStrip({ chats, totalUnread, onOpenChat, onSeeAll, style }: ChatStripProps) {
  return (
    <div style={style}>
      {/* Strip header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
        <div style={EYEBROW_STYLE}>
          Your chats{totalUnread > 0 ? ` · ${totalUnread} unread` : ""}
        </div>
        <button
          onClick={onSeeAll}
          style={{
            fontSize: 12,
            color: "var(--muted-text)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--sans)",
            padding: 0,
            transition: "color 120ms ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--ink)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-text)")}
        >
          See all chats →
        </button>
      </div>

      {/* Horizontal card row */}
      {chats.length === 0 ? (
        <div style={{
          border: "1px solid var(--line)",
          borderRadius: "var(--r-callout)",
          padding: "18px 22px",
          color: "var(--muted-text)",
          fontSize: 13,
          fontFamily: "var(--sans)",
          textAlign: "center",
        }}>
          No recent chats
        </div>
      ) : (
        <div style={{ display: "flex", gap: "var(--space-6)", alignItems: "stretch" }}>
          {chats.map((chat, i) => (
            <StripCard key={chat.id} chat={chat} index={i} onOpen={onOpenChat} />
          ))}
        </div>
      )}
    </div>
  )
}

function StripCard({ chat, index, onOpen }: {
  chat: ChatPreview
  index: number
  onOpen: (id: string, name: string) => void
}) {
  return (
    <button
      onClick={() => onOpen(chat.id, chat.groupName)}
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        background: "var(--cream-3)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-callout)",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 100ms ease",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--ivory)")}
      onMouseLeave={e => (e.currentTarget.style.background = "var(--cream-3)")}
    >
      {/* Serif monogram */}
      <MonogramChip
        initials={chat.groupName.charAt(0)}
        style={{ width: 36, height: 36, fontSize: 16, fontWeight: 400, fontFamily: "var(--serif)" }}
      />

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{
            fontSize: 13,
            fontWeight: chat.unreadCount ? 600 : 500,
            color: "var(--ink)",
            fontFamily: "var(--sans)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {chat.groupName}
          </span>
          {chat.time && (
            <span style={{ fontSize: 10, color: "var(--muted-text)", flexShrink: 0, fontFamily: "var(--sans)" }}>
              {chat.time}
            </span>
          )}
        </div>
        <p style={{
          fontSize: 12,
          color: "var(--body)",
          marginTop: 2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontFamily: "var(--sans)",
        }}>
          {chat.lastMessageSender
            ? <><span style={{ fontWeight: 500 }}>{chat.lastMessageSender}:</span> {chat.lastMessage}</>
            : chat.lastMessage || <span style={{ color: "var(--muted-text)", fontStyle: "italic" }}>No messages yet</span>
          }
        </p>
      </div>

      {/* Unread badge */}
      {chat.unreadCount > 0 && (
        <span style={{
          background: "var(--plum)",
          color: "var(--cream)",
          fontSize: 10,
          fontWeight: 600,
          padding: "2px 7px",
          borderRadius: 999,
          fontFamily: "var(--sans)",
          flexShrink: 0,
        }}>
          {chat.unreadCount}
        </span>
      )}
    </button>
  )
}
