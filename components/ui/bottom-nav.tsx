"use client"

import { Home, Megaphone, MessageCircle, Users, User } from "lucide-react"

type Tab = "home" | "announcements" | "chats" | "directory" | "profile"

interface BottomNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  chatsUnread?: number
}

const tabs = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "announcements" as const, label: "Announce", icon: Megaphone },
  { id: "chats" as const, label: "Chats", icon: MessageCircle },
  { id: "directory" as const, label: "Directory", icon: Users },
  { id: "profile" as const, label: "Profile", icon: User },
]

export function BottomNav({ activeTab, onTabChange, chatsUnread = 0 }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#F0EEF8] h-16 z-50 px-2">
      <div className="flex items-center justify-around h-full">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          const Icon = tab.icon
          const showBadge = tab.id === "chats" && chatsUnread > 0

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 py-1 px-3 transition-all ${
                isActive ? "text-[#6D28D9]" : "text-[#C4C4C4] hover:text-[#9CA3AF]"
              }`}
            >
              {isActive && (
                <span className="w-5 h-0.5 bg-[#6D28D9] rounded-full mb-0.5" />
              )}
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-all ${
                    isActive ? "stroke-[2px]" : "stroke-[1.5px]"
                  }`}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#6D28D9] rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1">
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
