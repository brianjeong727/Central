"use client"

import { useState, useEffect } from "react"
import { Home, MessageCircle, BookOpen, ClipboardList, User, Plus, Wallet } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { PlanLineIcon, sidebarItemStyle } from "./shared"
import { getInitials } from "../utils"
import { DirectoryMemberListPanel } from "../tabs/directory-tab"
import type { DesktopTopbarProps, DesktopSidebarProps, UserTeam, Tab } from "../types"

// ── Shared design tokens (all CSS vars, never hardcoded hex) ─────────────────

const RAIL_BG    = "var(--rail)"          // ← dedicated rail token (#ECE6D6, darkest tier)
const PANEL_BG   = "var(--body-bg)"       // ← sidebar panel: middle tier (#F4F1E8)
const LINE       = "var(--line)"
const PLUM       = "var(--plum)"
const INK        = "var(--ink)"
const MUTED      = "var(--muted-text)"
const IVORY      = "var(--ivory)"
const CREAM_2    = "var(--cream-2)"

const MONO: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: MUTED,
}

// ── DesktopTopbar ─────────────────────────────────────────────────────────────

export function DesktopTopbar({ crumbs, right }: DesktopTopbarProps) {
  return (
    <div
      className="hidden md:flex h-12 px-14 items-center justify-between gap-4 flex-shrink-0"
      style={{ background: "transparent" }}
    >
      <div className="flex items-center gap-1.5 text-[12px]">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span style={{ color: i === crumbs.length - 1 ? INK : MUTED, fontWeight: i === crumbs.length - 1 ? 500 : 400 }}>
              {c}
            </span>
            {i < crumbs.length - 1 && <span style={{ color: "var(--line-2)", userSelect: "none" }}>/</span>}
          </span>
        ))}
      </div>
      {right}
    </div>
  )
}

// ── DesktopSidebar ────────────────────────────────────────────────────────────

