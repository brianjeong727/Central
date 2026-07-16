"use client"

import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { Bell, X } from "lucide-react"
import { createClient } from "@/lib/supabase"
import {
  CentralCard,
  CentralButton,
  IconButton,
  Select,
  MONO_STYLE,
} from "@/components/central"
import { unsubscribeFromPush, type PushState } from "@/lib/push"
// Native-aware wrappers: inside the Capacitor iOS shell these route to APNs; on plain
// web they fall through to the identical lib/push path (web behavior byte-unchanged).
import { subscribeToPushUnified, getPushStateUnified } from "@/lib/native-push"
import type { NotificationSettings, GroupNotifyMode } from "../types"

// Merge a saved-settings write that PRESERVES keys we don't own here (e.g.
// prompt_dismissed for the profile prefs; the tier prefs for the card dismiss).
async function writeSettings(
  userId: string,
  ministryId: string,
  next: NotificationSettings,
) {
  const supabase = createClient()
  await supabase
    .from("profiles")
    .update({ notification_settings: next })
    .eq("id", userId)
    .eq("ministry_id", ministryId)
}

// ── Chats-tab subscribe prompt ───────────────────────────────────────────────
// Shown ONLY when permission is 'default' and there's no existing subscription and
// the user hasn't dismissed it. Dismissal persists to profiles.notification_settings
// (NOT localStorage — Convention #1). Never fires the permission request on load.
export function PushSubscribeCard({
  userId,
  ministryId,
  notificationSettings,
  style,
  variant = "callout",
}: {
  userId: string
  ministryId: string
  notificationSettings?: NotificationSettings
  style?: CSSProperties
  // "pocket" — borderless tonal ivory at --r-pocket for the phone-width chat list
  // (mobile design system §1.1/§5.5). "callout" keeps the desktop hairline card.
  variant?: "callout" | "pocket"
}) {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (notificationSettings?.prompt_dismissed) return
    getPushStateUnified().then((state) => {
      if (cancelled) return
      setVisible(state.supported && state.permission === "default" && !state.subscribed)
    })
    return () => {
      cancelled = true
    }
  }, [notificationSettings?.prompt_dismissed])

  async function handleEnable() {
    setBusy(true)
    setError(null)
    const res = await subscribeToPushUnified()
    setBusy(false) // always resets the pending state, even on rejection
    if (res.ok || res.reason === "denied") {
      // Success, or the user blocked it — either way the prompt is done. A denied
      // browser can't be un-blocked from here; the settings hint lives in Profile.
      setVisible(false)
      return
    }
    // Transient failure: stay visible, button returns to idle, retry possible.
    setError("Couldn't turn on notifications — try again")
  }

  async function handleDismiss() {
    setVisible(false)
    await writeSettings(userId, ministryId, {
      ...(notificationSettings ?? {}),
      prompt_dismissed: true,
    })
  }

  if (!visible) return null

  // Quiet nudge at ListRow scale — this mounts inside the narrow chat-list
  // panel, so no icon badge, no serif display size, no body paragraph.
  const pocket = variant === "pocket"
  const cardInner = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 3px" }}>
        <p style={{ ...MONO_STYLE, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <Bell size={11} strokeWidth={2} style={{ color: "var(--plum)" }} />
          Stay in the loop
        </p>
        <IconButton aria-label="Dismiss notification prompt" dim={34} onClick={handleDismiss} disabled={busy} style={{ marginRight: -8 }}>
          <X size={14} />
        </IconButton>
      </div>
      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", margin: "0 0 10px", lineHeight: 1.35 }}>
        Get notified about messages and announcements
      </p>
      {error && (
        <p style={{ fontSize: 12, color: "var(--danger)", margin: "0 0 8px" }}>{error}</p>
      )}
      <CentralButton size="sm" onClick={handleEnable} disabled={busy}>
        {busy ? "Turning on…" : "Turn on notifications"}
      </CentralButton>
    </>
  )

  if (pocket) {
    return (
      <div style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)", padding: "12px 14px", ...style }}>
        {cardInner}
      </div>
    )
  }
  return (
    <CentralCard variant="callout" style={{ padding: "12px 14px", ...style }}>
      {cardInner}
    </CentralCard>
  )
}

