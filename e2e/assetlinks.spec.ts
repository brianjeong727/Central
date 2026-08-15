import { test, expect } from "@playwright/test"

// ─── /.well-known/assetlinks.json ────────────────────────────────────────────
//
// The Android twin of apple-app-site-association.spec.ts, and it guards the same
// two fragile properties, for the same reason: Google's Digital Asset Links
// verifier follows NO redirects and requires Content-Type: application/json. Both
// are easy to break from a distance — proxy.ts's matcher excludes `.well-known`,
// and a future edit to that matcher would silently start auth-gating this path.
//
// The FINGERPRINTS are intentionally not asserted: they come from
// ANDROID_CERT_SHA256_FINGERPRINTS and are unknowable until the app is uploaded
// (Play App Signing re-signs with its own key). The route's CONTRACT — reachable,
// unredirected, JSON, correctly SHAPED — is what has to hold in every environment.

test.describe("assetlinks.json", () => {
  test("is served unredirected as application/json", async ({ request }) => {
    const res = await request.get("/.well-known/assetlinks.json", { maxRedirects: 0 })

    // A redirect here is the failure Google cannot follow.
    expect(res.status()).toBe(200)
    expect(res.headers()["content-type"]).toContain("application/json")
  })

  test("is a valid statement list, and any statement is well-formed", async ({ request }) => {
    const res = await request.get("/.well-known/assetlinks.json")
    const body = await res.json()

    // Digital Asset Links is a LIST of statements, always — even when empty.
    expect(Array.isArray(body)).toBe(true)

    // Unconfigured (no env fingerprints) the list is empty, which is the honest
    // "this domain authorizes no Android app". Configured, every statement must
    // carry the package and at least one fingerprint or Google rejects the file.
    for (const stmt of body) {
      expect(stmt.relation).toContain("delegate_permission/common.get_login_creds")
      expect(stmt.target.namespace).toBe("android_app")
      expect(stmt.target.package_name).toBe("app.joincentral")
      expect(Array.isArray(stmt.target.sha256_cert_fingerprints)).toBe(true)
      expect(stmt.target.sha256_cert_fingerprints.length).toBeGreaterThan(0)
    }
  })
})
