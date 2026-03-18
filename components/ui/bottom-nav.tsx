"use client"

import { Home, Megaphone, MessageCircle, Users, User } from "lucide-react"

type Tab = "home" | "announcements" | "chats" | "directory" | "profile"

interface BottomNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
}

const tabs = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "announcements" as const, label: "Announce", icon: Megaphone },
  { id: "chats" as const, label: "Chats", icon: MessageCircle },
  { id: "directory" as const, label: "Directory", icon: Users },
  { id: "profile" as const, label: "Profile", icon: User },
]

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-white/95 backdrop-blur-xl border-t border-[#6D28D9]/8 px-2 pt-3 pb-7 z-50 shadow-[0_-4px_20px_rgba(109,40,217,0.06)]">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center gap-1.5 py-2 px-2 rounded-xl transition-all ${
                isActive
                  ? "text-[#F59E0B]"
                  : "text-muted-foreground/60 hover:text-[#F59E0B]/70"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-all ${
                    isActive ? "stroke-[2.5px]" : "stroke-[1.5px]"
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#F59E0B] rounded-full" />
                )}
              </div>
              <span
                className={`text-[9px] font-semibold tracking-wide ${
                  isActive ? "text-[#F59E0B]" : "text-muted-foreground/60"
                }`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
