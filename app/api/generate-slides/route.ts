import { NextRequest, NextResponse } from "next/server"

const SYSTEM_PROMPT =
  "You are a lyrics extractor. Given OCR text from a chord chart, extract only the song lyrics organized by section. Remove all chord names like D, Em, G, Asus, G2, A/C#, all musical notation, all copyright text, CCLI numbers, tempo, key, and time signature metadata. Return only section headers like VERSE 1, CHORUS, BRIDGE followed by the lyrics for that section. Plain text only, no markdown."

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 })
  }

  let ocrText: string
  try {
    const body = await req.json()
    ocrText = body.ocrText
    console.log("[generate-slides] ocrText length:", ocrText?.length ?? 0)
  } catch (e) {
    console.error("[generate-slides] Failed to parse request body:", e)
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  if (!ocrText) {
    return NextResponse.json({ error: "ocrText required" }, { status: 400 })
  }

  const abort = new AbortController()
  const abortTimer = setTimeout(() => abort.abort(), 15_000)

  let anthropicRes: Response
  try {
    anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: abort.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: ocrText }],
      }),
    })
  } catch (e: unknown) {
    clearTimeout(abortTimer)
    const isAbort = e instanceof Error && e.name === "AbortError"
    console.error("[generate-slides] Fetch error (aborted=" + isAbort + "):", e)
    return NextResponse.json(
      { error: isAbort ? "Anthropic request timed out after 15s" : "Network error calling Anthropic" },
      { status: 500 }
    )
  }
  clearTimeout(abortTimer)

  if (!anthropicRes.ok) {
    const errBody = await anthropicRes.text()
    console.error(`[generate-slides] Anthropic returned ${anthropicRes.status}:`, errBody)
    return NextResponse.json(
      { error: `Anthropic API error ${anthropicRes.status}` },
      { status: 500 }
    )
  }

  let data: { content?: { type: string; text: string }[] }
  try {
    data = await anthropicRes.json()
  } catch (e) {
    console.error("[generate-slides] Failed to parse Anthropic response:", e)
    return NextResponse.json({ error: "Failed to parse Anthropic response" }, { status: 500 })
  }

  const text = data.content?.[0]?.text ?? ""
  console.log("[generate-slides] Claude response length:", text.length)

  // Parse Claude's plain-text response into {section, lyrics} pairs.
  // Section headers are short ALL-CAPS lines (VERSE 1, CHORUS, BRIDGE, etc.).
  const sections: { section: string; lyrics: string }[] = []
  let currentSection = ""
  let currentLines: string[] = []

  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const isHeader = line === line.toUpperCase() && line.length < 40 && /[A-Z]/.test(line)
    if (isHeader) {
      if (currentSection && currentLines.length > 0) {
        sections.push({ section: currentSection, lyrics: currentLines.join("\n") })
      }
      currentSection = line
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  if (currentSection && currentLines.length > 0) {
    sections.push({ section: currentSection, lyrics: currentLines.join("\n") })
  }

  console.log("[generate-slides] Parsed sections:", sections.length)
  return NextResponse.json({ sections })
}
