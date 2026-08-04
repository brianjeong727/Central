## The iOS app is a WebView shell, so OS integrations need Associated Domains — not markup (2026-08-02)

"Login doesn't autofill on mobile" read like a form-markup bug. It wasn't: `login/page.tsx`
already carried `autoComplete="email"` / `"current-password"`, and signup/forgot-password already
carried `new-password`. Every attribute was correct and had been for a long time.

The cause is architectural. `capacitor.config.ts` makes the iOS app a thin WKWebView loading
`https://www.joincentral.app`. **Safari owns the iCloud Keychain; an app's WebView does not.** iOS
surfaces saved credentials inside an app — and offers to SAVE new ones — only when the app claims
the domain via the `com.apple.developer.associated-domains` entitlement AND that domain serves a
matching `apple-app-site-association`. Neither half existed. Both are required; either alone does
nothing.

**Why this generalizes:** the remote-URL shell means the app gets web behavior for free but gets
**no OS-level integration** for free. Anything the operating system brokers between "an app" and
"a website" needs an explicit app↔domain claim. Password autofill is the first case; passkeys
(WebAuthn RP ID) and Universal Links need the same Associated Domains foundation. Expect this
class of bug to look like a front-end defect and not be one.

**How to apply:**
- Before debugging markup for a native-shell issue, ask whether the capability is one the OS
  brokers between app and domain. If yes, the fix is entitlement + AASA, not attributes.
- **Serve AASA from a route handler, never `public/`.** Apple requires
  `Content-Type: application/json`; Vercel serves extensionless static files as
  `application/octet-stream` and Apple rejects it.
- **Exclude `.well-known` from the `proxy.ts` matcher.** Apple's fetcher follows NO redirects and
  sends no cookies — one auth bounce and the domain fails validation silently, with no error
  surfaced anywhere. `e2e/apple-app-site-association.spec.ts` guards it.
- **Claim `www`, not the apex.** The apex 307s to www and Apple does not follow redirects, so an
  apex claim can never validate.
- **Sequencing matters:** deploy the AASA to production BEFORE installing a build carrying the
  entitlement. iOS fetches it through Apple's CDN at install time and caches the result — install
  first and the device caches a 404. `Settings → Developer → Associated Domains Development`
  bypasses the cache while testing.
- Entitlements are inert until the matching capability is enabled on the App ID in the Apple
  Developer portal and the provisioning profile is regenerated. Editing the plist is necessary,
  not sufficient.

Related: [[project-native-shell]]
