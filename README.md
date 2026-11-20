# Seeded

Seeded helps junior tennis players and their parents plan college recruiting:
it shows which college teams a player's UTR rating realistically fits, and
keeps their results, school list, coach outreach and tournament plan in one place.

Live at **https://seededtennis.com**. Status: live and early — a handful of
real accounts, no public launch yet. Private — all rights reserved.

New here? Read [docs/REVIEWER_GUIDE.md](docs/REVIEWER_GUIDE.md) first (a
10-minute tour), then [docs/README.md](docs/README.md) for the map of every doc.

## Stack

Versions are the ones resolved in `package-lock.json`.

| Piece | Version / service |
|---|---|
| Framework | Next.js 15.5 (App Router), React 18.3 |
| Language | TypeScript 5.9 |
| Styling | Tailwind CSS 3.4 |
| Database + auth | Supabase: Postgres, Supabase Auth, Row Level Security (supabase-js 2.106) |
| Billing | Whop (`@whop/sdk` 2.8) — checkout, plus a webhook that sets the subscription tier |
| Hosting | Vercel (hosting, Web Analytics, Speed Insights) |
| Validation | zod 4 |
| Tests | Vitest 1.6 (unit + source-scanning guard tests), Playwright (`playwright-core` 1.49 audit harness in `scripts/`), axe-core 4.10, Lighthouse 12 |

## Architecture in six bullets

- **App Router.** Pages in `app/` are server components where possible;
  API routes are route handlers in `app/api/*` (every write route is
  rate-limited in Postgres and validated with zod).
- **Row Level Security is the security boundary.** Every table in `public`
  has RLS on. UI gates such as `AuthGate` and `PaidGate` are cosmetic — the
  database refuses what a user may not do. See
  [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md).
- **Business logic lives in `lib/`.** Components render; `lib/` decides.
  Database access is in `lib/db/`.
