import { NextResponse } from "next/server"

// ─── Digital Asset Links (assetlinks.json) ───────────────────────────────────
//
// The Android counterpart to app/.well-known/apple-app-site-association/route.ts.
// Authorizes the native Android shell to share saved passwords with this domain:
// Android's Credential Manager only offers a site's saved credentials inside an
// app's WebView when the domain publishes a statement naming that app. Chrome
// works without this because Chrome owns the credential store; the shell does not.
//
// SCOPE IS get_login_creds ONLY — deliberately mirroring the AASA's scope decision.
// Adding "delegate_permission/common.handle_all_urls" would turn every
// joincentral.app URL into a verified Android App Link and change how the OS opens
// them everywhere (texts, emails, other apps). That is a separate product decision,
// and iOS explicitly deferred the same one (the AASA carries no "applinks" key).
// The two platforms stay in step rather than drifting apart by accident.
//
// A ROUTE HANDLER, NOT public/: Google requires Content-Type: application/json, and
// Vercel serves files under public/ with a content type derived from the extension —
// which for a directory-shaped path is unreliable. NextResponse.json guarantees it.
//
// EXCLUDED FROM MIDDLEWARE: proxy.ts's matcher skips .well-known. Google's verifier
// follows no redirects and expects a bare 200 + JSON, so this path must never be
// auth-gated or bounced. e2e/assetlinks.spec.ts holds that.
//
// ── Why the fingerprint is env-driven when the iOS Team ID is hardcoded ──
// The AASA hardcodes its Team ID because that value is knowable, permanent, and a
// missing env var would silently break autofill. Neither holds here:
//
//   1. The value is not knowable until the app is uploaded. Under Play App Signing
//      Google RE-SIGNS the app with a key it holds, so the fingerprint that matters
//      on a user's device is Play's app-signing cert — which only exists after the
//      first upload. Hardcoding anything before then would be a guess.
//   2. There are legitimately SEVERAL. A locally-built debug APK, the upload key,
//      and the Play app-signing key all have different fingerprints, and all three
//      need to work during testing.
//
// Set ANDROID_CERT_SHA256_FINGERPRINTS to a comma-separated list of uppercase
// colon-separated SHA-256 fingerprints (the format `keytool -list` prints, and the
// format Play Console shows under Setup → App signing).
//
// Unset, this serves an EMPTY statement list rather than 404ing. That is the honest
// answer — "this domain currently authorizes no Android app" — and it keeps the
// route's shape stable so the e2e spec tests the contract rather than the config.
const PACKAGE_NAME = "app.joincentral"

function fingerprints(): string[] {
  const raw = process.env.ANDROID_CERT_SHA256_FINGERPRINTS
  if (!raw) return []
  return raw
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean)
}

export function GET() {
  const certs = fingerprints()
  const statements =
    certs.length === 0
      ? []
      : [
          {
            relation: ["delegate_permission/common.get_login_creds"],
            target: {
              namespace: "android_app",
              package_name: PACKAGE_NAME,
              sha256_cert_fingerprints: certs,
            },
          },
        ]
  return NextResponse.json(statements)
}
