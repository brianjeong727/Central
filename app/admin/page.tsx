"use client"

import { useEffect, useState } from "react"
import { Check, X, Clock, Users, MapPin, Building2, LogOut } from "lucide-react"
import { getPendingMinistries, approveMinistry, rejectMinistry } from "@/app/actions/ministry"
import { createClient } from "@/lib/supabase"
import { PlanLineIcon } from "@/app/home/components/shared"
import { teamIconKey } from "@/app/home/workspace-presets"

type Ministry = {
  id: string
  name: string
  university: string
  location: string | null
  size: string
  invite_code: string
  created_at: string
  creatorName: string | null
  creatorEmail: string | null
  teams: Array<{ name: string; icon: string | null }>
}

const SIZE_LABELS: Record<string, string> = {
  small: "Under 50",
  medium: "50–100",
  large: "100+",
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function AdminPage() {
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  useEffect(() => {
    getPendingMinistries().then(({ data, error: err }) => {
      if (err) setError(err)
      else setMinistries(data ?? [])
      setLoading(false)
    })
  }, [])

  async function handleApprove(id: string) {
    setActing(id)
    const { error: err } = await approveMinistry(id)
    if (err) { alert(err); setActing(null); return }
    setMinistries((prev) => prev.filter((m) => m.id !== id))
    setActing(null)
  }

  async function handleReject(id: string) {
    if (!confirm("Reject this application? This cannot be undone.")) return
    setActing(id)
    const { error: err } = await rejectMinistry(id)
    if (err) { alert(err); setActing(null); return }
    setMinistries((prev) => prev.filter((m) => m.id !== id))
    setActing(null)
  }

  return (
    <div className="min-h-screen bg-[var(--cream-panel)]">

      {/* Header */}
      <div className="border-b border-[var(--line-2)] bg-[var(--cream)] px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
            <path d="M70 28 A32 32 0 1 0 70 72" stroke="var(--plum)" strokeWidth="8" strokeLinecap="round" />
            <circle cx="50" cy="50" r="6" fill="var(--plum)" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1 }}>
            Central
          </span>
        </div>
        <div className="h-5 w-px bg-[var(--line-2)]" />
        <span className="text-[13px] font-semibold text-[var(--muted-text)] uppercase tracking-wider">Admin</span>
        <div className="flex-1" />
        {!loading && (
          <span className="text-[13px] text-[var(--muted-text)]">
            {ministries.length} pending {ministries.length === 1 ? "application" : "applications"}
          </span>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--line-2)] text-[13px] text-[var(--muted-text)] hover:text-[var(--danger)] hover:border-red-200 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>

      <div className="max-w-[720px] mx-auto px-6 py-8">
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "var(--ink)", fontWeight: 400, marginBottom: 4 }}>
          Pending Applications
        </h1>
        <p className="text-[14px] text-[var(--muted-text)] mb-8">
          Review and approve new ministry workspace requests.
        </p>

        {loading && (
          <div className="flex items-center justify-center py-16 text-[14px] text-[var(--muted-text)]">
            Loading…
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-[var(--plum)]/8 px-5 py-4 text-[14px] text-[var(--plum)] font-medium">
            {error}
          </div>
        )}

        {!loading && !error && ministries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-[#EFEAE0] flex items-center justify-center mb-4">
              <Check className="w-5 h-5 text-[var(--muted-text)]" />
            </div>
            <p className="text-[15px] font-semibold text-[var(--ink)] mb-1">All caught up</p>
            <p className="text-[13px] text-[var(--muted-text)]">No pending applications right now.</p>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {ministries.map((m) => (
            <div key={m.id} className="bg-[var(--cream)] rounded-2xl border border-[var(--line-2)] p-6">

              {/* Ministry name + date */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "20px", color: "var(--ink)", fontWeight: 400, lineHeight: 1.2 }}>
                    {m.name}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 text-[12px] text-[var(--muted-text)] flex-shrink-0 pt-0.5">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDate(m.created_at)}
                </div>
              </div>

              {/* Details */}
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="flex items-center gap-1.5 text-[13px] text-[var(--body)]">
                  <Building2 className="w-3.5 h-3.5 text-[var(--muted-text)]" />
                  {m.university}
                </div>
                {m.location && (
                  <div className="flex items-center gap-1.5 text-[13px] text-[var(--body)]">
                    <MapPin className="w-3.5 h-3.5 text-[var(--muted-text)]" />
                    {m.location}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[13px] text-[var(--body)]">
                  <Users className="w-3.5 h-3.5 text-[var(--muted-text)]" />
                  {SIZE_LABELS[m.size] ?? m.size} members
                </div>
              </div>

              {/* Teams */}
              {m.teams.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold text-[var(--muted-text)] uppercase tracking-wider mb-2">Teams</p>
                  <div className="flex flex-wrap gap-2">
                    {m.teams.map((t, i) => (
                      <span key={i} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--body-bg)] border border-[var(--line-2)] text-[12px] text-[var(--ink)]">
                        <PlanLineIcon iconKey={teamIconKey({ name: t.name })} bg="transparent" fg="var(--plum)" size={14} radius={0} />
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Creator */}
              <div className="pt-4 border-t border-[var(--body-bg)] flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--muted-text)] uppercase tracking-wider mb-1">Applied by</p>
                  <p className="text-[13px] text-[var(--ink)] font-medium">{m.creatorName ?? "—"}</p>
                  <p className="text-[12px] text-[var(--muted-text)]">{m.creatorEmail ?? "—"}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleReject(m.id)}
                    disabled={acting === m.id}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--line-2)] text-[13px] font-semibold text-[var(--danger)] hover:bg-red-50 hover:border-red-200 disabled:opacity-50 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(m.id)}
                    disabled={acting === m.id}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--plum)] hover:bg-[var(--plum-2)] text-[13px] font-semibold text-[var(--cream-on-dark)] disabled:opacity-50 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
