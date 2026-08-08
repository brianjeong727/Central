import type { CapacitorConfig } from "@capacitor/cli"
import { KeyboardResize } from "@capacitor/keyboard"

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
      // Plum-2 (--plum-2, DESIGN_SYSTEM) — matches the LaunchScreen storyboard (plum
      // bg + cream Central "C" mark) AND the plum "One Body" EntrySplash overlay that
      // follows, so the whole cold-launch sequence is one uninterrupted plum surface
      // (icon → storyboard → plugin splash → One Body → app) with no white/cream flash.
      backgroundColor: "#2D0F2E",
      showSpinner: false,
      // Kept up until EntrySplash calls SplashScreen.hide() on its first painted
      // frame — the native plum splash hands off directly to the plum "One Body"
      // overlay with no flash. When the overlay is skipped (web/desktop/warm nav)
      // EntrySplash's always-mounted effect still calls hide(), so the splash never sticks.
      launchAutoHide: false,
    },
    Keyboard: {
      // "none" — the web layer owns the layout; the plugin only reports.
      //
      // "native" was tried and is WRONG for a chat surface, for a reason visible
      // only in the plugin source (ios/.../Keyboard.m, onKeyboardWillShow):
      //
      //   double duration = [...AnimationDuration...] + 0.2;
      //   [self setKeyboardHeight:(int)height delay:duration];
      //
      // The WKWebView frame change is scheduled with performSelector:afterDelay:
      // for the keyboard's animation duration PLUS 200ms — so ~450ms after the
      // keys start moving, as a hard snap, and later still if the main thread is
      // busy. For that entire window the WebView is full height and the composer
      // sits BEHIND the keyboard. That is the "composer takes a second to appear"
      // report, and no amount of web-side work can fix it while the viewport
      // itself arrives late.
      //
      // With "none" the WebView stays full screen and `keyboardWillShow` fires
      // immediately, carrying keyboardHeight — so lib/keyboard-inset.ts moves the
      // chat on the FIRST frame, in lockstep with the keys. Safe because the
      // plugin removes WKWebView's own keyboard observers unconditionally (not
      // just in native mode), which is what would otherwise scroll the whole
      // document up to chase the caret.
      //
      // NOTE: native config — takes effect only after `npx cap sync ios` and a
      // new app build, NOT on a web deploy.
      resize: KeyboardResize.None,
    },
  },
}

export default config
