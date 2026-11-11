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
- [ ] Sitemap: remove `/cost-calculator`, `/how-it-works`, `/parents` (legacy/redirecting); add `/methodology`, `/sample-report`, `/tournament-fit` already present.
- [ ] Two `<h1>` on the homepage (desktop + hidden mobile copy). Keep one.
- [ ] `/schools/cornell` → 404. Redirect bare slugs to `-m`/`-w` or a chooser.
- [ ] Structured data: `Organization` on `/`; `SportsTeam` (+ `CollegeOrUniversity` parent) on school pages once data is sourced.
- [ ] Client-side redirects (legacy routes) are invisible to crawlers — add server redirects in `next.config.mjs` once Legacy is removed.
- [ ] 404 page is good (clear copy, two CTAs); return a real 404 status (verify on prod).
