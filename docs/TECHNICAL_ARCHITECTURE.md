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
- Design: the "seeded" design (`components/seeded/*`) is the default. The old
  design is still in the codebase as an opt-in "Legacy theme"
  (Settings → Appearance; `lib/context/design-context.tsx`,
  `localStorage` key `seeded.design`). Old Legacy routes (`/dashboard`,
  `/coaches`, …) bounce Seeded users to the new ones client-side
  (`SeededRouteRedirect`); `/training` and `/match-mode` are server
  redirects to `/events` and `/matches`.
- Primary nav is five items (Today, Plan, Schools, Outreach, Events) plus a
  secondary "Tools" group — see CLAUDE.md.
- School catalog: static TS modules (`lib/db/schools-data-*.ts`, 68
  programs). Roster UTR ranges are unsourced and labelled "Unverified
  estimate" (`UTR_RANGE_SOURCE_LABEL`). Database-backed catalog tables
  (migration 048) exist on staging only — `docs/CATALOG_EXPANSION.md`.

## Backend
- Route handlers in `app/api/*` (13 `route.ts` files — see
  `docs/API_INTEGRATIONS.md`). Pattern: `getRequestScopedSupabase(req)` (an
  anon-key client carrying the user's bearer token, so RLS applies) → rate
  limit check → zod parse → write → JSON.
- Most reads go straight from the browser through the anon-key client + RLS.
- Rate limits are enforced in Postgres by a trigger on every client-writable
  table (migration 034); routes only `peek` so they can return a friendly 429.
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

Production runs every migration through 050 except 048 (staging only).
Check `list_migrations` on the project, not this file.

## CI and deployment
GitHub `niranramprasad-beep/seeded-tennis` → Vercel project `seeded-tennis`.
`.github/workflows/ci.yml`, job `verify`: typecheck, lint, tests (also in
two time zones, `npm run test:tz`), build — on pull requests to and pushes
to `main`. `main` is protected (PR + green `verify`) and auto-deploys to
production with no staging gate, so the merge itself is gated by the owner.

## Monitoring
Vercel Analytics + Speed Insights + GA4. No error tracking and no alerting.

## Known weaknesses
1. **Client-side route protection.** Fine for privacy because RLS decides
   what any query returns, but a page can render briefly before it bounces.
2. **Legacy design still ships** as an opt-in theme, so some screens exist
   twice.
3. **Static catalog in code** — no per-number source, can't be updated
   without a deploy. Fix in progress (PR E / migration 048).
4. **Six write routes return raw Postgres error text** on 500
   (`SECURITY_CHECKLIST` S-10).
5. **`Player.currentUTR` uses 0 as a "not logged" sentinel** instead of
   `null` (CLAUDE.md, "The UTR placeholder").

## What not to change
The `lib/db/*` + `app/api/*` + zod + request-scoped-client pattern is sound.
Keep it; extend it. Don't add an ORM, tRPC, or a new auth library — fix the
policies.
