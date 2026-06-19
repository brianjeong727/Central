import { BottomNav } from "central"

export function HomeActive() {
  return (
    <div style={{ minHeight: "100vh", background: "#FBF8F2" }}>
      <BottomNav activeTab="home" onTabChange={() => {}} chatsUnread={0} showPlan={false} />
    </div>
  )
}

export function ChatsActiveWithBadge() {
  return (
    <div style={{ minHeight: "100vh", background: "#FBF8F2" }}>
      <BottomNav activeTab="chats" onTabChange={() => {}} chatsUnread={5} showPlan={false} />
    </div>
  )
}

export function WithPlanTab() {
  return (
    <div style={{ minHeight: "100vh", background: "#FBF8F2" }}>
      <BottomNav activeTab="plan" onTabChange={() => {}} chatsUnread={2} showPlan={true} />
    </div>
  )
}
