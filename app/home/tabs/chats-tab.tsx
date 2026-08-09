"use client"

import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import useSWR, { useSWRConfig } from "swr"
import { Search, ChevronDown, ChevronUp, X, Check, Trash2, Plus, Users, Pencil, User, Forward, Pin, Lock, BellOff, Paperclip, FileDown, LinkIcon, ImageIcon, Folder } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { createGroup } from "@/app/actions/create-group"
import { deleteGroup } from "@/app/actions/chat"
import { syncSmallGroupFromChatAction } from "@/app/actions/auto-chats"
import { setChatNickname, clearChatNickname } from "@/app/actions/chat-nicknames"
import { MAX_NICKNAME_LEN } from "../types"
import { Spinner, EmptyState, AnimateIn, MONO_STYLE } from "../components/shared"
import { PocketChrome, PocketRoundButton, PocketChip } from "../components/pocket-header"
import { MonogramChip, SubpageShell, SubpageChromeActions, ContentHeader, ContentActionButton, CentralButton, CentralModal, SegmentedControl, PocketFilterChip, PocketFilterChipRow, PocketSearchField, PocketRow, PocketRowCard, PocketKicker, PocketTag, PocketSwitch, PocketButton, POCKET_KICKER_STYLE, useScrollResetOn, useEdgeSwipeBack, BackChevron, POCKET_CHROME_TITLE } from "@/components/central"
import { ChatSearchView } from "../components/chat-search"
import { findExistingDm, getOrCreateDm } from "../dm"
import { isMobileViewport } from "@/lib/breakpoints"
import { getInitials, formatRelativeTime, replyPreviewLabel } from "../utils"
import { roleLabel } from "@/app/actions/super-constants"
import type { CreateChatScreenProps, ChatSettingsProps, ChatScreenProps, ChatsTabProps, ChatGroup, GroupMember, Message, Reaction, Profile, Crumb, ProcessedMessage, LinkPreviewData, ChatNotifyMode, NotificationSettings } from "../types"
import { useNavState } from "../nav-state"
import { useOpenMemberProfile } from "../member-profile-context"
import { InsetHairline } from "@/components/central/hairline"
import { fetchChatList } from "../chat-list"
import { subscribeChatTopic } from "../chat-broadcast"
import { PushSubscribeCard } from "../components/notifications"
import { MessageRow, formatFileSize } from "./message-row"
import { Composer } from "./composer"
import { ReportModal } from "../components/report-modal"
import { useBlocks } from "../use-blocks"
import { MODERATION_DEFAULTS, moderateText, scopeApplies, reverentCapitalize } from "@/lib/moderation"
import type { ModerationSettings } from "@/lib/moderation"
import { recordChatOffense } from "@/app/actions/moderation"
import { isChatManageRole, isLeaderRole } from "@/lib/roles"
import { subscribeKeyboard, useSwipeDownToDismissKeyboard } from "@/lib/keyboard-inset"

// Hydration-safe "are we mounted on the client yet?" flag with no set-state-in-
// effect. useSyncExternalStore returns the server snapshot (false) during SSR
// and the first hydration render, then the client snapshot (true) — matching the
// old useState+useEffect(setMounted(true)) exactly. Value never changes → no-op subscribe.
const subscribeNoop = () => () => {}
const useMountedFlag = () => useSyncExternalStore(subscribeNoop, () => true, () => false)

// ── Church-chat sectioning ─────────────────────────────────────────────────
// Church chats split into three sections (General / Groups / Teams) by the
// `category` column. Null/unknown category falls back to "general". Recency
// sort within each section is inherited from the already-sorted input list.
type ChurchSection = "general" | "group" | "team"
const CHURCH_SECTION_DEFS: { key: ChurchSection; label: string }[] = [
  { key: "general", label: "General" },
  { key: "group", label: "Groups" },
  { key: "team", label: "Teams" },
]
function sectionChurchChats(chats: ChatGroup[]): Record<ChurchSection, ChatGroup[]> {
  const out: Record<ChurchSection, ChatGroup[]> = { general: [], group: [], team: [] }
  for (const c of chats) {
    if (c.category === "team") out.team.push(c)
    else if (c.category === "group") out.group.push(c)
    else out.general.push(c)
  }
  return out
}

// Stable partition: pinned rooms float to the top, preserving the existing
// recency order within the pinned and unpinned subsets (no re-sort by anything
// else). Applied per rendered group — each church section + the flat My Chats list.
function partitionPinned(chats: ChatGroup[]): ChatGroup[] {
  const pinned: ChatGroup[] = []
  const rest: ChatGroup[] = []
  for (const c of chats) (c.pinned ? pinned : rest).push(c)
  return [...pinned, ...rest]
}

// A gated church chat shows a small lock glyph — only on rooms the member is IN
// but whose membership is restricted: any team chat, plus the two role-synced
// general chats ("Leaders" and "<Ministry> Staff", mirrored from auto-chats.ts).
function isLockedChat(group: ChatGroup, ministryName: string): boolean {
  if (group.category === "team") return true
  if (group.name === "Leaders") return true
  if (ministryName && group.name === `${ministryName} Staff`) return true
  return false
}

