"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import { Pencil, Check, Copy, ExternalLink } from "lucide-react"
import { DesktopTopbar } from "../components/desktop-nav"
import { Spinner } from "../components/shared"

interface Props {
  ministryId: string
  userId: string
  isAdmin: boolean
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
      <button
        onClick={onCopy}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", height: 38, borderRadius: 10, border: "1px solid #E5E0D2", background: "white", color: copied ? "#3E1540" : "#5A5466", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 14 }}
      >
        {copied ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
        {copied ? "Copied" : "Copy Zelle info"}
      </button>
      <p style={{ fontSize: 12.5, color: "#5A5466", lineHeight: 1.55 }}>
        Central only stores your ministry&apos;s Zelle destination. Gifts, receipts, statements, and tax records stay with your ministry.
      </p>
    </div>
  )
}

export function GivingTab({ ministryId, userId, isAdmin }: Props) {
  const supabase = createClient()
  const [zelleInfo, setZelleInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [zelleFallback, setZelleFallback] = useState(false)
  const [amount, setAmount] = useState("50")

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId])

  async function handleSave() {
    if (!isAdmin) return
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

  const displayAmount = amount || "0"

  return (
    <div className="pb-28 md:pb-0 md:h-full md:overflow-y-auto">
      <DesktopTopbar crumbs={["Central", "Give"]} />

      <div className="px-5 pt-14 md:pt-0 md:px-10 md:py-8 max-w-[740px] md:max-w-none">

        {/* Scripture hero */}
        <div className="mb-7 mt-6 md:mt-0 md:mb-8 md:max-w-[680px]">
          <p className="text-[11px] tracking-[0.14em] uppercase text-[#8A8497] mb-2.5">2 Corinthians 9:7</p>
          <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1, color: "#13101A", fontWeight: 400 }}>
            Give cheerfully.
          </h1>
          <p className="mt-3 text-[14px] text-[#5A5466] leading-relaxed md:max-w-[520px]">
            Give directly through your ministry&apos;s Zelle information.{" "}
            <span className="text-[#8A8497]">Central does not process payments or track gifts.</span>
          </p>
        </div>

        {loading ? (
          <Spinner />
        ) : (
          <>
            <div className="md:grid md:gap-5" style={{ gridTemplateColumns: "1.3fr 1fr" }}>

              {/* ── Left: plum card ── */}
              <div
                style={{
                  background: "radial-gradient(circle at 90% 20%, rgba(246,244,239,0.12) 0%, transparent 40%), radial-gradient(circle at 8% 90%, rgba(246,244,239,0.08) 0%, transparent 35%), #3E1540",
                  borderRadius: 20,
                  padding: "28px 28px 24px",
                  position: "relative",
                  overflow: "hidden",
                  marginBottom: 16,
                }}
                className="md:mb-0"
              >
                {/* dot grid overlay */}
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: "radial-gradient(circle, rgba(246,244,239,0.18) 1px, transparent 1.4px)",
                  backgroundSize: "18px 18px",
                  opacity: 0.35,
                  pointerEvents: "none",
                }} />

                <div style={{ position: "relative", zIndex: 1 }}>
                  {editing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <label style={{ fontSize: 12, color: "rgba(246,244,239,0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Zelle email or phone
                      </label>
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder="giving@yourministry.org"
                        autoFocus
                        style={{
                          background: "rgba(246,244,239,0.08)", border: "1px solid rgba(246,244,239,0.2)",
                          borderRadius: 12, padding: "12px 14px", fontSize: 14, color: "#F6F4EF",
                          outline: "none", width: "100%", boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={handleSave}
                          disabled={!editValue.trim() || saving}
                          style={{
                            flex: 1, height: 42, background: "#F6F4EF", color: "#3E1540",
                            borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none",
                            cursor: "pointer", opacity: !editValue.trim() || saving ? 0.5 : 1,
                          }}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditing(false)}
                          style={{ height: 42, padding: "0 16px", background: "transparent", color: "rgba(246,244,239,0.6)", borderRadius: 10, fontSize: 13, border: "1px solid rgba(246,244,239,0.2)", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
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
                      <p style={{ fontSize: 13, color: "rgba(246,244,239,0.6)", marginBottom: 20, lineHeight: 1.5 }}>
                        Add your Zelle email or phone number so members can give.
                      </p>
                      <button
                        onClick={() => { setEditValue(""); setEditing(true) }}
                        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#F6F4EF", color: "#3E1540", borderRadius: 10, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}
                      >
                        <Pencil style={{ width: 13, height: 13 }} /> Add Zelle info
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Amount input */}
                      <p style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(246,244,239,0.6)", marginBottom: 12 }}>Your gift</p>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}>
                        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 40, color: "rgba(246,244,239,0.55)", lineHeight: 1 }}>$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={amount}
                          onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                          style={{
                            background: "transparent", border: "none", outline: "none",
                            fontFamily: "var(--font-instrument-serif)", fontSize: 64, color: "#F6F4EF",
                            width: "100%", padding: 0, lineHeight: 1,
                          }}
                        />
                      </div>

                      {/* Preset pills */}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
                        {PRESET_AMOUNTS.map(v => (
                          <button
                            key={v}
                            onClick={() => setAmount(v)}
                            style={{
                              height: 30, padding: "0 13px", borderRadius: 999,
                              background: amount === v ? "rgba(246,244,239,0.95)" : "transparent",
                              color: amount === v ? "#3E1540" : "#F6F4EF",
                              border: "1px solid rgba(246,244,239,0.25)",
                              fontSize: 13, cursor: "pointer", fontWeight: amount === v ? 600 : 400,
                            }}
                          >${v}</button>
                        ))}
                      </div>

                      {/* Open Zelle */}
                      <button
                        onClick={handleOpenZelle}
                        style={{
                          width: "100%", height: 48, background: "#F6F4EF", color: "#3E1540",
                          borderRadius: 12, fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10,
                        }}
                      >
                        <ExternalLink style={{ width: 16, height: 16 }} />
                        Open Zelle · ${displayAmount}
                      </button>

                      {zelleFallback && (
                        <p style={{ fontSize: 13, color: "rgba(246,244,239,0.75)", textAlign: "center", lineHeight: 1.5, marginBottom: 10 }}>
                          Open Zelle on your phone and send to <strong style={{ color: "#F6F4EF" }}>{zelleInfo}</strong>
                        </p>
                      )}

                      {/* Copy */}
                      <button
                        onClick={handleCopy}
                        style={{
                          width: "100%", height: 38, background: "transparent",
                          color: copied ? "#F6F4EF" : "rgba(246,244,239,0.6)",
                          borderRadius: 10, fontSize: 13,
                          border: `1px solid ${copied ? "rgba(246,244,239,0.45)" : "rgba(246,244,239,0.15)"}`,
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                        }}
                      >
                        {copied ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
                        {copied ? "Copied!" : `Copy info · ${zelleInfo}`}
                      </button>

                      {/* Admin edit */}
                      {isAdmin && (
                        <button
                          onClick={() => { setEditValue(zelleInfo ?? ""); setEditing(true) }}
                          style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "rgba(246,244,239,0.4)", fontSize: 12, cursor: "pointer", padding: 0 }}
                        >
                          <Pencil style={{ width: 11, height: 11 }} /> Edit Zelle info
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* ── Right: trust context (desktop) ── */}
              {zelleInfo && !editing && (
                <div className="hidden md:flex flex-col gap-4">
                  <GivingTrustPanel zelleInfo={zelleInfo} onCopy={handleCopy} copied={copied} />
                </div>
              )}
            </div>

            {/* Mobile-only: trust context */}
            {zelleInfo && !editing && (
              <div className="md:hidden mt-4">
                <GivingTrustPanel zelleInfo={zelleInfo} onCopy={handleCopy} copied={copied} />
              </div>
            )}

            {/* Footer — desktop only */}
            {zelleInfo && !editing && (
              <div className="hidden md:flex items-center mt-8 pt-5" style={{ borderTop: "1px solid #ECE8DE", color: "#8A8497", fontSize: 12.5 }}>
                <span>For receipts or giving statements, contact your ministry treasurer.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
