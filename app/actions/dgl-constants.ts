// Shared DGL types and constants — client-safe (no "use server")

export type DGLSlot = "wednesday_pm" | "friday_sg" | "sunday_service"
export type DGLRole =
  | "leading_pm"
  | "pm_praise"
  | "cooking"
  | "friday_praise"
  | "congregational_prayer"
  | "dishes"

export const SLOT_ROLES: Record<DGLSlot, [DGLRole, DGLRole]> = {
  wednesday_pm:   ["leading_pm", "pm_praise"],
  friday_sg:      ["cooking", "friday_praise"],
  sunday_service: ["congregational_prayer", "dishes"],
}

export const SLOTS: DGLSlot[] = ["wednesday_pm", "friday_sg", "sunday_service"]

export type ProposedAssignment = {
  week_date: string
  slot: DGLSlot
  role: DGLRole
  user_id: string
  user_name: string
  needs_review: boolean
}
