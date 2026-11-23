import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./palettes.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/layout/app-shell";
import { PalettePreviewScript } from "@/components/dev/palette-preview";
import { ScrollProgress } from "@/components/shared/scroll-progress";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@/components/shared/google-analytics";
import { SIGNED_IN_ONLY_PREFIXES } from "@/lib/route-access";

// Inlined into the head script below (it runs before any bundle, so it
// cannot import). Built from the one list AppShell also reads.
const SIGNED_IN_ONLY_JSON = JSON.stringify(SIGNED_IN_ONLY_PREFIXES);

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
// Mono) so a single file covers every weight; static files for Cormorant
// Garamond, which has no variable version.
//
// `display: "swap"` and the CSS variable names are unchanged, so globals.css
// and every component keep working untouched.
//
// To update a face: re-download the latin woff2 from the Google Fonts CSS
// API and replace the file. Do not add a family here without adding its file.
//
// PRELOADING (D8, docs/archive/audit-2-perf.md). next/font preloads every file
// of every family declared in the root layout, on every page. With six
// families that was TWELVE <link rel=preload> font files (313 KB) at the
// top of every document, all fetched at high priority ahead of the page's
// own JS — on a slow-4G phone they were most of the gap between first paint
// (~0.9 s) and LCP (2.7–3.6 s). Only the three faces the Seeded design
// paints above the fold on most pages are preloaded now: Inter (body),
// Inter Tight (headlines), JetBrains Mono (numerals). Everything else has
// `preload: false`: its @font-face is still declared, and the browser
// fetches a file only when something on the page actually renders in it —
// Cormorant's 400 italic on the few pages with a `serif-accent` word. The
// visual design is unchanged; only the download order is.

const inter = localFont({
  src: "./fonts/Inter-Variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

// Seeded design system's display/headline face (components/seeded/ui/*,
// text headlines in components/seeded/*) — pixel-matches the mockups'
// "Inter Tight" spec.
const interTight = localFont({
  src: "./fonts/InterTight-Variable.woff2",
  weight: "100 900",
  variable: "--font-inter-tight",
  display: "swap",
});

// Seeded design system's data/number face (table numerals, UTR, $, dates) —
// pixel-matches the mockups' "JetBrains Mono" spec. Selected via the
// --font-mono-active indirection in globals.css.
const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  weight: "100 800",
  variable: "--font-jetbrains-mono",
  // Preloaded on purpose: tried `preload: false` (2026-11-19) — the file was
  // still fetched before first paint on every measured page and FCP got
  // ~150 ms worse. Keep it with Inter and Inter Tight.
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
  preload: false,
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
      data-seeded-mode="dark"
      className={`${inter.variable} ${interTight.variable} ${cormorant.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved Light/Dark mode before paint to avoid a flash of
            the default. Mirrors design-context.tsx's mount effect exactly
            (lib/appearance.ts resolveStoredSystemSync), including its
            "brand-new visitor with nothing saved yet defaults to the OS
            preference, not a hardcoded mode" rule — syncRaw===null (the
            'seeded.mode.system' key has literally never been written) is
            treated the same as sync=true so a first-time visit on a
            light-OS machine never flashes dark before React hydrates. A
            browser that had picked the deleted Legacy design
            ('seeded.design' === 'legacy') follows the OS too.
            It also marks html[data-session] when a Supabase session is
            saved, so a public route lays out as the app from first paint
            (see the pre-session rules at the end of globals.css), plus
            html[data-role] and html[data-schools-shape] from the layout
            hints in lib/layout-hints.ts — only alongside a session.
            Last (D8): a browser holding NO saved session that opened a
            signed-in-only route (lib/route-access.ts) is sent to /login
            right here — where AuthGate would send it anyway, after React,
            the session check and /login's chunks had all loaded. A browser
            that holds a session is never redirected by this. It carries the
            page as ?next= (QA sweep M3), as AuthGate does via loginHrefFor;
            the path is always one of the signed-in-only prefixes, so it is
            same-origin by construction. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var syncRaw=localStorage.getItem('seeded.mode.system');var sync=localStorage.getItem('seeded.design')==='legacy'||syncRaw===null||syncRaw==='1';var m=sync?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):localStorage.getItem('seeded.mode');if(m){document.documentElement.setAttribute('data-seeded-mode',m);}var s=0;for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&/^sb-.+-auth-token$/.test(k)){s=1;document.documentElement.setAttribute('data-session','1');var r=localStorage.getItem('seeded.role');if(r==='parent'||r==='player'){document.documentElement.setAttribute('data-role',r);}var sh=localStorage.getItem('seeded.schools.shape');if(sh==='fit'||sh==='nofit'||sh==='prompt'){document.documentElement.setAttribute('data-schools-shape',sh);}break;}}if(localStorage.getItem('seeded.sidebar.collapsed')==='1'){document.documentElement.setAttribute('data-sidebar-collapsed','1');}if(!s){var p=location.pathname,a=${SIGNED_IN_ONLY_JSON};for(var j=0;j<a.length;j++){if(p===a[j]||p.indexOf(a[j]+'/')===0){location.replace('/login?next='+encodeURIComponent(p+(location.search||'')));break;}}}}catch(e){}})();`,
          }}
        />
        <PalettePreviewScript />
      </head>
      <body className="min-h-screen bg-cream">
        <Providers>
          <ScrollProgress />
          <AppShell>{children}</AppShell>
          {/* Inside Providers: it waits for the session and the consent
              check before loading anything (lib/ga-privacy.ts). */}
          <GoogleAnalytics />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
