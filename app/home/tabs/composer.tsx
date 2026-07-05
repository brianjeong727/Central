"use client"

import { memo, useState, useEffect, useRef, useMemo } from "react"
import type { ChangeEvent, KeyboardEvent } from "react"
import { X, Send, CornerUpLeft, Smile, Paperclip, FileDown, BarChart2 } from "lucide-react"
import { MonogramChip } from "@/components/central"
import { LazyEmojiPicker, formatFileSize } from "./message-row"
import { replyPreviewLabel } from "../utils"
import type { ComposerProps } from "../types"

// Bottom input area of ChatScreen. Owns ALL per-keystroke state (inputText, the
// @mention autocomplete, GIF search) so typing re-renders only this subtree — not
// the message-list delegation, header, or typing indicator above it. React.memo'd
// so unrelated ChatScreen state changes don't re-render it (the callbacks it takes
// are useCallback-stable in the parent). See CLAUDE.md Convention #4 (optimistic
// send stays in ChatScreen behind onSend) and #7 (tap/long-press is in the rows,
// not here).
function ComposerImpl({
  groupArchived,
  displayName,
  mentionMembers,
  replyingTo,
  sending,
  uploading,
  pollActive,
  onSend,
  onSendGif,
  onTyping,
  onClearReply,
  onSetPollOpen,
}: ComposerProps) {
  const [inputText, setInputText] = useState("")
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [showComposerEmojiPicker, setShowComposerEmojiPicker] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; previewUrl: string } | null>(null)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [gifSearch, setGifSearch] = useState("")
  const [gifResults, setGifResults] = useState<{ id: string; previewUrl: string; fullUrl: string }[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const gifDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return mentionMembers.filter(m => m.name.split(" ")[0].toLowerCase().startsWith(q)).slice(0, 5)
  }, [mentionQuery, mentionMembers])

  // ── GIF picker ──
  async function handleGifSearch(query: string) {
    setGifLoading(true)
    try {
      const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY
      const endpoint = query.trim()
        ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=24&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=g`
      const res = await fetch(endpoint)
      const json = await res.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setGifResults((json.data ?? []).map((g: any) => ({
        id: g.id,
        previewUrl: g.images?.fixed_height_small?.url ?? g.images?.preview_gif?.url ?? "",
        fullUrl: g.images?.original?.url ?? "",
      })))
    } catch { /* swallow */ }
    setGifLoading(false)
  }

  // Load trending GIFs when the picker opens
  useEffect(() => {
    if (!showGifPicker) return
    if (gifResults.length > 0) return
    handleGifSearch("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGifPicker])

  // Debounced GIF search
  useEffect(() => {
    if (!showGifPicker) return
    if (gifDebounceRef.current) clearTimeout(gifDebounceRef.current)
    gifDebounceRef.current = setTimeout(() => handleGifSearch(gifSearch), 400)
    return () => { if (gifDebounceRef.current) clearTimeout(gifDebounceRef.current) }
  }, [gifSearch, showGifPicker])

  // ── @mention ──
  function handleMentionSelect(name: string) {
    const firstName = name.split(" ")[0]
    const el = textareaRef.current
    const pos = el?.selectionStart ?? inputText.length
    const before = inputText.slice(0, pos)
    const after = inputText.slice(pos)
    const atIdx = before.lastIndexOf("@")
    const newText = before.slice(0, atIdx) + `@${firstName} ` + after
    setInputText(newText)
    setMentionQuery(null)
    requestAnimationFrame(() => el?.focus())
  }

  // ── Attachments ──
  function stagePendingAttachment(file: File) {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl)
    setPendingAttachment({ file, previewUrl: URL.createObjectURL(file) })
  }

  function clearPendingAttachment() {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.previewUrl)
    setPendingAttachment(null)
  }

  // ── Input ──
  function handleInputChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInputText(val)
    // Auto-resize textarea to fit content
    const el = e.target
    el.style.height = "auto"
    el.style.height = el.scrollHeight + "px"
    // @mention detection
    const pos = e.target.selectionStart ?? val.length
    const before = val.slice(0, pos)
    const atMatch = before.match(/@(\w*)$/)
    if (atMatch) {
      setMentionQuery(atMatch[1])
      setMentionIndex(0)
    } else if (mentionQuery !== null) {
      setMentionQuery(null)
    }
    // Typing broadcast (throttled by ChatScreen — channel lives there)
    onTyping(val)
  }

  function insertEmojiAtCursor(native: string) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? inputText.length
    const end = el?.selectionEnd ?? inputText.length
    const newText = inputText.slice(0, start) + native + inputText.slice(end)
    setInputText(newText)
    requestAnimationFrame(() => {
      if (el) {
        const pos = start + native.length
        el.selectionStart = pos
        el.selectionEnd = pos
        el.focus()
      }
    })
  }

  // Build the send payload and hand it up. ChatScreen owns the optimistic message
  // + supabase insert (Convention #4); we clear our own local state here.
  function triggerSend() {
    if (sending || groupArchived) return
    const content = inputText.trim()
    const pa = pendingAttachment
    if (!content && !pa) return
    setInputText("")
    setMentionQuery(null)
    setPendingAttachment(null)
    if (pa) URL.revokeObjectURL(pa.previewUrl)
    // Reset textarea height after clearing
    if (textareaRef.current) { textareaRef.current.style.height = "auto" }
    onSend({ content, attachment: pa?.file ?? null, replyTo: replyingTo })
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (mentionQuery !== null && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, filteredMentions.length - 1)); return }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); handleMentionSelect(filteredMentions[mentionIndex].name); return }
      if (e.key === "Escape") { setMentionQuery(null); return }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      triggerSend()
    }
  }

  return (
    <>
      {/* ── Reply preview bar ── */}
      {replyingTo && (
        <div className="flex-shrink-0 bg-[var(--cream)] px-4 py-2 flex items-start gap-3">
          <div className="flex-1 border-l-2 border-[var(--plum)] pl-2.5 min-w-0">
            <p className="text-[11px] font-medium text-[var(--plum)] flex items-center gap-1 mb-0.5">
              <CornerUpLeft className="w-3 h-3 flex-shrink-0" />
              {replyingTo.sender_name}
            </p>
            <p className="text-[12px] text-[var(--muted-text)] truncate">{replyPreviewLabel(replyingTo.content, replyingTo.attachment_type, replyingTo.attachment_name).slice(0, 60)}</p>
          </div>
          <button onClick={onClearReply} className="flex-shrink-0 mt-0.5 text-[#C4C4C4] hover:text-[var(--body)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}


      {/* ── GIF Picker panel ── */}
      {showGifPicker && !groupArchived && (
        <div className="flex-shrink-0 bg-[var(--cream-panel)] border-t border-[var(--line)] z-[156] relative" style={{ height: 240 }}>
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-[#F0EDE6]">
            <input
              autoFocus
              value={gifSearch}
              onChange={e => setGifSearch(e.target.value)}
              placeholder="Search GIFs…"
              className="flex-1 text-[13px] bg-[#F4F1E8] rounded-xl px-3 py-2 focus:outline-none border border-[var(--line)] focus:border-[#3E1540]/30 placeholder:text-[#C4C4C4]"
            />
            <button onClick={() => setShowGifPicker(false)} className="text-[#C4C4C4] hover:text-[var(--body)] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto h-[188px] flex flex-col">
            {gifLoading ? (
              <div className="flex items-center justify-center flex-1">
                <div className="w-5 h-5 border-2 border-[var(--plum)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : gifResults.length === 0 ? (
              /* Empty state = the announcement. One prominent card explaining why
                 there's nothing here, instead of a mumbled "No GIFs found". */
              <div className="flex items-center justify-center flex-1 px-6">
                <div style={{ background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 28px", textAlign: "center", maxWidth: 360 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 6 }}>
                    Coming soon
                  </div>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.15, marginBottom: 6 }}>
                    Custom GIFs
                  </div>
                  <p style={{ fontSize: 13, color: "var(--body)", lineHeight: 1.55, margin: 0 }}>
                    GIF search isn&apos;t live yet — a custom GIF library for your ministry is on the way.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1 p-1">
                {gifResults.map(gif => (
                  <button
                    key={gif.id}
                    onClick={() => { onSendGif(gif.fullUrl); setShowGifPicker(false) }}
                    className="relative aspect-square rounded-lg overflow-hidden bg-[#F4F1E8] hover:opacity-90 active:scale-95 transition-all"
                  >
                    <img src={gif.previewUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      {groupArchived ? (
        <div className="flex-shrink-0 bg-[var(--cream)] px-4 py-3 flex items-center justify-center">
          <p className="text-[13px] text-[var(--muted-text)]">This chat is archived</p>
        </div>
      ) : (
        <div className="flex-shrink-0 bg-[var(--cream)] px-4 py-3 md:px-10 md:py-3.5 relative">
          {/* @mention dropdown */}
          {mentionQuery !== null && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-4 mb-1 bg-[var(--cream-panel)] rounded-xl border border-[var(--line)] overflow-hidden min-w-[180px] z-10">
              {filteredMentions.map((member, idx) => (
                <button
                  key={member.id}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => handleMentionSelect(member.name)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${idx === mentionIndex ? "bg-[#F4F1E8]" : "hover:bg-[var(--cream-panel)]"} ${idx > 0 ? "border-t border-[#F0EDE6]" : ""}`}
                >
                  <MonogramChip initials={member.name.charAt(0).toUpperCase()} className="w-7 h-7 text-[11px] font-medium" />
                  <span className="text-[14px] font-medium text-[var(--ink)]">{member.name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.txt,.xlsx,.pptx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) stagePendingAttachment(f); e.target.value = "" }}
            />
            {/* Left icons — outside the bubble */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-shrink-0 text-[var(--body)] hover:text-[var(--ink)] transition-colors disabled:opacity-40 mb-2"
              title="Attach file"
            >
              {uploading
                ? <div className="w-4 h-4 border-2 border-[var(--body)] border-t-transparent rounded-full animate-spin" />
                : <Paperclip className="w-4 h-4" />
              }
            </button>
            <button
              onClick={() => { setShowGifPicker(p => !p); onSetPollOpen(false) }}
              className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border transition-colors mb-2 ${showGifPicker ? "bg-[var(--plum)] text-white border-[var(--plum)]" : "text-[var(--body)] border-[var(--line-2)] hover:border-[#3E1540]/30 hover:text-[var(--ink)]"}`}
              title="Send a GIF"
            >
              GIF
            </button>
            <button
              onClick={() => { setShowGifPicker(false); onSetPollOpen(!pollActive) }}
              className={`flex-shrink-0 transition-colors mb-2 ${pollActive ? "text-[var(--plum)]" : "text-[var(--body)] hover:text-[var(--ink)]"}`}
              title="Create a poll"
            >
              <BarChart2 className="w-4 h-4" />
            </button>
            {/* Textarea bubble — its own bordered component */}
            <div className="flex-1 border border-[var(--line-2)] rounded-2xl bg-[#F8F4EA] px-3 py-[9px]">
              {/* Attachment preview — inside the bubble, above the textarea */}
              {pendingAttachment && (
                <div className="mb-2">
                  {pendingAttachment.file.type.startsWith("image/") ? (
                    <div className="relative inline-block">
                      <img
                        src={pendingAttachment.previewUrl}
                        alt="Preview"
                        className="w-16 h-16 rounded-xl object-cover border border-[var(--line)]"
                      />
                      <button
                        onClick={clearPendingAttachment}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--ink)] flex items-center justify-center"
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-[#EDE9DF] rounded-xl px-2.5 py-2">
                      <div className="w-7 h-7 rounded-lg bg-[#F4F1E8] border border-[var(--line)] flex items-center justify-center flex-shrink-0">
                        <FileDown className="w-3.5 h-3.5 text-[var(--body)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[var(--ink)] truncate">{pendingAttachment.file.name}</p>
                        <p className="text-[10px] text-[var(--muted-text)]">{formatFileSize(pendingAttachment.file.size)}</p>
                      </div>
                      <button onClick={clearPendingAttachment} className="flex-shrink-0 text-[#C4C4C4] hover:text-[var(--body)] transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${displayName}`}
                rows={1}
                className="w-full resize-none bg-transparent text-[14px] text-[var(--ink)] placeholder:text-[var(--muted-text)] focus:outline-none border-none max-h-36 overflow-y-auto block"
                style={{ lineHeight: "1.5", paddingTop: 0, paddingBottom: 0, height: "auto" }}
              />
            </div>
            {/* Right icons — outside the bubble */}
            <div className="relative mb-2">
              <button
                onClick={() => setShowComposerEmojiPicker(p => !p)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--body)] hover:bg-[var(--line)] transition-colors"
              >
                <Smile className="w-4 h-4" />
              </button>
              {showComposerEmojiPicker && (
                <div className="absolute bottom-full right-0 mb-2 z-[160]">
                  <LazyEmojiPicker
                    onEmojiSelect={(emoji: { native: string }) => {
                      insertEmojiAtCursor(emoji.native)
                    }}
                  />
                </div>
              )}
            </div>
            <button
              onClick={triggerSend}
              disabled={(!inputText.trim() && !pendingAttachment) || sending}
              className="flex-shrink-0 flex items-center justify-center disabled:opacity-50 hover:bg-[var(--ink)] transition-all active:scale-95 bg-[var(--plum-2)] mb-2"
              style={{ width: 34, height: 34, borderRadius: 10 }}
            >
              <Send className="w-4 h-4 text-white" style={{ transform: "rotate(-30deg)" }} />
            </button>
          </div>
          <div className="hidden md:flex justify-between mt-2 text-[11px] text-[#A09A8C]">
            <span>Press <span style={{ fontFamily: "ui-monospace,monospace" }}>↵</span> to send · <span style={{ fontFamily: "ui-monospace,monospace" }}>⇧↵</span> for new line</span>
            <span>End-to-end visible to {displayName} members</span>
          </div>
        </div>
      )}

      {/* Overlay to dismiss the composer's own GIF / emoji pickers. ChatScreen keeps
          its own overlay for the message-row pickers + poll menu. */}
      {(showComposerEmojiPicker || showGifPicker) && (
        <div
          className="fixed inset-0 z-[155] md:left-[var(--shell-offset)]"
          onPointerDown={() => { setShowComposerEmojiPicker(false); setShowGifPicker(false) }}
        />
      )}
    </>
  )
}

export const Composer = memo(ComposerImpl)
