"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase"
import {
  Pencil, Check, Copy, ExternalLink, Plus, ChevronDown, X,
  Upload, Download, DollarSign, AlertTriangle, ChevronRight,
  FileText, ImageIcon,
} from "lucide-react"
import { DesktopTopbar } from "../components/desktop-nav"
import { Spinner } from "../components/shared"
import { submitReceipt, getReceiptLimits } from "@/app/actions/receipts"
import {
  getDGDinnerForms, getOtherForms, createOtherForm,
  saveFormDraft, submitReimbursementForm,
  dismissForm, undismissForm,
  submitReceiptForForm, getReceiptForForm, getUserSavedSignature,
  addBudgetEntry, getBudgetEntries, exportBudgetCSV,
} from "@/app/actions/reimbursements"
import {
  getBudgetAllocations, getCategoryActuals, upsertBudgetAllocation,
  getBudgetCategories, addBudgetCategory, deleteBudgetCategory,
  type BudgetAllocation, type CategoryActual,
} from "@/app/actions/budget-planning"

function currentFiscalYear(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}
import type { Receipt as ReceiptType, ReceiptLimit } from "@/app/actions/receipts"
import type { ReimbursementForm, ItemizedExpense, BudgetEntry } from "@/app/actions/reimbursements"

interface Props {
  ministryId: string
  userId: string
  userName: string
  userRole: string
  isAdmin: boolean
  isTreasurer: boolean
  isDGL: boolean
  activeSection: "give" | "reimbursements" | "budget" | "allocation"
  onSectionChange: (s: "give" | "reimbursements" | "budget" | "allocation") => void
}

interface DynamicCategory {
  value: string
  label: string
  isPermanent: boolean
}

// DG Dinner is the only hardcoded permanent category; all others come from calendar events + custom DB entries
const DG_DINNER_CATEGORY: DynamicCategory = { value: "DG Dinner", label: "DG Dinner", isPermanent: true }

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

const FORM_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  not_started: { label: "Not started", bg: "#F2F0F5", text: "#8A8497" },
  in_progress: { label: "In progress", bg: "#FFF3CD", text: "#854D0E" },
  complete:    { label: "Complete",    bg: "#DCFCE7", text: "#166534" },
}

const DISMISSAL_REASONS = [
  { value: "break", label: "Break" },
  { value: "cancelled", label: "Cancelled" },
  { value: "provided", label: "Provided" },
]

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

function FormStatusBadge({ status }: { status: string }) {
  const m = FORM_STATUS_META[status] ?? FORM_STATUS_META.not_started
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 999, background: m.bg, color: m.text, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  )
}

