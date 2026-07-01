"use client"

import { useState, useEffect, useRef } from "react"
import { Search, X, Home, MessageCircle, Bell, Users, ClipboardList, User, List, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase"
import type { CommandPaletteProps, PaletteItem, PaletteItemType, Tab } from "../types"

const NAV_ITEMS: PaletteItem[] = [
  { type: "nav", id: "home",          label: "Home",          tab: "home" },
  { type: "nav", id: "announcements", label: "Announcements", tab: "announcements" },
  { type: "nav", id: "chats",         label: "Chats",         tab: "chats" },
  { type: "nav", id: "directory",     label: "Directory",     tab: "directory" },
  { type: "nav", id: "plan",          label: "Plan",          tab: "plan" },
  { type: "nav", id: "profile",       label: "Profile",       tab: "profile" },
]

export function CommandPalette({ open, onClose, ministryId, onTabChange, onOpenChat }: CommandPaletteProps) {
  const supabase = createClient()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PaletteItem[]>(NAV_ITEMS)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setQuery("")
      setResults(NAV_ITEMS)
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults(NAV_ITEMS)
      setSelectedIdx(0)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const q = query.toLowerCase()
      const [profilesRes, groupsRes, announcementsRes] = await Promise.all([
        supabase.from("profiles").select("id, name, email, role").eq("ministry_id", ministryId).ilike("name", `%${q}%`).limit(5),
        supabase.from("groups").select("id, name, type").eq("ministry_id", ministryId).eq("archived", false).ilike("name", `%${q}%`).limit(5),
        supabase.from("announcements").select("id, title").eq("ministry_id", ministryId).ilike("title", `%${q}%`).limit(5),
      ])
      const items: PaletteItem[] = []
      const navMatches = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(q))
      items.push(...navMatches)
      for (const p of (profilesRes.data ?? []) as { id: string; name: string; email: string; role: string }[]) {
        items.push({ type: "person", id: p.id, label: p.name, sublabel: p.email })
      }
      for (const g of (groupsRes.data ?? []) as { id: string; name: string; type: string }[]) {
        items.push({ type: "chat", id: g.id, label: g.name, chatType: g.type, sublabel: g.type === "church" ? "Church chat" : g.type === "dm" ? "Direct message" : "Group chat" })
      }
      for (const a of (announcementsRes.data ?? []) as { id: string; title: string }[]) {
        items.push({ type: "announcement", id: a.id, label: a.title, sublabel: "Announcement" })
      }
      setResults(items)
      setSelectedIdx(0)
      setLoading(false)
    }, 120)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ministryId])

  function selectItem(item: PaletteItem) {
    onClose()
    if (item.type === "nav" && item.tab) { onTabChange(item.tab); return }
    if (item.type === "person") { onTabChange("directory"); return }
    // handleOpenChat switches to the chats tab atomically (and sets ?chats from the
    // category), so we forward chatType and skip the redundant onTabChange("chats").
    if (item.type === "chat") { onOpenChat(item.id, item.label, item.chatType); return }
    if (item.type === "announcement") { onTabChange("announcements"); return }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === "Enter" && results[selectedIdx]) { selectItem(results[selectedIdx]) }
    else if (e.key === "Escape") { onClose() }
  }

  const grouped: { label: string; items: PaletteItem[] }[] = []
  const navItems = results.filter((r) => r.type === "nav")
  const peopleItems = results.filter((r) => r.type === "person")
  const chatItems = results.filter((r) => r.type === "chat")
  const annItems = results.filter((r) => r.type === "announcement")
  if (navItems.length) grouped.push({ label: query ? "Navigation" : "Go to", items: navItems })
  if (peopleItems.length) grouped.push({ label: "People", items: peopleItems })
  if (chatItems.length) grouped.push({ label: "Chats", items: chatItems })
  if (annItems.length) grouped.push({ label: "Announcements", items: annItems })

  const typeIcon: Record<PaletteItemType, React.ReactNode> = {
    nav: <List className="w-3.5 h-3.5" />,
    person: <User className="w-3.5 h-3.5" />,
    chat: <MessageCircle className="w-3.5 h-3.5" />,
    announcement: <Bell className="w-3.5 h-3.5" />,
  }

  if (!open) return null

  let flatIdx = 0

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh]"
      style={{ background: "rgba(19,16,26,0.45)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-[560px] mx-4 rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(19,16,26,0.22)]"
        style={{ background: "var(--cream-panel)", border: "1px solid var(--line)" }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--line)]">
          <Search className="w-4 h-4 text-[var(--muted-text)] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Jump to anything…"
            className="flex-1 bg-transparent text-[14px] text-[var(--ink)] placeholder-[#C4C4C4] outline-none"
          />
          {loading && <div className="w-4 h-4 border-2 border-[var(--plum)] border-t-transparent rounded-full animate-spin flex-shrink-0" />}
          <kbd className="text-[10px] px-1.5 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] text-[var(--muted-text)] leading-none flex-shrink-0">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-2">
          {grouped.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-[13px] text-[var(--muted-text)]">No results for &ldquo;{query}&rdquo;</div>
          )}
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[#C4C4C4]">{group.label}</div>
              {group.items.map((item) => {
                const idx = flatIdx++
                const active = idx === selectedIdx
                return (
                  <button
                    key={item.id}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    onMouseDown={() => selectItem(item)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                    style={{ background: active ? "#EDE5F0" : "transparent" }}
                  >
                    <span style={{ color: active ? "var(--plum)" : "var(--muted-text)" }}>{typeIcon[item.type]}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-[var(--ink)] truncate">{item.label}</span>
                      {item.sublabel && <span className="block text-[11px] text-[var(--muted-text)] truncate">{item.sublabel}</span>}
                    </span>
                    {active && <ChevronRight className="w-3.5 h-3.5 text-[var(--plum)] flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--line)] text-[10px] text-[#C4C4C4]">
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] leading-none">↑</kbd><kbd className="px-1 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] leading-none">↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] leading-none">↵</kbd> select</span>
          <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 border border-[#E5E0D2] rounded bg-[#F4F1E8] leading-none">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
