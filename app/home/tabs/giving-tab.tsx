"use client"

import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase"
import { Pencil, Check, Copy, ExternalLink, Plus, Receipt, ChevronDown, X, Upload, Download, AlertTriangle, FileText, DollarSign } from "lucide-react"
import { DesktopTopbar } from "../components/desktop-nav"
import { Spinner } from "../components/shared"
import { submitReceipt, updateReceiptStatus, exportReceiptsCSV, getReceiptLimits } from "@/app/actions/receipts"
import { createReimbursementForm, updateFormStatus, getReimbursementForms, addBudgetEntry, getBudgetEntries, exportBudgetCSV } from "@/app/actions/reimbursements"
import type { Receipt as ReceiptType, ReceiptLimit } from "@/app/actions/receipts"
import type { ReimbursementForm, ReimbursementFormItem, BudgetEntry } from "@/app/actions/reimbursements"

interface Props {
  ministryId: string
  userId: string
  userName: string
  userRole: string
  isAdmin: boolean
  isTreasurer: boolean
  isDGL: boolean
  activeSection: "give" | "reimbursements" | "budget"
  onSectionChange: (s: "give" | "reimbursements" | "budget") => void
}

const CATEGORIES = [
  { value: "dg_dinner", label: "DG Dinner" },
  { value: "welcoming_week", label: "Welcoming Week" },
  { value: "retreat", label: "Retreat" },
  { value: "bbq", label: "BBQ" },
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
  rejected:   { label: "Rejected",  bg: "#FEE2E2", text: "#991B1B" },
  reimbursed: { label: "Reimbursed",bg: "#EDE5F0", text: "#3E1540" },
  flagged:    { label: "Flagged",   bg: "#FFF8E1", text: "#B45309" },
}

const PRESET_AMOUNTS = ["10", "25", "50", "100", "250"]

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #ECE8DE",
  borderRadius: 10, fontSize: 13, color: "#13101A", background: "#FDFBF7",
  outline: "none", boxSizing: "border-box",
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "#8A8497", marginBottom: 5, display: "block",
}

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 999, background: m.bg, color: m.text, textTransform: "uppercase" }}>
      {m.label}
    </span>
  )
}

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
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
  ministryId, limits, prefillCategory, prefillFund, onClose, onSubmitted,
}: {
  ministryId: string; limits: ReceiptLimit[]; prefillCategory?: string; prefillFund?: string;
  onClose: () => void; onSubmitted: (r: ReceiptType) => void
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
    setSubmitting(true); setError(null)
    const { data, error: err } = await submitReceipt({ ministryId, eventName, category, fund, amount: numAmount, purchaseDate, receiptImageUrl: imageUrl, notes })
    if (err) { setError(err); setSubmitting(false); return }
    if (data) onSubmitted(data)
    onClose()
  }

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

interface DraftItem {
  item_date: string
  description: string
  cost: string
}

