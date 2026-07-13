"use client"

import { Home, MessageCircle, User, ClipboardList, Bell } from "lucide-react"
import { sectionForTab } from "@/components/central/nav-sections"

// "network" is included so activeTab can carry it (admin-only, desktop-nav-only);
// it is intentionally NOT added to TABS_BASE so it never renders in the mobile nav.
type Tab = "home" | "announcements" | "chats" | "plan" | "directory" | "give" | "profile" | "settings" | "forms" | "congregation" | "network"

interface BottomNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  chatsUnread?: number
  showPlan?: boolean
}

// Announcements is a CORE mobile tab for everyone (core church comms), unlike the
// desktop rail where it folds under Home. Workspace stays role-gated (showPlan).
const TABS_BASE = [
  { id: "home" as Tab,          label: "Home",          icon: Home },
  { id: "chats" as Tab,         label: "Chats",         icon: MessageCircle },
  { id: "announcements" as Tab, label: "Announcements", icon: Bell },
  { id: "profile" as Tab,       label: "You",           icon: User },
]

const PLAN_TAB = { id: "plan" as Tab, label: "Workspace", icon: ClipboardList }

export function BottomNav({ activeTab, onTabChange, chatsUnread = 0, showPlan = false }: BottomNavProps) {
  const base = TABS_BASE.filter(t => t.id !== "profile")
  const profile = TABS_BASE.find(t => t.id === "profile")!
  // Plain member: Home/Chats/Announcements/You (4). Team member/leader/gov admin: +Workspace (5).
  const tabs = showPlan
    ? [...base, PLAN_TAB, profile]
    : [...base, profile]
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-[var(--cream-panel)] border-t border-[#F0EEF8] z-50 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Fixed 64px tab row sits ABOVE the home-indicator inset (the nav's total
          height grows by env(safe-area-inset-bottom)). Horizontal inset + a
          centered max width keep the 3–4 tabs from gluing to the screen edges. */}
      <div className="flex items-center justify-around h-16 px-4 max-w-[360px] mx-auto">
        {tabs.map((tab) => {
          // Highlight derives from the single nav-section config (R7). Mobile-only
          // exception: Announcements is a first-class bottom-nav item here even though
          // nav-sections folds it under Home (for the desktop rail, which has no
          // Announcements item). So when on the announcements tab, light ONLY that
          // item; otherwise resolve normally (Home wins for give/forms/settings/etc.).
          const isActive =
            activeTab === "announcements"
              ? tab.id === "announcements"
              : sectionForTab(activeTab)?.id === tab.id
          const Icon = tab.icon
          const showBadge = tab.id === "chats" && chatsUnread > 0

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              aria-label={tab.label}
              className={`flex flex-col items-center justify-center gap-1.5 px-3 py-1 transition-[color,transform] duration-150 active:scale-[0.92] ${
                isActive ? "text-[var(--plum)]" : "text-[var(--faint)] hover:text-[#9CA3AF]"
              }`}
            >
              {/* Labels removed — icons are self-explanatory; sized up to compensate.
                  Active state = plum color + a small underline dot, no text. */}
              {isActive && (
                <span className="w-5 h-0.5 bg-[var(--plum)] rounded-full" />
              )}
              <div className="relative">
                <Icon
                  className={`transition-all w-[27px] h-[27px] ${
                    isActive ? "stroke-[2px]" : "stroke-[1.5px]"
                  }`}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-[var(--plum)] rounded-full text-[9px] font-semibold text-[var(--cream)] flex items-center justify-center px-1">
                    {chatsUnread > 99 ? "99+" : chatsUnread}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