- **One fit engine.** `lib/fit.ts` (with `lib/school-fit.ts`) is the single
  source of the Likely / Target / Reach / Out-of-range bands; every screen
  calls it. See [/methodology](https://seededtennis.com/methodology).
- **Billing.** Whop checkout → Whop webhook (`app/api/whop/webhook`) →
  `profiles.subscription_tier`, written only with the service-role key on
  the server. The client can never write its own tier (a database trigger
  refuses it).
- **Two Supabase projects.** Staging `gnlcpnsweqbtwpaqhqqg` and production
  `tfpjssmhiptbwigarxpx`. Vercel **Preview** deployments read staging;
  **Production** reads production.

## Local setup (staging only)

> **Never point local development at production, and never sign in locally
> with a real account.** Local dev talks to whatever Supabase project
> `.env.local` names; use staging.

Prerequisites: Node.js 24 (see `.nvmrc`; the same major CI and Vercel use)
and npm.

```bash
git clone https://github.com/niranramprasad-beep/seeded-tennis.git
cd seeded-tennis
npm ci
cp .env.local.example .env.local
```

Typecheck, lint, tests and the production build need **no environment
variables at all** — CI runs them with none. To run the app:

```bash
npm run dev
```

Open http://localhost:3000. Without Supabase variables the public pages work
and sign-in shows a "not connected to Supabase" message. To sign in, fill
the two public Supabase values in `.env.local` with **staging's** project
URL and publishable key (ask the maintainer; they are the same values every
Vercel Preview deployment ships to the browser).

### Environment variables

Every variable the code reads (`grep -rn "process.env" app lib components`):

| Variable | Where | Used for | Without it |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL | No sign-in; public pages still work |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Supabase publishable (anon-role) key | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Whop webhook / membership sync write `subscription_tier` | Billing sync refuses to run |
| `WHOP_API_KEY` | **server only** | Whop checkout + membership lookups | Pricing page shows a clear checkout error |
| `WHOP_WEBHOOK_SECRET` | **server only** | Verifies Whop webhook signatures | Webhook refuses every delivery |
| `WHOP_PLAN_PLAYER_MONTHLY`, `WHOP_PLAN_PLAYER_YEARLY`, `WHOP_PLAN_FAMILY_MONTHLY`, `WHOP_PLAN_FAMILY_YEARLY` | server | The four plans on sale | That plan's checkout is unavailable |
| `WHOP_PLAN_PLAYER`, `WHOP_PLAN_FAMILY` | server | Legacy plans still subscribed — resolve-only, never sold | Old subscribers' tier can't be mapped |
| `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` | public | Shows "Continue with Google" when `true` | Email/password sign-in only |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA4_MEASUREMENT_PROTOCOL_API_SECRET` | public / server | Google Analytics (production only) | No analytics |
| `NEXT_PUBLIC_CATALOG_PHASE1_ENABLED` | public | Feature flag for the expanded school catalog (off in production) | Flag off |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is read only as a fallback name for the
publishable key. Server-only values must never appear in client code, logs,
screenshots or commits.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` | Production build (`next build`) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint via `next lint` (fails on any warning) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Every Vitest test once |
| `npm run test:tz` | The suite again in `America/New_York` and `Pacific/Auckland` (date bugs hide in time zones) |

The full local gate, the same as CI:

```bash
rm -rf .next && npm run typecheck && npm run lint && npm test && npm run test:tz && npm run build
```

## Testing

- **Unit tests** (`*.test.ts` next to the code) — fit math, formatters,
  billing mapping, family scoping, copy.
- **Guard tests** — tests that read source or SQL and fail the build when a
  known-bad pattern returns: invented data, untrue copy, a cross-user
  `profiles` read, an RLS policy losing its Family-plan ceiling, a budget
  write without the parent check. Each was mutation-tested (the bug was
  re-introduced on purpose and the test had to fail). Examples:
  `lib/db/family-scope.test.ts`, `lib/db/family-plan-lock.test.ts`,
  `lib/db/budget-parent-only.test.ts`, `lib/copy-honesty.test.ts`.
- **Time zones** — `npm run test:tz`.
- **Browser harness** — Playwright scripts in `scripts/` (route audit,
  personas, keyboard, CLS, Lighthouse). They run against a local or preview
  build pointed at staging; see [scripts/README.md](scripts/README.md).
- **RLS probes** — SQL that runs as the `authenticated` role with a user's
  JWT claims inside a block that always rolls back, used on staging before a
  migration and on production after it. Recorded in
  [docs/HANDOFF.md](docs/HANDOFF.md) §J and `docs/GO-SEQUENCE.md`.

CI (`.github/workflows/ci.yml`, job **verify**) runs on every pull request and
every push to `main`: install → typecheck → lint → tests (UTC) → tests in
New York and Auckland → build.

## Database and migrations

- Numbered SQL files in `supabase/migrations/`. They go to **staging first**,
  are attack-tested there as real roles, and reach production only through
  [docs/GO-SEQUENCE.md](docs/GO-SEQUENCE.md): fresh backup → apply → probe as
  real roles in rolled-back transactions → record the result.
- Two quirks if you build a database from scratch: the files do not
  reproduce production from `0001` alone — apply
  `025_reconcile_profiles_schema_drift.sql` too, and apply `019` before `018`
  (production's real order). See [docs/DATABASE_SPEC.md](docs/DATABASE_SPEC.md).
- The production ledger is the source of truth — check `list_migrations` on
  the production project rather than this file. On 2026-11-20 it held 51
  rows, through migration 050; 048 (catalog tables) ships with PR E.

## Deploying

branch from `main` → pull request → CI **verify** green → Vercel Preview
(reads staging) → merge → Vercel deploys `main` to production.
`main` is protected: a pull request and a green `verify` are required.
There is no staging gate between `main` and production, so the merge is the
release — migrations go first, per GO-SEQUENCE. Rollback: Vercel Instant
Rollback to the previous deployment, or a revert PR.

## Security in four lines

- RLS on every table; the client can never write privileged profile columns
  (tier, role, family code, billing ids, email-verification state).
- Family data is visible only inside an approved family, and only on the
  Family plan; under-13 accounts are inert until a parent consents.
- Every write API route is rate-limited in Postgres and fails closed.
- Secrets live only in Vercel and local `.env.local` (git-ignored).
  Details: [docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md).

## Project docs

- [docs/REVIEWER_GUIDE.md](docs/REVIEWER_GUIDE.md) — start here.
- [docs/README.md](docs/README.md) — every living doc, what it is for and when to read it.
- [CLAUDE.md](CLAUDE.md) — the rulebook for anyone (human or AI) changing the code.
