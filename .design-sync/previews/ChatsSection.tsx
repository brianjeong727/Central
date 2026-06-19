import { ChatsSection } from "central"

const sampleChats = [
  {
    id: "1",
    groupName: "Praise Team",
    lastMessage: "Sound check at 5:30 — can everyone be there by 5?",
    lastMessageSender: "David",
    unreadCount: 3,
    avatarColor: "#3E1540",
    initials: "PT",
    time: "2m ago",
  },
  {
    id: "2",
    groupName: "Small Group Leaders",
    lastMessage: "Great discussion tonight, everyone! See you next week.",
    lastMessageSender: "Pastor Tim",
    unreadCount: 0,
    avatarColor: "#13101A",
    initials: "SG",
    time: "1h ago",
  },
  {
    id: "3",
    groupName: "General Announcements",
    lastMessage: "Don't forget — retreat registration closes Friday!",
    lastMessageSender: "",
    unreadCount: 1,
    avatarColor: "#3E1540",
    initials: "GA",
    time: "3h ago",
  },
]

export function WithChats() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 390 }}>
      <ChatsSection
        chats={sampleChats}
        totalUnread={4}
        onSeeAll={() => {}}
        onOpenChat={() => {}}
      />
    </div>
  )
}

export function EmptyChats() {
  return (
    <div style={{ padding: 24, background: "#FBF8F2", maxWidth: 390 }}>
      <ChatsSection
        chats={[]}
        totalUnread={0}
        onSeeAll={() => {}}
      />
    </div>
  )
}