function Initials({ name, size = 28 }: { name: string; size?: number }) {
  const parts = name.trim().split(" ")
  const initials = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#3E1540", color: "#F6F4EF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 600, flexShrink: 0 }}>
      {initials.toUpperCase()}
    </div>
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

function SubmitReceiptModal({
  ministryId, limits, categories, onClose, onSubmitted,
}: {
  ministryId: string; limits: ReceiptLimit[];
  categories: DynamicCategory[];
  onClose: () => void; onSubmitted: (r: ReceiptType) => void
}) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState(() => categories[0]?.value ?? "DG Dinner")
  const [fund, setFund] = useState("church")
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
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const ext = file.name.split(".").pop() ?? "jpg"
    const { data, error } = await supabase.storage.from("announcement-images").upload(`receipts/${ministryId}/${Date.now()}.${ext}`, file, { upsert: false })
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
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#F2EDE0", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} color="#5A5466" /></button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Category</label><select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>{categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div><label style={labelStyle}>Fund</label><select value={fund} onChange={e => setFund(e.target.value)} style={inputStyle}>{FUNDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Amount ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Purchase date</label><input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={inputStyle} /></div>
          </div>
          {overLimit && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FFF8E1", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 12px" }}>
              <AlertTriangle size={14} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, color: "#B45309", lineHeight: 1.5 }}>This exceeds the ${limit!.max_amount} limit for {categories.find(c => c.value === category)?.label ?? category}. You can still submit.</p>
            </div>
          )}
          <div><label style={labelStyle}>Event name (optional)</label><input type="text" placeholder="e.g. Week 3 DG Dinner" value={eventName} onChange={e => setEventName(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Notes (optional)</label><textarea placeholder="What was purchased?" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} /></div>
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
                <Upload size={14} />{uploading ? "Uploading…" : "Upload image"}
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

interface ReceiptData {
  id: string
  receipt_image_url: string | null
  amount: number
  submitted_by_name: string | null
  submitted_at: string
}

function ReceiptPanel({
  form, dglNames, userId, isTreasurer, isAdmin, isDGLPair, ministryId, dgDinnerLimit,
  receiptData, onReceiptSubmitted,
}: {
  form: ReimbursementForm
  dglNames: Map<string, string>
  userId: string
  isTreasurer: boolean
  isAdmin: boolean
  isDGLPair: boolean
  ministryId: string
  dgDinnerLimit: number | null
  receiptData: ReceiptData | null
  onReceiptSubmitted: (r: ReceiptData) => void
}) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [amount, setAmount] = useState("")
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canUpload = isDGLPair || isTreasurer || isAdmin
  const numAmount = parseFloat(amount) || 0
  const overLimit = dgDinnerLimit !== null && numAmount > 0 && numAmount > dgDinnerLimit

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const ext = file.name.split(".").pop() ?? "jpg"
    const { data, error } = await supabase.storage.from("announcement-images").upload(`receipts/${ministryId}/${Date.now()}.${ext}`, file, { upsert: false })
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from("announcement-images").getPublicUrl(data.path)
      setImageUrl(publicUrl)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleSubmit() {
    if (!imageUrl) { setError("Please upload a receipt photo."); return }
    if (!amount || numAmount <= 0) { setError("Please enter the receipt amount."); return }
    setSubmitting(true); setError(null)
    const { data, error: err } = await submitReceiptForForm({ ministryId, formId: form.id, receiptImageUrl: imageUrl, amount: numAmount })
    if (err) { setError(err); setSubmitting(false); return }
    if (data) onReceiptSubmitted(data)
  }

  const dgl1 = form.assigned_dgl_ids[0] ? dglNames.get(form.assigned_dgl_ids[0]) : null
  const dgl2 = form.assigned_dgl_ids[1] ? dglNames.get(form.assigned_dgl_ids[1]) : null

  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", marginBottom: 10 }}>Receipt</p>

      {receiptData ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {receiptData.receipt_image_url ? (
            <a href={receiptData.receipt_image_url} target="_blank" rel="noopener noreferrer" style={{ display: "block", borderRadius: 10, overflow: "hidden", border: "1px solid #ECE8DE", maxWidth: 200 }}>
              <img src={receiptData.receipt_image_url} alt="Receipt" style={{ width: "100%", display: "block", objectFit: "cover" }} />
            </a>
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: 10, background: "#F4F1E8", border: "1px solid #ECE8DE", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ImageIcon size={18} color="#8A8497" />
            </div>
          )}
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#13101A" }}>${Number(receiptData.amount).toFixed(2)}</p>
            {overLimit && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                <AlertTriangle size={12} color="#B45309" />
                <span style={{ fontSize: 11, color: "#B45309", fontWeight: 600 }}>Over ${dgDinnerLimit} limit</span>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <Initials name={receiptData.submitted_by_name ?? "?"} size={22} />
              <div>
                <p style={{ fontSize: 12.5, fontWeight: 500, color: "#13101A" }}>{receiptData.submitted_by_name ?? "Unknown"}</p>
                <p style={{ fontSize: 11, color: "#8A8497" }}>{new Date(receiptData.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
              </div>
            </div>
          </div>
        </div>
      ) : canUpload ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(dgl1 || dgl2) && (
            <p style={{ fontSize: 12.5, color: "#8A8497", lineHeight: 1.5 }}>
              Waiting for receipt from{" "}
              {dgl1 && <strong style={{ color: "#13101A" }}>{dgl1}</strong>}
              {dgl1 && dgl2 && " or "}
              {dgl2 && <strong style={{ color: "#13101A" }}>{dgl2}</strong>}
            </p>
          )}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
          {imageUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a href={imageUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "#3E1540", fontWeight: 500 }}>View uploaded photo</a>
              <button onClick={() => setImageUrl(null)} style={{ fontSize: 12, color: "#8A8497", background: "none", border: "none", cursor: "pointer" }}>Remove</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", border: "1px dashed #C4C4C4", borderRadius: 10, background: "transparent", color: "#5A5466", fontSize: 13, cursor: "pointer" }}>
              <Upload size={14} />{uploading ? "Uploading…" : "Upload receipt photo"}
            </button>
          )}
          <div>
            <label style={labelStyle}>Amount ($)</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inputStyle, maxWidth: 140 }} />
          </div>
          {overLimit && (
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", background: "#FFF8E1", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px" }}>
              <AlertTriangle size={12} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11.5, color: "#B45309", lineHeight: 1.4 }}>Over ${dgDinnerLimit} limit</p>
            </div>
          )}
          {error && <p style={{ fontSize: 12.5, color: "#B91C1C" }}>{error}</p>}
          <button onClick={handleSubmit} disabled={submitting} style={{ padding: "8px 16px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: submitting ? 0.6 : 1, alignSelf: "flex-start" }}>
            {submitting ? "Submitting…" : "Submit receipt"}
          </button>
        </div>
      ) : (
        <div style={{ padding: "16px", background: "#F9F7F2", borderRadius: 10, border: "1px dashed #E5E0D2" }}>
          {(dgl1 || dgl2) ? (
            <p style={{ fontSize: 12.5, color: "#8A8497", lineHeight: 1.5 }}>
              Waiting for receipt from{" "}
              {dgl1 && <strong style={{ color: "#5A5466" }}>{dgl1}</strong>}
              {dgl1 && dgl2 && " or "}
              {dgl2 && <strong style={{ color: "#5A5466" }}>{dgl2}</strong>}
            </p>
          ) : (
            <p style={{ fontSize: 12.5, color: "#8A8497" }}>No receipt submitted yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

function FormPanel({
  form, canEditForm, savedSignature, onDraft, onSubmit,
}: {
  form: ReimbursementForm
  canEditForm: boolean
  savedSignature: string | null
  onDraft: (params: { expensePurpose: string; items: ItemizedExpense[]; notes: string; signature: string; signatureSaved: boolean }) => void
  onSubmit: (params: { expensePurpose: string; items: ItemizedExpense[]; notes: string; signature: string; signatureSaved: boolean }) => void
}) {
  const [expensePurpose, setExpensePurpose] = useState(form.expense_purpose ?? "")
  const [items, setItems] = useState<ItemizedExpense[]>(
    form.itemized_expenses.length > 0
      ? form.itemized_expenses
      : [{ date: form.friday_date ?? new Date().toISOString().split("T")[0], description: "", cost: 0 }]
  )
  const [notes, setNotes] = useState(form.notes ?? "")
  const [signature, setSignature] = useState(form.signature ?? savedSignature ?? "")
  const [signatureSaved, setSignatureSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = items.reduce((sum, it) => sum + (Number(it.cost) || 0), 0)

  function addItem() {
    if (items.length >= 10) return
    setItems(prev => [...prev, { date: form.friday_date ?? new Date().toISOString().split("T")[0], description: "", cost: 0 }])
  }

  function updateItem(i: number, field: keyof ItemizedExpense, value: string | number) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: field === "cost" ? (parseFloat(value as string) || 0) : value } : it))
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleDraft() {
    setSaving(true); setError(null)
    onDraft({ expensePurpose, items, notes, signature, signatureSaved })
    setSaving(false)
  }

  async function handleSubmit() {
    if (!signature.trim()) { setError("Please sign the form."); return }
    if (items.filter(it => it.description.trim()).length === 0) { setError("Add at least one line item."); return }
    setSubmitting(true); setError(null)
    onSubmit({ expensePurpose, items, notes, signature, signatureSaved })
    setSubmitting(false)
  }

  const readOnly = !canEditForm || form.status === "complete" || !!form.dismissal_reason

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Name + Date */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input type="text" value={form.treasurer_name ?? ""} readOnly style={{ ...inputStyle, background: "#F4F1E8", color: "#5A5466" }} />
        </div>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="text" value={form.friday_date ? new Date(form.friday_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""} readOnly style={{ ...inputStyle, background: "#F4F1E8", color: "#5A5466" }} />
        </div>
      </div>

      {/* Expense Purpose */}
      <div>
        <label style={labelStyle}>Expense purpose</label>
        {readOnly
          ? <p style={{ fontSize: 13, color: "#13101A", padding: "10px 12px", background: "#F4F1E8", borderRadius: 10, border: "1px solid #ECE8DE" }}>{expensePurpose || "—"}</p>
          : <input type="text" placeholder="e.g. DG Dinner – Oct 18" value={expensePurpose} onChange={e => setExpensePurpose(e.target.value)} style={inputStyle} />
        }
      </div>

      {/* Itemized expenses */}
      <div>
        <label style={labelStyle}>Itemized expenses</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 80px 24px", gap: 6 }}>
            {["Date", "Description", "Cost", ""].map(h => (
              <span key={h} style={{ fontSize: 10, color: "#8A8497", letterSpacing: "0.08em", textTransform: "uppercase", paddingLeft: 2 }}>{h}</span>
            ))}
          </div>
          {items.map((it, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 80px 24px", gap: 6, alignItems: "center" }}>
              {readOnly ? (
                <>
                  <span style={{ fontSize: 12.5, color: "#5A5466", padding: "8px 10px" }}>{it.date ? new Date(it.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                  <span style={{ fontSize: 13, color: "#13101A", padding: "8px 10px" }}>{it.description}</span>
                  <span style={{ fontSize: 13, color: "#13101A", padding: "8px 10px" }}>${Number(it.cost).toFixed(2)}</span>
                  <span />
                </>
              ) : (
                <>
                  <input type="date" value={it.date ?? ""} onChange={e => updateItem(i, "date", e.target.value)} style={{ ...inputStyle, padding: "7px 8px" }} />
                  <input type="text" placeholder="What was purchased" value={it.description} onChange={e => updateItem(i, "description", e.target.value)} style={{ ...inputStyle, padding: "7px 8px" }} />
                  <input type="number" min="0" step="0.01" placeholder="0.00" value={it.cost === 0 ? "" : it.cost} onChange={e => updateItem(i, "cost", e.target.value)} style={{ ...inputStyle, padding: "7px 8px" }} />
                  <button onClick={() => removeItem(i)} disabled={items.length === 1} style={{ width: 24, height: 24, borderRadius: "50%", background: items.length === 1 ? "transparent" : "#F2EDE0", border: "none", cursor: items.length === 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: items.length === 1 ? 0.3 : 1 }}>
                    <X size={10} color="#5A5466" />
                  </button>
                </>
              )}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            {!readOnly && items.length < 10
              ? <button onClick={addItem} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#3E1540", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500 }}><Plus size={12} /> Add row</button>
              : <span />
            }
            <p style={{ fontSize: 14, fontWeight: 700, color: "#13101A" }}>Total: ${total.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label style={labelStyle}>Notes</label>
        {readOnly
          ? <p style={{ fontSize: 13, color: "#5A5466", padding: "10px 12px", background: "#F4F1E8", borderRadius: 10, border: "1px solid #ECE8DE", minHeight: 38 }}>{notes || "—"}</p>
          : <textarea placeholder="Additional context for the deacon" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "none" }} />
        }
      </div>

      {/* Signature */}
      <div>
        <label style={labelStyle}>Signature</label>
        {readOnly
          ? <p style={{ fontSize: 13, fontStyle: "italic", color: "#13101A", padding: "10px 12px", background: "#F4F1E8", borderRadius: 10, border: "1px solid #ECE8DE" }}>{signature || "—"}</p>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input type="text" placeholder="Type your full name to sign" value={signature} onChange={e => setSignature(e.target.value)} style={{ ...inputStyle, fontStyle: "italic" }} />
              {!savedSignature && (
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12.5, color: "#5A5466" }}>
                  <input type="checkbox" checked={signatureSaved} onChange={e => setSignatureSaved(e.target.checked)} style={{ accentColor: "#3E1540", width: 14, height: 14 }} />
                  Save for future forms
                </label>
              )}
            </div>
          )
        }
      </div>

      {error && <p style={{ fontSize: 12.5, color: "#B91C1C" }}>{error}</p>}

      {!readOnly && (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleDraft} disabled={saving} style={{ flex: 1, height: 42, background: "white", color: "#13101A", borderRadius: 10, border: "1px solid #ECE8DE", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, height: 42, background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "Submitting…" : "Submit form"}
          </button>
        </div>
      )}
    </div>
  )
}

function DismissButton({
  reason, pendingReason, onSetPending, onConfirm, onCancel,
}: {
  reason: string; label: string; pendingReason: string | null;
  onSetPending: (r: string | null) => void; onConfirm: () => void; onCancel: () => void
}) {
  const pending = pendingReason === reason
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {pending ? (
        <>
          <span style={{ fontSize: 12, color: "#5A5466" }}>Dismiss as {reason}?</span>
          <button onClick={onConfirm} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "#3E1540", color: "#F6F4EF", border: "none", cursor: "pointer" }}>Yes</button>
          <button onClick={onCancel} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "#F2EDE0", color: "#5A5466", border: "none", cursor: "pointer" }}>No</button>
        </>
      ) : null}
    </div>
  )
}

