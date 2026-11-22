# Seeded

Seeded helps junior tennis players and their parents plan college
recruiting. A player logs their UTR rating; Seeded shows which college
teams that rating realistically fits — **Likely / Target / Reach / Out of
range**, using a projection of where the rating is heading — and keeps their
results, school list, coach outreach and tournament plan in one place.
Parents get a read-only family view plus a season budget. Live at
**https://seededtennis.com**. Private — all rights reserved.

This page is the five-minute start. Then read [docs/README.md](docs/README.md),
the index of every doc.

## Stack

| Piece | What |
|---|---|
| Framework | Next.js 15 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS 3; the design system is `components/seeded/` |
| Database + auth | Supabase: Postgres with Row Level Security, Supabase Auth (`@supabase/supabase-js`; no SSR helper) |
| Hosting | Vercel (hosting, Web Analytics, Speed Insights) |
| Billing | Whop (`@whop/sdk`) — checkout, plus a webhook that sets the paid tier |
| Validation | zod 4 on every API body |
| Tests | Vitest (unit + source-scanning guard tests); Playwright, axe-core and Lighthouse scripts in `scripts/` |
| Lint | ESLint 9, flat config in `eslint.config.mjs` |

Exact versions: `package.json` / `package-lock.json`. Node **24** (`.nvmrc`,
`engines.node` = `24.x`; the same major CI and Vercel use).

## Folders

```
app/                 Next.js routes. Pages are server components where possible;
  api/               route handlers: account, family, health, matches, outreach,
                     profile, training, utr-entries, whop (checkout, sync, webhook)
components/
  seeded/            the design system and every current screen (ui/, layout/,
                     dashboard/ = Today, schools/, family/, onboarding/, settings/, …)
  auth/              sign-in, sign-up, OAuth landing
  ui/, shared/, …    smaller shared pieces and older feature folders
lib/                 business logic — components render, lib/ decides
  db/                every database read/write (family scoping lives here)
  fit/ + fit.ts      the one fit engine (projection, pace, bands); school-fit.ts
  catalog/           imported programs and team ranges (catalog phase 1)
  legal/             /privacy and /terms text, each claim tied to code
  seo/, onboarding/, training/, config/, hooks/, context/, …
  *.test.ts          tests live next to the code
supabase/migrations/ numbered SQL migrations (0001_init … 052)
scripts/             audit, persona and import scripts — see scripts/README.md
docs/                the docs; docs/README.md is the index
public/              static brand assets and images
```

## Run it in five minutes

```bash
nvm use                         # or any Node 24 (.nvmrc)
npm ci
cp .env.local.example .env.local
npm run dev                     # http://localhost:3000
```

Typecheck, lint, tests and the build need **no environment variables** — CI
runs them with none. Without Supabase values the public pages work and
sign-in says it is not connected. To sign in locally, ask Niran for the
**staging** project's URL and publishable key (the two
`NEXT_PUBLIC_SUPABASE_*` values in `.env.local`; they are the same public
values every Vercel Preview ships to the browser), then **sign up** a new,
clearly-fake `@example.com` account. Never put production values in
`.env.local`, never commit it, and never sign in with a real person's
account.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm test` | Every Vitest test once (`vitest run`) |
| `npm run test:tz` | The suite again in `America/New_York` and `Pacific/Auckland` |
| `npm run lint` | `eslint . --max-warnings=0` — fails on any warning |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build (`next build`); `npm run start` serves it |

The full gate, the same as CI's `verify` job:

```bash
rm -rf .next && npm run typecheck && npm run lint && npm test && npm run test:tz && npm run build
```

### Environment variables

Every variable the code reads. Names only — values live in Vercel and your
local `.env.local`, never in the repo.

| Variable | Where | Used for | Without it |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase project (staging locally) | No sign-in; public pages still work |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Whop webhook / sync writing the paid tier; the staging-only catalog importer | Billing sync refuses to run. Not needed locally |
| `WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET` | **server only** | Whop checkout and membership lookups; webhook signature check | Checkout shows a clear error; webhook refuses deliveries |
| `WHOP_PLAN_PLAYER_MONTHLY`, `WHOP_PLAN_PLAYER_YEARLY`, `WHOP_PLAN_FAMILY_MONTHLY`, `WHOP_PLAN_FAMILY_YEARLY` | server | The four plans on sale | That plan's checkout is unavailable |
| `WHOP_PLAN_PLAYER`, `WHOP_PLAN_FAMILY` | server | Legacy plans people are still on — resolve-only, never sold. Never delete | Old subscribers' tier can't be mapped |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | public | Shows "Continue with Google" when exactly `true` | Email/password only |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA4_MEASUREMENT_PROTOCOL_API_SECRET` | public / server | Google Analytics (production only) | No analytics |
| `NEXT_PUBLIC_CATALOG_PHASE1_ENABLED` | public | `true` shows the imported programs on /schools (on in production) | Section hidden |
| `VERCEL_URL`, `VERCEL_ENV` | set by Vercel | On a Preview, Whop checkout returns to that preview | Returns to seededtennis.com |
| `SEEDED_LOCAL_HTTP_AUDIT` | local only | Lets the audit scripts load a local production build over plain HTTP | Normal CSP |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is read only as a fallback name for the
publishable key.

