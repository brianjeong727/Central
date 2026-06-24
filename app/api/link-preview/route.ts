import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 })

  try {
    new URL(url) // validate
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CentralBot/1.0; +https://joincentral.app)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) return NextResponse.json({ error: "Fetch failed" }, { status: 502 })
    const contentType = res.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html")) return NextResponse.json({ error: "Not HTML" }, { status: 422 })

    const html = await res.text()

    function getMeta(...names: string[]): string | null {
      for (const name of names) {
        const m =
          html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']{1,500})["']`, "i")) ||
          html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+(?:property|name)=["']${name}["']`, "i"))
        if (m?.[1]) return m[1].trim()
      }
      return null
    }

    const title = getMeta("og:title", "twitter:title") || html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() || null
    const description = getMeta("og:description", "twitter:description", "description")
    const image = getMeta("og:image", "twitter:image")
    const siteName = getMeta("og:site_name")
    const hostname = new URL(url).hostname.replace(/^www\./, "")

    return NextResponse.json({ title, description, image, siteName, hostname, url }, {
      headers: { "Cache-Control": "public, max-age=3600" },
    })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
