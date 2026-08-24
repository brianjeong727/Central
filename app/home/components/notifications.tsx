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
  POCKET_KICKER_STYLE,
  PocketSwitch,
} from "@/components/central"
import { unsubscribeFromPush, type PushState } from "@/lib/push"
// Native-aware wrappers: inside the Capacitor iOS shell these route to APNs; on plain
// web they fall through to the identical lib/push path (web behavior byte-unchanged).
import { subscribeToPushUnified, getPushStateUnified } from "@/lib/native-push"
import { APP_STORE_URL, iosNeedsInstallForPush } from "@/lib/push"
import type { NotificationSettings, GroupNotifyMode } from "../types"

// Merge a saved-settings write that PRESERVES keys we don't own here (e.g.
// prompt_snooze_until for the profile prefs; the tier prefs for the card dismiss).
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

// How long a dismissal holds. Long enough that the card is never a nag, short
// enough that a mis-tap does not cost someone push notifications forever.
const PROMPT_SNOOZE_DAYS = 14

/**
 * May the subscribe prompt appear right now?
 *
 * A dismissal is "not now", never "never". The old `prompt_dismissed` boolean was
 * the latter, and it is why members sat in a live church with notifications off and
 * no idea: its X is two millimetres from "Turn on notifications", one tap silenced
 * the prompt permanently, and because permission was then never REQUESTED, iOS never
 * listed Central under Settings → Notifications either — so the user's own instinct
 * ("I'll fix it in Settings") dead-ended too. The only way back was Profile → gear →
 * Notifications → Turn on, three levels behind an unlabelled gear.
 *
 * A legacy `prompt_dismissed: true` carrying no snooze is therefore treated as
 * ALREADY EXPIRED — that is what brings the card back for everyone stranded by it.
 * An unparseable date is treated the same way: fail toward asking.
 */
function promptSnoozed(settings?: NotificationSettings): boolean {
  const until = settings?.prompt_snooze_until
  if (!until) return false
  const ts = Date.parse(until)
  return Number.isFinite(ts) && ts > Date.now()
}

