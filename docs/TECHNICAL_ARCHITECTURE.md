# Seeded — Technical Architecture

Current as of 2026-11-20. `CLAUDE.md` is the authority on status and rules;
`docs/HANDOFF.md` has the long-form route table and history. Diagrams:
`docs/diagrams/`.

## Stack (versions from `package-lock.json`)
Next.js 15.5.29 App Router · React 18.3.1 · TypeScript 5.9.3 ·
Tailwind 3.4.19 · Supabase (Postgres + Auth via `@supabase/supabase-js`
2.106.1; no SSR helper) · Whop (`@whop/sdk` 2.8.1, billing) · zod 4 ·
Vitest 1.6.1 · Vercel (hosting, Analytics, Speed Insights) · GA4.

No AI provider, no Stripe, no email or push sender. V1 ships no AI feature.

## Frontend
- 56 `page.tsx` routes under `app/` (including `app/dev/*` previews, which
  call `notFound()` in production). Most pages render client components.
- Auth is checked in the browser: `components/shared/auth-gate.tsx`, plus a
  pre-paint script in `app/layout.tsx` that sends a visitor with no stored
  session away from signed-in-only routes. There is no `middleware.ts` and
  no server session. `AuthGate` / `PaidGate` are cosmetic; RLS is the gate.
- Design: one design, Seeded (`components/seeded/*`), in Light, Dark or
  Match system (Settings → Appearance; `lib/context/design-context.tsx`,
  `html[data-seeded-mode]`). The old opt-in "Legacy" design was deleted on
  2026-11-20 (PR-LEGACY); a stored `seeded.design = "legacy"` (localStorage)
  or `design: "legacy"` (user_settings) reads as Match system
  (`lib/appearance.ts`), and `lib/no-legacy-theme.test.ts` fails the build if
  any of it returns. Its routes are server redirects: `/dashboard` →
  `/today` (query dropped — Whop's `?checkout=success` does not reach
  `/today`; see DECISIONS 2026-11-21 on post-checkout sync), `/roadmap` →
  `/plan`, `/coaches` → `/outreach`, `/cost-calculator` → `/family`, like
  `/training` → `/events` and `/match-mode` → `/matches`.
- Primary nav is five items (Today, Plan, Schools, Outreach, Events) plus a
  secondary "Tools" group — see CLAUDE.md.
- School catalog: static TS modules (`lib/db/schools-data-*.ts`, 68
  programs). Roster UTR ranges are unsourced and labelled "Unverified
  estimate" (`UTR_RANGE_SOURCE_LABEL`). Database-backed catalog tables
  (migration 048) are on production (applied 2026-11-20 23:55 UTC) with
  **no rows**; staging holds the imported rows, and the reading code is
  behind `NEXT_PUBLIC_CATALOG_PHASE1_ENABLED` (off) — `docs/CATALOG_EXPANSION.md`.
- Fit engine: `lib/fit.ts` is the one entry point every screen imports
  (projection, bands, plan goal, onboarding diagnostic); since 2026-11-21 it
  is a barrel over `lib/fit/{pace,projection,goal,bands,diagnostic}.ts`
  (imports one way, pace → projection → goal/bands → diagnostic). The
  banding rules themselves are in `lib/school-fit.ts`. Guard tests treat
  `FIT_ENGINE_FILES` (`lib/fit/engine-files.ts`) as "lib/fit.ts".

