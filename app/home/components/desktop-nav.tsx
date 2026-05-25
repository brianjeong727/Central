"use client"

import { Home, MessageCircle, BookOpen, ClipboardList, User, LogOut, Plus, ChevronRight, Wallet } from "lucide-react"
import { Search } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ChatsSection } from "@/components/ui/chats-section"
import { PlanLineIcon } from "./shared"
import { getInitials } from "../utils"
import type { DesktopTopbarProps, DesktopSidebarProps, UserTeam, Tab } from "../types"

export function DesktopTopbar({ crumbs, right }: DesktopTopbarProps) {
  return (
    <div className="hidden md:flex h-14 px-7 items-center gap-4 border-b border-[#E5E0D2] bg-[#FBF8F2] flex-shrink-0">
      <div className="flex items-center gap-1.5 text-[12px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className={i === crumbs.length - 1 ? "text-[#13101A] font-medium" : "text-[#8A8497]"}>{c}</span>
            {i < crumbs.length - 1 && <span className="text-[#C4C4C4] select-none">/</span>}
          </span>
        ))}
      </div>
      <div className="flex-1" />
      <div
        onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
        className="flex items-center gap-2 px-3 py-1.5 border border-[#E5E0D2] rounded-lg bg-[#F4F1E8] text-[#8A8497] w-[240px] cursor-pointer hover:bg-[#ECE8DE] transition-colors select-none"
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-[12px] flex-1">Jump to anything</span>
        <span className="text-[10px] px-1.5 py-0.5 border border-[#E5E0D2] rounded bg-[#FBF8F2] leading-none">⌘K</span>
      </div>
      {right}
    </div>
  )
}

