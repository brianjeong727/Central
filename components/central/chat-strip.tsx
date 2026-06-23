"use client"

import { CSSProperties } from "react"
import type { ChatPreview } from "@/components/ui/chats-section"

const EYEBROW: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: "1.4px",
  color: "var(--muted-text)",
  textTransform: "uppercase",
}

interface ChatStripProps {
  chats: ChatPreview[]
  totalUnread: number
  onOpenChat: (id: string, name: string) => void
  onSeeAll: () => void
  style?: CSSProperties
}

export function ChatStrip({ chats, totalUnread, onOpenChat, onSeeAll, style }: ChatStripProps) {
  return (
    <div style={style}>
      {/* Strip header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
        <div style={EYEBROW}>
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
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        flexShrink: 0,
        background: "var(--plum)",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        fontSize: 16,
        fontWeight: 400,
        fontFamily: "var(--serif)",
        color: "var(--cream)",
      }}>
        {chat.groupName.charAt(0)}
      </div>

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
            <span style={{ fontSize: 10, color: "var(--faint)", flexShrink: 0, fontFamily: "var(--sans)" }}>
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
            : chat.lastMessage || <span style={{ color: "var(--faint)", fontStyle: "italic" }}>No messages yet</span>
          }
        </p>
      </div>

      {/* Unread badge */}
      {chat.unreadCount > 0 && (
        <span style={{
          background: "var(--plum)",
          color: "var(--cream)",
          fontSize: 10,
          fontWeight: 700,
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