export function CreateChatScreen({ userId, userName, ministryId, groupType, initialCategory, onClose, onCreated }: CreateChatScreenProps) {
  const supabase = createClient()
  const [customName, setCustomName] = useState("")
  const [showNameEdit, setShowNameEdit] = useState(false)
  const [search, setSearch] = useState("")
  const [allMembers, setAllMembers] = useState<{ id: string; name: string; graduation_year: number | null; role: string; avatar_url: string | null }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Blocked users can't be added to a new chat / DM (§1.2 — silent to them).
  const { blockedIds } = useBlocks(userId)
  // Section for church chats only (General / Groups / Teams). Seeded from
  // initialCategory when opened from a section's + button; defaults General.
  const [category, setCategory] = useState<ChurchSection>(initialCategory ?? "general")

  useEffect(() => {
    async function loadMembers() {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, graduation_year, role, avatar_url")
        .eq("ministry_id", ministryId)
        .neq("id", userId)
        .order("name")
      setAllMembers(data ?? [])
    }
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = allMembers.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedMembers = allMembers.filter((m) => selectedIds.has(m.id))

  // Auto-generated name from selected members (first names only, truncated at 3)
  const defaultName = useMemo(() => {
    const firstNames = selectedMembers.map((m) => m.name.split(" ")[0])
    if (firstNames.length === 0) return ""
    if (firstNames.length <= 3) return firstNames.join(", ")
    return `${firstNames.slice(0, 3).join(", ")} +${firstNames.length - 3}`
  }, [selectedMembers])

  // Effective name: custom override if typed, otherwise auto-generated
  const effectiveName = customName.trim() || defaultName

  function toggleMember(id: string) {
    if (blockedIds.has(id)) return // can't start a chat with a blocked user
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCreate() {
    const name = effectiveName.trim()
    if (!name) { setError("Please enter a chat name."); return }

    setCreating(true)
    setError(null)

    const { group, error: createErr } = await createGroup({
      name,
      type: groupType,
      memberIds: Array.from(selectedIds),
      createdBy: userId,
      ...(groupType === "church" ? { category } : {}),
    })

    if (createErr || !group) {
      setError(createErr ?? "Failed to create chat.")
      setCreating(false)
      return
    }

    // System message — first thing anyone sees in the chat
    await supabase.from("messages").insert({ group_id: group.id, sender_id: userId, content: `${userName.split(" ")[0]} created this chat`, message_type: "system" })

    onCreated({ id: group.id, name: group.name, category: groupType === "church" ? category : null })
  }

  const isDM = selectedIds.size === 1
  const isGroup = selectedIds.size >= 2
  const noMembers = selectedIds.size === 0

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--cream)] flex flex-col md:bg-black/20 md:backdrop-blur-sm md:items-center md:justify-center">
      <div className="flex flex-col w-full h-full bg-[var(--cream)] md:h-auto md:max-h-[85vh] md:max-w-[500px] md:rounded-2xl md:border md:border-[var(--line)] md:overflow-hidden">

        {/* Header — one chrome row (X + 22px title), subtitle below (mobile §2.1) */}
        <div className="flex-shrink-0 border-b border-[var(--line)]">
          <div className="flex items-center gap-3 px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 md:pt-6">
            <button
              onClick={onClose}
              className="size-9 bg-[var(--ivory)] rounded-full flex items-center justify-center hover:bg-[var(--line-2)] transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-[var(--ink)]" />
            </button>
            <h1 className="flex-1 min-w-0 truncate" style={{ fontFamily: "var(--serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.15, margin: 0 }}>
              {groupType === "church" ? "New Church Chat" : "New Chat"}
            </h1>
          </div>
          <p className="px-5 pb-4" style={{ fontSize: "13px", color: "var(--muted-text)", margin: 0 }}>
            {isDM ? `Starting a conversation with ${selectedMembers[0]?.name.split(" ")[0]}.` : "Select people to start a conversation."}
          </p>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-xl bg-[var(--plum)]/8 px-4 py-3 text-[13px] text-[var(--plum)] font-medium">
              {error}
            </div>
          )}

          {/* Section — church chats only. General / Groups / Teams. */}
          {groupType === "church" && (
            <div className="flex flex-col gap-2.5">
              <label style={{ fontSize: "10px", fontWeight: 400, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted-text)" }}>Section</label>
              <div className="flex flex-wrap gap-2">
                {CHURCH_SECTION_DEFS.map(({ key, label }) => (
                  <PocketFilterChip
                    key={key}
                    label={label}
                    active={category === key}
                    onClick={() => setCategory(key)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Chat name — adapts to selection state */}
          {noMembers && (
            // No members selected: show traditional name input (needed for church chats)
            <div className="px-4 pt-4 pb-4" style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)" }}>
              <label className="text-[10px] font-normal text-[var(--muted-text)] tracking-wider uppercase block mb-2">Chat Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder={groupType === "church" ? "e.g. Freshman Bible Study" : "e.g. Prayer Group"}
                className="w-full text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none bg-transparent"
                style={{ fontFamily: "var(--serif)", fontSize: "18px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: "1.4" }}
              />
            </div>
          )}

          {isGroup && (
            // 2+ members: show auto-name with optional edit link
            <div className="px-4 pt-4 pb-4" style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)" }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-normal text-[var(--muted-text)] tracking-wider uppercase">Chat Name</label>
                <button
                  type="button"
                  onClick={() => { setShowNameEdit((v) => !v); if (!showNameEdit) setCustomName("") }}
                  className="text-[11px] font-medium text-[var(--muted-text)] hover:text-[var(--plum)] transition-colors"
                >
                  {showNameEdit ? "Use default" : "Edit name"}
                </button>
              </div>
              {showNameEdit ? (
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={defaultName}
                  autoFocus
                  className="w-full text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none bg-transparent"
                  style={{ fontFamily: "var(--serif)", fontSize: "18px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: "1.4" }}
                />
              ) : (
                <p style={{ fontFamily: "var(--serif)", fontSize: "18px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: "1.4", color: "var(--ink)", margin: 0 }}>
                  {effectiveName}
                </p>
              )}
            </div>
          )}

          {/* Member search */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label style={{ fontSize: "10px", fontWeight: 400, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--muted-text)" }}>Add Members</label>
              {selectedMembers.length > 0 && (
                <span className="text-[12px] text-[var(--plum)] font-medium">{selectedMembers.length} selected</span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-text)]/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-10 pr-4 py-3 bg-[var(--ivory)] text-[13px] placeholder:text-[var(--faint)] text-[var(--ink)] focus:outline-none border-none transition-all"
                style={{ borderRadius: 16 }}
              />
            </div>

            {/* Selected chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    className="flex items-center gap-1.5 bg-[var(--plum)] text-white px-3 py-1.5 rounded-full text-[12px] font-medium hover:bg-[var(--plum-2)] transition-colors"
                  >
                    {m.name.split(" ")[0]}
                    <X className="w-3 h-3 opacity-70" />
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col overflow-hidden" style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)" }}>
              {filtered.length === 0 ? (
                <p className="text-center text-[13px] text-[var(--muted-text)]/50 py-8">No members found</p>
              ) : (
                filtered.map((member, idx) => {
                  const isSelected = selectedIds.has(member.id)
                  const isBlocked = blockedIds.has(member.id)
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      disabled={isBlocked}
                      className={`flex items-center gap-3 px-4 py-3 transition-all text-left ${
                        idx > 0 ? "border-t border-[var(--line-2)]" : ""
                      } ${isBlocked ? "opacity-50 cursor-not-allowed" : isSelected ? "bg-[var(--plum)]/[0.06]" : "hover:bg-[var(--cream)]"}`}
                    >
                      <MonogramChip
                        initials={getInitials(member.name)}
                        avatarUrl={member.avatar_url}
                        className="w-10 h-10 font-medium text-[12px]"
                        style={{ fontFamily: "var(--serif)", fontWeight: 600 }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-[var(--ink)]">{member.name}</p>
                        {member.graduation_year && (
                          <p className="text-[11px] text-[var(--muted-text)]">Class of {member.graduation_year}</p>
                        )}
                      </div>
                      {isBlocked ? (
                        <span className="text-[11px] font-medium text-[var(--muted-text)] uppercase tracking-wide flex-shrink-0">Blocked</span>
                      ) : (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          isSelected ? "bg-[var(--plum)] border-[var(--plum)]" : "border-[var(--dashed)]"
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Create button */}
        <div className="flex-shrink-0 bg-[var(--cream)] border-t border-[var(--line)] px-5 py-4">
          <button
            onClick={handleCreate}
            disabled={creating || !effectiveName.trim()}
            className="w-full bg-[var(--plum)] hover:bg-[var(--plum-2)] disabled:opacity-[0.45] md:disabled:opacity-50 text-white font-semibold rounded-full active:scale-[0.97] transition-[transform,background-color] duration-150 text-[15px] tracking-wide"
            style={{ minHeight: 50 }}
          >
            {creating ? "Creating…" : isDM ? `Message ${selectedMembers[0]?.name.split(" ")[0]}` : `Create Chat${selectedMembers.length > 0 ? ` · ${selectedMembers.length + 1} members` : ""}`}
          </button>
        </div>

      </div>
    </div>
  )
}

// Staged mute/pin toggle card — one shared render for the desktop + mobile
// ChatSettings bodies (identical card markup; the Save affordance differs per
// path and stays in-place). Toggles reflect the PENDING values; nothing writes.
// Desktop keeps the hairline card; phone-width drops to a borderless tonal
// --ivory card at --r-pocket (Pocket grammar) via max-md !overrides. Each row
// is one <button role="switch"> so the WHOLE row is the tap target; the visual
// switch is a presentational span. (Switch dims stay 38×22 — the shared-Switch
// size gap is flagged separately.)
function PrefToggleRow({ label, sub, on, onToggle, divider = false }: {
  label: string; sub: string; on: boolean; onToggle: () => void; divider?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", borderBottom: divider ? "1px solid var(--line-3)" : "none" }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13.5, color: "var(--ink)", fontWeight: 500 }}>{label}</p>
        <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 2 }}>{sub}</p>
      </div>
      <span aria-hidden style={{ display: "block", width: 38, height: 22, borderRadius: 999, background: on ? "var(--plum)" : "var(--dashed)", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
        <span style={{ position: "absolute", top: 2, ...(on ? { right: 2 } : { left: 2 }), width: 18, height: 18, borderRadius: 999, background: "var(--cream)" }} />
      </span>
    </button>
  )
}

function ChatPrefsCard({ pendingMuted, pendingPinned, onToggleMuted, onTogglePinned }: {
  pendingMuted: boolean; pendingPinned: boolean; onToggleMuted: () => void; onTogglePinned: () => void
}) {
  return (
    <div className="max-md:!border-0 max-md:!bg-[var(--ivory)] max-md:!rounded-[var(--r-pocket)]" style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>
      <PrefToggleRow label="Mute notifications" sub="Stay in the chat. Just stop the buzz." on={pendingMuted} onToggle={onToggleMuted} divider />
      <PrefToggleRow label="Pin to top of chats" sub="Keeps it above the fold." on={pendingPinned} onToggle={onTogglePinned} />
    </div>
  )
}

// The one leading chip for every settings row — 36px tonal circle, plum stroke
// glyph. Defined once so the settings list can't drift into three chip styles.
function SettingsRowIcon({ children }: { children: ReactNode }) {
  return (
    <span
      className="w-9 h-9 rounded-full inline-flex items-center justify-center flex-shrink-0"
      style={{ background: "var(--pocket-track)", color: "var(--plum)" }}
    >
      {children}
    </span>
  )
}

// Row VALUE for the notification mode — the word the user picked, not a sentence
// about it.
function notifyLabel(mode: ChatNotifyMode): string {
  return mode === "all" ? "All" : mode === "mentions" ? "Mentions" : "Off"
}

// ── Shared items ("Media, links & files") ────────────────────────────────────
// Same URL shape the in-chat link previews use, so the two never disagree about
// what counts as a link. SHARED_LIMIT bounds each read — a chat's history is
// unbounded and this screen is a finder, not an archive.
const SHARED_URL_RE = /https?:\/\/[^\s<>"']+/gi
const SHARED_LIMIT = 200

// Mirrors SMART_THRESHOLD in app/api/push/dispatch/route.ts (and the read-receipt
// large-room threshold, Convention #18) — the room size at which the global
// "smart" notification mode stops pushing every message. Used only to LABEL what
// the inherited setting currently resolves to; delivery is decided server-side.
const SMART_ROOM_THRESHOLD = 30

interface SharedRow {
  id: string
  content: string | null
  created_at: string
  sender_id: string
  attachment_url: string | null
  attachment_type: string | null
  attachment_name: string | null
  attachment_size: number | null
  profiles: { name: string } | { name: string }[] | null
}

interface SharedItem {
  key: string
  url: string
  name: string
  size: number | null
  sender: string
  at: string
}

export function ChatSettings({ groupId, groupName, groupType, groupArchived = false, isCentral = false, userId, userName, ministryId, userRole, onBack, onNameChange, onClose, onOpenChat }: ChatSettingsProps) {
  const supabase = createClient()
  const { mutate: mutateGlobal } = useSWRConfig()
  const openMemberProfile = useOpenMemberProfile()
  const [members, setMembers] = useState<GroupMember[]>([])
  const [displayGroupName, setDisplayGroupName] = useState(groupName)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(groupName)
  const [showAddMembers, setShowAddMembers] = useState(false)
  // Mobile only: the roster moved off the settings screen (it buried Preferences
  // and Danger zone below an unbounded list) onto its own drilled-in Members
  // screen with an All/Leaders filter + search. Desktop keeps its inline roster.
  const [showAllMembers, setShowAllMembers] = useState(false)
  const [memberFilter, setMemberFilter] = useState<"all" | "leaders">("all")
  const [memberSearch, setMemberSearch] = useState("")
  // Mobile only: "Media, links & files" — everything shared into this chat, in one
  // place (finding a flyer or a sign-up link weeks later is the recurring ask).
  const [showShared, setShowShared] = useState(false)
  // Multi-option settings push a picker screen instead of inlining chips, so the
  // settings list stays one repeated shape.
  const [showNotifyPicker, setShowNotifyPicker] = useState(false)
  const [showSectionPicker, setShowSectionPicker] = useState(false)
  const [sharedTab, setSharedTab] = useState<"media" | "files" | "links">("media")
  const [sharedLightbox, setSharedLightbox] = useState<string | null>(null)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [searchAdd, setSearchAdd] = useState("")
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([])
  // Saved baseline (mirrors the DB) + staged pending values. Toggling only edits
  // pending; nothing writes until Save (settings never apply immediately).
  const [muted, setMuted] = useState(false)
  const [pinned, setPinned] = useState(false)
  // Per-chat notification override. NULL = inherit the global mode; `muted` is
  // the DB's synced cache of (notifyMode === "off") and is written alongside it.
  const [notifyMode, setNotifyMode] = useState<ChatNotifyMode | null>(null)
  const [pendingNotifyMode, setPendingNotifyMode] = useState<ChatNotifyMode | null>(null)
  const [pendingMuted, setPendingMuted] = useState(false)
  const [pendingPinned, setPendingPinned] = useState(false)
  // Church-chat SECTION ("Presets + reassign"): baseline mirrors groups.category,
  // pendingCategory is staged like mute/pin and committed on the same Save bar.
  const [category, setCategory] = useState<ChurchSection>("general")
  const [pendingCategory, setPendingCategory] = useState<ChurchSection>("general")
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [prefError, setPrefError] = useState<string | null>(null)
  const prefsSeeded = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<"archive" | "unarchive" | "delete" | "leave" | null>(null)
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null)
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [mobileRevealMemberId, setMobileRevealMemberId] = useState<string | null>(null)
  // Nickname editor (personal group chats only). Shared model — any member may set
  // any member's nickname; writes go through the moderated server action.
  const [nicknameEditor, setNicknameEditor] = useState<{ userId: string; name: string; current: string } | null>(null)
  const [nicknameInput, setNicknameInput] = useState("")
  const [nicknameSaving, setNicknameSaving] = useState(false)
  const [nicknameError, setNicknameError] = useState<string | null>(null)
  const canNickname = groupType === "my" || groupType === "dm"

  async function submitNickname(clear: boolean) {
    if (!nicknameEditor) return
    const targetId = nicknameEditor.userId
    setNicknameSaving(true); setNicknameError(null)
    const res = clear
      ? await clearChatNickname(groupId, targetId)
      : await setChatNickname(groupId, targetId, nicknameInput)
    setNicknameSaving(false)
    if (res.error) { setNicknameError(res.error); return }
    mutateSettings()                          // refresh the members list
    mutateGlobal(["chat-roster", groupId])    // refresh ChatScreen's name seam
    setNicknameEditor(null)
  }
  // Portal-safe mount flag for the destructive-action confirm dialog (rendered to
  // document.body so a transformed content-enter ancestor can't trap position:fixed).
  const mounted = useMountedFlag()

  const isDM = groupType === "dm"
  const isMy = groupType === "my"
  const isChurch = groupType === "church"
  // The ministry-wide central chat is identified by the groups.is_central_chat
  // flag (set by the DB auto-create trigger), NOT by a name match — so renaming it
  // can never break identification, auto-enroll, or the delete/archive guards.
  const isCentralChat = isChurch && isCentral
  // Church-chat management is now "in-chat leader-or-above": a leader-tier role
  // (incl. pastor) AND membership of THIS chat — mirrors the groups/group_members
  // /messages RLS. Non-church (my) chats force manage as before.
  const isMemberOfChat = members.some((m) => m.user_id === userId)
  const churchManage = isChurch && isLeaderRole(userRole) && isMemberOfChat
  const canManage = churchManage || isMy
  // A DM is a PAIR, not a room you happen to be in — you cannot leave it, archive
  // it, delete it, rename it, or change who is in it. Leaving in particular used
  // to be offered here, and taking it deleted the leaver's group_members row:
  // they stopped receiving DM pushes, the thread vanished on their side, and the
  // other person's "does a DM exist?" lookup started minting duplicates.
  const canLeave = isMy
  const canArchive = churchManage && !groupArchived && !isCentralChat
  const canUnarchive = churchManage && groupArchived
  const canDelete = churchManage && !isCentralChat
  // The one other participant. A DM's roster is not a list — it is a person.
  const dmPartner = isDM ? members.find((m) => m.user_id !== userId) ?? null : null
  // Adding someone to a DM FORKS: the pair keeps its thread untouched and a new
  // group chat is created with both of them plus whoever was picked (iMessage's
  // model). Reuses the add-members picker; only the commit differs.
  const [forking, setForking] = useState(false)

  // SWR-cached settings load — members + this user's mute/pin prefs. Pure fetcher;
  // local state is populated via the effect below so re-opening a chat paints from cache.
  const { data: settingsData, mutate: mutateSettings } = useSWR(
    groupId ? ["group-settings", groupId] : null,
    async () => {
      const [{ data }, { data: prefData }, { data: groupRow }, { data: nicks }, { data: meProf }] = await Promise.all([
        supabase
          .from("group_members")
          .select("user_id, profiles!user_id(name, role, graduation_year, avatar_url)")
          .eq("group_id", groupId),
        supabase
          .from("group_members")
          .select("muted, pinned, notify_mode")
          .eq("group_id", groupId)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("groups")
          .select("category")
          .eq("id", groupId)
          .maybeSingle(),
        supabase
          .from("chat_nicknames")
          .select("target_user_id, nickname")
          .eq("group_id", groupId),
        // The user's GLOBAL chat-notification mode — needed to show which option
        // is actually in force when this chat has no override (notify_mode NULL).
        supabase
          .from("profiles")
          .select("notification_settings")
          .eq("id", userId)
          .maybeSingle(),
      ])
      const nickById: Record<string, string> = {}
      for (const n of (nicks ?? []) as { target_user_id: string; nickname: string }[]) nickById[n.target_user_id] = n.nickname
      const mapped: GroupMember[] = (data ?? []).map((m: {
        user_id: string
        profiles: { name: string; role: string; graduation_year: number | null; avatar_url: string | null } | { name: string; role: string; graduation_year: number | null; avatar_url: string | null }[] | null
      }) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        return {
          user_id: m.user_id,
          name: p?.name ?? "Unknown",
          nickname: nickById[m.user_id] ?? null,
          role: p?.role ?? "",
          graduation_year: p?.graduation_year ?? null,
          avatar_url: p?.avatar_url ?? null,
        }
      })
      const cat = (groupRow as { category: string | null } | null)?.category
      const category: ChurchSection = cat === "team" ? "team" : cat === "group" ? "group" : "general"
      const globalMode = ((meProf as { notification_settings: NotificationSettings | null } | null)
        ?.notification_settings?.group_mode) ?? "smart"
      return {
        members: mapped,
        pref: (prefData as { muted: boolean | null; pinned: boolean | null; notify_mode: ChatNotifyMode | null } | null) ?? null,
        category,
        globalMode,
      }
    }
  )
  const loading = !settingsData

  // What the user gets today when this chat carries no override. "smart" is
  // adaptive, so resolve it the same way the dispatcher does — all messages in
  // small rooms, mentions only once a room crosses the smart threshold.
  const inheritedNotify: ChatNotifyMode =
    settingsData?.globalMode === "off" ? "off"
      : settingsData?.globalMode === "mentions" ? "mentions"
      : settingsData?.globalMode === "all" ? "all"
      : members.length >= SMART_ROOM_THRESHOLD ? "mentions" : "all"

  // Shared-items load (mobile "Media, links & files"). Lazy — the key stays null
  // until the screen is opened, so settings never pays for it. Two bounded reads:
  // every attachment, and the messages whose body looks like it carries a URL
  // (the ilike keeps the link scan off the full history; the exact extraction is
  // the same regex the in-chat link previews use).
  const { data: sharedData } = useSWR(
    showShared && groupId ? ["chat-shared", groupId] : null,
    async () => {
      const sel = "id, content, created_at, sender_id, attachment_url, attachment_type, attachment_name, attachment_size, profiles!sender_id(name)"
      const [{ data: withFiles }, { data: withLinks }] = await Promise.all([
        supabase.from("messages").select(sel)
          .eq("group_id", groupId).eq("deleted", false)
          .not("attachment_url", "is", null)
          .order("created_at", { ascending: false }).limit(SHARED_LIMIT),
        supabase.from("messages").select(sel)
          .eq("group_id", groupId).eq("deleted", false)
          .or("content.ilike.%http://%,content.ilike.%https://%")
          .order("created_at", { ascending: false }).limit(SHARED_LIMIT),
      ])
      const senderName = (r: SharedRow) => {
        const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        return p?.name ?? "Someone"
      }
      const atts = (withFiles ?? []) as SharedRow[]
      const media: SharedItem[] = []
      const files: SharedItem[] = []
      for (const r of atts) {
        if (!r.attachment_url) continue
        const item: SharedItem = {
          key: r.id, url: r.attachment_url, name: r.attachment_name ?? "Attachment",
          size: r.attachment_size ?? null, sender: senderName(r), at: r.created_at,
        }
        ;(r.attachment_type?.startsWith("image/") ? media : files).push(item)
      }
      const links: SharedItem[] = []
      const seen = new Set<string>()
      for (const r of (withLinks ?? []) as SharedRow[]) {
        for (const url of r.content?.match(SHARED_URL_RE) ?? []) {
          if (seen.has(url)) continue
          seen.add(url)
          let host = url
          try { host = new URL(url).hostname.replace(/^www\./, "") } catch { /* keep raw */ }
          links.push({ key: `${r.id}-${url}`, url, name: host, size: null, sender: senderName(r), at: r.created_at })
        }
      }
      return { media, files, links }
    },
  )

  useEffect(() => {
    if (!settingsData) return
    // Track the saved baseline from the SWR cache on every load/revalidation.
    // Pending is seeded ONCE (first load) so a later revalidation — e.g. after a
    // member add — can't clobber staged, unsaved pref toggles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMembers(settingsData.members)
    setMuted(settingsData.pref?.muted ?? false)
    setPinned(settingsData.pref?.pinned ?? false)
    setNotifyMode(settingsData.pref?.notify_mode ?? null)
    setCategory(settingsData.category)
    if (!prefsSeeded.current) {
      prefsSeeded.current = true
      setPendingMuted(settingsData.pref?.muted ?? false)
      setPendingPinned(settingsData.pref?.pinned ?? false)
      setPendingNotifyMode(settingsData.pref?.notify_mode ?? null)
      setPendingCategory(settingsData.category)
    }
  }, [settingsData])

  async function loadAllProfiles() {
    const existingIds = new Set(members.map((m) => m.user_id))
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role, graduation_year, email, about_me, bible_verse, prayer_request, pray_for_me, avatar_url")
      .eq("ministry_id", ministryId)
      .order("name")
    setAllProfiles((data ?? []).filter((p: Profile) => !existingIds.has(p.id)))
  }

  async function handleRename() {
    if (isCentralChat) { setRenaming(false); return }
    const trimmed = newName.trim()
    if (!trimmed || trimmed === displayGroupName) { setRenaming(false); return }
    setSaving(true)
    const { error: err } = await supabase.from("groups").update({ name: trimmed }).eq("id", groupId).eq("ministry_id", ministryId)
    if (!err) {
      setDisplayGroupName(trimmed)
      onNameChange(trimmed)
      await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `Chat renamed to "${trimmed}"`, message_type: "system" })
    }
    setSaving(false)
    setRenaming(false)
  }

  // ── Chat prefs (mute/pin): stage locally, commit on Save. Member changes still
  //    persist immediately (optimistic + rollback); only prefs are staged. ──
  const canReassignSection = churchManage && !isCentralChat
  const prefsDirty = pendingMuted !== muted || pendingPinned !== pinned || pendingNotifyMode !== notifyMode || (canReassignSection && pendingCategory !== category)

  // Choosing a mode always writes an EXPLICIT per-chat value (never back to
  // NULL/inherit) and keeps `muted` in lockstep — the DB has a CHECK constraint
  // asserting muted = (notify_mode = 'off'), so the two must move together.
  function chooseNotifyMode(mode: ChatNotifyMode) {
    setPendingNotifyMode(mode)
    setPendingMuted(mode === "off")
  }

  // Patch the shared chat-list SWR cache so the list's muted/pinned indicators +
  // pinned-float + muted-badge-suppression react instantly (Convention #4), the
  // same shared key ChatScreen/ChatListPanel mutate.
  function patchChatListPref(patch: Partial<ChatGroup>) {
    mutateGlobal(
      ["chat-list", userId, ministryId],
      (cur: ChatGroup[] | undefined) => cur?.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
      { revalidate: false },
    )
  }

  function handleCancelPrefs() {
    setPendingMuted(muted)
    setPendingPinned(pinned)
    setPendingNotifyMode(notifyMode)
    setPendingCategory(category)
    setPrefError(null)
  }

  async function handleSavePrefs() {
    const mutedChanged = pendingMuted !== muted
    const notifyChanged = pendingNotifyMode !== notifyMode
    const pinnedChanged = pendingPinned !== pinned
    const categoryChanged = canReassignSection && pendingCategory !== category
    if (!mutedChanged && !notifyChanged && !pinnedChanged && !categoryChanged) return
    setSavingPrefs(true)
    setPrefError(null)
    // Per-user prefs live on group_members; the SECTION lives on groups. Patch the
    // shared chat-list cache optimistically (category re-buckets the list instantly),
    // then commit each changed store. Any failure rolls cache + pending back.
    // muted + notify_mode must move together (DB CHECK). Send BOTH whenever
    // either changed, so the row can never land half-updated.
    const memberUpdate: { muted?: boolean; pinned?: boolean; notify_mode?: ChatNotifyMode | null } = {}
    if (mutedChanged || notifyChanged) {
      memberUpdate.notify_mode = pendingNotifyMode
      memberUpdate.muted = pendingNotifyMode === "off"
    }
    if (pinnedChanged) memberUpdate.pinned = pendingPinned
    // Only the CHANGED keys go into the cache patch — a `muted: undefined` would
    // blank the cached value rather than leave it alone.
    patchChatListPref({
      ...(memberUpdate.muted !== undefined ? { muted: memberUpdate.muted } : {}),
      ...(memberUpdate.pinned !== undefined ? { pinned: memberUpdate.pinned } : {}),
      ...(categoryChanged ? { category: pendingCategory } : {}),
    })
    let err: { message: string } | null = null
    if (mutedChanged || notifyChanged || pinnedChanged) {
      const res = await supabase.from("group_members").update(memberUpdate).eq("group_id", groupId).eq("user_id", userId)
      err = res.error
    }
    if (!err && categoryChanged) {
      const res = await supabase.from("groups").update({ category: pendingCategory }).eq("id", groupId).eq("ministry_id", ministryId)
      err = res.error
    }
    if (err) {
      // Roll the cache + pending back to the saved baseline.
      patchChatListPref({ muted, pinned, category })
      setPendingMuted(muted)
      setPendingPinned(pinned)
      setPendingNotifyMode(notifyMode)
      setPendingCategory(category)
      setPrefError("Couldn't save. Please try again.")
      setSavingPrefs(false)
      return
    }
    // Post a system note for a section move (mirrors handleRename's system message).
    if (categoryChanged) {
      const label = CHURCH_SECTION_DEFS.find((s) => s.key === pendingCategory)?.label ?? "General"
      await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `Chat moved to ${label}`, message_type: "system" })
    }
    setMuted(pendingMuted)
    setPinned(pendingPinned)
    setNotifyMode(pendingNotifyMode)
    setCategory(pendingCategory)
    mutateSettings((cur) => cur ? { ...cur, pref: { muted: pendingMuted, pinned: pendingPinned, notify_mode: pendingNotifyMode }, category: pendingCategory } : cur, { revalidate: false })
    setSavingPrefs(false)
  }

  async function handleRemoveMember(memberId: string) {
    const removed = members.find((m) => m.user_id === memberId)
    const snapshot = members
    setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
    setConfirmRemoveMemberId(null)
    setMobileRevealMemberId(null)
    const { error: err } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", memberId)
    if (err) { setMembers(snapshot); return }
    await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `${userName.split(" ")[0]} removed ${removed?.name.split(" ")[0] ?? "someone"}`, message_type: "system" })
    await syncSmallGroupFromChatAction({ chatGroupId: groupId, addUserIds: [], removeUserIds: [memberId] })
    mutateSettings((cur) => cur ? { ...cur, members: cur.members.filter((m) => m.user_id !== memberId) } : cur, { revalidate: false })
  }

  // DM + people → a NEW group chat. The DM itself is never mutated: no members
  // added, no system message, no rename. Named after the other participants
  // (never yourself), like every messaging app, and renameable afterwards.
  async function handleForkToGroupChat() {
    if (!dmPartner || selectedToAdd.length === 0 || forking) return
    setForking(true)
    setError(null)
    const picked = allProfiles.filter((p) => selectedToAdd.includes(p.id))
    const firstNames = [dmPartner.name, ...picked.map((p) => p.name)].map((n) => n.split(" ")[0])
    const { group, error: err } = await createGroup({
      name: firstNames.join(", "),
      type: "my",
      memberIds: [dmPartner.user_id, ...picked.map((p) => p.id)],
      createdBy: userId,
    })
    setForking(false)
    if (err || !group) { setError(err ?? "Couldn't start the group chat. Please try again."); return }
    setSelectedToAdd([])
    setSearchAdd("")
    setShowAddMembers(false)
    // Land the user in the chat they just made. Without a navigator wired up,
    // close out to the list rather than stranding them in the DM's settings.
    if (onOpenChat) onOpenChat(group.id, group.name, "my")
    else onClose()
  }

  async function handleAddMembers() {
    if (selectedToAdd.length === 0) return
    const toAdd = allProfiles
      .filter((p) => selectedToAdd.includes(p.id))
      .map((p) => ({ user_id: p.id, name: p.name, role: p.role, graduation_year: p.graduation_year ?? null, avatar_url: p.avatar_url ?? null }))
    if (toAdd.length === 0) return
    setError(null)
    // Optimistic (Convention #4): reflect the new members + return to settings immediately.
    setMembers((prev) => [...prev, ...toAdd])
    setSelectedToAdd([])
    setSearchAdd("")
    setShowAddMembers(false)
    const { error: err } = await supabase.from("group_members").insert(toAdd.map((m) => ({ group_id: groupId, user_id: m.user_id })))
    if (err) {
      setError(err.message)
      setMembers((prev) => prev.filter((m) => !toAdd.some((a) => a.user_id === m.user_id))) // rollback
      return
    }
    // One aggregated system message (not one per person) — each insert fans out over realtime to every member.
    const addedLabel = toAdd.length === 1 ? toAdd[0].name.split(" ")[0] : `${toAdd.length} people`
    await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `${userName.split(" ")[0]} added ${addedLabel}`, message_type: "system" })
    await syncSmallGroupFromChatAction({ chatGroupId: groupId, addUserIds: toAdd.map((m) => m.user_id), removeUserIds: [] })
    mutateSettings()
  }

  async function handleLeave() {
    await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: `${userName.split(" ")[0]} left`, message_type: "system" })
    await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId)
    onClose()
  }

  async function handleArchive() {
    // Friendly pre-check — the DB trigger also hard-blocks this, but surface a
    // clean message instead of a raw Postgres exception.
    if (isCentralChat) { setError("The ministry chat can't be archived."); return }
    const { error: err } = await supabase.from("groups").update({ archived: true }).eq("id", groupId).eq("ministry_id", ministryId)
    if (err) { setError("The ministry chat can't be archived."); return }
    onClose()
  }

  async function handleUnarchive() {
    const { error: err } = await supabase.from("groups").update({ archived: false }).eq("id", groupId).eq("ministry_id", ministryId)
    if (!err) onClose()
  }

  async function handleDelete() {
    // Friendly pre-check — deleteGroup + the DB trigger also block this.
    if (isCentralChat) { setError("The ministry chat can't be deleted."); return }
    const { error: err } = await deleteGroup(groupId)
    if (err) { setError(err); return }
    onClose()
  }

  const filteredProfiles = allProfiles.filter((p) =>
    p.name.toLowerCase().includes(searchAdd.toLowerCase())
  )
  const typeLabel = isDM ? "Direct message" : isChurch ? "Church chat" : "Group chat"

  // Body-swap + extend-crumbs: a SINGLE SubpageShell renders the settings, the
  // add-members, or the members body; the trail lengthens rather than nesting a shell.
  const backToSettings = () => { setShowAddMembers(false); setSearchAdd(""); setSelectedToAdd([]) }
  // In a DM the same picker means something different — it starts a NEW chat
  // rather than growing this one — so it says so everywhere it is labelled.
  const addScreenTitle = isDM ? "New group chat" : "Add members"
  const crumbs: Crumb[] = showAddMembers
    ? [{ label: displayGroupName, onClick: onBack }, { label: "Settings", onClick: backToSettings }, { label: addScreenTitle }]
    : showAllMembers
      ? [{ label: displayGroupName, onClick: onBack }, { label: "Settings", onClick: () => { setShowAllMembers(false); setMemberSearch(""); setMemberFilter("all") } }, { label: "Members" }]
      : showShared
        ? [{ label: displayGroupName, onClick: onBack }, { label: "Settings", onClick: () => { setShowShared(false); setSharedLightbox(null) } }, { label: "Media & files" }]
        : showNotifyPicker
          ? [{ label: displayGroupName, onClick: onBack }, { label: "Settings", onClick: () => setShowNotifyPicker(false) }, { label: "Notifications" }]
          : showSectionPicker
            ? [{ label: displayGroupName, onClick: onBack }, { label: "Settings", onClick: () => setShowSectionPicker(false) }, { label: "Section" }]
            : [{ label: displayGroupName, onClick: onBack }, { label: "Settings" }]

  // Members screen (mobile) — All | Leaders, then name/nickname search.
  const visibleMembers = members.filter((m) => {
    if (memberFilter === "leaders" && !isLeaderRole((m.role ?? "").toLowerCase())) return false
    const q = memberSearch.trim().toLowerCase()
    if (!q) return true
    return (m.nickname ?? "").toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
  })

  // Mobile role tag (Pocket §4): plum "role" pill for admin/leader tier, hairline
  // "outline" for visitor, tonal "default" otherwise. Label via the same roleLabel
  // aliasing as the desktop badge (keeps the super-account "Super" alias).
  function pocketRoleVariant(role: string): "default" | "role" | "outline" {
    const r = role.toLowerCase()
    if (isChatManageRole(r)) return "role"
    if (r === "visitor") return "outline"
    return "default"
  }

  function roleBadge(role: string, size: "sm" | "md", personId?: string | null) {
    const r = role.toLowerCase()
    const isAdminTier = isChatManageRole(r)
    const isVisitor = r === "visitor"
    return (
      <span style={{
        fontSize: size === "sm" ? 9 : 11, fontWeight: 500,
        padding: size === "sm" ? "2px 6px" : "3px 10px", borderRadius: 999,
        background: isAdminTier ? "color-mix(in srgb, var(--plum) 8%, transparent)" : isVisitor ? "var(--cream)" : "var(--ivory)",
        color: isAdminTier ? "var(--plum)" : "var(--muted-text)",
        border: isVisitor ? "1px solid var(--line-2)" : "1px solid transparent",
        letterSpacing: "0.04em", textTransform: "uppercase",
      }}>
        {roleLabel(role, personId)}
      </span>
    )
  }

  return (
    <SubpageShell
      title={showAddMembers ? addScreenTitle : "Settings"}
      crumbs={crumbs}
      width="full"
      // Mobile-only chrome for the drilled-in screens: title, plus the member count
      // under it on Members. The chrome-row "+" goes through SubpageChromeActions
      // (the shell's portal slot) rather than a prop — see below.
      mobileTitle={showAllMembers ? "Members" : showShared ? "Media & files" : showNotifyPicker ? "Notifications" : showSectionPicker ? "Section" : undefined}
      mobileMeta={showAllMembers ? `${members.length} member${members.length !== 1 ? "s" : ""}` : undefined}
    >
      {/* Add-member "+" in the mobile chrome row (§3 carve-out from Convention
          #15). Portals into the shell's chrome slot, so it renders here — with
          live closures over the screen state — and lands up in the header. */}
      {showAllMembers && canManage && (
        <SubpageChromeActions>
          <button
            type="button"
            onClick={() => { setShowAllMembers(false); setShowAddMembers(true); loadAllProfiles() }}
            aria-label="Add members"
            style={{ width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", background: "none", border: "none", color: "var(--plum)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
          >
            <Plus style={{ width: 19, height: 19 }} strokeWidth={2} />
          </button>
        </SubpageChromeActions>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 mb-4 text-[13px] font-medium" style={{ background: "color-mix(in srgb, var(--plum) 8%, transparent)", color: "var(--plum)" }}>
          {error}
        </div>
      )}

      {showAddMembers ? (
        /* ── Add-members body (body-swap; single shell) ── */
        <div className="md:pt-7">
          {/* Title is owned by SubpageShell; no hand-rolled header (§4.18). */}
          <p className="mb-5" style={{ fontSize: 15, color: "var(--body)" }}>
            {isDM
              ? `Pick who to add. This starts a new group chat with you and ${dmPartner?.name.split(" ")[0] ?? "them"} — your direct message stays as it is.`
              : "Select people from your ministry to add to this chat."}
          </p>
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted-text)" }} />
            <input
              type="text"
              placeholder="Search members…"
              value={searchAdd}
              onChange={(e) => setSearchAdd(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-xl text-[13px] focus:outline-none border transition-all max-md:!bg-[var(--ivory)] max-md:!border-transparent max-md:!rounded-full"
              style={{ background: "var(--cream)", borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </div>
          {filteredProfiles.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-[13px]" style={{ color: "var(--muted-text)" }}>No members to add</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredProfiles.map((profile) => {
                const selected = selectedToAdd.includes(profile.id)
                // Mobile drops the hairline (tonal grammar): ivory at rest, the
                // plum tint alone carries the selected state.
                return (
                  <button
                    key={profile.id}
                    onClick={() => setSelectedToAdd((prev) => selected ? prev.filter((id) => id !== profile.id) : [...prev, profile.id])}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left max-md:!border-transparent max-md:!rounded-[var(--r-pocket-sm)]${selected ? "" : " max-md:!bg-[var(--ivory)]"}`}
                    style={{ background: selected ? "color-mix(in srgb, var(--plum) 6%, transparent)" : "var(--cream)", borderColor: selected ? "color-mix(in srgb, var(--plum) 20%, transparent)" : "var(--line)" }}
                  >
                    <MonogramChip initials={getInitials(profile.name)} avatarUrl={profile.avatar_url} className="w-9 h-9 font-medium text-[10px]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "var(--ink)" }}>{profile.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {profile.role && roleBadge(profile.role, "sm", profile.id)}
                        {profile.graduation_year && <span className="text-[11px]" style={{ color: "var(--muted-text)" }}>Class of {profile.graduation_year}</span>}
                      </div>
                    </div>
                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all" style={{ background: selected ? "var(--plum)" : "transparent", borderColor: selected ? "var(--plum)" : "var(--line-2)" }}>
                      {selected && <Check className="w-3 h-3" style={{ color: "var(--cream)" }} />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          {selectedToAdd.length > 0 && (
            <div className="py-4 pb-8 md:pb-5 mt-5" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px]" style={{ color: "var(--body)", margin: 0 }}>
                  <span style={{ fontWeight: 500, color: "var(--ink)" }}>{isDM ? selectedToAdd.length + 2 : selectedToAdd.length}</span> {isDM ? "people in the group" : `${selectedToAdd.length === 1 ? "person" : "people"} selected`}
                </p>
                {isDM ? (
                  <ContentActionButton label={forking ? "Creating…" : "Create group chat"} onClick={handleForkToGroupChat} disabled={forking} />
                ) : (
                  <ContentActionButton label={saving ? "Adding…" : `Add ${selectedToAdd.length} ${selectedToAdd.length === 1 ? "member" : "members"}`} onClick={handleAddMembers} disabled={saving} />
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Settings body ── */
        <>
        {/* Mobile (SubpageShell title is desktop-only, so mobile keeps its own header) */}
        <div className="md:hidden">
          {showNotifyPicker ? (
          /* ── Notifications picker ── one option per row, plum check on the one
             in force. Staged like every other pref (Convention #21); the parent's
             Save bar commits it. */
          <div className="pb-4">
            <PocketRowCard>
              {(isDM ? (["all", "off"] as const) : (["all", "mentions", "off"] as const)).map((mode, i, arr) => {
                const active = (pendingNotifyMode ?? inheritedNotify) === mode
                return (
                  <PocketRow
                    key={mode}
                    title={notifyLabel(mode)}
                    titleAccessory={active ? <Check style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} /> : undefined}
                    isLast={i === arr.length - 1}
                    onClick={() => { chooseNotifyMode(mode); setShowNotifyPicker(false) }}
                  />
                )
              })}
            </PocketRowCard>
          </div>
          ) : showSectionPicker ? (
          /* ── Section picker (church chats) ── */
          <div className="pb-4">
            <PocketRowCard>
              {CHURCH_SECTION_DEFS.map(({ key, label }, i) => (
                <PocketRow
                  key={key}
                  title={label}
                  titleAccessory={pendingCategory === key ? <Check style={{ width: 16, height: 16, color: "var(--plum)", flexShrink: 0 }} /> : undefined}
                  isLast={i === CHURCH_SECTION_DEFS.length - 1}
                  onClick={() => { setPendingCategory(key); setShowSectionPicker(false) }}
                />
              ))}
            </PocketRowCard>
          </div>
          ) : showShared ? (
          /* ── Media & files (mobile drill-in) ── */
          <SharedItemsScreen
            tab={sharedTab}
            onTab={setSharedTab}
            data={sharedData}
            onOpenImage={setSharedLightbox}
          />
          ) : showAllMembers ? (
          /* ── Members screen (mobile drill-in) ── chrome (title + count + "+")
             is owned by SubpageShell; body is filter · search · roster. */
          <div className="pb-4">
            <PocketFilterChipRow style={{ marginBottom: 12 }}>
              <PocketFilterChip label="All" active={memberFilter === "all"} onClick={() => setMemberFilter("all")} />
              <PocketFilterChip label="Leaders" active={memberFilter === "leaders"} onClick={() => setMemberFilter("leaders")} />
            </PocketFilterChipRow>
            <PocketSearchField value={memberSearch} onChange={setMemberSearch} placeholder="Search members" style={{ marginBottom: 16 }} />
            {loading ? <Spinner /> : visibleMembers.length === 0 ? (
              <EmptyState
                icon={<Users className="w-7 h-7" />}
                title="No members match"
                subtitle={memberFilter === "leaders" ? "No leaders in this chat yet. Try the All filter." : "Try a different name."}
              />
            ) : (
              <PocketRowCard>
                {visibleMembers.map((member, i) => (
                  <MobileMemberRow
                    key={member.user_id}
                    member={member}
                    isLast={i === visibleMembers.length - 1}
                    userId={userId}
                    canManage={canManage}
                    canNickname={canNickname}
                    isConfirming={confirmRemoveMemberId === member.user_id}
                    isRevealed={mobileRevealMemberId === member.user_id}
                    roleVariant={pocketRoleVariant}
                    onOpenProfile={openMemberProfile}
                    onToggleReveal={() => setMobileRevealMemberId((id) => id === member.user_id ? null : member.user_id)}
                    onStartRemove={() => { setConfirmRemoveMemberId(member.user_id); setMobileRevealMemberId(null) }}
                    onCancelRemove={() => setConfirmRemoveMemberId(null)}
                    onConfirmRemove={() => handleRemoveMember(member.user_id)}
                    onEditNickname={() => { setNicknameEditor({ userId: member.user_id, name: member.name, current: member.nickname ?? "" }); setNicknameInput(member.nickname ?? ""); setNicknameError(null) }}
                  />
                ))}
              </PocketRowCard>
            )}
          </div>
          ) : (
          <>
          <div className="flex items-center gap-3.5 mb-7" style={{ paddingTop: 4 }}>
            <MonogramChip initials={getInitials(displayGroupName)} className="w-14 h-14 font-medium text-[18px]" />
            <div className="flex-1 min-w-0">
              {renaming ? (
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(displayGroupName) } }}
                  onBlur={handleRename}
                  className="text-[19px] font-semibold bg-transparent outline-none border-none w-full"
                  style={{ color: "var(--ink)", letterSpacing: "-0.01em", borderBottom: "1px solid var(--line-2)", padding: 0 }}
                />
              ) : (
                <div className="group flex items-center gap-1.5" style={{ cursor: canManage && !isCentralChat ? "text" : "default" }} onClick={canManage && !isCentralChat ? () => { setRenaming(true); setNewName(displayGroupName) } : undefined}>
                  <h2 className="text-[19px] font-semibold truncate" style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}>{displayGroupName}</h2>
                  {canManage && !isCentralChat && <Pencil style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0 }} />}
                </div>
              )}
              {/* A DM has no meaningful member count — it is always the two of you. */}
              <p className="text-[13.5px] mt-0.5" style={{ color: "var(--muted-text)" }}>
                {isDM ? typeLabel : `${typeLabel} · ${members.length} member${members.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>

          {/* TWO sections only — ACTIONS (things you do here) and PRIVACY & SUPPORT
              (how this chat reaches you). Every row is the same long tappable
              rectangle: title + optional right-aligned VALUE + chevron, and NO
              description line. Multi-option settings push a screen rather than
              inlining chips — a settings list reads as one shape or it reads as
              noise. See mobile_design_system §4 "Settings rows". */}
          <PocketKicker label="Actions" style={{ margin: "0 4px 12px" }} />
          {loading ? <Spinner /> : (
            /* Borderless tonal rows-card (Pocket grammar): one --ivory surface at
               --r-pocket, rows divided by the --line-3 hairline. */
            <div className="mb-6" style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)", padding: "6px 18px" }}>
              {/* Obvious add-members affordance (iMessage-style) — the first row of the
                  roster, plum chip + label so it reads clearly as an action. Replaces
                  the subtle kicker "+ Add" that was easy to miss on phone. */}
              {(canManage || isDM) && (
                <button
                  type="button"
                  onClick={() => { setShowAddMembers(true); loadAllProfiles() }}
                  className="flex items-center gap-3 w-full text-left"
                  // `border: none` must come BEFORE borderBottom — the shorthand
                  // resets it, so the original order silently dropped this row's
                  // divider and left it floating away from the rest of the card.
                  style={{ padding: "13px 0", background: "transparent", border: "none", borderBottom: "1px solid var(--line-3)", WebkitTapHighlightColor: "transparent" }}
                >
                  <span className="w-9 h-9 rounded-full inline-flex items-center justify-center flex-shrink-0" style={{ background: "color-mix(in srgb, var(--plum) 10%, transparent)", color: "var(--plum)" }}>
                    <Plus style={{ width: 17, height: 17 }} strokeWidth={2.2} />
                  </span>
                  <span className="text-[15px] font-semibold" style={{ color: "var(--plum)", letterSpacing: "-0.01em" }}>
                    {isDM ? "Start a group chat" : "Add members"}
                  </span>
                </button>
              )}
              {/* A DM's "roster" is one person — show them, don't make the user
                  drill into a filterable list of two to reach a profile. */}
              {isDM ? (
                dmPartner && (
                  <>
                    <PocketRow
                      leading={<MonogramChip initials={getInitials(dmPartner.nickname ?? dmPartner.name)} avatarUrl={dmPartner.avatar_url} className="w-9 h-9 font-medium text-[10px]" />}
                      title={dmPartner.nickname ?? dmPartner.name}
                      meta={dmPartner.nickname ? dmPartner.name : undefined}
                      chevron
                      onClick={() => openMemberProfile(dmPartner.user_id)}
                    />
                    {/* Nicknames are allowed in DMs (canNickname), and their only
                        phone-width home used to be the Members roster — which a DM
                        no longer has. It gets its own settings row rather than a
                        second button crammed into the person row above. */}
                    {canNickname && (
                      <PocketRow
                        leading={<SettingsRowIcon><Pencil style={{ width: 17, height: 17 }} strokeWidth={1.7} /></SettingsRowIcon>}
                        title="Nickname"
                        meta={dmPartner.nickname ?? "None"}
                        chevron
                        onClick={() => { setNicknameEditor({ userId: dmPartner.user_id, name: dmPartner.name, current: dmPartner.nickname ?? "" }); setNicknameInput(dmPartner.nickname ?? ""); setNicknameError(null) }}
                      />
                    )}
                  </>
                )
              ) : (
                <PocketRow
                  leading={<SettingsRowIcon><Users style={{ width: 17, height: 17 }} strokeWidth={1.7} /></SettingsRowIcon>}
                  title="Members"
                  chevron
                  onClick={() => { setShowAllMembers(true); setMemberSearch(""); setMemberFilter("all") }}
                />
              )}
              <PocketRow
                leading={<SettingsRowIcon><Paperclip style={{ width: 17, height: 17 }} strokeWidth={1.7} /></SettingsRowIcon>}
                title="Media & files"
                chevron
                isLast={!canReassignSection}
                onClick={() => { setShowShared(true); setSharedTab("media") }}
              />
              {/* Church chats move between General / Groups / Teams. Staged like
                  every other pref; commits on the shared Save bar. */}
              {canReassignSection && (
                <PocketRow
                  leading={<SettingsRowIcon><Folder style={{ width: 17, height: 17 }} strokeWidth={1.7} /></SettingsRowIcon>}
                  title="Section"
                  meta={CHURCH_SECTION_DEFS.find((s) => s.key === pendingCategory)?.label}
                  chevron
                  isLast
                  onClick={() => setShowSectionPicker(true)}
                />
              )}
            </div>
          )}

          {/* Preferences — mobile (staged; commits on Save, never on toggle — the
              existing per-user pref write semantics are preserved). Pocket §4:
              mono kicker + tonal row-card with 46×28 PocketSwitch rows. */}
          {!loading && (
            <div className="mb-6">
              <PocketKicker label="Privacy & support" style={{ margin: "0 4px 12px" }} />
              <PocketRowCard>
                {/* Per-chat OVERRIDE of the global mode. The right-aligned value is
                    the mode actually in force — the inherited one until the user
                    picks, with "smart" resolved by room size. */}
                <PocketRow
                  leading={<SettingsRowIcon><BellOff style={{ width: 17, height: 17 }} strokeWidth={1.7} /></SettingsRowIcon>}
                  title="Notifications"
                  meta={notifyLabel(pendingNotifyMode ?? inheritedNotify)}
                  chevron
                  onClick={() => setShowNotifyPicker(true)}
                />
                <div className="flex items-center gap-3" style={{ padding: "13px 0" }}>
                  <SettingsRowIcon><Pin style={{ width: 17, height: 17 }} strokeWidth={1.7} /></SettingsRowIcon>
                  <p className="flex-1 min-w-0 text-[15px] font-semibold" style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}>Pin chat</p>
                  <PocketSwitch checked={pendingPinned} onChange={() => setPendingPinned((v) => !v)} ariaLabel="Pin chat" />
                </div>
              </PocketRowCard>
              {prefsDirty && (
                <div className="flex items-center gap-2 mt-3">
                  {prefError && <p className="text-[12px] mr-auto" style={{ color: "var(--danger)" }}>{prefError}</p>}
                  <div className={`flex gap-2${prefError ? "" : " ml-auto"}`}>
                    <PocketButton variant="quiet" surface="page" compact onClick={handleCancelPrefs} disabled={savingPrefs}>Cancel</PocketButton>
                    <PocketButton variant="primary" compact onClick={handleSavePrefs} disabled={savingPrefs}>{savingPrefs ? "Saving…" : "Save changes"}</PocketButton>
                  </div>
                </div>
              )}
            </div>
          )}

          {(canArchive || canUnarchive || canLeave || canDelete) && (
            <div className="flex flex-col gap-3 pb-4">
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--danger)", margin: 0 }}>Danger zone</p>
              {canArchive && <button onClick={() => setConfirmAction("archive")} className="w-full py-3.5 rounded-xl font-medium text-[13px] border" style={{ background: "var(--cream)", color: "var(--body)", borderColor: "var(--line)" }}>Archive chat</button>}
              {canUnarchive && <button onClick={() => setConfirmAction("unarchive")} className="w-full py-3.5 rounded-xl font-medium text-[13px] border" style={{ background: "var(--cream)", color: "var(--body)", borderColor: "var(--line)" }}>Unarchive chat</button>}
              {canLeave && <button onClick={() => setConfirmAction("leave")} className="w-full py-3.5 rounded-xl font-medium text-[13px] border" style={{ background: "var(--cream)", color: "var(--body)", borderColor: "var(--line)" }}>Leave chat</button>}
              {canDelete && <button onClick={() => setConfirmAction("delete")} className="w-full py-3.5 rounded-xl font-medium text-[13px]" style={{ background: "transparent", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)" }}>Delete chat</button>}
            </div>
          )}
          </>
          )}
        </div>

        {/* Desktop */}
        <div className="hidden md:block" style={{ paddingTop: 28 }}>
          {loading ? <Spinner /> : (
            <>
            {/* Hero strip — chat identity + inline rename (page title "Settings" is
                supplied by SubpageShell, so this name stays ≤ PageTitle scale). */}
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 32 }}>
              <MonogramChip initials={getInitials(displayGroupName)} className="w-[52px] h-[52px] font-medium text-[16px]" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 4 }}>{typeLabel}</p>
                {renaming ? (
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setRenaming(false); setNewName(displayGroupName) } }}
                    onBlur={handleRename}
                    style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 25, color: "var(--ink)", lineHeight: 1.1, background: "transparent", border: "none", borderBottom: "1px solid var(--line-2)", outline: "none", padding: 0 }}
                  />
                ) : (
                  <div className="group flex items-center gap-2" style={{ cursor: canManage && !isCentralChat ? "text" : "default" }} onClick={canManage && !isCentralChat ? () => { setRenaming(true); setNewName(displayGroupName) } : undefined}>
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 25, color: "var(--ink)", lineHeight: 1.1 }}>{displayGroupName}</p>
                    {canManage && !isCentralChat && <Pencil className="opacity-0 group-hover:opacity-100 transition-opacity duration-150" style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0, marginTop: 6 }} />}
                  </div>
                )}
                {/* A DM is always the two of you — the count says nothing. */}
                {!isDM && <p style={{ color: "var(--body)", fontSize: 14, marginTop: 6 }}>{members.length} {members.length === 1 ? "member" : "members"}</p>}
              </div>
            </div>

            {/* Section — church chats can be reassigned between General / Groups /
                Teams after creation (staged; commits on the shared Save bar). Locked
                for the ministry chat, same rationale as archive. Desktop uses the
                canonical exclusive-filter SegmentedControl (R4). */}
            {canReassignSection && (
              <>
                <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 12 }}>Section</p>
                <div style={{ marginBottom: 28 }}>
                  <SegmentedControl
                    aria-label="Chat section"
                    options={CHURCH_SECTION_DEFS.map(({ key, label }) => ({ id: key, label }))}
                    value={pendingCategory}
                    onChange={(v) => setPendingCategory(v as ChurchSection)}
                  />
                </div>
              </>
            )}

            {/* Preferences — staged; toggles edit pending state, committed on Save */}
            <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 12 }}>Preferences</p>
            <div style={{ marginBottom: prefsDirty ? 14 : 28 }}>
              {/* Desktop keeps the binary Mute switch (unchanged surface), but it
                  now routes through chooseNotifyMode so muted and notify_mode stay
                  in lockstep — the DB CHECK requires muted = (notify_mode='off'),
                  so a bare setPendingMuted would fail the write. */}
              <ChatPrefsCard pendingMuted={pendingMuted} pendingPinned={pendingPinned} onToggleMuted={() => chooseNotifyMode(pendingMuted ? "all" : "off")} onTogglePinned={() => setPendingPinned((v) => !v)} />
            </div>

            {/* Staged-save affordance — settings commit on Save, never on toggle */}
            {prefsDirty && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
                {prefError && <span style={{ fontSize: 12, color: "var(--danger)", marginRight: "auto" }}>{prefError}</span>}
                <div style={{ display: "flex", gap: 10, marginLeft: prefError ? 0 : "auto" }}>
                  <CentralButton variant="secondary" size="sm" onClick={handleCancelPrefs} disabled={savingPrefs}>Cancel</CentralButton>
                  <CentralButton variant="primary" size="sm" onClick={handleSavePrefs} disabled={savingPrefs}>{savingPrefs ? "Saving…" : "Save changes"}</CentralButton>
                </div>
              </div>
            )}

            {/* Members — Add lives in the ContentHeader action slot (§3.2) */}
            <div style={{ marginBottom: 12 }}>
              <ContentHeader
                label={isDM ? "Conversation with" : "Members"}
                action={(canManage || isDM) ? (
                  <ContentActionButton variant="ghost" icon={<Plus style={{ width: 14, height: 14 }} />} label={isDM ? "Start a group chat" : "Add members"} onClick={() => { setShowAddMembers(true); loadAllProfiles() }} />
                ) : undefined}
              />
            </div>
            <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>
              {/* In a DM the roster is the one other person — never a list that
                  includes you, and never removable. */}
              {(isDM ? members.filter((m) => m.user_id !== userId) : members).map((member, i, list) => {
                const isConfirming = confirmRemoveMemberId === member.user_id
                const isHovered = hoveredMemberId === member.user_id
                return (
                  <div
                    key={member.user_id}
                    onMouseEnter={() => setHoveredMemberId(member.user_id)}
                    onMouseLeave={() => setHoveredMemberId(null)}
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto auto", alignItems: "center", gap: 14, padding: "15px 20px", borderBottom: i < list.length - 1 ? "1px solid var(--line-3)" : "none", background: isConfirming ? "color-mix(in srgb, var(--danger) 8%, var(--cream))" : isHovered ? "var(--cream-2)" : "transparent", transition: "background 0.1s" }}
                  >
                    <span onClick={() => openMemberProfile(member.user_id)} style={{ cursor: "pointer", display: "inline-flex" }}>
                      <MonogramChip initials={getInitials(member.nickname ?? member.name)} avatarUrl={member.avatar_url} className="w-10 h-10 font-medium text-[11px]" />
                    </span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <p onClick={() => openMemberProfile(member.user_id)} style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500, cursor: "pointer" }}>{member.nickname ?? member.name}</p>
                        {member.user_id === userId && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--cream)", color: "var(--muted-text)", letterSpacing: "0.06em", textTransform: "uppercase" }}>You</span>}
                        {canNickname && (
                          <button
                            onClick={() => { setNicknameEditor({ userId: member.user_id, name: member.name, current: member.nickname ?? "" }); setNicknameInput(member.nickname ?? ""); setNicknameError(null) }}
                            aria-label={`Set nickname for ${member.name}`}
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted-text)", opacity: isHovered ? 1 : 0.5, transition: "opacity 0.15s" }}
                          >
                            <Pencil style={{ width: 12, height: 12 }} />
                          </button>
                        )}
                      </div>
                      {member.nickname
                        ? <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 2 }}>{member.name}{member.graduation_year ? ` · Class of ${member.graduation_year}` : ""}</p>
                        : member.graduation_year ? <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 2 }}>Class of {member.graduation_year}</p> : null}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {member.role && roleBadge(member.role, "md", member.user_id)}
                    </div>
                    {canManage && member.user_id !== userId ? (
                      isConfirming ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <button onClick={() => handleRemoveMember(member.user_id)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--danger)" }}><Check style={{ width: 14, height: 14 }} /></button>
                          <button onClick={() => setConfirmRemoveMemberId(null)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--muted-text)" }}><X style={{ width: 14, height: 14 }} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemoveMemberId(member.user_id)} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted-text)", opacity: isHovered ? 1 : 0, transition: "opacity 0.15s" }}><X style={{ width: 14, height: 14 }} /></button>
                      )
                    ) : <span />}
                  </div>
                )
              })}
            </div>
            {isChurch && canManage && (
              <p style={{ fontSize: 11, color: "var(--muted-text)", marginTop: 10, lineHeight: 1.5 }}>Member changes sync to the small group home page if this chat is linked to a group.</p>
            )}

            {isCentralChat && (
              <p className="text-[12px]" style={{ color: "var(--muted-text)", lineHeight: 1.5, marginTop: 28 }}>Your ministry&apos;s main chat. Everyone is automatically a member — it can&apos;t be renamed, archived, or deleted.</p>
            )}
            {(canArchive || canUnarchive || canLeave || canDelete) && (
              <div style={{ marginTop: 36 }}>
                <p style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 400, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--danger)", margin: "0 0 12px" }}>Danger zone</p>
                <div style={{ height: 1, background: "var(--line)", marginBottom: 16 }} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {canArchive && <button onClick={() => setConfirmAction("archive")} style={{ height: 36, padding: "0 18px", background: "transparent", border: "1px solid var(--line)", borderRadius: "var(--r-chip)", color: "var(--body)", fontSize: 14, cursor: "pointer" }}>Archive chat</button>}
                  {canUnarchive && <button onClick={() => setConfirmAction("unarchive")} style={{ height: 36, padding: "0 18px", background: "transparent", border: "1px solid var(--line)", borderRadius: "var(--r-chip)", color: "var(--body)", fontSize: 14, cursor: "pointer" }}>Unarchive chat</button>}
                  {canLeave && <button onClick={() => setConfirmAction("leave")} style={{ height: 36, padding: "0 18px", background: "transparent", border: "1px solid var(--line)", borderRadius: "var(--r-chip)", color: "var(--body)", fontSize: 14, cursor: "pointer" }}>Leave chat</button>}
                  {canDelete && <button onClick={() => setConfirmAction("delete")} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 18px", background: "transparent", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", borderRadius: "var(--r-chip)", color: "var(--danger)", fontSize: 14, cursor: "pointer" }}><Trash2 style={{ width: 14, height: 14 }} /> Delete chat</button>}
                </div>
              </div>
            )}
            </>
          )}
        </div>
        </>
      )}

      {/* Destructive-action confirm — top-layer portal (transform-safe), matching
          the team-settings migration's delete dialog. */}
      {mounted && confirmAction && createPortal(
        <CentralModal
          onClose={() => setConfirmAction(null)}
          eyebrow={confirmAction === "delete" || confirmAction === "leave" ? "Danger zone" : "Confirm"}
          title={confirmAction === "archive" ? "Archive this chat?" : confirmAction === "unarchive" ? "Unarchive this chat?" : confirmAction === "leave" ? "Leave this chat?" : "Delete this chat?"}
          maxWidth={420}
          footer={
            <>
              <CentralButton variant="secondary" size="md" onClick={() => setConfirmAction(null)}>Cancel</CentralButton>
              <CentralButton
                variant={confirmAction === "unarchive" ? "primary" : "danger-solid"}
                size="md"
                onClick={() => { const a = confirmAction; setConfirmAction(null); if (a === "archive") handleArchive(); else if (a === "unarchive") handleUnarchive(); else if (a === "leave") handleLeave(); else handleDelete() }}
              >
                {confirmAction === "archive" ? "Archive" : confirmAction === "unarchive" ? "Unarchive" : confirmAction === "leave" ? "Leave" : "Delete"}
              </CentralButton>
            </>
          }
        >
          <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.5, margin: 0 }}>
            {confirmAction === "archive" ? "Members won't be able to send new messages." : confirmAction === "unarchive" ? "Members will be able to send messages again." : confirmAction === "leave" ? "You'll stop receiving its messages." : "This chat and all its messages will be permanently removed. This can't be undone."}
          </p>
        </CentralModal>,
        document.body
      )}

      {/* Nickname editor (personal group chats). Shared model — any member sets any
          member's nickname; the write is moderated server-side. */}
      {mounted && nicknameEditor && createPortal(
        <CentralModal
          onClose={() => setNicknameEditor(null)}
          eyebrow="Nickname"
          title={`Nickname for ${nicknameEditor.name}`}
          maxWidth={420}
          sheet
          footer={
            <>
              {nicknameEditor.current
                ? <CentralButton variant="quiet" size="md" onClick={() => submitNickname(true)} disabled={nicknameSaving}>Remove</CentralButton>
                : null}
              <CentralButton variant="secondary" size="md" onClick={() => setNicknameEditor(null)}>Cancel</CentralButton>
              <CentralButton variant="primary" size="md" onClick={() => submitNickname(false)} disabled={nicknameSaving || !nicknameInput.trim()}>Save</CentralButton>
            </>
          }
        >
          <input
            autoFocus
            value={nicknameInput}
            onChange={(e) => { setNicknameInput(e.target.value.slice(0, MAX_NICKNAME_LEN)); setNicknameError(null) }}
            onKeyDown={(e) => { if (e.key === "Enter" && nicknameInput.trim() && !nicknameSaving) submitNickname(false) }}
            placeholder={nicknameEditor.name}
            maxLength={MAX_NICKNAME_LEN}
            style={{ width: "100%", height: 44, padding: "0 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--cream)", color: "var(--ink)", fontSize: 15, outline: "none" }}
          />
          <p style={{ fontSize: 12, color: "var(--muted-text)", margin: "10px 0 0", lineHeight: 1.5 }}>
            Everyone in this chat sees this in place of {nicknameEditor.name}. {nicknameInput.length}/{MAX_NICKNAME_LEN}
          </p>
          {nicknameError && <p style={{ fontSize: 13, color: "var(--danger)", margin: "8px 0 0" }}>{nicknameError}</p>}
        </CentralModal>,
        document.body
      )}

      {/* Shared-media lightbox — same treatment as the in-chat one (tap anywhere
          to dismiss), portaled so the subpage's scroll container can't clip it. */}
      {mounted && sharedLightbox && createPortal(
        <div className="fixed inset-0 z-[300] bg-black/92 flex items-center justify-center" onClick={() => setSharedLightbox(null)}>
          <button
            className="absolute top-[max(env(safe-area-inset-top),1rem)] right-4 w-10 h-10 rounded-full bg-[var(--cream-panel)]/10 flex items-center justify-center text-white"
            onClick={() => setSharedLightbox(null)}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <img src={sharedLightbox} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body
      )}
    </SubpageShell>
  )
}

