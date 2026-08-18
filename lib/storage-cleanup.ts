// The ONE layer for deleting a Supabase Storage object.
//
// Why this exists: every delete path in the app used to null the DB pointer and
// leave the file behind, in buckets that are PUBLIC — so the URL kept serving
// the "deleted" photo forever. Nothing ever called `storage.remove()`.
//
// Three rules are encoded here because each one was proven the hard way, and
// each one is invisible if you get it wrong:
//
//  1. **Judge success on `data.length`, NEVER on `error`.** An RLS-denied
//     `.remove()` returns `{ error: null, data: [] }` — HTTP 200, no error, file
//     untouched. `if (error)` reports success while the object survives. This is
//     the single most important line in this file.
//  2. **Remove BEFORE nulling the pointer.** Remove-first, then a failed row
//     write, leaves a broken image: visible, and the Delete affordance is still
//     there so the user self-heals. Row-write-first, then a failed remove,
//     leaves a live public file with no pointer anywhere: invisible, permanent,
//     unretryable — the exact leak this module exists to close.
//  3. **Best-effort, never blocking.** A storage hiccup must not stop a user's
//     delete from completing. Every function here swallows its failure and logs
//     the orphan path, because once the pointer is gone the path is the only
//     way to ever find the file again.
//
// `.remove()` matches EXACT names, not prefixes — passing a folder deletes
// nothing and returns `data: []`. Sweeping a folder means `.list()` then
// `.remove(names)` (see `removeStorageFolder`).

/** Structural shape of the pieces of a Supabase client this module touches.
 *  Deliberately minimal so BOTH the browser client and the service-role admin
 *  client satisfy it without importing either (this module is a leaf). */
export interface StorageCapableClient {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<{ data: unknown[] | null; error: { message: string } | null }>
      list(
        path?: string,
        options?: { limit?: number; offset?: number }
      ): Promise<{ data: { name: string }[] | null; error: { message: string } | null }>
    }
  }
}

/**
 * Extract the in-bucket object path from a Supabase public URL.
 *
 * Returns null for anything that is not a public URL for THIS bucket — an
 * external URL (chat GIFs point at Giphy), a different bucket, or a malformed
 * value. Never feed a raw stored URL to `.remove()`: on a forwarded message it
 * names somebody else's object.
 *
 * @param expectedFirstSegment When given, the path's first segment (the owner
 *   folder — a group id or a user id) must equal it or null is returned. This
 *   is the guard against removing an object that belongs to another chat/user.
 */
export function storagePathFromPublicUrl(
  url: string | null | undefined,
  bucket: string,
  expectedFirstSegment?: string
): string | null {
  if (!url || typeof url !== "string") return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const at = url.indexOf(marker)
  if (at === -1) return null

  // Strip query (`?t=…`) and hash before decoding — they are not part of the key.
  let raw = url.slice(at + marker.length)
  const cut = Math.min(
    ...[raw.indexOf("?"), raw.indexOf("#")].filter((i) => i !== -1).concat([raw.length])
  )
  raw = raw.slice(0, cut)
  if (!raw) return null

  let path: string
  try {
    // Extensions are derived from the user's filename, so a key can carry
    // percent-encoded characters. A malformed sequence throws — treat as unparseable.
    path = decodeURIComponent(raw)
  } catch {
    return null
  }

  // Reject traversal / absolute-looking keys outright.
  if (path.startsWith("/") || path.includes("..")) return null

  if (expectedFirstSegment !== undefined) {
    const first = path.split("/")[0]
    if (!first || first !== expectedFirstSegment) return null
  }
  return path
}

/**
 * Remove objects from a bucket, best-effort.
 *
 * Returns the number ACTUALLY removed, judged on the returned rows — not on
 * `error`, which is null even when RLS refused (see rule 1 above). Any shortfall
 * is logged with the exact paths so an orphan is at least recoverable.
 * Never throws.
 */
export async function removeStorageObjects(
  client: StorageCapableClient,
  bucket: string,
  paths: string[],
  context: string
): Promise<number> {
  const wanted = paths.filter((p): p is string => typeof p === "string" && p.length > 0)
  if (wanted.length === 0) return 0
  try {
    const { data, error } = await client.storage.from(bucket).remove(wanted)
    const removed = data?.length ?? 0
    if (removed < wanted.length) {
      // error is usually null here — an RLS refusal is a silent empty array.
      console.warn(
        `[storage-cleanup] ${context}: orphaned ${wanted.length - removed}/${wanted.length} object(s) in ${bucket}`,
        { paths: wanted, removed, error: error?.message ?? null }
      )
    }
    return removed
  } catch (e) {
    console.warn(`[storage-cleanup] ${context}: remove threw for ${bucket}`, { paths: wanted, error: e })
    return 0
  }
}

/** Convenience for the single-object case. Returns true only if it is really gone. */
export async function removeStorageObject(
  client: StorageCapableClient,
  bucket: string,
  path: string | null,
  context: string
): Promise<boolean> {
  if (!path) return false
  return (await removeStorageObjects(client, bucket, [path], context)) > 0
}

/**
 * Sweep every object under a folder prefix. `.remove()` takes exact names, so
 * this lists first and removes what it finds, paging until the bucket is empty
 * of that prefix. Best-effort; never throws.
 *
 * Only safe on a client that can actually see AND delete the whole folder — in
 * practice the service-role client.
 */
export async function removeStorageFolder(
  client: StorageCapableClient,
  bucket: string,
  prefix: string,
  context: string
): Promise<number> {
  if (!prefix) return 0
  let total = 0
  try {
    const api = client.storage.from(bucket)
    // Bounded loop: each pass removes what it listed, so a page that removes
    // nothing means we cannot make progress (RLS refusal) — stop rather than spin.
    for (let pass = 0; pass < 20; pass++) {
      const { data, error } = await api.list(prefix, { limit: 100 })
      if (error) {
        console.warn(`[storage-cleanup] ${context}: list failed for ${bucket}/${prefix}`, error.message)
        return total
      }
      const names = (data ?? []).map((f) => f.name).filter(Boolean)
      if (names.length === 0) return total
      const removed = await removeStorageObjects(
        client,
        bucket,
        names.map((n) => `${prefix}/${n}`),
        context
      )
      total += removed
      if (removed === 0) return total
      if (names.length < 100) return total
    }
  } catch (e) {
    console.warn(`[storage-cleanup] ${context}: folder sweep threw for ${bucket}/${prefix}`, e)
  }
  return total
}
