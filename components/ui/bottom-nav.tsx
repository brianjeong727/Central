"use client"

import { Home, MessageCircle, User, ClipboardList, BookOpen } from "lucide-react"

type Tab = "home" | "announcements" | "chats" | "plan" | "directory" | "giving" | "give" | "profile" | "settings" | "forms" | "congregation"

interface BottomNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  chatsUnread?: number
  showPlan?: boolean
}

const TABS_BASE = [
  { id: "home" as Tab,      label: "Home",      icon: Home },
  { id: "chats" as Tab,     label: "Chats",     icon: MessageCircle },
  { id: "directory" as Tab, label: "Directory", icon: BookOpen },
  { id: "profile" as Tab,   label: "You",       icon: User },
]

const PLAN_TAB = { id: "plan" as Tab, label: "Plan", icon: ClipboardList }

export function BottomNav({ activeTab, onTabChange, chatsUnread = 0, showPlan = false }: BottomNavProps) {
  const base = TABS_BASE.filter(t => t.id !== "profile")
  const profile = TABS_BASE.find(t => t.id === "profile")!
  const tabs = showPlan
    ? [...base, PLAN_TAB, profile]
    : [...base, profile]
  const compact = tabs.length > 5

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white border-t border-[#F0EEF8] h-16 z-50 md:hidden">
      <div className="flex items-center justify-around h-full">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab || (tab.id === "giving" && activeTab === "give") || (tab.id === "profile" && activeTab === "congregation")
          const Icon = tab.icon
          const showBadge = tab.id === "chats" && chatsUnread > 0

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 transition-[color,transform] duration-150 active:scale-[0.92] ${compact ? "px-1 py-1" : "px-2 py-1"} ${
                isActive ? "text-[#3E1540]" : "text-[#C4C4C4] hover:text-[#9CA3AF]"
              }`}
            >
              {isActive && (
                <span className="w-4 h-0.5 bg-[#3E1540] rounded-full mb-0.5" />
              )}
              <div className="relative">
                <Icon
                  className={`transition-all ${compact ? "w-[18px] h-[18px]" : "w-5 h-5"} ${
                    isActive ? "stroke-[2px]" : "stroke-[1.5px]"
                  }`}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[#3E1540] rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1">
                    {chatsUnread > 99 ? "99+" : chatsUnread}
                  </span>
                )}
              </div>
              <span className={`font-semibold tracking-wide ${compact ? "text-[9px]" : "text-[10px]"}`}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