function ReimbursementCard({
  form, dglNames, userId, isTreasurer, isAdmin, isDGLPair, ministryId, dgDinnerLimit,
  savedSignature, receiptCache, onFormUpdate, onReceiptCached,
}: {
  form: ReimbursementForm
  dglNames: Map<string, string>
  userId: string
  isTreasurer: boolean
  isAdmin: boolean
  isDGLPair: boolean
  ministryId: string
  dgDinnerLimit: number | null
  savedSignature: string | null
  receiptCache: Map<string, ReceiptData | null>
  onFormUpdate: (updated: ReimbursementForm) => void
  onReceiptCached: (formId: string, data: ReceiptData) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [pendingDismiss, setPendingDismiss] = useState<string | null>(null)
  const [receiptData, setReceiptData] = useState<ReceiptData | null | undefined>(
    receiptCache.has(form.id) ? receiptCache.get(form.id) : undefined
  )

  const isDismissed = !!form.dismissal_reason
  const canEditForm = isTreasurer || isAdmin
  const canDismiss = isTreasurer || isAdmin

  useEffect(() => {
    if (!expanded || receiptData !== undefined) return
    getReceiptForForm(form.id).then(({ data }) => {
      setReceiptData(data)
      onReceiptCached(form.id, data as ReceiptData)
    })
  }, [expanded, form.id, receiptData, onReceiptCached])

  async function handleDraft(params: { expensePurpose: string; items: ItemizedExpense[]; notes: string; signature: string; signatureSaved: boolean }) {
    await saveFormDraft({ formId: form.id, expensePurpose: params.expensePurpose, itemizedExpenses: params.items, totalAmount: params.items.reduce((s, it) => s + Number(it.cost), 0), notes: params.notes, signature: params.signature, signatureSaved: params.signatureSaved })
    onFormUpdate({ ...form, status: "in_progress", expense_purpose: params.expensePurpose, itemized_expenses: params.items, total_amount: params.items.reduce((s, it) => s + Number(it.cost), 0), notes: params.notes, signature: params.signature })
  }

  async function handleSubmit(params: { expensePurpose: string; items: ItemizedExpense[]; notes: string; signature: string; signatureSaved: boolean }) {
    const total = params.items.reduce((s, it) => s + Number(it.cost), 0)
    await submitReimbursementForm({ formId: form.id, ministryId, expensePurpose: params.expensePurpose, itemizedExpenses: params.items, totalAmount: total, notes: params.notes, signature: params.signature, signatureSaved: params.signatureSaved, category: form.category })
    onFormUpdate({ ...form, status: "complete", expense_purpose: params.expensePurpose, itemized_expenses: params.items, total_amount: total, notes: params.notes, signature: params.signature })
  }

  async function handleDismiss(reason: string) {
    await dismissForm({ formId: form.id, reason })
    onFormUpdate({ ...form, dismissal_reason: reason, dismissed_at: new Date().toISOString(), dismissed_by: userId })
    setPendingDismiss(null)
  }

  async function handleUndismiss() {
    await undismissForm(form.id)
    onFormUpdate({ ...form, dismissal_reason: null, dismissed_at: null, dismissed_by: null })
  }

  // Format friday date header
  const fridayHeader = form.friday_date
    ? new Date(form.friday_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : (form.expense_purpose ?? "Form")

  const dgl1Name = form.assigned_dgl_ids[0] ? (dglNames.get(form.assigned_dgl_ids[0]) ?? "DGL") : null
  const dgl2Name = form.assigned_dgl_ids[1] ? (dglNames.get(form.assigned_dgl_ids[1]) ?? "DGL") : null

  return (
    <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 14, overflow: "hidden", opacity: isDismissed ? 0.65 : 1 }}>
      {/* Card header — click to expand */}
      <button onClick={() => setExpanded(v => !v)} style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        <ChevronRight size={14} color="#8A8497" style={{ flexShrink: 0, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#13101A", lineHeight: 1.2, textDecoration: isDismissed ? "line-through" : "none" }}>{fridayHeader}</p>
          {(dgl1Name || dgl2Name) && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {dgl1Name && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", background: "#F4F1E8", borderRadius: 999 }}>
                  <Initials name={dgl1Name} size={18} />
                  <span style={{ fontSize: 11.5, color: "#13101A", fontWeight: 500 }}>{dgl1Name}</span>
                </div>
              )}
              {dgl2Name && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", background: "#F4F1E8", borderRadius: 999 }}>
                  <Initials name={dgl2Name} size={18} />
                  <span style={{ fontSize: 11.5, color: "#13101A", fontWeight: 500 }}>{dgl2Name}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          {isDismissed ? (
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", padding: "3px 8px", borderRadius: 999, background: "#F2F0F5", color: "#8A8497", textTransform: "uppercase" }}>
              {DISMISSAL_REASONS.find(d => d.value === form.dismissal_reason)?.label ?? form.dismissal_reason}
            </span>
          ) : (
            <FormStatusBadge status={form.status} />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid #ECE8DE", padding: "18px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Two-panel layout on desktop */}
          <div className="md:grid md:gap-8" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {/* Form panel — Treasurer/Admin only */}
            {canEditForm && (
              <FormPanel
                form={form}
                canEditForm={canEditForm}
                savedSignature={savedSignature}
                onDraft={handleDraft}
                onSubmit={handleSubmit}
              />
            )}

            {/* Receipt panel */}
            <div className={canEditForm ? "" : ""}>
              <ReceiptPanel
                form={form}
                dglNames={dglNames}
                userId={userId}
                isTreasurer={isTreasurer}
                isAdmin={isAdmin}
                isDGLPair={isDGLPair}
                ministryId={ministryId}
                dgDinnerLimit={dgDinnerLimit}
                receiptData={receiptData ?? null}
                onReceiptSubmitted={data => {
                  setReceiptData(data)
                  onReceiptCached(form.id, data)
                }}
              />
            </div>
          </div>

          {/* Dismiss controls */}
          {canDismiss && !isDismissed && (
            <div style={{ paddingTop: 12, borderTop: "1px solid #F2EDE0" }}>
              <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", marginBottom: 8 }}>Dismiss this form</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {DISMISSAL_REASONS.map(dr => (
                  pendingDismiss === dr.value ? (
                    <div key={dr.value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, color: "#5A5466" }}>Dismiss as {dr.label}?</span>
                      <button onClick={() => handleDismiss(dr.value)} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "#3E1540", color: "#F6F4EF", border: "none", cursor: "pointer" }}>Yes</button>
                      <button onClick={() => setPendingDismiss(null)} style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: "#F2EDE0", color: "#5A5466", border: "none", cursor: "pointer" }}>No</button>
                    </div>
                  ) : (
                    <button key={dr.value} onClick={() => setPendingDismiss(dr.value)} disabled={!!pendingDismiss} style={{ fontSize: 12, fontWeight: 500, padding: "5px 12px", borderRadius: 999, background: "#F2F0F5", color: "#5A5466", border: "none", cursor: "pointer", opacity: pendingDismiss && pendingDismiss !== dr.value ? 0.4 : 1 }}>
                      Mark as {dr.label}
                    </button>
                  )
                ))}
              </div>
            </div>
          )}

          {isDismissed && canDismiss && (
            <div style={{ paddingTop: 12, borderTop: "1px solid #F2EDE0" }}>
              <button onClick={handleUndismiss} style={{ fontSize: 12.5, color: "#3E1540", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Undo dismissal</button>
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

  // Reimbursements
  const [dgForms, setDgForms] = useState<ReimbursementForm[]>([])
  const [otherForms, setOtherForms] = useState<ReimbursementForm[]>([])
  const [reimburseLoading, setReimburseLoading] = useState(false)
  const [dglNames, setDglNames] = useState<Map<string, string>>(new Map())
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [receiptCache, setReceiptCache] = useState<Map<string, ReceiptData | null>>(new Map())
  const [limits, setLimits] = useState<ReceiptLimit[]>([])
  const [creatingOther, setCreatingOther] = useState(false)
  const [showSubmitReceiptModal, setShowSubmitReceiptModal] = useState(false)

  // Dynamic categories (DG Dinner permanent + calendar events + custom)
  const [calEventCategories, setCalEventCategories] = useState<string[]>([])
  const [customCategories, setCustomCategories] = useState<{ id: string; name: string }[]>([])

  const dynamicCategories: DynamicCategory[] = [
    DG_DINNER_CATEGORY,
    ...calEventCategories.map(t => ({ value: t, label: t, isPermanent: true })),
    ...customCategories.map(c => ({ value: c.name, label: c.name, isPermanent: false })),
  ]

  async function handleAddCategory(name: string) {
    const trimmed = name.trim()
    if (!trimmed || dynamicCategories.some(c => c.label.toLowerCase() === trimmed.toLowerCase())) return
    const { data, error } = await addBudgetCategory(ministryId, trimmed, userId)
    if (!error && data) setCustomCategories(prev => [...prev, { id: data.id, name: data.name }])
  }

  async function handleDeleteCategory(categoryName: string) {
    await deleteBudgetCategory(ministryId, categoryName)
    setCustomCategories(prev => prev.filter(c => c.name !== categoryName))
  }

  // Budget
  const [budgetEntries, setBudgetEntries] = useState<BudgetEntry[]>([])
  const [budgetLoading, setBudgetLoading] = useState(false)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
  const [entryCategory, setEntryCategory] = useState("DG Dinner")
  const [entryDescription, setEntryDescription] = useState("")
  const [entryAmount, setEntryAmount] = useState("")
  const [addingEntry, setAddingEntry] = useState(false)
  const [budgetExporting, setBudgetExporting] = useState(false)

  const canAccessReimbursements = isDGL || isTreasurer || isAdmin
  const canAccessBudget = isTreasurer || isAdmin
  const dgDinnerLimit = limits.find(l => l.category === "dg_dinner" && l.fund === "church")?.max_amount ?? null

  useEffect(() => {
    async function load() {
      const [givingRes, limitsRes, eventsRes, customCatRes] = await Promise.all([
        supabase.from("ministry_giving").select("zelle_info").eq("ministry_id", ministryId).maybeSingle(),
        getReceiptLimits(ministryId),
        supabase.from("calendar_events").select("title").eq("ministry_id", ministryId).order("start_date"),
        getBudgetCategories(ministryId),
      ])
      setZelleInfo(givingRes.data?.zelle_info ?? null)
      setLimits(limitsRes.data)
      // Dedupe calendar event titles (exclude "DG Dinner" — it's already permanent)
      const seen = new Set<string>(["DG Dinner"])
      const uniqueTitles: string[] = []
      for (const e of ((eventsRes.data ?? []) as { title: string }[])) {
        if (!seen.has(e.title)) { seen.add(e.title); uniqueTitles.push(e.title) }
      }
      setCalEventCategories(uniqueTitles)
      setCustomCategories(customCatRes.data.map(c => ({ id: c.id, name: c.name })))
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  const loadReimbursements = useCallback(async () => {
    setReimburseLoading(true)
    const [dgRes, otherRes, sigRes] = await Promise.all([
      getDGDinnerForms(ministryId),
      getOtherForms(ministryId),
      getUserSavedSignature(),
    ])
    const allForms = [...dgRes.data, ...otherRes.data]
    setDgForms(dgRes.data)
    setOtherForms(otherRes.data)
    setSavedSignature(sigRes)

    // Resolve all DGL names
    const allDglIds = Array.from(new Set(allForms.flatMap(f => f.assigned_dgl_ids)))
    if (allDglIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, name").in("id", allDglIds)
      const nameMap = new Map<string, string>()
      for (const p of (profiles ?? []) as { id: string; name: string }[]) nameMap.set(p.id, p.name)
      setDglNames(nameMap)
    }
    setReimburseLoading(false)
  }, [ministryId, supabase])

  useEffect(() => {
    if (activeSection === "reimbursements") loadReimbursements()
    else if (activeSection === "budget") loadBudget()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  async function loadBudget() {
    setBudgetLoading(true)
    const { data } = await getBudgetEntries(ministryId)
    setBudgetEntries(data)
    setBudgetLoading(false)
  }

  async function handleSave() {
    if (!isAdmin) return
    const val = editValue.trim(); if (!val) return
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

  async function handleCreateOtherForm() {
    setCreatingOther(true)
    const { data } = await createOtherForm({ ministryId, expensePurpose: "" })
    if (data) setOtherForms(prev => [data, ...prev])
    setCreatingOther(false)
  }

  async function handleAddBudgetEntry() {
    const amt = parseFloat(entryAmount); if (!amt || amt <= 0) return
    setAddingEntry(true)
    const { data } = await addBudgetEntry({ ministryId, category: entryCategory, description: entryDescription.trim(), amount: amt, entryDate })
    if (data) setBudgetEntries(prev => [data, ...prev])
    setEntryDate(new Date().toISOString().split("T")[0]); setEntryCategory("other"); setEntryDescription(""); setEntryAmount("")
    setShowAddEntry(false); setAddingEntry(false)
  }

  async function handleExportBudget() {
    setBudgetExporting(true)
    const { csv } = await exportBudgetCSV(ministryId)
    if (csv) {
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "budget.csv"; a.click()
      URL.revokeObjectURL(url)
    }
    setBudgetExporting(false)
  }

  function handleReceiptCached(formId: string, data: ReceiptData | null) {
    setReceiptCache(prev => { const m = new Map(prev); m.set(formId, data); return m })
  }

  // Determine if current user is in DGL pair for a given form
  function isInDGLPair(form: ReimbursementForm): boolean {
    return form.assigned_dgl_ids.includes(userId)
  }

  const displayAmount = amount || "0"
  // Build category summary from dynamic categories + any orphaned categories in actual entries
  const allEntryCategories = Array.from(new Set(budgetEntries.map(e => e.category)))
  const orphanedCategories = allEntryCategories
    .filter(c => !dynamicCategories.some(d => d.value === c))
    .map(c => ({ value: c, label: c, isPermanent: false }))
  const summaryCategories = [...dynamicCategories, ...orphanedCategories]
  const categorySummary = summaryCategories.map(cat => ({
    ...cat,
    total: budgetEntries.filter(e => e.category === cat.value).reduce((sum, e) => sum + Number(e.amount), 0),
  })).filter(c => c.total > 0)

  const visibleSections: { id: "give" | "reimbursements" | "budget" | "allocation"; label: string }[] = [
    { id: "give", label: "Give" },
    ...(canAccessReimbursements ? [{ id: "reimbursements" as const, label: "Reimbursements" }] : []),
    ...(canAccessBudget ? [{ id: "budget" as const, label: "Budget" }] : []),
    ...(canAccessBudget ? [{ id: "allocation" as const, label: "Allocation" }] : []),
  ]

  const sectionLabel = activeSection === "give" ? "Give" : activeSection === "reimbursements" ? "Reimbursements" : activeSection === "budget" ? "Budget" : "Allocation"
  const sectionSubtitle = activeSection === "give" ? "Give directly and track ministry expenses in one place." : activeSection === "reimbursements" ? "Submit receipts and track reimbursement forms for ministry expenses." : activeSection === "budget" ? "Track all ministry expenses and approved reimbursements." : "Set per-fund targets for each spending category and track progress toward them."
  const monoStyle: React.CSSProperties = { fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8497" }

  return (
    <div className="pb-28 md:pb-0 md:h-full md:overflow-y-auto">
      <DesktopTopbar crumbs={["Central", "Giving", ...(activeSection !== "give" ? [sectionLabel] : [])]} />

      {/* Mobile header */}
      <div className="md:hidden px-5 pt-14 pb-5">
        <p style={monoStyle}>2 Corinthians 9:7</p>
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, color: "#13101A", lineHeight: 1.05, margin: "14px 0 0", fontWeight: 400 }}>{sectionLabel}</h1>
        <p style={{ fontSize: 14, color: "#5A5466", marginTop: 8 }}>{sectionSubtitle}</p>
      </div>

      {/* Desktop header */}
      <div className="hidden md:block px-14 pt-11 pb-8 border-b border-[#E5E0D2]">
        <p style={monoStyle}>2 Corinthians 9:7</p>
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 52, color: "#13101A", lineHeight: 1.05, margin: "14px 0 0", fontWeight: 400 }}>{sectionLabel}</h1>
        <p style={{ fontSize: 14, color: "#5A5466", marginTop: 12, maxWidth: 560 }}>{sectionSubtitle}</p>
      </div>

      <div className="px-5 md:px-14 pt-6 md:pt-8 max-w-[740px] md:max-w-none">

        {/* Mobile section tab strip */}
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
            {/* ── Give ── */}
            {activeSection === "give" && (
              <>
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
                {zelleInfo && !editing && (
                  <div className="md:hidden mt-4">
                    <GivingTrustPanel zelleInfo={zelleInfo} onCopy={handleCopy} copied={copied} />
                  </div>
                )}
              </>
            )}

            {/* ── Reimbursements ── */}
            {activeSection === "reimbursements" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                {/* DG DINNERS */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8497" }}>DG Dinners</p>
                      <p style={{ fontSize: 12.5, color: "#5A5466", marginTop: 2 }}>One form per assigned Friday — auto-generated from the rotation</p>
                    </div>
                  </div>

                  {reimburseLoading ? <Spinner /> : dgForms.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 20px", background: "white", border: "1px solid #ECE8DE", borderRadius: 12 }}>
                      <FileText size={24} style={{ margin: "0 auto 10px", opacity: 0.3 }} color="#8A8497" />
                      <p style={{ fontSize: 14, color: "#8A8497" }}>No DG dinner forms yet</p>
                      <p style={{ fontSize: 12, color: "#8A8497", marginTop: 4 }}>Forms are auto-created when the DGL rotation is published.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {dgForms.map(form => (
                        <ReimbursementCard
                          key={form.id}
                          form={form}
                          dglNames={dglNames}
                          userId={userId}
                          isTreasurer={isTreasurer}
                          isAdmin={isAdmin}
                          isDGLPair={isInDGLPair(form)}
                          ministryId={ministryId}
                          dgDinnerLimit={dgDinnerLimit}
                          savedSignature={savedSignature}
                          receiptCache={receiptCache}
                          onFormUpdate={updated => setDgForms(prev => prev.map(f => f.id === updated.id ? updated : f))}
                          onReceiptCached={handleReceiptCached}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* OTHERS */}
                {(isTreasurer || isAdmin) && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8A8497" }}>Others</p>
                        <p style={{ fontSize: 12.5, color: "#5A5466", marginTop: 2 }}>Manual reimbursement forms for other expenses</p>
                      </div>
                      <button onClick={handleCreateOtherForm} disabled={creatingOther} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: creatingOther ? 0.6 : 1 }}>
                        <Plus size={14} />New form
                      </button>
                    </div>

                    {otherForms.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 20px", background: "white", border: "1px solid #ECE8DE", borderRadius: 12 }}>
                        <p style={{ fontSize: 14, color: "#8A8497" }}>No other forms yet</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {otherForms.map(form => (
                          <ReimbursementCard
                            key={form.id}
                            form={form}
                            dglNames={dglNames}
                            userId={userId}
                            isTreasurer={isTreasurer}
                            isAdmin={isAdmin}
                            isDGLPair={isInDGLPair(form)}
                            ministryId={ministryId}
                            dgDinnerLimit={null}
                            savedSignature={savedSignature}
                            receiptCache={receiptCache}
                            onFormUpdate={updated => setOtherForms(prev => prev.map(f => f.id === updated.id ? updated : f))}
                            onReceiptCached={handleReceiptCached}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Allocation ── */}
            {activeSection === "allocation" && canAccessBudget && (
              <AllocationSection
                ministryId={ministryId}
                userId={userId}
                isTreasurer={isTreasurer}
                isAdmin={isAdmin}
                categories={dynamicCategories}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
              />
            )}

            {/* ── Budget ── */}
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

                {showAddEntry && (
                  <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 12, padding: "16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#13101A" }}>New manual entry</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div><label style={labelStyle}>Date</label><input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Category</label><select value={entryCategory} onChange={e => setEntryCategory(e.target.value)} style={inputStyle}>{dynamicCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
                      <div><label style={labelStyle}>Description</label><input type="text" placeholder="What was this expense for?" value={entryDescription} onChange={e => setEntryDescription(e.target.value)} style={inputStyle} /></div>
                      <div><label style={labelStyle}>Amount ($)</label><input type="number" min="0" step="0.01" placeholder="0.00" value={entryAmount} onChange={e => setEntryAmount(e.target.value)} style={inputStyle} /></div>
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => setShowAddEntry(false)} style={{ padding: "8px 16px", background: "transparent", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#5A5466", cursor: "pointer" }}>Cancel</button>
                      <button onClick={handleAddBudgetEntry} disabled={addingEntry || !entryAmount} style={{ padding: "8px 18px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: addingEntry || !entryAmount ? 0.6 : 1 }}>
                        {addingEntry ? "Adding…" : "Add"}
                      </button>
                    </div>
                  </div>
                )}

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
                    <p style={{ fontSize: 12, marginTop: 4 }}>Submitted reimbursement forms are logged automatically.</p>
                  </div>
                ) : (
                  <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 130px 90px 80px", gap: 8, padding: "10px 16px", borderBottom: "1px solid #ECE8DE", background: "#F9F7F2" }}>
                      {["Date", "Description", "Category", "Amount", "Source"].map(h => (
                        <span key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497" }}>{h}</span>
                      ))}
                    </div>
                    {budgetEntries.map((e, i) => (
                      <div key={e.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 130px 90px 80px", gap: 8, padding: "12px 16px", borderTop: i > 0 ? "1px solid #F2EDE0" : "none", alignItems: "center" }}>
                        <span style={{ fontSize: 12.5, color: "#5A5466" }}>{new Date(e.entry_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        <span style={{ fontSize: 13, color: "#13101A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description ?? "—"}</span>
                        <span style={{ fontSize: 12.5, color: "#5A5466" }}>{e.category}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#13101A" }}>${Number(e.amount).toFixed(2)}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", padding: "3px 7px", borderRadius: 999, textTransform: "uppercase", background: e.source === "reimbursement" ? "#EDE5F0" : "#F2F0F5", color: e.source === "reimbursement" ? "#3E1540" : "#5A5466", display: "inline-block" }}>
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

      {showSubmitReceiptModal && (
        <SubmitReceiptModal
          ministryId={ministryId}
          limits={limits}
          categories={dynamicCategories}
          onClose={() => setShowSubmitReceiptModal(false)}
          onSubmitted={() => {}}
        />
      )}
    </div>
  )
}

// ── AllocationSection ──────────────────────────────────────────────────────────

function generateYearOptions(): string[] {
  const fy = currentFiscalYear()
  const [startYear] = fy.split("-").map(Number)
  return [
    `${startYear - 1}-${startYear}`,
    `${startYear}-${startYear + 1}`,
    `${startYear + 1}-${startYear + 2}`,
  ]
}

function AllocationSection({
  ministryId,
  userId,
  isTreasurer,
  isAdmin,
  categories,
  onAddCategory,
  onDeleteCategory,
}: {
  ministryId: string
  userId: string
  isTreasurer: boolean
  isAdmin: boolean
  categories: DynamicCategory[]
  onAddCategory: (name: string) => Promise<void>
  onDeleteCategory: (name: string) => Promise<void>
}) {
  const canEdit = isTreasurer || isAdmin
  const [fiscalYear, setFiscalYear] = useState<string>(currentFiscalYear)
  const [allocations, setAllocations] = useState<BudgetAllocation[]>([])
  const [actuals, setActuals] = useState<CategoryActual[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [savingCell, setSavingCell] = useState<string | null>(null)

  // Draft edits: key = `${category}::${fund}`, value = string input
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  // Add custom category
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [savingCategory, setSavingCategory] = useState(false)
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null)
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null)

  const yearOptions = generateYearOptions()
  const isPastYear = fiscalYear !== currentFiscalYear()

  // Include any orphaned categories that have allocations but aren't in the dynamic list
  const allocatedCategories = Array.from(new Set(allocations.map(a => a.category)))
  const orphanedCategories: DynamicCategory[] = allocatedCategories
    .filter(c => !categories.some(d => d.value === c))
    .map(c => ({ value: c, label: c, isPermanent: false }))
  const allCategories = [...categories, ...orphanedCategories]

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: allocs }, { data: acts }] = await Promise.all([
        getBudgetAllocations(ministryId, fiscalYear),
        getCategoryActuals(ministryId, fiscalYear),
      ])
      setAllocations(allocs)
      setActuals(acts)
      setLoading(false)
    }
    load()
  }, [ministryId, fiscalYear])

  // Build lookup: category → fund → amount
  function getAllocAmount(category: string, fund: string): number {
    return allocations.find(a => a.category === category && a.fund === fund)?.allocated_amount ?? 0
  }

  function getAllocNotes(category: string): string {
    return allocations.find(a => a.category === category)?.notes ?? ""
  }

  function getActual(category: string): number {
    return actuals.find(a => a.category === category)?.total_spent ?? 0
  }

  function getDraftKey(category: string, fund: string) {
    return `${category}::${fund}`
  }

  function getDraftValue(category: string, fund: string): string {
    const key = getDraftKey(category, fund)
    if (key in drafts) return drafts[key]
    const amt = getAllocAmount(category, fund)
    return amt > 0 ? String(amt) : ""
  }

  async function handleCellBlur(category: string, fund: string) {
    const key = getDraftKey(category, fund)
    if (!(key in drafts)) return
    const raw = drafts[key].trim()
    const amount = raw === "" ? 0 : parseFloat(raw)
    if (isNaN(amount) || amount < 0) {
      // Revert
      setDrafts(prev => { const n = { ...prev }; delete n[key]; return n })
      return
    }
    setSavingCell(key)
    const { error } = await upsertBudgetAllocation({ ministryId, fiscalYear, category, fund, amount })
    if (!error) {
      setAllocations(prev => {
        const existing = prev.find(a => a.category === category && a.fund === fund)
        if (existing) return prev.map(a => a.category === category && a.fund === fund ? { ...a, allocated_amount: amount } : a)
        return [...prev, { id: "", ministry_id: ministryId, fiscal_year: fiscalYear, category, fund, allocated_amount: amount, notes: null }]
      })
    }
    setDrafts(prev => { const n = { ...prev }; delete n[key]; return n })
    setSavingCell(null)
  }

  async function handleNotesBlur(category: string, notes: string) {
    // Save notes to the first fund row for this category (or church by default)
    const fund = allocations.find(a => a.category === category)?.fund ?? "church"
    await upsertBudgetAllocation({ ministryId, fiscalYear, category, fund, amount: getAllocAmount(category, fund), notes })
    setAllocations(prev => prev.map(a => a.category === category ? { ...a, notes } : a))
  }

  // Totals
  const totalAllocated = allCategories.reduce((sum, cat) => {
    return sum + FUNDS.reduce((s, f) => s + getAllocAmount(cat.value, f.value), 0)
  }, 0)
  const totalSpent = allCategories.reduce((sum, cat) => sum + getActual(cat.value), 0)
  const totalRemaining = totalAllocated - totalSpent
  const pct = totalAllocated > 0 ? Math.min(100, (totalSpent / totalAllocated) * 100) : 0
  const overBudget = totalRemaining < 0

  const monoLabel: React.CSSProperties = {
    fontFamily: "ui-monospace,'SF Mono',Menlo,monospace",
    fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#A09A8C",
  }
  const cellInput: React.CSSProperties = {
    background: "transparent", border: "none", outline: "none",
    fontSize: 14, fontFamily: "var(--font-inter)", color: "#13101A",
    width: "100%", padding: 0,
    borderBottom: "1px solid #3E1540",
  }

  return (
    <div>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#8A8497", marginBottom: 6 }}>
            Annual Budget · {fiscalYear}
          </p>
          <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 36, fontWeight: 400, color: "#13101A", margin: 0, letterSpacing: -0.4 }}>
            Annual Allocation
          </h2>
          <p style={{ fontSize: 14, color: "#5A5466", marginTop: 8, lineHeight: 1.6 }}>
            Set per-fund targets for each spending category and track progress toward them.
          </p>
        </div>
        {/* Year selector */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {yearOptions.map(y => (
              <button
                key={y}
                onClick={() => setFiscalYear(y)}
                style={{
                  padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer",
                  background: fiscalYear === y ? "#3E1540" : "#F1ECDE",
                  color: fiscalYear === y ? "#FBF8F2" : "#5A5466",
                  border: fiscalYear === y ? "none" : "1px solid #E2DDCF",
                }}
              >
                {y}
              </button>
            ))}
          </div>
          {isPastYear && (
            <span style={{ fontSize: 11, color: "#8A8497", fontStyle: "italic" }}>Past year — read only</span>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#8A8497", fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* Summary stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }} className="max-md:!grid-cols-1">
            {[
              { label: "Total Budgeted", value: totalAllocated, sub: "across all funds" },
              { label: "Total Spent", value: totalSpent, sub: "this fiscal year" },
              { label: "Remaining", value: totalRemaining, sub: overBudget ? "over budget" : "available", danger: overBudget },
            ].map(card => (
              <div
                key={card.label}
                style={{
                  padding: 22, borderRadius: 14,
                  background: card.danger ? "#FDF1F1" : "#FBF8F2",
                  border: `1px solid ${card.danger ? "#E8C5C5" : "#E8E2D2"}`,
                }}
              >
                <p style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#8A8497", margin: 0 }}>
                  {card.label}
                </p>
                <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, letterSpacing: -0.6, color: card.danger ? "#9F3030" : "#13101A", margin: "10px 0 0" }}>
                  ${Math.abs(card.value).toFixed(2)}
                </p>
                <p style={{ fontSize: 13, color: card.danger ? "#9F3030" : "#8A8497", marginTop: 4 }}>
                  {card.danger && card.value < 0 ? `$${Math.abs(card.value).toFixed(2)} over · ` : ""}{card.sub}
                </p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {totalAllocated > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ height: 4, borderRadius: 99, background: "#E8E2D2", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: overBudget ? "#9F3030" : "#3E1540", transition: "width 0.3s" }} />
              </div>
              <p style={{ fontSize: 12, color: "#8A8497", marginTop: 6 }}>
                {pct.toFixed(0)}% of budget used{overBudget ? " — over budget" : ""}
              </p>
            </div>
          )}

          {/* Past year banner */}
          {isPastYear && (
            <div style={{ padding: "10px 16px", background: "#F4F1E8", border: "1px solid #E2DDCF", borderRadius: 10, marginBottom: 20, fontSize: 13, color: "#5A5466" }}>
              Viewing {fiscalYear} — read only. Switch to {currentFiscalYear()} to edit.
            </div>
          )}

          {/* Allocation table */}
          <div style={{ border: "1px solid #E8E2D2", borderRadius: 14, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 80px 90px 80px 90px 28px", gap: 0, padding: "10px 16px", borderBottom: "1px solid #E8E2D2", background: "#F8F4EA" }}>
              {["Category", "Church", "CMU", "Pitt", "Total", "Spent", "Remaining", ""].map((h, i) => (
                <span key={i} style={{ ...monoLabel, display: "block" }}>{h}</span>
              ))}
            </div>

            {/* Category rows */}
            {allCategories.map((cat, catIdx) => {
              const catTotal = FUNDS.reduce((s, f) => s + getAllocAmount(cat.value, f.value), 0)
              const spent = getActual(cat.value)
              const remaining = catTotal - spent
              const rowOver = remaining < 0 && catTotal > 0
              const notesExpanded = expandedNotes.has(cat.value)
              const notes = getAllocNotes(cat.value)

              return (
                <div key={cat.value}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 100px 80px 80px 90px 80px 90px 28px",
                      gap: 0,
                      padding: "13px 16px",
                      borderTop: catIdx > 0 ? "1px solid #F0EBE0" : "none",
                      borderLeft: rowOver ? "3px solid #9F3030" : "3px solid transparent",
                      alignItems: "center",
                      background: rowOver ? "#FDF9F9" : "transparent",
                    }}
                  >
                    {/* Category label + delete for custom */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, color: "#13101A" }}>{cat.label}</span>
                      {!cat.isPermanent && canEdit && !isPastYear && (
                        confirmDeleteCategory === cat.value ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <button
                              onClick={async () => {
                                setDeletingCategory(cat.value)
                                setConfirmDeleteCategory(null)
                                await onDeleteCategory(cat.value)
                                // Also purge from local allocations state so orphanedCategories
                                // doesn't immediately re-add it before the next full fetch
                                setAllocations(prev => prev.filter(a => a.category !== cat.value))
                                setDeletingCategory(null)
                              }}
                              disabled={deletingCategory === cat.value}
                              style={{ fontSize: 11, fontWeight: 600, color: "#9F3030", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "2px 8px", cursor: "pointer", whiteSpace: "nowrap", opacity: deletingCategory === cat.value ? 0.5 : 1 }}
                            >
                              {deletingCategory === cat.value ? "Deleting…" : "Delete"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteCategory(null)}
                              style={{ fontSize: 11, color: "#8A8497", background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteCategory(cat.value)}
                            title="Remove custom category"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#C4B8C0", padding: 0, display: "flex", alignItems: "center" }}
                          >
                            <X size={13} />
                          </button>
                        )
                      )}
                    </div>

                    {/* Fund cells */}
                    {FUNDS.map(fund => {
                      const cellKey = getDraftKey(cat.value, fund.value)
                      const isSaving = savingCell === cellKey
                      const draftVal = getDraftValue(cat.value, fund.value)
                      const displayAmt = getAllocAmount(cat.value, fund.value)

                      return (
                        <div
                          key={fund.value}
                          style={{ padding: "2px 8px 2px 0" }}
                          title={isPastYear ? undefined : `Click to edit ${fund.label} allocation for ${cat.label}`}
                        >
                          {canEdit && !isPastYear ? (
                            <div style={{ position: "relative" }}>
                              <span style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#A09A8C", pointerEvents: "none", lineHeight: 1 }}>
                                {draftVal !== "" || (cellKey in drafts) ? "$" : ""}
                              </span>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={cellKey in drafts ? draftVal : (displayAmt > 0 ? String(displayAmt) : "")}
                                onChange={e => setDrafts(prev => ({ ...prev, [cellKey]: e.target.value }))}
                                onFocus={e => {
                                  if (!(cellKey in drafts)) setDrafts(prev => ({ ...prev, [cellKey]: displayAmt > 0 ? String(displayAmt) : "" }))
                                  e.target.select()
                                }}
                                onBlur={() => handleCellBlur(cat.value, fund.value)}
                                placeholder="—"
                                disabled={isSaving}
                                style={{
                                  ...cellInput,
                                  paddingLeft: draftVal || displayAmt > 0 ? 14 : 0,
                                  opacity: isSaving ? 0.5 : 1,
                                }}
                              />
                            </div>
                          ) : (
                            <span style={{ fontSize: 14, color: displayAmt > 0 ? "#13101A" : "#A09A8C" }}>
                              {displayAmt > 0 ? `$${displayAmt.toFixed(2)}` : "—"}
                            </span>
                          )}
                        </div>
                      )
                    })}

                    {/* Total */}
                    <span style={{ fontSize: 14, color: "#13101A", fontWeight: catTotal > 0 ? 500 : 400 }}>
                      {catTotal > 0 ? `$${catTotal.toFixed(2)}` : "—"}
                    </span>

                    {/* Spent */}
                    <span style={{ fontSize: 14, color: spent > 0 ? "#13101A" : "#A09A8C" }}>
                      {spent > 0 ? `$${spent.toFixed(2)}` : "—"}
                    </span>

                    {/* Remaining */}
                    <span style={{ fontSize: 14, color: rowOver ? "#9F3030" : remaining > 0 ? "#2D5445" : "#A09A8C", fontWeight: rowOver ? 500 : 400 }}>
                      {catTotal > 0 ? (remaining < 0 ? `-$${Math.abs(remaining).toFixed(2)}` : `$${remaining.toFixed(2)}`) : "—"}
                    </span>

                    {/* Notes toggle */}
                    <button
                      onClick={() => setExpandedNotes(prev => {
                        const n = new Set(prev)
                        n.has(cat.value) ? n.delete(cat.value) : n.add(cat.value)
                        return n
                      })}
                      style={{ background: "none", border: "none", cursor: "pointer", color: notes ? "#3E1540" : "#C4C0B0", fontSize: 13, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                      title="Notes"
                    >
                      {notesExpanded ? "▴" : "▾"}
                    </button>
                  </div>

                  {/* Notes row */}
                  {notesExpanded && (
                    <div style={{ padding: "8px 16px 12px 19px", borderTop: "1px dashed #E8E2D2", background: "#FDFAF5" }}>
                      {canEdit && !isPastYear ? (
                        <textarea
                          defaultValue={notes}
                          placeholder="Add context for this category (e.g. 'Church provides full retreat budget, CMU covers supplies')"
                          onBlur={e => handleNotesBlur(cat.value, e.target.value)}
                          rows={2}
                          style={{ width: "100%", background: "transparent", border: "none", outline: "none", resize: "vertical", fontSize: 13, fontFamily: "var(--font-inter)", fontStyle: notes ? "normal" : "italic", color: "#5A5466", lineHeight: 1.5, boxSizing: "border-box" }}
                        />
                      ) : (
                        <p style={{ fontSize: 13, color: notes ? "#5A5466" : "#A09A8C", fontStyle: !notes ? "italic" : "normal", margin: 0 }}>
                          {notes || "No notes for this category."}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Footer totals row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 80px 90px 80px 90px 28px", gap: 0, padding: "12px 16px", borderTop: "1px solid #E8E2D2", background: "#F8F4EA" }}>
              <span style={{ ...monoLabel, fontSize: "11px", color: "#5A5466" }}>Total</span>
              {FUNDS.map(fund => {
                const fundTotal = allCategories.reduce((s, cat) => s + getAllocAmount(cat.value, fund.value), 0)
                return (
                  <span key={fund.value} style={{ fontSize: 13, fontWeight: 500, color: "#13101A" }}>
                    {fundTotal > 0 ? `$${fundTotal.toFixed(2)}` : "—"}
                  </span>
                )
              })}
              <span style={{ fontSize: 13, fontWeight: 600, color: "#13101A" }}>
                {totalAllocated > 0 ? `$${totalAllocated.toFixed(2)}` : "—"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: totalSpent > 0 ? "#13101A" : "#A09A8C" }}>
                {totalSpent > 0 ? `$${totalSpent.toFixed(2)}` : "—"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: overBudget ? "#9F3030" : totalRemaining > 0 ? "#2D5445" : "#A09A8C" }}>
                {totalAllocated > 0 ? (totalRemaining < 0 ? `-$${Math.abs(totalRemaining).toFixed(2)}` : `$${totalRemaining.toFixed(2)}`) : "—"}
              </span>
              <span />
            </div>
          </div>

          {/* Add custom category */}
          {canEdit && !isPastYear && (
            <div style={{ marginTop: 12 }}>
              {addingCategory ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Category name…"
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === "Enter" && newCategoryName.trim()) {
                        setSavingCategory(true)
                        await onAddCategory(newCategoryName)
                        setNewCategoryName("")
                        setAddingCategory(false)
                        setSavingCategory(false)
                      } else if (e.key === "Escape") {
                        setNewCategoryName(""); setAddingCategory(false)
                      }
                    }}
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid #ECE8DE", borderRadius: 10, fontSize: 13, color: "#13101A", background: "#FDFBF7", outline: "none" }}
                  />
                  <button
                    onClick={async () => {
                      if (!newCategoryName.trim()) return
                      setSavingCategory(true)
                      await onAddCategory(newCategoryName)
                      setNewCategoryName("")
                      setAddingCategory(false)
                      setSavingCategory(false)
                    }}
                    disabled={savingCategory || !newCategoryName.trim()}
                    style={{ padding: "8px 14px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: savingCategory || !newCategoryName.trim() ? 0.5 : 1 }}
                  >
                    {savingCategory ? "Adding…" : "Add"}
                  </button>
                  <button
                    onClick={() => { setNewCategoryName(""); setAddingCategory(false) }}
                    style={{ padding: "8px 12px", background: "#F2EDE0", color: "#5A5466", borderRadius: 10, border: "none", fontSize: 13, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingCategory(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "transparent", border: "1px dashed #C4BFB0", borderRadius: 10, color: "#8A8497", fontSize: 13, cursor: "pointer", fontFamily: "var(--font-inter)" }}
                >
                  <Plus size={13} />
                  Add custom category
                </button>
              )}
            </div>
          )}

          {/* Empty state hint */}
          {totalAllocated === 0 && !isPastYear && (
            <p style={{ textAlign: "center", fontSize: 13, color: "#8A8497", marginTop: 20, fontStyle: "italic" }}>
              No budget set for {fiscalYear} yet. Click any Church, CMU, or Pitt cell to start allocating.
            </p>
          )}
        </>
      )}
    </div>
  )
}
