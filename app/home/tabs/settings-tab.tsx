"use client"

import { useState, useEffect } from "react"
import { Copy, Check, Users, Shield, Crown } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { updateMinistryPublic } from "@/app/actions/ministry"
import { DesktopTopbar } from "../components/desktop-nav"

interface MinistryStats {
  total: number
  leaders: number
  admins: number
}

export function SettingsTab({
  ministryId,
  ministryName,
  ministryIsPublic: initialIsPublic,
  onPublicChange,
}: {
  ministryId: string
  ministryName: string
  ministryIsPublic: boolean
  onPublicChange: (v: boolean) => void
}) {
  const supabase = createClient()
  const [stats, setStats] = useState<MinistryStats | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [toggling, setToggling] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase
      .from("profiles")
      .select("role")
      .eq("ministry_id", ministryId)
      .then(({ data }) => {
        if (!data) return
        setStats({
          total: data.length,
          leaders: data.filter(p => p.role.toLowerCase() === "leader").length,
          admins: data.filter(p => p.role.toLowerCase() === "admin").length,
        })
      })

    supabase
      .from("ministries")
      .select("invite_code, is_public")
      .eq("id", ministryId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setInviteCode(data.invite_code)
          setIsPublic(data.is_public ?? false)
        }
      })
  }, [ministryId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle() {
    if (toggling) return
    setToggling(true)
    const next = !isPublic
    const { error } = await updateMinistryPublic(next)
    if (!error) {
      setIsPublic(next)
      onPublicChange(next)
    }
    setToggling(false)
  }

  function copyInviteCode() {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="md:h-full md:overflow-y-auto">
      <DesktopTopbar crumbs={[ministryName, "Settings"]} />

      <div className="max-w-[640px] px-8 py-8">
        <h1 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", fontWeight: 400, marginBottom: 2 }}>
          Settings
        </h1>
        <p className="text-[13px] text-[#8A8497] mb-8">Manage your ministry workspace</p>

        {/* ── Ministry stats ── */}
        <section className="mb-8">
          <p className="text-[11px] font-semibold text-[#8A8497] uppercase tracking-wider mb-3">Ministry overview</p>
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={<Users className="w-4 h-4" />}
              value={stats?.total ?? "—"}
              label="Members"
            />
            <StatCard
              icon={<Shield className="w-4 h-4" />}
              value={stats?.leaders ?? "—"}
              label="Leaders"
            />
            <StatCard
              icon={<Crown className="w-4 h-4" />}
              value={stats?.admins ?? "—"}
              label="Admins"
            />
          </div>
        </section>

        {/* ── Discovery ── */}
        <section className="mb-8">
          <p className="text-[11px] font-semibold text-[#8A8497] uppercase tracking-wider mb-3">Discovery</p>
          <div className="bg-white rounded-2xl border border-[#E5E0D2] p-5">
            <button
              onClick={handleToggle}
              disabled={toggling}
              className="flex items-center justify-between w-full gap-4 disabled:opacity-70"
            >
              <div className="text-left">
                <p className="text-[14px] font-semibold text-[#13101A]">Public discovery</p>
                <p className="text-[13px] text-[#5A5466] mt-1 leading-relaxed">
                  {isPublic
                    ? "Anyone can find and join this ministry without an invite code."
                    : "Only members with an invite code can join this ministry."}
                </p>
              </div>
              <div
                className="w-11 h-6 rounded-full relative flex-shrink-0 transition-colors duration-200"
                style={{ background: isPublic ? "#3E1540" : "#E5E0D2" }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: isPublic ? "translateX(21px)" : "translateX(2px)" }}
                />
              </div>
            </button>

            {isPublic && (
              <div className="mt-4 pt-4 border-t border-[#F4F1E8]">
                <p className="text-[12px] text-[#8A8497]">
                  Your ministry is listed on the public discovery page. Members can find and join without needing an invite code.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Invite code ── */}
        <section className="mb-8">
          <p className="text-[11px] font-semibold text-[#8A8497] uppercase tracking-wider mb-3">Invite code</p>
          <div className="bg-white rounded-2xl border border-[#E5E0D2] p-5">
            <p className="text-[13px] text-[#5A5466] mb-4">
              Share this code with members to let them join directly.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 px-4 py-3 bg-[#F4F1E8] rounded-xl border border-[#E5E0D2]">
                <span className="font-mono text-[18px] font-semibold text-[#13101A] tracking-[0.15em]">
                  {inviteCode ?? "———"}
                </span>
              </div>
              <button
                onClick={copyInviteCode}
                disabled={!inviteCode}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-[#E5E0D2] text-[13px] font-semibold text-[#5A5466] hover:bg-[#F4F1E8] hover:border-[#3E1540]/30 disabled:opacity-40 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E0D2] p-5 flex flex-col gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#F4F1E8] flex items-center justify-center text-[#8A8497]">
        {icon}
      </div>
      <div>
        <p style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "32px", color: "#13101A", fontWeight: 400, lineHeight: 1 }}>
          {value}
        </p>
        <p className="text-[12px] text-[#8A8497] mt-1">{label}</p>
      </div>
    </div>
  )
}
