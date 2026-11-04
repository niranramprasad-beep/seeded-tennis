# Seeded — notes for Claude

## Future tasks (not started — do not implement until explicitly asked)

- **Separate Supabase dev project.** Local development (`npm run dev` /
  `localhost:3000`) currently points at the same Supabase project that backs
  production (`seededtennis.com`) — confirmed via `NEXT_PUBLIC_SUPABASE_URL`
  in `.env.local`. This means any account creation, data mutation, or
  destructive testing done against local dev touches the real production
  database. Set up a genuinely separate Supabase project for local/dev use
  (its own auth users, its own tables, ideally seeded with fixture data) so
  local development and manual QA never risk real user data. Until this
  exists, creating accounts or writing test data through the local app is
  effectively the same as doing it on the live site.

- **GA4 purchase-tracking in the Whop webhook.** Codex had built out
  server-side GA4 reporting (`lib/ga4-server.ts`) wired into
  `app/api/whop/webhook/route.ts` to report a `purchase` event on
  `membership.activated`. It was never committed, never built, never tested
  — stashed on the `revamp` branch instead of shipping it unverified
  alongside the design revamp (`git stash list` →
  `WIP: GA4 purchase-tracking wired into Whop webhook (Codex, unverified) — flagged for later`).
  To pick this back up: `git stash pop` (or `git stash show -p stash@{N} | git apply`
  if other stashes have since piled up), then run the full tsc/lint/test/build
  chain before it goes anywhere near production. The hardcoded
  `TIER_PRICE_USD` map in that diff also needs to be kept in sync by hand
  with whatever pricing-view.tsx actually shows at the time it's revived.
