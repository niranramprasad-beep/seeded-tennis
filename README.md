# Seeded

Seeded is a premium college tennis recruiting and training SaaS for junior players and families. It is built with Next.js, Supabase, Tailwind CSS, Framer Motion, and Recharts.

## Tech stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Framer Motion
- Recharts
- Supabase Auth + Postgres + Row Level Security
- Vercel-ready deployment

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Because this project currently lives in a folder named `Coding:Projects`, the npm scripts call Next and TypeScript through `node node_modules/...` so the app runs reliably on macOS.

## Environment variables

Add these to `.env.local` locally and to Vercel Project Settings for production:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` come from Supabase Project Settings → API.

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it in client components, browser code, or public logs.

`OPENAI_API_KEY` is server-only and powers the match-analysis endpoint. Without it, the app returns a safe fallback analysis so match logging still works.

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Fill in the Supabase URL and publishable key.
4. In Supabase SQL Editor, run:
   - `supabase/migrations/001_initial_saas_schema.sql`
   - `supabase/migrations/002_utr_entries.sql`
   - `supabase/migrations/003_families_signup_fix.sql`
   - `supabase/migrations/004_fix_profiles_recursion.sql`
   - `supabase/migrations/005_feature_expansion.sql`
5. Confirm Row Level Security is enabled on:
   - `profiles`
   - `training_plans`
   - `workout_sessions`
   - `exercises`
   - `session_exercises`
   - `saved_templates`
   - `user_settings`
   - `daily_checkins`
   - `matches`
   - `badges`
   - `friendships`
   - `cost_calculations`
   - `parent_reports`

Create these private Supabase Storage buckets:

- `parent-reports`
- `match-videos`

See `SUPABASE_SETUP.md` for more detail.

## Whop billing

Player and Family tiers are real Whop memberships — this is what the live
Pricing page actually calls. Set up:

1. In your Whop dashboard, create two Products with monthly Plans (Player,
   Family) and copy each Plan ID (`plan_...`).
2. Grab a server API key from Developer → API keys.
3. Add `WHOP_API_KEY`, `WHOP_PLAN_PLAYER`, `WHOP_PLAN_FAMILY` to `.env.local`
   and Vercel.
4. Create a webhook endpoint in Whop pointing at
   `https://<your-domain>/api/whop/webhook`, subscribed to
   `membership.activated`, `membership.updated`, and
   `membership.deactivated`. Add its signing secret as
   `WHOP_WEBHOOK_SECRET`.
5. Without these env vars, the Pricing page shows a clear error instead of
   starting checkout — nothing else in the app is affected.

`profiles.subscription_tier` is the source of truth for a user's plan and is
only ever written by the webhook (`app/api/whop/webhook/route.ts`) — never
set directly by the client. "Manage billing" links straight to Whop's own
`https://whop.com/@me/settings/memberships/` page, no API call needed.

A parallel Stripe integration exists (`app/api/stripe/*`) but isn't wired
into the UI — see `.env.example` if you ever want to switch back.

## Production checks

```bash
npm run lint
npm run typecheck
npm run build
```

Do not deploy if any of these fail.

## Vercel deployment

1. Push this repository to GitHub.
2. Import the GitHub repo into Vercel.
3. Add the environment variables above to Vercel.
4. Deploy.

Vercel will run `npm run build`.

## Current production behavior

- Real Supabase Auth is used when Supabase environment variables are present.
- Training plans, workout sessions, exercises, templates, and settings persist to Supabase for authenticated users.
- Without Supabase env vars, the app keeps a local demo fallback so UI work remains easy.