export function DesktopSidebar({ activeTab, onTabChange, ministryName, chatsUnread, showPlan, userInitials, userAvatarUrl, recentChats, userTeams, onOpenChat, activeGroupId, onLogout, isAdmin, onCreateTeam, activeTeamId, onActiveTeamChange, profileSection, onProfileSectionChange, financeSection, onFinanceSectionChange, isTreasurer, isDGL }: DesktopSidebarProps) {

  const navItems: { id: Tab; icon: React.FC<{ className?: string }> }[] = [
    { id: "home", icon: Home },
    { id: "chats", icon: MessageCircle },
    { id: "directory", icon: BookOpen },
    { id: "profile", icon: User },
    { id: "giving", icon: Wallet },
    ...(showPlan ? [{ id: "plan" as Tab, icon: ClipboardList }] : []),
  ]

  const monoStyle: React.CSSProperties = {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
    fontSize: "10px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#8A8497",
  }

  const subItemStyle = (active?: boolean, danger?: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: "8px",
    cursor: "pointer",
    background: active ? "#EFEAE0" : "transparent",
    color: danger ? "#9D2D2D" : "#13101A",
    fontSize: "13px",
    fontWeight: active ? 500 : 400,
    border: "none",
    width: "100%",
    textAlign: "left",
  })

  function renderPanelBody() {
    if (activeTab === "chats") {
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...monoStyle, padding: "8px 8px 6px" }}>Recent</p>
          {recentChats.length === 0 ? (
            <p className="text-[12px] text-[#8A8497] px-2 py-2">No chats yet</p>
          ) : (
            recentChats.slice(0, 6).map((c, i) => {
              const isActive = activeGroupId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenChat(c.id, c.groupName)}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 8px", borderRadius: "8px", cursor: "pointer",
                    background: isActive ? "#EFEAE0" : "transparent",
                    borderTop: "none", borderRight: "none", borderBottom: "none",
                    borderLeft: isActive ? "2px solid #3E1540" : "2px solid transparent",
                    width: "100%", textAlign: "left",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: i % 2 === 0 ? "#3E1540" : "#13101A",
                    color: "#F6F4EF", display: "grid", placeItems: "center",
                    fontSize: "10px", fontWeight: 600,
                  }}>
                    {c.initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: c.unreadCount ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.groupName}</div>
                    {c.lastMessage && (
                      <div style={{ fontSize: "11px", color: "#8A8497", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.lastMessage}</div>
                    )}
                  </div>
                  {c.unreadCount > 0 && (
                    <span style={{ fontSize: "10px", fontWeight: 700, color: "#13101A", background: "#C9A34B", padding: "1px 6px", borderRadius: 999 }}>{c.unreadCount}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )
    }

    if (activeTab === "plan") {
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 6px" }}>
            <p style={monoStyle}>Your teams · {userTeams.length}</p>
            {isAdmin && onCreateTeam && (
              <button
                onClick={onCreateTeam}
                style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "#8A8497", borderRadius: 4, padding: 0 }}
                title="New team"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {userTeams.length === 0 ? (
            <p className="text-[12px] text-[#8A8497] px-2 py-2">No teams yet</p>
          ) : (
            userTeams.map((t) => {
              const isActive = t.teamId === activeTeamId
              return (
                <button key={t.teamId} onClick={() => onActiveTeamChange(t.teamId)} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 8px", borderRadius: "8px", cursor: "pointer",
                  background: isActive ? "#EFEAE0" : "transparent",
                  borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0,
                  borderLeftWidth: 2, borderLeftStyle: "solid",
                  borderLeftColor: isActive ? "#3E1540" : "transparent",
                  width: "100%", textAlign: "left",
                }}>
                  <PlanLineIcon
                    iconKey={t.teamIcon ?? "users"}
                    bg={isActive ? "#3E1540" : "#F4F1E8"}
                    fg={isActive ? "#F6F4EF" : "#13101A"}
                    size={30}
                    radius={8}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.teamName}</div>
                    <div style={{ fontSize: "10px", color: "#8A8497", letterSpacing: "0.4px" }}>{t.roleName}</div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )
    }

    if (activeTab === "directory") {
      return <div className="flex-1 overflow-y-auto px-2 pb-3" />
    }

    if (activeTab === "giving") {
      const financeSections: { label: string; section: "give" | "reimbursements" | "budget" | "allocation"; show: boolean }[] = [
        { label: "Reimbursements", section: "reimbursements", show: !!(isDGL || isTreasurer || isAdmin) },
        { label: "Budget", section: "budget", show: !!(isTreasurer || isAdmin) },
        { label: "Allocation", section: "allocation", show: !!(isTreasurer || isAdmin) },
      ]
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...monoStyle, padding: "8px 8px 6px" }}>Giving</p>
          {financeSections.filter(s => s.show).map(s => (
            <button key={s.section} style={subItemStyle(financeSection === s.section)} onClick={() => onFinanceSectionChange(s.section)}>
              <span style={{ flex: 1 }}>{s.label}</span>
            </button>
          ))}
        </div>
      )
    }

    if (activeTab === "profile") {
      const items: { label: string; section?: "spiritual-profile" | "journal"; danger?: boolean; onClick?: () => void }[] = [
        { label: "Profile", section: "spiritual-profile" },
        { label: "Journal", section: "journal" },
        { label: "Sign out", danger: true, onClick: onLogout },
      ]
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...monoStyle, padding: "8px 8px 6px" }}>You</p>
          {items.map((s, i) => (
            <button
              key={i}
              style={subItemStyle(s.section ? profileSection === s.section : undefined, s.danger)}
              onClick={s.section ? () => onProfileSectionChange(s.section!) : s.onClick}
            >
              <span style={{ flex: 1 }}>{s.label}</span>
            </button>
          ))}
        </div>
      )
    }

    // Home panel — Home, Announcements, Give, Forms, and Settings (admin-only)
    const homeItems: { label: string; tab: "home" | "announcements" | "give" | "forms" | "settings" }[] = [
      { label: "Home", tab: "home" },
      { label: "Announcements", tab: "announcements" },
      { label: "Give", tab: "give" },
      { label: "Forms", tab: "forms" },
      ...(isAdmin ? [{ label: "Church Settings", tab: "settings" as const }] : []),
    ]
    const generalTabs = ["home", "announcements", "give"] as const
    const restrictedTabs = ["forms", "settings"] as const
    const generalItems = homeItems.filter(i => (generalTabs as readonly string[]).includes(i.tab))
    const restrictedItems = homeItems.filter(i => (restrictedTabs as readonly string[]).includes(i.tab))

    return (
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <p style={{ ...monoStyle, padding: "8px 8px 6px" }}>Home</p>
        {generalItems.map((item) => (
          <button
            key={item.tab}
            style={subItemStyle(activeTab === item.tab)}
            onClick={() => onTabChange(item.tab)}
          >
            <span style={{ flex: 1 }}>{item.label}</span>
          </button>
        ))}
        {restrictedItems.length > 0 && (
          <>
            <div style={{ height: 1, background: "#E5E0D2", margin: "4px 8px" }} />
            {restrictedItems.map((item) => (
              <button
                key={item.tab}
                style={subItemStyle(activeTab === item.tab)}
                onClick={() => onTabChange(item.tab)}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
              </button>
            ))}
          </>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Icon Rail */}
      <div className="hidden md:flex flex-col w-16 flex-shrink-0 h-screen bg-[#13101A] items-center py-4 gap-1">
        {/* Logo — links back to landing */}
        <a href="/landing" className="w-9 h-9 rounded-[10px] bg-[#3E1540] flex items-center justify-center mb-3.5 flex-shrink-0 hover:bg-[#2D0F2E] transition-colors" style={{ textDecoration: "none" }}>
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#F6F4EF" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#F6F4EF" />
            <rect x="22" y="47" width="56" height="6" fill="#F6F4EF" />
          </svg>
        </a>

        {navItems.map(({ id, icon: Icon }) => {
          const isActive = activeTab === id || (id === "home" && (activeTab === "settings" || activeTab === "announcements" || activeTab === "forms" || activeTab === "give"))
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors"
              style={{
                background: isActive ? "rgba(255,255,255,0.10)" : "transparent",
                color: isActive ? "#F6F4EF" : "rgba(246,244,239,0.45)",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Icon className="w-[18px] h-[18px]" />
              {isActive && (
                <span className="absolute left-[-9px] top-2 bottom-2 w-0.5 bg-[#F6F4EF] rounded-full" />
              )}
              {id === "chats" && chatsUnread > 0 && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#C9A34B] rounded-full" />
              )}
            </button>
          )
        })}

        <div className="flex-1" />

        {/* User avatar */}
        <div className="w-8 h-8 rounded-full bg-[#3E1540] flex items-center justify-center overflow-hidden flex-shrink-0">
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[11px] font-semibold text-[#F6F4EF]">{userInitials}</span>
          )}
        </div>
      </div>

      {/* Context Panel — hidden for chats/directory (those tabs have their own left panel) */}
      <div className={`hidden flex-col w-[232px] flex-shrink-0 h-screen bg-[#FBF8F2] border-r border-[#E5E0D2] ${activeTab === "chats" || activeTab === "directory" ? "" : "md:flex"}`}>
        {/* Workspace header */}
        <div className="px-5 pt-5 pb-4 border-b border-[#E5E0D2] flex-shrink-0">
          <p style={monoStyle}>Workspace</p>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", lineHeight: 1.1, color: "#13101A", marginTop: "4px" }}>
            {ministryName}
          </p>
        </div>

        {renderPanelBody()}

        {/* Verse card */}
        <div className="mx-3 mb-4 p-3 border border-[#E5E0D2] rounded-[10px] bg-[#F4F1E8] flex-shrink-0">
          <p style={{ ...monoStyle, marginBottom: "6px" }}>Verse · Psalm 46:10</p>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontStyle: "italic", fontSize: "14px", lineHeight: 1.4, color: "#13101A" }}>
            &ldquo;Be still, and know that I am God.&rdquo;
          </p>
        </div>
      </div>
    </>
  )
}
