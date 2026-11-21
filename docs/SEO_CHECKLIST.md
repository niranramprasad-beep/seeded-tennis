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

## Open
- [ ] The Seeded homepage (`components/seeded/home/seeded-home-view.tsx`)
      renders two `<h1>` (mobile and desktop copies). Keep one.
- [ ] Structured data: none yet. `Organization` on `/`; `SportsTeam`
      (+ `CollegeOrUniversity`) on school pages once team data is sourced.
- [ ] Legacy routes (`/dashboard`, `/coaches`, …) redirect client-side, which
      crawlers don't see. They are disallowed and noindexed; add server
      redirects in `next.config.mjs` if the Legacy theme is removed.
- [ ] Generic 404s: confirm production returns status 404 (not verified for
      this doc).
