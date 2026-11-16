# Seeded — SEO Checklist

Audited on localhost:3000, 2026-11-10.

## Good
- Root `<title>`, meta description, canonical (`https://seededtennis.com/`), OG image route, `lang="en"`.
- `robots.ts` disallows private routes; `sitemap.ts` generates school URLs.
- School pages are statically generated (`generateStaticParams`).

## Fix
- [ ] **Do not get fabricated data indexed.** The sitemap pushes every school page, which shows invented coach names/emails. Fix P0-3 before asking Google to crawl more.
- [ ] Per-school `generateMetadata`: title "Stanford Men's Tennis — Roster UTR range & recruiting fit | Seeded", description with real (sourced) numbers only, canonical per page.
- [ ] Every school page currently shares the site title.
- [x] **2026-11-15.** `/cost-calculator` removed from the sitemap and
  disallowed — it wraps its content in `SeededRouteRedirect to="/family"`,
  so a Seeded visitor is bounced to a private page. `/methodology` and
  `/sample-report` added, along with `/privacy`, which was missing entirely
  and is what Google's OAuth consent screen will link to.
  **`/how-it-works` and `/parents` were NOT removed:** this line called them
  "legacy/redirecting" and they are not — neither uses
  `SeededRouteRedirect` and both render public marketing content. Checked
  rather than taken on trust.
- [ ] Two `<h1>` on the homepage (desktop + hidden mobile copy). Keep one.
- [ ] `/schools/cornell` → 404. Redirect bare slugs to `-m`/`-w` or a chooser.
- [ ] Structured data: `Organization` on `/`; `SportsTeam` (+ `CollegeOrUniversity` parent) on school pages once data is sourced.
- [ ] Client-side redirects (legacy routes) are invisible to crawlers — add server redirects in `next.config.mjs` once Legacy is removed.
- [ ] 404 page is good (clear copy, two CTAs); return a real 404 status (verify on prod).
