import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */

// S-7 (P1-SEC-4). Seeded sent no security headers at all. These are set
// here, in the Next config, rather than in middleware.ts. When this was
// written `main` carried a middleware.ts that served the maintenance-mode 503
// (P0-5), and headers in the same file would have coupled the two. That
// maintenance page is gone (2026-11-16) and no middleware.ts exists today.
// Config-level headers also apply to static assets, which middleware does
// not run for.
//
// ---------------------------------------------------------------------------
// Everything the CSP has to keep working, and where each entry comes from
// ---------------------------------------------------------------------------
//   Fonts            next/font/google (app/layout.tsx) self-hosts the files
//                    at build time and serves them from /_next — so 'self',
//                    and NO fonts.googleapis.com / fonts.gstatic.com entry
//                    is needed. Adding one would be cargo cult.
//   Supabase         Auth, PostgREST and realtime, over https and wss, at
//                    the project subdomain. The project ref differs between
//                    production and staging, so this is a wildcard rather
//                    than a hardcoded host.
//   Google Analytics gtag.js from googletagmanager.com, beacons to the
//                    google-analytics / analytics.google.com hosts.
//                    components/shared/google-analytics.tsx sets up gtag()
//                    from its own bundle (no inline snippet since the GA
//                    privacy change) and injects gtag.js only when
//                    lib/ga-privacy.ts allows it.
//   Google sign-in   lib/auth.ts signInWithOAuth() is a full-page redirect
//                    to accounts.google.com, not a frame and not a fetch.
//                    Top-level navigation is not restricted by any directive
//                    here (no navigate-to), so it needs no allowance. The
//                    callback lands back on our own origin.
//   Whop checkout    /api/whop/checkout returns a whop.com URL and the
//                    client sets window.location.href. Again a navigation,
//                    not a frame. form-action stays 'self' because nothing
//                    POSTs a form off-origin.
//   Vercel           Analytics and Speed Insights serve their scripts and
//                    receive their beacons on our own origin (/_vercel/...).
//                    va.vercel-scripts.com is the host the debug build uses
//                    in development only.
//
// WHY 'unsafe-inline' IS IN script-src. The honest answer: removing it needs
// per-request nonces, and nonces need a middleware.ts, which the repo does
// not have (the old maintenance-page middleware was removed 2026-11-16). With 'unsafe-inline' the CSP still blocks
// every off-origin script host, which is what stops an injected
// <script src="https://evil/..."> — the realistic attack here. It does not
// stop an injected inline <script>, so it is a partial control and is
// recorded as such in docs/SECURITY_CHECKLIST.md rather than written up as
// done. The nonce upgrade is a P2 follow-up, not a secret.
//
// 'unsafe-eval' is development-only (the dev overlay and HMR need it).

const isDev = process.env.NODE_ENV === "development";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' https://va.vercel-scripts.com " : ""}https://www.googletagmanager.com https://www.google-analytics.com`,
  // Tailwind and the design system set inline styles on elements; so does
  // Framer Motion on every animated node. There is no nonce path for style
  // attributes at all, so this one is not a shortcut — it is the only option.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://www.googletagmanager.com https://www.google-analytics.com",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net${isDev ? " https://va.vercel-scripts.com ws://localhost:* http://localhost:*" : ""}`,
  // components/dev/phone-preview.tsx frames our own routes. Nothing else
  // frames anything, and nothing third-party may.
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // SEEDED_LOCAL_HTTP_AUDIT=1 is for one thing: auditing a production build
  // over plain http://localhost in WebKit, which (unlike Chromium and
  // Firefox) applies upgrade-insecure-requests to localhost and rewrites
  // every script and font to an https://localhost that does not exist.
  // Never set on Vercel; the deployed header is unchanged.
  ...(isDev || process.env.SEEDED_LOCAL_HTTP_AUDIT === "1" ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },

  // Two years, subdomains included. Vercel terminates TLS for every domain
  // attached to the project, so there is no plain-HTTP subdomain for this to
  // break — but it IS a commitment: any future subdomain must be HTTPS from
  // its first day. `preload` is deliberately NOT set. Getting onto the
  // browsers' preload list is close to irreversible and is an owner's
  // decision, not a code change.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },

  // frame-ancestors above is the real control; this is the same rule for
  // browsers that honour the older header.
  { key: "X-Frame-Options", value: "DENY" },

  { key: "X-Content-Type-Options", value: "nosniff" },

  // Same-origin: full URL on our own pages (so Vercel Analytics still
  // reports paths), origin only when leaving. A player's /schools/<slug>
  // page, their grad year and their UTR all live in query strings and paths
  // that should not travel to a coach's mail host or to Whop.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Nothing in Seeded uses a camera, a microphone, location or payment APIs.
  { key: "Permissions-Policy", value: "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()" },

  // Isolates this origin's window from anything it opens, and vice versa.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },

  { key: "X-DNS-Prefetch-Control", value: "on" },
];

