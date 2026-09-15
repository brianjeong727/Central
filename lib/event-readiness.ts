// ── Event readiness — ONE composite truth ─────────────────────────────────────
//
// "Ready" used to mean "every checklist task is ticked", which is why an event
// with 22/22 tasks and a role nobody has agreed to staff rendered a green Ready
// on six different surfaces (mobile hub, mobile Overview, desktop Overview card,
// the launchpad rows, the Countdown rail, the container roll-up) — each with its
// own hand-copied `done / total` formula that drifted from the others.
//
// The model here: an event is ready when the CHECKLIST is done AND every role is
// CONFIRMED by the person holding it. A role whose confirmation came back
// `declined` is not covered — it is a hole, and it counts as one everywhere.
// A role that is assigned but has never answered is not confirmed either, so it
// holds "Ready" back without being reported as a hole.
//
// Dependency-free on purpose (no React, no tokens beyond CSS var NAMES, no
// Supabase) so `components/central` — a leaf — could consume it too.

export type ReadinessTone = "ready" | "progress" | "attention" | "empty"

/** Only the fields readiness reads — `EventTask` and friends satisfy these. */
export interface ReadinessTask {
  completed: boolean
}
export interface ReadinessRole {
  id: string
  assigned_to: string | null
}
export interface ReadinessConfirmation {
  status: "requested" | "confirmed" | "declined" | "escalated"
}

export interface ReadinessInput {
  tasks: ReadinessTask[]
  roles: ReadinessRole[]
  /** Keyed by `event_roles.id` (= `event_confirmations.subject_id`). */
  confirmations?: Record<string, ReadinessConfirmation | undefined>
}

export interface EventReadiness {
  taskDone: number
  taskTotal: number
  rolesTotal: number
  /** Roles with a person on them whose answer is not `declined` — i.e. COVERED. */
  rolesAssigned: number
  /** Covered roles whose holder has confirmed. */
  rolesConfirmed: number
  /** Roles whose holder declined. Never counted as covered. */
  rolesDeclined: number
  /** Composite: (tasks done + roles confirmed) / (tasks + roles), 0–100. */
  pct: number
  label: string
  tone: ReadinessTone
  /** One-line supporting readout, e.g. "22/22 tasks · no roles yet". */
  detail: string
}

/**
 * A role is COVERED when someone is on it and that someone has not declined.
 * This is the single predicate behind both the "Covered" / "Needs someone"
 * grouping and every readiness count.
 */
export function isRoleCovered(
  role: ReadinessRole,
  confirmations?: Record<string, ReadinessConfirmation | undefined>,
): boolean {
  if (!role.assigned_to) return false
  return confirmations?.[role.id]?.status !== "declined"
}

/** Tone → the token each surface paints the dot / pill / bar with. */
export const READINESS_TONE_COLOR: Record<ReadinessTone, string> = {
  ready: "var(--success)",
  progress: "var(--sage)",
  attention: "var(--gold)",
  empty: "var(--muted-text)",
}

export function computeEventReadiness({ tasks, roles, confirmations }: ReadinessInput): EventReadiness {
  const taskTotal = tasks.length
  const taskDone = tasks.filter((t) => t.completed).length

  const rolesTotal = roles.length
  let rolesAssigned = 0
  let rolesConfirmed = 0
  let rolesDeclined = 0
  for (const role of roles) {
    const status = confirmations?.[role.id]?.status
    if (status === "declined") { rolesDeclined++; continue }
    if (!role.assigned_to) continue
    rolesAssigned++
    if (status === "confirmed") rolesConfirmed++
  }

  const denom = taskTotal + rolesTotal
  const pct = denom > 0 ? Math.round(((taskDone + rolesConfirmed) / denom) * 100) : 0

  const tasksDoneAll = taskDone === taskTotal
  // "Ready" needs a roster to be ready ABOUT: with no roles at all there is no
  // evidence anyone is running this event, so readiness reports the tasks only
  // and says so rather than going green.
  const ready = tasksDoneAll && rolesTotal > 0 && rolesConfirmed === rolesTotal

  let label: string
  let tone: ReadinessTone
  if (taskTotal === 0 && rolesTotal === 0) {
    label = "Not started"
    tone = "empty"
  } else if (ready) {
    label = "Ready"
    tone = "ready"
  } else if (rolesDeclined > 0) {
    // A decline is the loudest fact on the event — it names a hole someone has
    // to fill, so it outranks the percentage ladder.
    label = "Needs someone"
    tone = "attention"
  } else if (tasksDoneAll && rolesTotal > 0 && rolesAssigned === rolesTotal) {
    label = "Awaiting confirmations"
    tone = "progress"
  } else if (tasksDoneAll && rolesTotal === 0) {
    label = "Tasks done"
    tone = "progress"
  } else if (pct >= 50) {
    label = "In progress"
    tone = "progress"
  } else {
    label = "Needs attention"
    tone = "attention"
  }

  const detail =
    taskTotal === 0 && rolesTotal === 0
      ? "No tasks or roles yet"
      : [
          taskTotal > 0 ? `${taskDone}/${taskTotal} tasks` : "no tasks yet",
          rolesTotal > 0 ? `${rolesConfirmed}/${rolesTotal} roles confirmed` : "no roles yet",
          rolesDeclined > 0 ? `${rolesDeclined} declined` : null,
        ]
          .filter(Boolean)
          .join(" · ")

  return { taskDone, taskTotal, rolesTotal, rolesAssigned, rolesConfirmed, rolesDeclined, pct, label, tone, detail }
}

/** The one set of words for a confirmation's state. Every surface that shows a
 *  role's confirmation says the same thing; only the colour ramp is local. */
export const CONFIRMATION_LABEL: Record<ReadinessConfirmation["status"], string> = {
  requested: "Awaiting",
  escalated: "Escalated",
  confirmed: "Confirmed",
  declined: "Declined",
}

/** Tonal colour for a confirmation state. A decline is --danger: it names a hole,
 *  so it is never quieter than a confirmation. */
export function confirmationColor(status: ReadinessConfirmation["status"]): string {
  return status === "declined" ? "var(--danger)" : status === "confirmed" ? "var(--sage)" : "var(--plum)"
}

/** Roles readout for the launchpad row and the mobile stat: "2/6 assigned · 1 confirmed". */
export function rolesSummary(r: EventReadiness): string {
  if (r.rolesTotal === 0) return "no roles yet"
  return [
    `${r.rolesAssigned}/${r.rolesTotal} assigned`,
    `${r.rolesConfirmed} confirmed`,
    r.rolesDeclined > 0 ? `${r.rolesDeclined} declined` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

/** Filled segments for the N-segment readiness bar — one rounding rule, everywhere. */
export function readinessSegments(r: EventReadiness, segments: number): number {
  return Math.round((r.pct / 100) * segments)
}
