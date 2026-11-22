# Seeded — SEO Checklist

Checked against the code on 2026-11-20 (not against a live crawl).

## In place
- Root `<title>`, meta description, canonical (`https://seededtennis.com/`),
  OG image route, `lang="en"`.
- `app/robots.ts` disallows every signed-in route from one list
  (`lib/seo/private-routes.ts`); a test fails the build when a new gated
  route isn't covered. Private pages also carry `robots: noindex`.
- `app/sitemap.ts`: public marketing pages (incl. `/methodology`,
  `/sample-report`, `/privacy`, `/terms`) plus every school page.
  `/cost-calculator` is excluded (it bounces Seeded visitors to a private page).
- School pages are statically generated (`generateStaticParams`) with
  per-school `generateMetadata` (title, description from the school's own
  fields, canonical). UTR numbers are kept out of the description because
  they are unverified estimates.
- Unknown school slugs return a real 404 (`dynamicParams = false`).
- Invented coach names/emails/recruits are gone from the catalog (P0-3), so
  nothing fabricated is being indexed.
- Legacy routes (`/dashboard`, `/roadmap`, `/coaches`,
  `/cost-calculator`) are server redirects since the Legacy design was
  deleted (2026-11-20, PR-LEGACY): `redirect()` in each `page.tsx`, like
  `/training` and `/match-mode`. Still disallowed and noindexed.

## Open

The open SEO items (one `<h1>` on the homepage, structured data, generic
404 status) moved to [`TODO.md`](TODO.md) §6 on 2026-11-22, so there is one
list of open work. When you add a public page, check it against "In place"
above.