// School logos (docs/SCHOOL_LOGOS.md) are for the page they sit on. Opening
// one's address, framing it, fetching it from a script or loading it from
// another site gets the 404 page; only an image load on our own pages gets
// the picture. Vary keeps a cached copy from answering a direct visit. This
// makes copying awkward, not impossible: a screenshot or the developer tools
// still work, and so does any client that does not send these headers.
const SCHOOL_LOGOS = "/school-logos/:file*";
const schoolLogoHeaders = [
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, noimageindex" },
  { key: "Cache-Control", value: "public, max-age=604800" },
  { key: "Vary", value: "Sec-Fetch-Dest, Sec-Fetch-Site" },
];
const schoolLogoRefusals = [
  ...["document", "iframe", "frame", "embed", "object", "empty"].map((value) => ["sec-fetch-dest", value]),
  ["sec-fetch-site", "cross-site"],
];

const nextConfig = {
  reactStrictMode: true,
  // Next 15 streams metadata into the <body> for dynamic routes unless the
  // user agent is on its bot list — and /onboarding is dynamic (it reads
  // searchParams for the homepage calculator's prefill). Measured
  // 2026-11-18: its <meta name="description"> landed after </head> for a
  // normal browser AND for "Googlebot", and Lighthouse SEO fell to 91.
  // Matching every user agent restores blocking metadata in <head>.
  htmlLimitedBots: /.*/,
  // Pin the file-tracing root to this directory. Without it, a build run
  // from a git worktree nested inside the main checkout (.claude/worktrees/…)
  // sees two package-lock.json files, warns, and traces from the PARENT
  // checkout. On Vercel this is the same directory Next would pick anyway.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: SCHOOL_LOGOS, headers: schoolLogoHeaders },
    ];
  },
  async rewrites() {
    return {
      // Before the public folder is looked at. The destination does not exist
      // on purpose: it is answered by the 404 page.
      beforeFiles: schoolLogoRefusals.map(([key, value]) => ({
        source: SCHOOL_LOGOS,
        has: [{ type: "header", key, value }],
        destination: "/school-logo-not-here",
      })),
      afterFiles: [],
      fallback: [],
    };
  },
  // An auth redirect that lands on the bare home page belongs to
  // /auth/callback. Supabase Auth sends the browser to the project's Site
  // URL (https://seededtennis.com/) — not to our callback — whenever the
  // redirect_to it was given is not on its allow-list, and when the OAuth
  // state is missing it sends the error there too. The home page ignored
  // both: on 2026-11-21 a Google sign-in started on the vercel.app address
  // came back as /?code=… and the person sat on the signed-out home page
  // with no message. Forwarded here, the callback either finishes the
  // sign-in (same address, so the PKCE verifier is in this browser) or says
  // exactly what went wrong (components/auth/oauth-errors.ts). Next passes
  // the query string through unchanged. Not permanent: it is a fallback for
  // a dashboard setting, not a move.
  //
  // The production vercel.app alias served the whole site, so a sign-in could
  // START there and ask Supabase to return to a callback that is not on its
  // allow-list. Every page on that host now moves to seededtennis.com first.
  // Preview hosts (seeded-tennis-git-…) are different names and unaffected.
  async redirects() {
    return [
      ...PRODUCTION_VERCEL_HOSTS.map((host) => ({
        source: "/:path*",
        has: [{ type: "host", value: host.replace(/\./g, "\\.") }],
        destination: "https://seededtennis.com/:path*",
        permanent: false,
      })),
      ...["code", "error", "error_description"].map((key) => ({
        source: "/",
        has: [{ type: "query", key }],
        destination: "/auth/callback",
        permanent: false,
      })),
    ];
  },
};

export const PRODUCTION_VERCEL_HOST = "seeded-tennis.vercel.app";

// Every vercel.app name Vercel gives the PRODUCTION deployment (read from the
// deployment's aliases, 2026-11-24). Per-deployment URLs
// (seeded-tennis-<hash>-…) and Previews are other names and are not touched.
export const PRODUCTION_VERCEL_HOSTS = [
  PRODUCTION_VERCEL_HOST,
  "seeded-tennis-niranramprasad-3534s-projects.vercel.app",
  "seeded-tennis-git-main-niranramprasad-3534s-projects.vercel.app",
];

export default nextConfig;