function snoozeFrom(now: number): string {
  return new Date(now + PROMPT_SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

// ── Chats-tab subscribe prompt ───────────────────────────────────────────────
// Shown ONLY when permission is 'default', there's no existing subscription, and the
// user hasn't dismissed it within the last PROMPT_SNOOZE_DAYS. Persists to
// profiles.notification_settings (NOT localStorage — Convention #1). Never fires the
// permission request on load.
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
    if (promptSnoozed(notificationSettings)) return
    getPushStateUnified().then((state) => {
      if (cancelled) return
      setVisible(state.supported && state.permission === "default" && !state.subscribed)
    })
    return () => {
      cancelled = true
    }
  }, [notificationSettings])

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
    // Snooze, and CLEAR the legacy boolean in the same write — leaving it set would
    // mean the row still carried a permanent "never" that some future reader could
    // honour again.
    await writeSettings(userId, ministryId, {
      ...(notificationSettings ?? {}),
      prompt_dismissed: false,
      prompt_snooze_until: snoozeFrom(Date.now()),
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
  mobile = false,
}: {
  on: boolean
  onToggle: () => void
  disabled?: boolean
  label: string
  mobile?: boolean
}) {
  // Mobile → the 46×28 PocketSwitch (mobile design system §Forms); desktop keeps
  // the shipped 38×22 pill.
  if (mobile) {
    return <PocketSwitch checked={on} onChange={() => onToggle()} ariaLabel={label} />
  }
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
  mobile = false,
}: {
  title: string
  sub: string
  on: boolean
  onToggle: () => void
  mobile?: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: mobile ? "center" : "flex-start",
        gap: mobile ? 14 : 16,
        padding: mobile ? "14px 0" : "14px 18px",
        borderTop: `1px solid ${mobile ? "var(--line-3)" : "var(--line)"}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: mobile ? 14.5 : 14, fontWeight: mobile ? 600 : 500, color: "var(--ink)" }}>{title}</div>
        <div style={{ marginTop: mobile ? 2 : 4, fontSize: 13, color: mobile ? "var(--muted-text)" : "var(--body)", lineHeight: 1.5 }}>{sub}</div>
      </div>
      <Toggle on={on} onToggle={onToggle} label={title} mobile={mobile} />
    </div>
  )
}

// Fill absent keys with their defaults (absent = on / smart) for the UI.
// The prompt bookkeeping keys are OMITTED, not defaulted: this object is spread
// wholesale over the saved settings on Save, so a defaulted value here would
// silently overwrite the user's snooze every time they touched a toggle.
function normalize(
  s?: NotificationSettings,
): Required<Omit<NotificationSettings, "prompt_dismissed" | "prompt_snooze_until">> {
  return {
    dms: s?.dms ?? true,
    mentions: s?.mentions ?? true,
    replies: s?.replies ?? true,
    announcements: s?.announcements ?? true,
    activity: s?.activity ?? true,
    deadlines: s?.deadlines ?? true,
    reactions: s?.reactions ?? true,
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
  mobile = false,
}: {
  userId: string
  ministryId: string
  notificationSettings?: NotificationSettings
  onSettingsChange?: (s: NotificationSettings) => void
  mobile?: boolean
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
  // Read after mount only — it reads navigator, and rendering it during SSR would
  // make the server and the client disagree about which copy this row carries.
  const needsAppForPush = pushState !== null && iosNeedsInstallForPush()

  let permissionLabel: string
  let permissionSub: string
  // An "unsupported" state is not a valid resting place for the product's main
  // channel. On iPhone it is also not the browser's fault in any way the member can
  // act on — Apple gives PushManager to installed apps only — so the row names the
  // ONE thing that fixes it instead of blaming Safari and stopping there.
  if (permission === "unsupported" && needsAppForPush) {
    permissionLabel = "Not available in Safari"
    permissionSub = "iPhone only sends notifications to installed apps."
  } else if (permission === "unsupported") {
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

  // Mobile → tonal ivory borderless cards + --line-3 dividers (mobile design
  // system §1.1); desktop keeps the shipped hairline cream card language.
  const cardBorder = mobile
    ? { borderRadius: "var(--r-pocket)", overflow: "hidden" as const, background: "var(--ivory)" }
    : { border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" as const, background: "var(--cream)" }
  const rowPad = mobile ? "14px 18px" : "16px 18px"
  const rowPadTight = mobile ? "14px 18px" : "14px 18px"
  const groupDivider = mobile ? "var(--line-3)" : "var(--line)"

  return (
    <div>
      <p style={{ ...(mobile ? POCKET_KICKER_STYLE : MONO_STYLE), marginBottom: 10, marginTop: 0 }}>Notifications</p>

      {/* Device permission — immediate action, not staged */}
      <div style={{ ...cardBorder, marginBottom: mobile ? 12 : 16 }}>
        <div style={{ display: "flex", alignItems: mobile ? "center" : "flex-start", gap: mobile ? 14 : 16, padding: rowPad }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: mobile ? 14.5 : 14, fontWeight: mobile ? 600 : 500, color: "var(--ink)" }}>{permissionLabel}</div>
            <div style={{ marginTop: mobile ? 2 : 4, fontSize: 13, color: mobile ? "var(--muted-text)" : "var(--body)", lineHeight: 1.5 }}>{permissionSub}</div>
            {enableError && (
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--danger)", lineHeight: 1.5 }}>{enableError}</div>
            )}
            {permission === "unsupported" && needsAppForPush && (
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-block", marginTop: 8, fontSize: 13, fontWeight: 600, color: "var(--plum)", textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Get Central on the App Store
              </a>
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
      <div style={mobile ? { ...cardBorder, padding: "0 18px" } : cardBorder}>
        {/* first row has no top border */}
        <div style={{ display: "flex", alignItems: mobile ? "center" : "flex-start", gap: mobile ? 14 : 16, padding: mobile ? "14px 0" : rowPadTight }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: mobile ? 14.5 : 14, fontWeight: mobile ? 600 : 500, color: "var(--ink)" }}>Direct messages</div>
            <div style={{ marginTop: mobile ? 2 : 4, fontSize: 13, color: mobile ? "var(--muted-text)" : "var(--body)", lineHeight: 1.5 }}>Someone sends you a direct message.</div>
          </div>
          <Toggle on={pending.dms} onToggle={() => set("dms", !pending.dms)} label="Direct messages" mobile={mobile} />
        </div>
        <ToggleRow title="Mentions" sub="Someone @mentions you in a chat." on={pending.mentions} onToggle={() => set("mentions", !pending.mentions)} mobile={mobile} />
        <ToggleRow title="Replies" sub="Someone replies to one of your messages." on={pending.replies} onToggle={() => set("replies", !pending.replies)} mobile={mobile} />
        <ToggleRow title="Announcements" sub="Your church posts a new announcement." on={pending.announcements} onToggle={() => set("announcements", !pending.announcements)} mobile={mobile} />
        <ToggleRow title="Activity & assignments" sub="You're given a task, role, or DGL week, a receipt is decided, your role changes, or your pastor asks a question." on={pending.activity} onToggle={() => set("activity", !pending.activity)} mobile={mobile} />
        <ToggleRow title="Deadlines" sub="Task due dates and confirmation requests." on={pending.deadlines} onToggle={() => set("deadlines", !pending.deadlines)} mobile={mobile} />
        <ToggleRow title="Reactions" sub="Someone reacts to one of your messages." on={pending.reactions} onToggle={() => set("reactions", !pending.reactions)} mobile={mobile} />

        {/* Group chat mode */}
        <div style={{ display: "flex", alignItems: "center", gap: mobile ? 14 : 16, padding: mobile ? "14px 0" : "14px 18px", borderTop: `1px solid ${groupDivider}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: mobile ? 14.5 : 14, fontWeight: mobile ? 600 : 500, color: "var(--ink)" }}>Group chats</div>
            <div style={{ marginTop: mobile ? 2 : 4, fontSize: 13, color: mobile ? "var(--muted-text)" : "var(--body)", lineHeight: 1.5 }}>
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

        <ToggleRow title="Desk work on web" sub="Approvals, form responses, and other team tasks while you're on the web app." on={pending.desk_web} onToggle={() => set("desk_web", !pending.desk_web)} mobile={mobile} />
        <ToggleRow title="Daily digest" sub="A once-a-day summary of desk-work items on mobile." on={pending.desk_digest} onToggle={() => set("desk_digest", !pending.desk_digest)} mobile={mobile} />
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
