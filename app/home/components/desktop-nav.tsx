"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Home, MessageCircle, BookOpen, ClipboardList, User, Plus, Wallet } from "lucide-react"
import { Search } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { PlanLineIcon } from "./shared"
import { getInitials } from "../utils"
import type { DesktopTopbarProps, DesktopSidebarProps, UserTeam, Tab } from "../types"

// ── Shared design tokens (all CSS vars, never hardcoded hex) ─────────────────

const RAIL_BG    = "var(--ivory)"         // ← single token controlling rail warmth
const PANEL_BG   = "var(--cream)"
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
      className="hidden md:flex h-12 px-7 items-center gap-4 flex-shrink-0"
      style={{ background: PANEL_BG, borderBottom: `1px solid ${LINE}` }}
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
      <div className="flex-1" />
      <div
        onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer select-none transition-colors"
        style={{
          border: `1px solid ${LINE}`,
          background: CREAM_2,
          color: MUTED,
          width: 240,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = IVORY)}
        onMouseLeave={e => (e.currentTarget.style.background = CREAM_2)}
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-[12px] flex-1">Jump to anything</span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded leading-none"
          style={{ border: `1px solid ${LINE}`, background: PANEL_BG, color: MUTED }}
        >
          ⌘K
        </span>
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
}: DesktopSidebarProps) {
  const supabase = createClient()
  const [note, setNote] = useState("")
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.from("profiles").select("sidebar_note").eq("id", userId).maybeSingle().then(({ data }) => {
      if (data?.sidebar_note) setNote(data.sidebar_note)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const saveNote = useCallback((value: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setSaveStatus("saving")
    saveTimer.current = setTimeout(async () => {
      await supabase.from("profiles").update({ sidebar_note: value || null }).eq("id", userId)
      setSaveStatus("saved")
      flashTimer.current = setTimeout(() => setSaveStatus("idle"), 1500)
    }, 600)
  }, [userId, supabase])

  const navItems: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "home",      label: "Home",      icon: Home },
    { id: "chats",     label: "Messages",  icon: MessageCircle },
    ...(showPlan ? [{ id: "plan" as Tab, label: "Planning", icon: ClipboardList }] : []),
    { id: "directory", label: "People",    icon: BookOpen },
    { id: "giving",    label: "Finance",   icon: Wallet },
    { id: "profile",   label: "You",       icon: User },
  ]

  const subItemStyle = (active?: boolean, danger?: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: "var(--r-chip)",
    cursor: "pointer",
    background: active ? IVORY : "transparent",
    color: danger ? "var(--danger)" : active ? INK : "var(--body)",
    fontSize: 13,
    fontWeight: active ? 500 : 400,
    border: "none",
    width: "100%",
    textAlign: "left",
    fontFamily: "var(--sans)",
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: active ? PLUM : "transparent",
    transition: "background 100ms ease",
  })

  function renderPanelBody() {
    // ── Chats: recent chat list ──────────────────────────────────────────────
    if (activeTab === "chats") {
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...MONO, padding: "8px 8px 6px" }}>Recent</p>
          {recentChats.length === 0 ? (
            <p style={{ fontSize: 12, color: MUTED, padding: "4px 8px" }}>No chats yet</p>
          ) : (
            recentChats.slice(0, 6).map((c, i) => {
              const isActive = activeGroupId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenChat(c.id, c.groupName)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 8px", borderRadius: "var(--r-chip)", cursor: "pointer",
                    background: isActive ? IVORY : "transparent",
                    border: "none",
                    borderLeft: isActive ? `2px solid ${PLUM}` : "2px solid transparent",
                    width: "100%", textAlign: "left",
                    transition: "background 100ms ease",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: "var(--r-chip)", flexShrink: 0,
                    background: i % 2 === 0 ? PLUM : INK,
                    color: "var(--cream)", display: "grid", placeItems: "center",
                    fontSize: 10, fontWeight: 600, fontFamily: "var(--sans)",
                  }}>
                    {c.initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: c.unreadCount ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--sans)", color: INK }}>
                      {c.groupName}
                    </div>
                    {c.lastMessage && (
                      <div style={{ fontSize: 11, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--sans)" }}>
                        {c.lastMessage}
                      </div>
                    )}
                  </div>
                  {c.unreadCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: INK, background: "var(--gold)", padding: "1px 6px", borderRadius: 999, fontFamily: "var(--sans)" }}>
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )
    }

    // ── Plan: team list ──────────────────────────────────────────────────────
    if (activeTab === "plan") {
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
                <button key={t.teamId} onClick={() => onActiveTeamChange(t.teamId)} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 8px", borderRadius: "var(--r-chip)", cursor: "pointer",
                  background: isActive ? IVORY : "transparent",
                  border: "none",
                  borderLeft: isActive ? `2px solid ${PLUM}` : "2px solid transparent",
                  width: "100%", textAlign: "left",
                  transition: "background 100ms ease",
                }}>
                  <PlanLineIcon
                    iconKey={t.teamIcon ?? "users"}
                    bg={isActive ? PLUM : "var(--line)"}
                    fg={isActive ? "var(--cream)" : INK}
                    size={30}
                    radius={8}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--sans)", color: INK }}>
                      {t.teamName}
                    </div>
                    <div style={{ fontSize: 10, color: MUTED, letterSpacing: "0.4px", fontFamily: "var(--sans)" }}>{t.roleName}</div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      )
    }

    // ── Directory: no sub-nav in panel ───────────────────────────────────────
    if (activeTab === "directory") {
      return <div className="flex-1 overflow-y-auto px-2 pb-3" />
    }

    // ── Finance (giving tab): sub-sections — Reimbursements + Budget only ──────
    if (activeTab === "giving") {
      const financeSections: { label: string; section: "reimbursements" | "budget"; show: boolean }[] = [
        { label: "Reimbursements", section: "reimbursements", show: !!(isDGL || isTreasurer || isAdmin) },
        { label: "Budget",         section: "budget",         show: !!(isTreasurer || isAdmin) },
      ]
      const visible = financeSections.filter(s => s.show)
      return (
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...MONO, padding: "8px 8px 6px" }}>Finance</p>
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
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <p style={{ ...MONO, padding: "8px 8px 6px" }}>You</p>
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
      { label: "Home",            tab: "home" },
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
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <p style={{ ...MONO, padding: "8px 8px 6px" }}>Home</p>
        {generalItems.map(item => (
          <button key={item.tab} style={subItemStyle(activeTab === item.tab)} onClick={() => onTabChange(item.tab)}>
            <span style={{ flex: 1 }}>{item.label}</span>
          </button>
        ))}
        {restrictedItems.length > 0 && (
          <>
            <div style={{ height: 1, background: LINE, margin: "4px 8px" }} />
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
        className="hidden md:flex flex-col w-[72px] flex-shrink-0 h-screen items-center py-4 gap-0.5"
        style={{ background: RAIL_BG, borderRight: `1px solid ${LINE}` }}
      >
        {/* Logo — DO NOT TOUCH: exact original markup preserved */}
        <a
          href="/landing"
          className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-3.5 flex-shrink-0 hover:opacity-90 transition-opacity"
          style={{ background: PLUM, textDecoration: "none" }}
        >
          <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#F6F4EF" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#F6F4EF" />
            <rect x="22" y="47" width="56" height="6" fill="#F6F4EF" />
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
              className="relative flex flex-col items-center gap-1 w-full px-1 py-2 rounded-none transition-colors"
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

      {/* ── Context Panel ─────────────────────────────────────────────────── */}
      <div
        className={`hidden flex-col w-[220px] flex-shrink-0 h-screen ${activeTab === "chats" || activeTab === "directory" ? "" : "md:flex"}`}
        style={{ background: PANEL_BG, borderRight: `1px solid ${LINE}` }}
      >
        {/* Workspace header */}
        <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${LINE}`, flexShrink: 0 }}>
          <p style={MONO}>Workspace</p>
          <p style={{ fontFamily: "var(--serif)", fontSize: 20, lineHeight: 1.1, color: INK, marginTop: 4 }}>
            {ministryName}
          </p>
        </div>

        {renderPanelBody()}

        {/* Sticky note */}
        <div
          style={{
            margin: "0 10px 12px",
            padding: "10px 12px",
            border: `1px solid var(--line-2)`,
            borderRadius: "var(--r-input)",
            background: "var(--cream-2)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <p style={{ ...MONO, color: "var(--faint)" }}>Note</p>
            {saveStatus === "saved" && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.05em", color: "var(--success)" }}>SAVED</span>
            )}
          </div>
          <textarea
            value={note}
            onChange={e => { setNote(e.target.value); saveNote(e.target.value) }}
            placeholder="Jot something down…"
            rows={3}
            style={{
              width: "100%", resize: "none", border: "none", outline: "none",
              background: "transparent", fontFamily: "var(--sans)",
              fontSize: 12, lineHeight: 1.55, color: INK,
              padding: 0, boxSizing: "border-box",
            }}
          />
        </div>
      </div>
    </>
  )
}