function ReimbursementFormModal({
  ministryId, userName, ownReceipts, onClose, onCreated,
}: {
  ministryId: string; userName: string;
  ownReceipts: (ReceiptType & { submitted_by_name?: string })[];
  onClose: () => void; onCreated: (form: ReimbursementForm) => void
}) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0])
  const [expensePurpose, setExpensePurpose] = useState("")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<DraftItem[]>([
    { item_date: new Date().toISOString().split("T")[0], description: "", cost: "" },
  ])
  const [selectedReceiptId, setSelectedReceiptId] = useState<string>("none")
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [certified, setCertified] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pendingReceipts = ownReceipts.filter(r => r.status === "pending")
  const total = items.reduce((sum, it) => sum + (parseFloat(it.cost) || 0), 0)

  function addItem() {
    if (items.length >= 10) return
    setItems(prev => [...prev, { item_date: new Date().toISOString().split("T")[0], description: "", cost: "" }])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof DraftItem, value: string) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split(".").pop() ?? "jpg"
    const path = `receipts/${ministryId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from("announcement-images").upload(path, file, { upsert: false })
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from("announcement-images").getPublicUrl(data.path)
      setUploadedReceiptUrl(publicUrl)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleSubmit() {
    if (!expensePurpose.trim()) { setError("Please enter the expense purpose."); return }
    const validItems = items.filter(it => it.description.trim() && parseFloat(it.cost) > 0)
    if (validItems.length === 0) { setError("Add at least one line item with a description and cost."); return }
    if (!certified) { setError("Please certify that this reimbursement is accurate."); return }

    const receiptIds: string[] = []
    if (selectedReceiptId !== "none") receiptIds.push(selectedReceiptId)

    setSubmitting(true); setError(null)
    const { data, error: err } = await createReimbursementForm({
      ministryId, formDate, expensePurpose: expensePurpose.trim(), notes: notes.trim(),
      items: validItems.map((it, i) => ({
        item_date: it.item_date || null, description: it.description.trim(),
        cost: parseFloat(it.cost), order_index: i,
      })),
      receiptIds,
    })
    if (err || !data) { setError(err ?? "Failed to create form."); setSubmitting(false); return }
    onCreated(data)
    onClose()
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(19,16,26,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: "#FDFBF7", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", borderBottom: "1px solid #ECE8DE", flexShrink: 0 }}>
          <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#13101A" }}>Reimbursement form</p>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#F2EDE0", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} color="#5A5466" />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name + Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input type="text" value={userName} readOnly style={{ ...inputStyle, background: "#F4F1E8", color: "#5A5466" }} />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {/* Expense Purpose */}
          <div>
            <label style={labelStyle}>Expense purpose</label>
            <input type="text" placeholder="e.g. DG Meal – Week 5, Oct 18" value={expensePurpose} onChange={e => setExpensePurpose(e.target.value)} style={inputStyle} />
          </div>

          {/* Line items */}
          <div>
            <label style={labelStyle}>Itemized expenses</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Header row */}
              <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 90px 28px", gap: 6 }}>
                <span style={{ fontSize: 10, color: "#8A8497", letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 2 }}>Date</span>
                <span style={{ fontSize: 10, color: "#8A8497", letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 2 }}>Description</span>
                <span style={{ fontSize: 10, color: "#8A8497", letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 2 }}>Cost</span>
                <span />
              </div>
              {items.map((it, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "130px 1fr 90px 28px", gap: 6, alignItems: "center" }}>
                  <input type="date" value={it.item_date} onChange={e => updateItem(i, "item_date", e.target.value)} style={{ ...inputStyle, padding: "8px 10px" }} />
                  <input type="text" placeholder="What was purchased" value={it.description} onChange={e => updateItem(i, "description", e.target.value)} style={{ ...inputStyle, padding: "8px 10px" }} />
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={it.cost} onChange={e => updateItem(i, "cost", e.target.value)} style={{ ...inputStyle, padding: "8px 10px" }} />
                  <button onClick={() => removeItem(i)} disabled={items.length === 1} style={{ width: 28, height: 28, borderRadius: "50%", background: items.length === 1 ? "transparent" : "#F2EDE0", border: "none", cursor: items.length === 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: items.length === 1 ? 0.3 : 1 }}>
                    <X size={11} color="#5A5466" />
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                {items.length < 10 ? (
                  <button onClick={addItem} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#3E1540", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500 }}>
                    <Plus size={13} /> Add row
                  </button>
                ) : <span />}
                <p style={{ fontSize: 14, fontWeight: 700, color: "#13101A" }}>Total: ${total.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea placeholder="Additional context for the deacon" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
          </div>

          {/* Attach receipt */}
          <div>
            <label style={labelStyle}>Attach receipt</label>
            {pendingReceipts.length > 0 && (
              <select value={selectedReceiptId} onChange={e => setSelectedReceiptId(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
                <option value="none">— Select existing receipt —</option>
                {pendingReceipts.map(r => (
                  <option key={r.id} value={r.id}>{r.event_name || CATEGORIES.find(c => c.value === r.category)?.label} · ${Number(r.amount).toFixed(2)}</option>
                ))}
              </select>
            )}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
            {uploadedReceiptUrl ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <a href={uploadedReceiptUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#3E1540", fontWeight: 500 }}>View uploaded receipt</a>
                <button onClick={() => setUploadedReceiptUrl(null)} style={{ fontSize: 12, color: "#8A8497", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", border: "1px dashed #C4C4C4", borderRadius: 10, background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer", width: "100%", boxSizing: "border-box" }}>
                <Upload size={14} />
                {uploading ? "Uploading…" : "Upload new receipt"}
              </button>
            )}
          </div>

          {/* Certify */}
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={certified} onChange={e => setCertified(e.target.checked)} style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16, accentColor: "#3E1540" }} />
            <span style={{ fontSize: 13, color: "#5A5466", lineHeight: 1.5 }}>
              I certify that this reimbursement request is accurate and the expenses were incurred for ministry purposes.
            </span>
          </label>

          {error && <p style={{ fontSize: 13, color: "#B91C1C" }}>{error}</p>}
        </div>
        <div style={{ padding: "12px 20px 24px", borderTop: "1px solid #ECE8DE", flexShrink: 0 }}>
          <button onClick={handleSubmit} disabled={submitting} style={{ width: "100%", height: 46, background: "#3E1540", color: "#F6F4EF", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "Submitting…" : "Submit form"}
          </button>
        </div>
      </div>
    </div>
  )
}

function FormRow({
  form, canApprove, onApprove, onReject,
}: {
  form: ReimbursementForm; canApprove: boolean;
  onApprove: (formId: string) => void; onReject: (formId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const total = form.items.reduce((sum, it) => sum + Number(it.cost), 0)
  const cat = form.items.length > 0
    ? (CATEGORIES.find(c => form.expense_purpose?.toLowerCase().includes(c.value.replace(/_/g, " ")))?.label ?? "Other")
    : "Other"

  return (
    <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 12, overflow: "hidden" }}>
      <button onClick={() => setExpanded(!expanded)} style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", lineHeight: 1.2, marginBottom: 3 }}>
            {form.expense_purpose || "Reimbursement"}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ fontSize: 12, color: "#8A8497" }}>{new Date(form.form_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            {form.submitted_by_name && <p style={{ fontSize: 12, color: "#8A8497" }}>· {form.submitted_by_name}</p>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#13101A" }}>${total.toFixed(2)}</p>
          <StatusBadge status={form.status} />
        </div>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid #ECE8DE", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Line items */}
          {form.items.length > 0 && (
            <div>
              <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", marginBottom: 8 }}>Items</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {form.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ display: "flex", gap: 10, flex: 1 }}>
                      {it.item_date && <span style={{ fontSize: 12, color: "#8A8497", flexShrink: 0 }}>{new Date(it.item_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                      <span style={{ fontSize: 13, color: "#13101A" }}>{it.description}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#13101A", flexShrink: 0 }}>${Number(it.cost).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: "1px solid #ECE8DE", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "flex-end" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#13101A" }}>Total: ${total.toFixed(2)}</span>
              </div>
            </div>
          )}
          {form.notes && <p style={{ fontSize: 12.5, color: "#5A5466", lineHeight: 1.5 }}>{form.notes}</p>}
          {form.approved_by_name && (
            <p style={{ fontSize: 12, color: "#8A8497" }}>
              {form.status === "approved" ? "Approved" : "Reviewed"} by {form.approved_by_name}
            </p>
          )}
          {canApprove && form.status === "pending" && (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={() => onApprove(form.id)} style={{ padding: "8px 18px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Approve</button>
              <button onClick={() => onReject(form.id)} style={{ padding: "8px 18px", background: "#FEE2E2", color: "#991B1B", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Reject</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function GivingTab({ ministryId, userId, userName, userRole, isAdmin, isTreasurer, isDGL, activeSection, onSectionChange }: Props) {
  const supabase = createClient()

  // Give section
  const [zelleInfo, setZelleInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [zelleFallback, setZelleFallback] = useState(false)
  const [amount, setAmount] = useState("50")

  // Receipts
  const [receipts, setReceipts] = useState<(ReceiptType & { submitted_by_name?: string })[]>([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [limits, setLimits] = useState<ReceiptLimit[]>([])
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [exporting, setExporting] = useState(false)

  // Reimbursement forms
  const [forms, setForms] = useState<ReimbursementForm[]>([])
  const [formsLoading, setFormsLoading] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)

  // Budget
  const [budgetEntries, setBudgetEntries] = useState<BudgetEntry[]>([])
  const [budgetLoading, setBudgetLoading] = useState(false)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
  const [entryCategory, setEntryCategory] = useState("other")
  const [entryDescription, setEntryDescription] = useState("")
  const [entryAmount, setEntryAmount] = useState("")
  const [addingEntry, setAddingEntry] = useState(false)
  const [budgetExporting, setBudgetExporting] = useState(false)

  const canManageReceipts = isAdmin || ["admin", "leader"].includes(userRole.toLowerCase())
  const canViewAllForms = isTreasurer || isAdmin
  const canApproveForm = isAdmin
  const canAccessReimbursements = isDGL || isTreasurer || isAdmin
  const canAccessBudget = isTreasurer || isAdmin

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
    if (activeSection === "reimbursements") {
      loadReceipts()
      if (canViewAllForms) loadForms()
    } else if (activeSection === "budget") {
      loadBudget()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  async function loadReceipts() {
    setReceiptsLoading(true)
    const query = canManageReceipts
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

  async function loadForms() {
    setFormsLoading(true)
    const { data } = await getReimbursementForms(ministryId, canViewAllForms)
    setForms(data)
    setFormsLoading(false)
  }

  async function loadBudget() {
    setBudgetLoading(true)
    const { data } = await getBudgetEntries(ministryId)
    setBudgetEntries(data)
    setBudgetLoading(false)
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

  function handleReceiptSubmitted(r: ReceiptType) {
    setReceipts(prev => [r, ...prev])
  }

  function handleFormCreated(form: ReimbursementForm) {
    setForms(prev => [form, ...prev])
  }

  async function handleReceiptStatusChange(id: string, status: string) {
    await updateReceiptStatus({ receiptId: id, status })
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, status, reviewed_by: userId, reviewed_at: new Date().toISOString() } : r))
  }

  async function handleApproveForm(formId: string) {
    const form = forms.find(f => f.id === formId)
    if (!form) return
    const total = form.items.reduce((sum, it) => sum + Number(it.cost), 0)
    const cat = CATEGORIES.find(c => form.expense_purpose?.toLowerCase().includes(c.value.replace(/_/g, " ")))?.value ?? "other"
    await updateFormStatus({ formId, ministryId, status: "approved", expensePurpose: form.expense_purpose ?? undefined, totalAmount: total, category: cat })
    setForms(prev => prev.map(f => f.id === formId ? { ...f, status: "approved" } : f))
  }

  async function handleRejectForm(formId: string) {
    await updateFormStatus({ formId, ministryId, status: "rejected" })
    setForms(prev => prev.map(f => f.id === formId ? { ...f, status: "rejected" } : f))
  }

  async function handleExportReceipts() {
    setExporting(true)
    const { csv } = await exportReceiptsCSV(ministryId)
    if (csv) {
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = "receipts.csv"; a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
  }

  async function handleAddBudgetEntry() {
    const amt = parseFloat(entryAmount)
    if (!amt || amt <= 0) return
    setAddingEntry(true)
    const { data } = await addBudgetEntry({ ministryId, category: entryCategory, description: entryDescription.trim(), amount: amt, entryDate })
    if (data) setBudgetEntries(prev => [data, ...prev])
    setEntryDate(new Date().toISOString().split("T")[0])
    setEntryCategory("other"); setEntryDescription(""); setEntryAmount("")
    setShowAddEntry(false); setAddingEntry(false)
  }

  async function handleExportBudget() {
    setBudgetExporting(true)
    const { csv } = await exportBudgetCSV(ministryId)
    if (csv) {
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = "budget.csv"; a.click()
      URL.revokeObjectURL(url)
    }
    setBudgetExporting(false)
  }

  const displayAmount = amount || "0"
  const filteredReceipts = filterStatus === "all" ? receipts : receipts.filter(r => r.status === filterStatus)

  // Budget summary by category
  const categorySummary = CATEGORIES.map(cat => ({
    ...cat,
    total: budgetEntries.filter(e => e.category === cat.value).reduce((sum, e) => sum + Number(e.amount), 0),
  })).filter(c => c.total > 0)

  // Visible sections for mobile pill strip
  const visibleSections: { id: "give" | "reimbursements" | "budget"; label: string }[] = [
    { id: "give", label: "Give" },
    ...(canAccessReimbursements ? [{ id: "reimbursements" as const, label: "Reimbursements" }] : []),
    ...(canAccessBudget ? [{ id: "budget" as const, label: "Budget" }] : []),
  ]

  const sectionTitle = activeSection === "give" ? "Finance" : activeSection === "reimbursements" ? "Reimbursements" : "Budget"

  return (
    <div className="pb-28 md:pb-0 md:h-full md:overflow-y-auto">
      <DesktopTopbar crumbs={["Central", "Finance", ...(activeSection !== "give" ? [activeSection === "reimbursements" ? "Reimbursements" : "Budget"] : [])]} />

      <div className="px-5 pt-14 md:px-10 md:py-8 max-w-[740px] md:max-w-none">

        {/* Header */}
        <div className="mb-6 mt-6 md:mt-0 md:mb-8 md:max-w-[680px]">
          <p className="text-[11px] tracking-[0.14em] uppercase text-[#8A8497] mb-2.5">2 Corinthians 9:7</p>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1, color: "#13101A", fontWeight: 400 }}>
            {sectionTitle}
          </h1>
          <p className="mt-3 text-[14px] text-[#5A5466] leading-relaxed md:max-w-[520px]">
            {activeSection === "give" && "Give directly and track ministry expenses in one place."}
            {activeSection === "reimbursements" && "Submit receipts and reimbursement forms for ministry expenses."}
            {activeSection === "budget" && "Track all ministry expenses and approved reimbursements."}
          </p>
        </div>

        {/* Mobile-only section tab strip */}
        {visibleSections.length > 1 && (
          <div className="flex gap-2 mb-6 md:hidden flex-wrap">
            {visibleSections.map(s => (
              <button key={s.id} onClick={() => onSectionChange(s.id)} style={{ padding: "7px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500, border: activeSection === s.id ? "none" : "1px solid #ECE8DE", background: activeSection === s.id ? "#3E1540" : "white", color: activeSection === s.id ? "#F6F4EF" : "#5A5466", cursor: "pointer" }}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {loading ? <Spinner /> : (
          <>
            {/* ── Give section ── */}
            {activeSection === "give" && (
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
            {activeSection === "give" && zelleInfo && !editing && (
              <div className="md:hidden mt-4">
                <GivingTrustPanel zelleInfo={zelleInfo} onCopy={handleCopy} copied={copied} />
              </div>
            )}

            {/* ── Reimbursements section ── */}
            {activeSection === "reimbursements" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {/* Receipts subsection */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#13101A" }}>Receipts</p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {canManageReceipts && (
                        <button onClick={handleExportReceipts} disabled={exporting} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "1px solid #ECE8DE", borderRadius: 10, background: "white", color: "#5A5466", fontSize: 13, cursor: "pointer" }}>
                          <Download size={13} />{exporting ? "…" : "Export"}
                        </button>
                      )}
                      <div style={{ position: "relative" }}>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "8px 28px 8px 10px", border: "1px solid #ECE8DE", borderRadius: 10, background: "white", color: "#5A5466", fontSize: 13, cursor: "pointer", appearance: "none", outline: "none" }}>
                          <option value="all">All</option>
                          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#8A8497" }} />
                      </div>
                      <button onClick={() => setShowSubmitModal(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        <Plus size={14} />Upload
                      </button>
                    </div>
                  </div>

                  {receiptsLoading ? <Spinner /> : filteredReceipts.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 20px", color: "#8A8497", background: "white", border: "1px solid #ECE8DE", borderRadius: 12 }}>
                      <Receipt size={24} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                      <p style={{ fontSize: 14 }}>{filterStatus === "all" ? "No receipts yet" : `No ${STATUS_META[filterStatus]?.label.toLowerCase()} receipts`}</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {filteredReceipts.map(r => (
                        <ReceiptRow key={r.id} receipt={r} canManage={canManageReceipts} onStatusChange={handleReceiptStatusChange} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Reimbursement Forms subsection — Treasurer + Admin only */}
                {canViewAllForms && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: "#13101A" }}>Reimbursement forms</p>
                      {isTreasurer && (
                        <button onClick={() => setShowFormModal(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          <FileText size={14} />New form
                        </button>
                      )}
                    </div>

                    {formsLoading ? <Spinner /> : forms.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "32px 20px", color: "#8A8497", background: "white", border: "1px solid #ECE8DE", borderRadius: 12 }}>
                        <FileText size={24} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                        <p style={{ fontSize: 14 }}>No reimbursement forms yet</p>
                        {isTreasurer && <p style={{ fontSize: 12, marginTop: 4 }}>Create a form to submit a reimbursement request to a deacon.</p>}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {forms.map(f => (
                          <FormRow key={f.id} form={f} canApprove={canApproveForm} onApprove={handleApproveForm} onReject={handleRejectForm} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Budget section ── */}
            {activeSection === "budget" && canAccessBudget && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "#13101A" }}>Expense ledger</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleExportBudget} disabled={budgetExporting} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "1px solid #ECE8DE", borderRadius: 10, background: "white", color: "#5A5466", fontSize: 13, cursor: "pointer" }}>
                      <Download size={13} />{budgetExporting ? "…" : "Export"}
                    </button>
                    <button onClick={() => setShowAddEntry(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: showAddEntry ? "#F2EDE0" : "#3E1540", color: showAddEntry ? "#13101A" : "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      <Plus size={14} />Add entry
                    </button>
                  </div>
                </div>

                {/* Add Entry inline form */}
                {showAddEntry && (
                  <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 12, padding: "16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#13101A" }}>New manual entry</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={labelStyle}>Date</label>
                        <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Category</label>
                        <select value={entryCategory} onChange={e => setEntryCategory(e.target.value)} style={inputStyle}>
                          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                      <div>
                        <label style={labelStyle}>Description</label>
                        <input type="text" placeholder="What was this expense for?" value={entryDescription} onChange={e => setEntryDescription(e.target.value)} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Amount ($)</label>
                        <input type="number" min="0" step="0.01" placeholder="0.00" value={entryAmount} onChange={e => setEntryAmount(e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => setShowAddEntry(false)} style={{ padding: "8px 16px", background: "transparent", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#5A5466", cursor: "pointer" }}>Cancel</button>
                      <button onClick={handleAddBudgetEntry} disabled={addingEntry || !entryAmount} style={{ padding: "8px 18px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: addingEntry || !entryAmount ? 0.6 : 1 }}>
                        {addingEntry ? "Adding…" : "Add"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Category summary chips */}
                {categorySummary.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {categorySummary.map(c => (
                      <div key={c.value} style={{ padding: "6px 12px", background: "white", border: "1px solid #ECE8DE", borderRadius: 999, display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "#5A5466" }}>{c.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#13101A" }}>${c.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {budgetLoading ? <Spinner /> : budgetEntries.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A8497", background: "white", border: "1px solid #ECE8DE", borderRadius: 12 }}>
                    <DollarSign size={24} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                    <p style={{ fontSize: 14 }}>No budget entries yet</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Approved reimbursements are logged automatically.</p>
                  </div>
                ) : (
                  <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 12, overflow: "hidden" }}>
                    {/* Table header */}
                    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 140px 100px 90px", gap: 8, padding: "10px 16px", borderBottom: "1px solid #ECE8DE", background: "#F9F7F2" }}>
                      {["Date", "Description", "Category", "Amount", "Source"].map(h => (
                        <span key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>{h}</span>
                      ))}
                    </div>
                    {budgetEntries.map((e, i) => (
                      <div key={e.id} style={{ display: "grid", gridTemplateColumns: "100px 1fr 140px 100px 90px", gap: 8, padding: "12px 16px", borderTop: i > 0 ? "1px solid #F2EDE0" : "none", alignItems: "center" }}>
                        <span style={{ fontSize: 12.5, color: "#5A5466" }}>
                          {new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        <span style={{ fontSize: 13, color: "#13101A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description ?? "—"}</span>
                        <span style={{ fontSize: 12.5, color: "#5A5466" }}>{CATEGORIES.find(c => c.value === e.category)?.label ?? e.category}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#13101A" }}>${Number(e.amount).toFixed(2)}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 999, textTransform: "uppercase", background: e.source === "reimbursement" ? "#EDE5F0" : "#F2F0F5", color: e.source === "reimbursement" ? "#3E1540" : "#5A5466", display: "inline-block" }}>
                          {e.source === "reimbursement" ? "Auto" : "Manual"}
                        </span>
                      </div>
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
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={handleReceiptSubmitted}
        />
      )}

      {showFormModal && (
        <ReimbursementFormModal
          ministryId={ministryId}
          userName={userName}
          ownReceipts={receipts.filter(r => r.submitted_by === userId)}
          onClose={() => setShowFormModal(false)}
          onCreated={handleFormCreated}
        />
      )}
    </div>
  )
}
