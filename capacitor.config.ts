import type { CapacitorConfig } from "@capacitor/cli"

// Remote-URL shell: the native iOS app is a thin WebView that loads the deployed
// web app at https://joincentral.app. There is NO code fork — capacitor-shell/ holds
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
    url: "https://joincentral.app",
    // In-WebView navigations to these hosts stay in the app; anything else opens in
    // the system browser. Covers the app, its subdomains, and Supabase (auth/storage/realtime).
    allowNavigation: ["joincentral.app", "*.joincentral.app", "*.supabase.co"],
  },
  ios: {
    // Sane defaults so the cream web surface isn't clipped or double-scrolled by the
    // native WebView chrome.
    contentInset: "automatic",
    scrollEnabled: true,
    backgroundColor: "#FBF8F2",
  },
  plugins: {
    SplashScreen: {
      // Cream (--cream, DESIGN_SYSTEM) so the launch surface matches the app.
      backgroundColor: "#FBF8F2",
      showSpinner: false,
      launchAutoHide: true,
    },
  },
}

export default config
