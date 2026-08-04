import { NextResponse } from "next/server"

// ─── apple-app-site-association (AASA) ───────────────────────────────────────
//
// Authorizes the native iOS shell to share saved passwords with this domain.
//
// WHY THIS EXISTS: the iOS app is a thin WKWebView loading https://www.joincentral.app
// (capacitor.config.ts). iOS Password AutoFill only surfaces iCloud Keychain
// credentials inside an app's WebView — and only offers to SAVE new ones — when the
// app declares the domain via the Associated Domains entitlement AND the domain
// serves a matching AASA. Safari works without this because Safari owns the
// credential store; the app shell does not. Without both halves, the login form
// autofills on web and offers nothing in the app.
//
// Paired with `webcredentials:www.joincentral.app` in ios/App/App/App.entitlements.
// Both halves are required — either one alone does nothing.
//
// A ROUTE HANDLER, NOT public/: Apple requires Content-Type: application/json, and
// Vercel serves extensionless static files as application/octet-stream, which Apple
// rejects. NextResponse.json guarantees the header.
//
// EXCLUDED FROM MIDDLEWARE: proxy.ts's matcher skips .well-known. Apple's CDN follows
// no redirects and expects a bare 200 + JSON, so this path must never be auth-gated
// or bounced. e2e/apple-app-site-association.spec.ts holds that.
//
// WWW, NOT THE APEX: the apex 307s to www (see capacitor.config.ts) and Apple's
// fetcher does not follow redirects, so only the www host can serve a valid AASA.
//
// The Team ID is NOT a secret — an AASA is a public document, and this string ships
// inside every installed app. It is hardcoded rather than read from env on purpose:
// a missing env var on Vercel would silently break autofill with no error anywhere.
//
// Scope is webcredentials ONLY. Adding "applinks" here would turn every
// joincentral.app URL into a Universal Link and change how iOS opens them — a
// separate feature, deliberately not bundled in.
const AASA = {
  webcredentials: {
    apps: ["3YBGTZQ77U.app.joincentral"],
  },
} as const

export const dynamic = "force-static"

export function GET() {
  return NextResponse.json(AASA)
}
