import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveMinistryTimezone } from "./tz"

/**
 * The ministry's IANA timezone, for SERVER code (server actions, route handlers,
 * server components). Client components read it from context instead
 * (`app/home/ministry-timezone-context.tsx`) — do not fetch it per component.
 *
 * Every server path that turns an event instant into a wall clock (or the
 * reverse) needs this: `ministries.timezone` is the only correct answer, and a
 * hardcoded zone — the `America/Los_Angeles` constants scattered through the
 * scheduling code — is wrong for every ministry that isn't in that zone.
 *
 * `ministries.timezone` is NOT NULL with a default, so a missing row or a
 * missing value is a real bug (wrong id, or an RLS-invisible ministry). It is
 * logged rather than swallowed; the resolver's documented fallback keeps the
 * caller running instead of throwing mid-write.
 */
export async function getMinistryTimezone(supabase: SupabaseClient, ministryId: string): Promise<string> {
  const { data, error } = await supabase
    .from("ministries")
    .select("timezone")
    .eq("id", ministryId)
    .maybeSingle()
  if (error) {
    console.error(`[tz] failed to read ministries.timezone for ${ministryId}: ${error.message}`)
  } else if (!data) {
    console.error(`[tz] no ministries row visible for ${ministryId} when reading timezone`)
  }
  return resolveMinistryTimezone((data as { timezone: string | null } | null)?.timezone)
}