## Backend
- Route handlers in `app/api/*` (14 `route.ts` files — see
  `docs/API_INTEGRATIONS.md`). Pattern: `getRequestScopedSupabase(req)` (an
  anon-key client carrying the user's bearer token, so RLS applies) → rate
  limit check → zod parse → write → JSON.
- Most reads go straight from the browser through the anon-key client + RLS.
- Rate limits are enforced in Postgres by a trigger on every client-writable
  table (migration 034); most routes only `peek` so they can return a friendly 429; three buckets (account deletion, data export, Whop checkout) are counted by the route itself (`ROUTE_COUNTED_BUCKETS` in lib/rate-limit.ts).
- The service-role client (`lib/supabase/admin.ts`) is used only by
  `/api/whop/webhook`, `/api/whop/sync` and `/api/whop/membership`.
- No background jobs, no cron (`vercel.json` has none), no queue.

## Auth & authorization
- Supabase Auth: email/password, plus Google OAuth via `/auth/callback`.
  The session lives in `localStorage`; API calls send it as
  `Authorization: Bearer`.
- Roles: `profiles.role` (`player` | `parent`). Tier:
  `profiles.subscription_tier`, set only by the Whop sync (service role).
- Privileged `profiles` columns (`role`, `family_code`,
  `subscription_tier`, `whop_membership_id`, `stripe_*`, `email_verified_*`)
  cannot be changed by the client — trigger from migration 022, extended
  since. Family membership changes only through RPCs (`join_family`,
  `approve_family_join`, `leave_family`, …). Details:
  `docs/SECURITY_CHECKLIST.md`, `docs/diagrams/family-access-flow.md`.

## External services
| Service | Use | Failure behavior |
|---|---|---|
| Supabase | DB + auth | App unusable; pages show errors |
| Whop | Checkout, membership webhook, membership sync | Billing page falls back to the stored tier |
| GA4 | Client tag (production only) + Measurement Protocol purchase event from the webhook | Fire-and-forget |
| Gmail | Compose link only (`mail.google.com/mail/?view=cm…`) | n/a — no API, no inbox access, no auto-send |
| UTR | The player's profile link, stored and shown | n/a — never fetched or scraped |

## Environments
| | Supabase project | Vercel |
|---|---|---|
| Production | `tfpjssmhiptbwigarxpx` | Production (`main`) |
| Staging | `gnlcpnsweqbtwpaqhqqg` | Preview + Development; local `.env.local` |

Production runs every migration through 054 (ledger 56 on 2026-11-24);
048's catalog tables, 053's `program_details` and 054's `program_roster` /
`program_staff` hold the owner's sheet (63 programs).
Check `list_migrations` on the project, not this file.

## CI and deployment
GitHub `niranramprasad-beep/seeded-tennis` → Vercel project `seeded-tennis`.
`.github/workflows/ci.yml`, job `verify`: typecheck, lint, tests (also in
two time zones, `npm run test:tz`), build — on pull requests to and pushes
to `main`. `main` is protected (PR + green `verify`) and auto-deploys to
production with no staging gate, so the merge itself is gated by the owner.

## Monitoring
What exists (P1-OPS-2, 2026-11-21), and nothing more:

- **Product analytics:** Vercel Analytics + Speed Insights + GA4. Not
  monitoring.
- **Server logs:** every `app/api` route, the Whop webhook and the GA4
  purchase send log failures through `lib/server-log.ts` —
  `logServerError(event, err, context)` / `logServerEvent(event, context,
  level)`. One JSON line per call:
  `{"level":"error","event":"whop.webhook.sync_failed","route":"/api/whop/webhook","message":"…","code":"42501","context":{…},"ts":"…"}`.
  The message is the error's first line only, with emails, JWTs,
  `Bearer …` values, provider keys (`sk_`, `whsec_`, `apik_`, `sb_secret_`,
  …), `api_secret=`-style URL parameters, UUIDs, long random tokens and a
  Postgres DETAIL / `Key (…)=(…)` value stripped; no stack, no request body;
  context keys such as `email`, `userId`, `token` are redacted by name. The
  lines land in **Vercel's runtime logs** — search by `event` (e.g.
  `whop.webhook.`, `account.deletion.failed`, `api.*.write_failed`,
  `health.database_unreachable`). Retention is whatever the Vercel plan
  gives; nothing is exported anywhere else. `lib/api-logging.test.ts` fails
  the build on a `console.*` call in `app/api`.
