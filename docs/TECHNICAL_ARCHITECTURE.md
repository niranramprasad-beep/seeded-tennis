# Seeded — Technical Architecture

As built, 2026-11-10 (`audit-base` = `c8d48ec`). `docs/HANDOFF.md` has the
long-form route table and history; this file is the current architecture
plus its weaknesses. Diagrams: `docs/diagrams/`.

## Stack
Next.js 14.2 App Router · React 18 · TypeScript 5.5 · Tailwind 3 ·
Supabase (Postgres + Auth, `@supabase/supabase-js` only — no SSR helper) ·
Whop (billing) · Vercel (hosting, Analytics, Speed Insights) · GA4 ·
Google Gemini (`@google/genai`, copilot only) · zod · Vitest.
Stripe and OpenAI are referenced but not live.

## Frontend
- 46 routes under `app/`. Almost all pages render client components; auth is checked in the browser by `components/shared/auth-gate.tsx` (no `middleware.ts`, no server session).
- Two design systems in one codebase: `data-design="legacy"` (`components/*`) and `"seeded"` (`components/seeded/*`), chosen by `localStorage` (`seeded.design`). Redirects from legacy routes are client-side only.
- Theme: `lib/context/design-context.tsx` (`seeded.mode`, `seeded.mode.system`). Currently flips light/dark between pages in one session — MASTER_ROADMAP P1-UX-1.
- Contexts: player (profile), tier (subscription), design, sidebar.
- School catalog is a static TS module (`lib/db/schools-data-*.ts`) imported into client bundles.

## Backend
- Route handlers in `app/api/*` (16 files). Pattern: zod parse → `getRequestScopedSupabase(req)` (fresh anon-key client carrying the user's bearer token, so RLS applies) → write → JSON.
- Reads mostly happen directly from the browser through the anon-key client + RLS.
- Service-role client (`lib/supabase/admin.ts`) is used only by the Whop/Stripe webhooks and `/api/whop/membership`.
- No background jobs, no cron (`vercel.json` has none), no queue, no email sender.

## Auth & authorization
- Supabase email/password; Google OAuth button exists but no `/auth/callback` (implicit flow).
- Session lives in `localStorage` (`sb-<ref>-auth-token`); API calls send it as `Authorization: Bearer`.
- Roles: `profiles.role` (`player`|`parent`). Family linkage via `family_code`.
- Tier: `profiles.subscription_tier`, enforced in RLS by `has_tier()` on training and outreach writes.
- **Weak point:** all three of role, family_code, and tier are user-writable today (SECURITY_CHECKLIST S-1, S-2).

## External services
| Service | Use | Failure behavior |
|---|---|---|
| Supabase | DB + auth | App unusable; pages show errors |
| Whop | Checkout, membership webhook, billing portal links | Billing page falls back to tier-only view; webhook 500 if unconfigured |
| GA4 Measurement Protocol | Purchase events from webhook | Fire-and-forget |
| Gemini | Legacy training copilot | 500 with raw error text |
| Gmail | `mailto`-style compose URL only | n/a — no API |

## AI architecture
One feature: `/api/training/copilot`, Gemini `gemini-flash-latest`, JSON-schema constrained output validated by zod. No rate limit, no tier gate, no input caps. Recommended: remove for V1 (MASTER_ROADMAP P1-SEC-1).

## Data pipelines
None. Roster data is hand-edited TS. The planned pipeline is in DATA_QUALITY.md (migration 012).

## Deployment
GitHub `niranramprasad-beep/seeded-tennis` → Vercel project `seeded-tennis` (team `niranramprasad-3534s-projects`). `main` auto-deploys to production (currently `df8a2df`). Other branches get preview deployments — **which use the same production Supabase project**. No CI.

## Monitoring
Vercel Analytics + Speed Insights + GA4. No error tracking, no alerting. Vercel runtime errors: none in the last 7 days (low traffic).

## Problems, ranked
1. **Single shared database** for local, preview and production — already caused a production outage (P0-5). Single point of failure for every experiment.
2. **Client-side authorization model** with user-writable privileged columns (S-1/S-2).
3. **Two parallel design systems** — every screen exists twice, with different bugs; legacy routes still ship (`/dashboard`, `/coaches`, `/training`, copilot).
4. **Static catalog in code** — no provenance, can't be updated without a deploy, ships to the browser.
5. **Business rules duplicated** — prices in 3 files; fit band logic called with different projection inputs in 6 places (cause of P1-FIT-1).
6. **No server rendering for SEO pages** — school pages have no per-page metadata.

## What not to change
The `lib/db/*` + `app/api/*` + zod + request-scoped-client pattern is sound. Keep it; extend it. Don't introduce an ORM, tRPC, or a new auth library to fix the issues above — fix the policies.
