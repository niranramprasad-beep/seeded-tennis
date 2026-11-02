import type { Metadata } from "next";
import { Inter, Cormorant_Garamond, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { GeistSans } from "geist/font/sans";
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

// The Seeded design system's display/body face (components/seeded/*
// only) — Legacy pages never reference --font-geist-sans. GeistSans ships
// as a pre-built variable-font instance (Vercel's `geist` package) rather
// than a next/font/google loader call, since this Next.js version (14.2)
// predates Geist's addition to next/font/google's bundled catalog.

export const metadata: Metadata = {
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
      className={`${inter.variable} ${cormorant.variable} ${spaceGrotesk.variable} ${plexMono.variable} ${GeistSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme/design before paint to avoid a flash of the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('seeded.theme');if(t){document.documentElement.setAttribute('data-theme',t);}var d=localStorage.getItem('seeded.design');if(d){document.documentElement.setAttribute('data-design',d);}var m=localStorage.getItem('seeded.mode');if(m){document.documentElement.setAttribute('data-seeded-mode',m);}}catch(e){}})();`,
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
