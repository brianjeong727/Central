import type { CapacitorConfig } from "@capacitor/cli"

// Remote-URL shell: the native iOS app is a thin WebView that loads the deployed
// web app at https://www.joincentral.app (the CANONICAL origin — the apex 307s to www,
// and Capacitor's bridge self-disables on origin mismatch, killing native detection). There is NO code fork — capacitor-shell/ holds
// only a fallback index.html that the remote shell never serves. The shell owns just
// two pixels of surface: the splash background and the status-bar style (cream, per
// DESIGN_SYSTEM). Everything else is the live web app.
const config: CapacitorConfig = {
  // Reverse-DNS of joincentral.app. NOTE: freely changeable until the app is
  // registered with Apple; STICKY afterward (renaming a registered bundle ID means a
  // new App Store record). Confirm before enrollment.
  appId: "app.joincentral",
  appName: "Central",
  // Fallback web assets only — the remote server URL below supersedes these at runtime.
  webDir: "capacitor-shell",
  server: {
    url: "https://www.joincentral.app",
    // In-WebView navigations to these hosts stay in the app; anything else opens in
    // the system browser. Covers the app, its subdomains, and Supabase (auth/storage/realtime).
    // appleid.apple.com: FALLBACK ONLY — Sign in with Apple is native-first
    // (lib/native-auth.ts); if the plugin is missing from an old binary the web
    // OAuth flow must complete in-webview instead of stranding in Safari.
    allowNavigation: ["joincentral.app", "*.joincentral.app", "*.supabase.co", "appleid.apple.com"],
    // Offline / failed-load fallback (App Store 2.1 stability): a cream "You're
    // offline" page with a retry back to the remote URL, instead of a blank error.
    errorPath: "offline.html",
  },
  ios: {
    // "never": the WKWebView scroll view adds NO native safe-area inset. Paired with
    // viewport-fit=cover (app/layout.tsx viewport), the web layer owns ALL safe areas
    // via env(safe-area-inset-*). Under the old "automatic" the native inset was ADDED
    // on top of the web's 100svh, making entry pages one status-bar taller than the
    // screen (scroll bug) and leaving a cream bar above `fixed inset-0` surfaces.
    // NOTE: changing this requires `npx cap sync ios` + an app rebuild to take effect.
    contentInset: "never",
    scrollEnabled: true,
    backgroundColor: "#FBF8F2",
    // Tag the WebView's User-Agent so the server (proxy.ts) can recognize the native
    // shell and skip the marketing landing page — signed-in users land on /home,
    // signed-out on /login, never the public marketing site. Appended (not overridden)
    // so the underlying Safari UA — and every heuristic that reads it — stays intact.
    // Takes effect only after the next `npx cap sync ios` + device build.
    appendUserAgent: "CentralShell",
  },
  plugins: {
    SplashScreen: {
      // Cream (--cream, DESIGN_SYSTEM) so the launch surface matches the app.
      backgroundColor: "#FBF8F2",
      showSpinner: false,
      // Kept up until EntrySplash calls SplashScreen.hide() on its first painted
      // frame — the native cream splash then hands off directly to the plum "One
      // Body" overlay with no flash. When the overlay is skipped (web/desktop/warm
      // nav) EntrySplash's always-mounted effect still calls hide(), so the native
      // splash never sticks.
      launchAutoHide: false,
    },
  },
}

export default config