// "Media, links & files" body (mobile). Three exclusive tabs → Pocket fchips
// (§3: ≤3 exclusive options stay chips). Media is a 3-col thumbnail grid; files
// and links are row-cards. The chrome (back + title) is owned by SubpageShell.
function SharedItemsScreen({ tab, onTab, data, onOpenImage }: {
  tab: "media" | "files" | "links"
  onTab: (t: "media" | "files" | "links") => void
  data: { media: SharedItem[]; files: SharedItem[]; links: SharedItem[] } | undefined
  onOpenImage: (url: string) => void
}) {
  const items = data ? data[tab] : []
  const emptyCopy: Record<typeof tab, { title: string; subtitle: string }> = {
    media: { title: "No photos yet", subtitle: "Photos and GIFs shared in this chat collect here." },
    files: { title: "No files yet", subtitle: "Documents shared in this chat collect here." },
    links: { title: "No links yet", subtitle: "Links anyone sends in this chat collect here." },
  }
  return (
    <div className="pb-4">
      <PocketFilterChipRow style={{ marginBottom: 16 }}>
        <PocketFilterChip label="Media" active={tab === "media"} onClick={() => onTab("media")} />
        <PocketFilterChip label="Files" active={tab === "files"} onClick={() => onTab("files")} />
        <PocketFilterChip label="Links" active={tab === "links"} onClick={() => onTab("links")} />
      </PocketFilterChipRow>

      {!data ? <Spinner /> : items.length === 0 ? (
        <EmptyState
          icon={tab === "media" ? <ImageIcon className="w-7 h-7" /> : tab === "files" ? <FileDown className="w-7 h-7" /> : <LinkIcon className="w-7 h-7" />}
          title={emptyCopy[tab].title}
          subtitle={emptyCopy[tab].subtitle}
        />
      ) : tab === "media" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {items.map((it) => (
            <button
              key={it.key}
              onClick={() => onOpenImage(it.url)}
              aria-label={`Open ${it.name}`}
              style={{ aspectRatio: "1", borderRadius: 12, overflow: "hidden", border: "none", padding: 0, background: "var(--ivory)", cursor: "pointer" }}
            >
              <img src={it.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
          ))}
        </div>
      ) : (
        <PocketRowCard>
          {items.map((it, i) => (
            <PocketRow
              key={it.key}
              leading={
                <span className="w-9 h-9 rounded-full inline-flex items-center justify-center flex-shrink-0" style={{ background: "var(--pocket-track)", color: "var(--plum)" }}>
                  {tab === "files" ? <FileDown style={{ width: 16, height: 16 }} strokeWidth={1.7} /> : <LinkIcon style={{ width: 16, height: 16 }} strokeWidth={1.7} />}
                </span>
              }
              title={it.name}
              sub={tab === "files" && it.size ? `${it.sender} · ${formatFileSize(it.size)}` : `${it.sender} · ${formatRelativeTime(it.at)}`}
              isLast={i === items.length - 1}
              onClick={() => window.open(it.url, "_blank", "noopener,noreferrer")}
            />
          ))}
        </PocketRowCard>
      )}
    </div>
  )
}

