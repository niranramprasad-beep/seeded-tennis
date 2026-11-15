/** @type {import('next').NextConfig} */

// S-7 (P1-SEC-4). Seeded sent no security headers at all. These are set
// here, in the Next config, rather than in middleware.ts: `main` carries a
// middleware.ts today that is the maintenance-mode 503 (one revertable
// commit, P0-5), and putting headers in the same file would couple reverting
// the maintenance page to reverting the headers. Config-level headers also
// apply to static assets, which middleware does not run for.
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
//                    components/shared/google-analytics.tsx also inlines a
//                    small config script — see the 'unsafe-inline' note.
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
// per-request nonces, nonces need middleware, and middleware on `main` is
// currently the maintenance page. With 'unsafe-inline' the CSP still blocks
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
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
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

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
