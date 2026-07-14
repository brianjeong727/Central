"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import { Pencil, Check, Copy, ExternalLink, Wallet } from "lucide-react"
import { TabPageHeader, PageTitle, FormField, Input, CentralButton } from "@/components/central"
import { Spinner, EYEBROW_STYLE, EmptyState } from "./shared"
import { isAdminRole } from "@/lib/roles"

// Member-facing "Give" surface. This is the donation/Zelle info that used to live as
// the `give` section of the Finance (giving) tab. It now stands on its own as a
// member surface (rendered for the `give` tab).
// "Give" = member donation; "Finance" = back-office (reimbursements / budget / allocation).

// Opens the Zelle app on mobile (with a graceful web fallback), or zellepay.com on desktop.
function openZelle(onFallback: () => void) {
  if (window.innerWidth < 768) {
    window.location.href = "zelle://"
    const t = setTimeout(onFallback, 500)
    const onHide = () => { clearTimeout(t); document.removeEventListener("visibilitychange", onHide) }
    document.addEventListener("visibilitychange", onHide)
  } else {
    window.open("https://zellepay.com", "_blank", "noopener,noreferrer")
  }
}

function GivingTrustPanel({ zelleName, zelleInfo, onCopy, copied }: { zelleName: string | null; zelleInfo: string; onCopy: () => void; copied: boolean }) {
  return (
    <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 20px" }}>
      <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 12 }}>Giving destination</p>
      <div style={{ padding: "12px 14px", border: "1px solid var(--line)", background: "var(--cream)", borderRadius: 12, marginBottom: 12 }}>
        {zelleName && <p style={{ fontSize: 14, color: "var(--ink)", fontWeight: 500, lineHeight: 1.3, marginBottom: 4 }}>{zelleName}</p>}
        <p style={{ fontSize: 13.5, color: zelleName ? "var(--body)" : "var(--ink)", fontWeight: 400, lineHeight: 1.2 }}>{zelleInfo}</p>
        <p style={{ fontSize: 12, color: "var(--muted-text)", marginTop: 4 }}>{zelleName ? "Zelle recipient · confirm this name before sending" : "Zelle email or phone"}</p>
      </div>
      <button onClick={onCopy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", height: 38, borderRadius: 10, border: "1px solid var(--line)", background: "var(--cream)", color: copied ? "var(--plum)" : "var(--body)", fontSize: 13, fontWeight: 500, cursor: "pointer", marginBottom: 14 }}>
        {copied ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
        {copied ? "Copied" : "Copy Zelle info"}
      </button>
      <p style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.55 }}>
        Central only stores your ministry&apos;s Zelle destination. Gifts, receipts, statements, and tax records stay with your ministry.
      </p>
    </div>
  )
}

// ── Shared data hook ─────────────────────────────────────────────────────────
function useZelleInfo(ministryId: string) {
  const supabase = createClient()
  const [zelleInfo, setZelleInfo] = useState<string | null>(null)
  const [zelleName, setZelleName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.from("ministry_giving").select("zelle_info, zelle_name").eq("ministry_id", ministryId).maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setZelleInfo(data?.zelle_info ?? null)
        setZelleName(data?.zelle_name ?? null)
        setLoading(false)
      })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  return { zelleInfo, setZelleInfo, zelleName, setZelleName, loading }
}

