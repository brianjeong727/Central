"use server"

import { createClient } from "@/lib/supabase-server"

export async function finalizeBibleStudyAction(
  sheetId: string,
  googleDocUrl: string,
  userId: string
): Promise<{ publicUrl?: string; error?: string }> {
  try {
    const match = googleDocUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
    if (!match) return { error: "Invalid Google Doc URL — paste the full link from your browser." }
    const docId = match[1]
    // tab=t.0 exports only the first tab, avoiding Google Docs tab-divider cover pages in the PDF
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=pdf&tab=t.0`

    const res = await fetch(exportUrl, { redirect: "follow" })
    if (!res.ok) {
      return { error: "Could not export PDF. Make sure the Google Doc is set to 'Anyone with the link can view'." }
    }
    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.includes("pdf")) {
      return { error: "Google Doc returned a sign-in page instead of a PDF. Make the document publicly viewable first." }
    }

    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const supabase = await createClient()
    const fileName = `${sheetId}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from("bible-study")
      .upload(fileName, buffer, { contentType: "application/pdf", upsert: true })

    if (uploadErr) return { error: uploadErr.message }

    const { data: { publicUrl } } = supabase.storage.from("bible-study").getPublicUrl(fileName)

    const { error: updateErr } = await supabase
      .from("bible_study_sheets")
      .update({
        status: "finalized",
        pdf_url: publicUrl,
        finalized_at: new Date().toISOString(),
        finalized_by: userId,
      })
      .eq("id", sheetId)

    if (updateErr) return { error: updateErr.message }
    return { publicUrl }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}

export async function savePastorNotesAction(
  sheetId: string,
  pastorNotes: string
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("bible_study_sheets")
      .update({ pastor_notes: pastorNotes })
      .eq("id", sheetId)
    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" }
  }
}