// ── Toggle switch (matches settings-tab automation toggle) ───────────────────
function Toggle({
  on,
  onToggle,
  disabled,
  label,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        border: "none",
        background: on ? "var(--plum)" : "var(--dashed)",
        position: "relative",
        flexShrink: 0,
        cursor: disabled ? "default" : "pointer",
        padding: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          position: "absolute",
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "var(--cream)",
          top: 2,
          ...(on ? { right: 2 } : { left: 2 }),
        }}
      />
    </button>
  )
}

function ToggleRow({
  title,
  sub,
  on,
  onToggle,
}: {
  title: string
  sub: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 16,
        padding: "14px 18px",
        borderTop: "1px solid var(--line)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{title}</div>
        <div style={{ marginTop: 4, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>{sub}</div>
      </div>
      <Toggle on={on} onToggle={onToggle} label={title} />
    </div>
  )
}

// Fill absent keys with their defaults (absent = on / smart) for the UI.
function normalize(s?: NotificationSettings): Required<Omit<NotificationSettings, "prompt_dismissed">> {
  return {
    dms: s?.dms ?? true,
    mentions: s?.mentions ?? true,
    replies: s?.replies ?? true,
    announcements: s?.announcements ?? true,
    activity: s?.activity ?? true,
    deadlines: s?.deadlines ?? true,
    group_mode: s?.group_mode ?? "smart",
    desk_web: s?.desk_web ?? true,
    desk_digest: s?.desk_digest ?? true,
  }
}

// ── Profile → Notifications section ──────────────────────────────────────────
// Permission state row (immediate device action) + staged per-tier prefs (Save/
// Cancel idiom — lessons.md §Settings). Prefs write profiles.notification_settings.
export function NotificationsSection({
  userId,
  ministryId,
  notificationSettings,
  onSettingsChange,
}: {
  userId: string
  ministryId: string
  notificationSettings?: NotificationSettings
  onSettingsChange?: (s: NotificationSettings) => void
}) {
  const saved = normalize(notificationSettings)
  const [pending, setPending] = useState(saved)
  const [savedState, setSavedState] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [pushState, setPushState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [enableError, setEnableError] = useState<string | null>(null)

  const refreshPushState = useCallback(() => {
    getPushStateUnified().then(setPushState)
  }, [])

  useEffect(() => {
    refreshPushState()
  }, [refreshPushState])

  const dirty = JSON.stringify(pending) !== JSON.stringify(savedState)

  function set<K extends keyof typeof pending>(key: K, value: (typeof pending)[K]) {
    setPending((p) => ({ ...p, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const next: NotificationSettings = {
      ...(notificationSettings ?? {}),
      ...pending,
    }
    await writeSettings(userId, ministryId, next)
    setSaving(false)
    setSavedState(pending)
    onSettingsChange?.(next)
  }

  function handleCancel() {
    setPending(savedState)
  }

  async function handleEnable() {
    setBusy(true)
    setEnableError(null)
    const res = await subscribeToPushUnified()
    setBusy(false) // always resets the pending state, even on rejection
    // Denied surfaces through the permission row's "Blocked" settings hint (from
    // refreshPushState). Any other failure is transient — show a quiet inline
    // error and leave the "Turn on" button idle so the user can retry.
    refreshPushState()
    if (!res.ok && res.reason !== "denied") {
      setEnableError("Couldn't turn on notifications — try again")
    }
  }

  async function handleDisable() {
    setBusy(true)
    setEnableError(null)
    await unsubscribeFromPush()
    setBusy(false)
    refreshPushState()
  }

  const permission = pushState?.permission ?? "default"
  const subscribed = pushState?.subscribed ?? false

  let permissionLabel: string
  let permissionSub: string
  if (permission === "unsupported") {
    permissionLabel = "Not supported"
    permissionSub = "This browser doesn't support push notifications."
  } else if (permission === "denied") {
    permissionLabel = "Blocked"
    permissionSub = "Notifications are blocked in your browser settings. Re-enable them there to turn these on."
  } else if (subscribed) {
    permissionLabel = "On for this device"
    permissionSub = "You'll receive push notifications here."
  } else {
    permissionLabel = "Off for this device"
    permissionSub = "Turn on push notifications to receive them on this device."
  }

  const cardBorder = { border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" as const, background: "var(--cream)" }

  return (
    <div>
      <p style={{ ...MONO_STYLE, marginBottom: 10, marginTop: 0 }}>Notifications</p>

      {/* Device permission — immediate action, not staged */}
      <div style={{ ...cardBorder, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "16px 18px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{permissionLabel}</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>{permissionSub}</div>
            {enableError && (
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--danger)", lineHeight: 1.5 }}>{enableError}</div>
            )}
          </div>
          {permission !== "unsupported" && permission !== "denied" && (
            subscribed ? (
              <CentralButton variant="secondary" size="sm" onClick={handleDisable} disabled={busy}>
                {busy ? "…" : "Turn off"}
              </CentralButton>
            ) : (
              <CentralButton variant="primary" size="sm" onClick={handleEnable} disabled={busy}>
                {busy ? "…" : "Turn on"}
              </CentralButton>
            )
          )}
        </div>
      </div>

      {/* Per-tier preferences — staged behind Save/Cancel */}
      <div style={cardBorder}>
        {/* first row has no top border */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "14px 18px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Direct messages</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>Someone sends you a direct message.</div>
          </div>
          <Toggle on={pending.dms} onToggle={() => set("dms", !pending.dms)} label="Direct messages" />
        </div>
        <ToggleRow title="Mentions" sub="Someone @mentions you in a chat." on={pending.mentions} onToggle={() => set("mentions", !pending.mentions)} />
        <ToggleRow title="Replies" sub="Someone replies to one of your messages." on={pending.replies} onToggle={() => set("replies", !pending.replies)} />
        <ToggleRow title="Announcements" sub="Your church posts a new announcement." on={pending.announcements} onToggle={() => set("announcements", !pending.announcements)} />
        <ToggleRow title="Activity & assignments" sub="You're given a task, role, or DGL week, a receipt is decided, your role changes, or your pastor asks a question." on={pending.activity} onToggle={() => set("activity", !pending.activity)} />
        <ToggleRow title="Deadlines" sub="Task due dates and confirmation requests." on={pending.deadlines} onToggle={() => set("deadlines", !pending.deadlines)} />

        {/* Group chat mode */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderTop: "1px solid var(--line)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>Group chats</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "var(--body)", lineHeight: 1.5 }}>
              Smart notifies you for every message in smaller chats and only mentions in large ones.
            </div>
          </div>
          <Select
            size="sm"
            value={pending.group_mode}
            onChange={(e) => set("group_mode", e.target.value as GroupNotifyMode)}
            style={{ width: 130, flexShrink: 0 }}
            aria-label="Group chat notifications"
          >
            <option value="smart">Smart</option>
            <option value="all">All messages</option>
            <option value="mentions">Mentions only</option>
            <option value="off">Off</option>
          </Select>
        </div>

        <ToggleRow title="Desk work on web" sub="Approvals, form responses, and other team tasks while you're on the web app." on={pending.desk_web} onToggle={() => set("desk_web", !pending.desk_web)} />
        <ToggleRow title="Daily digest" sub="A once-a-day summary of desk-work items on mobile." on={pending.desk_digest} onToggle={() => set("desk_digest", !pending.desk_digest)} />
      </div>

      {dirty && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <CentralButton variant="secondary" size="sm" onClick={handleCancel} disabled={saving}>
            Cancel
          </CentralButton>
          <CentralButton variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </CentralButton>
        </div>
      )}
    </div>
  )
}
