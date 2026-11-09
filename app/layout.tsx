import type { Metadata } from "next";
import {
  Inter,
  Inter_Tight,
  Cormorant_Garamond,
  Space_Grotesk,
  IBM_Plex_Mono,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/layout/app-shell";
import { ScrollProgress } from "@/components/shared/scroll-progress";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@/components/shared/google-analytics";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Seeded design system's display/headline face (components/seeded/ui/*,
// text headlines in components/seeded/*) — pixel-matches the mockups'
// "Inter Tight" spec. Legacy never references --font-inter-tight.
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-inter-tight",
  display: "swap",
});

// Seeded design system's data/number face (table numerals, UTR, $, dates) —
// pixel-matches the mockups' "JetBrains Mono" spec. Selected via the
// --font-mono-active indirection in globals.css so Legacy's "Night Rally"
// concept theme keeps IBM Plex Mono (below) unchanged.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

// Used only by the "Match Point" design concept theme.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

// Used only by the "Night Rally" design concept theme — every stat number
// renders in this mono face there, for a precision-instrument feel.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
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
            light-OS machine never flashes dark before React hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('seeded.theme');if(t){document.documentElement.setAttribute('data-theme',t);}var d=localStorage.getItem('seeded.design');if(d){document.documentElement.setAttribute('data-design',d);}var syncRaw=localStorage.getItem('seeded.mode.system');var sync=syncRaw===null?true:syncRaw==='1';var m=sync?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):localStorage.getItem('seeded.mode');if(m){document.documentElement.setAttribute('data-seeded-mode',m);}}catch(e){}})();`,
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
