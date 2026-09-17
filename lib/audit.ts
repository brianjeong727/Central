import { createClient } from "@/lib/supabase"

// Row policy (audit_logs_insert, 2026-09-15): a browser write must be
// self-attributed and within the caller's tier — leader-tier may write
// `announcement.*` ONLY; every other action needs admin tier from the browser.
// A leader-tier surface that emits a non-announcement action (team.*, moderation.*,
// finance) must write it server-side with the service role, as
// app/actions/finance-funds.ts does for settings.funds_edit. Reads are admin-only,
// except that a leader can read back the `announcement.*` rows they wrote
// themselves (that is what keeps INSERT…RETURNING working for them).
export type AuditAction =
  | "announcement.create"
  | "announcement.edit"
  | "announcement.delete"
  | "announcement.pin"
  | "announcement.unpin"
  | "announcement.subpin"
  | "announcement.unsubpin"
  | "member.role_change"
  | "member.remove"
  | "member.excommunicate"
  | "team.member_add"
  | "team.member_remove"
  | "team.member_role_change"
  | "moderation.flag_threshold"
  | "account.self_delete" // server-side only (app/actions/delete-account.ts)
  // Church Settings — one action per section that commits. Every one of these
  // carries `metadata.changes: AuditChange[]`; a commit with no deltas is never
  // logged at all, so an empty `changes` array should not exist in the table.
  | "settings.general_edit"
  | "settings.discovery_edit"
  | "settings.governance_edit"
  | "settings.automations_edit"
  | "settings.moderation_edit"
  | "settings.sharing_edit"
  | "settings.funds_edit"

/**
 * One old→new pair inside a settings audit entry's `metadata.changes`.
 *
 * `field` is the PLAIN-ENGLISH label the admin saw in the confirm modal
 * ("Ministry name", "Time zone"), never a column or settings key — the Audit Log
 * renders it verbatim, and a raw key on that screen is a leak of internals.
 */
export interface AuditChange {
  field: string
  from: string
  to: string
}

interface AuditPayload {
  ministryId: string
  actorId: string
  actorName: string
  action: AuditAction
  entityType: string
  entityId?: string | null
  entityLabel?: string | null
  metadata?: Record<string, unknown> | null
}

export function logAudit(payload: AuditPayload): void {
  const supabase = createClient()
  supabase
    .from("audit_logs")
    .insert({
      ministry_id: payload.ministryId,
      actor_id: payload.actorId,
      actor_name: payload.actorName,
      action: payload.action,
      entity_type: payload.entityType,
      entity_id: payload.entityId ?? null,
      entity_label: payload.entityLabel ?? null,
      metadata: payload.metadata ?? null,
    })
    // Still fire-and-forget — an audit row must never block or fail the write it
    // describes. But a refusal (RLS 42501) or a network failure used to vanish
    // entirely, so "every committed change is audited" could quietly stop being
    // true. Surface it: the console is where the next silent gap gets noticed.
    .then(({ error }) => {
      if (error) console.warn(`[audit] ${payload.action} was not recorded: ${error.message}`)
    })
}
