import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// MAINTENANCE MODE — production only, temporary, and deliberately one file.
//
// Why this exists: `main` is what seededtennis.com runs, and it is ~36 commits
// behind the real work on `v1`. Worse, it is actively broken against the live
// database — migration 011 narrowed a CHECK constraint so `main`'s
// "Mark contacted" write is rejected every time (MASTER_ROADMAP P0-5). Rather
// than hotfix a branch that auto-deploys with no staging gate, production
// holds a maintenance page until `v1` is ready to merge down.
//
// TO REVERT: delete this file. That's the whole change — it adds nothing and
// modifies nothing, so `git revert` of its commit restores the site exactly.
//
// Why middleware and not an `app/maintenance/page.tsx`:
//   - It can answer **503** on every path. A 200 "Back soon" page served at
//     every URL invites Google to index that copy in place of the real pages;
//     503 + Retry-After says "temporary, come back", which is what we mean.
//   - It doesn't depend on the app building or rendering. The root layout
//     pulls in fonts, providers and the app shell; none of that should sit
//     between a visitor and "we're down".
//   - Preview deployments are unaffected: this file only exists on `main`, so
//     `v1` previews still serve the real app.
// ---------------------------------------------------------------------------

const CONTACT_EMAIL = "NiranRamprasad@gmail.com";

// No signup form here on purpose. Seeded has no email provider and no mailing
// list — a form promising updates would be collecting addresses it has no way
// to send to, which is exactly the kind of claim the V1 work is removing.
// A plain mailto is something we can actually honour.
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Seeded — back soon</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #FAF7F2;
    color: #2A211C;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 30rem; width: 100%; }
  .mark {
    display: inline-flex; align-items: center; gap: 10px;
    font-weight: 700; font-size: 20px; letter-spacing: -0.01em;
  }
  .dot {
    width: 22px; height: 22px; border-radius: 999px;
    background: #C9E265; border: 1px solid #A9C64A;
  }
  h1 {
    margin: 28px 0 0;
    font-size: 30px; line-height: 1.15; letter-spacing: -0.02em; font-weight: 700;
  }
  p { margin: 14px 0 0; font-size: 17px; color: #6B5C52; }
  a { color: #2A211C; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid #2A211C; outline-offset: 3px; border-radius: 2px; }
  @media (min-width: 640px) { h1 { font-size: 36px; } }
</style>
</head>
<body>
  <main>
    <span class="mark"><span class="dot" aria-hidden="true"></span>Seeded</span>
    <h1>Seeded is getting a big upgrade.</h1>
    <p>Back soon.</p>
    <p>Questions, or want to know when it&rsquo;s live? Email
      <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
  </main>
</body>
</html>`;

export function middleware() {
  return new NextResponse(HTML, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Tells crawlers and CDNs this is temporary. One hour is short enough
      // that nothing caches the outage past the real fix.
      "retry-after": "3600",
      "cache-control": "no-store, must-revalidate",
      "x-robots-tag": "noindex",
    },
  });
}

export const config = {
  // Everything except Next's own static output and the favicon. The page above
  // is fully self-contained (inline CSS, system fonts, no images), so nothing
  // it needs is excluded here — these exclusions just avoid answering asset
  // requests with HTML.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
