"use client"

import { Home, MessageCircle, ClipboardList, Bell } from "lucide-react"
import { sectionForTab } from "@/components/central/nav-sections"

// "network" is included so activeTab can carry it (admin-only, desktop-nav-only);
// it is intentionally NOT added to TABS_BASE so it never renders in the mobile nav.
type Tab = "home" | "announcements" | "chats" | "plan" | "directory" | "give" | "profile" | "settings" | "forms" | "congregation" | "network"

interface BottomNavProps {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  chatsUnread?: number
  showPlan?: boolean
  // Suppresses the pill entirely — set while a full-screen mobile surface is up
  // (open chat overlay, CreateChatScreen, announcement compose). Spec: mobile
  // design system §2.2 "Hidden on full-screen composers".
  hidden?: boolean
}

// Floating "Pocket" pill nav (ratified B3 mobile). Home / Announcements / Chats /
// Workspace only — Profile ("You") is NOT here; it's the chrome avatar (top-right of
// each Pocket screen). Workspace stays role-gated via showPlan (→ 3-icon pill for
// non-team members). Active item = cream circle + plum-2 icon.
const TABS_BASE = [
  { id: "home" as Tab,          label: "Home",          icon: Home },
  { id: "chats" as Tab,         label: "Chats",         icon: MessageCircle },
  { id: "announcements" as Tab, label: "Announcements", icon: Bell },
]

const PLAN_TAB = { id: "plan" as Tab, label: "Workspace", icon: ClipboardList }

export function BottomNav({ activeTab, onTabChange, chatsUnread = 0, showPlan = false, hidden = false }: BottomNavProps) {
  // Plain member: Home/Chats/Announcements (3). Team member/leader/gov admin: +Workspace (4).
  const tabs = showPlan ? [...TABS_BASE, PLAN_TAB] : TABS_BASE
  if (hidden) return null
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 md:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 14px)" }}
    >
      <nav
        className="flex items-center"
        style={{
          gap: 4,
          padding: 6,
          borderRadius: 999,
          background: "var(--plum-2)",
          boxShadow: "var(--shadow-nav)",
        }}
      >
        {tabs.map((tab) => {
          // Highlight derives from the single nav-section config (R7). Mobile-only
          // exception: Announcements is a first-class item here even though nav-sections
          // folds it under Home — so on the announcements tab light ONLY that item;
          // otherwise resolve normally (Home wins for give/forms/settings/etc.). On the
          // profile tab nothing lights (Profile isn't in the pill — it's the avatar).
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
              aria-current={isActive ? "page" : undefined}
              className="relative flex items-center justify-center transition-transform duration-150 active:scale-[0.92]"
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                background: isActive ? "var(--cream)" : "transparent",
              }}
            >
              <Icon
                style={{ width: 22, height: 22 }}
                strokeWidth={isActive ? 2 : 1.75}
                color={isActive ? "var(--plum-2)" : "var(--cream-on-dark)"}
              />
              {showBadge && (
                <span
                  className="absolute flex items-center justify-center"
                  style={{
                    top: 4,
                    right: 4,
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: 999,
                    background: "var(--cream)",
                    border: "1.5px solid var(--plum-2)",
                    color: "var(--plum-2)",
                    fontSize: 9,
                    fontWeight: 600,
                    fontFamily: "var(--sans)",
                  }}
                >
                  {chatsUnread > 99 ? "99+" : chatsUnread}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
