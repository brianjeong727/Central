"use client"

import { Home, MessageCircle, User, ClipboardList } from "lucide-react"

type Tab = "home" | "announcements" | "chats" | "plan" | "directory" | "profile"

interface BottomNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  chatsUnread?: number
  showPlan?: boolean
}

const BASE_TABS = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "chats" as const, label: "Chats", icon: MessageCircle },
  { id: "profile" as const, label: "You", icon: User },
]

const PLAN_TAB = { id: "plan" as const, label: "Plan", icon: ClipboardList }

export function BottomNav({ activeTab, onTabChange, chatsUnread = 0, showPlan = false }: BottomNavProps) {
  const tabs = showPlan
    ? [BASE_TABS[0], BASE_TABS[1], PLAN_TAB, BASE_TABS[2]]
    : BASE_TABS

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#F0EEF8] h-16 z-50 px-1 md:hidden">
      <div className="flex items-center justify-around h-full">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          const Icon = tab.icon
          const showBadge = tab.id === "chats" && chatsUnread > 0

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 py-1 px-2 transition-all ${
                isActive ? "text-[#3E1540]" : "text-[#C4C4C4] hover:text-[#9CA3AF]"
              }`}
            >
              {isActive && (
                <span className="w-5 h-0.5 bg-[#3E1540] rounded-full mb-0.5" />
              )}
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-all ${
                    isActive ? "stroke-[2px]" : "stroke-[1.5px]"
                  }`}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#3E1540] rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1">
                    {chatsUnread > 99 ? "99+" : chatsUnread}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold tracking-wide">
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
