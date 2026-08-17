"use client"

import { Home, MessageCircle, ClipboardList, Bell, User } from "lucide-react"
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
  // An announcement DETAIL overlay is open. It mounts over whatever tab you were
  // on (Home, usually) without changing activeTab, so the pill would otherwise
  // keep Home lit while the user is plainly reading an announcement. The pill
  // reflects what is on screen, not which tab state happens to hold.
  announcementOpen?: boolean
}

// Floating "Pocket" pill nav (ratified B3 mobile; Profile added 2026-08-16).
// Home / Chats / Announcements / Workspace / Profile. Workspace stays role-gated
// via showPlan (→ 4-icon pill for non-team members). Active = cream circle + plum-2 icon.
//
// Profile is a pill DESTINATION, not a chrome avatar. The avatar that used to sit
// top-right of every tab root (and every workspace hub) was a second door to the
// place this item already reaches from everywhere — the same redundancy that retired
// the Workspace quick-tile. One door, and it's here. The icon is the generic User
// glyph rather than the user's photo: the pill is a monochrome cream-on-plum icon
// set, and a full-colour avatar in it breaks that rhythm and has no coherent active
// state (a cream circle behind a photo). See mobile_design_system.md §3.
const TABS_BASE = [
  { id: "home" as Tab,          label: "Home",          icon: Home },
  { id: "chats" as Tab,         label: "Chats",         icon: MessageCircle },
  { id: "announcements" as Tab, label: "Announcements", icon: Bell },
]

const PLAN_TAB = { id: "plan" as Tab, label: "Workspace", icon: ClipboardList }
// Always last — Workspace slots in ahead of it when the user has one.
const PROFILE_TAB = { id: "profile" as Tab, label: "Profile", icon: User }

export function BottomNav({ activeTab, onTabChange, chatsUnread = 0, showPlan = false, hidden = false, announcementOpen = false }: BottomNavProps) {
  // Plain member: Home/Chats/Announcements/Profile (4).
  // Team member/leader/gov admin: +Workspace before Profile (5).
  const tabs = showPlan ? [...TABS_BASE, PLAN_TAB, PROFILE_TAB] : [...TABS_BASE, PROFILE_TAB]
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
          // otherwise resolve normally (Home wins for give/forms/settings/etc.; the
          // "profile" section lights Profile, including on its pushed Journal screen).
          const isActive =
            activeTab === "announcements" || announcementOpen
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
