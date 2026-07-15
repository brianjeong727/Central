import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import PWARegister from "@/components/pwa-register";

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
        {children}
      </body>
    </html>
  );
}
