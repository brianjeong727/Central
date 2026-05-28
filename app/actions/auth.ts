"use server"

import { createAdminClient } from "@/lib/supabase-admin"

export async function signUpWithAutoConfirm({
  email,
  password,
  metadata,
}: {
  email: string
  password: string
  metadata: Record<string, string>
}): Promise<{ error: string | null }> {
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    user_metadata: metadata,
    email_confirm: true,
  })
  if (error) return { error: error.message }
  return { error: null }
}
