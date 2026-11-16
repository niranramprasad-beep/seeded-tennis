import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/layout/app-shell";
import { ScrollProgress } from "@/components/shared/scroll-progress";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@/components/shared/google-analytics";

// ---------------------------------------------------------------------------
// Fonts are SELF-HOSTED. Do not move these back to next/font/google.
// ---------------------------------------------------------------------------
// `next/font/google` fetches the font CSS and the woff2 files from Google at
// BUILD time. That made every production build depend on a third-party
// network call, and it failed often enough that CI carried a three-attempt
// retry: `Cannot read properties of null (reading '1')` out of the font
// loader, which is what that fetch failing looks like from the inside. It
// took down a real production redeploy of `main` on 2026-11-14.
//
// The files in app/fonts/ are the latin subset, pulled once from Google's
// own CDN and committed. Same faces, same glyphs, no build-time network.
// Variable files where Google publishes one (Inter, Inter Tight, JetBrains
// Mono, Space Grotesk) so a single file covers every weight; static files
// for the two families that have no variable version.
//
// `display: "swap"` and the CSS variable names are unchanged, so globals.css
// and every component keep working untouched.
//
// To update a face: re-download the latin woff2 from the Google Fonts CSS
// API and replace the file. Do not add a family here without adding its file.

const inter = localFont({
  src: "./fonts/Inter-Variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

// Seeded design system's display/headline face (components/seeded/ui/*,
// text headlines in components/seeded/*) — pixel-matches the mockups'
// "Inter Tight" spec. Legacy never references --font-inter-tight.
const interTight = localFont({
  src: "./fonts/InterTight-Variable.woff2",
  weight: "100 900",
  variable: "--font-inter-tight",
  display: "swap",
});

// Seeded design system's data/number face (table numerals, UTR, $, dates) —
// pixel-matches the mockups' "JetBrains Mono" spec. Selected via the
// --font-mono-active indirection in globals.css so Legacy's "Night Rally"
// concept theme keeps IBM Plex Mono (below) unchanged.
const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  weight: "100 800",
  variable: "--font-jetbrains-mono",
  display: "swap",
});

// Cormorant Garamond has no variable version on Google Fonts, so each
// weight and style is its own file.
const cormorant = localFont({
  src: [
    { path: "./fonts/CormorantGaramond-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/CormorantGaramond-400italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/CormorantGaramond-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/CormorantGaramond-500italic.woff2", weight: "500", style: "italic" },
    { path: "./fonts/CormorantGaramond-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/CormorantGaramond-600italic.woff2", weight: "600", style: "italic" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

// Used only by the "Match Point" design concept theme.
const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk-Variable.woff2",
  weight: "300 700",
  variable: "--font-space-grotesk",
  display: "swap",
});

// Used only by the "Night Rally" design concept theme — every stat number
// renders in this mono face there, for a precision-instrument feel.
const plexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexMono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://seededtennis.com"),
  title: "Seeded — your path to college tennis, mapped",
  description:
    "A premium recruiting platform that helps junior tennis players and their families map a clear, realistic path to playing college tennis.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-design="seeded"
      data-seeded-mode="dark"
      className={`${inter.variable} ${interTight.variable} ${cormorant.variable} ${spaceGrotesk.variable} ${plexMono.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme/design before paint to avoid a flash of the
            default. Mirrors design-context.tsx's mount effect exactly,
            including its "brand-new visitor with nothing saved yet defaults
            to the OS preference, not a hardcoded mode" rule — syncRaw===null
            (the 'seeded.mode.system' key has literally never been written)
            is treated the same as sync=true so a first-time visit on a
            light-OS machine never flashes dark before React hydrates.
            It also marks html[data-session] when a Supabase session is
            saved, so a public route lays out as the app from first paint
            (see the pre-session rules at the end of globals.css). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('seeded.theme');if(t){document.documentElement.setAttribute('data-theme',t);}var d=localStorage.getItem('seeded.design');if(d){document.documentElement.setAttribute('data-design',d);}var syncRaw=localStorage.getItem('seeded.mode.system');var sync=syncRaw===null?true:syncRaw==='1';var m=sync?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):localStorage.getItem('seeded.mode');if(m){document.documentElement.setAttribute('data-seeded-mode',m);}for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){document.documentElement.setAttribute('data-session','1');break;}}if(localStorage.getItem('seeded.sidebar.collapsed')==='1'){document.documentElement.setAttribute('data-sidebar-collapsed','1');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-cream">
        <Providers>
          <ScrollProgress />
          <AppShell>{children}</AppShell>
        </Providers>
        <Analytics />
        <SpeedInsights />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
