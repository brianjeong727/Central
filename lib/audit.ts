import { createClient } from "@/lib/supabase"

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
    .then(() => {})
}
