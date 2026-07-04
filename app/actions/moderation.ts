"use server"

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryAdmin, requireMinistryMember } from "./authz"
import type { ModerationSettings, ModBehavior, ModStrictness, ModScope } from "@/lib/moderation"

const BEHAVIORS: ModBehavior[] = ["asterisk_first", "asterisk_all", "block"]
const STRICTNESS: ModStrictness[] = ["lenient", "moderate", "strict"]
const SCOPES: ModScope[] = ["all", "church", "personal", "ministry"]

// Admin-only: validate every field against its enum (reject unknowns, coerce
// booleans) before persisting to ministries.moderation_settings.
export async function updateModerationSettings(
  ministryId: string,
  settings: ModerationSettings,
): Promise<{ error: string | null }> {
  const ctx = await requireMinistryAdmin(ministryId)
  if (ctx.error !== null) return { error: ctx.error }

  const behavior = BEHAVIORS.includes(settings?.behavior) ? settings.behavior : null
  const strictness = STRICTNESS.includes(settings?.strictness) ? settings.strictness : null
  const scope = SCOPES.includes(settings?.scope) ? settings.scope : null
  if (!behavior || !strictness || !scope) return { error: "Invalid moderation settings." }

  const validated: ModerationSettings = {
    enabled: Boolean(settings.enabled),
    behavior,
    strictness,
    scope,
    photo_enabled: Boolean(settings.photo_enabled),
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("ministries")
    .update({ moderation_settings: validated })
    .eq("id", ministryId)
  if (error) return { error: error.message }

  return { error: null }
}

// Fire-and-forget offense counter. Callable WITHOUT awaiting; must never throw
// to the caller and must be side-effect-safe on error. Increments the caller's
// per-ministry offense count; every 5th offense writes an audit entry.
export async function recordChatOffense(groupId: string, snippet: string): Promise<void> {
  try {
    const ctx = await requireMinistryMember()
    if (ctx.error !== null) return
    const { userId, ministryId } = ctx

    const admin = createAdminClient()

    // Atomic increment via SECURITY DEFINER RPC (on-conflict upsert `count = count + 1`,
    // returns the new count). Service-role only.
    const { data: newCount, error } = await admin.rpc("increment_chat_offense", {
      p_ministry_id: ministryId,
      p_user_id: userId,
    })
    if (error) return

    const count = newCount as number

    if (count % 5 === 0) {
      const [{ data: prof }, { data: grp }] = await Promise.all([
        admin.from("profiles").select("name").eq("id", userId).maybeSingle(),
        // Scope the group lookup to the caller's own ministry (Convention #8) so a
        // spoofed cross-ministry groupId can't leak another tenant's group name.
        admin.from("groups").select("name").eq("id", groupId).eq("ministry_id", ministryId).maybeSingle(),
      ])
      await admin.from("audit_logs").insert({
        ministry_id: ministryId,
        actor_id: userId,
        actor_name: (prof?.name as string | undefined) ?? "Member",
        action: "moderation.flag_threshold",
        entity_type: "chat",
        entity_id: groupId,
        entity_label: (grp?.name as string | undefined) ?? "Chat",
        metadata: { count, snippet: snippet.slice(0, 120) },
      })
    }
  } catch {
    // Fire-and-forget: swallow everything, never throw to the caller.
    return
  }
}
