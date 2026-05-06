"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import { Pencil, Check, X, Copy, ExternalLink } from "lucide-react"
import { DesktopTopbar } from "../components/desktop-nav"

interface Props {
  ministryId: string
  userId: string
  isAdmin: boolean
}

export function GivingTab({ ministryId, userId, isAdmin }: Props) {
  const supabase = createClient()
  const [zelleInfo, setZelleInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [zelleFallback, setZelleFallback] = useState(false)

  useEffect(() => {
    setIsMobile(
      window.innerWidth < 768 ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    )
  }, [])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("ministry_giving")
        .select("zelle_info")
        .eq("ministry_id", ministryId)
        .maybeSingle()
      setZelleInfo(data?.zelle_info ?? null)
      setLoading(false)
    }
    load()
  }, [ministryId])

  async function handleSave() {
    const val = editValue.trim()
    if (!val) return
    setSaving(true)
    const { error } = await supabase
      .from("ministry_giving")
      .upsert(
        { ministry_id: ministryId, zelle_info: val, updated_by: userId, updated_at: new Date().toISOString() },
        { onConflict: "ministry_id" }
      )
    if (!error) {
      setZelleInfo(val)
      setEditing(false)
    }
    setSaving(false)
  }

  function handleCopy() {
    if (!zelleInfo) return
    navigator.clipboard.writeText(zelleInfo).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleOpenZelle() {
    setZelleFallback(false)
    window.location.href = "zelle://"
    const t = setTimeout(() => setZelleFallback(true), 500)
    const onHide = () => { clearTimeout(t); document.removeEventListener("visibilitychange", onHide) }
    document.addEventListener("visibilitychange", onHide)
  }

  return (
    <div className="px-5 pt-14 pb-28 md:pt-0 md:pb-0 md:h-full md:overflow-y-auto">
      <DesktopTopbar crumbs={["Central", "Give"]} />

      <div className="md:max-w-[560px] md:mx-auto md:px-8 md:py-8">
        {/* Header */}
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 28, color: "#13101A", marginBottom: 4, marginTop: 8 }}>
          Give
        </p>
        <p style={{ fontSize: 14, color: "#8A8497", marginBottom: 24 }}>Support the ministry.</p>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#8A8497", fontSize: 14 }}>Loading…</div>
        ) : (
          <>
            {/* Giving card */}
            <div style={{ background: "white", border: "1px solid #ECE8DE", borderRadius: 20, boxShadow: "0 2px 8px rgba(19,16,26,0.08)", overflow: "hidden", marginBottom: 16 }}>
              {/* Card header */}
              <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #ECE8DE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F4F0F8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3E1540" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20.5C12 20.5 3 14 3 8a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12.5-9 12.5z" />
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: "#13101A", lineHeight: 1.2 }}>Zelle</p>
                    <p style={{ fontSize: 12, color: "#8A8497" }}>Instant giving</p>
                  </div>
                </div>
                {isAdmin && !editing && (
                  <button
                    onClick={() => { setEditValue(zelleInfo ?? ""); setEditing(true) }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "1px solid #ECE8DE", background: "transparent", color: "#5A5466", fontSize: 12, cursor: "pointer" }}
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                )}
              </div>

              {/* Card body */}
              <div style={{ padding: "20px" }}>
                {editing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#5A5466", marginBottom: 6 }}>
                        Zelle email or phone number
                      </label>
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder="e.g. giving@yourministry.org or (412) 555-0100"
                        autoFocus
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #ECE8DE", background: "#FBF8F2", fontSize: 14, color: "#13101A", outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={handleSave}
                        disabled={!editValue.trim() || saving}
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", opacity: !editValue.trim() || saving ? 0.6 : 1 }}
                      >
                        <Check className="w-4 h-4" />
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 16px", background: "transparent", color: "#8A8497", borderRadius: 10, fontSize: 13, border: "1px solid #ECE8DE", cursor: "pointer" }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : zelleInfo ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Recipient info */}
                    <div style={{ background: "#FBF8F2", border: "1px solid #ECE8DE", borderRadius: 12, padding: "14px 16px" }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: "#8A8497", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>Send to</p>
                      <p style={{ fontSize: 17, fontWeight: 600, color: "#13101A", wordBreak: "break-all" }}>{zelleInfo}</p>
                    </div>
                    {/* Action buttons */}
                    {isMobile ? (
                      <>
                        <button
                          onClick={handleOpenZelle}
                          style={{ width: "100%", padding: "13px 0", background: "#3E1540", color: "#F6F4EF", borderRadius: 12, fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open Zelle
                        </button>
                        {zelleFallback && (
                          <p style={{ fontSize: 13, color: "#5A5466", textAlign: "center", lineHeight: 1.5, padding: "2px 0" }}>
                            Open Zelle on your phone and send to <strong style={{ color: "#13101A" }}>{zelleInfo}</strong>
                          </p>
                        )}
                      </>
                    ) : (
                      <div style={{ background: "#FBF8F2", border: "1px solid #ECE8DE", borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                        <p style={{ fontSize: 13, color: "#5A5466", marginBottom: 2 }}>Send via Zelle on your mobile device</p>
                        <p style={{ fontSize: 15, fontWeight: 600, color: "#13101A" }}>{zelleInfo}</p>
                      </div>
                    )}
                    <button
                      onClick={handleCopy}
                      style={{ width: "100%", padding: "11px 0", background: "transparent", color: copied ? "#2D7A4F" : "#3E1540", borderRadius: 12, fontSize: 14, fontWeight: 600, border: `1.5px solid ${copied ? "#6EE7B7" : "#3E1540"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.15s" }}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copied!" : "Copy Zelle info"}
                    </button>
                  </div>
                ) : isAdmin ? (
                  <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>Set up giving</p>
                    <p style={{ fontSize: 13, color: "#8A8497", marginBottom: 16 }}>Add your Zelle email or phone number so members can give.</p>
                    <button
                      onClick={() => { setEditValue(""); setEditing(true) }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", background: "#3E1540", color: "#F6F4EF", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Add Zelle info
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 18, color: "#13101A", marginBottom: 6 }}>Giving info coming soon</p>
                    <p style={{ fontSize: 13, color: "#8A8497" }}>Check back later for ways to give.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Tax note */}
            <p style={{ fontSize: 12, color: "#8A8497", textAlign: "center", lineHeight: 1.5 }}>
              Gifts are tax deductible. Contact your ministry leader for a giving statement.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
