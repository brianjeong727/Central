import { ChatStrip } from "central"

const sampleChats = [
  {
    id: "1",
    groupName: "Praise Team",
    lastMessage: "Sound check at 5:30 — can everyone make it?",
    lastMessageSender: "David",
    unreadCount: 3,
    avatarColor: "#3E1540",
    initials: "PT",
    time: "2m ago",
  },
  {
    id: "2",
    groupName: "Small Groups",
    lastMessage: "Great discussion tonight, everyone!",
    lastMessageSender: "Pastor Tim",
    unreadCount: 0,
    avatarColor: "#13101A",
    initials: "SG",
    time: "1h ago",
  },
]

export function WithChats() {
  return (
    <div style={{ padding: 24, background: "#FDFCF8", maxWidth: 420 }}>
      <ChatStrip
        chats={sampleChats}
        totalUnread={3}
        onOpenChat={() => {}}
        onSeeAll={() => {}}
      />
    </div>
  )
}

export function EmptyStrip() {
  return (
    <div style={{ padding: 24, background: "#FDFCF8", maxWidth: 420 }}>
      <ChatStrip
        chats={[]}
        totalUnread={0}
        onOpenChat={() => {}}
        onSeeAll={() => {}}
      />
    </div>
  )
}
