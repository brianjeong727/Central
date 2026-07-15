"use client"

import dynamic from "next/dynamic"
import { Home, MessageCircle, BookOpen, ClipboardList, User, Plus, Receipt, Waypoints } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { PlanLineIcon, sidebarItemStyle } from "./shared"
import { DirectoryListSkeleton } from "@/components/central"
import { RAIL_LABEL_STYLE } from "@/components/central/typography"
import { sectionForTab } from "@/components/central/nav-sections"
import { useIsNativeShell } from "@/lib/native-auth"
import { useBreadcrumbExtra } from "../breadcrumb-context"

// Lazy — pulls the 631-line directory-tab module into its own async chunk instead
// of the main shell chunk (desktop-nav is statically imported by home-app). Only
// loads when the user opens the Directory tab, where this panel renders.
const DirectoryMemberListPanel = dynamic(
  () => import("../tabs/directory-tab").then((m) => m.DirectoryMemberListPanel),
  { loading: () => <DirectoryListSkeleton />, ssr: false }
)
import type { DesktopTopbarProps, DesktopSidebarProps, UserTeam, Tab } from "../types"

// ── Shared design tokens (all CSS vars, never hardcoded hex) ─────────────────

// R9: the icon rail is a deep-plum surface (--rail ≡ var(--plum-2)), per DESIGN_SYSTEM §2.1.
// Nav items use the on-dark treatment (cream-on-dark active, muted inactive).
const RAIL_BG    = "var(--rail)"          // ← deep-plum icon-rail surface (var(--plum-2), Phase 7)
// Inactive rail item icon+label on the plum-2 rail — matches the frames' `.ri`
// inactive color (cream-on-dark at 55%), legible on deep plum where --muted-text drifts.
const RAIL_INACTIVE = "color-mix(in srgb, var(--cream-on-dark) 55%, transparent)"
const PANEL_BG   = "var(--body-bg)"       // ← sidebar panel: middle tier (var(--body-bg))
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
  const extra = useBreadcrumbExtra()
  // Dedupe: when a locally-owned subpage pushes its own [parent, …] crumbs, the
  // last base crumb (resolved by getShellCrumbs) can match the first pushed crumb.
  // Drop the base one and keep the pushed one — it carries the close onClick.
  const allCrumbs = extra.length && crumbs.length && crumbs[crumbs.length - 1].label === extra[0].label
    ? [...crumbs.slice(0, -1), ...extra]
    : [...crumbs, ...extra]
  return (
    <div
      className="hidden md:flex h-12 px-14 items-center justify-between gap-4 flex-shrink-0"
      style={{ background: "transparent" }}
    >
      <div className="flex items-center gap-1.5 text-[12px]">
        {allCrumbs.map((c, i) => {
          const isLast = i === allCrumbs.length - 1
          const clickable = !!c.onClick && !isLast
          return (
            <span key={i} className="flex items-center gap-1.5">
              {clickable ? (
                <button
                  type="button"
                  onClick={c.onClick}
                  className="transition-colors"
                  style={{
                    fontFamily: "inherit", fontSize: "inherit", fontWeight: 400,
                    color: MUTED, background: "transparent", border: "none",
                    padding: 0, cursor: "pointer", textDecoration: "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = PLUM }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = MUTED }}
                >
                  {c.label}
                </button>
              ) : (
                <span style={{ color: isLast ? INK : MUTED, fontWeight: isLast ? 500 : 400 }}>
                  {c.label}
                </span>
              )}
              {!isLast && <span style={{ color: "var(--line-2)", userSelect: "none" }}>/</span>}
            </span>
          )
        })}
      </div>
      {right}
    </div>
  )
}

// ── DesktopSidebar ────────────────────────────────────────────────────────────

export function DesktopSidebar({
  activeTab, onTabChange, ministryName, chatsUnread, showPlan,
  userInitials, userAvatarUrl, recentChats, userTeams, onOpenChat,
  activeGroupId, onLogout, isAdmin, isPastor, isLeaderOrAdmin, onCreateTeam, activeTeamId,
  activeTeamName,
  onActiveTeamChange, profileSection, onProfileSectionChange,
  isTreasurer, isDGL,
  canCreateTeam, userId,
  directoryMinistryId, directoryCurrentUserId,
  directorySelectedMemberId, directoryInitialMemberId, onDirectoryMemberSelect,
  chatPanelContent,
  planContextContent,
  hideSidePanel,
  onLogoClick,
  showWorkspaceNavHint,
  onDismissNavHint,
  superSwitcherSlot,
}: DesktopSidebarProps) {
  const supabase = createClient()

  const navItems: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "home",      label: "Home",        icon: Home },
    { id: "chats",     label: "Messages",  icon: MessageCircle },
    ...(showPlan ? [{ id: "plan" as Tab, label: "Workspace", icon: ClipboardList }] : []),
    { id: "directory", label: "People",    icon: BookOpen },
    ...(isAdmin ? [{ id: "network" as Tab, label: "Network", icon: Waypoints }] : []),
    { id: "profile",   label: "You",       icon: User },
  ]

  const subItemStyle = sidebarItemStyle

  // Give is web-only in the native shell (App Store 3.2.2(iv): donations must be
  // collected outside the app) — every Give entry point is hidden there.
  const nativeShell = useIsNativeShell()

  function getSectionName(): string {
    // Labels that differ from their section's default label, or are dynamic:
    //  · settings lives in the Home section but carries its own "Church Settings" label
    //  · plan is dynamic (active team name; gov-view teams resolve via activeTeamName)
    //  · profile toggles Profile / Journal
    // Everything else (home/announcements/give/forms/congregation → "Home", chats →
    // "Messages", directory → "People", network → "Network") derives from the single
    // nav-section config (R7).
    if (activeTab === "settings") return "Church Settings"
    if (activeTab === "plan") {
      return activeTeamName ?? userTeams.find(t => t.teamId === activeTeamId)?.teamName ?? "Workspace"
    }
    if (activeTab === "profile") return profileSection === "journal" ? "Journal" : "Profile"
    return sectionForTab(activeTab)?.label ?? "Home"
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
          {/* Receipts workspace — always reachable from the team list (sentinel). */}
          <div style={{ height: 1, background: LINE, opacity: 0.5, margin: "6px 10px" }} />
          <button onClick={() => onActiveTeamChange("receipts")} style={subItemStyle(activeTeamId === "receipts")}>
            <Receipt className="w-3.5 h-3.5" style={{ marginRight: 8, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>Receipts</span>
          </button>
        </div>
      )
    }

    // ── Network: standalone top-level tab — clean panel, no sub-items ─────────
    if (activeTab === "network") {
      return (
        <div className="flex-1 overflow-y-auto px-2 pt-2 pb-3">
          <p style={{ fontSize: 12, color: MUTED, padding: "4px 8px", lineHeight: 1.5 }}>
            Cross-ministry — coming soon
          </p>
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

    // ── Profile (You) ────────────────────────────────────────────────────────
    // Congregation moved to the Home section (R7); it no longer lives here.
    if (activeTab === "profile") {
      const items: { label: string; section?: "spiritual-profile" | "journal"; tab?: Tab; danger?: boolean; onClick?: () => void }[] = [
        { label: "Profile",  section: "spiritual-profile" },
        { label: "Journal",  section: "journal" },
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

    // ── Home section: Home, Announcements, Give, Forms, Settings, Congregation ──
    const homeItems: { label: string; tab: "home" | "announcements" | "give" | "forms" | "settings" | "congregation" }[] = [
      { label: "Overview",          tab: "home" },
      { label: "Announcements",   tab: "announcements" },
      ...(nativeShell ? [] : [{ label: "Give", tab: "give" as const }]),
      // Forms is a leader-only insights hub — members/visitors fill forms via Announcements.
      ...(isLeaderOrAdmin ? [{ label: "Forms", tab: "forms" as const }] : []),
      ...(isAdmin ? [{ label: "Church Settings", tab: "settings" as const }] : []),
      // Congregation moved out of the You section (R7); pastor-only.
      ...(isPastor ? [{ label: "Congregation", tab: "congregation" as const }] : []),
    ]
    const generalTabs  = ["home", "announcements", "give"] as const
    const restrictedTabs = ["forms", "settings", "congregation"] as const
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
        {/* Brand mark → contextual "back to Plan workspaces" control. On the Plan tab
            for 2+-workspace users it returns to the workspace picker; everywhere else
            it goes to /landing. RingCross mark preserved pixel-identical. A one-time
            teaching hint pill appears the first time a 2+-workspace user reaches the
            picker. */}
        <div className="relative mb-3.5 flex-shrink-0">
          <button
            type="button"
            onClick={onLogoClick}
            aria-label="Central"
            className="relative w-9 h-9 rounded-full flex items-center justify-center hover:opacity-90 transition-opacity"
            style={{ background: PLUM, border: "none", cursor: "pointer", padding: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 100 100" fill="none">
              <path d="M70 28 A32 32 0 1 0 70 72" stroke="var(--cream-on-dark)" strokeWidth="8" strokeLinecap="round" />
              <circle cx="50" cy="50" r="6" fill="var(--cream-on-dark)" />
            </svg>
          </button>
          {showWorkspaceNavHint && (
            <div
              role="status"
              style={{
                position: "absolute", top: 0, left: "calc(100% + 10px)",
                zIndex: 200,
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--plum-2)", color: "var(--cream)",
                fontFamily: "var(--sans)", fontSize: 11, lineHeight: 1,
                padding: "6px 11px", borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              {/* Left-pointing caret */}
              <span
                aria-hidden
                style={{
                  position: "absolute", left: -4, top: "50%", transform: "translateY(-50%) rotate(45deg)",
                  width: 8, height: 8, background: "var(--plum-2)", borderRadius: 1,
                }}
              />
              <span>← Back to all workspaces, anytime</span>
              <button
                type="button"
                onClick={() => onDismissNavHint?.()}
                aria-label="Dismiss"
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "var(--cream)", fontSize: 13, lineHeight: 1, padding: 0,
                  opacity: 0.8,
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>

        {navItems.map(({ id, label, icon: Icon }) => {
          // Active-highlight derives tab→section membership from the single nav-section
          // config (R7) — settings/announcements/forms/give/congregation all light Home.
          const isActive = sectionForTab(activeTab)?.id === id
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="relative flex flex-col items-center gap-1 w-full px-1 py-2.5 rounded-none transition-colors"
              style={{
                background: "transparent",
                // On the plum-2 rail: cream-on-dark active, cream-on-dark-55% inactive (icon inherits currentColor).
                color: isActive ? "var(--cream-on-dark)" : RAIL_INACTIVE,
                border: "none",
                cursor: "pointer",
              }}
            >
              {/* Active pill indicator — cream stripe on the dark rail (§2.1) */}
              {isActive && (
                <span
                  style={{
                    position: "absolute",
                    left: 6, top: "50%", transform: "translateY(-50%)",
                    width: 3, height: 24,
                    background: "var(--cream-on-dark)",
                    borderRadius: 99,
                  }}
                />
              )}
              <div
                style={{
                  width: 36, height: 32, borderRadius: "var(--r-chip)",
                  // R9 on-dark active tint (ratified) — replaces the light cream-3 box.
                  background: isActive ? "color-mix(in srgb, var(--cream-on-dark) 12%, transparent)" : "transparent",
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
                  ...RAIL_LABEL_STYLE,
                  color: isActive ? "var(--cream-on-dark)" : RAIL_INACTIVE,
                }}
              >
                {label}
              </span>
            </button>
          )
        })}

        <div className="flex-1" />

        {/* Super-account impersonation chip — in-flow, docked above the avatar (R9). */}
        {superSwitcherSlot && (
          <div className="w-full flex justify-center px-1 mb-2 flex-shrink-0">
            {superSwitcherSlot}
          </div>
        )}

        {/* User avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ background: PLUM }}
        >
          {userAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userAvatarUrl} alt="" decoding="async" className="w-full h-full object-cover" />
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

// ── ReceiptsSidebarNav ──────────────────────────────────────────────────────
// Context-panel team list for the Receipts workspace. Lists the teams the user is
// a member of OR governs; selecting one writes ?rteam. Replaces the flat plan team
// list when the Receipts sentinel is active.
export function ReceiptsSidebarNav({
  teams, active, onSelect,
}: {
  teams: { id: string; name: string }[]
  active: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3">
      <p style={{ ...MONO, padding: "8px 8px 6px" }}>Your teams · {teams.length}</p>
      {teams.length === 0 ? (
        <p style={{ fontSize: 12, color: MUTED, padding: "4px 8px" }}>No teams yet</p>
      ) : (
        teams.map((t) => (
          <button key={t.id} onClick={() => onSelect(t.id)} style={sidebarItemStyle(t.id === active)}>
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
          </button>
        ))
      )}
    </div>
  )
}
