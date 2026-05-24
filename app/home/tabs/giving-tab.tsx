"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase"
import { Pencil, Check, Copy, ExternalLink, Plus, Receipt, ChevronDown, X, Upload, Download, AlertTriangle } from "lucide-react"
import { DesktopTopbar } from "../components/desktop-nav"
import { Spinner } from "../components/shared"
import { submitReceipt, updateReceiptStatus, exportReceiptsCSV, getReceiptLimits } from "@/app/actions/receipts"
import type { Receipt as ReceiptType, ReceiptLimit } from "@/app/actions/receipts"

interface Props {
  ministryId: string
  userId: string
  userRole: string
  isAdmin: boolean
}

const CATEGORIES = [
  { value: "dg_dinner", label: "DG Dinner" },
  { value: "welcoming_week", label: "Welcoming Week" },
  { value: "coffeehouse", label: "Coffeehouse" },
  { value: "turkeybowl", label: "Turkey Bowl" },
  { value: "supplies", label: "Supplies" },
  { value: "other", label: "Other" },
]

const FUNDS = [
  { value: "church", label: "Church" },
  { value: "cmu", label: "CMU" },
  { value: "pitt", label: "Pitt" },
]

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  pending:    { label: "Pending",    bg: "#F2F0F5", text: "#5A5466" },
  approved:   { label: "Approved",  bg: "#E6F4EA", text: "#1E6B3C" },
  reimbursed: { label: "Reimbursed",bg: "#EDE5F0", text: "#3E1540" },
  flagged:    { label: "Flagged",   bg: "#FFF8E1", text: "#B45309" },
}

const PRESET_AMOUNTS = ["10", "25", "50", "100", "250"]

function GivingTrustPanel({ zelleInfo, onCopy, copied }: { zelleInfo: string; onCopy: () => void; copied: boolean }) {
  return (
    <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 16, padding: "18px 20px" }}>
      <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8497", marginBottom: 12 }}>Giving destination</p>
      <div style={{ padding: "12px 14px", border: "1px solid #ECE8DE", background: "#FBF8F2", borderRadius: 12, marginBottom: 12 }}>
        <p style={{ fontSize: 13.5, color: "#13101A", fontWeight: 600, lineHeight: 1.2 }}>{zelleInfo}</p>
        <p style={{ fontSize: 12, color: "#8A8497", marginTop: 4 }}>Zelle email or phone</p>
      </div>
      <button onClick={onCopy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", height: 38, borderRadius: 10, border: "1px solid #E5E0D2", background: "white", color: copied ? "#3E1540" : "#5A5466", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}>
        {copied ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
        {copied ? "Copied" : "Copy Zelle info"}
      </button>
      <p style={{ fontSize: 12.5, color: "#5A5466", lineHeight: 1.55 }}>
        Central only stores your ministry&apos;s Zelle destination. Gifts, receipts, statements, and tax records stay with your ministry.
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 999, background: m.bg, color: m.text, textTransform: "uppercase" }}>
      {m.label}
    </span>
  )
}