- **Health endpoint:** `GET /api/health` → `{ ok, commit, checks: { app,
  database } }`, `Cache-Control: no-store`, no auth. `database` is Supabase
  Auth's public health endpoint (`/auth/v1/health`, publishable key, 2 s
  timeout; per instance a success is cached 30 s and a failure 5 s): it proves the Supabase project is up
  and reachable from the deployment, **not** that a query would succeed.
  200 when it answers; 503 when it does not (and when Supabase is not
  configured on a production deployment); `skipped` with 200 elsewhere
  without configuration. `commit` is the short `VERCEL_GIT_COMMIT_SHA`, or
  `local`.
- **Logger limits:** input is cut to 2,000 characters before any pattern
  runs. Phone numbers are stripped only in E.164 form (`+15551234567`);
  looser shapes are indistinguishable from dates, SQLSTATEs and counts, so
  keys named `phone`/`tel` are redacted by name instead (as are `name`,
  `ip`, `uid`, `buyer…`).
- **Uptime check:** `.github/workflows/uptime.yml`, hourly at :23 plus
  manual runs (it was :17; that schedule never produced a run, see below). Fails if `https://seededtennis.com/` or `/api/health` is not
  200 (health must also say `"ok": true`), 20 s per attempt, 2 retries 10 s
  apart (so a retry re-asks Supabase rather than reading a cached failure;
  job limit 4 minutes). A
  failed scheduled run is reported by GitHub's own Actions notification to
  the user who last changed its `cron` line on `main` (in practice whoever
  landed that change on `main`), per that user's notification settings. That is the
  only notification. Outages shorter than an hour can
  be missed; GitHub may delay scheduled runs. About 720 billed Actions
  minutes a month once the repo is private.
- **Check that the schedule is actually running (about weekly, and after
  any change to `uptime.yml`).** A workflow that never runs never fails, so
  silence proves nothing: the first `:17` schedule (merged 19:29 UTC
  2026-11-21) produced **no** scheduled run in its first two hours — only
  the 19:32 manual run existed. Look at GitHub → Actions → Uptime and filter
  by event "schedule", or ask the API (public repo; once private, add
  `-H "Authorization: Bearer $(gh auth token)"` or use
  `gh run list --workflow uptime.yml --event schedule`):
  `curl -s "https://api.github.com/repos/niranramprasad-beep/seeded-tennis/actions/runs?event=schedule&per_page=5"`
  — expect roughly one run per hour with `"name": "Uptime"`. None in the
  last few hours means the schedule is not registered: a new commit that
  edits the `cron` line on `main` re-registers it. While the repo is
  **public**, GitHub also disables a scheduled workflow after 60 days
  without repo activity (it then shows `"state": "disabled_inactivity"` at
  `/actions/workflows`); that rule does not apply once the repo is private.

What does **not** exist: alerting on a 5xx rate, on webhook failures or on
deletion failures (they are logged, and nobody is told); error grouping or
a dashboard; any notification other than the failed-workflow one above;
roster-freshness checks. The honest paths to real alerts are a Vercel log
drain or Sentry — both need an account/plan decision from Niran, which is
why neither is here.

## Known weaknesses
1. **Client-side route protection.** Fine for privacy because RLS decides
   what any query returns, but a page can render briefly before it bounces.
2. ~~**Legacy design still ships**~~ — deleted 2026-11-20 (PR-LEGACY). No
   screen exists twice any more.
3. **Static catalog in code** — no per-number source, can't be updated
   without a deploy. Phase 1 is merged (PR E #9, migration 048 on production
   with no rows, flag off); the fix lands when sourced ranges are entered
   and the flag is turned on.
4. ~~**Six write routes return raw Postgres error text** on 500~~ — fixed
   2026-11-21 (`SECURITY_CHECKLIST` S-10, `lib/db/write-error.ts`).
5. **`Player.currentUTR` uses 0 as a "not logged" sentinel** instead of
   `null` (CLAUDE.md, "The UTR placeholder").

## What not to change
The `lib/db/*` + `app/api/*` + zod + request-scoped-client pattern is sound.
Keep it; extend it. Don't add an ORM, tRPC, or a new auth library — fix the
policies.