// One roster row on the mobile Members screen. Extracted from the settings body
// when the roster moved onto its own screen — same affordances as before: tap the
// avatar/name for the member profile, tap the row to reveal remove (managers only,
// never on yourself), pencil for a per-chat nickname.
function MobileMemberRow({
  member, isLast, userId, canManage, canNickname, isConfirming, isRevealed, roleVariant,
  onOpenProfile, onToggleReveal, onStartRemove, onCancelRemove, onConfirmRemove, onEditNickname,
}: {
  member: GroupMember
  isLast: boolean
  userId: string
  canManage: boolean
  canNickname: boolean
  isConfirming: boolean
  isRevealed: boolean
  roleVariant: (role: string) => "default" | "role" | "outline"
  onOpenProfile: (id: string) => void
  onToggleReveal: () => void
  onStartRemove: () => void
  onCancelRemove: () => void
  onConfirmRemove: () => void
  onEditNickname: () => void
}) {
  const isSelf = member.user_id === userId
  return (
    <div
      className="flex items-center gap-3"
      style={{ padding: "13px 0", borderBottom: isLast ? "none" : "1px solid var(--line-3)", background: isConfirming ? "color-mix(in srgb, var(--danger) 8%, var(--ivory))" : "transparent", transition: "background 0.1s" }}
      onClick={() => { if (canManage && !isSelf && !isConfirming) onToggleReveal() }}
    >
      <span onClick={(e) => { e.stopPropagation(); onOpenProfile(member.user_id) }} style={{ cursor: "pointer", display: "inline-flex", flexShrink: 0 }}>
        <MonogramChip initials={getInitials(member.nickname ?? member.name)} avatarUrl={member.avatar_url} className="w-9 h-9 font-medium text-[10px]" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p onClick={(e) => { e.stopPropagation(); onOpenProfile(member.user_id) }} className="text-[15px] font-semibold truncate cursor-pointer" style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}>{member.nickname ?? member.name}</p>
          {isSelf && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "color-mix(in srgb, var(--plum) 8%, transparent)", color: "var(--plum)" }}>You</span>}
          {canNickname && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditNickname() }}
              aria-label={`Set nickname for ${member.name}`}
              className="flex-shrink-0"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted-text)" }}
            >
              <Pencil style={{ width: 13, height: 13 }} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {member.nickname && <span className="text-[11px]" style={{ color: "var(--muted-text)" }}>{member.name}</span>}
          {member.role && <PocketTag label={roleLabel(member.role, member.user_id)} variant={roleVariant(member.role)} />}
          {member.graduation_year && <span className="text-[11px]" style={{ color: "var(--muted-text)" }}>Class of {member.graduation_year}</span>}
        </div>
      </div>
      {canManage && !isSelf && (
        isConfirming ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            <button onClick={(e) => { e.stopPropagation(); onConfirmRemove() }} aria-label={`Remove ${member.name}`} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--danger)" }}><Check className="w-4 h-4" /></button>
            <button onClick={(e) => { e.stopPropagation(); onCancelRemove() }} aria-label="Cancel remove" style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "var(--muted-text)" }}><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onStartRemove() }}
            aria-label={`Remove ${member.name}`}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, color: "var(--muted-text)", opacity: isRevealed ? 1 : 0, transition: "opacity 0.15s", pointerEvents: isRevealed ? "auto" : "none" }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        )
      )}
    </div>
  )
}

// Shared message select — used by the initial newest-50 load and the load-older
// keyset page so both build identical enriched Message rows.
const MESSAGE_SELECT = "id, group_id, sender_id, content, created_at, reply_to_id, message_type, is_edited, deleted, attachment_url, attachment_type, attachment_name, attachment_size, poll_id, profiles!sender_id(name, avatar_url), reply_to:reply_to_id(id, content, attachment_type, attachment_name, profiles!sender_id(name))"

// Two adjacent messages render as one visual group when they're from the same
// sender within a minute (never for system/poll rows).
const sameMinute = (a: Message, b: Message) =>
  a.message_type !== "system" && b.message_type !== "system" &&
  a.message_type !== "poll" && b.message_type !== "poll" &&
  a.sender_id === b.sender_id &&
  Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 60000

// How long read progress may sit unwritten while a thread is open. Short enough
// that a background tab-switch still lands quickly, long enough that a fast
// conversation collapses into one write instead of one per message.
const READ_COALESCE_MS = 4000