export function DesktopSidebar({
  activeTab, onTabChange, ministryName, chatsUnread, showPlan,
  userInitials, userAvatarUrl, recentChats, userTeams, onOpenChat,
  activeGroupId, onLogout, isAdmin, isPastor, onCreateTeam, activeTeamId,
  onActiveTeamChange, profileSection, onProfileSectionChange,
  financeSection, onFinanceSectionChange, isTreasurer, isDGL,
  canCreateTeam, userId,
  directoryMinistryId, directoryCurrentUserId,
  directorySelectedMemberId, directoryInitialMemberId, onDirectoryMemberSelect,
  chatPanelContent,
  planContextContent,
  hideSidePanel,
}: DesktopSidebarProps) {
  const supabase = createClient()

  const navItems: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "home",      label: "Home",        icon: Home },
    { id: "chats",     label: "Messages",  icon: MessageCircle },
    ...(showPlan ? [{ id: "plan" as Tab, label: "Planning", icon: ClipboardList }] : []),
    { id: "directory", label: "People",    icon: BookOpen },
    { id: "giving",    label: "Finance",   icon: Wallet },
    { id: "profile",   label: "You",       icon: User },
  ]

  const subItemStyle = sidebarItemStyle

  function getSectionName(): string {
    switch (activeTab) {
      case "chats":        return "Messages"
      case "plan": {
        const activeTeam = userTeams.find(t => t.teamId === activeTeamId)
        return activeTeam?.teamName ?? "Planning"
      }
      case "directory":    return "People"
      case "giving":       return "Finance"
      case "congregation": return "Congregation"
      case "profile":      return profileSection === "journal" ? "Journal" : "Profile"
      default:             return "Home"
    }
  }

  function renderPanelBody() {
    // ── Chats: full list panel (ChatListPanel rendered by home-app) ───────────
    if (activeTab === "chats") {
      return chatPanelContent ?? (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...MONO, padding: "8px 8px 6px" }}>No chats yet</p>
        </div>
      )
    }

    // ── Plan: team sections sidebar OR team list ─────────────────────────────
    if (activeTab === "plan") {
      if (planContextContent) return <>{planContextContent}</>
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 6px" }}>
            <p style={MONO}>Your teams · {userTeams.length}</p>
            {(canCreateTeam || isAdmin) && onCreateTeam && (
              <button
                onClick={onCreateTeam}
                style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: MUTED, borderRadius: "var(--r-pill)", padding: 0 }}
                title="New team"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {userTeams.length === 0 ? (
            <p style={{ fontSize: 12, color: MUTED, padding: "4px 8px" }}>No teams yet</p>
          ) : (
            userTeams.map((t) => {
              const isActive = t.teamId === activeTeamId
              return (
                <button key={t.teamId} onClick={() => onActiveTeamChange(t.teamId)} style={subItemStyle(isActive)}>
                  <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.teamName}</span>
                </button>
              )
            })
          )}
        </div>
      )
    }

    // ── Directory: member list ───────────────────────────────────────────────
    if (activeTab === "directory" && directoryMinistryId && directoryCurrentUserId && onDirectoryMemberSelect) {
      return (
        <DirectoryMemberListPanel
          ministryId={directoryMinistryId}
          currentUserId={directoryCurrentUserId}
          selectedId={directorySelectedMemberId}
          initialMemberId={directoryInitialMemberId}
          onSelect={onDirectoryMemberSelect}
        />
      )
    }

    // ── Finance (giving tab): sub-sections — Reimbursements + Budget only ──────
    if (activeTab === "giving") {
      const financeSections: { label: string; section: "reimbursements" | "budget"; show: boolean }[] = [
        { label: "Reimbursements", section: "reimbursements", show: !!(isDGL || isTreasurer || isAdmin) },
        { label: "Budget",         section: "budget",         show: !!(isTreasurer || isAdmin) },
      ]
      const visible = financeSections.filter(s => s.show)
      return (
        <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
          {visible.map(s => (
            <button
              key={s.section}
              style={subItemStyle(financeSection === s.section || (s.section === "budget" && financeSection === "allocation"))}
              onClick={() => onFinanceSectionChange(s.section)}
            >
              <span style={{ flex: 1 }}>{s.label}</span>
            </button>
          ))}
        </div>
      )
    }

    // ── Profile / Congregation ───────────────────────────────────────────────
    if (activeTab === "profile" || activeTab === "congregation") {
      const items: { label: string; section?: "spiritual-profile" | "journal"; tab?: Tab; danger?: boolean; onClick?: () => void }[] = [
        { label: "Profile",  section: "spiritual-profile" },
        { label: "Journal",  section: "journal" },
        ...(isPastor ? [{ label: "Congregation", tab: "congregation" as Tab }] : []),
        { label: "Sign out", danger: true, onClick: onLogout },
      ]
      return (
        <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
          {items.map((s, i) => (
            <button
              key={i}
              style={subItemStyle(
                s.tab ? activeTab === s.tab
                  : s.section ? (activeTab === "profile" && profileSection === s.section)
                  : undefined,
                s.danger
              )}
              onClick={
                s.tab    ? () => onTabChange(s.tab!)
                : s.section ? () => { if (activeTab !== "profile") onTabChange("profile"); onProfileSectionChange(s.section!) }
                : s.onClick
              }
            >
              <span style={{ flex: 1 }}>{s.label}</span>
            </button>
          ))}
        </div>
      )
    }

    // ── Home section: Home, Announcements, Give, Forms, Settings ────────────
    const homeItems: { label: string; tab: "home" | "announcements" | "give" | "forms" | "settings" }[] = [
      { label: "Overview",          tab: "home" },
      { label: "Announcements",   tab: "announcements" },
      { label: "Give",            tab: "give" },
      { label: "Forms",           tab: "forms" },
      ...(isAdmin ? [{ label: "Church Settings", tab: "settings" as const }] : []),
    ]
    const generalTabs  = ["home", "announcements", "give"] as const
    const restrictedTabs = ["forms", "settings"]   as const
    const generalItems   = homeItems.filter(i => (generalTabs   as readonly string[]).includes(i.tab))
    const restrictedItems = homeItems.filter(i => (restrictedTabs as readonly string[]).includes(i.tab))

    return (
      <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
        {generalItems.map(item => (
          <button key={item.tab} style={subItemStyle(activeTab === item.tab)} onClick={() => onTabChange(item.tab)}>
            <span style={{ flex: 1 }}>{item.label}</span>
          </button>
        ))}
        {restrictedItems.length > 0 && (
          <>
            <div style={{ height: 1, background: LINE, opacity: 0.5, margin: "6px 10px" }} />
            {restrictedItems.map(item => (
              <button key={item.tab} style={subItemStyle(activeTab === item.tab)} onClick={() => onTabChange(item.tab)}>
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
      {/* ── Icon Rail ─────────────────────────────────────────────────────── */}
      <div
        className="hidden md:flex flex-col w-[72px] flex-shrink-0 h-screen items-center py-4 gap-1"
        style={{ background: RAIL_BG, borderRight: `1px solid ${LINE}` }}
      >
        {/* Logo — DO NOT TOUCH: exact original markup preserved */}
        <a
          href="/landing"
          className="w-9 h-9 rounded-full flex items-center justify-center mb-3.5 flex-shrink-0 hover:opacity-90 transition-opacity"
          style={{ background: PLUM, textDecoration: "none" }}
        >
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
            <path d="M70 28 A32 32 0 1 0 70 72" stroke="#F6F4EF" strokeWidth="8" strokeLinecap="round" />
            <circle cx="50" cy="50" r="6" fill="#F6F4EF" />
          </svg>
        </a>

        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive =
            activeTab === id ||
            (id === "home" && ["settings", "announcements", "forms", "give"].includes(activeTab)) ||
            (id === "profile" && activeTab === "congregation")
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="relative flex flex-col items-center gap-1 w-full px-1 py-2.5 rounded-none transition-colors"
              style={{
                background: "transparent",
                color: isActive ? PLUM : MUTED,
                border: "none",
                cursor: "pointer",
              }}
            >
              {/* Active pill indicator */}
              {isActive && (
                <span
                  style={{
                    position: "absolute",
                    left: 6, top: "50%", transform: "translateY(-50%)",
                    width: 3, height: 24,
                    background: PLUM,
                    borderRadius: 99,
                  }}
                />
              )}
              <div
                style={{
                  width: 36, height: 32, borderRadius: "var(--r-chip)",
                  background: isActive ? "var(--cream-3)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 100ms ease",
                  position: "relative",
                }}
              >
                <Icon className="w-[18px] h-[18px]" />
                {id === "chats" && chatsUnread > 0 && (
                  <span
                    style={{
                      position: "absolute", top: 4, right: 4,
                      width: 6, height: 6,
                      background: "var(--gold)", borderRadius: "50%",
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 8,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: isActive ? PLUM : MUTED,
                  lineHeight: 1,
                }}
              >
                {label}
              </span>
            </button>
          )
        })}

        <div className="flex-1" />

        {/* User avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ background: PLUM }}
        >
          {userAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--cream)", fontFamily: "var(--sans)" }}>
              {userInitials}
            </span>
          )}
        </div>
      </div>

      {/* ── Context Panel — hidden on picker (no team selected) so main content goes full-width ── */}
      {!hideSidePanel && <div
        className="hidden md:flex flex-col w-[var(--sidebar-width)] flex-shrink-0 h-screen"
        style={{ background: activeTab === "chats" ? "var(--cream)" : PANEL_BG, borderRight: `1px solid ${LINE}` }}
      >
        {/* Section header */}
        <div style={{ padding: "18px 16px 14px", flexShrink: 0 }}>
          <p style={MONO}>Section</p>
          <p style={{ fontFamily: "var(--serif)", fontSize: 20, lineHeight: 1.1, color: INK, marginTop: 4 }}>
            {getSectionName()}
          </p>
        </div>

        {renderPanelBody()}

      </div>}
    </>
  )
}