// ── Full member Give surface (rendered for the `give` tab) ────────────────────
export function GiveView({
  ministryId, userId, userRole,
}: {
  ministryId: string
  userId: string
  userRole: string
}) {
  const supabase = createClient()
  const isAdmin = isAdminRole(userRole)
  const { zelleInfo, setZelleInfo, zelleName, setZelleName, loading } = useZelleInfo(ministryId)

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [editName, setEditName] = useState("")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [zelleFallback, setZelleFallback] = useState(false)
  const [amount, setAmount] = useState("50")

  async function handleSave() {
    if (!isAdmin) return
    const val = editValue.trim(); if (!val) return
    const nm = editName.trim()
    setSaving(true)
    const { error } = await supabase.from("ministry_giving").upsert(
      { ministry_id: ministryId, zelle_info: val, zelle_name: nm || null, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "ministry_id" }
    )
    if (!error) { setZelleInfo(val); setZelleName(nm || null); setEditing(false) }
    setSaving(false)
  }

  function handleCopy() {
    if (!zelleInfo) return
    navigator.clipboard.writeText(zelleInfo).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  function handleOpenZelle() {
    setZelleFallback(false)
    openZelle(() => setZelleFallback(true))
  }

  const displayAmount = amount || "0"

  return (
    <div className="pb-28 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile header */}
      <div className="md:hidden px-5 pt-6 pb-5">
        <p style={EYEBROW_STYLE}>Give · 2 Corinthians 9:7</p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, color: "var(--ink)", lineHeight: 1.05, margin: "14px 0 0", fontWeight: 400 }}>Give</h1>
        <p style={{ fontSize: 14, color: "var(--body)", marginTop: 8 }}>Give directly to your ministry through Zelle.</p>
      </div>

      {/* Desktop header — landing tier (R1) */}
      <TabPageHeader>
        <PageTitle eyebrow="Offering" title="Give" />
      </TabPageHeader>

      <div className="px-5 md:px-14 pt-6 md:pt-5 md:flex-1 md:overflow-y-auto">
        {loading ? <Spinner /> : editing || (!zelleInfo && isAdmin) ? (
          /* Admin setup / edit — a deliberate composition: eyebrow → serif heading →
             one calm sentence → fields → actions. Single readable column anchored to
             the content's left edge (no floating card). */
          <div style={{ maxWidth: 480 }}>
            <p style={EYEBROW_STYLE}>Offering</p>
            <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 400, color: "var(--ink)", lineHeight: 1.15, margin: "var(--space-4) 0 0" }}>
              {zelleInfo ? "Edit offering details" : "Set up offering"}
            </h2>
            <p style={{ fontSize: 14, color: "var(--body)", lineHeight: 1.55, margin: "var(--space-3) 0 0" }}>
              Members will see these details on the Give page when they send an offering through Zelle.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-7)", marginTop: "var(--space-8)" }}>
              <FormField label="Recipient name">
                <Input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="The Korean Central Church of Pittsburgh" autoFocus={editing} />
              </FormField>
              <FormField label="Zelle email or phone">
                <Input type="text" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="giving@yourministry.org" />
              </FormField>
            </div>
            <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-8)" }}>
              <CentralButton onClick={handleSave} disabled={!editValue.trim() || saving}>{saving ? "Saving…" : "Save"}</CentralButton>
              {zelleInfo && <CentralButton variant="secondary" onClick={() => setEditing(false)}>Cancel</CentralButton>}
            </div>
          </div>
        ) : !zelleInfo ? (
          /* Member-facing empty state (§4.19) — quiet whole-tab empty, no CTA. */
          <div style={{ maxWidth: 480 }}>
            <EmptyState icon={<Wallet className="w-7 h-7" />} title="No giving details yet" subtitle="Offering details haven't been added yet." />
          </div>
        ) : (
          <div className="md:grid md:gap-5" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
            <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, padding: "28px 28px 24px", marginBottom: 16 }} className="md:mb-0">
              <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted-text)", marginBottom: 12 }}>Your gift</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 30 }}>
                <span style={{ fontFamily: "var(--serif)", fontSize: 40, color: "var(--body)", lineHeight: 1 }}>$</span>
                <input type="text" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))} style={{ background: "transparent", border: "none", outline: "none", fontFamily: "var(--serif)", fontSize: 64, color: "var(--ink)", width: "100%", padding: 0, lineHeight: 1 }} />
              </div>
              <CentralButton variant="primary" onClick={handleOpenZelle} style={{ width: "100%", height: 48, borderRadius: 12, fontSize: 15, marginBottom: 10 }}>
                <ExternalLink style={{ width: 16, height: 16 }} />Open Zelle · ${displayAmount}
              </CentralButton>
              {zelleFallback && <p style={{ fontSize: 13, color: "var(--body)", textAlign: "center", lineHeight: 1.5, marginBottom: 10 }}>Open Zelle on your phone and send to <strong style={{ color: "var(--ink)" }}>{zelleName ? `${zelleName} (${zelleInfo})` : zelleInfo}</strong></p>}
              <button onClick={handleCopy} style={{ width: "100%", height: 38, background: "var(--cream)", color: copied ? "var(--plum)" : "var(--body)", borderRadius: 10, fontSize: 13, border: "1px solid var(--line)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                {copied ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
                {copied ? "Copied!" : `Copy info · ${zelleInfo}`}
              </button>
              {isAdmin && <button onClick={() => { setEditValue(zelleInfo ?? ""); setEditName(zelleName ?? ""); setEditing(true) }} style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "var(--muted-text)", fontSize: 12, cursor: "pointer", padding: 0 }}><Pencil style={{ width: 11, height: 11 }} /> Edit Zelle info</button>}
            </div>
            <div className="flex flex-col gap-4 mt-4 md:mt-0">
              <GivingTrustPanel zelleName={zelleName} zelleInfo={zelleInfo} onCopy={handleCopy} copied={copied} />
              {/* In-app card / Apple Pay giving — coming soon (Zelle above stays the live path). */}
              <div style={{ background: "var(--cream)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-text)" }}>Card &amp; Apple Pay</p>
                  <span style={{ fontSize: 10, letterSpacing: "0.08em", padding: "2px 8px", borderRadius: 999, background: "var(--ivory)", border: "1px solid var(--line-2)", textTransform: "uppercase", fontWeight: 500, color: "var(--muted-text)" }}>Coming soon</span>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--body)", lineHeight: 1.55 }}>Giving in-app with a card or Apple Pay is coming soon. For now, give through Zelle above.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