export function ChatScreen({ groupId, groupName, userId, userName, ministryId, ministryName, userRole, onClose, onRead, onNameChange, inline = false, draftRecipient = null, onDmCreated, onOpenChat }: ChatScreenProps) {
  // Draft DM (no group yet). Guards the create so a double-tap on Send can't
  // race two groups into existence.
  const creatingDraftRef = useRef(false)
  const supabase = createClient()
  const { mutate: mutateGlobal } = useSWRConfig()

  // Optimistic chat-list patch for the sender's OWN message: move this group to the
  // top, refresh its preview/timestamp to now, never add an unread (the sender is
  // reading it). Patches the SAME shared key the sidebar reads, so the row jumps
  // instantly with no round-trip. The home-app realtime refetch later reconciles
  // from get_chat_list (and re-forces this open group to 0).
  const bumpChatListForOwnSend = useCallback((previewText: string) => {
    mutateGlobal(
      ["chat-list", userId, ministryId],
      (cur: ChatGroup[] | undefined) => {
        if (!cur) return cur
        const idx = cur.findIndex((g) => g.id === groupId)
        if (idx === -1) return cur
        const moved: ChatGroup = {
          ...cur[idx],
          last_message: previewText,
          last_sender: userName,
          last_message_time: new Date().toISOString(),
          unread_count: cur[idx].unread_count, // own send adds no unread
        }
        return [moved, ...cur.filter((g) => g.id !== groupId)]
      },
      { revalidate: false },
    )
  }, [mutateGlobal, userId, ministryId, groupId, userName])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [displayName, setDisplayName] = useState(groupName)
  // Re-seed the header name whenever the groupName prop changes (chat switch through
  // a path that reuses this instance, or the async name backfill in home-app). The
  // rename flow still calls setDisplayName directly; this only mirrors the prop.
  useEffect(() => { setDisplayName(groupName) }, [groupName])
  const [groupType, setGroupType] = useState("")
  const [groupArchived, setGroupArchived] = useState(false)
  // Central (ministry-wide) chat flag — sourced from groups.is_central_chat, not a
  // name match. Drives moderation scope + the ChatSettings central-chat gates.
  const [groupIsCentral, setGroupIsCentral] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({})
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)
  const [fullReactionPickerFor, setFullReactionPickerFor] = useState<string | null>(null)
  const [contextMenuFor, setContextMenuFor] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editOriginalText, setEditOriginalText] = useState("")
  const [reportingMsg, setReportingMsg] = useState<Message | null>(null)
  // Own block list — hide blocked senders' messages (initial render + realtime).
  const { blockedIds, mutate: mutateBlocks } = useBlocks(userId)
  const [forwardingMsg, setForwardingMsg] = useState<Message | null>(null)
  const [forwardGroups, setForwardGroups] = useState<{ id: string; name: string }[]>([])
  const [forwardSentTo, setForwardSentTo] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; avatarUrl: string | null }>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const profilesCache = useRef<Record<string, string>>({ [userId]: userName })
  const avatarCache = useRef<Record<string, string | null>>({})
  const messagesRef = useRef<Message[]>([])
  const reactionsRef = useRef<Record<string, Reaction[]>>({})
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFiredRef = useRef(false)
  const [memberReadMap, setMemberReadMap] = useState<Record<string, { name: string; lastReadAt: string | null; avatarUrl: string | null }>>({})
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const myTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchMatchIndex, setSearchMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null)
  const [pinnedMessage, setPinnedMessage] = useState<{ id: string; content: string; sender_name: string; attachment_url?: string | null; attachment_type?: string | null; attachment_name?: string | null } | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // SWR-cached group roster — the SINGLE source for @mention names, member count,
  // and (small-room) seed read state. Read-only lookup, pure fetcher. Replaces the
  // old @mention-only join AND the standalone loadMemberReadStates fetch.
  const { data: rosterData, mutate: mutateRoster } = useSWR(
    groupId ? ["chat-roster", groupId] : null,
    async () => {
      // Members + this chat's nicknames in one pass. displayName = nickname ?? name
      // is the single value every name render reads (Convention #18 roster seam).
      const [{ data }, { data: nicks }] = await Promise.all([
        supabase
          .from("group_members")
          // deleted_at rides along so a deleted account still RESOLVES here (it
          // keeps its membership so its messages stay attributable — see
          // app/actions/delete-account.ts) while being excluded from anything
          // that treats a member as reachable, like @mentions.
          .select("user_id, last_read_at, profiles!user_id(name, avatar_url, deleted_at)")
          .eq("group_id", groupId),
        supabase
          .from("chat_nicknames")
          .select("target_user_id, nickname")
          .eq("group_id", groupId),
      ])
      const nickById: Record<string, string | undefined> = {}
      for (const n of (nicks ?? []) as { target_user_id: string; nickname: string }[]) nickById[n.target_user_id] = n.nickname
      return (data ?? [])
        .map((m: { user_id: string; last_read_at: string | null; profiles: { name: string; avatar_url: string | null; deleted_at: string | null } | { name: string; avatar_url: string | null; deleted_at: string | null }[] | null }) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
          if (!p) return null
          const deleted = !!p.deleted_at
          // A deleted account keeps no nickname identity — it is "Former member"
          // (the scrubbed profiles.name) to everyone, whatever it was called before.
          const nickname: string | null = deleted ? null : (nickById[m.user_id] ?? null)
          return { id: m.user_id, name: p.name, nickname, displayName: nickname ?? p.name, avatarUrl: deleted ? null : (p.avatar_url ?? null), lastReadAt: m.last_read_at ?? null, deleted }
        })
        .filter((m): m is { id: string; name: string; nickname: string | null; displayName: string; avatarUrl: string | null; lastReadAt: string | null; deleted: boolean } => m !== null)
    }
  )
  const roster = useMemo(() => rosterData ?? [], [rosterData])
  const rosterLoaded = rosterData !== undefined
  // Deleted accounts stay in `roster` (so their messages and the DM title still
  // resolve to "Former member") but are NOT mentionable — there is nobody left to
  // notify, and offering "@Former member" in the autocomplete is nonsense.
  const mentionMembers = useMemo(() => roster.filter(m => m.id !== userId && !m.deleted), [roster, userId])
  // senderId → nickname-aware display name; drives message senders, typing, header.
  const displayNameById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const m of roster) map[m.id] = m.displayName
    return map
  }, [roster])
  const memberCount = roster.length
  // Threshold switch (Brian's product decision): rooms ≥30 members drop the live
  // per-member read-receipt fan-out (the O(members²) source) for an on-demand
  // "Seen by N" pill; <30 keep today's live per-member receipts exactly.
  const isLargeRoom = memberCount >= 30
  // Seed the sender name/avatar caches from the roster SWR (already fetched for
  // @mentions + read state) so incoming realtime messages from any current member
  // hit the cache — zero per-message profile queries on the common path. The
  // one-off profiles fetch in the INSERT handler stays only as a fallback for
  // non-roster senders (e.g. departed members no longer in group_members).
  useEffect(() => {
    for (const m of roster) {
      profilesCache.current[m.id] = m.displayName
      avatarCache.current[m.id] = m.avatarUrl
    }
  }, [roster])
  // Polls
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [pollQuestion, setPollQuestion] = useState("")
  const [pollOptions, setPollOptions] = useState(["", ""])
  const [pollsData, setPollsData] = useState<Record<string, { question: string; options: string[] }>>({})
  const [pollVotes, setPollVotes] = useState<Record<string, number>>({}) // poll_id → option_index user voted (-1 = none)
  const [pollCounts, setPollCounts] = useState<Record<string, number[]>>({}) // poll_id → counts per option
  const [changingVotePollIds, setChangingVotePollIds] = useState<Set<string>>(new Set())
  const [votingPollId, setVotingPollId] = useState<string | null>(null)
  const [pendingVoteOption, setPendingVoteOption] = useState<number | "unvote" | undefined>(undefined)
  const [pollMenuFor, setPollMenuFor] = useState<string | null>(null)
  const [pollVoters, setPollVoters] = useState<Record<string, { option_index: number; user_id: string; name: string; avatar_url: string | null }[]>>({})
  const [votersPollId, setVotersPollId] = useState<string | null>(null)
  const prevMsgCountRef = useRef(0)
  const suppressScrollRef = useRef(false)
  // Upward (older-message) pagination — keyset cursor is the oldest loaded message.
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [hasMore, setHasMore] = useState(true)
  const loadingOlderRef = useRef(false)
  const lastTypingSentRef = useRef(0)
  // On-demand "Seen by N" (large rooms only): point-in-time, never live.
  const [seenByCount, setSeenByCount] = useState<number | null>(null)
  const [seenByOpen, setSeenByOpen] = useState(false)
  const [seenByList, setSeenByList] = useState<{ name: string; avatarUrl: string | null }[] | null>(null)
  // Departed members — show "left" indicator on their messages.
  // SWR-cached ministry-scoped lookup, pure fetcher; derived to a Set below.
  const { data: departuresData } = useSWR(
    ministryId ? ["ministry-departures", ministryId] : null,
    async () => {
      const { data } = await supabase
        .from("ministry_departures")
        .select("user_id")
        .eq("ministry_id", ministryId)
      return (data ?? []).map((d: { user_id: string }) => d.user_id)
    }
  )
  const departedIds = useMemo(() => new Set(departuresData ?? []), [departuresData])
  // SWR-cached group meta — type/archived/pinned_message_id. Pure fetcher; local
  // state (incl. the pinned-message lookup) is populated via the effect below.
  // pinned_message_id is mutated by pin/unpin handlers, which sync this cache.
  const { data: groupMeta, mutate: mutateGroupMeta } = useSWR(
    groupId ? ["group-meta", groupId] : null,
    async () => {
      const { data } = await supabase
        .from("groups")
        .select("type, archived, pinned_message_id, is_central_chat")
        .eq("id", groupId)
        .single()
      return (data as { type: string; archived: boolean | null; pinned_message_id: string | null; is_central_chat: boolean | null } | null) ?? null
    }
  )
  // Chat moderation config — ministry-scoped, SWR-cached. Falls back to defaults
  // (disabled) until loaded, so existing chat behavior is preserved.
  const { data: modSettings } = useSWR(
    ministryId ? ["moderation-settings", ministryId] : null,
    async () => {
      const { data } = await supabase.from("ministries").select("moderation_settings").eq("id", ministryId).maybeSingle()
      return { ...MODERATION_DEFAULTS, ...(data?.moderation_settings ?? {}) } as ModerationSettings
    }
  )
  // Room scope context (mirrors the settings' isCentralChat / group-type logic).
  const modIsChurch = groupType === "church"
  const modIsPersonal = groupType === "my" || groupType === "dm"
  const modIsMinistryDefault = modIsChurch && groupIsCentral
  // Transient "your message was filtered" banner; auto-dismisses.
  const [moderationWarning, setModerationWarning] = useState<string | null>(null)
  useEffect(() => {
    if (!moderationWarning) return
    const t = setTimeout(() => setModerationWarning(null), 4000)
    return () => clearTimeout(t)
  }, [moderationWarning])

  // Link previews
  const [linkPreviews, setLinkPreviews] = useState<Record<string, LinkPreviewData>>({})

  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase().trim()
    return messages
      .filter(m => !m.deleted && m.content.toLowerCase().includes(q))
      .map(m => m.id)
  }, [messages, searchQuery])

  // Church-chat moderation (delete others' messages/polls, pin) is now "in-chat
  // leader-or-above": a leader-tier role (incl. pastor) AND membership of THIS chat,
  // mirroring the messages/groups RLS. My/DM behavior is UNCHANGED (isChatManageRole).
  const isMemberOfChat = roster.some((m) => m.id === userId)
  const canModerate = groupType === "church" ? (isLeaderRole(userRole) && isMemberOfChat) : isChatManageRole(userRole)
  const canPin = !groupArchived && (groupType !== "church" ? true : (isLeaderRole(userRole) && isMemberOfChat))

  // @mention member list is loaded via useSWR above (see rosterData/mentionMembers).
  // The @mention dropdown, GIF picker, and input state now live in <Composer>.

  // Fetch link previews for URLs found in messages
  useEffect(() => {
    const urlRe = /https?:\/\/[^\s<>"']+/gi
    const toFetch: string[] = []
    for (const msg of messages) {
      if (!msg.content || msg.message_type === "system" || msg.message_type === "poll") continue
      const found = msg.content.match(urlRe)
      if (!found) continue
      for (const url of found) {
        if (!linkPreviews[url]) toFetch.push(url)
      }
    }
    if (toFetch.length === 0) return
    // Mark as loading to prevent duplicate fetches
    setLinkPreviews(prev => {
      const next = { ...prev }
      for (const url of toFetch) if (!next[url]) next[url] = { title: null, description: null, image: null, hostname: new URL(url).hostname.replace(/^www\./, ""), url }
      return next
    })
    for (const url of toFetch) {
      fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && !d.error) setLinkPreviews(prev => ({ ...prev, [url]: d })) })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  // Group consecutive vote receipt system messages within 2 minutes into one row
  const processedMessages = useMemo((): ProcessedMessage[] => {
    const result: ProcessedMessage[] = []
    const skip = new Set<string>()
    // Blocked-user filter (§1.2): drop messages from senders the current user has
    // blocked. Covers initial-load render AND realtime INSERTs (both flow through
    // `messages` state). Silent to the blocked party.
    const visible = blockedIds.size === 0
      ? messages
      : messages.filter((m) => !m.sender_id || !blockedIds.has(m.sender_id))
    for (let i = 0; i < visible.length; i++) {
      const msg = visible[i]
      if (skip.has(msg.id)) continue
      const isVoteR = msg.message_type === "system" && / voted for "/.test(msg.content)
      if (!isVoteR) { result.push(msg); continue }
      const group = [msg]
      for (let j = i + 1; j < visible.length; j++) {
        const next = visible[j]
        if (next.message_type === "system" && / voted for "/.test(next.content) &&
            Math.abs(new Date(next.created_at).getTime() - new Date(msg.created_at).getTime()) < 120000) {
          group.push(next)
          skip.add(next.id)
        } else break
      }
      const voters = group.map(m => m.content.split(' voted for "')[0])
      result.push({ ...msg, _voteGroup: voters })
    }
    // Resolve nickname-aware sender names — reactive to nickname changes, and
    // covers messages whose stored sender_name predates a nickname.
    return result.map((m) => {
      const dn = m.sender_id ? displayNameById[m.sender_id] : undefined
      return dn && dn !== m.sender_name ? { ...m, sender_name: dn } : m
    })
  }, [messages, blockedIds, displayNameById])

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" })
  }, [])

  const scrollToMessage = useCallback((id: string) => {
    messageRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [])

  // Registers each row's root element so search / reply-jump / pinned-banner
  // scrollIntoView keep working. Stable identity — safe for the memoized rows.
  const registerMessageRef = useCallback((id: string, el: HTMLDivElement | null) => {
    messageRefs.current[id] = el
  }, [])

  // Convention #7: < 400ms tap = emoji picker, ≥ 400ms long-press = context menu.
  // Timer + fired flag stay here in ChatScreen; rows call these with their msg.
  const handlePointerDown = useCallback((msg: Message) => {
    if (msg.deleted) return
    longPressFiredRef.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true
      longPressTimer.current = null
      setContextMenuFor(msg.id)
    }, 400)
  }, [])

  const handlePointerUp = useCallback((msg: Message) => {
    if (msg.deleted) return
    if (longPressTimer.current !== null) {
      // Timer still pending — this is a short tap
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
      if (msg.attachment_url) {
        // Attachment: short tap opens it (image → lightbox, file → new tab)
        if (msg.attachment_type?.startsWith("image/")) {
          setLightboxUrl(msg.attachment_url)
        } else {
          window.open(msg.attachment_url, "_blank", "noopener,noreferrer")
        }
      } else {
        // Text message: short tap opens the emoji picker
        setEmojiPickerFor((prev) => (prev === msg.id ? null : msg.id))
      }
    }
    // If timer already fired (long press), do nothing here
  }, [])

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleDeleteMessage = useCallback(async (msgId: string) => {
    setDeletingId(null)
    setContextMenuFor(null)
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, deleted: true, content: "", attachment_url: null, attachment_type: null, attachment_name: null, attachment_size: null } : m))
    setReactions((prev) => { const next = { ...prev }; delete next[msgId]; return next })
    await supabase.from("messages").update({ deleted: true, content: "", attachment_url: null, attachment_type: null, attachment_name: null, attachment_size: null }).eq("id", msgId).eq("sender_id", userId)
    await supabase.from("message_reactions").delete().eq("message_id", msgId)
  }, [supabase, userId])

  const handleDeletePoll = useCallback(async (msgId: string, pollId: string) => {
    setPollMenuFor(null)
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, deleted: true, poll_id: null } : m))
    // Delete message before poll — messages.poll_id FK prevents deleting poll while message exists
    await supabase.from("poll_votes").delete().eq("poll_id", pollId)
    await supabase.from("messages").delete().eq("id", msgId)
    await supabase.from("polls").delete().eq("id", pollId)
  }, [supabase])

  // Edit state is read through a ref (synced below) so this callback stays
  // referentially stable while the user types in the edit textarea — otherwise
  // every edit keystroke would change onSaveEdit and re-render all rows.
  const editStateRef = useRef({ editText: "", editingId: null as string | null, editOriginalText: "" })
  useEffect(() => {
    editStateRef.current = { editText, editingId, editOriginalText }
  }, [editText, editingId, editOriginalText])

  const handleEditMessage = useCallback(async () => {
    const { editText: currentText, editingId: id, editOriginalText: originalText } = editStateRef.current
    const trimmed = currentText.trim()
    if (!trimmed || !id) return
    setEditingId(null)
    setEditText("")
    setEditOriginalText("")
    if (trimmed === originalText.trim()) return
    suppressScrollRef.current = true
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content: trimmed, is_edited: true } : m))
    await supabase.from("messages").update({ content: trimmed, is_edited: true, edited_at: new Date().toISOString() }).eq("id", id).eq("sender_id", userId)
  }, [supabase, userId])

  const startEdit = useCallback((msg: Message) => {
    setContextMenuFor(null)
    setEditingId(msg.id)
    setEditText(msg.content)
    setEditOriginalText(msg.content)
  }, [])

  async function handleForward(targetGroupId: string) {
    if (!forwardingMsg) return
    setForwardSentTo(targetGroupId)
    await supabase.from("messages").insert({
      group_id: targetGroupId, sender_id: userId,
      content: forwardingMsg.content, message_type: "forwarded",
      attachment_url: forwardingMsg.attachment_url ?? null,
      attachment_type: forwardingMsg.attachment_type ?? null,
      attachment_name: forwardingMsg.attachment_name ?? null,
      attachment_size: forwardingMsg.attachment_size ?? null,
    })
    setTimeout(() => { setForwardingMsg(null); setForwardSentTo(null) }, 1000)
  }

  const openForwardSheet = useCallback(async (msg: Message) => {
    setForwardingMsg(msg)
    setContextMenuFor(null)
    setForwardSentTo(null)
    const { data } = await supabase.from("group_members").select("group_id, groups!group_id(id, name)").eq("user_id", userId)
    const groups = (data ?? [])
      .map((r: { group_id: string; groups: { id: string; name: string } | { id: string; name: string }[] | null }) => {
        const g = Array.isArray(r.groups) ? r.groups[0] : r.groups
        return g ? { id: g.id, name: g.name } : null
      })
      .filter((g): g is { id: string; name: string } => g !== null && g.id !== groupId)
    setForwardGroups(groups)
  }, [supabase, userId, groupId])

  const handlePin = useCallback(async (msgId: string) => {
    setContextMenuFor(null)
    // Read messages through the ref (kept in sync below) so this callback stays
    // referentially stable — reads are event-time-fresh.
    const msg = messagesRef.current.find(m => m.id === msgId)
    setPinnedMessageId(msgId)
    if (msg) setPinnedMessage({ id: msg.id, content: msg.content, sender_name: msg.sender_name, attachment_url: msg.attachment_url ?? null, attachment_type: msg.attachment_type ?? null, attachment_name: msg.attachment_name ?? null })
    await supabase.from("groups").update({ pinned_message_id: msgId }).eq("id", groupId).eq("ministry_id", ministryId)
    // Keep the SWR group-meta cache in sync so the pinned state survives re-open.
    mutateGroupMeta((cur) => cur ? { ...cur, pinned_message_id: msgId } : cur, { revalidate: false })
  }, [supabase, groupId, ministryId, mutateGroupMeta])

  const handleUnpin = useCallback(async () => {
    setPinnedMessageId(null)
    setPinnedMessage(null)
    await supabase.from("groups").update({ pinned_message_id: null }).eq("id", groupId).eq("ministry_id", ministryId)
    // Keep the SWR group-meta cache in sync so the pinned state survives re-open.
    mutateGroupMeta((cur) => cur ? { ...cur, pinned_message_id: null } : cur, { revalidate: false })
  }, [supabase, groupId, ministryId, mutateGroupMeta])

  // Opens the vote modal for a poll (row-level "Vote" / "Change vote" button).
  const openVoteSheet = useCallback((pollId: string, hasVoted: boolean) => {
    setPollMenuFor(null)
    setPendingVoteOption(undefined)
    if (hasVoted) setChangingVotePollIds(prev => new Set([...prev, pollId]))
    setVotingPollId(pollId)
  }, [])


  // ─── Phase 3 handlers ────────────────────────────────────────────────────

  async function loadPollsData(pollIds: string[]) {
    if (pollIds.length === 0) return
    const [{ data: pollsRows }, { data: votesRows }, { data: allVotesRows }] = await Promise.all([
      supabase.from("polls").select("id, question, options").in("id", pollIds),
      supabase.from("poll_votes").select("poll_id, option_index").in("poll_id", pollIds).eq("user_id", userId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase.from("poll_votes").select("poll_id, option_index, user_id, profiles!user_id(name, avatar_url)").in("poll_id", pollIds) as any,
    ])
    if (pollsRows) {
      const map: Record<string, { question: string; options: string[] }> = {}
      for (const p of pollsRows) map[p.id] = { question: p.question, options: p.options }
      setPollsData(prev => ({ ...prev, ...map }))
    }
    if (votesRows !== null) {
      const map: Record<string, number> = {}
      for (const v of votesRows) map[v.poll_id] = v.option_index
      setPollVotes(prev => {
        const next = { ...prev }
        for (const id of pollIds) {
          if (map[id] !== undefined) next[id] = map[id]
          else delete next[id]
        }
        return next
      })
    }
    if (allVotesRows) {
      const countMap: Record<string, number[]> = {}
      const voterMap: Record<string, { option_index: number; user_id: string; name: string; avatar_url: string | null }[]> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const v of allVotesRows as any[]) {
        if (!countMap[v.poll_id]) countMap[v.poll_id] = []
        while (countMap[v.poll_id].length <= v.option_index) countMap[v.poll_id].push(0)
        countMap[v.poll_id][v.option_index]++
        const p = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles
        if (!voterMap[v.poll_id]) voterMap[v.poll_id] = []
        voterMap[v.poll_id].push({ option_index: v.option_index, user_id: v.user_id, name: (p as { name: string } | null)?.name ?? "Unknown", avatar_url: (p as { avatar_url: string | null } | null)?.avatar_url ?? null })
      }
      setPollCounts(prev => ({ ...prev, ...countMap }))
      setPollVoters(prev => ({ ...prev, ...voterMap }))
    }
  }

  async function handleCreatePoll() {
    if (!pollQuestion.trim()) return
    const opts = pollOptions.filter(o => o.trim())
    if (opts.length < 2) return
    setShowPollCreator(false)

    const { data: pollRow } = await supabase.from("polls").insert({ group_id: groupId, question: pollQuestion.trim(), options: opts, created_by: userId }).select("id").single()
    if (!pollRow) return

    const optimisticId = `optimistic-poll-${Date.now()}`
    const now = new Date().toISOString()
    const optimisticMsg: Message = {
      id: optimisticId, group_id: groupId, sender_id: userId, content: "",
      created_at: now, sender_name: userName, reply_to_id: null,
      reply_to_content: null, reply_to_sender: null, message_type: "poll",
      poll_id: pollRow.id,
    }
    setMessages(prev => [...prev, optimisticMsg])
    setPollsData(prev => ({ ...prev, [pollRow.id]: { question: pollQuestion.trim(), options: opts } }))
    setPollCounts(prev => ({ ...prev, [pollRow.id]: opts.map(() => 0) }))

    const { data } = await supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: "", message_type: "poll", poll_id: pollRow.id }).select("id").single()
    if (data) setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m))

    setPollQuestion("")
    setPollOptions(["", ""])
  }

  async function handleVote(pollId: string, optionIndex: number) {
    setChangingVotePollIds(prev => { const next = new Set(prev); next.delete(pollId); return next })

    const prev = pollVotes[pollId]
    const firstName = userName.split(" ")[0]

    // Clicking current selection → unvote
    if (prev === optionIndex) {
      setPollVotes(pv => { const next = { ...pv }; delete next[pollId]; return next })
      setPollCounts(pc => {
        const counts = [...(pc[pollId] ?? [])]
        counts[optionIndex] = Math.max(0, (counts[optionIndex] ?? 0) - 1)
        return { ...pc, [pollId]: counts }
      })
      setPollVoters(pv => ({ ...pv, [pollId]: (pv[pollId] ?? []).filter(v => v.user_id !== userId) }))
      await supabase.from("poll_votes").delete().eq("poll_id", pollId).eq("user_id", userId)
      await supabase.from("messages").insert({ group_id: groupId, sender_id: null, content: `${firstName} removed their vote`, message_type: "system" })
      loadPollsData([pollId])
      return
    }

    // Optimistic update
    setPollVotes(pv => ({ ...pv, [pollId]: optionIndex }))
    setPollCounts(pc => {
      const counts = [...(pc[pollId] ?? [])]
      const poll = pollsData[pollId]
      if (poll) while (counts.length < poll.options.length) counts.push(0)
      if (prev !== undefined && prev >= 0) counts[prev] = Math.max(0, (counts[prev] ?? 0) - 1)
      counts[optionIndex] = (counts[optionIndex] ?? 0) + 1
      return { ...pc, [pollId]: counts }
    })
    // Optimistic voter update
    setPollVoters(pv => {
      const voters = (pv[pollId] ?? []).filter(v => v.user_id !== userId)
      return { ...pv, [pollId]: [...voters, { option_index: optionIndex, user_id: userId, name: userName, avatar_url: null }] }
    })

    await supabase.from("poll_votes").upsert({ poll_id: pollId, user_id: userId, option_index: optionIndex }, { onConflict: "poll_id,user_id" })

    const optName = pollsData[pollId]?.options[optionIndex]
    if (optName) {
      await supabase.from("messages").insert({
        group_id: groupId, sender_id: null,
        content: `${firstName} voted for "${optName}"`,
        message_type: "system",
      })
    }
    loadPollsData([pollId])
  }

  // GIF send — optimistic insert stays in ChatScreen (owns messages); <Composer>
  // closes the picker itself after calling this. Stable for the memoized child.
  const handleSendGif = useCallback((fullUrl: string) => {
    if (!fullUrl) return
    const optimisticId = `optimistic-gif-${Date.now()}`
    const now = new Date().toISOString()
    const optimisticMsg: Message = {
      id: optimisticId, group_id: groupId, sender_id: userId, content: "",
      created_at: now, sender_name: userName, reply_to_id: null,
      reply_to_content: null, reply_to_sender: null, message_type: "user",
      attachment_url: fullUrl, attachment_type: "image/gif",
    }
    setMessages(prev => [...prev, optimisticMsg])
    supabase.from("messages").insert({ group_id: groupId, sender_id: userId, content: "", attachment_url: fullUrl, attachment_type: "image/gif" }).select("id").single()
      .then(({ data }) => { if (data) setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m)) })
  }, [supabase, groupId, userId, userName])

  // ─────────────────────────────────────────────────────────────────────────

  // Departed members are loaded via useSWR above (see departuresData/departedIds).

  // Populate group type + archived status + pinned message from the SWR group-meta
  // cache. The fetcher is pure; the secondary pinned-message lookup lives here.
  useEffect(() => {
    if (!groupMeta) return
    setGroupType(groupMeta.type)
    setGroupArchived(groupMeta.archived ?? false)
    setGroupIsCentral(groupMeta.is_central_chat ?? false)
    if (groupMeta.pinned_message_id) {
      setPinnedMessageId(groupMeta.pinned_message_id)
      supabase
        .from("messages")
        .select("id, content, attachment_url, attachment_type, attachment_name, profiles!sender_id(name)")
        .eq("id", groupMeta.pinned_message_id)
        .maybeSingle()
        .then(({ data: pmsg }) => {
          if (pmsg) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = Array.isArray((pmsg as any).profiles) ? (pmsg as any).profiles[0] : (pmsg as any).profiles
            setPinnedMessage({ id: pmsg.id, content: pmsg.content, sender_name: (p as { name: string } | null)?.name ?? "Unknown", attachment_url: (pmsg as { attachment_url?: string | null }).attachment_url ?? null, attachment_type: (pmsg as { attachment_type?: string | null }).attachment_type ?? null, attachment_name: (pmsg as { attachment_name?: string | null }).attachment_name ?? null })
          }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMeta])

  // Seed member read state from the shared roster SWR (Part B3 consolidation — no
  // separate fetch). Small rooms (<30) get the live per-member map (self excluded);
  // large rooms leave it empty ({}) — the live receipt path is disabled there.
  useEffect(() => {
    if (!rosterLoaded) return
    if (isLargeRoom) { setMemberReadMap({}); return }
    const map: Record<string, { name: string; lastReadAt: string | null; avatarUrl: string | null }> = {}
    for (const m of roster) {
      if (m.id === userId) continue
      map[m.id] = { name: m.displayName, lastReadAt: m.lastReadAt, avatarUrl: m.avatarUrl }
    }
    setMemberReadMap(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, rosterLoaded, isLargeRoom, userId])

  // Realtime: update memberReadMap when other members mark messages read.
  // SMALL ROOMS ONLY. In large rooms (≥30) every member subscribing to every
  // member's read update is the O(members²) blow-up — so we never create this
  // channel there. Wait until the roster is known before deciding, and tear the
  // channel down if isLargeRoom flips true after a late roster load.
  useEffect(() => {
    if (!groupId) return // draft DM — no group to watch yet
    if (!rosterLoaded || isLargeRoom) return
    const channel = supabase
      .channel(`read-receipts-${groupId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        (payload) => {
          const updated = payload.new as { user_id: string; last_read_at: string | null }
          if (updated.user_id === userId) return
          setMemberReadMap((prev) => {
            // Mute/pin toggles also UPDATE group_members rows — skip when last_read_at
            // is unchanged so those writes don't trigger spurious re-renders.
            if (prev[updated.user_id]?.lastReadAt === updated.last_read_at) return prev
            return {
              ...prev,
              [updated.user_id]: { ...prev[updated.user_id], lastReadAt: updated.last_read_at },
            }
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId, rosterLoaded, isLargeRoom])

  // Typing indicator — broadcast channel
  useEffect(() => {
    if (!groupId) return // draft DM — nobody to broadcast to yet
    const channel = supabase.channel(`typing-${groupId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { senderId, name, avatarUrl, isTyping } = payload as { senderId: string; name: string; avatarUrl: string | null; isTyping: boolean }
        if (senderId === userId) return
        if (isTyping) {
          setTypingUsers(prev => ({ ...prev, [senderId]: { name, avatarUrl } }))
          if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId])
          typingTimeoutsRef.current[senderId] = setTimeout(() => {
            setTypingUsers(prev => { const next = { ...prev }; delete next[senderId]; return next })
          }, 3000)
        } else {
          if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId])
          setTypingUsers(prev => { const next = { ...prev }; delete next[senderId]; return next })
        }
      })
      .subscribe()
    typingChannelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      typingChannelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Live nickname changes — anyone in the chat setting/changing/clearing a nickname
  // revalidates the roster (the display-name seam) so every member's UI updates.
  useEffect(() => {
    const channel = supabase
      .channel(`chat-nicknames-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_nicknames", filter: `group_id=eq.${groupId}` },
        () => { mutateRoster() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // ── last_read_at: coalesced, not per-message ────────────────────────────────
  // This used to write group_members on EVERY message received while the thread
  // was open, deliberately, to avoid a write on close. That trade is inverted: a
  // chat that receives 20 messages while you read it paid 20 writes instead of 1.
  //
  // It also fed back on itself. group_members is in the supabase_realtime
  // publication, so each write goes through the WAL decoder and fans out to the
  // read-receipt subscribers — and the decoder was 44% of all database time, with
  // group_members (16.5k writes) nearly matching messages (19.3k). One message in
  // meant N read-receipt writes, each decoded and fanned out again.
  //
  // So: remember the newest read timestamp locally, flush at most once per
  // COALESCE_MS, and always flush on close. The badge only has to be right by the
  // time you leave the thread, which is exactly what the flush guarantees.
  const pendingReadRef = useRef<string | null>(null)
  const readFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // What we last actually wrote, and the newest message we know about by ANY
  // route. The close flush compares them: tracking only what the realtime handler
  // saw misses messages that arrived on the initial load, which is a real race —
  // a message landing ~80ms after open stayed unread through close.
  const lastWrittenReadRef = useRef<string | null>(null)
  const newestMsgAtRef = useRef<string | null>(null)

  const flushRead = useCallback(() => {
    const stamp = pendingReadRef.current
    if (!stamp) return
    pendingReadRef.current = null
    lastWrittenReadRef.current = stamp
    supabase
      .from("group_members")
      .update({ last_read_at: stamp })
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .then(() => { if (onRead) onRead() })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  /** Record progress; the write itself is coalesced. */
  const markRead = useCallback((stamp: string) => {
    // Keep the LATEST timestamp — messages can arrive out of order.
    if (!pendingReadRef.current || stamp > pendingReadRef.current) pendingReadRef.current = stamp
    if (readFlushTimer.current) return
    readFlushTimer.current = setTimeout(() => {
      readFlushTimer.current = null
      flushRead()
    }, READ_COALESCE_MS)
  }, [flushRead])

  // Open marks read immediately — that is the one write worth doing eagerly,
  // because it clears the unread badge the user just tapped past.
  useEffect(() => {
    pendingReadRef.current = new Date().toISOString()
    flushRead()
    return () => {
      if (readFlushTimer.current) { clearTimeout(readFlushTimer.current); readFlushTimer.current = null }
      // Everything visible up to this moment counts as read — stamp NOW rather
      // than replaying per-message timestamps, so the flush covers messages that
      // arrived by any route. Skipped when nothing newer than the last write
      // exists, so opening and closing a quiet thread is not a second write.
      const newest = newestMsgAtRef.current
      const written = lastWrittenReadRef.current
      if (pendingReadRef.current || (newest && (!written || newest > written))) {
        pendingReadRef.current = new Date().toISOString()
        flushRead()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Newest message by any route (initial load, realtime, load-older) — the close
  // flush reads this to decide whether a write is owed.
  useEffect(() => {
    const newest = messages.length ? messages[messages.length - 1]?.created_at ?? null : null
    if (newest && (!newestMsgAtRef.current || newest > newestMsgAtRef.current)) {
      newestMsgAtRef.current = newest
    }
  }, [messages])

  // Shared row→Message enrichment (initial load AND load-older). Side effect:
  // populates profilesCache/avatarCache. Otherwise a pure transform.
  const enrichRows = useCallback((rows: unknown[]): Message[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows as any[]).map((m: any) => {
      const isSystem = m.message_type === "system"
      const p = isSystem ? null : (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)
      const name = p?.name ?? (isSystem ? "" : "Unknown")
      const avatarUrl = p?.avatar_url ?? null
      if (m.sender_id) {
        profilesCache.current[m.sender_id] = name
        avatarCache.current[m.sender_id] = avatarUrl
      }

      const replyRaw = m.reply_to ?? null
      const replyProfile = replyRaw?.profiles
        ? (Array.isArray(replyRaw.profiles) ? replyRaw.profiles[0] : replyRaw.profiles)
        : null

      return {
        id: m.id, group_id: m.group_id, sender_id: m.sender_id,
        content: m.content, created_at: m.created_at, sender_name: name,
        sender_avatar_url: avatarUrl,
        reply_to_id: m.reply_to_id ?? null,
        reply_to_content: replyPreviewLabel(replyRaw?.content, replyRaw?.attachment_type, replyRaw?.attachment_name),
        reply_to_sender: (replyProfile as { name: string } | null)?.name ?? null,
        message_type: m.message_type ?? "user",
        is_edited: (m as { is_edited?: boolean }).is_edited ?? false,
        deleted: (m as { deleted?: boolean }).deleted ?? false,
        attachment_url: (m as { attachment_url?: string | null }).attachment_url ?? null,
        attachment_type: (m as { attachment_type?: string | null }).attachment_type ?? null,
        attachment_name: (m as { attachment_name?: string | null }).attachment_name ?? null,
        attachment_size: (m as { attachment_size?: number | null }).attachment_size ?? null,
        poll_id: (m as { poll_id?: string | null }).poll_id ?? null,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Merge a batch of reactions into the existing map (used by load-older).
  const mergeReactionsFor = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) return
    const { data: rxData } = await supabase
      .from("message_reactions")
      .select("id, message_id, user_id, emoji")
      .in("message_id", messageIds)
    setReactions((prev) => {
      const rxMap: Record<string, Reaction[]> = { ...prev }
      for (const rx of ((rxData ?? []) as Reaction[])) {
        const list = rxMap[rx.message_id] ? [...rxMap[rx.message_id]] : []
        if (!list.find((r) => r.id === rx.id)) list.push(rx)
        rxMap[rx.message_id] = list
      }
      return rxMap
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initial load = NEWEST 50 (fetched desc, reversed to ascending for render).
  useEffect(() => {
    async function loadMessages() {
      const { data } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(50)

      if (data) {
        const enriched = enrichRows([...data].reverse())
        setMessages(enriched)
        setHasMore(data.length === 50)

        // Load polls for any poll messages
        const pollIds = enriched.filter(m => m.poll_id).map(m => m.poll_id!)
        if (pollIds.length > 0) loadPollsData(pollIds)

        // Load all reactions for these messages in one query
        const messageIds = enriched.map((m) => m.id)
        if (messageIds.length > 0) {
          const { data: rxData } = await supabase
            .from("message_reactions")
            .select("id, message_id, user_id, emoji")
            .in("message_id", messageIds)
          const rxMap: Record<string, Reaction[]> = {}
          for (const rx of ((rxData ?? []) as Reaction[])) {
            if (!rxMap[rx.message_id]) rxMap[rx.message_id] = []
            rxMap[rx.message_id].push(rx)
          }
          setReactions(rxMap)
        }
      }
      setLoading(false)
    }
    // Draft DM: there is no group yet, so there is nothing to load. Land in the
    // empty state immediately rather than firing a query against an empty id.
    if (!groupId) { setMessages([]); setLoading(false); return }
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Load-older: keyset page on scroll-up. Cursor = oldest loaded message's
  // created_at (.lt). Prepends, preserves scroll position, and pulls the new
  // page's polls + reactions. hasMore=false once a page returns <50 rows.
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore) return
    const oldest = messagesRef.current[0]
    if (!oldest) return
    loadingOlderRef.current = true

    const container = scrollContainerRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    const prevScrollTop = container?.scrollTop ?? 0

    const { data } = await supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("group_id", groupId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(50)

    if (data && data.length > 0) {
      const enriched = enrichRows([...data].reverse())
      // Suppress the auto-scroll-to-bottom effect: prepending grows the list but
      // the view must stay put (scroll position is restored below).
      suppressScrollRef.current = true
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.id))
        const toPrepend = enriched.filter((m) => !existing.has(m.id))
        return [...toPrepend, ...prev]
      })

      const pollIds = enriched.filter(m => m.poll_id).map(m => m.poll_id!)
      if (pollIds.length > 0) loadPollsData(pollIds)
      mergeReactionsFor(enriched.map((m) => m.id))

      if (data.length < 50) setHasMore(false)

      // Restore scroll position after the prepended rows lay out.
      requestAnimationFrame(() => {
        const c = scrollContainerRef.current
        if (c) c.scrollTop = c.scrollHeight - prevScrollHeight + prevScrollTop
      })
    } else {
      setHasMore(false)
    }
    loadingOlderRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, hasMore, enrichRows, mergeReactionsFor])

  // Trigger load-older when the thread is scrolled near the top.
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop < 120 && hasMore && !loadingOlderRef.current) loadOlder()
  }, [hasMore, loadOlder])

  // Keep messagesRef current so realtime callbacks can look up reply content
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Keep reactionsRef current so handleReact can stay referentially stable
  // (reads are event-time-fresh) without taking `reactions` as a dep.
  useEffect(() => {
    reactionsRef.current = reactions
  }, [reactions])

  // Scroll to bottom after initial load
  useEffect(() => {
    if (!loading) scrollToBottom(false)
  }, [loading, scrollToBottom])

  // Opening the keyboard shortens the transcript. Without this the viewport keeps
  // whatever offset it had and the newest messages — the ones you are replying to —
  // slide up under the composer, which is the other half of "I can't see what I'm
  // responding to". Twice on purpose: once on the leading edge so the pin happens
  // WITH the keyboard slide, once after it settles because the final height is only
  // known at the end of the animation (~250ms on iOS).
  // Drag down over the transcript to put the keyboard away. Gated on being pinned to
  // the bottom so it never steals the flick that scrolls back through history — and
  // the bottom is exactly where the effect below leaves you when the keyboard opens.
  useSwipeDownToDismissKeyboard(scrollContainerRef, { whenScrolledToBottom: true })

  // SUBSCRIBED, not rendered: re-pinning the transcript is a side effect, and reading
  // keyboard state through a hook instead would re-render this whole component on every
  // step of the keyboard's slide — stutter in the exact frames that must stay smooth.
  useEffect(() => {
    if (loading || searchMode) return
    let frame = 0
    let settled = 0
    const stop = subscribeKeyboard(({ open }) => {
      if (!open) return
      cancelAnimationFrame(frame)
      window.clearTimeout(settled)
      frame = requestAnimationFrame(() => scrollToBottom(false))
      // The final height is only known once the keyboard finishes animating (~250ms
      // on iOS), so pin once on the leading edge and once after it settles.
      settled = window.setTimeout(() => scrollToBottom(false), 320)
    })
    return () => { stop(); cancelAnimationFrame(frame); window.clearTimeout(settled) }
  }, [loading, searchMode, scrollToBottom])

  // Realtime — all chat events for this thread flow through the shared private-broadcast
  // hub (chat:{groupId}): new messages (INSERT), edits + unsends/soft-deletes (UPDATE),
  // hard deletes (DELETE), and reaction add/remove. The hub keeps ONE private channel per
  // topic (shared with home-app's recent-chats listener), pushes the user JWT to the
  // socket, and falls back to postgres_changes on subscribe error. Handlers below are the
  // same ones the old group-messages-{id} / reactions-{id} channels used.
  useEffect(() => {
    if (!groupId) return // draft DM — no topic to subscribe to yet
    const handleIncomingMessage = async (raw: { id: string; group_id: string; sender_id: string | null; content: string; created_at: string; reply_to_id: string | null; message_type?: string; attachment_url?: string | null; attachment_type?: string | null; attachment_name?: string | null; attachment_size?: number | null; poll_id?: string | null }) => {
          // System messages: just append directly for everyone
          if (raw.message_type === "system") {
            setMessages((prev) => {
              if (prev.find(m => m.id === raw.id)) return prev
              return [...prev, { id: raw.id, group_id: raw.group_id, sender_id: raw.sender_id, content: raw.content, created_at: raw.created_at, sender_name: "", sender_avatar_url: null, reply_to_id: null, reply_to_content: null, reply_to_sender: null, message_type: "system" }]
            })
            // Reload poll data if someone else voted
            if (raw.content.includes(' voted for "') && raw.sender_id !== userId) {
              const pollIds = messagesRef.current.filter(m => m.poll_id).map(m => m.poll_id!)
              if (pollIds.length > 0) loadPollsData(pollIds)
            }
            return
          }

          // Skip own user messages — handled optimistically
          if (raw.sender_id === userId) return

          let senderName = profilesCache.current[raw.sender_id!]
          if (!senderName) {
            const { data: prof } = await supabase.from("profiles").select("name").eq("id", raw.sender_id).single()
            senderName = prof?.name ?? "Unknown"
            profilesCache.current[raw.sender_id!] = senderName
          }

          // Resolve reply content from local cache or a quick fetch
          let replyToContent: string | null = null
          let replyToSender: string | null = null
          if (raw.reply_to_id) {
            const cached = messagesRef.current.find((m) => m.id === raw.reply_to_id)
            if (cached) {
              replyToContent = replyPreviewLabel(cached.content, cached.attachment_type, cached.attachment_name)
              replyToSender = cached.sender_name
            } else {
              const { data: rMsg } = await supabase
                .from("messages")
                .select("content, attachment_type, attachment_name, profiles!sender_id(name)")
                .eq("id", raw.reply_to_id)
                .single()
              if (rMsg) {
                replyToContent = replyPreviewLabel(rMsg.content, rMsg.attachment_type, rMsg.attachment_name)
                const rp = Array.isArray(rMsg.profiles) ? rMsg.profiles[0] : rMsg.profiles
                replyToSender = (rp as { name: string } | null)?.name ?? null
              }
            }
          }

          const newMsg = {
            ...raw,
            sender_name: senderName,
            sender_avatar_url: raw.sender_id ? (avatarCache.current[raw.sender_id] ?? null) : null,
            reply_to_id: raw.reply_to_id ?? null,
            reply_to_content: replyToContent,
            reply_to_sender: replyToSender,
            message_type: raw.message_type ?? "user",
            attachment_url: raw.attachment_url ?? null,
            attachment_type: raw.attachment_type ?? null,
            attachment_name: raw.attachment_name ?? null,
            attachment_size: raw.attachment_size ?? null,
            poll_id: raw.poll_id ?? null,
          }
          // id-based dedup (defense-in-depth): a double-delivered INSERT must never
          // render twice — mirrors the system-message guard above.
          setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg])
          if (raw.poll_id) loadPollsData([raw.poll_id])

          // Coalesced (see markRead) — a burst of messages is one write, not one
          // per message, and the close flush guarantees the badge is right.
          markRead(raw.created_at)
    }

    // Message edit / unsend (soft-delete) — arrives as a messages UPDATE.
    const handleMessageUpdate = (next: { id: string; deleted?: boolean; content?: string; attachment_url?: string | null; attachment_type?: string | null; attachment_name?: string | null; attachment_size?: number | null; is_edited?: boolean; edited_at?: string | null }) => {
          setMessages((prev) => prev.map((m) => m.id === next.id
            ? { ...m, deleted: next.deleted ?? m.deleted, content: next.content ?? m.content,
                attachment_url: next.attachment_url ?? null, attachment_type: next.attachment_type ?? null,
                attachment_name: next.attachment_name ?? null, attachment_size: next.attachment_size ?? null,
                is_edited: next.is_edited ?? m.is_edited, edited_at: next.edited_at ?? m.edited_at }
            : m))
          if (next.deleted) {
            setReactions((prev) => { const r = { ...prev }; delete r[next.id]; return r })
          }
    }

    // Hard message delete (e.g. poll message removal) — arrives as a messages DELETE.
    // Mark it deleted (matching the sender's optimistic placeholder) rather than
    // yanking the row, and drop its reactions.
    const handleMessageDelete = (id: string) => {
          if (!id) return
          setMessages((prev) => prev.map((m) => m.id === id
            ? { ...m, deleted: true, content: "", attachment_url: null, attachment_type: null, attachment_name: null, attachment_size: null, poll_id: null }
            : m))
          setReactions((prev) => { const r = { ...prev }; delete r[id]; return r })
    }

    const handleReactionInsert = (rx: Reaction) => {
          // Filtered server-side to this group's reactions (message_reactions.group_id).
          // The messagesRef guard stays as defense-in-depth: ignore reactions for
          // messages not currently loaded in THIS chat (e.g. scroll-up messages not
          // yet paged in) — otherwise the map grows entries for unloaded messages.
          // Reactions for later-loaded messages are fetched fresh by mergeReactionsFor.
          if (!messagesRef.current.some((m) => m.id === rx.message_id)) return
          setReactions((prev) => {
            const list = prev[rx.message_id] ?? []
            // Replace optimistic temp entry if present, otherwise append
            const tempIdx = list.findIndex(
              (r) => r.user_id === rx.user_id && r.emoji === rx.emoji && r.id.startsWith("temp-")
            )
            if (tempIdx >= 0) {
              const updated = [...list]
              updated[tempIdx] = rx
              return { ...prev, [rx.message_id]: updated }
            }
            if (list.find((r) => r.id === rx.id)) return prev
            return { ...prev, [rx.message_id]: [...list, rx] }
          })
    }

    const handleReactionDelete = (rx: Reaction) => {
          if (!rx.message_id) return
          // messagesRef guard as before: skip reactions for messages not loaded here
          // (avoids empty map entries).
          if (!messagesRef.current.some((m) => m.id === rx.message_id)) return
          setReactions((prev) => ({
            ...prev,
            [rx.message_id]: (prev[rx.message_id] ?? []).filter((r) => r.id !== rx.id),
          }))
    }

    // One hub listener dispatches every broadcast event for this topic.
    const unsub = subscribeChatTopic(groupId, (e) => {
      if (e.table === "messages") {
        if (e.operation === "INSERT") {
          void handleIncomingMessage(e.record as unknown as Parameters<typeof handleIncomingMessage>[0])
        } else if (e.operation === "UPDATE") {
          handleMessageUpdate(e.record as unknown as Parameters<typeof handleMessageUpdate>[0])
        } else if (e.operation === "DELETE") {
          handleMessageDelete((e.old_record as { id?: string } | null)?.id ?? "")
        }
      } else if (e.table === "message_reactions") {
        if (e.operation === "INSERT") {
          handleReactionInsert(e.record as unknown as Reaction)
        } else if (e.operation === "DELETE") {
          handleReactionDelete(e.old_record as unknown as Reaction)
        }
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, userId])

  // Auto-scroll only when messages are added, not on deletions/edits
  useEffect(() => {
    if (!searchMode && !suppressScrollRef.current && messages.length > prevMsgCountRef.current) scrollToBottom()
    suppressScrollRef.current = false
    prevMsgCountRef.current = messages.length
  }, [messages, scrollToBottom, searchMode])

  // Scroll to the current search match
  useEffect(() => {
    if (searchMatches.length === 0) return
    const matchId = searchMatches[searchMatchIndex]
    if (matchId) messageRefs.current[matchId]?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [searchMatchIndex, searchMatches])

  // Throttled typing broadcast — the realtime channel lives here in ChatScreen;
  // <Composer> calls this on every input change. Stable for the memoized child.
  const onTyping = useCallback((val: string) => {
    if (typingChannelRef.current && val.trim()) {
      // Throttle the isTyping:true SEND to at most one per 2500ms per user (leading
      // edge) — every keystroke firing a broadcast is needless fan-out at scale. The
      // stop-typing reset timer still refreshes on every keystroke so a single
      // "stopped" fires once the user goes idle for 2500ms.
      if (Date.now() - lastTypingSentRef.current >= 2500) {
        lastTypingSentRef.current = Date.now()
        typingChannelRef.current.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: true } })
      }
      if (myTypingTimeoutRef.current) clearTimeout(myTypingTimeoutRef.current)
      myTypingTimeoutRef.current = setTimeout(() => {
        lastTypingSentRef.current = 0
        typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: false } })
      }, 2500)
    }
  }, [userId, userName])

  const onClearReply = useCallback(() => setReplyingTo(null), [])
  const onSetPollOpen = useCallback((open: boolean) => setShowPollCreator(open), [])

  // Optimistic send (Convention #4) stays here — <Composer> clears its own input +
  // attachment locally, then hands { content, attachment, replyTo } up. Stable for
  // the memoized child: reads everything from the payload + refs/stable deps.
  const handleSend = useCallback(async ({ content, attachment, replyTo }: { content: string; attachment: File | null; replyTo: Message | null }) => {
    if (!content && !attachment) return

    // `gid` — NOT the groupId prop — is the id every write below uses. For a
    // draft DM it stays empty until the moderation gate has passed (see below):
    // a message that gets blocked must not bring a conversation into existence.
    let gid = groupId

    // Moderation gate — runs before anything is sent. When enabled AND in-scope
    // for this room, flag words per the ministry's rules. On a flag: record an
    // offense (fire-and-forget), surface the warning banner, and either block the
    // send (block mode) or substitute the softened/censored text.
    const applyModeration = (raw: string): { text: string; blocked: boolean } => {
      if (
        modSettings?.enabled && raw.trim() &&
        scopeApplies(modSettings.scope, { isChurch: modIsChurch, isPersonal: modIsPersonal, isMinistryDefault: modIsMinistryDefault })
      ) {
        const { cleaned, flaggedCount } = moderateText(raw, { strictness: modSettings.strictness, behavior: modSettings.behavior })
        if (flaggedCount > 0) {
          // A draft has no group to attribute the offense to yet; the gate still
          // blocks/softens the text, which is what actually matters here.
          if (gid) void recordChatOffense(gid, raw)
          setModerationWarning("Your message was filtered for language against ministry guidelines. Repeated flags are reported to admins.")
          if (modSettings.behavior === "block") return { text: raw, blocked: true }
          return { text: cleaned, blocked: false }
        }
      }
      return { text: raw, blocked: false }
    }
    const contentMod = content ? applyModeration(content) : { text: "", blocked: false }
    // Text-only + block mode → refuse to send outright.
    if (!attachment && contentMod.blocked) return

    // ── Draft DM: THIS send is what brings the conversation into existence. ──
    // Deliberately after the moderation gate, so a blocked message can't leave a
    // conversation behind. Created here and then used by every write below in the
    // SAME call, so the typed message is never lost. onDmCreated hands the real
    // id to the parent; home-app keys the draft on the recipient, so this
    // component stays mounted through the swap rather than remounting mid-send.
    if (!gid) {
      if (!draftRecipient || creatingDraftRef.current) return
      creatingDraftRef.current = true
      // get_or_create_dm, not createGroup: it is keyed on the PAIR, so two people
      // who draft at each other simultaneously land in ONE thread instead of two.
      const { groupId: dmId, error: dmErr } = await getOrCreateDm(supabase, draftRecipient.id)
      creatingDraftRef.current = false
      if (dmErr || !dmId) { setModerationWarning("Couldn't start this chat. Please try again."); return }
      gid = dmId
      onDmCreated?.(dmId, draftRecipient.name)
    }

    // Reverent capitalization — a SEPARATE, silent transform: auto-caps God /
    // Jesus / Holy Spirit. Independent of the language filter (works even when
    // it's off/out-of-scope); no warning, no offense recording. Applied to the
    // outgoing text that feeds BOTH the optimistic bubble and the DB insert.
    const applyReverent = (t: string): string => (modSettings?.reverent_caps ? reverentCapitalize(t) : t)

    // Clear own typing status
    if (myTypingTimeoutRef.current) clearTimeout(myTypingTimeoutRef.current)
    typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { senderId: userId, name: userName, avatarUrl: null, isTyping: false } })

    setSending(true)
    const replyTarget = replyTo
    setReplyingTo(null)

    // Attachment message — no caption embedded; caption sent as separate message below
    if (attachment) {
      setUploading(true)
      const ext = attachment.name.split(".").pop() ?? "bin"
      const path = `${gid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data: storageData, error } = await supabase.storage
        .from("chat-attachments")
        .upload(path, attachment, { cacheControl: "3600", upsert: false })
      if (!error && storageData) {
        const { data: { publicUrl } } = supabase.storage.from("chat-attachments").getPublicUrl(path)
        const optimisticId = `optimistic-att-${Date.now()}`
        const optimisticMsg: Message = {
          id: optimisticId, group_id: gid, sender_id: userId,
          content: "", created_at: new Date().toISOString(), sender_name: userName,
          reply_to_id: replyTarget?.id ?? null, reply_to_content: replyTarget ? replyPreviewLabel(replyTarget.content, replyTarget.attachment_type, replyTarget.attachment_name) : null,
          reply_to_sender: replyTarget?.sender_name ?? null,
          message_type: "user", attachment_url: publicUrl,
          attachment_type: attachment.type, attachment_name: attachment.name, attachment_size: attachment.size,
        }
        // Block mode on a flagged caption → send the attachment with NO caption.
        const captionText = contentMod.blocked ? "" : applyReverent(contentMod.text)
        setMessages(prev => [...prev, optimisticMsg])
        bumpChatListForOwnSend(captionText || attachment.name)
        const { data } = await supabase.from("messages").insert({
          group_id: gid, sender_id: userId, content: "",
          reply_to_id: replyTarget?.id ?? null,
          attachment_url: publicUrl, attachment_type: attachment.type,
          attachment_name: attachment.name, attachment_size: attachment.size,
        }).select("id").single()
        if (data) setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m))

        // Send caption as a separate plain text message immediately after
        if (captionText) {
          const captionOptimisticId = `optimistic-cap-${Date.now()}`
          const captionMsg: Message = {
            id: captionOptimisticId, group_id: gid, sender_id: userId,
            content: captionText, created_at: new Date().toISOString(), sender_name: userName,
            reply_to_id: null, reply_to_content: null, reply_to_sender: null,
            message_type: "user", attachment_url: null,
            attachment_type: null, attachment_name: null, attachment_size: null,
          }
          setMessages(prev => [...prev, captionMsg])
          const { data: capData } = await supabase.from("messages").insert({
            group_id: gid, sender_id: userId, content: captionText,
          }).select("id").single()
          if (capData) setMessages(prev => prev.map(m => m.id === captionOptimisticId ? { ...m, id: capData.id } : m))
        }
      }
      setUploading(false)
      setSending(false)
      return
    }

    // Text-only message — send the moderated text (softened/censored, or the
    // original when nothing was flagged; block mode already returned above),
    // then apply reverent capitalization on top.
    const sendText = applyReverent(contentMod.text)
    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: Message = {
      id: optimisticId, group_id: gid, sender_id: userId, content: sendText,
      created_at: new Date().toISOString(), sender_name: userName,
      reply_to_id: replyTarget?.id ?? null,
      reply_to_content: replyTarget ? replyPreviewLabel(replyTarget.content, replyTarget.attachment_type, replyTarget.attachment_name) : null,
      reply_to_sender: replyTarget?.sender_name ?? null,
    }
    setMessages((prev) => [...prev, optimisticMsg])
    bumpChatListForOwnSend(sendText)

    const { data, error } = await supabase
      .from("messages")
      .insert({ group_id: gid, sender_id: userId, content: sendText, reply_to_id: replyTarget?.id ?? null })
      .select("id")
      .single()

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    } else if (data) {
      setMessages((prev) => prev.map((m) => m.id === optimisticId ? { ...m, id: data.id } : m))
    }
    setSending(false)
  }, [supabase, groupId, userId, userName, bumpChatListForOwnSend, modSettings, modIsChurch, modIsPersonal, modIsMinistryDefault, draftRecipient, onDmCreated])

  // For each own message: which other members have it as their most-recently-read own message.
  // Reuses the PRIOR array reference for any message whose receipts didn't change, so
  // memoized own-message rows don't re-render when an unrelated message/read event
  // rebuilds the map.
  const prevReadReceiptMapRef = useRef<Record<string, { name: string; avatarUrl: string | null }[]>>({})
  const readReceiptMap = useMemo(() => {
    const map: Record<string, { name: string; avatarUrl: string | null }[]> = {}
    // Large rooms don't do live per-member receipts — skip the members×messages walk.
    if (!isLargeRoom) {
      const ownMsgs = messages.filter((m) => m.sender_id === userId)
      if (ownMsgs.length > 0) {
        for (const { name, lastReadAt, avatarUrl } of Object.values(memberReadMap)) {
          if (!lastReadAt) continue
          let target: Message | null = null
          for (const m of ownMsgs) {
            if (m.created_at <= lastReadAt) target = m
            else break
          }
          if (target) {
            if (!map[target.id]) map[target.id] = []
            map[target.id].push({ name, avatarUrl })
          }
        }
      }
    }
    // Reconcile against the previous map: reuse the old array ref when the
    // receipts for a message are unchanged (cheap signature comparison).
    const prev = prevReadReceiptMapRef.current
    const signature = (arr: { name: string; avatarUrl: string | null }[]) =>
      arr.map((r) => r.name + " " + (r.avatarUrl ?? "")).join("")
    for (const id of Object.keys(map)) {
      const prevArr = prev[id]
      if (prevArr && signature(prevArr) === signature(map[id])) map[id] = prevArr
    }
    prevReadReceiptMapRef.current = map
    return map
  }, [messages, memberReadMap, userId, isLargeRoom])

  // Large-room "Seen by N": the user's own most-recent (non-system) message.
  const latestOwnMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === userId && messages[i].message_type !== "system") return messages[i]
    }
    return null
  }, [messages, userId])

  // Fetch the aggregate count ONCE per latest-own-message (large rooms only). A new
  // own message → new id → refetch. Point-in-time; never auto-refreshed live.
  useEffect(() => {
    if (!isLargeRoom || !latestOwnMsg) { setSeenByCount(null); return }
    setSeenByOpen(false)
    setSeenByList(null)
    let cancelled = false
    supabase
      .from("group_members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .neq("user_id", userId)
      .gte("last_read_at", latestOwnMsg.created_at)
      .then(({ count }) => { if (!cancelled) setSeenByCount(count ?? 0) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLargeRoom, latestOwnMsg?.id, groupId, userId])

  // Expand/collapse the reader list — fetched on demand the first time it's opened.
  // Passed only to the latest-own row (others receive undefined), so its changing
  // identity never breaks the memo for the rest of the list.
  const toggleSeenBy = useCallback(async () => {
    if (!latestOwnMsg) return
    if (seenByOpen) { setSeenByOpen(false); return }
    setSeenByOpen(true)
    if (seenByList === null) {
      const { data } = await supabase
        .from("group_members")
        .select("user_id, last_read_at, profiles!user_id(name, avatar_url)")
        .eq("group_id", groupId)
        .neq("user_id", userId)
        .gte("last_read_at", latestOwnMsg.created_at)
        .order("last_read_at", { ascending: false })
        .limit(50)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (data ?? []).map((m: any) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
        const realName = (p as { name: string } | null)?.name ?? "?"
        return { name: displayNameById[m.user_id] ?? realName, avatarUrl: (p as { avatar_url: string | null } | null)?.avatar_url ?? null }
      })
      setSeenByList(list)
    }
  }, [latestOwnMsg, seenByOpen, seenByList, supabase, groupId, userId, displayNameById])

  function openSearch() {
    setSearchMode(true)
    setSearchQuery("")
    setSearchMatchIndex(0)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  function closeSearch() {
    setSearchMode(false)
    setSearchQuery("")
    setSearchMatchIndex(0)
  }

  function goToNextMatch() {
    if (searchMatches.length === 0) return
    setSearchMatchIndex(i => (i + 1) % searchMatches.length)
  }

  function goToPrevMatch() {
    if (searchMatches.length === 0) return
    setSearchMatchIndex(i => (i - 1 + searchMatches.length) % searchMatches.length)
  }

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    setEmojiPickerFor(null)
    // Read reactions through the ref (synced above) so this callback stays
    // referentially stable — reads are event-time-fresh.
    const existing = (reactionsRef.current[messageId] ?? []).find(
      (r) => r.user_id === userId && r.emoji === emoji
    )
    if (existing) {
      // Optimistic remove
      setReactions((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== existing.id),
      }))
      await supabase.from("message_reactions").delete().eq("id", existing.id)
    } else {
      // Optimistic add
      const tempId = `temp-${Date.now()}`
      setReactions((prev) => ({
        ...prev,
        [messageId]: [
          ...(prev[messageId] ?? []),
          { id: tempId, message_id: messageId, user_id: userId, emoji },
        ],
      }))
      const { data } = await supabase
        .from("message_reactions")
        // group_id is denormalized onto the row so realtime can server-side filter
        // the reactions-{groupId} channel; the BEFORE INSERT trigger is only a
        // fallback for rows inserted without it. We know groupId here, so set it.
        .insert({ message_id: messageId, user_id: userId, emoji, group_id: groupId })
        .select("id")
        .single()
      if (data) {
        setReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] ?? []).map((r) =>
            r.id === tempId ? { ...r, id: data.id } : r
          ),
        }))
      }
    }
  }, [supabase, userId])

  // O(1) per-row search-match lookup for the memoized rows.
  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches])

  // Per-message resolved link preview — each row receives ONE object (or
  // undefined) instead of the whole linkPreviews map, so an unrelated preview
  // resolving doesn't re-render every row.
  const previewByMsgId = useMemo(() => {
    const map: Record<string, LinkPreviewData | undefined> = {}
    for (const msg of processedMessages) {
      if (!msg.content || msg.message_type === "system" || msg.message_type === "poll") continue
      const urls = msg.content.match(/https?:\/\/[^\s<>"']+/gi) ?? []
      const preview = urls.map((u) => linkPreviews[u]).find((p) => p && p.title)
      if (preview) map[msg.id] = preview
    }
    return map
  }, [processedMessages, linkPreviews])

  // Header member summary — derived from the roster SWR (not memberReadMap, which is
  // empty in large rooms). Self first, then everyone else, to match prior ordering.
  const memberFirstNames = useMemo(() => {
    const self = roster.filter(m => m.id === userId).map(m => m.displayName.split(" ")[0])
    const others = roster.filter(m => m.id !== userId).map(m => m.displayName.split(" ")[0])
    return [...self, ...others]
  }, [roster, userId])

  // Mobile: edge-swipe from the left closes the chat, mirroring the header back
  // chevron (§0.3). Disabled on the desktop inline render; coarse-pointer gated.
  const chatSwipeRef = useEdgeSwipeBack<HTMLDivElement>(inline ? undefined : onClose)

  // Settings is now an in-content subpage (SubpageShell), not a portal sibling.
  // Early-return it so it REPLACES the chat in the same slot: on desktop it fills
  // the inline content area (shell breadcrumb is the back); off desktop the chat is
  // a full-screen overlay, so the settings inherit the same fixed frame (mobile
  // back row comes from SubpageShell). onClose closes the whole chat unchanged.
  if (showSettings) {
    const settingsEl = (
      <ChatSettings
        groupId={groupId}
        groupName={displayName}
        groupType={groupType}
        groupArchived={groupArchived}
        isCentral={groupIsCentral}
        userId={userId}
        userName={userName}
        ministryId={ministryId}
        ministryName={ministryName}
        userRole={userRole}
        onBack={() => setShowSettings(false)}
        onNameChange={(name) => { setDisplayName(name); onNameChange?.(name) }}
        onClose={() => { setShowSettings(false); onClose() }}
        // DM → "Start a group chat" forks into a NEW group; close this chat's
        // settings and open the new one in the same slot.
        onOpenChat={onOpenChat ? (id, name, type) => { setShowSettings(false); onOpenChat(id, name, type) } : undefined}
      />
    )
    // Inset ONLY — ChatSettings renders a SubpageShell, whose chrome row already
    // owns the 12px (POCKET_OVERLAY_INSET_CLS, not …PAD_TOP_CLS). Stacking both
    // put chat settings at 24-30px instead of 12-19.
    return inline ? settingsEl : (
      <div className="fixed inset-0 z-[110] overflow-y-auto pt-[env(safe-area-inset-top)] md:pt-0 md:left-[var(--shell-offset)]" style={{ background: "var(--cream)" }}>
        {settingsEl}
      </div>
    )
  }

  return (
    <>
    {/* Mobile chat is ONE continuous cream surface — header, message body and
        composer share --cream so the chrome/composer controls read as floating
        (iMessage/Messenger). Desktop keeps its --cream-panel overlay. */}
    {/* The overlay's bottom edge rides the keyboard rather than staying pinned to
        the screen floor. `inset-0` alone leaves the composer under the keys, which
        is what makes iOS scroll the whole document up to reveal the caret — the
        header disappears off the top and the composer floats over blank cream.
        Lifting `bottom` by --kb-inset means the flex column simply gets shorter:
        header stays put, the flex-1 transcript shrinks, composer sits on the keys
        (iMessage/Messenger). In the native shell --kb-inset is 0 because the
        WebView already shrank — same markup, both containers. Desktop resets it. */}
    <AnimateIn
      animate={!inline}
      className={inline ? "flex flex-col h-full bg-[var(--cream)] w-full" : "fixed inset-0 kb-lift z-[100] bg-[var(--cream)] md:bg-[var(--cream-panel)] flex flex-col md:left-[var(--shell-offset)]"}
    >
    <div ref={chatSwipeRef} className={inline ? "w-full h-full flex flex-col" : "max-w-[390px] mx-auto w-full h-full flex flex-col md:max-w-none"}>

      {/* ── Top bar ── */}
      <div className={`flex-shrink-0 flex items-center gap-3 px-5 md:px-6 ${inline ? "py-3 md:pt-5 md:pb-3" : "pt-[calc(env(safe-area-inset-top)+12px)] pb-3 md:py-3.5 md:border-b md:border-[var(--line)]"} bg-[var(--cream)]`}>
        {searchMode ? (
          <>
            {/* Search bar mode */}
            <button
              onClick={closeSearch}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}
            >
              <X size={14} />
            </button>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchMatchIndex(0) }}
              onKeyDown={e => {
                if (e.key === "Escape") closeSearch()
                else if (e.key === "Enter") { e.preventDefault(); goToNextMatch() }
                else if (e.key === "ArrowDown") { e.preventDefault(); goToNextMatch() }
                else if (e.key === "ArrowUp") { e.preventDefault(); goToPrevMatch() }
              }}
              placeholder="Search messages…"
              className="flex-1 bg-transparent outline-none text-[14px] text-[var(--ink)] placeholder:text-[var(--faint)] min-w-0"
            />
            {searchQuery.trim() && (
              <span style={{ fontSize: "12px", color: "var(--muted-text)", whiteSpace: "nowrap", flexShrink: 0 }}>
                {searchMatches.length === 0 ? "No results" : `${searchMatchIndex + 1} / ${searchMatches.length}`}
              </span>
            )}
            {searchMatches.length > 0 && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={goToPrevMatch} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <ChevronUp size={12} />
                </button>
                <button onClick={goToNextMatch} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <ChevronDown size={12} />
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {!inline && <BackChevron onClick={onClose} className="md:hidden" />}
            {/* Group avatar — 40px on mobile (Pocket chat header), 32px on the
                shared desktop inline panel (md: override keeps desktop untouched). */}
            {/* 34px on mobile — the chrome row's avatar/chevron height (Convention
                #27). At the old 40 the row was 6px taller than every other chrome,
                so the vertically-centred title landed at y=20 and sat outside the
                12–19 rhythm band. It passed the sweep for years only because the
                detector was measuring THIS chip's initials as the title. Desktop
                (md:w-8) is unchanged. */}
            <MonogramChip
              initials={getInitials(displayName)}
              className="w-[34px] h-[34px] md:w-8 md:h-8"
              style={{ fontFamily: "var(--serif)", fontSize: 13 }}
            />
            {/* Mobile: tapping the name/meta opens chat settings (iMessage/Messenger
                pattern — replaces the settings gear). Desktop keeps its own buttons, so
                the tap is gated to phone width and the cursor stays default there. */}
            <div
              className="flex-1 min-w-0 cursor-pointer md:cursor-default"
              onClick={() => { if (isMobileViewport()) setShowSettings(true) }}
            >
              <div className="flex items-center gap-2">
                {/* Mobile: the name is the whole title block (no member-count sub),
                    so it takes the chrome-title size and centers against the avatar. */}
                {/* Two nodes, not one: the mobile title takes POCKET_CHROME_TITLE
                    (the ONE chrome type — spreading it inline would beat any
                    `md:text-[…]` class, so desktop could never override it), while
                    desktop keeps its 16/normal panel heading. */}
                <h2 className="md:hidden truncate" style={{ ...POCKET_CHROME_TITLE }}>{displayName}</h2>
                <h2 className="hidden md:block truncate leading-none text-[16px] font-normal" style={{ fontFamily: "var(--serif)", color: "var(--ink)", letterSpacing: "-0.01em" }}>{displayName}</h2>
                <div className="hidden md:flex items-center flex-shrink-0">
                  {memberFirstNames.slice(0, 4).map((name, i) => (
                    <span
                      key={i}
                      style={{
                        width: 16, height: 16, borderRadius: 99,
                        background: "var(--plum)",
                        color: "var(--cream-panel)", fontSize: 9, fontWeight: 500,
                        display: "inline-grid", placeItems: "center",
                        marginLeft: i ? -4 : 0,
                        border: "1.5px solid var(--cream-panel)",
                        flexShrink: 0,
                      }}
                    >{name.charAt(0).toUpperCase()}</span>
                  ))}
                </div>
                <p className="hidden md:block text-[12px] text-[var(--muted-text)] truncate">
                  {memberCount} member{memberCount !== 1 ? "s" : ""} · {memberFirstNames.slice(0, 8).join(", ")}
                </p>
              </div>
            </div>
            {/* Desktop action buttons — Search + User only */}
            <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
              <button onClick={openSearch} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <Search size={14} />
              </button>
              <button onClick={() => setShowSettings(true)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--line-2)", background: "transparent", color: "var(--body)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <User size={14} />
              </button>
            </div>
            {/* Mobile carries NO chrome actions — settings is reached by tapping the
                chat name above (iMessage/Messenger pattern); message search stays a
                desktop affordance. */}
          </>
        )}
      </div>
      {inline && <div className="hidden md:block"><InsetHairline style={{ margin: "0 16px" }} /></div>}

      {/* ── Pinned message banner ── */}
      {pinnedMessage && (
        <div
          className="flex-shrink-0 bg-[var(--ivory)] px-4 py-2 flex items-center gap-2.5 cursor-pointer"
          onClick={() => scrollToMessage(pinnedMessage.id)}
        >
          <Pin className="w-3.5 h-3.5 text-[var(--plum)] flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-[var(--plum)]">{pinnedMessage.sender_name}</p>
            <p className="text-[12px] text-[var(--body)] truncate">
              {replyPreviewLabel(pinnedMessage.content, pinnedMessage.attachment_type, pinnedMessage.attachment_name)}
            </p>
          </div>
          {canPin && (
            <button
              onClick={(e) => { e.stopPropagation(); handleUnpin() }}
              className="flex-shrink-0 p-1 text-[var(--faint)] hover:text-[var(--body)] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ── Messages area ── */}
      {/* `data-bottom-anchored`: a transcript stacks from the BOTTOM, so "how far
          down does content start" is not a meaningful reading here — a quiet chat
          legitimately begins near the bottom of the viewport. Marked at the
          component so e2e/mobile-screen-sweep skips it by property rather than by
          keeping a list of screen names (same shape as `data-empty-state`). */}
      <div data-bottom-anchored ref={scrollContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 md:px-6 pt-2 pb-4 md:py-4">
        {loading ? (
          <Spinner />
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-[14px] font-medium text-[var(--ink)]/40">No messages yet</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {processedMessages.map((msg, i) => {
              // Cheap neighbor-derivations only — all row rendering lives in the
              // memoized <MessageRow/> (app/home/tabs/message-row.tsx).
              const isOwn = msg.sender_id === userId
              const prevMsg = i > 0 ? processedMessages[i - 1] : null
              const nextMsg = i < processedMessages.length - 1 ? processedMessages[i + 1] : null
              const isFirstInGroup = !prevMsg || !sameMinute(msg, prevMsg)
              const isLastInGroup = !nextMsg || !sameMinute(msg, nextMsg)
              const showDateSep = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(msg.created_at).toDateString()
              const isLatestOwn = latestOwnMsg?.id === msg.id
              return (
                <MessageRow
                  key={msg.id}
                  msg={msg}
                  isOwn={isOwn}
                  isFirstMessage={i === 0}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                  showDateSep={showDateSep}
                  showGroupGap={isFirstInGroup && i > 0 && !showDateSep}
                  senderDeparted={!!(msg.sender_id && departedIds.has(msg.sender_id))}
                  userId={userId}
                  canPin={canPin}
                  isAdminOrLeader={canModerate}
                  isEmojiPickerOpen={emojiPickerFor === msg.id}
                  isFullPickerOpen={fullReactionPickerFor === msg.id}
                  isContextMenuOpen={contextMenuFor === msg.id}
                  isDeleting={deletingId === msg.id}
                  isEditing={editingId === msg.id}
                  isPollMenuOpen={pollMenuFor === msg.id}
                  isPinned={pinnedMessageId === msg.id}
                  editText={editingId === msg.id ? editText : undefined}
                  highlightQuery={searchMode && searchQuery.trim() && searchMatchSet.has(msg.id) ? searchQuery : undefined}
                  isActiveSearchMatch={searchMatches[searchMatchIndex] === msg.id}
                  reactions={reactions[msg.id]}
                  linkPreview={previewByMsgId[msg.id]}
                  readReceipts={readReceiptMap[msg.id]}
                  poll={msg.poll_id ? pollsData[msg.poll_id] : undefined}
                  pollUserVote={msg.poll_id ? pollVotes[msg.poll_id] : undefined}
                  pollCounts={msg.poll_id ? pollCounts[msg.poll_id] : undefined}
                  isChangingVote={msg.poll_id ? changingVotePollIds.has(msg.poll_id) : false}
                  isLargeRoom={isLargeRoom}
                  isLatestOwn={isLatestOwn}
                  seenByCount={isLatestOwn ? seenByCount : null}
                  seenByOpen={isLatestOwn ? seenByOpen : false}
                  seenByList={isLatestOwn ? seenByList : null}
                  onToggleSeenBy={isLatestOwn ? toggleSeenBy : undefined}
                  registerMessageRef={registerMessageRef}
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onReact={handleReact}
                  onDeleteMessage={handleDeleteMessage}
                  onDeletePoll={handleDeletePoll}
                  onSaveEdit={handleEditMessage}
                  onStartEdit={startEdit}
                  onForward={openForwardSheet}
                  onReport={setReportingMsg}
                  onPin={handlePin}
                  onUnpin={handleUnpin}
                  onScrollToMessage={scrollToMessage}
                  onOpenVoteSheet={openVoteSheet}
                  setEmojiPickerFor={setEmojiPickerFor}
                  setFullReactionPickerFor={setFullReactionPickerFor}
                  setContextMenuFor={setContextMenuFor}
                  setDeletingId={setDeletingId}
                  setEditingId={setEditingId}
                  setEditText={setEditText}
                  setReplyingTo={setReplyingTo}
                  setPollMenuFor={setPollMenuFor}
                />
              )
            })}

            {/* Typing indicators */}
            {Object.entries(typingUsers).slice(0, 3).map(([uid, { name, avatarUrl }]) => {
              const typerName = displayNameById[uid] ?? name
              return (
              <div key={uid} className="flex items-center gap-2 mt-3">
                <MonogramChip initials={typerName.charAt(0).toUpperCase()} avatarUrl={avatarUrl || undefined} className="w-7 h-7 text-[11px] font-medium" />
                <div className="bg-[var(--ivory)] rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
                <span style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: "12px", color: "var(--muted-text)" }}>{typerName} is typing…</span>
              </div>
              )
            })}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {moderationWarning && (
        <div className="flex-shrink-0 mx-4 mb-2 rounded-xl bg-[var(--plum)]/8 px-4 py-2.5 text-[13px] text-[var(--plum)] font-medium">
          {moderationWarning}
        </div>
      )}

      <Composer
        groupArchived={groupArchived}
        displayName={displayName}
        mentionMembers={mentionMembers}
        replyingTo={replyingTo}
        sending={sending}
        uploading={uploading}
        pollActive={showPollCreator}
        onSend={handleSend}
        onSendGif={handleSendGif}
        onTyping={onTyping}
        onClearReply={onClearReply}
        onSetPollOpen={onSetPollOpen}
      />

      {/* Overlay to dismiss message-row emoji / context menu / poll menu. The
          composer's own GIF + emoji pickers render their dismiss overlay in <Composer>. */}
      {(emojiPickerFor || contextMenuFor || fullReactionPickerFor || pollMenuFor) && (
        <div
          className="fixed inset-0 z-[155] md:left-[var(--shell-offset)]"
          onPointerDown={() => { setEmojiPickerFor(null); setContextMenuFor(null); setFullReactionPickerFor(null); setPollMenuFor(null) }}
        />
      )}

      {/* Vote modal */}
      {votingPollId && (() => {
        const vPoll = pollsData[votingPollId]
        const vUserVote = pollVotes[votingPollId]
        const vCounts = pollCounts[votingPollId] ?? []
        const vTotal = vCounts.reduce((s, c) => s + c, 0)
        const vVoters = pollVoters[votingPollId] ?? []
        const closeFn = () => { setVotingPollId(null); setPendingVoteOption(undefined); setChangingVotePollIds(prev => { const n = new Set(prev); n.delete(votingPollId); return n }) }
        // displaySelection: what the user currently has highlighted in the modal (before confirming)
        const displaySelection: number | undefined = pendingVoteOption === "unvote" ? undefined : pendingVoteOption !== undefined ? pendingVoteOption : vUserVote
        const hasPending = pendingVoteOption !== undefined
        const confirmLabel = pendingVoteOption === "unvote" ? "Remove vote" : vUserVote !== undefined ? "Change vote" : "Submit vote"
        return (
          <CentralModal
            onClose={closeFn}
            title="Poll"
            sheet
            maxWidth={440}
            footer={vPoll ? (
              <>
                <button
                  onClick={closeFn}
                  className="flex-1 py-2.5 rounded-xl border border-[var(--line)] text-[13px] font-medium text-[var(--body)] hover:bg-[var(--body-bg)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={!hasPending}
                  onClick={async () => {
                    if (pendingVoteOption === "unvote") {
                      await handleVote(votingPollId, vUserVote!)
                    } else if (pendingVoteOption !== undefined) {
                      await handleVote(votingPollId, pendingVoteOption)
                    }
                    closeFn()
                  }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-colors"
                  style={{ background: hasPending ? "var(--plum)" : "var(--line)", color: hasPending ? "var(--cream-on-dark)" : "var(--muted-text)", cursor: hasPending ? "pointer" : "default" }}
                >
                  {hasPending ? confirmLabel : "Select an option"}
                </button>
              </>
            ) : undefined}
          >
              {vPoll ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-[var(--muted-text)]">{vTotal} vote{vTotal !== 1 ? "s" : ""}</p>
                      {vTotal > 0 && (
                        <button
                          onClick={() => { setVotersPollId(votingPollId); closeFn() }}
                          className="text-[12px] font-medium text-[var(--plum)] hover:opacity-70 transition-opacity"
                        >
                          See all votes
                        </button>
                      )}
                    </div>
                    <p className="text-[15px] font-medium text-[var(--ink)] leading-snug mb-2">{vPoll.question}</p>
                    {vPoll.options.map((opt, oi) => {
                      const count = vCounts[oi] ?? 0
                      const pct = vTotal > 0 ? Math.round((count / vTotal) * 100) : 0
                      const isSelected = displaySelection === oi
                      const optVoters = vVoters.filter(v => v.option_index === oi).slice(0, 3)
                      return (
                        <button
                          key={oi}
                          onClick={() => {
                            if (isSelected) {
                              // Clicking highlighted option: unvote if it was original, revert if it was a pending change
                              if (oi === vUserVote) setPendingVoteOption("unvote")
                              else setPendingVoteOption(undefined)
                            } else {
                              setPendingVoteOption(oi)
                            }
                          }}
                          className="w-full text-left px-4 py-3.5 rounded-xl border transition-all active:scale-[0.98]"
                          style={{ borderColor: isSelected ? "var(--plum)" : "var(--line)", background: isSelected ? "color-mix(in srgb, var(--plum) 5%, transparent)" : "var(--cream-panel)" }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? "border-[var(--plum)] bg-[var(--plum)]" : "border-[var(--dashed)]"}`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <span className={`text-[14px] font-medium truncate ${isSelected ? "text-[var(--plum)]" : "text-[var(--ink)]"}`}>{opt}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                              {optVoters.length > 0 && (
                                <div className="flex items-center">
                                  {optVoters.map((v, vi) => (
                                    <MonogramChip
                                      key={v.user_id}
                                      initials={v.name.charAt(0).toUpperCase()}
                                      avatarUrl={v.avatar_url}
                                      className={`w-5 h-5 border border-white${vi > 0 ? " -ml-1.5" : ""}`}
                                      style={{ fontSize: 7, fontWeight: 500 }}
                                    />
                                  ))}
                                  {count > 3 && (
                                    <div className="-ml-1.5 w-5 h-5 rounded-full bg-[var(--line)] border border-white flex items-center justify-center flex-shrink-0">
                                      <span style={{ fontSize: 7, fontWeight: 500, color: "var(--body)" }}>+{count - 3}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <span className={`text-[12px] font-medium ${isSelected ? "text-[var(--plum)]" : "text-[var(--muted-text)]"}`}>{count > 0 ? `${pct}%` : ""}</span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-[var(--line-3)] overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: vTotal > 0 ? `${pct}%` : "0%", background: isSelected ? "var(--plum)" : "var(--dashed)" }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
              ) : (
                <div className="flex items-center justify-center py-10">
                  <div className="w-5 h-5 border-2 border-[var(--plum)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
          </CentralModal>
        )
      })()}

      {/* Voters breakdown modal */}
      {votersPollId && (() => {
        const vPoll = pollsData[votersPollId]
        const vVoters = pollVoters[votersPollId] ?? []
        return (
          <CentralModal onClose={() => setVotersPollId(null)} title="Votes" sheet maxWidth={440} z={210}>
              <div className="flex flex-col gap-5">
                {vPoll ? vPoll.options.map((opt, oi) => {
                  const optVoters = vVoters.filter(v => v.option_index === oi)
                  if (optVoters.length === 0) return null
                  return (
                    <div key={oi}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[13px] font-medium text-[var(--ink)]">{opt}</p>
                        <span className="text-[11px] text-[var(--muted-text)] font-medium">{optVoters.length} vote{optVoters.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {optVoters.map(v => (
                          <div key={v.user_id} className="flex items-center gap-2.5">
                            <MonogramChip
                              initials={v.name.charAt(0).toUpperCase()}
                              avatarUrl={v.avatar_url}
                              className="w-7 h-7"
                              style={{ fontSize: 10, fontWeight: 500 }}
                            />
                            <span className="text-[13px] text-[var(--ink)]">{v.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-[var(--plum)] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
          </CentralModal>
        )
      })()}

      {/* Poll creator modal */}
      {showPollCreator && !groupArchived && (
        <CentralModal
          onClose={() => setShowPollCreator(false)}
          title="Create a poll"
          sheet
          maxWidth={440}
          footer={
            <button
              onClick={handleCreatePoll}
              disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
              className="w-full bg-[var(--plum)] hover:bg-[var(--plum-2)] disabled:opacity-50 text-white font-medium py-3.5 rounded-xl transition-colors text-[14px]"
            >
              Create poll
            </button>
          }
        >
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-normal text-[var(--muted-text)] uppercase tracking-wide mb-1.5 block">Question</label>
                <input
                  autoFocus
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                  placeholder="Ask something…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--cream-panel)] text-[14px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:border-[var(--plum)]/40 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-normal text-[var(--muted-text)] uppercase tracking-wide mb-1.5 block">Options</label>
                <div className="flex flex-col gap-2">
                  {pollOptions.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        value={opt}
                        onChange={e => setPollOptions(prev => { const next = [...prev]; next[oi] = e.target.value; return next })}
                        placeholder={`Option ${oi + 1}`}
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--cream-panel)] text-[14px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:border-[var(--plum)]/40 transition-colors"
                      />
                      {pollOptions.length > 2 && (
                        <button onClick={() => setPollOptions(prev => prev.filter((_, i) => i !== oi))} className="text-[var(--faint)] hover:text-[var(--body)] transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 5 && (
                    <button
                      onClick={() => setPollOptions(prev => [...prev, ""])}
                      className="flex items-center gap-1.5 text-[13px] text-[var(--plum)] font-medium hover:opacity-70 transition-opacity self-start mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add option
                    </button>
                  )}
                </div>
              </div>
            </div>
        </CentralModal>
      )}

      {/* Forward sheet — the forwarded-message preview lives in the BODY (footer
          is reserved for action rows per §4.17). */}
      {forwardingMsg && (
        <CentralModal
          onClose={() => setForwardingMsg(null)}
          title="Forward to"
          sheet
          maxWidth={420}
        >
            <p className="text-[11px] text-[var(--muted-text)] truncate mb-2">&ldquo;{replyPreviewLabel(forwardingMsg.content, forwardingMsg.attachment_type, forwardingMsg.attachment_name).slice(0, 60)}{forwardingMsg.content.length > 60 ? "…" : ""}&rdquo;</p>
            <div>
              {forwardGroups.length === 0 ? (
                <p className="text-[13px] text-[var(--muted-text)] px-3 py-4">No other chats available.</p>
              ) : (
                forwardGroups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleForward(g.id)}
                    className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-[var(--cream-panel)] active:bg-[var(--cream-3)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <MonogramChip initials={g.name.charAt(0).toUpperCase()} className="w-9 h-9 text-[12px] font-medium" />
                      <span className="text-[14px] font-medium text-[var(--ink)]">{g.name}</span>
                    </div>
                    {forwardSentTo === g.id ? (
                      <Check className="w-4 h-4" style={{ color: "var(--success)" }} />
                    ) : (
                      <Forward className="w-4 h-4 text-[var(--faint)]" />
                    )}
                  </button>
                ))
              )}
            </div>
        </CentralModal>
      )}

      {/* Report message (§1.2) */}
      {reportingMsg && (
        <ReportModal
          targetType="message"
          targetId={reportingMsg.id}
          targetUserId={reportingMsg.sender_id}
          targetName={reportingMsg.sender_name}
          onClose={() => setReportingMsg(null)}
          onBlocked={() => mutateBlocks()}
        />
      )}
    </div>
    </AnimateIn>

    {/* Image lightbox */}
    {lightboxUrl && (
      <div
        className="fixed inset-0 z-[300] bg-black/92 flex items-center justify-center"
        onClick={() => setLightboxUrl(null)}
      >
        <button
          className="absolute top-[max(env(safe-area-inset-top),1rem)] right-4 w-10 h-10 rounded-full bg-[var(--cream-panel)]/10 flex items-center justify-center text-white hover:bg-[var(--cream-panel)]/20 transition-colors"
          onClick={() => setLightboxUrl(null)}
        >
          <X className="w-5 h-5" />
        </button>
        <img
          src={lightboxUrl}
          alt="Full size"
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>
  )
}

// One conversation row inside a Pocket grouped card: PocketRow fed from a
// ChatGroup — squircle chip (`solid` = ministry-wide chat), "Sender: text"
// preview, time + unread dot right column.
function PocketChatRow({ group, isLast, onClick }: { group: ChatGroup; isLast: boolean; onClick: () => void }) {
  return (
    <PocketRow
      leading={<PocketChip letter={group.name.charAt(0).toUpperCase()} solid={group.is_central_chat === true} />}
      title={group.name}
      titleAccessory={
        <>
          {group.pinned && <Pin style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0 }} aria-label="Pinned" />}
          {group.muted && <BellOff style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0 }} aria-label="Muted" />}
        </>
      }
      sub={group.last_message
        ? (group.last_sender ? `${group.last_sender}: ${group.last_message}` : group.last_message)
        : "No messages yet"}
      time={group.last_message_time ? formatRelativeTime(group.last_message_time) : undefined}
      showDot={group.unread_count > 0 && !group.muted}
      isLast={isLast}
      onClick={onClick}
    />
  )
}

// The single tonal grouped card holding a set of chat rows (mockup `.card`).
function PocketChatCard({ groups, onOpen }: { groups: ChatGroup[]; onOpen: (id: string, name: string) => void }) {
  return (
    <PocketRowCard>
      {groups.map((g, i) => (
        <PocketChatRow key={g.id} group={g} isLast={i === groups.length - 1} onClick={() => onOpen(g.id, g.name)} />
      ))}
    </PocketRowCard>
  )
}

// Church chats sectioned into General / Groups / Teams (mockup `.grp` headers +
// per-section tonal card). Each header carries its own compact plum + that opens
// the create sheet pre-set to that section's category (leader/admin only). Empty
// sections self-hide; a fully-empty church scope is handled by the caller.
function PocketChurchSections({ sections, canCreate, onOpen, onAddInSection }: {
  sections: Record<ChurchSection, ChatGroup[]>
  canCreate: boolean
  onOpen: (id: string, name: string) => void
  onAddInSection: (category: ChurchSection) => void
}) {
  // The FIRST rendered section sits tight under the scope pills — the 20px
  // section gap is a between-sections rhythm, not a lead-in (empty sections
  // self-hide, so "first" is the first section that actually renders).
  const visibleKeys = CHURCH_SECTION_DEFS.filter(({ key }) => sections[key].length > 0).map(({ key }) => key)
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {CHURCH_SECTION_DEFS.map(({ key, label }) => {
        const rooms = partitionPinned(sections[key])
        if (rooms.length === 0) return null
        return (
          <div key={key}>
            <PocketKicker
              label={label}
              style={{ margin: `${key === visibleKeys[0] ? 2 : 20}px 4px 8px` }}
              action={canCreate ? (
                <button
                  onClick={() => onAddInSection(key)}
                  aria-label={`New ${label.toLowerCase()} chat`}
                  style={{ background: "none", border: "none", color: "var(--plum)", width: 26, height: 26, display: "grid", placeItems: "center", margin: "-4px 0", cursor: "pointer" }}
                >
                  <Plus style={{ width: 15, height: 15 }} strokeWidth={1.8} />
                </button>
              ) : undefined}
            />
            <PocketChatCard groups={rooms} onOpen={onOpen} />
          </div>
        )
      })}
    </div>
  )
}

export function ChatsTab({ userId, userProfile, userRole, ministryId, ministryName, onOpenChat, onTotalUnreadChange, refreshKey, onOpenDirectory, onGoToProfile, activeGroupId, canCreateChurchChat, fallbackChats, onComposerOpenChange, onOpenDraftDm }: ChatsTabProps) {
  const { setParam } = useNavState()
  const [subTab, setSubTab] = useState<"church" | "my">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("chats") : null
    return (p === "church" || p === "my") ? p : "church"
  })
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  // Land the Church↔My scope swap at the top (window scroll on phone width).
  useScrollResetOn([subTab])

  // Report the full-screen CreateChatScreen up/down so home-app hides the pill
  // nav (§2.2). Cleanup covers unmount-while-open (e.g. URL-driven tab change).
  useEffect(() => {
    onComposerOpenChange?.(showCreateChat !== null)
    return () => onComposerOpenChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateChat])
  // Which church section the create sheet should pre-select, when opened from a
  // section header's + (ignored for My Chats). Reset whenever the sheet closes.
  const [createChatCategory, setCreateChatCategory] = useState<ChurchSection | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")
  // Mobile search: the field is always mounted; `searchOpen` swaps the body below
  // it to the search view. Kept separate from `search` (the desktop panel's own
  // filter) so the two surfaces never share a stale query.
  const [mobileSearch, setMobileSearch] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const closeMobileSearch = useCallback(() => { setSearchOpen(false); setMobileSearch("") }, [])

  // Escape leaves search, mirroring the X.
  useEffect(() => {
    if (!searchOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMobileSearch() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [searchOpen, closeMobileSearch])

  // While searching, the floating pill nav hides — same rule the full-screen
  // composer uses (mobile §3: nav hidden on composers).
  useEffect(() => {
    onComposerOpenChange?.(searchOpen)
    return () => onComposerOpenChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen])

  const isAdminOrLeader = isChatManageRole(userRole)

  // Tapping a person in search: reuse the DM you already share, otherwise open a
  // draft. The group is only created on the first send (app/home/dm.ts).
  const searchSupabase = useMemo(() => createClient(), [])
  const handleOpenPerson = useCallback(async (p: { id: string; name: string }) => {
    const existing = await findExistingDm(searchSupabase, userId, p.id)
    if (existing) onOpenChat(existing, p.name, "dm")
    else onOpenDraftDm?.({ id: p.id, name: p.name })
  }, [searchSupabase, userId, onOpenChat, onOpenDraftDm])

  // Stable key (no refreshKey) so revisits dedupe to one cache entry and paint instantly.
  const { data, error, isLoading, mutate } = useSWR<ChatGroup[]>(
    userId && ministryId ? ["chat-list", userId, ministryId] : null,
    fetchChatList,
    { fallbackData: fallbackChats },
  )

  // Prefer this panel's own SWR data when it actually has items; otherwise fall
  // back to fallbackChats (home-app's reliable plain-fetch state), which renders
  // even when this code-split panel's SWR hook stays undefined.
  const allGroups = (data && data.length > 0 ? data : fallbackChats) ?? data ?? []
  const churchChats = allGroups.filter((g) => g.type === "church" && !g.archived)
  const archivedChurchChats = allGroups.filter((g) => g.type === "church" && g.archived)
  const myChats = allGroups.filter((g) => g.type !== "church")
  // Treat "errored with no usable data" as still-loading so a poisoned/failed
  // fetch shows the spinner, never the "No chats" empty state. If stale data
  // exists (keepPreviousData), fall through and render it (stale > empty).
  const loading = isLoading || (!!error && allGroups.length === 0)

  // Optimistic unread-clear on the shared cache key (survives revalidation timing).
  function clearUnread(groupId: string) {
    mutate(
      (current) => current ? current.map((g) => (g.id === groupId ? { ...g, unread_count: 0 } : g)) : current,
      { revalidate: false },
    )
  }

  function handleOpenChat(groupId: string, groupName: string) {
    clearUnread(groupId)
    onOpenChat(groupId, groupName)
  }

  // Clear unread whenever activeGroupId changes (covers auto-open, HomeTab clicks, etc.)
  useEffect(() => {
    if (activeGroupId) clearUnread(activeGroupId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId])

  // Follow the open chat's category: when activeGroupId changes to a group present
  // in allGroups, snap the church/my subtab to that group's category. Reacts to
  // activeGroupId CHANGES only (the ref ensures an allGroups refresh alone won't
  // re-snap, so the user can freely click the other subtab while a chat stays open),
  // but still resolves once allGroups loads after activeGroupId was already set.
  const subTabSyncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!activeGroupId) { subTabSyncedFor.current = null; return }
    if (subTabSyncedFor.current === activeGroupId) return
    const g = (data ?? []).find((x) => x.id === activeGroupId)
    if (!g) return
    subTabSyncedFor.current = activeGroupId
    setSubTab(g.type === "church" ? "church" : "my")
  }, [activeGroupId, data])

  // Revalidate the shared list when a chat closes (refreshKey bumps) — without
  // putting refreshKey in the SWR key (that would fragment the cache).
  useEffect(() => {
    if (refreshKey) mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  // Drive the bottom-nav unread badge off SWR data (side effect out of the fetcher).
  useEffect(() => {
    if (data) {
      const total = data.filter((g) => !g.archived && !g.muted).reduce((s, g) => s + g.unread_count, 0)
      onTotalUnreadChange(total)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const rawActive = subTab === "church" ? churchChats : myChats
  const active = search.trim()
    ? rawActive.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : rawActive
  const monoStyle = MONO_STYLE

  // New-chat from the chrome — My chats only. On the Church scope the row-level +
  // is dropped (matches the desktop panel); each church section carries its own +.
  const canShowNewChat = subTab === "my"
  const openNewChat = () => {
    setCreateChatCategory(undefined)
    setShowCreateChat("my")
  }

  return (
    <div className="pb-2 md:pb-0 md:h-full md:flex md:flex-col">
      {/* Mobile chrome (B3 Pocket) — "Chats" + directory ghost + avatar. New-chat
          moved inline onto the scope-pills row below. */}
      <PocketChrome
        title="Chats"
        userName={userProfile.name}
        avatarUrl={userProfile.avatar_url}
        onAvatarClick={onGoToProfile}
        action={
          <PocketRoundButton variant="ghost" onClick={onOpenDirectory} ariaLabel="Directory">
            <Users style={{ width: 17, height: 17 }} strokeWidth={1.6} />
          </PocketRoundButton>
        }
      />

      {/* Desktop Plan C header */}
      <div className="hidden md:block px-5 pt-5 pb-4 border-b border-[var(--line-2)] flex-shrink-0">
        <p style={monoStyle}>Workspace</p>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", lineHeight: 1.1, color: "var(--ink)", marginTop: "4px" }}>{ministryName}</p>
      </div>

      {/* Desktop search */}
      <div className="hidden md:flex items-center gap-2 mx-3 my-3 px-3.5 py-2.5 border border-[var(--line-2)] rounded-lg bg-[var(--body-bg)] text-[var(--muted-text)] flex-shrink-0">
        <Search className="w-4 h-4 flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search messages"
          className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-[var(--muted-text)] text-[var(--ink)]"
        />
      </div>

      {/* Desktop mode switcher — exclusive filter (Church | My Chats), SegmentedControl (R4/R12) */}
      <div className="hidden md:flex flex-shrink-0 px-4 py-3">
        <SegmentedControl
          aria-label="Chat scope"
          options={[{ id: "church", label: "Church Chats" }, { id: "my", label: "My Chats" }]}
          value={subTab}
          onChange={(t) => {
            setSubTab(t)
            setSearch("")
            setParam("chats", t === "church" ? null : t)
          }}
        />
      </div>

      <div className="px-5 pt-1 pb-2 md:pt-2 md:px-0 md:flex-1 md:overflow-y-auto">
      {/* Mobile scope pills (B3 Pocket) — Church / My chats; the new-chat + sits
          right-aligned on the same row, My chats scope only. */}
      {/* Scope pills hide while searching — search spans BOTH scopes, so leaving a
          scope filter on screen would imply results are filtered by it. */}
      <div className={`items-center gap-2 mb-4 md:hidden ${searchOpen ? "hidden" : "flex"}`}>
        <PocketFilterChip label="Church" active={subTab === "church"} onClick={() => { setSubTab("church"); setSearch(""); setParam("chats", null) }} />
        <PocketFilterChip label="My chats" active={subTab === "my"} onClick={() => { setSubTab("my"); setSearch(""); setParam("chats", "my") }} />
        {canShowNewChat && (
          <div className="ml-auto">
            <PocketRoundButton variant="plum" onClick={openNewChat} ariaLabel="New chat">
              <Plus style={{ width: 17, height: 17 }} strokeWidth={2} />
            </PocketRoundButton>
          </div>
        )}
      </div>

      {/* Search (mobile) — the field is always present; focusing it swaps the body
          below to the search view IN PLACE, so the field stays pinned and the
          change reads as a transition rather than a navigation. Chats + people,
          so you can reach someone you have never messaged. */}
      <div className="md:hidden mb-4">
        <PocketSearchField
          value={mobileSearch}
          onChange={setMobileSearch}
          placeholder="Search"
          onFocus={() => setSearchOpen(true)}
          trailing={searchOpen ? (
            <button
              onClick={closeMobileSearch}
              aria-label="Close search"
              style={{ background: "none", border: "none", padding: 0, display: "grid", placeItems: "center", color: "var(--muted-text)", cursor: "pointer", flexShrink: 0 }}
            >
              <X style={{ width: 17, height: 17 }} />
            </button>
          ) : undefined}
        />
      </div>

      {searchOpen ? (
        <div className="md:hidden chat-search-enter">
          <ChatSearchView
            query={mobileSearch}
            chats={data ?? []}
            userId={userId}
            ministryId={ministryId}
            onOpenChat={(id, name) => { closeMobileSearch(); handleOpenChat(id, name) }}
            onOpenPerson={(p) => { closeMobileSearch(); handleOpenPerson(p) }}
          />
        </div>
      ) : (
      <>
      {/* Push-notification prompt — self-hides unless permission is 'default' & unsubscribed & not dismissed */}
      <div className="md:px-4">
        <PushSubscribeCard userId={userId} ministryId={ministryId} notificationSettings={userProfile.notification_settings} variant="pocket" style={{ marginBottom: 16 }} />
      </div>

      {loading ? (
        <Spinner />
      ) : subTab === "my" ? (
        /* My chats — one flat Pocket grouped card (mockup); pinned-first order. */
        active.length === 0 ? (
          <EmptyState
            icon={<Users className="w-7 h-7" />}
            title="No personal chats"
            subtitle="Tap + to start a new chat."
          />
        ) : (
          <PocketChatCard groups={partitionPinned(active)} onOpen={handleOpenChat} />
        )
      ) : active.length === 0 && archivedChurchChats.length === 0 ? (
        <EmptyState
          icon={<Users className="w-7 h-7" />}
          title="No church chats"
          subtitle="You haven't been added to any church chats yet"
        />
      ) : (
        /* Church chats — sectioned into General / Groups / Teams (Daybreak ruling
           #3), each its own tonal card with a per-section + create; archived self-hides. */
        <div className="flex flex-col gap-4">
          {active.length > 0 && (
            <PocketChurchSections
              sections={sectionChurchChats(active)}
              canCreate={canCreateChurchChat}
              onOpen={handleOpenChat}
              onAddInSection={(category) => { setCreateChatCategory(category); setShowCreateChat("church") }}
            />
          )}

          {/* Archived (Church chats only) — collapsed accordion, self-hides when none */}
          {archivedChurchChats.length > 0 && (
            <div>
              <button
                onClick={() => setShowArchived((s) => !s)}
                className="w-full flex items-center justify-between py-2 px-1"
              >
                <span style={POCKET_KICKER_STYLE}>
                  Archived · {archivedChurchChats.length}
                </span>
                <ChevronDown className={`w-4 h-4 text-[var(--muted-text)] transition-transform duration-200 ${showArchived ? "rotate-180" : ""}`} />
              </button>
              {showArchived && (
                <div style={{ opacity: 0.6, marginTop: 8 }}>
                  <PocketChatCard groups={archivedChurchChats} onOpen={handleOpenChat} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </>
      )}

      {showCreateChat && (
        <CreateChatScreen
          userId={userId}
          userName={userProfile.name}
          ministryId={ministryId}
          groupType={showCreateChat}
          initialCategory={showCreateChat === "church" ? createChatCategory : undefined}
          onClose={() => { setShowCreateChat(null); setCreateChatCategory(undefined) }}
          onCreated={(group) => {
            const newGroup: ChatGroup = {
              id: group.id,
              name: group.name,
              type: showCreateChat!,
              category: group.category ?? null,
              last_message: null,
              last_sender: null,
              last_message_time: null,
              unread_count: 0,
              archived: false,
            }
            mutate((current) => [newGroup, ...(current ?? [])], { revalidate: false })
            setShowCreateChat(null)
            setCreateChatCategory(undefined)
            onOpenChat(group.id, group.name)
          }}
        />
      )}
      </div>{/* end inner scroll div */}

    </div>
  )
}

export function ChatGroupCard({ group, onClick, isActive, locked }: { group: ChatGroup; onClick: () => void; isActive?: boolean; locked?: boolean }) {
  const firstInitial = group.name.charAt(0)
  // Glyph precedence: pinned + muted take the two available slots; lock drops when
  // both are set (a locked room is already implied by its section). With ≤1 of
  // pin/mute set, lock may render alongside. Order: pin, mute, lock.
  const showLock = locked && !(group.pinned && group.muted)
  // Muted silences the unread badge/dot regardless of unread_count.
  const showUnread = group.unread_count > 0 && !group.muted

  return (
    <button onClick={onClick} className="w-full text-left group">
      {/* Mobile style */}
      <div className="md:hidden bg-[var(--cream-panel)] border border-[var(--line)] rounded-[18px] p-4 hover:bg-[#F5F0E8] transition-colors">
        <div className="flex items-center gap-3.5">
          <MonogramChip
            initials={firstInitial}
            className="w-12 h-12 flex-shrink-0"
            style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400 }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0 pr-2">
                <h3 className="text-[15px] font-medium text-[var(--ink)] truncate">{group.name}</h3>
                {group.pinned && <Pin className="w-3 h-3 flex-shrink-0" style={{ color: "var(--muted-text)" }} aria-label="Pinned" />}
                {group.muted && <BellOff className="w-3 h-3 flex-shrink-0" style={{ color: "var(--muted-text)" }} aria-label="Muted" />}
                {showLock && <Lock className="w-3 h-3 flex-shrink-0" style={{ color: "var(--muted-text)" }} aria-label="Members only" />}
              </div>
              {group.last_message_time && <span className="text-[11px] text-[var(--muted-text)] flex-shrink-0">{formatRelativeTime(group.last_message_time)}</span>}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-[var(--body)] truncate">
                {group.last_message
                  ? group.last_sender ? <><span className="font-medium text-[var(--body)]">{group.last_sender}:</span> {group.last_message}</> : group.last_message
                  : <span className="italic text-[var(--muted-text)]">No messages yet</span>}
              </p>
              {showUnread && (
                <span className="w-6 h-6 bg-[var(--plum)] rounded-full text-[11px] font-medium text-[var(--cream)] flex items-center justify-center flex-shrink-0">{group.unread_count}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop panel item — proportioned for 220px context panel */}
      <div
        className="hidden md:flex items-center gap-2.5 px-2.5 py-2 transition-colors duration-100"
        style={{
          borderLeft: isActive ? "3px solid var(--plum)" : "3px solid transparent",
          background: isActive ? "var(--plum-tint)" : undefined,
          borderRadius: isActive ? "var(--r-callout)" : undefined,
          margin: "0 4px",
        }}
        onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--cream-3)" }}
        onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "" }}
      >
        <MonogramChip
          initials={firstInitial}
          className="flex-shrink-0"
          style={{ width: 38, height: 38, fontFamily: "var(--serif)", fontSize: "16px" }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
            <p className="text-[13px] truncate leading-tight" style={{ color: "var(--ink)", fontWeight: group.unread_count ? 600 : 500, flex: 1, minWidth: 0 }}>
              {group.name}
            </p>
            {group.pinned && <Pin style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0, alignSelf: "center" }} aria-label="Pinned" />}
            {group.muted && <BellOff style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0, alignSelf: "center" }} aria-label="Muted" />}
            {showLock && <Lock style={{ width: 11, height: 11, color: "var(--muted-text)", flexShrink: 0, alignSelf: "center" }} aria-label="Members only" />}
            {group.last_message_time && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.04em", color: "var(--muted-text)", flexShrink: 0 }}>
                {formatRelativeTime(group.last_message_time)}
              </span>
            )}
          </div>
          <p className="text-[11.5px] truncate leading-tight" style={{ color: group.unread_count ? "var(--body)" : "var(--muted-text)" }}>
            {group.last_message
              ? (group.last_sender ? `${group.last_sender}: ${group.last_message}` : group.last_message)
              : <span style={{ fontStyle: "italic" }}>No messages yet</span>}
          </p>
        </div>
        {showUnread && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--plum)", flexShrink: 0 }} />
        )}
      </div>
    </button>
  )
}

// ── ChatListPanel ────────────────────────────────────────────────────────────
// Self-contained panel component for the 220px DesktopSidebar context panel.
// Mirrors DirectoryMemberListPanel: own state + data fetching, minimal props.

export interface ChatListPanelProps {
  userId: string
  ministryId: string
  ministryName: string
  activeGroupId?: string | null
  onOpenChat: (id: string, name: string, type?: string) => void
  refreshKey: number
  canCreateChurchChat: boolean
  userProfile: Profile
  userRole: string
  fallbackChats?: ChatGroup[]
  /** Open a draft DM (no group row until the first send) — see app/home/dm.ts. */
  onOpenDraftDm?: (person: { id: string; name: string }) => void
}

export function ChatListPanel({ userId, ministryId, ministryName, activeGroupId, onOpenChat, refreshKey, canCreateChurchChat, userProfile, userRole, fallbackChats, onOpenDraftDm }: ChatListPanelProps) {
  const { setParam } = useNavState()
  const [subTab, setSubTab] = useState<"church" | "my">(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("chats") : null
    return (p === "church" || p === "my") ? p : "church"
  })
  const [showCreateChat, setShowCreateChat] = useState<"my" | "church" | null>(null)
  // Section to pre-select when the create sheet opens from a church section's +
  // button. Ignored for "my" chats.
  const [pendingCategory, setPendingCategory] = useState<ChurchSection | undefined>(undefined)
  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState("")
  // Focusing the field consumes the panel with the shared search body.
  const [searchOpen, setSearchOpen] = useState(false)
  const closePanelSearch = useCallback(() => { setSearchOpen(false); setSearch("") }, [])
  const panelSupabase = useMemo(() => createClient(), [])
  const handleOpenPersonPanel = useCallback(async (p: { id: string; name: string }) => {
    const existing = await findExistingDm(panelSupabase, userId, p.id)
    if (existing) onOpenChat(existing, p.name)
    else onOpenDraftDm?.({ id: p.id, name: p.name })
  }, [panelSupabase, userId, onOpenChat, onOpenDraftDm])

  // Same stable key + fetcher as mobile ChatsTab → SWR dedupes both to one cache
  // entry; revisits paint instantly from cache (no skeleton).
  const { data, error, isLoading, mutate } = useSWR<ChatGroup[]>(
    userId && ministryId ? ["chat-list", userId, ministryId] : null,
    fetchChatList,
    { fallbackData: fallbackChats },
  )

  // Prefer this panel's own SWR data when it actually has items; otherwise fall
  // back to fallbackChats (home-app's reliable plain-fetch state), which renders
  // even when this code-split panel's SWR hook stays undefined.
  const allGroups = (data && data.length > 0 ? data : fallbackChats) ?? data ?? []
  const churchChats = allGroups.filter((g) => g.type === "church" && !g.archived)
  const archivedChurchChats = allGroups.filter((g) => g.type === "church" && g.archived)
  const myChats = allGroups.filter((g) => g.type !== "church")
  // Treat "errored with no usable data" as still-loading so a poisoned/failed
  // fetch shows the spinner, never the "No chats" empty state. Stale data
  // (keepPreviousData) falls through and renders (stale > empty).
  const loading = isLoading || (!!error && allGroups.length === 0)

  // Optimistic unread-clear on the shared cache key.
  function clearUnread(groupId: string) {
    mutate(
      (current) => current ? current.map((g) => (g.id === groupId ? { ...g, unread_count: 0 } : g)) : current,
      { revalidate: false },
    )
  }

  function handleOpenChatPanel(groupId: string, groupName: string) {
    clearUnread(groupId)
    onOpenChat(groupId, groupName)
  }

  useEffect(() => {
    if (activeGroupId) clearUnread(activeGroupId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupId])

  // Follow the open chat's category — see ChatsTab above for rationale.
  const subTabSyncedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!activeGroupId) { subTabSyncedFor.current = null; return }
    if (subTabSyncedFor.current === activeGroupId) return
    const g = (data ?? []).find((x) => x.id === activeGroupId)
    if (!g) return
    subTabSyncedFor.current = activeGroupId
    setSubTab(g.type === "church" ? "church" : "my")
  }, [activeGroupId, data])

  // Revalidate the shared list when a chat closes (refreshKey bumps) — without
  // fragmenting the cache by putting refreshKey in the SWR key.
  useEffect(() => {
    if (refreshKey) mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const rawActive = subTab === "church" ? churchChats : myChats
  const active = search.trim()
    ? rawActive.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : rawActive
  const churchSections = subTab === "church" ? sectionChurchChats(active) : null
  const showPlusButton = subTab === "my" || (subTab === "church" && canCreateChurchChat)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Search — matches DirectoryMemberListPanel. Focusing it consumes the
          panel below with the SAME search body the mobile overlay uses, so this
          reaches people you've never messaged instead of only name-filtering the
          chats you're already in. The X restores the list. */}
      <div className="px-3 py-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--muted-text)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => { if (e.key === "Escape") closePanelSearch() }}
            placeholder="Search chats and people"
            className="w-full pl-9 pr-9 py-2 rounded-lg border text-[12.5px] placeholder:text-[var(--muted-text)] focus:outline-none focus:ring-2 focus:ring-[var(--plum)]/20"
            style={{ background: "var(--cream)", borderColor: "var(--line-2)", color: "var(--ink)" }}
          />
          {searchOpen && (
            <button
              onClick={closePanelSearch}
              aria-label="Close search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ background: "none", border: "none", padding: 2, display: "grid", placeItems: "center", color: "var(--muted-text)", cursor: "pointer" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <ChatSearchView
            query={search}
            chats={data ?? []}
            userId={userId}
            ministryId={ministryId}
            onOpenChat={(id, name) => { closePanelSearch(); handleOpenChatPanel(id, name) }}
            onOpenPerson={(p) => { closePanelSearch(); handleOpenPersonPanel(p) }}
          />
        </div>
      )}
      {!searchOpen && (
      <>

      {/* Church / My mode switcher — exclusive filter, SegmentedControl (R4/R12) */}
      <div className="px-3 flex-shrink-0">
        <SegmentedControl
          aria-label="Chat scope"
          options={[{ id: "church", label: "Church" }, { id: "my", label: "My Chats" }]}
          value={subTab}
          onChange={(t) => {
            setSubTab(t)
            setSearch("")
            setParam("chats", t === "church" ? null : t)
          }}
        />
      </div>

      {/* Count + plus button — My Chats only. On the Church subtab the count/+
          row is dropped; each section header carries its own + instead. */}
      {subTab === "my" && (
        <div className="flex items-center justify-between px-3 pt-4 pb-2 flex-shrink-0">
          <p style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)" }}>
            {`Direct · ${myChats.length}`}
          </p>
          {showPlusButton && (
            <button
              onClick={() => setShowCreateChat("my")}
              style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-text)", borderRadius: "var(--r-pill)", padding: 0 }}
              title="New chat"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* List */}
      <div className={`flex-1 overflow-y-auto ${subTab === "church" ? "pt-3" : ""}`}>
        <PushSubscribeCard userId={userId} ministryId={ministryId} notificationSettings={userProfile?.notification_settings} style={{ margin: "4px 12px 12px", padding: 16 }} />
        {loading ? (
          <div className="px-2 pt-2"><Spinner /></div>
        ) : active.length === 0 && !(subTab === "church" && archivedChurchChats.length > 0) ? (
          <p style={{ fontSize: 12, color: "var(--muted-text)", padding: "8px 12px", fontFamily: "var(--sans)" }}>
            {search.trim() ? "No results" : subTab === "church" ? "No church chats" : "No personal chats"}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 pt-1">
              {churchSections ? (
                CHURCH_SECTION_DEFS.flatMap(({ key, label }) => {
                  const rooms = partitionPinned(churchSections[key])
                  if (rooms.length === 0) return []
                  return [
                    <div key={`sec-${key}`} className="flex items-center justify-between px-4 pt-3 pb-1">
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)" }}>{label}</span>
                      {canCreateChurchChat && (
                        <button
                          onClick={() => { setPendingCategory(key); setShowCreateChat("church") }}
                          style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-text)", borderRadius: "var(--r-pill)", padding: 0 }}
                          title={`New ${label.toLowerCase()} chat`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>,
                    ...rooms.map((group) => (
                      <ChatGroupCard key={group.id} group={group} onClick={() => handleOpenChatPanel(group.id, group.name)} isActive={activeGroupId === group.id} locked={isLockedChat(group, ministryName)} />
                    )),
                  ]
                })
              ) : (
                partitionPinned(active).map((group) => (
                  <ChatGroupCard key={group.id} group={group} onClick={() => handleOpenChatPanel(group.id, group.name)} isActive={activeGroupId === group.id} />
                ))
              )}
            </div>
            {subTab === "church" && archivedChurchChats.length > 0 && (
              <div>
                <button
                  onClick={() => setShowArchived(s => !s)}
                  className="w-full flex items-center justify-between px-4 py-2"
                >
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-text)" }}>
                    Archived · {archivedChurchChats.length}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-[var(--faint)] transition-transform duration-200 ${showArchived ? "rotate-180" : ""}`} />
                </button>
                {showArchived && (
                  <div className="flex flex-col gap-2">
                    {archivedChurchChats.map((group) => (
                      <div key={group.id} className="opacity-50">
                        <ChatGroupCard group={group} onClick={() => handleOpenChatPanel(group.id, group.name)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Dashed "New message" footer — personal tab only */}
      {subTab === "my" && (
        <div className="flex-shrink-0 px-3 pb-3 pt-1">
          <button
            onClick={() => setShowCreateChat("my")}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "10px 14px", border: "1px dashed var(--dashed)", borderRadius: "var(--r-callout)",
              background: "transparent", color: "var(--body)", fontFamily: "var(--sans)", fontSize: 13,
              cursor: "pointer", transition: "border-color 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--plum)"; (e.currentTarget as HTMLElement).style.color = "var(--plum)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--dashed)"; (e.currentTarget as HTMLElement).style.color = "var(--body)" }}
          >
            <Plus className="w-3.5 h-3.5 flex-shrink-0" />
            New message
          </button>
        </div>
      )}
      </>
      )}

      {showCreateChat && (
        <CreateChatScreen
          userId={userId}
          userName={userProfile.name}
          ministryId={ministryId}
          groupType={showCreateChat}
          initialCategory={showCreateChat === "church" ? pendingCategory : undefined}
          onClose={() => { setShowCreateChat(null); setPendingCategory(undefined) }}
          onCreated={(group) => {
            const newGroup: ChatGroup = {
              id: group.id,
              name: group.name,
              type: showCreateChat!,
              category: group.category ?? null,
              last_message: null,
              last_sender: null,
              last_message_time: null,
              unread_count: 0,
              archived: false,
            }
            mutate((current) => [newGroup, ...(current ?? [])], { revalidate: false })
            setShowCreateChat(null)
            onOpenChat(group.id, group.name)
          }}
        />
      )}
    </div>
  )
}