function ReceiptRow({ receipt, canManage, onStatusChange }: { receipt: ReceiptType & { submitted_by_name?: string }; canManage: boolean; onStatusChange: (id: string, status: string) => void }) {
  const cat = CATEGORIES.find(c => c.value === receipt.category)?.label ?? receipt.category
  const fund = FUNDS.find(f => f.value === receipt.fund)?.label ?? receipt.fund
  return (
    <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", lineHeight: 1.2 }}>{receipt.event_name || cat}</p>
          {receipt.event_name && <p style={{ fontSize: 12, color: "#8A8497", marginTop: 2 }}>{cat} · {fund}</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#13101A" }}>${Number(receipt.amount).toFixed(2)}</p>
          <StatusBadge status={receipt.status} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <p style={{ fontSize: 12, color: "#8A8497" }}>{new Date(receipt.purchase_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
        {receipt.submitted_by_name && <p style={{ fontSize: 12, color: "#8A8497" }}>· {receipt.submitted_by_name}</p>}
        {receipt.receipt_image_url && (
          <a href={receipt.receipt_image_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#3E1540", fontWeight: 500 }}>View receipt</a>
        )}
      </div>
      {receipt.notes && <p style={{ fontSize: 12.5, color: "#5A5466", lineHeight: 1.5 }}>{receipt.notes}</p>}
      {canManage && receipt.status === "pending" && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {["approved", "flagged"].map(s => (
            <button key={s} onClick={() => onStatusChange(receipt.id, s)} style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", padding: "4px 10px", borderRadius: 999, background: STATUS_META[s].bg, color: STATUS_META[s].text, border: "none", cursor: "pointer", textTransform: "uppercase" }}>
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      )}
      {canManage && receipt.status === "approved" && (
        <div style={{ marginTop: 4 }}>
          <button onClick={() => onStatusChange(receipt.id, "reimbursed")} style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", padding: "4px 10px", borderRadius: 999, background: STATUS_META.reimbursed.bg, color: STATUS_META.reimbursed.text, border: "none", cursor: "pointer", textTransform: "uppercase" }}>
            Mark reimbursed
          </button>
        </div>
      )}
    </div>
  )
}

function SubmitReceiptModal({
  ministryId,
  limits,
  prefillCategory,
  prefillFund,
  onClose,
  onSubmitted,
}: {
  ministryId: string
  limits: ReceiptLimit[]
  prefillCategory?: string
  prefillFund?: string
  onClose: () => void
  onSubmitted: (r: ReceiptType) => void
}) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState(prefillCategory ?? "other")
  const [fund, setFund] = useState(prefillFund ?? "church")
  const [amount, setAmount] = useState("")
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0])
  const [eventName, setEventName] = useState("")
  const [notes, setNotes] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numAmount = parseFloat(amount) || 0
  const limit = limits.find(l => l.category === category && l.fund === fund)
  const overLimit = limit && numAmount > 0 && numAmount > limit.max_amount

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split(".").pop() ?? "jpg"
    const path = `receipts/${ministryId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from("announcement-images").upload(path, file, { upsert: false })
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from("announcement-images").getPublicUrl(data.path)
      setImageUrl(publicUrl)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleSubmit() {
    if (!amount || numAmount <= 0) { setError("Please enter a valid amount."); return }
    setSubmitting(true)
    setError(null)
    const { data, error: err } = await submitReceipt({ ministryId, eventName, category, fund, amount: numAmount, purchaseDate, receiptImageUrl: imageUrl, notes })
    if (err) { setError(err); setSubmitting(false); return }
    if (data) onSubmitted(data)
    onClose()
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#13101A", background: "#FDFBF7", outline: "none", boxSizing: "border-box" }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", marginBottom: 5, display: "block" }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(19,16,26,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: "#FDFBF7", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid #ECE8DE" }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A" }}>Submit a receipt</p>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#F2EDE0", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} color="#5A5466" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fund</label>
              <select value={fund} onChange={e => setFund(e.target.value)} style={inputStyle}>
                {FUNDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Amount ($)</label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Purchase date</label>
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {overLimit && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FFF8E1", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 12px" }}>
              <AlertTriangle size={14} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, color: "#B45309", lineHeight: 1.5 }}>
                This exceeds the ${limit!.max_amount} limit for {CATEGORIES.find(c => c.value === category)?.label}. You can still submit.
              </p>
            </div>
          )}

          <div>
            <label style={labelStyle}>Event name (optional)</label>
            <input type="text" placeholder="e.g. Week 3 DG Dinner" value={eventName} onChange={e => setEventName(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea placeholder="What was purchased?" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
          </div>

          <div>
            <label style={labelStyle}>Receipt image (optional)</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
            {imageUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <a href={imageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#3E1540", fontWeight: 500 }}>View uploaded image</a>
                <button onClick={() => setImageUrl(null)} style={{ fontSize: 12, color: "#8A8497", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", border: "1px dashed #C4C4C4", borderRadius: 10, background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer", width: "100%" }}>
                <Upload size={14} />
                {uploading ? "Uploading…" : "Upload image"}
              </button>
            )}
          </div>

          {error && <p style={{ fontSize: 13, color: "#B91C1C" }}>{error}</p>}
        </div>
        <div style={{ padding: "12px 20px 24px", borderTop: "1px solid #ECE8DE" }}>
          <button onClick={handleSubmit} disabled={submitting || !amount} style={{ width: "100%", height: 46, background: "#3E1540", color: "#F6F4EF", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: submitting || !amount ? 0.6 : 1 }}>
            {submitting ? "Submitting…" : "Submit receipt"}
          </button>
        </div>
      </div>
    </div>
  )
}

export function GivingTab({ ministryId, userId, userRole, isAdmin }: Props) {
  const supabase = createClient()

  // Giving section state
  const [zelleInfo, setZelleInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [zelleFallback, setZelleFallback] = useState(false)
  const [amount, setAmount] = useState("50")

  // Receipts section state
  const [activeSection, setActiveSection] = useState<"giving" | "receipts">("giving")
  const [receipts, setReceipts] = useState<(ReceiptType & { submitted_by_name?: string })[]>([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [limits, setLimits] = useState<ReceiptLimit[]>([])
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [prefillCategory, setPrefillCategory] = useState<string | undefined>()
  const [prefillFund, setPrefillFund] = useState<string | undefined>()
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [exporting, setExporting] = useState(false)

  const canManage = isAdmin || ["admin", "leader"].includes(userRole.toLowerCase())

  useEffect(() => {
    async function load() {
      const [givingRes, limitsRes] = await Promise.all([
        supabase.from("ministry_giving").select("zelle_info").eq("ministry_id", ministryId).maybeSingle(),
        getReceiptLimits(ministryId),
      ])
      setZelleInfo(givingRes.data?.zelle_info ?? null)
      setLimits(limitsRes.data)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  useEffect(() => {
    if (activeSection !== "receipts") return
    loadReceipts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  async function loadReceipts() {
    setReceiptsLoading(true)
    const query = canManage
      ? supabase.from("receipts").select("*, profiles!submitted_by(name)").eq("ministry_id", ministryId).order("submitted_at", { ascending: false })
      : supabase.from("receipts").select("*").eq("ministry_id", ministryId).eq("submitted_by", userId).order("submitted_at", { ascending: false })
    const { data } = await query
    if (data) {
      setReceipts(data.map((r: Record<string, unknown>) => {
        const profile = r.profiles as { name?: string } | null
        const { profiles: _p, ...rest } = r
        void _p
        return { ...rest, submitted_by_name: profile?.name } as ReceiptType & { submitted_by_name?: string }
      }))
    }
    setReceiptsLoading(false)
  }

  async function handleSave() {
    if (!isAdmin) return
    const val = editValue.trim()
    if (!val) return
    setSaving(true)
    const { error } = await supabase.from("ministry_giving").upsert({ ministry_id: ministryId, zelle_info: val, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "ministry_id" })
    if (!error) { setZelleInfo(val); setEditing(false) }
    setSaving(false)
  }

  function handleCopy() {
    if (!zelleInfo) return
    navigator.clipboard.writeText(zelleInfo).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function handleOpenZelle() {
    if (window.innerWidth < 768) {
      setZelleFallback(false)
      window.location.href = "zelle://"
      const t = setTimeout(() => setZelleFallback(true), 500)
      const onHide = () => { clearTimeout(t); document.removeEventListener("visibilitychange", onHide) }
      document.addEventListener("visibilitychange", onHide)
    } else {
      window.open("https://zellepay.com", "_blank", "noopener,noreferrer")
    }
  }

  function openSubmitModal(cat?: string, fund?: string) {
    setPrefillCategory(cat)
    setPrefillFund(fund)
    setShowSubmitModal(true)
  }

  function handleReceiptSubmitted(r: ReceiptType) {
    setReceipts(prev => [r, ...prev])
    setActiveSection("receipts")
  }

  async function handleStatusChange(id: string, status: string) {
    await updateReceiptStatus({ receiptId: id, status })
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, status, reviewed_by: userId, reviewed_at: new Date().toISOString() } : r))
  }

  async function handleExport() {
    setExporting(true)
    const { csv } = await exportReceiptsCSV(ministryId)
    if (csv) {
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = "receipts.csv"; a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
  }

  const displayAmount = amount || "0"
  const filteredReceipts = filterStatus === "all" ? receipts : receipts.filter(r => r.status === filterStatus)

  return (
    <div className="pb-28 md:pb-0 md:h-full md:overflow-y-auto">
      <DesktopTopbar crumbs={["Central", "Finance"]} />

      <div className="px-5 pt-14 md:px-10 md:py-8 max-w-[740px] md:max-w-none">

        {/* Header */}
        <div className="mb-6 mt-6 md:mt-0 md:mb-8 md:max-w-[680px]">
          <p className="text-[11px] tracking-[0.14em] uppercase text-[#8A8497] mb-2.5">2 Corinthians 9:7</p>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1, color: "#13101A", fontWeight: 400 }}>
            Finance
          </h1>
          <p className="mt-3 text-[14px] text-[#5A5466] leading-relaxed md:max-w-[520px]">
            Give directly and track ministry expenses in one place.
          </p>
        </div>

        {/* Section tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {(["giving", "receipts"] as const).map(s => (
            <button key={s} onClick={() => setActiveSection(s)} style={{ padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500, border: activeSection === s ? "none" : "1px solid #ECE8DE", background: activeSection === s ? "#3E1540" : "white", color: activeSection === s ? "#F6F4EF" : "#5A5466", cursor: "pointer", textTransform: "capitalize" }}>
              {s === "giving" ? "Giving" : "Receipts"}
            </button>
          ))}
        </div>

        {loading ? <Spinner /> : (
          <>
            {/* ── Giving section ── */}
            {activeSection === "giving" && (
              <div className="md:grid md:gap-5" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
                <div style={{ background: "radial-gradient(circle at 90% 20%, rgba(246,244,239,0.12) 0%, transparent 40%), radial-gradient(circle at 8% 90%, rgba(246,244,239,0.08) 0%, transparent 35%), #3E1540", borderRadius: 20, padding: "28px 28px 24px", position: "relative", overflow: "hidden", marginBottom: 16 }} className="md:mb-0">
                  <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(246,244,239,0.18) 1px, transparent 1.4px)", backgroundSize: "18px 18px", opacity: 0.35, pointerEvents: "none" }} />
                  <div style={{ position: "relative", zIndex: 1 }}>
                    {editing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <label style={{ fontSize: 12, color: "rgba(246,244,239,0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Zelle email or phone</label>
                        <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="giving@yourministry.org" autoFocus style={{ background: "rgba(246,244,239,0.08)", border: "1px solid rgba(246,244,239,0.2)", borderRadius: 12, padding: "12px 14px", fontSize: 14, color: "#F6F4EF", outline: "none", width: "100%", boxSizing: "border-box" }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={handleSave} disabled={!editValue.trim() || saving} style={{ flex: 1, height: 42, background: "#F6F4EF", color: "#3E1540", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: !editValue.trim() || saving ? 0.5 : 1 }}>{saving ? "Saving…" : "Save"}</button>
                          <button onClick={() => setEditing(false)} style={{ height: 42, padding: "0 16px", background: "transparent", color: "rgba(246,244,239,0.6)", borderRadius: 10, fontSize: 13, border: "1px solid rgba(246,244,239,0.2)", cursor: "pointer" }}>Cancel</button>
                        </div>
                      </div>
                    ) : !zelleInfo && !isAdmin ? (
                      <div>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#F6F4EF", marginBottom: 8 }}>Giving info coming soon</p>
                        <p style={{ fontSize: 13, color: "rgba(246,244,239,0.6)", lineHeight: 1.5 }}>Check back later for ways to give.</p>
                      </div>
                    ) : !zelleInfo && isAdmin ? (
                      <div>
                        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 22, color: "#F6F4EF", marginBottom: 8 }}>Set up giving</p>
                        <p style={{ fontSize: 13, color: "rgba(246,244,239,0.6)", marginBottom: 20, lineHeight: 1.5 }}>Add your Zelle email or phone number so members can give.</p>
                        <button onClick={() => { setEditValue(""); setEditing(true) }} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#F6F4EF", color: "#3E1540", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>
                          <Pencil style={{ width: 13, height: 13 }} /> Add Zelle info
                        </button>
                      </div>
                    ) : (
                      <>
                        <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(246,244,239,0.6)", marginBottom: 12 }}>Your gift</p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}>
                          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "rgba(246,244,239,0.55)", lineHeight: 1 }}>$</span>
                          <input type="text" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))} style={{ background: "transparent", border: "none", outline: "none", fontFamily: "var(--font-instrument-serif)", fontSize: 64, color: "#F6F4EF", width: "100%", padding: 0, lineHeight: 1 }} />
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                          {PRESET_AMOUNTS.map(v => (
                            <button key={v} onClick={() => setAmount(v)} style={{ height: 30, padding: "0 13px", borderRadius: 999, background: amount === v ? "rgba(246,244,239,0.95)" : "transparent", color: amount === v ? "#3E1540" : "#F6F4EF", border: "1px solid rgba(246,244,239,0.25)", fontSize: 13, cursor: "pointer", fontWeight: amount === v ? 600 : 400 }}>${v}</button>
                          ))}
                        </div>
                        <button onClick={handleOpenZelle} style={{ width: "100%", height: 48, background: "#F6F4EF", color: "#3E1540", borderRadius: 12, fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
                          <ExternalLink style={{ width: 16, height: 16 }} />Open Zelle · ${displayAmount}
                        </button>
                        {zelleFallback && <p style={{ fontSize: 13, color: "rgba(246,244,239,0.75)", textAlign: "center", lineHeight: 1.5, marginBottom: 10 }}>Open Zelle on your phone and send to <strong style={{ color: "#F6F4EF" }}>{zelleInfo}</strong></p>}
                        <button onClick={handleCopy} style={{ width: "100%", height: 38, background: "transparent", color: copied ? "#F6F4EF" : "rgba(246,244,239,0.6)", borderRadius: 10, fontSize: 13, border: `1px solid ${copied ? "rgba(246,244,239,0.45)" : "rgba(246,244,239,0.15)"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                          {copied ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
                          {copied ? "Copied!" : `Copy info · ${zelleInfo}`}
                        </button>
                        {isAdmin && <button onClick={() => { setEditValue(zelleInfo ?? ""); setEditing(true) }} style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "rgba(246,244,239,0.4)", fontSize: 12, cursor: "pointer", padding: 0 }}><Pencil style={{ width: 11, height: 11 }} /> Edit Zelle info</button>}
                      </>
                    )}
                  </div>
                </div>
                {zelleInfo && !editing && (
                  <div className="hidden md:flex flex-col gap-4">
                    <GivingTrustPanel zelleInfo={zelleInfo} onCopy={handleCopy} copied={copied} />
                  </div>
                )}
              </div>
            )}
            {activeSection === "giving" && zelleInfo && !editing && (
              <div className="md:hidden mt-4">
                <GivingTrustPanel zelleInfo={zelleInfo} onCopy={handleCopy} copied={copied} />
              </div>
            )}

            {/* ── Receipts section ── */}
            {activeSection === "receipts" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10 }}>
                  <button onClick={() => openSubmitModal()} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    <Plus size={14} />Submit receipt
                  </button>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {canManage && (
                      <button onClick={handleExport} disabled={exporting} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", border: "1px solid #ECE8DE", borderRadius: 10, background: "white", color: "#5A5466", fontSize: 13, cursor: "pointer" }}>
                        <Download size={13} />{exporting ? "…" : "Export"}
                      </button>
                    )}
                    <div style={{ position: "relative" }}>
                      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "9px 32px 9px 12px", border: "1px solid #ECE8DE", borderRadius: 10, background: "white", color: "#5A5466", fontSize: 13, cursor: "pointer", appearance: "none", outline: "none" }}>
                        <option value="all">All</option>
                        {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8A8497" }} />
                    </div>
                  </div>
                </div>

                {receiptsLoading ? <Spinner /> : filteredReceipts.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A8497" }}>
                    <Receipt size={28} style={{ margin: "0 auto 12px", opacity: 0.4 }} />
                    <p style={{ fontSize: 14 }}>{filterStatus === "all" ? "No receipts yet" : `No ${STATUS_META[filterStatus]?.label.toLowerCase()} receipts`}</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {filteredReceipts.map(r => (
                      <ReceiptRow key={r.id} receipt={r} canManage={canManage} onStatusChange={handleStatusChange} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showSubmitModal && (
        <SubmitReceiptModal
          ministryId={ministryId}
          limits={limits}
          prefillCategory={prefillCategory}
          prefillFund={prefillFund}
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={handleReceiptSubmitted}
        />
      )}
    </div>
  )
}
