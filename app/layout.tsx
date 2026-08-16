import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/pwa-register";
import NativeSplashRelease from "@/components/native-splash-release";
import KeyboardInsetBridge from "@/components/keyboard-inset-bridge";
import NativeBackBridge from "@/components/native-back-bridge";

const bricolageGrotesque = Bricolage_Grotesque({
  variable: "--font-bricolage-grotesque",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Central",
  description: "College ministry community",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale: 1 suppresses iOS's auto-zoom when focusing a sub-16px input
  // (and double-tap zoom on buttons/menus). Deliberately NOT userScalable:false —
  // pinch-to-zoom stays available; max-scale alone kills the focus-zoom.
  maximumScale: 1,
  // Extend the layout viewport edge-to-edge under the status bar / home indicator on
  // iOS (adds viewport-fit=cover). Required so `fixed inset-0` surfaces (the native
  // splash) reach the true screen top and so env(safe-area-inset-*) reports real
  // insets for the web side to own. Pairs with capacitor ios.contentInset "never".
  viewportFit: "cover",
  themeColor: "#3E1540",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={bricolageGrotesque.variable}>
      <head>
        <link rel="icon" href="/brand/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/brand/favicon-32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/brand/favicon-16.png" sizes="16x16" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="antialiased font-sans">
        <PWARegister />
        {/* Publishes --kb-inset / [data-kb-open] for every route (lib/keyboard-inset.ts).
            Before {children} so the vars are live on the first frame a text field
            can be focused. */}
        <KeyboardInsetBridge />
        {/* Routes Android's hardware/gesture back to the same handler the chrome
            chevron fires (lib/back-intent.ts). Inert on web and iOS — `backButton`
            is an Android-only Capacitor event. */}
        <NativeBackBridge />
        {children}
        {/* After {children} so EntrySplash's effect (deeper in the tree, on /home and
            /login) runs first and can claim the splash handoff. */}
        <NativeSplashRelease />
        {/* ── Release the native splash on FIRST PAINT, before hydration ──────────
            NativeSplashRelease (above) and EntrySplash both hide the splash from a
            React EFFECT, which cannot run until the whole client bundle (~1.1 MB) has
            downloaded, parsed and hydrated. On the shell that meant the plum splash
            sat on top of a home screen that had ALREADY been server-rendered and
            painted underneath it — every bit of SSR work was invisible, and cold
            launch felt like the app was still loading when it was in fact ready.

            This inline script runs as the parser reaches the end of <body>, so the
            server HTML above it exists; two rAFs later it has painted, and we drop
            the splash. It talks to the Capacitor bridge directly (injected before
            page scripts) rather than importing the plugin, because an import is the
            very bundle we are trying not to wait for.

            The React path stays as the backstop — hide() is idempotent, and it still
            covers routes whose SSR output is not worth showing yet plus the
            orphaned-claim case.

            FIRST RUN IS DELIBERATELY EXCLUDED: when the `central_splash_seen` cookie
            is absent on mobile /home|/login, EntrySplash is about to paint the plum
            "One Body" welcome, and it must own the handoff so the two plum surfaces
            meet with no flash. Releasing early there would show the app for a frame
            and then cover it again. Same cookie EntrySplash uses — read, never set,
            here. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var C=window.Capacitor;if(!C||!C.Plugins||!C.Plugins.SplashScreen)return;
var seen=document.cookie.indexOf('central_splash_seen=')!==-1;
var p=location.pathname,entry=(p==='/home'||p==='/login');
var mobile=window.matchMedia('(max-width:767px)').matches;
if(!seen&&entry&&mobile)return;
requestAnimationFrame(function(){requestAnimationFrame(function(){
try{C.Plugins.SplashScreen.hide()}catch(e){}})});
}catch(e){}})();`,
          }}
        />
      </body>
    </html>
  );
}
