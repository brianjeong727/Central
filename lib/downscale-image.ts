// Client-side image downscale before upload: cap the longest edge and re-encode
// JPEG so phone-camera multi-MB originals never hit storage/egress.
//
// Best-effort by contract — on any decode failure (e.g. a HEIC the browser can't
// paint) this THROWS and the caller is expected to fall back to uploading the
// original file untouched. Every caller must wrap it in try/catch.
//
// Lives here rather than in a tab file because there are now two avatar uploads
// (the profile photo and a chat's photo) and a second hand-copied encoder would
// drift on quality/maxEdge the first time either is tuned.
export async function downscaleToJpeg(file: File, maxEdge = 512, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no 2d context")
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality))
    if (!blob) throw new Error("toBlob failed")
    return blob
  } finally {
    bitmap.close?.()
  }
}
