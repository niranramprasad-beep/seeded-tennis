# Seeded — notes for Codex

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

## Standing gotchas

- **`TIER_PRICE_USD` in `app/api/whop/webhook/route.ts`.** GA4 purchase
  reporting (`lib/ga4-server.ts`) needs a dollar value per tier, but Whop's
  membership payload carries no price field, so it's a hardcoded map kept in
  sync by hand with `pricing-view.tsx`. If the plan prices ever change,
  update both in the same commit.