## Environments and branch flow

| | Supabase project | Who reads it |
|---|---|---|
| **Staging** | `gnlcpnsweqbtwpaqhqqg` | Local dev (`.env.local`), every Vercel **Preview** deployment |
| **Production** | `tfpjssmhiptbwigarxpx` | Vercel **Production** = seededtennis.com |

Flow: short-lived branch from `main` → pull request → CI **verify** green
(typecheck, lint, tests in three time zones, build) → Vercel Preview (reads
staging) → merge → Vercel deploys `main` to production.

`main` is protected (a PR and a green `verify` are required) and
**auto-deploys to production with no staging gate**, so the merge is the
release: merge only when Niran says go. Code rollback: Vercel Instant
Rollback or a revert PR. Database changes do not roll back with the code.

## The rules that bite

The full rulebook is [CLAUDE.md](CLAUDE.md). The ones a newcomer breaks first:

- **No invented data, anywhere.** No made-up coach names, emails, rankings,
  UTRs or defaults — not even as placeholders in shipped code. Missing data
  shows an honest "Not tracked" / empty state. Guard tests fail the build if
  invented data or an untrue claim comes back (`lib/copy-honesty.test.ts`,
  `lib/db/schools-catalog-honesty.test.ts`, …).
- **Row Level Security is the security boundary.** Every table has RLS on;
  `AuthGate` / `PaidGate` in the UI are cosmetic. Never write privileged
  `profiles` columns from the client (tier, role, family code, billing ids,
  email-verification state), and never read another user's `profiles` row —
  family data goes through `lib/db/family-scope.ts`. Before touching auth,
  RLS, family or billing: [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md).
- **Migrations follow the runbook.** Staging first, attack-tested as real
  roles, then production only on Niran's explicit go, after a backup, and
  **before** the code that needs them —
  [docs/HANDOFF.md](docs/HANDOFF.md) §J "How to ship a migration to
  production". The repo does not rebuild production from `0001` alone
  ([docs/DATABASE_SPEC.md](docs/DATABASE_SPEC.md)).
- **UTR is never fetched or scraped.** A UTR profile link plus the player's
  own manual check-ins, nothing else. The in-memory `currentUTR` of `0` means
  "no rating" and must never reach Postgres (CLAUDE.md "The UTR placeholder").
- **One fit engine.** Every band comes from `lib/fit.ts` / `classifySchoolFit`
  with a real projection — never a second calculation in a component.
- **Prices live only in `TIER_PRICE_USD`** (`lib/types.ts`). Never retype one.
- **No secrets anywhere in the repo** — code, docs, logs, screenshots,
  commits. Names only. The repo is public.

## Read next

1. [docs/README.md](docs/README.md) — the index: every doc, what it is for, when to read it.
2. [docs/MASTER_ROADMAP.md](docs/MASTER_ROADMAP.md) — what is live, what blocks launch, the next ten tasks.
3. [docs/REVIEWER_GUIDE.md](docs/REVIEWER_GUIDE.md) — a ten-minute tour of the code.
4. [docs/TODO.md](docs/TODO.md) — every open item, before you start in an area.
5. [CLAUDE.md](CLAUDE.md) — the rules, and the history behind each one.
